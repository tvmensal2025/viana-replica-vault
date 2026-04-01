import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  createInstance,
  connectInstance,
  getConnectionState,
  logoutInstance,
} from "@/services/evolutionApi";
import type { ConnectionStatus } from "@/types/whatsapp";

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

function sanitize(message: string): string {
  return message
    .replace(/evolution api/gi, "serviço de conexão")
    .replace(/evolution/gi, "serviço")
    .replace(/^\[\d{3}\]\s*/, "")
    .trim();
}

function getFixedInstanceName(consultantId: string): string {
  const slug = consultantId.replace(/-/g, "").slice(0, 12);
  return `igreen-${slug}`;
}

function isNotFoundError(message: string): boolean {
  return /404|not found|does not exist|instance.*not|inst[âa]ncia.*n[ãa]o/i.test(message);
}

function isRecoverableConnectionError(message: string): boolean {
  return /timeout|connection closed|temporariamente|inst[áa]vel|erro de conex[ãa]o/i.test(message);
}

function isAlreadyConnectedError(message: string): boolean {
  return /already.*(connected|open)|connection.*already|j[áa].*conectad|inst[âa]ncia.*(aberta|conectada)/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), ms);
    promise
      .then((v) => { clearTimeout(id); resolve(v); })
      .catch((e) => { clearTimeout(id); reject(e); });
  });
}

/* ── Core: single polling loop handles everything ── */

type ConnectionCheckState = "open" | "close" | "connecting" | "unknown" | "missing";

