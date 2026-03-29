import { useState, useEffect, useCallback, useRef } from "react";
import {
  findMessages,
  sendTextMessage,
  markAsRead,
  getBase64FromMediaMessage,
  type EvolutionMessage,
} from "@/services/evolutionApi";

export interface ChatMessage {
  id: string;
  remoteJid: string;
  fromMe: boolean;
  text: string;
  timestamp: number;
  status?: number;
  mediaType?: "image" | "audio" | "video" | "document" | "sticker";
  mediaUrl?: string;
  mediaBase64?: string;
  mediaMimetype?: string;
  mediaCaption?: string;
  fileName?: string;
}

function mapMessage(msg: EvolutionMessage): ChatMessage {
  const m = msg.message;
  let text = "";
  let mediaType: ChatMessage["mediaType"];
  let mediaUrl: string | undefined;
  let mediaBase64: string | undefined;
  let mediaMimetype: string | undefined;
  let mediaCaption: string | undefined;
  let fileName: string | undefined;

  if (m?.conversation) {
    text = m.conversation;
  } else if (m?.extendedTextMessage?.text) {
    text = m.extendedTextMessage.text;
  } else if (m?.imageMessage) {
    mediaType = "image";
    mediaUrl = m.imageMessage.url;
    mediaBase64 = m.imageMessage.base64;
    mediaMimetype = m.imageMessage.mimetype || "image/jpeg";
    mediaCaption = m.imageMessage.caption;
    text = m.imageMessage.caption || "";
  } else if (m?.videoMessage) {
    mediaType = "video";
    mediaUrl = m.videoMessage.url;
    mediaBase64 = m.videoMessage.base64;
    mediaMimetype = m.videoMessage.mimetype || "video/mp4";
    mediaCaption = m.videoMessage.caption;
    text = m.videoMessage.caption || "";
  } else if (m?.audioMessage) {
    mediaType = "audio";
    mediaUrl = m.audioMessage.url;
    mediaBase64 = m.audioMessage.base64;
    mediaMimetype = m.audioMessage.mimetype || "audio/ogg; codecs=opus";
    text = "";
  } else if (m?.documentMessage) {
    mediaType = "document";
    mediaUrl = m.documentMessage.url;
    mediaBase64 = m.documentMessage.base64;
    mediaMimetype = m.documentMessage.mimetype || "application/pdf";
    fileName = m.documentMessage.fileName;
    text = m.documentMessage.fileName || "";
  } else if (m?.stickerMessage) {
    mediaType = "sticker";
    mediaUrl = m.stickerMessage.url;
    mediaBase64 = m.stickerMessage.base64;
    mediaMimetype = m.stickerMessage.mimetype || "image/webp";
    text = "";
  }

  return {
    id: msg.key.id,
    remoteJid: msg.key.remoteJid,
    fromMe: msg.key.fromMe,
    text,
    timestamp: msg.messageTimestamp || 0,
    status: msg.status,
    mediaType,
    mediaUrl,
    mediaBase64,
    mediaMimetype,
    mediaCaption,
    fileName,
  };
}

export function useMessages(instanceName: string | null, remoteJid: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!instanceName || !remoteJid) return;
    try {
      setIsLoading((prev) => (!prev ? true : prev));
      const raw = await findMessages(instanceName, remoteJid, 100);
      const mapped = (Array.isArray(raw) ? raw : [])
        .map(mapMessage)
        .sort((a, b) => a.timestamp - b.timestamp);
      setMessages(mapped);

      try {
        await markAsRead(instanceName, remoteJid);
      } catch {
        // ignore
      }
    } catch {
      // ignore polling errors
    } finally {
      setIsLoading(false);
    }
  }, [instanceName, remoteJid]);

  useEffect(() => {
    setMessages([]);
    fetchMessages();
    if (instanceName && remoteJid) {
      intervalRef.current = setInterval(fetchMessages, 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchMessages, instanceName, remoteJid]);

  // Function to load media for a specific message
  const loadMedia = useCallback(
    async (messageId: string) => {
      if (!instanceName) return null;
      const msg = messages.find((m) => m.id === messageId);
      if (!msg) return null;
      const result = await getBase64FromMediaMessage(
        instanceName,
        messageId,
        msg.remoteJid,
        msg.fromMe
      );
      if (result?.base64) {
        const mimetype = result.mimetype || msg.mediaMimetype || "application/octet-stream";
        const dataUrl = `data:${mimetype};base64,${result.base64}`;
        // Update message in state
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, mediaBase64: result.base64, mediaMimetype: mimetype, mediaUrl: dataUrl }
              : m
          )
        );
        return dataUrl;
      }
      return null;
    },
    [instanceName, messages]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!instanceName || !remoteJid) {
        console.error("[useMessages] sendMessage: missing instanceName or remoteJid", { instanceName, remoteJid });
        return;
      }
      const phone = remoteJid.split("@")[0];
      console.log("[useMessages] sending to:", phone, "instance:", instanceName, "text:", text.slice(0, 50));
      try {
        await sendTextMessage(instanceName, phone, text);
        console.log("[useMessages] message sent successfully");
        setMessages((prev) => [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            remoteJid,
            fromMe: true,
            text,
            timestamp: Math.floor(Date.now() / 1000),
            status: 1,
          },
        ]);
      } catch (err) {
        console.error("[useMessages] sendMessage error:", err);
        throw err;
      }
    },
    [instanceName, remoteJid]
  );

  return { messages, isLoading, sendMessage, loadMedia, refetch: fetchMessages };
}
