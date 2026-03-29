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
  const ts = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `[${ts}] ${msg}`;
}

function sanitizeVisibleMessage(message: string): string {
  return message
    .replace(/evolution api/gi, "serviço de conexão")
    .replace(/evolution/gi, "serviço")
    .replace(/^\[\d{3}\]\s*/, "")
    .trim();
}

function isRecoverableError(msg: string): boolean {
  return (
    msg === "timeout" ||
    msg.includes("[504]") ||
    msg.includes("[502]") ||
    msg.includes("demorou") ||
    msg.includes("Erro de conexão") ||
    msg.includes("Failed to fetch") ||
    msg.includes("already in use") ||
    msg.includes("[403]")
  );
}

function isWorkerLimitError(msg: string): boolean {
  return /WORKER_LIMIT|\[546\]|not having enough compute resources/i.test(msg);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), ms);
    promise
      .then((v) => { clearTimeout(id); resolve(v); })
      .catch((e) => { clearTimeout(id); reject(e); });
  });
}

/**
 * Deterministic instance name per consultant.
 * Always the same for a given consultantId — no random suffix.
 * This ensures recovery always finds the right instance.
 */
function getFixedInstanceName(consultantId: string): string {
  // Use first 12 chars of UUID (enough to be unique)
  const slug = consultantId.replace(/-/g, "").slice(0, 12);
  return `igreen-${slug}`;
}

