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

function logEntry(msg: string): string {
  const now = new Date();
  const ts = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `[${ts}] ${msg}`;
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
    setConnectionLog((prev) => [...prev.slice(-9), logEntry(msg)]);
  }, []);

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
    const name = `igreen-${consultantId}`;

    addLog("Iniciando conexão...");

    try {
      // Step 1: Try creating the instance
      addLog("Criando instância na Evolution API...");
      const response = await createInstance(name);
      addLog("✅ Instância criada com sucesso");

      // Upsert local record
      addLog("Salvando no banco de dados...");
      const { data: existing } = await supabase
        .from("whatsapp_instances")
        .select("id")
        .eq("consultant_id", consultantId)
        .maybeSingle();
      if (!existing) {
        await supabase.from("whatsapp_instances").insert({
          consultant_id: consultantId,
          instance_name: name,
        });
      }
      setInstanceName(name);
      addLog("✅ Banco de dados atualizado");

      // Use QR from create response
      const qr = response?.qrcode?.base64 || response?.qrcode?.pairingCode || null;
      if (qr) {
        setQrCode(qr);
        setConnectionStatus("connecting");
        addLog("📱 QR Code gerado — escaneie com seu celular");
      } else {
        // Maybe already connected, check state
        addLog("Verificando estado da conexão...");
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
        } catch {
          setConnectionStatus("disconnected");
          setError("Não foi possível gerar o QR Code. Tente reconectar.");
          addLog("❌ Falha ao obter QR Code");
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";

      // 403 "already in use" → auto-reset: delete + recreate
      if (isAlreadyInUseError(message)) {
        addLog("⚠️ Instância já existe — iniciando reset automático...");

        try {
          // Delete old instance
          addLog("Deletando instância antiga...");
          try {
            await deleteInstance(name);
            addLog("✅ Instância antiga removida");
          } catch (delErr) {
            addLog("⚠️ Falha ao deletar (pode já estar removida): " + (delErr instanceof Error ? delErr.message : ""));
          }

          // Give Evolution API a short time to fully release the name
          addLog("Aguardando liberação da instância...");
          await delay(1500);

          // Recreate
          addLog("Recriando instância...");
          const retryResponse = await createInstance(name);
          addLog("✅ Instância recriada com sucesso");

          // Upsert local DB
          const { data: existing } = await supabase
            .from("whatsapp_instances")
            .select("id")
            .eq("consultant_id", consultantId)
            .maybeSingle();
          if (!existing) {
            await supabase.from("whatsapp_instances").insert({
              consultant_id: consultantId,
              instance_name: name,
            });
          }
          setInstanceName(name);

          const qr = retryResponse?.qrcode?.base64 || retryResponse?.qrcode?.pairingCode || null;
          if (qr) {
            setQrCode(qr);
            setConnectionStatus("connecting");
            addLog("📱 QR Code gerado — escaneie com seu celular");
          } else {
            addLog("Instância recriada sem QR imediato — tentando gerar QR...");
            try {
              const connectResponse = await connectInstance(name);
              setQrCode(connectResponse?.base64 || null);
              setConnectionStatus("connecting");
              addLog("📱 QR Code gerado — escaneie com seu celular");
            } catch (connectErr) {
              const connectMsg = connectErr instanceof Error ? connectErr.message : "";
              if (isWorkerLimitError(connectMsg)) {
                setConnectionStatus("disconnected");
                setQrCode(null);
                setError("Instância recriada, mas a API está sobrecarregada. Clique em Reconectar em alguns segundos.");
                addLog("⚠️ API sobrecarregada ao gerar QR. Use Reconectar em alguns segundos.");
              } else {
                addLog("❌ Falha ao obter QR Code após reset: " + connectMsg);
                setError("Não foi possível gerar o QR Code após reset.");
              }
            }
          }
        } catch (resetErr) {
          const resetMsg = resetErr instanceof Error ? resetErr.message : "Erro ao resetar instância";
          if (isWorkerLimitError(resetMsg)) {
            setInstanceName(name);
            setConnectionStatus("disconnected");
            setError("A API do WhatsApp está sobrecarregada. Aguarde alguns segundos e clique em Reconectar.");
            addLog("⚠️ API sobrecarregada durante reset automático.");
          } else {
            addLog("❌ Falha no reset: " + resetMsg);
            setError(resetMsg);
          }
        }
      } else {
        if (isWorkerLimitError(message)) {
          addLog("⚠️ API do WhatsApp sobrecarregada. Tente novamente em alguns segundos.");
          setError("A API do WhatsApp está sobrecarregada. Tente novamente em alguns segundos.");
        } else {
          addLog("❌ Erro: " + message);
          setError(message || "Erro ao criar instância WhatsApp");
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [consultantId, addLog]);

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
      const message = err instanceof Error ? err.message : "Erro ao desconectar WhatsApp";
      addLog("❌ Erro ao desconectar: " + message);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [instanceName, consultantId, clearPolling, addLog]);

  const reconnect = useCallback(async () => {
    if (!instanceName) return;
    setIsLoading(true);
    setError(null);
    addLog("Reconectando...");
    try {
      const response = await connectInstance(instanceName);
      setQrCode(response.base64);
      setConnectionStatus("connecting");
      addLog("📱 QR Code gerado — escaneie com seu celular");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao reconectar WhatsApp";
      addLog("❌ Erro ao reconectar: " + message);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [instanceName, addLog]);

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
          addLog("Verificando estado na Evolution API...");
          const state = await getConnectionState(data.instance_name);
          if (state.state === "open") {
            setConnectionStatus("connected");
            addLog("✅ WhatsApp conectado");
          } else {
            setConnectionStatus("disconnected");
            addLog("WhatsApp desconectado (estado: " + state.state + ")");
          }
        } catch {
          // Instance doesn't exist on Evolution API — clean up local record
          addLog("⚠️ Instância não encontrada na API — limpando registro local");
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
