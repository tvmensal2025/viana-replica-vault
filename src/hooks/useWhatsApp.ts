import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  createInstance,
  connectInstance,
  getConnectionState,
  logoutInstance,
  fetchInstances,
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

interface QrFetchResult {
  qrCode: string | null;
  timedOut: boolean;
  shouldCreate: boolean;
  errorMessage: string | null;
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

function shouldCreateInstanceFromError(message: string): boolean {
  return /404|not found|does not exist|instance.*not|inst[âa]ncia.*n[ãa]o encontrada|instancia.*nao encontrada/i.test(message);
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionLog, setConnectionLog] = useState<string[]>([]);
  const { toast } = useToast();

  const mountedRef = useRef(true);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrRecoveryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockRef = useRef(false);
  const createAttemptedAtRef = useRef<number | null>(null);
  const consecutiveFailsRef = useRef(0);

  const addLog = useCallback((msg: string) => {
    setConnectionLog((prev) => [...prev.slice(-14), logEntry(sanitize(msg))]);
  }, []);

  const clearPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const clearQrRecovery = useCallback(() => {
    if (qrRecoveryRef.current) {
      clearTimeout(qrRecoveryRef.current);
      qrRecoveryRef.current = null;
    }
  }, []);

  const markCreateAttempt = useCallback(() => {
    createAttemptedAtRef.current = Date.now();
  }, []);

  const clearCreateAttempt = useCallback(() => {
    createAttemptedAtRef.current = null;
  }, []);

