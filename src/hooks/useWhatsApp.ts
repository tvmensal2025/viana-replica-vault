import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  createInstance,
  connectInstance,
  getConnectionState,
  logoutInstance,
  deleteInstance,
  setInstanceWebhook,
  fetchInstances,
  EvolutionAuthError,
} from "@/services/evolutionApi";
import type { ConnectionStatus } from "@/types/whatsapp";

// ─── Operational health states ───
export type OperationalHealth = "healthy" | "degraded" | "recovering" | "needs_qr" | "reset_recommended" | "resetting";

interface UseWhatsAppReturn {
  connectionStatus: ConnectionStatus;
  instanceName: string | null;
  qrCode: string | null;
  qrGeneratedAt: number | null;
  phoneNumber: string | null;
  isLoading: boolean;
  error: string | null;
  connectionLog: string[];
  operationalHealth: OperationalHealth;
  consecutiveTimeouts: number;
  createAndConnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
  refreshQr: () => Promise<void>;
  safeReset: () => Promise<void>;
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

function isAuthError(err: unknown): err is EvolutionAuthError {
  return err instanceof EvolutionAuthError;
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

// ─── Diagnostic response parsing ───
interface DiagnosticInfo {
  reason?: string;
  recommendation?: string;
  retryAfterMs?: number;
  message?: string;
}

function extractDiagnostic(result: Record<string, unknown>): DiagnosticInfo | null {
  if (result?.diagnostic && typeof result.diagnostic === "object") {
    return result.diagnostic as DiagnosticInfo;
  }
  return null;
}

function isTimeoutResponse(result: Record<string, unknown>): boolean {
  return result?.timeout === true;
}

function isMissingState(result: Record<string, unknown>): boolean {
  return (result?.state === "missing") ||
    (result?.diagnostic && (result.diagnostic as DiagnosticInfo).reason === "instance_not_found");
}

/* ── Core ── */

type ConnectionCheckState = "open" | "close" | "connecting" | "unknown" | "missing";

const REL_LOGIN_MESSAGE = "Sessão expirada. Faça login novamente.";

// Circuit breaker constants
const MAX_CONSECUTIVE_TIMEOUTS = 5;
const MAX_RECOVERY_CYCLES_WITHOUT_SIGNAL = 3;
const DEGRADED_POLL_INTERVAL = 30000;
const HEALTHY_POLL_INTERVAL = 60000;

export function useWhatsApp(consultantId: string): UseWhatsAppReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrGeneratedAt, setQrGeneratedAt] = useState<number | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionLog, setConnectionLog] = useState<string[]>([]);
  const [operationalHealth, setOperationalHealth] = useState<OperationalHealth>("healthy");
  const [consecutiveTimeouts, setConsecutiveTimeouts] = useState(0);

  const mountedRef = useRef(true);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockRef = useRef(false);
  const graceCountRef = useRef(0);
  const instanceSavedRef = useRef(false);
  const statusRef = useRef<ConnectionStatus>("disconnected");
  const timeoutCountRef = useRef(0);
  const healthRef = useRef<OperationalHealth>("healthy");
  const recoveryCyclesRef = useRef(0);

  const setStatus = useCallback((status: ConnectionStatus) => {
    statusRef.current = status;
    setConnectionStatus(status);
  }, []);

  const setHealth = useCallback((health: OperationalHealth) => {
    healthRef.current = health;
    setOperationalHealth(health);
  }, []);

  const addLog = useCallback((msg: string) => {
    setConnectionLog((prev) => [...prev.slice(-14), logEntry(sanitize(msg))]);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  }, []);

  const resetTimeoutCounter = useCallback(() => {
    timeoutCountRef.current = 0;
    setConsecutiveTimeouts(0);
    if (healthRef.current === "degraded") {
      setHealth("healthy");
    }
  }, [setHealth]);

  const resetRecoveryCounter = useCallback(() => {
    recoveryCyclesRef.current = 0;
  }, []);

  const haltRecovery = useCallback((message: string) => {
    stopPolling();
    graceCountRef.current = 0;
    recoveryCyclesRef.current = 0;
    setStatus("disconnected");
    setQrCode(null);
    setQrGeneratedAt(null);
    setError(null);

    const nextHealth: OperationalHealth = timeoutCountRef.current >= MAX_CONSECUTIVE_TIMEOUTS
      ? "reset_recommended"
      : "degraded";

    setHealth(nextHealth);
    addLog(message);

    if (nextHealth === "reset_recommended") {
      addLog("🛡️ Recuperação automática pausada para evitar loop. Use Resetar Conexão.");
    }
  }, [addLog, setHealth, setStatus, stopPolling]);

  const incrementTimeoutCounter = useCallback(() => {
    timeoutCountRef.current++;
    setConsecutiveTimeouts(timeoutCountRef.current);

    if (timeoutCountRef.current >= MAX_CONSECUTIVE_TIMEOUTS) {
      setHealth("reset_recommended");
      addLog("⚠️ Servidor não responde há várias tentativas. Recomendamos resetar a conexão.");
    } else if (timeoutCountRef.current >= 2) {
      setHealth("degraded");
    }
  }, [addLog, setHealth]);

  const handleAuthFailure = useCallback((err: EvolutionAuthError) => {
    stopPolling();
    setQrCode(null);
    setQrGeneratedAt(null);
    setStatus("disconnected");

    if (err.requiresRelogin) {
      setError(REL_LOGIN_MESSAGE);
      addLog("⚠️ Sessão expirada. Faça login novamente.");
      return;
    }

    setError("Autenticando novamente...");
    addLog("🔄 Atualizando autenticação...");
  }, [addLog, setStatus, stopPolling]);

  /* ── DB helpers ── */
  const saveInstance = useCallback(async (name: string) => {
    await supabase
      .from("whatsapp_instances")
      .upsert({ consultant_id: consultantId, instance_name: name }, { onConflict: "consultant_id" });
  }, [consultantId]);

  const fetchAndSaveConnectedPhone = useCallback(async (name: string) => {
    try {
      const instances = await fetchInstances();
      const inst = instances?.find((i) => i?.instance?.instanceName === name);
      const ownerJid = (inst as any)?.instance?.owner || (inst as any)?.owner || "";
      const phone = ownerJid.replace(/@.*$/, "");
      if (phone) {
        await supabase
          .from("whatsapp_instances")
          .update({ connected_phone: phone } as any)
          .eq("consultant_id", consultantId);
      }
    } catch {
      // Non-critical
    }
  }, [consultantId]);

  const deleteInstanceDb = useCallback(async () => {
    await supabase.from("whatsapp_instances").delete().eq("consultant_id", consultantId);
  }, [consultantId]);

  const markConnected = useCallback(async (name: string, message?: string) => {
    graceCountRef.current = 0;
    resetTimeoutCounter();
    resetRecoveryCounter();

    if (statusRef.current !== "connected" && message) {
      addLog(message);
    }

    setQrCode(null);
    setQrGeneratedAt(null);
    setError(null);
    setStatus("connected");
    setHealth("healthy");

    if (!instanceSavedRef.current) {
      try {
        await saveInstance(name);
        instanceSavedRef.current = true;
        // Ensure webhook is configured for this instance
        setInstanceWebhook(name).catch(() => {/* non-critical */});
      } catch {
        // Non-critical persistence failure
      }
    }
    // Always try to fetch and save the connected phone number
    fetchAndSaveConnectedPhone(name).catch(() => {/* non-critical */});
  }, [addLog, resetRecoveryCounter, resetTimeoutCounter, saveInstance, setHealth, setStatus]);

  /* ── Check state with diagnostic parsing ── */
  const checkState = useCallback(async (name: string): Promise<ConnectionCheckState> => {
    try {
      const result = await withTimeout(getConnectionState(name), 15000) as Record<string, unknown>;
      if (!result) return "unknown";

      // Check for diagnostic info from proxy
      if (isMissingState(result)) {
        return "missing";
      }

      if (isTimeoutResponse(result)) {
        incrementTimeoutCounter();
        const diagnostic = extractDiagnostic(result);
        if (diagnostic?.reason === "instance_not_found") return "missing";
        return "unknown";
      }

      // Normal response
      resetTimeoutCounter();
      const state: string = (result as { state?: string })?.state ||
        ((result as { instance?: { state?: string } })?.instance?.state) || "close";
      if (state === "open") return "open";
      if (state === "connecting") return "connecting";
      if (state === "close") return "close";
      return "unknown";
    } catch (err) {
      if (isAuthError(err)) throw err;
      const msg = err instanceof Error ? err.message : "";
      if (isNotFoundError(msg)) return "missing";
      if (msg === "timeout") {
        incrementTimeoutCounter();
      }
      return "unknown";
    }
  }, [incrementTimeoutCounter, resetTimeoutCounter]);

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

  /* ── Try to get QR code (Level 1 recovery: light) ── */
  const tryGetQr = useCallback(async (
    name: string
  ): Promise<{ qr: string | null; alreadyConnected: boolean }> => {
    try {
      setHealth("recovering");
      const resp = await withTimeout(connectInstance(name), 15000);
      resetTimeoutCounter();
      return { qr: resp?.base64 || null, alreadyConnected: false };
    } catch (err) {
      if (isAuthError(err)) throw err;

      const msg = sanitize(err instanceof Error ? err.message : "");

      if (isAlreadyConnectedError(msg)) {
        resetTimeoutCounter();
        return { qr: null, alreadyConnected: true };
      }

      const confirmedOpen = await confirmConnectedState(name, 2, 1000);
      return { qr: null, alreadyConnected: confirmedOpen };
    }
  }, [confirmConnectedState, resetTimeoutCounter, setHealth]);

  /* ── Level 2 recovery: multi-signal diagnosis ── */
  const multiSignalCheck = useCallback(async (name: string): Promise<ConnectionCheckState> => {
    // First try connectionState
    const state1 = await checkState(name);
    if (state1 === "open" || state1 === "missing") return state1;

    // If unknown/timeout, try connectInstance as second signal
    if (state1 === "unknown" && timeoutCountRef.current >= 2) {
      addLog("🔍 Verificando por sinal alternativo...");
      try {
        const resp = await withTimeout(connectInstance(name), 12000);
        if (resp?.base64) {
          return "connecting"; // Instance exists, needs QR
        }
        // If connectInstance also times out / fails, truly degraded
        return "unknown";
      } catch (err) {
        if (isAuthError(err)) throw err;
        const msg = err instanceof Error ? err.message : "";
        if (isAlreadyConnectedError(msg)) return "open";
        if (isNotFoundError(msg)) return "missing";
        return "unknown";
      }
    }

    return state1;
  }, [addLog, checkState]);

  /* ── Unified polling loop with circuit breaker ── */
  const startPolling = useCallback((name: string) => {
    stopPolling();

    const poll = async () => {
      if (!mountedRef.current) return;

      // Circuit breaker: if too many timeouts, slow down polling
      if (timeoutCountRef.current >= MAX_CONSECUTIVE_TIMEOUTS) {
        if (healthRef.current !== "reset_recommended") {
          setHealth("reset_recommended");
          addLog("⚠️ Servidor instável. Recomendamos resetar a conexão.");
        }
        pollRef.current = setTimeout(poll, DEGRADED_POLL_INTERVAL);
        return;
      }

      try {
        const schedulePendingRecovery = (nextPollMs: number, message: string) => {
          recoveryCyclesRef.current += 1;

          if (recoveryCyclesRef.current >= MAX_RECOVERY_CYCLES_WITHOUT_SIGNAL) {
            haltRecovery("⚠️ Não foi possível recuperar a conexão automaticamente. Use Reconectar ou Resetar Conexão.");
            return false;
          }

          addLog(message);
          pollRef.current = setTimeout(poll, nextPollMs);
          return true;
        };

        // Use multi-signal check when degraded
        const state = timeoutCountRef.current >= 2
          ? await multiSignalCheck(name)
          : await checkState(name);

        if (!mountedRef.current) return;

        if (state === "open") {
          await markConnected(name, "✅ WhatsApp conectado!");
          pollRef.current = setTimeout(poll, HEALTHY_POLL_INTERVAL);
          return;
        }

        if (state === "missing") {
          graceCountRef.current = 0;
          resetRecoveryCounter();
          setStatus("disconnected");
          setQrCode(null);
          setQrGeneratedAt(null);
          setError(null);
          setHealth("needs_qr");
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
              setHealth("degraded");
            }
            graceCountRef.current++;
            const pollInterval = timeoutCountRef.current >= 2 ? 15000 : 10000;
            pollRef.current = setTimeout(poll, pollInterval);
            return;
          }

          setStatus("connecting");
          setHealth("recovering");
          const qrAttempt = await tryGetQr(name);
          const recoveredConnection = qrAttempt.alreadyConnected || (
            !qrAttempt.qr && await confirmConnectedState(name, 2, 1000)
          );
          if (!mountedRef.current) return;

          if (recoveredConnection) {
            await markConnected(name, "✅ WhatsApp conectado!");
            pollRef.current = setTimeout(poll, HEALTHY_POLL_INTERVAL);
            return;
          }

          if (qrAttempt.qr) {
            resetRecoveryCounter();
            setQrCode(qrAttempt.qr);
            setQrGeneratedAt(Date.now());
            setError(null);
            setHealth("needs_qr");
            addLog("📱 QR Code gerado — escaneie com seu celular");
            pollRef.current = setTimeout(poll, 10000);
            return;
          }

          if (!schedulePendingRecovery(10000, "⏳ Ainda aguardando um sinal confiável do servidor...")) {
            return;
          }
          return;
        }

        if (statusRef.current === "connected" && graceCountRef.current < 3) {
          if (graceCountRef.current === 0) {
            addLog("🔄 Tentando recuperar a sessão do WhatsApp...");
            setHealth("recovering");
          }
          graceCountRef.current++;
          pollRef.current = setTimeout(poll, 8000);
          return;
        }

        graceCountRef.current = 0;
        setStatus("connecting");
        setHealth("recovering");
        const qrAttempt = await tryGetQr(name);
        const recoveredConnection = qrAttempt.alreadyConnected || (
          !qrAttempt.qr && await confirmConnectedState(name, 2, 1000)
        );
        if (!mountedRef.current) return;

        if (recoveredConnection) {
          await markConnected(name, "✅ WhatsApp conectado!");
          pollRef.current = setTimeout(poll, HEALTHY_POLL_INTERVAL);
          return;
        }

        if (qrAttempt.qr) {
          resetRecoveryCounter();
          setQrCode(qrAttempt.qr);
          setQrGeneratedAt(Date.now());
          setError(null);
          setHealth("needs_qr");
          addLog("📱 QR Code gerado — escaneie com seu celular");
          pollRef.current = setTimeout(poll, 8000);
          return;
        }

        if (!schedulePendingRecovery(8000, "⏳ Conexão ainda sem resposta estável. Nova tentativa em instantes...")) {
          return;
        }
      } catch (err) {
        if (isAuthError(err)) {
          handleAuthFailure(err);
          return;
        }

        pollRef.current = setTimeout(poll, 10000);
      }
    };

    void poll();
  }, [addLog, checkState, confirmConnectedState, handleAuthFailure, haltRecovery, markConnected, multiSignalCheck, resetRecoveryCounter, setHealth, setStatus, stopPolling, tryGetQr]);

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
    resetRecoveryCounter();
    timeoutCountRef.current = 0;
    setConsecutiveTimeouts(0);
    setHealth("healthy");
    stopPolling();

    const name = getFixedInstanceName(consultantId);
    setInstanceName(name);

    try {
      addLog("Verificando conexão...");
      const state = await checkState(name);
      if (!mountedRef.current) return;

      if (state === "open") {
        await markConnected(name, "✅ WhatsApp já está conectado!");
        startPolling(name);
        return;
      }

      if (state === "connecting" || state === "close") {
        addLog("⏳ Recuperando QR Code...");
        setHealth("recovering");
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
          resetRecoveryCounter();
          await saveInstance(name);
          instanceSavedRef.current = true;
          setQrCode(qrAttempt.qr);
          setQrGeneratedAt(Date.now());
          setStatus("connecting");
          setHealth("needs_qr");
          addLog("📱 QR Code gerado — escaneie com seu celular");
          startPolling(name);
          return;
        }

        await saveInstance(name);
        instanceSavedRef.current = true;
        setStatus("connecting");
        addLog("⏳ Aguardando QR Code...");
        startPolling(name);
        return;
      }

      if (state === "unknown") {
        addLog("⚠️ Servidor instável. Tentando criar ou recuperar a conexão...");
        setHealth("degraded");
      }

      addLog("Criando instância...");
      try {
        const response = await withTimeout(createInstance(name), 15000);
        if (!mountedRef.current) return;

        await saveInstance(name);
        instanceSavedRef.current = true;
        const qr = response?.qrcode?.base64 || null;

        if (qr) {
          resetRecoveryCounter();
          setQrCode(qr);
          setQrGeneratedAt(Date.now());
          setStatus("connecting");
          setHealth("needs_qr");
          addLog("📱 QR Code gerado — escaneie com seu celular");
        } else {
          setStatus("connecting");
          addLog("⏳ Instância criada. Aguardando QR Code...");
        }
        startPolling(name);
      } catch (createErr) {
        if (isAuthError(createErr)) {
          handleAuthFailure(createErr);
          return;
        }

        const msg = sanitize(createErr instanceof Error ? createErr.message : "Erro");

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
          setHealth("degraded");
          addLog("⏳ Servidor instável. Tentando recuperar a instância...");
          startPolling(name);
          return;
        }

        setStatus("disconnected");
        setError(msg);
        addLog("❌ " + msg);
      }
    } catch (err) {
      if (isAuthError(err)) {
        handleAuthFailure(err);
        return;
      }

      const msg = sanitize(err instanceof Error ? err.message : "Erro ao conectar");

      if (isRecoverableConnectionError(msg)) {
        setStatus("connecting");
        setError(null);
        setHealth("degraded");
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
  }, [consultantId, addLog, checkState, confirmConnectedState, handleAuthFailure, markConnected, resetRecoveryCounter, saveInstance, setHealth, setStatus, startPolling, stopPolling, tryGetQr]);

  /* ── Refresh QR ── */
  const refreshQr = useCallback(async () => {
    const name = instanceName || getFixedInstanceName(consultantId);

    try {
      addLog("📱 Renovando QR Code...");

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
        resetRecoveryCounter();
        setQrCode(qrAttempt.qr);
        setQrGeneratedAt(Date.now());
        setStatus("connecting");
        setHealth("needs_qr");
        setError(null);
        addLog("📱 Novo QR Code gerado");
      } else {
        addLog("⏳ QR Code ainda não disponível. Tentando novamente...");
      }
    } catch (err) {
      if (isAuthError(err)) {
        handleAuthFailure(err);
        return;
      }
      console.warn("[useWhatsApp] refreshQr error:", err);
    }
  }, [instanceName, consultantId, addLog, checkState, confirmConnectedState, handleAuthFailure, markConnected, resetRecoveryCounter, setHealth, setStatus, startPolling, tryGetQr]);

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
      setHealth("healthy");
      resetRecoveryCounter();
      instanceSavedRef.current = false;
      timeoutCountRef.current = 0;
      setConsecutiveTimeouts(0);
      addLog("✅ Desconectado");
    } catch (err) {
      addLog("❌ " + sanitize(err instanceof Error ? err.message : "Erro"));
    } finally {
      setIsLoading(false);
      lockRef.current = false;
    }
  }, [instanceName, consultantId, stopPolling, addLog, deleteInstanceDb, resetRecoveryCounter, setHealth, setStatus]);

  /* ── Level 3: Safe Reset ── */
  const safeReset = useCallback(async () => {
    if (lockRef.current) return;
    lockRef.current = true;

    const name = instanceName || getFixedInstanceName(consultantId);
    setIsLoading(true);
    setHealth("resetting");
    stopPolling();

    addLog("🔄 Iniciando reset seguro da conexão...");

    try {
      // Step 1: Logout (best-effort)
      addLog("1/4 — Encerrando sessão WhatsApp...");
      try { await withTimeout(logoutInstance(name), 10000); } catch { /* ok */ }
      await sleep(2000);

      // Step 2: Delete instance on Evolution API (best-effort)
      addLog("2/4 — Removendo instância antiga...");
      try { await withTimeout(deleteInstance(name), 10000); } catch { /* ok */ }
      await sleep(2000);

      // Step 3: Clear DB record
      addLog("3/4 — Limpando registros locais...");
      await deleteInstanceDb();
      instanceSavedRef.current = false;
      resetRecoveryCounter();
      timeoutCountRef.current = 0;
      setConsecutiveTimeouts(0);

      // Step 4: Recreate
      addLog("4/4 — Criando nova instância...");
      setInstanceName(name);

      try {
        const response = await withTimeout(createInstance(name), 20000);
        await saveInstance(name);
        instanceSavedRef.current = true;

        const qr = response?.qrcode?.base64 || null;
        if (qr) {
          resetRecoveryCounter();
          setQrCode(qr);
          setQrGeneratedAt(Date.now());
          setStatus("connecting");
          setHealth("needs_qr");
          addLog("✅ Reset concluído! Escaneie o novo QR Code.");
        } else {
          setStatus("connecting");
          setHealth("recovering");
          addLog("✅ Instância recriada. Aguardando QR Code...");
        }
        setError(null);
        startPolling(name);
      } catch (createErr) {
        if (isAuthError(createErr)) {
          handleAuthFailure(createErr);
          return;
        }

        const msg = sanitize(createErr instanceof Error ? createErr.message : "Erro");

        if (msg.includes("already") || msg.includes("exists") || msg.includes("403") || msg.includes("409")) {
          await saveInstance(name);
          instanceSavedRef.current = true;
          setStatus("connecting");
          setHealth("recovering");
          addLog("⏳ Instância recuperada. Aguardando QR Code...");
          setError(null);
          startPolling(name);
          return;
        }

        setStatus("disconnected");
        setHealth("reset_recommended");
        setError("Falha ao recriar instância. Tente novamente em instantes.");
        addLog("❌ " + msg);
      }
    } catch (err) {
      if (isAuthError(err)) {
        handleAuthFailure(err);
        return;
      }
      const msg = sanitize(err instanceof Error ? err.message : "Erro no reset");
      setStatus("disconnected");
      setHealth("reset_recommended");
      setError(msg);
      addLog("❌ " + msg);
    } finally {
      lockRef.current = false;
      setIsLoading(false);
    }
  }, [instanceName, consultantId, addLog, deleteInstanceDb, handleAuthFailure, resetRecoveryCounter, saveInstance, setHealth, setStatus, startPolling, stopPolling]);

  const reconnect = useCallback(() => createAndConnect(), [createAndConnect]);

  /* ── On mount: check if already connected ── */
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function init() {
      const name = getFixedInstanceName(consultantId);
      setInstanceName(name);

      try {
        const { data: instanceRecord } = await supabase
          .from("whatsapp_instances")
          .select("id")
          .eq("consultant_id", consultantId)
          .maybeSingle();

        if (cancelled) return;

        if (!instanceRecord) {
          setStatus("disconnected");
          setError(null);
          setIsLoading(false);
          return;
        }

        const state = await withTimeout(checkState(name), 15000);
        if (cancelled) return;

        if (state === "open") {
          await markConnected(name, "✅ WhatsApp conectado!");
          startPolling(name);
          setIsLoading(false);
          return;
        }

        if (state === "connecting") {
          setStatus("connecting");
          setHealth("recovering");
          addLog("⏳ Recuperando conexão...");
          startPolling(name);
          setIsLoading(false);
          return;
        }

        // If unknown (timeout) on init, don't immediately disconnect
        // Try connectInstance as fallback signal
        if (state === "unknown") {
          addLog("⚠️ Servidor lento. Tentando recuperar...");
          setHealth("degraded");
          setStatus("connecting");
          startPolling(name);
          setIsLoading(false);
          return;
        }

        setStatus("disconnected");
        setError(null);
        setIsLoading(false);
        return;
      } catch (err) {
        if (!cancelled && isAuthError(err)) {
          handleAuthFailure(err);
          setIsLoading(false);
          return;
        }
      }

      if (cancelled) return;
      setStatus("disconnected");
      setError(null);
      setIsLoading(false);
    }

    void init();

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
    operationalHealth,
    consecutiveTimeouts,
    createAndConnect,
    disconnect,
    reconnect,
    refreshQr,
    safeReset,
  };
}
