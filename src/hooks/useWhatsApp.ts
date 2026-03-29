import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  createInstance,
  connectInstance,
  getConnectionState,
  deleteInstance,
} from "@/services/evolutionApi";
import type { ConnectionStatus } from "@/types/whatsapp";
import { useToast } from "@/hooks/use-toast";

interface UseWhatsAppReturn {
  connectionStatus: ConnectionStatus;
  instanceName: string | null;
  qrCode: string | null;
  phoneNumber: string | null;
  isLoading: boolean;
  error: string | null;
  connectionLog: string[];
  createAndConnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
}

/* ── helpers ── */

function logEntry(msg: string): string {
  const now = new Date();
  const ts = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `[${ts}] ${msg}`;
}

function sanitizeVisibleMessage(message: string): string {
  return message
    .replace(/evolution api/gi, "serviço de conexão")
    .replace(/evolution/gi, "serviço")
    .replace(/^\[\d{3}\]\s*/, "")
    .trim();
}

function isAlreadyInUseError(message: string): boolean {
  return message.includes("already in use") || message.includes("[403]");
}

function isWorkerLimitError(message: string): boolean {
  return /WORKER_LIMIT|\[546\]|not having enough compute resources/i.test(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error("timeout")), ms);
    promise
      .then((v) => { clearTimeout(timeoutId); resolve(v); })
      .catch((e) => { clearTimeout(timeoutId); reject(e); });
  });
}

function normalizeSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").slice(-11);
}

function buildInstanceName(name: string | null | undefined, phone: string | null | undefined, fallback: string): string {
  const namePart = normalizeSlug(name || "consultor") || "consultor";
  const phonePart = normalizePhone(phone || "") || normalizeSlug(fallback).slice(0, 8) || "usuario";
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const raw = `igreen-${namePart}-${phonePart}-${suffix}`;
  return raw.slice(0, 80).replace(/-+$/g, "");
}

const MAX_AUTO_RETRIES = 3;
const AUTO_RETRY_DELAY_MS = 5000;

/* ── hook ── */

