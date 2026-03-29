import { useState, useEffect, useCallback, useRef } from "react";
import {
  findMessages,
  sendTextMessage,
  markAsRead,
  type EvolutionMessage,
} from "@/services/evolutionApi";

export interface ChatMessage {
  id: string;
  fromMe: boolean;
  text: string;
  timestamp: number;
  status?: number;
  mediaType?: "image" | "audio" | "video" | "document" | "sticker";
  mediaUrl?: string;
  mediaCaption?: string;
  fileName?: string;
}

function mapMessage(msg: EvolutionMessage): ChatMessage {
  const m = msg.message;
  let text = "";
  let mediaType: ChatMessage["mediaType"];
  let mediaUrl: string | undefined;
  let mediaCaption: string | undefined;
  let fileName: string | undefined;

  if (m?.conversation) {
    text = m.conversation;
  } else if (m?.extendedTextMessage?.text) {
    text = m.extendedTextMessage.text;
  } else if (m?.imageMessage) {
    mediaType = "image";
    mediaUrl = m.imageMessage.url;
    mediaCaption = m.imageMessage.caption;
    text = m.imageMessage.caption || "📷 Imagem";
  } else if (m?.videoMessage) {
    mediaType = "video";
    mediaUrl = m.videoMessage.url;
    mediaCaption = m.videoMessage.caption;
    text = m.videoMessage.caption || "🎥 Vídeo";
  } else if (m?.audioMessage) {
    mediaType = "audio";
    mediaUrl = m.audioMessage.url;
    text = "🎵 Áudio";
  } else if (m?.documentMessage) {
    mediaType = "document";
    mediaUrl = m.documentMessage.url;
    fileName = m.documentMessage.fileName;
    text = m.documentMessage.fileName || "📄 Documento";
  } else if (m?.stickerMessage) {
    mediaType = "sticker";
    mediaUrl = m.stickerMessage.url;
    text = "🏷️ Sticker";
  }

  return {
    id: msg.key.id,
    fromMe: msg.key.fromMe,
    text,
    timestamp: msg.messageTimestamp || 0,
    status: msg.status,
    mediaType,
    mediaUrl,
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

      // Mark as read
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

  const sendMessage = useCallback(
    async (text: string) => {
      if (!instanceName || !remoteJid) return;
      const phone = remoteJid.split("@")[0];
      await sendTextMessage(instanceName, phone, text);
      // Optimistic add
      setMessages((prev) => [
        ...prev,
        {
          id: `temp-${Date.now()}`,
          fromMe: true,
          text,
          timestamp: Math.floor(Date.now() / 1000),
          status: 1,
        },
      ]);
    },
    [instanceName, remoteJid]
  );

  return { messages, isLoading, sendMessage, refetch: fetchMessages };
}
