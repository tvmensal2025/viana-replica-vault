import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  createInstance,
  connectInstance,
  getConnectionState,
  deleteInstance,
  fetchInstances,
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

export function useWhatsApp(consultantId: string): UseWhatsAppReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionLog, setConnectionLog] = useState<string[]>([]);
  const { toast } = useToast();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatusRef = useRef<ConnectionStatus>("disconnected");

  const addLog = useCallback((msg: string) => {
    setConnectionLog((prev) => [...prev.slice(-9), logEntry(sanitizeVisibleMessage(msg))]);
  }, []);

  const fetchConsultantIdentity = useCallback(async () => {
    const { data } = await supabase
      .from("consultants")
      .select("name, phone")
      .eq("id", consultantId)
      .maybeSingle();

    return {
      name: data?.name || null,
      phone: data?.phone || null,
    };
  }, [consultantId]);

  const clearPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const pollConnectionState = useCallback(
    async (name: string) => {
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
            toast({
              title: "Conexão perdida",
              description: "A conexão com o WhatsApp foi encerrada.",
              variant: "destructive",
            });
            addLog("❌ Conexão perdida");
          }
          setConnectionStatus("disconnected");
          setQrCode(null);
        }
      } catch {
        // Instance may not exist anymore on Evolution API — don't crash
      }
    },
    [toast, addLog]
  );

  const startPolling = useCallback(
    (name: string) => {
      clearPolling();
      const getInterval = () =>
        prevStatusRef.current === "connecting" ? 5000 : 30000;

      intervalRef.current = setInterval(() => {
        pollConnectionState(name);
      }, getInterval());
    },
    [clearPolling, pollConnectionState]
  );

  // Update prevStatusRef and restart polling when status changes
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

  const createAndConnect = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setConnectionLog([]);
    setQrCode(null);
    setConnectionStatus("disconnected");

    addLog("Iniciando nova conexão...");

    try {
      const identity = await fetchConsultantIdentity();

      // Clean ALL ghost instances from the server (not just DB records)
      addLog("Verificando instâncias existentes no servidor...");
      try {
        const allInstances = await fetchInstances();
        const igreenInstances = (allInstances || []).filter(
          (i) => i.instance?.instanceName?.startsWith("igreen-")
        );
        if (igreenInstances.length > 0) {
          addLog(`Removendo ${igreenInstances.length} instância(s) anterior(es)...`);
          for (const inst of igreenInstances) {
            try {
              await deleteInstance(inst.instance.instanceName);
            } catch {
              // ignore individual delete failures
            }
          }
          addLog("✅ Instâncias anteriores removidas");
        }
      } catch {
        addLog("⚠️ Não foi possível listar instâncias do servidor");
      }

      // Also clean local DB records
      await supabase
        .from("whatsapp_instances")
        .delete()
        .eq("consultant_id", consultantId);

      let name = buildInstanceName(identity.name, identity.phone, consultantId);
      addLog("Criando nova instância...");

      let response = await createInstance(name).catch(async (createErr) => {
        const createMsg = createErr instanceof Error ? createErr.message : "";
        if (!isAlreadyInUseError(createMsg)) throw createErr;

        addLog("⚠️ Nome em uso, gerando nova instância...");
        await delay(700);
        name = buildInstanceName(identity.name, identity.phone, consultantId);
        return createInstance(name);
      });

      addLog("✅ Instância criada com sucesso");

      await supabase
        .from("whatsapp_instances")
        .insert({ consultant_id: consultantId, instance_name: name });

      setInstanceName(name);

      const qr = response?.qrcode?.base64 || response?.qrcode?.pairingCode || null;
      if (qr) {
        setQrCode(qr);
        setConnectionStatus("connecting");
        addLog("📱 QR Code gerado — escaneie com seu celular");
      } else {
        addLog("Gerando QR Code...");
        try {
          const state = await getConnectionState(name);
          if (state.state === "open") {
            setConnectionStatus("connected");
            setQrCode(null);
            addLog("✅ WhatsApp já estava conectado!");
          } else {
            const connectResponse = await connectInstance(name);
            setQrCode(connectResponse?.base64 || null);
            setConnectionStatus("connecting");
            addLog("📱 QR Code gerado — escaneie com seu celular");
          }
        } catch (connectErr) {
          const connectMsg = connectErr instanceof Error ? connectErr.message : "";
          setConnectionStatus("disconnected");
          setError(
            isWorkerLimitError(connectMsg)
              ? "Serviço temporariamente ocupado. Tente novamente em alguns segundos."
              : "Não foi possível gerar o QR Code. Tente novamente."
          );
          addLog("❌ Falha ao obter QR Code");
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";

      if (isAlreadyInUseError(message)) {
        addLog("⚠️ Não foi possível criar uma instância exclusiva agora");
        setError("Não foi possível criar uma nova conexão agora. Tente novamente.");
      } else {
        if (isWorkerLimitError(message)) {
          addLog("⚠️ Serviço de conexão sobrecarregado. Tente novamente em alguns segundos");
          setError("Serviço de conexão sobrecarregado. Tente novamente em alguns segundos.");
        } else {
          const safeMessage = sanitizeVisibleMessage(message || "Erro ao criar conexão WhatsApp");
          addLog("❌ Erro: " + safeMessage);
          setError(safeMessage || "Erro ao criar conexão WhatsApp");
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [consultantId, addLog, fetchConsultantIdentity]);

  const disconnect = useCallback(async () => {
    if (!instanceName) return;
    setIsLoading(true);
    setError(null);
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
        err instanceof Error ? err.message : "Erro ao desconectar WhatsApp"
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

  // On mount: check for existing instance in Supabase
  useEffect(() => {
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
        addLog("Instância encontrada: " + data.instance_name);

        try {
          addLog("Verificando estado da conexão...");
          const state = await getConnectionState(data.instance_name);
          if (state.state === "open") {
            setConnectionStatus("connected");
            addLog("✅ WhatsApp conectado");
          } else {
            setConnectionStatus("disconnected");
            addLog("WhatsApp desconectado (estado: " + state.state + ")");
          }
        } catch {
          // Instance doesn't exist on remote service — clean up local record
          addLog("⚠️ Instância não encontrada no serviço — limpando registro local");
          await supabase
            .from("whatsapp_instances")
            .delete()
            .eq("consultant_id", consultantId);
          setInstanceName(null);
        }
      } catch {
        addLog("Erro ao verificar instância");
      } finally {
        setIsLoading(false);
      }
    }

    checkExistingInstance();
  }, [consultantId, addLog]);

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