export function useWhatsApp(consultantId: string): UseWhatsAppReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionLog, setConnectionLog] = useState<string[]>([]);
  const { toast } = useToast();

  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStatusRef = useRef<ConnectionStatus>("disconnected");
  const pollActiveRef = useRef(false);
  const pollInFlightRef = useRef(false);
  const autoRetryCountRef = useRef(0);
  const autoReconnectingRef = useRef(false);
  const mountedRef = useRef(true);

  const addLog = useCallback((msg: string) => {
    setConnectionLog((prev) => [...prev.slice(-14), logEntry(sanitizeVisibleMessage(msg))]);
  }, []);

  const fetchConsultantIdentity = useCallback(async () => {
    const { data } = await supabase
      .from("consultants")
      .select("name, phone")
      .eq("id", consultantId)
      .maybeSingle();
    return { name: data?.name || null, phone: data?.phone || null };
  }, [consultantId]);

  const clearPolling = useCallback(() => {
    pollActiveRef.current = false;
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /* ── try to get QR or confirm connected from existing instance ── */
  const tryGetQrFromExisting = useCallback(
    async (name: string): Promise<boolean> => {
      try {
        const state = await withTimeout(getConnectionState(name), 10000);
        if (state.state === "open") {
          setConnectionStatus("connected");
          setQrCode(null);
          setError(null);
          setInstanceName(name);
          addLog("✅ WhatsApp já estava conectado!");
          return true;
        }

        addLog("📱 Gerando QR Code...");
        const connectResponse = await withTimeout(connectInstance(name), 15000);
        const qr = connectResponse?.base64 || null;
        if (qr) {
          setQrCode(qr);
          setConnectionStatus("connecting");
          setInstanceName(name);
          await supabase
            .from("whatsapp_instances")
            .upsert({ consultant_id: consultantId, instance_name: name }, { onConflict: "consultant_id" });
          addLog("📱 QR Code gerado — escaneie com seu celular");
          return true;
        }
      } catch {
        // Could not reuse
      }
      return false;
    },
    [consultantId, addLog],
  );

  /* ── auto-reconnect helper (called internally, no user action) ── */
  const autoReconnect = useCallback(
    async (name: string) => {
      if (autoReconnectingRef.current || !mountedRef.current) return;
      autoReconnectingRef.current = true;

      for (let attempt = 1; attempt <= MAX_AUTO_RETRIES; attempt++) {
        if (!mountedRef.current) break;

        addLog(`🔄 Reconexão automática (${attempt}/${MAX_AUTO_RETRIES})...`);

        const ok = await tryGetQrFromExisting(name);
        if (ok) {
          autoRetryCountRef.current = 0;
          autoReconnectingRef.current = false;
          return;
        }

        if (attempt < MAX_AUTO_RETRIES) {
          await delay(AUTO_RETRY_DELAY_MS);
        }
      }

      autoReconnectingRef.current = false;
      addLog("⚠️ Reconexão automática esgotada — use o botão para reconectar manualmente");
    },
    [addLog, tryGetQrFromExisting],
  );

  /* ── polling ── */
  const pollConnectionState = useCallback(
    async (name: string) => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;

      try {
        const result = await getConnectionState(name);
        const state = result?.state;

        if (state === "open") {
          if (prevStatusRef.current !== "connected") {
            setConnectionStatus("connected");
            setQrCode(null);
            setError(null);
            autoRetryCountRef.current = 0;
            addLog("✅ WhatsApp conectado com sucesso!");
          }
        } else if (state === "close") {
          if (prevStatusRef.current === "connected") {
            addLog("⚠️ Conexão perdida — tentando reconectar automaticamente...");
            setConnectionStatus("connecting");
            setQrCode(null);

            // fire auto-reconnect in background
            autoReconnect(name);
            return;
          }

          // During pairing the service may briefly report "close"
          if (prevStatusRef.current === "connecting") {
            return;
          }

          setConnectionStatus("disconnected");
          setQrCode(null);
        }
      } catch {
        // Instance may not exist anymore — don't crash
      } finally {
        pollInFlightRef.current = false;
      }
    },
    [addLog, autoReconnect],
  );

  const startPolling = useCallback(
    (name: string) => {
      clearPolling();
      pollActiveRef.current = true;

      const runPoll = async () => {
        if (!pollActiveRef.current) return;
        await pollConnectionState(name);
        if (!pollActiveRef.current) return;

        const nextDelay = prevStatusRef.current === "connecting" ? 5000 : 30000;
        intervalRef.current = setTimeout(runPoll, nextDelay);
      };

      runPoll();
    },
    [clearPolling, pollConnectionState],
  );

  // Restart polling when status changes
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = connectionStatus;

    if (instanceName && (connectionStatus === "connecting" || connectionStatus === "connected")) {
      if (prev !== connectionStatus) {
        startPolling(instanceName);
      }
    } else {
      clearPolling();
    }
  }, [connectionStatus, instanceName, startPolling, clearPolling]);

  /* ── createAndConnect (user-triggered) ── */
  const createAndConnect = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setConnectionLog([]);
    setQrCode(null);
    setConnectionStatus("disconnected");
    autoRetryCountRef.current = 0;

    addLog("Iniciando conexão...");

    try {
      // Step 1: Reuse existing saved instance
      if (instanceName) {
        addLog("Tentando reutilizar instância existente...");
        const reused = await tryGetQrFromExisting(instanceName);
        if (reused) return;
        addLog("⚠️ Instância anterior não disponível, criando nova...");
      }

      // Step 2: Create new instance
      const identity = await fetchConsultantIdentity();

      await supabase
        .from("whatsapp_instances")
        .delete()
        .eq("consultant_id", consultantId);

      const name = buildInstanceName(identity.name, identity.phone, consultantId);
      addLog("Criando nova instância...");

      let response: any;
      try {
        response = await withTimeout(createInstance(name), 55000);
      } catch (createErr) {
        const createMsg = createErr instanceof Error ? createErr.message : "";

        if (isAlreadyInUseError(createMsg)) {
          addLog("⚠️ Nome em uso, gerando nova instância...");
          await delay(700);
          const altName = buildInstanceName(identity.name, identity.phone, consultantId);
          response = await withTimeout(createInstance(altName), 55000);
        } else if (
          createMsg === "timeout" ||
          createMsg.includes("[504]") ||
          createMsg.includes("demorou para responder")
        ) {
          addLog("⚠️ Criação demorou, tentando recuperar...");

          await delay(3000);
          if (await tryGetQrFromExisting(name)) { addLog("✅ Instância recuperada"); return; }

          await delay(3000);
          if (await tryGetQrFromExisting(name)) { addLog("✅ Instância recuperada"); return; }

          throw new Error("Servidor demorou para responder. Tente novamente.");
        } else {
          throw createErr;
        }
      }

      addLog("✅ Instância criada com sucesso");

      const finalName = response?.instance?.instanceName || name;

      await supabase
        .from("whatsapp_instances")
        .insert({ consultant_id: consultantId, instance_name: finalName });

      setInstanceName(finalName);

      const qr = response?.qrcode?.base64 || response?.qrcode?.pairingCode || null;
      if (qr) {
        setQrCode(qr);
        setConnectionStatus("connecting");
        addLog("📱 QR Code gerado — escaneie com seu celular");
      } else {
        addLog("Gerando QR Code...");
        try {
          const state = await getConnectionState(finalName);
          if (state.state === "open") {
            setConnectionStatus("connected");
            setQrCode(null);
            addLog("✅ WhatsApp já estava conectado!");
          } else {
            const connectResp = await connectInstance(finalName);
            setQrCode(connectResp?.base64 || null);
            setConnectionStatus("connecting");
            addLog("📱 QR Code gerado — escaneie com seu celular");
          }
        } catch (connectErr) {
          const connectMsg = connectErr instanceof Error ? connectErr.message : "";
          setConnectionStatus("disconnected");
          setError(
            isWorkerLimitError(connectMsg)
              ? "Serviço temporariamente ocupado. Tente novamente em alguns segundos."
              : "Não foi possível gerar o QR Code. Tente novamente.",
          );
          addLog("❌ Falha ao obter QR Code");
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";

      if (isAlreadyInUseError(message)) {
        setError("Não foi possível criar uma nova conexão agora. Tente novamente.");
      } else if (isWorkerLimitError(message)) {
        setError("Serviço de conexão sobrecarregado. Tente novamente em alguns segundos.");
      } else {
        const safe = sanitizeVisibleMessage(message || "Erro ao criar conexão WhatsApp");
        addLog("❌ Erro: " + safe);
        setError(safe || "Erro ao criar conexão WhatsApp");
      }
    } finally {
      setIsLoading(false);
    }
  }, [consultantId, instanceName, addLog, fetchConsultantIdentity, tryGetQrFromExisting]);

  const disconnect = useCallback(async () => {
    if (!instanceName) return;
    setIsLoading(true);
    setError(null);
    autoReconnectingRef.current = false;
    addLog("Desconectando...");
    try {
      await deleteInstance(instanceName);
      await supabase
        .from("whatsapp_instances")
        .delete()
        .eq("consultant_id", consultantId);

      clearPolling();
      setConnectionStatus("disconnected");
      setInstanceName(null);
      setQrCode(null);
      setPhoneNumber(null);
      addLog("✅ Desconectado com sucesso");
    } catch (err) {
      const message = sanitizeVisibleMessage(
        err instanceof Error ? err.message : "Erro ao desconectar WhatsApp",
      );
      addLog("❌ Erro ao desconectar: " + message);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [instanceName, consultantId, clearPolling, addLog]);

  const reconnect = useCallback(async () => {
    await createAndConnect();
  }, [createAndConnect]);

  /* ── on mount: check existing instance & auto-connect ── */
  useEffect(() => {
    mountedRef.current = true;

    async function checkExistingInstance() {
      setIsLoading(true);
      addLog("Verificando instância existente...");
      try {
        const { data, error: dbError } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .eq("consultant_id", consultantId)
          .maybeSingle();

        if (dbError || !data) {
          addLog("Nenhuma instância salva encontrada");
          setIsLoading(false);
          return;
        }

        setInstanceName(data.instance_name);
        addLog("Instância encontrada — conectando automaticamente...");

        // Auto-connect: try to reuse immediately
        const ok = await tryGetQrFromExisting(data.instance_name);
        if (!ok) {
          addLog("⚠️ Instância anterior não respondeu — tentando reconexão automática...");
          // Try auto-reconnect with retries
          for (let i = 1; i <= MAX_AUTO_RETRIES; i++) {
            if (!mountedRef.current) break;
            await delay(AUTO_RETRY_DELAY_MS);
            addLog(`🔄 Tentativa automática ${i}/${MAX_AUTO_RETRIES}...`);
            const retryOk = await tryGetQrFromExisting(data.instance_name);
            if (retryOk) break;
          }
        }
      } catch {
        addLog("Erro ao verificar instância");
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    }

    checkExistingInstance();

    return () => {
      mountedRef.current = false;
    };
  }, [consultantId, addLog, tryGetQrFromExisting]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      clearPolling();
    };
  }, [clearPolling]);

  return {
    connectionStatus,
    instanceName,
    qrCode,
    phoneNumber,
    isLoading,
    error,
    connectionLog,
    createAndConnect,
    disconnect,
    reconnect,
  };
}