export function useWhatsApp(consultantId: string): UseWhatsAppReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrGeneratedAt, setQrGeneratedAt] = useState<number | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionLog, setConnectionLog] = useState<string[]>([]);

  const mountedRef = useRef(true);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockRef = useRef(false);
  const graceCountRef = useRef(0);
  const instanceSavedRef = useRef(false);
  const statusRef = useRef<ConnectionStatus>("disconnected");

  const setStatus = useCallback((status: ConnectionStatus) => {
    statusRef.current = status;
    setConnectionStatus(status);
  }, []);

  const addLog = useCallback((msg: string) => {
    setConnectionLog((prev) => [...prev.slice(-14), logEntry(sanitize(msg))]);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  }, []);

  /* ── DB helpers ── */
  const saveInstance = useCallback(async (name: string) => {
    await supabase
      .from("whatsapp_instances")
      .upsert({ consultant_id: consultantId, instance_name: name }, { onConflict: "consultant_id" });
  }, [consultantId]);

  const deleteInstanceDb = useCallback(async () => {
    await supabase.from("whatsapp_instances").delete().eq("consultant_id", consultantId);
  }, [consultantId]);

  const markConnected = useCallback(async (name: string, message?: string) => {
    graceCountRef.current = 0;

    if (statusRef.current !== "connected" && message) {
      addLog(message);
    }

    setQrCode(null);
    setQrGeneratedAt(null);
    setError(null);
    setStatus("connected");

    if (!instanceSavedRef.current) {
      try {
        await saveInstance(name);
        instanceSavedRef.current = true;
      } catch {
        // Non-critical persistence failure
      }
    }
  }, [addLog, saveInstance, setStatus]);

  /* ── Check state with proper error handling ── */
  const checkState = useCallback(async (name: string): Promise<ConnectionCheckState> => {
    try {
      const result = await withTimeout(getConnectionState(name), 10000);
      const state: string = result?.state || "close";
      if (state === "open") return "open";
      if (state === "connecting") return "connecting";
      if (state === "close") return "close";
      return "unknown";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (isNotFoundError(msg)) return "missing";
      return "unknown";
    }
  }, []);

  const confirmConnectedState = useCallback(async (
    name: string,
    attempts = 3,
    delayMs = 1500
  ): Promise<boolean> => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const state = await checkState(name);
      if (state === "open") return true;
      if (state === "missing") return false;
      if (attempt < attempts - 1) {
        await sleep(delayMs);
      }
    }

    return false;
  }, [checkState]);

  /* ── Try to get QR code ── */
  const tryGetQr = useCallback(async (
    name: string
  ): Promise<{ qr: string | null; alreadyConnected: boolean }> => {
    try {
      const resp = await withTimeout(connectInstance(name), 12000);
      return { qr: resp?.base64 || null, alreadyConnected: false };
    } catch (err) {
      const msg = sanitize(err instanceof Error ? err.message : "");

      if (isAlreadyConnectedError(msg)) {
        return { qr: null, alreadyConnected: true };
      }

      const confirmedOpen = await confirmConnectedState(name, 2, 1000);
      return { qr: null, alreadyConnected: confirmedOpen };
    }
  }, [confirmConnectedState]);

  /* ── Single unified polling loop ── */
  const startPolling = useCallback((name: string) => {
    stopPolling();

    const poll = async () => {
      if (!mountedRef.current) return;

      const state = await checkState(name);
      if (!mountedRef.current) return;

      if (state === "open") {
        await markConnected(name, "✅ WhatsApp conectado!");
        pollRef.current = setTimeout(poll, 60000);
        return;
      }

      if (state === "missing") {
        graceCountRef.current = 0;
        setStatus("disconnected");
        setQrCode(null);
        setQrGeneratedAt(null);
        setError(null);
        if (statusRef.current !== "disconnected") {
          addLog("ℹ️ Instância não encontrada. Clique em Conectar para gerar um novo QR Code");
        }
        return;
      }

      if (state === "connecting" || state === "unknown") {
        const maxGraceChecks = statusRef.current === "connected" ? 6 : 2;
        if (graceCountRef.current < maxGraceChecks) {
          if (statusRef.current === "connected" && graceCountRef.current === 0) {
            addLog("🔄 Verificando estabilidade da conexão...");
          }
          graceCountRef.current++;
          pollRef.current = setTimeout(poll, 10000);
          return;
        }

        setStatus("connecting");
        const qrAttempt = await tryGetQr(name);
        const recoveredConnection = qrAttempt.alreadyConnected || (
          !qrAttempt.qr && await confirmConnectedState(name, 2, 1000)
        );
        if (!mountedRef.current) return;

        if (recoveredConnection) {
          await markConnected(name, "✅ WhatsApp conectado!");
          pollRef.current = setTimeout(poll, 60000);
          return;
        }

        if (qrAttempt.qr) {
          setQrCode(qrAttempt.qr);
          setQrGeneratedAt(Date.now());
          setError(null);
          addLog("📱 QR Code gerado — escaneie com seu celular");
        }
        pollRef.current = setTimeout(poll, 10000);
        return;
      }

      // state === "close"
      if (statusRef.current === "connected" && graceCountRef.current < 3) {
        if (graceCountRef.current === 0) {
          addLog("🔄 Tentando recuperar a sessão do WhatsApp...");
        }
        graceCountRef.current++;
        pollRef.current = setTimeout(poll, 5000);
        return;
      }

      graceCountRef.current = 0;
      setStatus("connecting");
      const qrAttempt = await tryGetQr(name);
      const recoveredConnection = qrAttempt.alreadyConnected || (
        !qrAttempt.qr && await confirmConnectedState(name, 2, 1000)
      );
      if (!mountedRef.current) return;

      if (recoveredConnection) {
        await markConnected(name, "✅ WhatsApp conectado!");
        pollRef.current = setTimeout(poll, 60000);
        return;
      }

      if (qrAttempt.qr) {
        setQrCode(qrAttempt.qr);
        setQrGeneratedAt(Date.now());
        setError(null);
        addLog("📱 QR Code gerado — escaneie com seu celular");
      }
      pollRef.current = setTimeout(poll, 3000);
    };

    poll();
  }, [addLog, checkState, confirmConnectedState, markConnected, setStatus, stopPolling, tryGetQr]);

  /* ── Create & Connect ── */
  const createAndConnect = useCallback(async () => {
    if (lockRef.current) return;
    lockRef.current = true;

    setIsLoading(true);
    setError(null);
    setConnectionLog([]);
    setQrCode(null);
    setQrGeneratedAt(null);
    instanceSavedRef.current = false;
    stopPolling();

    const name = getFixedInstanceName(consultantId);
    setInstanceName(name);

    try {
      // Step 1: Check current state
      addLog("Verificando conexão...");
      const state = await checkState(name);
      if (!mountedRef.current) return;

      if (state === "open") {
        await markConnected(name, "✅ WhatsApp já está conectado!");
        startPolling(name);
        return;
      }

      // Step 2: If instance exists (connecting or close), try to get QR
      if (state === "connecting" || state === "close") {
        addLog("⏳ Recuperando QR Code...");
        const qrAttempt = await tryGetQr(name);
        const recoveredConnection = qrAttempt.alreadyConnected || (
          !qrAttempt.qr && await confirmConnectedState(name, 2, 1000)
        );
        if (!mountedRef.current) return;

        if (recoveredConnection) {
          await markConnected(name, "✅ WhatsApp já está conectado!");
          startPolling(name);
          return;
        }

        if (qrAttempt.qr) {
          await saveInstance(name);
          instanceSavedRef.current = true;
          setQrCode(qrAttempt.qr);
          setQrGeneratedAt(Date.now());
          setStatus("connecting");
          addLog("📱 QR Code gerado — escaneie com seu celular");
          startPolling(name);
          return;
        }

        // QR not available yet — start polling, it will keep trying
        await saveInstance(name);
        instanceSavedRef.current = true;
        setStatus("connecting");
        addLog("⏳ Aguardando QR Code...");
        startPolling(name);
        return;
      }

      if (state === "unknown") {
        addLog("⚠️ Conexão instável. Tentando recuperar a instância...");
        const qrAttempt = await tryGetQr(name);
        const recoveredConnection = qrAttempt.alreadyConnected || (
          !qrAttempt.qr && await confirmConnectedState(name, 2, 1000)
        );
        if (!mountedRef.current) return;

        if (recoveredConnection) {
          await markConnected(name, "✅ WhatsApp já está conectado!");
          startPolling(name);
          return;
        }

        if (qrAttempt.qr) {
          await saveInstance(name);
          instanceSavedRef.current = true;
          setQrCode(qrAttempt.qr);
          setQrGeneratedAt(Date.now());
          setStatus("connecting");
          addLog("📱 QR Code recuperado — escaneie com seu celular");
          startPolling(name);
          return;
        }
      }

      // Step 3: Instance doesn't exist or state is uncertain — create it
      addLog("Criando instância...");
      try {
        const response = await withTimeout(createInstance(name), 35000);
        if (!mountedRef.current) return;

        await saveInstance(name);
        instanceSavedRef.current = true;
        const qr = response?.qrcode?.base64 || null;

        if (qr) {
          setQrCode(qr);
          setQrGeneratedAt(Date.now());
          setStatus("connecting");
          addLog("📱 QR Code gerado — escaneie com seu celular");
        } else {
          setStatus("connecting");
          addLog("⏳ Instância criada. Aguardando QR Code...");
        }
        startPolling(name);
      } catch (createErr) {
        const msg = sanitize(createErr instanceof Error ? createErr.message : "Erro");

        // Instance already exists (403/409/conflict) — just start polling
        if (msg.includes("already") || msg.includes("403") || msg.includes("409") || msg.includes("exists")) {
          await saveInstance(name);
          instanceSavedRef.current = true;
          setStatus("connecting");
          addLog("⏳ Instância já existe. Conectando...");
          startPolling(name);
          return;
        }

        if (isRecoverableConnectionError(msg)) {
          await saveInstance(name);
          instanceSavedRef.current = true;
          setStatus("connecting");
          setError(null);
          addLog("⏳ Servidor instável. Tentando recuperar a instância...");
          startPolling(name);
          return;
        }

        setStatus("disconnected");
        setError(msg);
        addLog("❌ " + msg);
      }
    } catch (err) {
      const msg = sanitize(err instanceof Error ? err.message : "Erro ao conectar");

      if (isRecoverableConnectionError(msg)) {
        setStatus("connecting");
        setError(null);
        addLog("⏳ Conexão instável. Tentando novamente...");
        startPolling(name);
      } else {
        setStatus("disconnected");
        setError(msg);
        addLog("❌ " + msg);
      }
    } finally {
      lockRef.current = false;
      setIsLoading(false);
    }
  }, [consultantId, addLog, checkState, confirmConnectedState, markConnected, saveInstance, setStatus, startPolling, stopPolling, tryGetQr]);

  /* ── Refresh QR ── */
  const refreshQr = useCallback(async () => {
    const name = instanceName || getFixedInstanceName(consultantId);
    addLog("📱 Renovando QR Code...");

    // First check if already connected
    const state = await checkState(name);
    if (state === "open") {
      await markConnected(name, "✅ WhatsApp já está conectado!");
      startPolling(name);
      return;
    }

    const qrAttempt = await tryGetQr(name);
    const recoveredConnection = qrAttempt.alreadyConnected || (
      !qrAttempt.qr && await confirmConnectedState(name, 2, 1000)
    );

    if (recoveredConnection) {
      await markConnected(name, "✅ WhatsApp já está conectado!");
      startPolling(name);
      return;
    }

    if (qrAttempt.qr) {
      setQrCode(qrAttempt.qr);
      setQrGeneratedAt(Date.now());
      setStatus("connecting");
      setError(null);
      addLog("📱 Novo QR Code gerado");
    } else {
      addLog("⏳ QR Code ainda não disponível. Tentando novamente...");
    }
  }, [instanceName, consultantId, addLog, checkState, confirmConnectedState, markConnected, setStatus, startPolling, tryGetQr]);

  /* ── Disconnect ── */
  const disconnect = useCallback(async () => {
    const name = instanceName || getFixedInstanceName(consultantId);
    setIsLoading(true);
    stopPolling();

    try {
      try { await withTimeout(logoutInstance(name), 15000); } catch { /* ok */ }
      await deleteInstanceDb();

      setStatus("disconnected");
      setInstanceName(null);
      setQrCode(null);
      setQrGeneratedAt(null);
      setPhoneNumber(null);
      setError(null);
      instanceSavedRef.current = false;
      addLog("✅ Desconectado");
    } catch (err) {
      addLog("❌ " + sanitize(err instanceof Error ? err.message : "Erro"));
    } finally {
      setIsLoading(false);
      lockRef.current = false;
    }
  }, [instanceName, consultantId, stopPolling, addLog, deleteInstanceDb, setStatus]);

  const reconnect = useCallback(() => createAndConnect(), [createAndConnect]);

  /* ── On mount: check if already connected (optimized — single check + 8s timeout) ── */
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function init() {
      const name = getFixedInstanceName(consultantId);
      setInstanceName(name);

      try {
        // Single check with 8s global timeout — no multi-attempt confirmation
        const state = await withTimeout(checkState(name), 8000);
        if (cancelled) return;

        if (state === "open") {
          // Already connected — trust single check, no re-confirm needed
          await markConnected(name, "✅ WhatsApp conectado!");
          startPolling(name);
          setIsLoading(false);
          return;
        }

        if (state === "connecting") {
          setStatus("connecting");
          addLog("⏳ Recuperando conexão...");
          startPolling(name);
          setIsLoading(false);
          return;
        }

        // "close", "unknown", or "missing" — go straight to disconnected
        setStatus("disconnected");
        setError(null);
        setIsLoading(false);
        return;
      } catch {
        // Timeout or network error — show disconnected instead of hanging
      }

      if (cancelled) return;
      setStatus("disconnected");
      setError(null);
      setIsLoading(false);
    }

    init();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultantId]);

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
