import { useState, useEffect, useCallback, useRef } from "react";
import { findChats, type EvolutionChat } from "@/services/evolutionApi";

export interface ChatItem {
  remoteJid: string;
  name: string;
  lastMessage: string;
  lastMessageTimestamp: number;
  unreadCount: number;
  profilePicUrl?: string;
  isGroup: boolean;
}

function extractLastMessage(chat: EvolutionChat): string {
  const msg = chat.lastMessage?.message;
  if (!msg) return "";
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    (msg.imageMessage ? "📷 Imagem" : "") ||
    msg.documentMessage?.fileName ||
    (msg.audioMessage ? "🎵 Áudio" : "") ||
    ""
  );
}

function mapChat(chat: EvolutionChat): ChatItem {
  const jid = chat.remoteJid || chat.id;
  return {
    remoteJid: jid,
    name: chat.name || jid.split("@")[0],
    lastMessage: extractLastMessage(chat),
    lastMessageTimestamp: chat.lastMsgTimestamp || chat.lastMessage?.messageTimestamp || 0,
    unreadCount: chat.unreadMessages || 0,
    profilePicUrl: chat.profilePicUrl,
    isGroup: jid.endsWith("@g.us"),
  };
}

export function useChats(instanceName: string | null) {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchChats = useCallback(async () => {
    if (!instanceName) return;
    try {
      setIsLoading((prev) => !prev ? true : prev);
      const raw = await findChats(instanceName);
      const mapped = (raw || [])
        .map(mapChat)
        .filter((c) => !c.isGroup)
        .sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
      setChats(mapped);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar conversas");
    } finally {
      setIsLoading(false);
    }
  }, [instanceName]);

  useEffect(() => {
    fetchChats();
    if (instanceName) {
      intervalRef.current = setInterval(fetchChats, 15000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchChats, instanceName]);

  return { chats, isLoading, error, refetch: fetchChats };
}
