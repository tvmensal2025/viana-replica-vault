import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  createInstance,
  connectInstance,
  getConnectionState,
  logoutInstance,
} from "@/services/evolutionApi";
import type { ConnectionStatus } from "@/types/whatsapp";
import { useToast } from "@/hooks/use-toast";

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

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), ms);
    promise
      .then((v) => { clearTimeout(id); resolve(v); })
      .catch((e) => { clearTimeout(id); reject(e); });
  });
}

/* ── Core: single polling loop handles everything ── */

export function useWhatsApp(consultantId: string): UseWhatsAppReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrGeneratedAt, setQrGeneratedAt] = useState<number | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionLog, setConnectionLog] = useState<string[]>([]);
  const { toast } = useToast();

  const mountedRef = useRef(true);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockRef = useRef(false);

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

  /* ── Check state with proper error handling ── */
  const checkState = useCallback(async (name: string): Promise<"open" | "close" | "connecting" | "unknown"> => {
    try {
      const result = await withTimeout(getConnectionState(name), 10000);
      const state: string = result?.state || "close";
      if (state === "open") return "open";
      if (state === "connecting") return "connecting";
      if (state === "close") return "close";
      return "unknown";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (isNotFoundError(msg)) return "close";
      return "unknown";
    }
  }, []);

  /* ── Try to get QR code ── */
  const tryGetQr = useCallback(async (name: string): Promise<string | null> => {
    try {
      const resp = await withTimeout(connectInstance(name), 12000);
      return resp?.base64 || null;
    } catch {
      return null;
    }
  }, []);

  /* ── Single unified polling loop ── */
  const startPolling = useCallback((name: string) => {
    stopPolling();

    const poll = async () => {
      if (!mountedRef.current) return;

      const state = await checkState(name);
      if (!mountedRef.current) return;

      if (state === "open") {
        // Connected! Update UI and keep polling at slow rate
        setConnectionStatus((prev) => {
          if (prev !== "connected") {
            addLog("✅ WhatsApp conectado!");
            setQrCode(null);
            setQrGeneratedAt(null);
            setError(null);
          }
          return "connected";
        });
        await saveInstance(name);
        pollRef.current = setTimeout(poll, 30000);
        return;
      }

      if (state === "connecting") {
        // Instance exists but not fully connected — try to get QR
        setConnectionStatus("connecting");
        const qr = await tryGetQr(name);
        if (!mountedRef.current) return;

        if (qr) {
          setQrCode(qr);
          setQrGeneratedAt(Date.now());
          setError(null);
          addLog("📱 QR Code gerado — escaneie com seu celular");
        }
        // Keep polling fast
        pollRef.current = setTimeout(poll, 3000);
        return;
      }

      if (state === "unknown") {
        // Timeout or network issue — don't change status, just retry
        pollRef.current = setTimeout(poll, 5000);
        return;
      }

      // state === "close" — instance exists but disconnected
      // Try to get QR to reconnect
      setConnectionStatus("connecting");
      const qr = await tryGetQr(name);
      if (!mountedRef.current) return;

      if (qr) {
        setQrCode(qr);
        setQrGeneratedAt(Date.now());
        setError(null);
        addLog("📱 QR Code gerado — escaneie com seu celular");
      }
      pollRef.current = setTimeout(poll, 3000);
    };

    poll();
  }, [addLog, checkState, saveInstance, stopPolling, tryGetQr]);

  /* ── Create & Connect ── */
  const createAndConnect = useCallback(async () => {
    if (lockRef.current) return;
    lockRef.current = true;

    setIsLoading(true);
    setError(null);
    setConnectionLog([]);
    setQrCode(null);
    setQrGeneratedAt(null);
    stopPolling();

    const name = getFixedInstanceName(consultantId);
    setInstanceName(name);

    try {
      // Step 1: Check current state
      addLog("Verificando conexão...");
      const state = await checkState(name);
      if (!mountedRef.current) return;

      if (state === "open") {
        setConnectionStatus("connected");
        setError(null);
        addLog("✅ WhatsApp já está conectado!");
        await saveInstance(name);
        startPolling(name);
        return;
      }

      // Step 2: If instance exists (connecting or close), try to get QR
      if (state === "connecting" || state === "close") {
        addLog("⏳ Recuperando QR Code...");
        const qr = await tryGetQr(name);
        if (!mountedRef.current) return;

        if (qr) {
          await saveInstance(name);
          setQrCode(qr);
          setQrGeneratedAt(Date.now());
          setConnectionStatus("connecting");
          addLog("📱 QR Code gerado — escaneie com seu celular");
          startPolling(name);
          return;
        }

        // QR not available yet — start polling, it will keep trying
        await saveInstance(name);
        setConnectionStatus("connecting");
        addLog("⏳ Aguardando QR Code...");
        startPolling(name);
        return;
      }

      // Step 3: Instance doesn't exist or unknown — create it
      addLog("Criando instância...");
      try {
        const response = await withTimeout(createInstance(name), 35000);
        if (!mountedRef.current) return;

        await saveInstance(name);
        const qr = response?.qrcode?.base64 || null;

        if (qr) {
          setQrCode(qr);
          setQrGeneratedAt(Date.now());
          setConnectionStatus("connecting");
          addLog("📱 QR Code gerado — escaneie com seu celular");
        } else {
          setConnectionStatus("connecting");
          addLog("⏳ Instância criada. Aguardando QR Code...");
        }
        startPolling(name);
      } catch (createErr) {
        const msg = sanitize(createErr instanceof Error ? createErr.message : "Erro");

        // Instance already exists (403/conflict) — just start polling
        if (msg.includes("already") || msg.includes("403")) {
          await saveInstance(name);
          setConnectionStatus("connecting");
          addLog("⏳ Instância já existe. Conectando...");
          startPolling(name);
          return;
        }

        setConnectionStatus("disconnected");
        setError(msg);
        addLog("❌ " + msg);
      }
    } catch (err) {
      const msg = sanitize(err instanceof Error ? err.message : "Erro ao conectar");
      setConnectionStatus("disconnected");
      setError(msg);
      addLog("❌ " + msg);
    } finally {
      lockRef.current = false;
      setIsLoading(false);
    }
  }, [consultantId, addLog, checkState, saveInstance, startPolling, stopPolling, tryGetQr]);

  /* ── Refresh QR ── */
  const refreshQr = useCallback(async () => {
    const name = instanceName || getFixedInstanceName(consultantId);
    addLog("📱 Renovando QR Code...");

    // First check if already connected
    const state = await checkState(name);
    if (state === "open") {
      setConnectionStatus("connected");
      setQrCode(null);
      setQrGeneratedAt(null);
      setError(null);
      addLog("✅ WhatsApp já está conectado!");
      startPolling(name);
      return;
    }

    const qr = await tryGetQr(name);
    if (qr) {
      setQrCode(qr);
      setQrGeneratedAt(Date.now());
      setConnectionStatus("connecting");
      setError(null);
      addLog("📱 Novo QR Code gerado");
    } else {
      addLog("⏳ QR Code ainda não disponível. Tentando novamente...");
    }
  }, [instanceName, consultantId, addLog, checkState, startPolling, tryGetQr]);

  /* ── Disconnect ── */
  const disconnect = useCallback(async () => {
    const name = instanceName || getFixedInstanceName(consultantId);
    setIsLoading(true);
    stopPolling();

    try {
      try { await withTimeout(logoutInstance(name), 15000); } catch { /* ok */ }
      await deleteInstanceDb();

      setConnectionStatus("disconnected");
      setInstanceName(null);
      setQrCode(null);
      setQrGeneratedAt(null);
      setPhoneNumber(null);
      setError(null);
      addLog("✅ Desconectado");
    } catch (err) {
      addLog("❌ " + sanitize(err instanceof Error ? err.message : "Erro"));
    } finally {
      setIsLoading(false);
      lockRef.current = false;
    }
  }, [instanceName, consultantId, stopPolling, addLog, deleteInstanceDb]);

  const reconnect = useCallback(() => createAndConnect(), [createAndConnect]);

  /* ── On mount: check if already connected ── */
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function init() {
      const name = getFixedInstanceName(consultantId);
      setInstanceName(name);

      try {
        const state = await checkState(name);
        if (cancelled) return;

        if (state === "open") {
          setConnectionStatus("connected");
          setError(null);
          addLog("✅ WhatsApp conectado!");
          await saveInstance(name);
          startPolling(name);
          setIsLoading(false);
          return;
        }

        if (state === "connecting") {
          setConnectionStatus("connecting");
          addLog("⏳ Recuperando conexão...");
          startPolling(name);
          setIsLoading(false);
          return;
        }

        // "close" or "unknown" — check DB for saved instance
        if (state === "close") {
          // Instance exists on server but disconnected — show connect button
          setConnectionStatus("disconnected");
          setError(null);
          setIsLoading(false);
          return;
        }
      } catch {
        // ignore init errors
      }

      if (cancelled) return;
      setConnectionStatus("disconnected");
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
