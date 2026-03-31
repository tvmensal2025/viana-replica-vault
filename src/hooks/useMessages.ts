import { useState, useEffect, useCallback, useRef } from "react";
import {
  findMessages,
  sendTextMessage,
  markAsRead,
  getBase64FromMediaMessage,
  type EvolutionMessage,
} from "@/services/evolutionApi";
import { createLogger } from "@/lib/logger";

const logger = createLogger("useMessages");

export interface ChatMessage {
  id: string;
  remoteJid: string;
  remoteJidAlt?: string;
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
    remoteJidAlt: msg.key.remoteJidAlt,
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

export function useMessages(
  instanceName: string | null,
  remoteJid: string | null,
  preferredSendTargetJid: string | null = null
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [resolvedSendTargetJid, setResolvedSendTargetJid] = useState<string | null>(
    preferredSendTargetJid
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setResolvedSendTargetJid(preferredSendTargetJid || null);
  }, [preferredSendTargetJid, remoteJid]);

  const fetchMessages = useCallback(async () => {
    if (!instanceName || !remoteJid) return;
    try {
      setIsLoading((prev) => (!prev ? true : prev));
      const raw = await findMessages(instanceName, remoteJid, 100);
      const mapped = (Array.isArray(raw) ? raw : [])
        .map(mapMessage)
        .sort((a, b) => a.timestamp - b.timestamp);
      setMessages(mapped);

      const fallbackSendTarget = raw.find((msg) => msg.key.remoteJidAlt)?.key.remoteJidAlt;
      if (fallbackSendTarget) {
        setResolvedSendTargetJid((prev) => prev || fallbackSendTarget);
      }

      const lastIncoming = [...mapped].reverse().find((m) => !m.fromMe);
      if (lastIncoming) {
        try {
          await markAsRead(instanceName, remoteJid, lastIncoming.id, false);
        } catch {
          // ignore
        }
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

  const resolveSendTargetJid = useCallback(async () => {
    const initialTarget = resolvedSendTargetJid || preferredSendTargetJid || remoteJid;
    if (!initialTarget) return null;

    // Already usable (real number jid or plain number)
    if (!initialTarget.endsWith("@lid")) {
      return initialTarget;
    }

    // Try from already loaded messages first
    const altFromState = messages.find((m) => m.remoteJidAlt?.endsWith("@s.whatsapp.net"))?.remoteJidAlt;
    if (altFromState) {
      setResolvedSendTargetJid(altFromState);
      return altFromState;
    }

    // Last fallback: query latest messages to find remoteJidAlt before sending
    if (instanceName && remoteJid) {
      try {
        const latest = await findMessages(instanceName, remoteJid, 20);
        const altFromLatest = latest.find((m) => m.key.remoteJidAlt?.endsWith("@s.whatsapp.net"))?.key.remoteJidAlt;
        if (altFromLatest) {
          setResolvedSendTargetJid(altFromLatest);
          return altFromLatest;
        }
      } catch {
        // ignore and return initial target
      }
    }

    return initialTarget;
  }, [instanceName, messages, preferredSendTargetJid, remoteJid, resolvedSendTargetJid]);

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
        logger.error("sendMessage: missing instanceName or remoteJid", { instanceName, remoteJid });
        return;
      }

      const targetJid = await resolveSendTargetJid();
      if (!targetJid) {
        throw new Error("Destinatário inválido para envio");
      }

      // sendText expects number for normal chats; for @lid fallback we try raw jid
      const recipient = targetJid.endsWith("@s.whatsapp.net")
        ? targetJid.split("@")[0]
        : targetJid;

      logger.debug(
        "sending to:",
        recipient,
        "targetJid:",
        targetJid,
        "instance:",
        instanceName,
        "text:",
        text.slice(0, 50)
      );

      try {
        await sendTextMessage(instanceName, recipient, text);
        logger.debug("message sent successfully");
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
        logger.error("sendMessage error:", err);
        throw err;
      }
    },
    [instanceName, remoteJid, resolveSendTargetJid]
  );

  return { messages, isLoading, sendMessage, loadMedia, refetch: fetchMessages };
}
