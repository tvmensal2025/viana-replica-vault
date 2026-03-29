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
  createAndConnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
}

export function useWhatsApp(consultantId: string): UseWhatsAppReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatusRef = useRef<ConnectionStatus>("disconnected");

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
          }
        } else if (state === "close") {
          if (prevStatusRef.current === "connected") {
            toast({
              title: "Conexão perdida",
              description: "A conexão com o WhatsApp foi encerrada.",
              variant: "destructive",
            });
          }
          setConnectionStatus("disconnected");
          setQrCode(null);
        }
      } catch {
        // Instance may not exist anymore on Evolution API — don't crash
      }
    },
    [toast]
  );

  const startPolling = useCallback(
    (name: string) => {
      clearPolling();
      // Determine interval based on current status
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
      // Restart polling if interval needs to change
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
    const name = `igreen-${consultantId}`;

    // Helper: after instance exists, ensure local DB record and get QR
    const ensureLocalAndConnect = async (skipCreate?: boolean) => {
      // Upsert local record
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

      // Check if already connected
      try {
        const state = await getConnectionState(name);
        if (state.state === "open") {
          setConnectionStatus("connected");
          setQrCode(null);
          return;
        }
      } catch {
        // ignore, will try to connect below
      }

      // Get QR code
      try {
        const connectResponse = await connectInstance(name);
        setQrCode(connectResponse?.base64 || null);
        setConnectionStatus("connecting");
      } catch {
        setConnectionStatus("disconnected");
        setError("Não foi possível gerar o QR Code. Tente reconectar.");
      }
    };

    try {
      // Try creating the instance first
      const response = await createInstance(name);

      await ensureLocalAndConnect(true);

      // If create returned a QR, use it directly
      const qr = response?.qrcode?.base64 || response?.qrcode?.pairingCode || null;
      if (qr) {
        setQrCode(qr);
        setConnectionStatus("connecting");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      // Instance already exists in Evolution API — recover gracefully
      if (message.includes("already in use") || message.includes("403") || message.includes("Forbidden")) {
        try {
          await ensureLocalAndConnect();
        } catch (recoverErr) {
          const recoverMsg = recoverErr instanceof Error ? recoverErr.message : "Erro ao recuperar instância existente";
          setError(recoverMsg);
        }
      } else {
        setError(message || "Erro ao criar instância WhatsApp");
      }
    } finally {
      setIsLoading(false);
    }
  }, [consultantId]);

  const disconnect = useCallback(async () => {
    if (!instanceName) return;
    setIsLoading(true);
    setError(null);
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao desconectar WhatsApp";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [instanceName, consultantId, clearPolling]);

  const reconnect = useCallback(async () => {
    if (!instanceName) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await connectInstance(instanceName);
      setQrCode(response.base64);
      setConnectionStatus("connecting");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao reconectar WhatsApp";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [instanceName]);

  // On mount: check for existing instance in Supabase
  useEffect(() => {
    async function checkExistingInstance() {
      setIsLoading(true);
      try {
        const { data, error: dbError } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .eq("consultant_id", consultantId)
          .maybeSingle();

        if (dbError || !data) {
          setIsLoading(false);
          return;
        }

        setInstanceName(data.instance_name);

        try {
          const state = await getConnectionState(data.instance_name);
          if (state.state === "open") {
            setConnectionStatus("connected");
          } else {
            setConnectionStatus("disconnected");
          }
        } catch {
          // Instance doesn't exist on Evolution API — clean up local record
          await supabase
            .from("whatsapp_instances")
            .delete()
            .eq("consultant_id", consultantId);
          setInstanceName(null);
        }
      } catch {
        // Ignore unexpected errors on mount
      } finally {
        setIsLoading(false);
      }
    }

    checkExistingInstance();
  }, [consultantId]);

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
    createAndConnect,
    disconnect,
    reconnect,
  };
}