  const hasRecentCreateAttempt = useCallback(() => {
    return createAttemptedAtRef.current !== null && Date.now() - createAttemptedAtRef.current < 3 * 60 * 1000;
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
  const fetchQr = useCallback(async (name: string): Promise<QrFetchResult> => {
    try {
      const resp = await withTimeout(connectInstance(name), 25000);
      return {
        qrCode: resp?.base64 || null,
        timedOut: Boolean(resp?.timeout),
        shouldCreate: false,
        errorMessage: null,
      };
    } catch (err) {
      const message = sanitize(err instanceof Error ? err.message : "Erro ao conectar");
      const isTemporaryTimeout = /timeout|demorando para responder|alguns instantes|tente novamente/i.test(message);
      return {
        qrCode: null,
        timedOut: isTemporaryTimeout,
        shouldCreate: !isTemporaryTimeout && shouldCreateInstanceFromError(message),
        errorMessage: isTemporaryTimeout ? null : message,
      };
    }
  }, []);

  const startPolling = useCallback((name: string) => {
    clearPolling();

    const poll = async () => {
      if (!mountedRef.current) return;

      try {
        const state = await checkState(name);

        if (!mountedRef.current) return;

        if (state === "open") {
          consecutiveFailsRef.current = 0;
          clearQrRecovery();
          clearCreateAttempt();
          setConnectionStatus((prev) => {
            if (prev !== "connected") {
              addLog("✅ WhatsApp conectado!");
              setQrCode(null);
              setQrGeneratedAt(null);
              setError(null);
            }
            return "connected";
          });
          pollRef.current = setTimeout(poll, 30000);
        } else if (state === "connecting") {
          consecutiveFailsRef.current = 0;
          pollRef.current = setTimeout(poll, 5000);
        } else {
          consecutiveFailsRef.current += 1;

          if (consecutiveFailsRef.current <= 3) {
            if (consecutiveFailsRef.current === 1) {
              addLog("🔄 Oscilação detectada. Tentando manter a sessão ativa...");
            }
            pollRef.current = setTimeout(poll, 5000);
          } else {
            clearQrRecovery();
            setConnectionStatus("connecting");
            setError(null);
            setQrCode(null);
            setQrGeneratedAt(null);
            addLog("🔄 Sessão desconectada. Iniciando recuperação automática...");

            const qrAttempt = await fetchQr(name);
            if (!mountedRef.current) return;

            if (qrAttempt.qrCode) {
              consecutiveFailsRef.current = 0;
              clearCreateAttempt();
              await saveInstance(name);
              setQrCode(qrAttempt.qrCode);
              setQrGeneratedAt(Date.now());
              setConnectionStatus("connecting");
              setError(null);
              addLog("📱 QR Code renovado automaticamente");
              pollRef.current = setTimeout(poll, 5000);
              return;
            }

            if (qrAttempt.timedOut || !qrAttempt.shouldCreate) {
              consecutiveFailsRef.current = 0;
              addLog("⏳ O servidor WhatsApp ainda está restabelecendo a sessão...");
              pollRef.current = setTimeout(poll, 5000);
              return;
            }

            addLog("🔄 Instância indisponível. Criando nova sessão automaticamente...");
            markCreateAttempt();

            try {
              const response = await withTimeout(createInstance(name), 35000);
              if (!mountedRef.current) return;

              consecutiveFailsRef.current = 0;
              await saveInstance(name);

              const qr = response?.qrcode?.base64 || null;
              if (qr) {
                clearCreateAttempt();
                setQrCode(qr);
                setQrGeneratedAt(Date.now());
                setConnectionStatus("connecting");
                setError(null);
                addLog("📱 Nova sessão criada automaticamente");
                pollRef.current = setTimeout(poll, 5000);
                return;
              }

              addLog(
                response?.timeout
                  ? "⏳ Nova sessão iniciada. Aguardando QR Code do servidor..."
                  : "⏳ Sessão recriada. Aguardando QR Code..."
              );
              pollRef.current = setTimeout(poll, 5000);
            } catch (recoveryErr) {
              const recoveryMessage = sanitize(recoveryErr instanceof Error ? recoveryErr.message : "Erro ao recuperar conexão");
              logger.warn("Falha ao recuperar conexão automaticamente", { name, recoveryMessage });
              setConnectionStatus("connecting");
              setError(null);
              addLog(`⚠️ ${recoveryMessage} — continuando tentativa automática...`);
              pollRef.current = setTimeout(poll, 15000);
            }
          }
        }
      } catch {
        if (mountedRef.current) {
          pollRef.current = setTimeout(poll, 10000);
        }
      }
    };

    poll();
  }, [addLog, checkState, clearCreateAttempt, clearPolling, clearQrRecovery, fetchQr, markCreateAttempt, saveInstance, toast]);

  const scheduleQrRecovery = useCallback((name: string, attempt = 1) => {
    clearQrRecovery();

    if (attempt > 6) {
      addLog("⚠️ O QR Code ainda não ficou disponível. Você pode tentar renovar manualmente.");
      return;
    }

    qrRecoveryRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;

      const result = await fetchQr(name);
      if (!mountedRef.current) return;

      if (result.qrCode) {
        clearQrRecovery();
        clearCreateAttempt();
        await saveInstance(name);
        setQrCode(result.qrCode);
        setQrGeneratedAt(Date.now());
        setConnectionStatus("connecting");
        setError(null);
        addLog("📱 QR Code gerado — escaneie com seu celular");
        return;
      }

      const state = await checkState(name);
      if (!mountedRef.current) return;

      if (state === "open") {
        clearQrRecovery();
        clearCreateAttempt();
        await saveInstance(name);
        setConnectionStatus("connected");
        setQrCode(null);
        setQrGeneratedAt(null);
        setError(null);
        addLog("✅ WhatsApp conectado!");
        startPolling(name);
        return;
      }

      if (state === "connecting" || result.timedOut || !result.shouldCreate || hasRecentCreateAttempt()) {
        addLog(attempt === 1 ? "⏳ Aguardando QR Code do servidor..." : "⏳ Ainda aguardando QR Code...");
        scheduleQrRecovery(name, attempt + 1);
      }
    }, Math.min(2000 * attempt, 10000));
  }, [addLog, checkState, clearCreateAttempt, clearQrRecovery, fetchQr, hasRecentCreateAttempt, saveInstance, startPolling]);

  const enterPendingConnection = useCallback((name: string, message: string) => {
    setConnectionStatus("connecting");
    setError(null);
    addLog(message);
    startPolling(name);
    scheduleQrRecovery(name);
  }, [addLog, scheduleQrRecovery, startPolling]);

