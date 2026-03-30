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
import { createLogger } from "@/lib/logger";

const logger = createLogger("useWhatsApp");

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

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), ms);
    promise
      .then((v) => { clearTimeout(id); resolve(v); })
      .catch((e) => { clearTimeout(id); reject(e); });
  });
}

/* ── hook ── */

export function useWhatsApp(consultantId: string): UseWhatsAppReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrGeneratedAt, setQrGeneratedAt] = useState<number | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true); // starts loading
  const [error, setError] = useState<string | null>(null);
  const [connectionLog, setConnectionLog] = useState<string[]>([]);
  const { toast } = useToast();

  const mountedRef = useRef(true);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockRef = useRef(false);

  const addLog = useCallback((msg: string) => {
    setConnectionLog((prev) => [...prev.slice(-14), logEntry(sanitize(msg))]);
  }, []);

  const clearPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  /* ── Save/delete instance in DB ── */
  const saveInstance = useCallback(async (name: string) => {
    await supabase
      .from("whatsapp_instances")
      .upsert({ consultant_id: consultantId, instance_name: name }, { onConflict: "consultant_id" });
  }, [consultantId]);

  const deleteInstanceDb = useCallback(async () => {
    await supabase.from("whatsapp_instances").delete().eq("consultant_id", consultantId);
  }, [consultantId]);

  /* ── Check if currently connected ── */
  const checkState = useCallback(async (name: string): Promise<"open" | "close" | "connecting"> => {
    try {
      const result = await withTimeout(getConnectionState(name), 20000);
      return result?.state || "close";
    } catch {
      return "close";
    }
  }, []);

  /* ── Get QR code from instance ── */
  const fetchQr = useCallback(async (name: string): Promise<string | null> => {
    try {
      const resp = await withTimeout(connectInstance(name), 25000);
      return resp?.base64 || null;
    } catch {
      return null;
    }
  }, []);

  /* ── Poll connection state (simple) ── */
  const startPolling = useCallback((name: string) => {
    clearPolling();

    const poll = async () => {
      if (!mountedRef.current) return;

      try {
        const state = await checkState(name);

        if (!mountedRef.current) return;

        if (state === "open") {
          setConnectionStatus((prev) => {
            if (prev !== "connected") {
              addLog("✅ WhatsApp conectado!");
              setQrCode(null);
              setQrGeneratedAt(null);
              setError(null);
            }
            return "connected";
          });
          // Poll slower when connected
          pollRef.current = setTimeout(poll, 30000);
        } else if (state === "connecting") {
          // Still waiting for QR scan
          pollRef.current = setTimeout(poll, 4000);
        } else {
          // "close" — connection lost or QR expired
          setConnectionStatus((prev) => {
            if (prev === "connected") {
              addLog("⚠️ Conexão perdida");
              toast({ title: "Conexão WhatsApp perdida", variant: "destructive" });
            }
            return "disconnected";
          });
          setQrCode(null);
          setQrGeneratedAt(null);
        }
      } catch {
        // Network error — retry
        if (mountedRef.current) {
          pollRef.current = setTimeout(poll, 10000);
        }
      }
    };

    poll();
  }, [clearPolling, checkState, addLog, toast]);

  /* ── Main: create instance & get QR ── */
  const createAndConnect = useCallback(async () => {
    if (lockRef.current) return;
    lockRef.current = true;

    setIsLoading(true);
    setError(null);
    setConnectionLog([]);
    setQrCode(null);
    setQrGeneratedAt(null);

    const name = getFixedInstanceName(consultantId);
    setInstanceName(name);

    const MAX_RETRIES = 2;

    try {
      for (let retry = 0; retry <= MAX_RETRIES; retry++) {
        try {
          if (retry > 0) {
            addLog(`🔄 Tentativa ${retry + 1}...`);
            await new Promise((r) => setTimeout(r, 3000 * retry));
          }

          // 1. Check if already connected
          addLog("Verificando conexão...");
          const state = await checkState(name);

          if (state === "open") {
            setConnectionStatus("connected");
            setError(null);
            addLog("✅ WhatsApp já está conectado!");
            await saveInstance(name);
            startPolling(name);
            return;
          }

          // 2. Try to get QR from existing instance
          addLog("Gerando QR Code...");
          let qr = await fetchQr(name);

          if (!qr) {
            // 3. Instance doesn't exist — create it
            addLog("Criando instância...");
            try {
              const response = await withTimeout(createInstance(name), 60000);
              qr = response?.qrcode?.base64 || null;
            } catch (createErr) {
              const msg = createErr instanceof Error ? createErr.message : "";
              if (msg.includes("already") || msg.includes("403")) {
                // Instance exists, try QR again after short delay
                await new Promise((r) => setTimeout(r, 2000));
                qr = await fetchQr(name);
              } else if (msg.includes("timeout") || msg.includes("504")) {
                if (retry < MAX_RETRIES) {
                  addLog("⏳ Servidor lento, tentando novamente...");
                  continue;
                }
                throw createErr;
              } else {
                throw createErr;
              }
            }
          }

          if (qr) {
            await saveInstance(name);
            setQrCode(qr);
            setQrGeneratedAt(Date.now());
            setConnectionStatus("connecting");
            addLog("📱 QR Code gerado — escaneie com seu celular");
            startPolling(name);
            return;
          } else {
            if (retry < MAX_RETRIES) {
              addLog("⏳ QR Code não disponível, tentando novamente...");
              continue;
            }
            setError("Não foi possível gerar o QR Code. Tente novamente.");
            addLog("❌ Falha ao gerar QR Code");
          }
          break;
        } catch (err) {
          const msg = sanitize(err instanceof Error ? err.message : "Erro ao conectar");
          if (retry < MAX_RETRIES && (msg.includes("timeout") || msg.includes("504") || msg.includes("conexão"))) {
            addLog("⏳ " + msg + " — tentando novamente...");
            continue;
          }
          setError(msg);
          addLog("❌ " + msg);
          break;
        }
      }
    } finally {
      lockRef.current = false;
      setIsLoading(false);
    }
  }, [consultantId, addLog, checkState, fetchQr, saveInstance, startPolling]);

  /* ── Refresh QR ── */
  const refreshQr = useCallback(async () => {
    const name = instanceName || getFixedInstanceName(consultantId);
    addLog("📱 Renovando QR Code...");
    const qr = await fetchQr(name);
    if (qr) {
      setQrCode(qr);
      setQrGeneratedAt(Date.now());
      setConnectionStatus("connecting");
      addLog("📱 Novo QR Code gerado");
    } else {
      addLog("⚠️ Não foi possível renovar o QR Code");
    }
  }, [instanceName, consultantId, fetchQr, addLog]);

  /* ── Disconnect ── */
  const disconnect = useCallback(async () => {
    const name = instanceName || getFixedInstanceName(consultantId);
    setIsLoading(true);
    clearPolling();

    try {
      try { await withTimeout(deleteInstance(name), 15000); } catch { /* ok */ }
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
    }
  }, [instanceName, consultantId, clearPolling, addLog, deleteInstanceDb]);

  const reconnect = useCallback(() => createAndConnect(), [createAndConnect]);

  /* ── On mount: silently check if already connected ── */
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function init() {
      const name = getFixedInstanceName(consultantId);

      try {
        const state = await checkState(name);
        if (cancelled) return;

        if (state === "open") {
          // Already connected — just set state, no QR needed
          setInstanceName(name);
          setConnectionStatus("connected");
          setError(null);
          addLog("✅ WhatsApp conectado!");
          await saveInstance(name);
          startPolling(name);
          setIsLoading(false);
          return;
        }
      } catch {
        // Instance may not exist yet — that's fine
      }

      if (cancelled) return;

      // Not connected — auto-start connection to show QR immediately
      setIsLoading(false);
      // Small delay to let the component render first
      await new Promise((r) => setTimeout(r, 200));
      if (!cancelled && mountedRef.current) {
        // Auto-trigger createAndConnect so user sees QR immediately
        createAndConnect();
      }
    }

    init();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      clearPolling();
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
