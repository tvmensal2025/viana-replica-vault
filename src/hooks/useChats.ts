import { useState, useEffect, useCallback, useRef } from "react";
import { findChats, findContacts, type EvolutionChat, type EvolutionContact } from "@/services/evolutionApi";

export interface ChatItem {
  remoteJid: string;
  sendTargetJid?: string;
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

function mapChat(chat: EvolutionChat, contactsMap: Map<string, EvolutionContact>): ChatItem {
  const jid = chat.remoteJid || chat.id;
  const contact = contactsMap.get(jid);

  // Extract the real phone number from remoteJidAlt (e.g. "5511973125846@s.whatsapp.net" → "5511973125846")
  const altJid = chat.lastMessage?.key?.remoteJidAlt || chat.lastMessage?.key?.participantAlt;
  const realPhone = altJid ? altJid.split("@")[0] : null;

  // Priority: chat pushName > lastMessage pushName > contact pushName > chat name > real phone > lid number
  const rawJidNumber = jid.split("@")[0];
  const displayName =
    chat.pushName ||
    chat.lastMessage?.pushName ||
    contact?.pushName ||
    chat.name ||
    realPhone ||
    rawJidNumber;

  const sendTargetJid =
    altJid ||
    (jid.endsWith("@lid") ? undefined : jid);

  return {
    remoteJid: jid,
    sendTargetJid,
    name: displayName,
    lastMessage: extractLastMessage(chat),
    lastMessageTimestamp: chat.lastMsgTimestamp || chat.lastMessage?.messageTimestamp || 0,
    unreadCount: chat.unreadMessages || chat.unreadCount || 0,
    profilePicUrl: contact?.profilePicUrl || chat.profilePicUrl,
    isGroup: jid.endsWith("@g.us"),
  };
}

export function useChats(instanceName: string | null) {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contactsMapRef = useRef<Map<string, EvolutionContact>>(new Map());

  const fetchContacts = useCallback(async () => {
    if (!instanceName) return;
    try {
      const contacts = await findContacts(instanceName);
      const map = new Map<string, EvolutionContact>();
      (contacts || []).forEach((c) => {
        const jid = c.remoteJid || c.id;
        if (jid) map.set(jid, c);
      });
      contactsMapRef.current = map;
    } catch {
      // silently handle — contacts are optional enrichment
    }
  }, [instanceName]);

  const fetchChats = useCallback(async () => {
    if (!instanceName) return;
    try {
      setIsLoading((prev) => (!prev ? true : prev));
      const raw = await findChats(instanceName);
      const mapped = (raw || [])
        .map((c) => mapChat(c, contactsMapRef.current))
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
    const init = async () => {
      await fetchContacts();
      await fetchChats();
    };
    init();
    if (instanceName) {
      intervalRef.current = setInterval(fetchChats, 15000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchContacts, fetchChats, instanceName]);

  return { chats, isLoading, error, refetch: fetchChats };
}