  /* ── Main: create instance & get QR ── */
  const createAndConnect = useCallback(async () => {
    if (lockRef.current) return;
    lockRef.current = true;

    setIsLoading(true);
    setError(null);
    setConnectionLog([]);
    setQrCode(null);
    setQrGeneratedAt(null);
    clearQrRecovery();

    const name = getFixedInstanceName(consultantId);
    setInstanceName(name);

    const MAX_RETRIES = 2;

    try {
      for (let retry = 0; retry <= MAX_RETRIES; retry++) {
        try {
          if (retry > 0) {
            addLog(`🔄 Tentativa ${retry + 1}/${MAX_RETRIES + 1}...`);
            await new Promise((r) => setTimeout(r, 2500 * retry));
          }

          if (!mountedRef.current) return;

          addLog("Verificando conexão...");
          const state = await checkState(name);

          if (state === "open") {
            clearQrRecovery();
            clearCreateAttempt();
            setConnectionStatus("connected");
            setError(null);
            addLog("✅ WhatsApp já está conectado!");
            await saveInstance(name);
            startPolling(name);
            return;
          }

          if (state === "connecting") {
            await saveInstance(name);
            addLog("⏳ Recuperando QR Code...");

            // Immediately try to get QR instead of just scheduling recovery
            const qrAttempt = await fetchQr(name);
            if (!mountedRef.current) return;

            if (qrAttempt.qrCode) {
              clearQrRecovery();
              clearCreateAttempt();
              setQrCode(qrAttempt.qrCode);
              setQrGeneratedAt(Date.now());
              setConnectionStatus("connecting");
              addLog("📱 QR Code gerado — escaneie com seu celular");
              startPolling(name);
              return;
            }

            enterPendingConnection(name, "⏳ QR Code ainda não disponível. Recuperando automaticamente...");
            return;
          }

          addLog("Gerando QR Code...");
          const qrAttempt = await fetchQr(name);

          if (qrAttempt.qrCode) {
            clearQrRecovery();
            clearCreateAttempt();
            await saveInstance(name);
            setQrCode(qrAttempt.qrCode);
            setQrGeneratedAt(Date.now());
            setConnectionStatus("connecting");
            addLog("📱 QR Code gerado — escaneie com seu celular");
            startPolling(name);
            return;
          }

          if (qrAttempt.timedOut) {
            await saveInstance(name);
            enterPendingConnection(name, "⏳ Servidor lento. O QR Code aparecerá automaticamente quando estiver pronto.");
            return;
          }

          if (hasRecentCreateAttempt()) {
            await saveInstance(name);
            enterPendingConnection(name, "⏳ A instância ainda está inicializando. Continuando recuperação automática do QR Code...");
            return;
          }

          if (!qrAttempt.shouldCreate) {
            if (retry < MAX_RETRIES) {
              addLog("⏳ O serviço de conexão ainda está processando. Tentando recuperar o QR Code...");
              continue;
            }

            await saveInstance(name);
            enterPendingConnection(name, "⏳ A conexão foi iniciada, mas o QR ainda não chegou. Continuando recuperação automática...");
            return;
          }

          // Safety: verify instance doesn't exist on server before creating
          let instanceExists = false;
          try {
            const instances = await withTimeout(fetchInstances(), 10000);
            instanceExists = instances?.some((i) => i.instance?.instanceName === name) ?? false;
          } catch { /* assume doesn't exist */ }

          if (instanceExists) {
            addLog("⏳ Instância já existe no servidor. Tentando conectar...");
            await saveInstance(name);
            enterPendingConnection(name, "⏳ Recuperando QR Code da instância existente...");
            return;
          }

          addLog("Criando instância...");
          markCreateAttempt();
          try {
            const response = await withTimeout(createInstance(name), 35000);
            const qr = response?.qrcode?.base64 || null;

            if (qr) {
              clearQrRecovery();
              clearCreateAttempt();
              await saveInstance(name);
              setQrCode(qr);
              setQrGeneratedAt(Date.now());
              setConnectionStatus("connecting");
              addLog("📱 QR Code gerado — escaneie com seu celular");
              startPolling(name);
              return;
            }

            await saveInstance(name);
            enterPendingConnection(
              name,
              response?.timeout
                ? "⏳ Instância em criação. Aguardando QR Code do servidor..."
                : "⏳ Instância criada. Recuperando QR Code...",
            );
            return;
          } catch (createErr) {
            const msg = sanitize(createErr instanceof Error ? createErr.message : "Erro ao criar instância");

            if (msg.includes("already") || msg.includes("403")) {
              markCreateAttempt();
              await saveInstance(name);
              enterPendingConnection(name, "⏳ Instância já existente. Recuperando QR Code...");
              return;
            }

            if (retry < MAX_RETRIES) {
              addLog("⏳ " + msg + " — tentando novamente...");
              continue;
            }

            setConnectionStatus("disconnected");
            setError(msg);
            addLog("❌ " + msg);
            return;
          }
        } catch (err) {
          const msg = sanitize(err instanceof Error ? err.message : "Erro ao conectar");

          if (retry < MAX_RETRIES) {
            addLog("⏳ " + msg + " — tentando novamente...");
            continue;
          }

          setConnectionStatus("disconnected");
          setError(msg);
          addLog("❌ " + msg);
          break;
        }
      }
    } finally {
      lockRef.current = false;
      setIsLoading(false);
    }
  }, [consultantId, addLog, checkState, clearCreateAttempt, clearQrRecovery, enterPendingConnection, fetchQr, hasRecentCreateAttempt, markCreateAttempt, saveInstance, startPolling]);

