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
import { logger } from "@/lib/logger";

interface UseWhatsAppReturn {
  connectionStatus: ConnectionStatus;
  instanceName: string | null;
  qrCode: string | null;
  qrGeneratedAt: number | null;
  phoneNumber: string | null;
  isLoading: boolean;
  error: string | null;
  connectionLog: string[];
  createAndConnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
  refreshQr: () => Promise<void>;
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

function getFixedInstanceName(consultantId: string): string {
  const slug = consultantId.replace(/-/g, "").slice(0, 12);
  return `igreen-${slug}`;
}

const MAX_RECOVERY_ATTEMPTS = 5;
const RECOVERY_DELAY_MS = 5000;
const QR_EXPIRY_MS = 45000; // 45s — WhatsApp QR codes expire ~60s
const MAX_TIMEOUT_POLLS_BEFORE_REFRESH = 6; // ~30s of timeouts → refresh QR

/* ── hook ── */

export function useWhatsApp(consultantId: string): UseWhatsAppReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrGeneratedAt, setQrGeneratedAt] = useState<number | null>(null);
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
  const connectLockRef = useRef(false); // prevent parallel createAndConnect
  const consecutiveTimeoutsRef = useRef(0);

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

  /* ── DB helpers with error checking ── */
  const saveInstanceToDb = useCallback(async (name: string) => {
    const { error: dbError } = await supabase
      .from("whatsapp_instances")
      .upsert(
        { consultant_id: consultantId, instance_name: name },
        { onConflict: "consultant_id" }
      );
    if (dbError) {
      logger.error("[useWhatsApp] DB upsert failed:", dbError.message);
      addLog("⚠️ Erro ao salvar instância no banco");
      return false;
    }
    return true;
  }, [consultantId, addLog]);

  const deleteInstanceFromDb = useCallback(async () => {
    const { error: dbError } = await supabase
      .from("whatsapp_instances")
      .delete()
      .eq("consultant_id", consultantId);
    if (dbError) {
      logger.error("[useWhatsApp] DB delete failed:", dbError.message);
    }
  }, [consultantId]);

  /* ── Refresh QR code ── */
  const refreshQrInternal = useCallback(
    async (name: string) => {
      try {
        addLog("📱 Renovando QR Code...");
        const resp = await withTimeout(connectInstance(name), 15000);
        const qr = resp?.base64 || null;
        if (qr) {
          setQrCode(qr);
          setQrGeneratedAt(Date.now());
          setConnectionStatus("connecting");
          consecutiveTimeoutsRef.current = 0;
          addLog("📱 Novo QR Code gerado — escaneie com seu celular");
          return true;
        }
      } catch (err) {
        logger.error("[useWhatsApp] QR refresh failed:", err instanceof Error ? err.message : err);
      }
      return false;
    },
    [addLog],
  );

  /* ── Try to connect/get QR from an existing instance ── */
  const tryConnect = useCallback(
    async (name: string): Promise<boolean> => {
      try {
        const state = await withTimeout(getConnectionState(name), 15000);
        if (state.state === "open") {
          setConnectionStatus("connected");
          setQrCode(null);
          setQrGeneratedAt(null);
          setError(null);
          setInstanceName(name);
          consecutiveTimeoutsRef.current = 0;
          addLog("✅ WhatsApp conectado!");
          return true;
        }

        // Instance exists but not connected — get QR
        addLog("📱 Gerando QR Code...");
        const resp = await withTimeout(connectInstance(name), 15000);
        const qr = resp?.base64 || null;
        if (qr) {
          setQrCode(qr);
          setQrGeneratedAt(Date.now());
          setConnectionStatus("connecting");
          setInstanceName(name);
          addLog("📱 QR Code gerado — escaneie com seu celular");
          return true;
        }
      } catch (err) {
        logger.error("[useWhatsApp] tryConnect failed:", err instanceof Error ? err.message : err);
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

  /* ── Polling with QR auto-refresh ── */
  const pollConnectionState = useCallback(
    async (name: string) => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;

      try {
        const result = await getConnectionState(name);
        const state = result?.state;
        const isTimeout = !!(result as Record<string, unknown>)?.timeout;

        if (state === "open") {
          if (prevStatusRef.current !== "connected") {
            setConnectionStatus("connected");
            setQrCode(null);
            setQrGeneratedAt(null);
            setError(null);
            consecutiveTimeoutsRef.current = 0;
            addLog("✅ WhatsApp conectado com sucesso!");
          }
        } else if (state === "close") {
          if (prevStatusRef.current === "connected") {
            addLog("⚠️ Conexão perdida — reconectando...");
            setConnectionStatus("connecting");
            setQrCode(null);
            setQrGeneratedAt(null);
            autoReconnect(name);
            return;
          }
          if (prevStatusRef.current === "connecting") {
            // QR may have expired — refresh it
            consecutiveTimeoutsRef.current += 1;
            if (consecutiveTimeoutsRef.current >= 3) {
              addLog("⏳ QR expirado — renovando...");
              await refreshQrInternal(name);
            }
            return;
          }
          setConnectionStatus("disconnected");
          setQrCode(null);
          setQrGeneratedAt(null);
        } else if (isTimeout) {
          // Proxy returned 200 with timeout flag
          consecutiveTimeoutsRef.current += 1;
          if (consecutiveTimeoutsRef.current >= MAX_TIMEOUT_POLLS_BEFORE_REFRESH) {
            addLog("⏳ Servidor lento — renovando QR...");
            consecutiveTimeoutsRef.current = 0;
            await refreshQrInternal(name);
          }
        } else {
          // "connecting" state from API — reset timeout counter
          consecutiveTimeoutsRef.current = 0;
        }
      } catch (err) {
        logger.error("[useWhatsApp] poll error:", err instanceof Error ? err.message : err);
      } finally {
        pollInFlightRef.current = false;
      }
    },
    [addLog, autoReconnect, refreshQrInternal],
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

  /* ── createAndConnect — with lock guard ── */
  const createAndConnect = useCallback(async () => {
    if (connectLockRef.current) {
      addLog("⚠️ Conexão já em andamento...");
      return;
    }
    connectLockRef.current = true;

    setIsLoading(true);
    setError(null);
    setConnectionLog([]);
    setQrCode(null);
    setQrGeneratedAt(null);
    setConnectionStatus("disconnected");
    consecutiveTimeoutsRef.current = 0;

    const fixedName = getFixedInstanceName(consultantId);
    addLog("Iniciando conexão...");

    try {
      // Step 1: Try to connect to existing instance first (fast path)
      addLog("Verificando instância existente...");
      const alreadyConnected = await tryConnect(fixedName);
      if (alreadyConnected) {
        await saveInstanceToDb(fixedName);
        return;
      }

      // Step 2: Save to DB BEFORE creating
      const dbOk = await saveInstanceToDb(fixedName);
      if (!dbOk) {
        addLog("⚠️ Continuando sem persistência...");
      }
      setInstanceName(fixedName);

      // Step 3: Fire instance creation
      addLog("Criando instância...");
      let createSucceeded = false;

      try {
        const response = await withTimeout(createInstance(fixedName), 50000);
        createSucceeded = true;

        const qr = response?.qrcode?.base64 || response?.qrcode?.pairingCode || null;
        if (qr) {
          setQrCode(qr);
          setQrGeneratedAt(Date.now());
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
        } else {
          throw createErr;
        }
      }

      // Step 4: Recovery loop
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

      setError("Servidor WhatsApp demorou para responder. Clique em Reconectar para tentar novamente.");
      addLog("⚠️ Servidor não respondeu a tempo — tente reconectar");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao criar conexão WhatsApp";
      const safe = sanitizeVisibleMessage(msg);
      addLog("❌ " + safe);
      setError(safe);
    } finally {
      setIsLoading(false);
      connectLockRef.current = false;
    }
  }, [consultantId, addLog, tryConnect, saveInstanceToDb]);

  /* ── public refreshQr ── */
  const refreshQr = useCallback(async () => {
    const name = instanceName || getFixedInstanceName(consultantId);
    await refreshQrInternal(name);
  }, [instanceName, consultantId, refreshQrInternal]);

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

      await deleteInstanceFromDb();

      clearPolling();
      setConnectionStatus("disconnected");
      setInstanceName(null);
      setQrCode(null);
      setQrGeneratedAt(null);
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
  }, [instanceName, consultantId, clearPolling, addLog, deleteInstanceFromDb]);

  const reconnect = useCallback(() => createAndConnect(), [createAndConnect]);

  /* ── on mount: auto-connect if instance exists ── */
  const createAndConnectRef = useRef(createAndConnect);
  createAndConnectRef.current = createAndConnect;

  useEffect(() => {
    mountedRef.current = true;

    async function init() {
      setIsLoading(true);

      const { data, error: dbError } = await supabase
        .from("whatsapp_instances")
        .select("instance_name")
        .eq("consultant_id", consultantId)
        .maybeSingle();

      if (dbError) {
        logger.error("[useWhatsApp] DB select failed:", dbError.message);
      }

      const name = data?.instance_name || getFixedInstanceName(consultantId);

      if (data) {
        setInstanceName(name);
        addLog("Conectando automaticamente...");

        if (await tryConnect(name)) {
          setIsLoading(false);
          return;
        }

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

      // Auto-start connection
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
    qrGeneratedAt,
    phoneNumber,
    isLoading,
    error,
    connectionLog,
    createAndConnect,
    disconnect,
    reconnect,
    refreshQr,
  };
}