const MAX_RECOVERY_ATTEMPTS = 5;
const RECOVERY_DELAY_MS = 5000;

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
  const autoReconnectingRef = useRef(false);
  const mountedRef = useRef(true);

  const addLog = useCallback((msg: string) => {
    setConnectionLog((prev) => [...prev.slice(-14), logEntry(sanitizeVisibleMessage(msg))]);
  }, []);

  const clearPolling = useCallback(() => {
    pollActiveRef.current = false;
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /* ── Try to connect/get QR from an existing instance ── */
  const tryConnect = useCallback(
    async (name: string): Promise<boolean> => {
      try {
        // 1. Check state
        const state = await withTimeout(getConnectionState(name), 12000);
        if (state.state === "open") {
          setConnectionStatus("connected");
          setQrCode(null);
          setError(null);
          setInstanceName(name);
          addLog("✅ WhatsApp conectado!");
          return true;
        }

        // 2. Instance exists but not connected — get QR
        addLog("📱 Gerando QR Code...");
        const resp = await withTimeout(connectInstance(name), 15000);
        const qr = resp?.base64 || null;
        if (qr) {
          setQrCode(qr);
          setConnectionStatus("connecting");
          setInstanceName(name);
          addLog("📱 QR Code gerado — escaneie com seu celular");
          return true;
        }
      } catch {
        // Instance might not exist yet or API slow
      }
      return false;
    },
    [addLog],
  );

  /* ── Auto-reconnect on connection loss ── */
  const autoReconnect = useCallback(
    async (name: string) => {
      if (autoReconnectingRef.current || !mountedRef.current) return;
      autoReconnectingRef.current = true;

      for (let i = 1; i <= 3; i++) {
        if (!mountedRef.current) break;
        addLog(`🔄 Reconexão automática (${i}/3)...`);
        if (await tryConnect(name)) {
          autoReconnectingRef.current = false;
          return;
        }
        if (i < 3) await delay(RECOVERY_DELAY_MS);
      }

      autoReconnectingRef.current = false;
      addLog("⚠️ Reconexão automática esgotada");
    },
    [addLog, tryConnect],
  );

  /* ── Polling ── */
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
            addLog("✅ WhatsApp conectado com sucesso!");
          }
        } else if (state === "close") {
          if (prevStatusRef.current === "connected") {
            addLog("⚠️ Conexão perdida — reconectando...");
            setConnectionStatus("connecting");
            setQrCode(null);
            autoReconnect(name);
            return;
          }
          // During pairing, briefly reports "close" — keep waiting
          if (prevStatusRef.current === "connecting") return;

          setConnectionStatus("disconnected");
          setQrCode(null);
        }
      } catch {
        // don't crash
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

      const run = async () => {
        if (!pollActiveRef.current) return;
        await pollConnectionState(name);
        if (!pollActiveRef.current) return;
        const next = prevStatusRef.current === "connecting" ? 5000 : 30000;
        intervalRef.current = setTimeout(run, next);
      };
      run();
    },
    [clearPolling, pollConnectionState],
  );

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = connectionStatus;

    if (instanceName && (connectionStatus === "connecting" || connectionStatus === "connected")) {
      if (prev !== connectionStatus) startPolling(instanceName);
    } else {
      clearPolling();
    }
  }, [connectionStatus, instanceName, startPolling, clearPolling]);

  /* ──────────────────────────────────────────────────
   * createAndConnect — the main flow
   *
   * Strategy: deterministic instance name per consultant.
   * 1. Save name to DB BEFORE calling Evolution API
   * 2. Fire create (fire-and-forget if timeout)
   * 3. Poll/recover until instance responds
   * ────────────────────────────────────────────────── */
  const createAndConnect = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setConnectionLog([]);
    setQrCode(null);
    setConnectionStatus("disconnected");

    const fixedName = getFixedInstanceName(consultantId);
    addLog("Iniciando conexão...");

    try {
      // Step 1: Try to connect to existing instance first (fast path)
      addLog("Verificando instância existente...");
      const alreadyConnected = await tryConnect(fixedName);
      if (alreadyConnected) {
        // Ensure DB has it saved
        await supabase
          .from("whatsapp_instances")
          .upsert({ consultant_id: consultantId, instance_name: fixedName }, { onConflict: "consultant_id" });
        return;
      }

      // Step 2: Save to DB BEFORE creating (so we never lose the name)
      await supabase
        .from("whatsapp_instances")
        .upsert({ consultant_id: consultantId, instance_name: fixedName }, { onConflict: "consultant_id" });
      setInstanceName(fixedName);

      // Step 3: Fire instance creation (may timeout — that's OK)
      addLog("Criando instância...");
      let createSucceeded = false;

      try {
        const response = await withTimeout(createInstance(fixedName), 50000);
        createSucceeded = true;

        // If we got a QR code directly from create response, use it
        const qr = response?.qrcode?.base64 || response?.qrcode?.pairingCode || null;
        if (qr) {
          setQrCode(qr);
          setConnectionStatus("connecting");
          addLog("📱 QR Code gerado — escaneie com seu celular");
          return;
        }
      } catch (createErr) {
        const msg = createErr instanceof Error ? createErr.message : "";

        if (isWorkerLimitError(msg)) {
          throw new Error("Serviço temporariamente ocupado. Tente novamente em alguns segundos.");
        }

        if (isRecoverableError(msg)) {
          addLog("⚠️ Servidor lento — aguardando instância ficar pronta...");
          // Fall through to recovery loop below
        } else {
          throw createErr;
        }
      }

      // Step 4: Recovery loop — keep trying to connect to the instance
      // The instance may have been created on the Evolution API side despite timeout
      for (let attempt = 1; attempt <= MAX_RECOVERY_ATTEMPTS; attempt++) {
        if (!mountedRef.current) break;

        const waitTime = createSucceeded ? 2000 : RECOVERY_DELAY_MS;
        await delay(waitTime);

        addLog(`🔄 Tentativa ${attempt}/${MAX_RECOVERY_ATTEMPTS}...`);

        if (await tryConnect(fixedName)) {
          addLog("✅ Conectado com sucesso!");
          return;
        }
      }

      // If all recovery attempts fail, show actionable error
      setError("Servidor WhatsApp demorou para responder. Clique em Reconectar para tentar novamente.");
      addLog("⚠️ Servidor não respondeu a tempo — tente reconectar");

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao criar conexão WhatsApp";
      const safe = sanitizeVisibleMessage(msg);
      addLog("❌ " + safe);
      setError(safe);
    } finally {
      setIsLoading(false);
    }
  }, [consultantId, addLog, tryConnect]);

  /* ── disconnect ── */
  const disconnect = useCallback(async () => {
    const name = instanceName || getFixedInstanceName(consultantId);
    setIsLoading(true);
    setError(null);
    autoReconnectingRef.current = false;
    addLog("Desconectando...");

    try {
      try {
        await withTimeout(deleteInstance(name), 15000);
      } catch {
        // If delete fails, continue cleanup anyway
      }

      await supabase
        .from("whatsapp_instances")
        .delete()
        .eq("consultant_id", consultantId);

      clearPolling();
      setConnectionStatus("disconnected");
      setInstanceName(null);
      setQrCode(null);
      setPhoneNumber(null);
      addLog("✅ Desconectado");
    } catch (err) {
      const msg = sanitizeVisibleMessage(
        err instanceof Error ? err.message : "Erro ao desconectar",
      );
      addLog("❌ " + msg);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [instanceName, consultantId, clearPolling, addLog]);

  const reconnect = useCallback(() => createAndConnect(), [createAndConnect]);

  /* ── on mount: auto-connect if instance exists ── */
  const createAndConnectRef = useRef(createAndConnect);
  createAndConnectRef.current = createAndConnect;

  useEffect(() => {
    mountedRef.current = true;

    async function init() {
      setIsLoading(true);

      // Check DB for saved instance
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("instance_name")
        .eq("consultant_id", consultantId)
        .maybeSingle();

      const name = data?.instance_name || getFixedInstanceName(consultantId);

      if (data) {
        setInstanceName(name);
        addLog("Conectando automaticamente...");

        // Try immediate connect
        if (await tryConnect(name)) {
          setIsLoading(false);
          return;
        }

        // Retry a couple times silently
        for (let i = 1; i <= 2; i++) {
          if (!mountedRef.current) break;
          await delay(3000);
          if (await tryConnect(name)) {
            setIsLoading(false);
            return;
          }
        }

        addLog("Nenhuma conexão ativa encontrada");
      }

      setIsLoading(false);

      // Auto-start connection if not connected — show QR code immediately
      if (!mountedRef.current) return;
      await delay(300);
      if (mountedRef.current) {
        createAndConnectRef.current();
      }
    }

    init();
    return () => { mountedRef.current = false; };
  }, [consultantId, addLog, tryConnect]);

  useEffect(() => () => clearPolling(), [clearPolling]);

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