  /* ── Refresh QR ── */
  const refreshQr = useCallback(async () => {
    const name = instanceName || getFixedInstanceName(consultantId);
    addLog("📱 Renovando QR Code...");

    const result = await fetchQr(name);

    if (result.qrCode) {
      clearQrRecovery();
      setQrCode(result.qrCode);
      setQrGeneratedAt(Date.now());
      setConnectionStatus("connecting");
      setError(null);
      addLog("📱 Novo QR Code gerado");
      return;
    }

    if (result.timedOut || !result.shouldCreate) {
      enterPendingConnection(name, "⏳ O servidor está lento. Continuando recuperação automática do QR Code...");
      return;
    }

    addLog("⚠️ Não foi possível renovar o QR Code");
  }, [instanceName, consultantId, addLog, clearQrRecovery, enterPendingConnection, fetchQr]);

  /* ── Disconnect ── */
  const disconnect = useCallback(async () => {
    const name = instanceName || getFixedInstanceName(consultantId);
    setIsLoading(true);
    clearPolling();
    clearQrRecovery();

    try {
      try { await withTimeout(logoutInstance(name), 15000); } catch { /* ok */ }
      await deleteInstanceDb();
      clearCreateAttempt();

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
  }, [instanceName, consultantId, clearCreateAttempt, clearPolling, clearQrRecovery, addLog, deleteInstanceDb]);

  const reconnect = useCallback(() => createAndConnect(), [createAndConnect]);

  /* ── On mount: silently check if already connected ── */
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
          clearCreateAttempt();
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
          setError(null);
          addLog("⏳ Recuperando QR Code...");

          // Immediately try to fetch QR instead of waiting
          const qrAttempt = await fetchQr(name);
          if (cancelled) return;

          if (qrAttempt.qrCode) {
            await saveInstance(name);
            setQrCode(qrAttempt.qrCode);
            setQrGeneratedAt(Date.now());
            setConnectionStatus("connecting");
            addLog("📱 QR Code gerado — escaneie com seu celular");
            startPolling(name);
            setIsLoading(false);
            return;
          }

          // QR not ready yet, start polling + recovery
          startPolling(name);
          scheduleQrRecovery(name);
          setIsLoading(false);
          return;
        }
      } catch (err) {
        logger.warn("Falha ao verificar estado inicial", err);
      }

      if (cancelled) return;

      // Don't auto-create instance on mount — just show "Conectar" button
      setConnectionStatus("disconnected");
      setError(null);
      setIsLoading(false);
    }

    init();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      clearPolling();
      clearQrRecovery();
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
