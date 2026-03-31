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

  const altJid = chat.lastMessage?.key?.remoteJidAlt || chat.lastMessage?.key?.participantAlt;
  const realPhone = altJid ? altJid.split("@")[0] : null;

  const rawJidNumber = jid.split("@")[0];
  const isLid = jid.endsWith("@lid");

  const hasName = chat.pushName || chat.lastMessage?.pushName || contact?.pushName || chat.name;
  if (isLid && !hasName && !realPhone) return null;

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

// Low-concurrency queue: process items with max N concurrent tasks
async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

interface PicCacheEntry {
  url: string | null;
  fetchedAt: number;
}

export function useChats(instanceName: string | null) {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contactsMapRef = useRef<Map<string, EvolutionContact>>(new Map());
  const profilePicCacheRef = useRef<Map<string, PicCacheEntry>>(new Map());

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
      const cache = profilePicCacheRef.current;

      const mapped = (Array.isArray(raw) ? raw : [])
        .map((c) => {
          const item = mapChat(c, contactsMapRef.current);
          if (!item) return null;
          // Reapply cached profile pic
          const cached = cache.get(item.remoteJid);
          if (cached?.url && !item.profilePicUrl) {
            item.profilePicUrl = cached.url;
          }
          return item;
        })
        .filter((c): c is ChatItem => c !== null && !c.isGroup)
        .sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
      setChats(mapped);
      setError(null);

      // Fetch profile pictures ONLY for chats missing them — aggressive cache + very low throughput
      const CACHE_TTL = 60 * 60 * 1000; // 1 hour (was 10 min — too aggressive)
      const now = Date.now();
      const missingPics = mapped
        .filter((c) => {
          if (c.profilePicUrl) return false;
          const cached = cache.get(c.remoteJid);
          if (cached && now - cached.fetchedAt < CACHE_TTL) return false;
          return true;
        })
        .slice(0, 3); // max 3 per cycle (was 10)

      if (missingPics.length > 0 && instanceName) {
        // Use low concurrency (1 at a time) to avoid overloading the Evolution API
        processWithConcurrency(missingPics, 1, async (chat) => {
          const targetJid = chat.sendTargetJid || chat.remoteJid;
          try {
            const picUrl = await getProfilePicture(instanceName!, targetJid);
            cache.set(chat.remoteJid, { url: picUrl || null, fetchedAt: Date.now() });
            return { jid: chat.remoteJid, picUrl };
          } catch {
            // Mark as failed so we don't retry immediately
            cache.set(chat.remoteJid, { url: null, fetchedAt: Date.now() });
            return { jid: chat.remoteJid, picUrl: null };
          }
        }).then((results) => {
          const picMap = new Map(
            results.filter((r) => r.picUrl).map((r) => [r.jid, r.picUrl!])
          );
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
    if (!instanceName) {
      setChats([]);
      return;
    }

    const init = async () => {
      await fetchContacts();
      await fetchChats();
    };
    init();

    intervalRef.current = setInterval(fetchChats, 30000); // 30s (was 15s)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchContacts, fetchChats, instanceName]);

  return { chats, isLoading, error, refetch: fetchChats };
}
