import { useState, useEffect, useCallback, useRef } from "react";
import { findChats, findContacts, getProfilePicture, type EvolutionChat, type EvolutionContact } from "@/services/evolutionApi";

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

function formatPhoneNumber(raw: string): string {
  // Format Brazilian phone numbers: 5511999998888 → (11) 99999-8888
  if (/^55\d{10,11}$/.test(raw)) {
    const ddd = raw.slice(2, 4);
    const number = raw.slice(4);
    if (number.length === 9) return `(${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`;
    if (number.length === 8) return `(${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`;
  }
  return raw;
}

function mapChat(chat: EvolutionChat, contactsMap: Map<string, EvolutionContact>): ChatItem | null {
  const jid = chat.remoteJid || chat.id;
  const contact = contactsMap.get(jid);

  // Extract the real phone number from remoteJidAlt (e.g. "5511973125846@s.whatsapp.net" → "5511973125846")
  const altJid = chat.lastMessage?.key?.remoteJidAlt || chat.lastMessage?.key?.participantAlt;
  const realPhone = altJid ? altJid.split("@")[0] : null;

  const rawJidNumber = jid.split("@")[0];
  const isLid = jid.endsWith("@lid");

  // For @lid JIDs without a real phone or name, skip the chat entirely
  const hasName = chat.pushName || chat.lastMessage?.pushName || contact?.pushName || chat.name;
  if (isLid && !hasName && !realPhone) return null;

  // Build display name: prefer real names, then formatted phone
  const nameSource = chat.pushName || chat.lastMessage?.pushName || contact?.pushName || chat.name;
  const phoneSource = realPhone || (isLid ? null : rawJidNumber);
  const displayName = nameSource || (phoneSource ? formatPhoneNumber(phoneSource) : `Contato ${rawJidNumber.slice(-4)}`);

  const sendTargetJid =
    altJid ||
    (isLid ? undefined : jid);

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
        .filter((c): c is ChatItem => c !== null && !c.isGroup)
        .sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
      setChats(mapped);
      setError(null);

      // Fetch profile pictures for chats missing them (batch, non-blocking)
      const missingPics = mapped.filter((c) => !c.profilePicUrl).slice(0, 20);
      if (missingPics.length > 0 && instanceName) {
        Promise.all(
          missingPics.map(async (chat) => {
            const targetJid = chat.sendTargetJid || chat.remoteJid;
            const picUrl = await getProfilePicture(instanceName, targetJid);
            return { jid: chat.remoteJid, picUrl };
          })
        ).then((results) => {
          const picMap = new Map(results.filter((r) => r.picUrl).map((r) => [r.jid, r.picUrl!]));
          if (picMap.size > 0) {
            setChats((prev) =>
              prev.map((c) => (picMap.has(c.remoteJid) ? { ...c, profilePicUrl: picMap.get(c.remoteJid) } : c))
            );
          }
        }).catch(() => { /* non-critical */ });
      }
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
