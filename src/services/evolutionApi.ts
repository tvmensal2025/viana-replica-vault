// Direct Evolution API calls — no proxy, no extra latency

const BASE_URL = (import.meta.env.VITE_EVOLUTION_API_URL || "").replace(/\/+$/, "");
const API_KEY = import.meta.env.VITE_EVOLUTION_API_KEY || "";

function headers(): Record<string, string> {
  return { "Content-Type": "application/json", apikey: API_KEY };
}

function normalizeQrBase64(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value;
}

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const url = `${BASE_URL}/${path}`;
  const opts: RequestInit = { method, headers: headers() };
  if (body && (method === "POST" || method === "PUT")) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);

  if (!res.ok) {
    let detail = res.statusText || "Erro na API";
    try {
      const json = await res.json();
      const msg = json?.response?.message?.[0] || json?.response?.message || json?.error || json?.message;
      if (msg) detail = typeof msg === "string" ? msg : JSON.stringify(msg);
    } catch { /* not json */ }
    throw new Error(`[${res.status}] ${detail}`);
  }

  return res.json();
}

// ─── Instance Management ───

export async function createInstance(instanceName: string) {
  const response = await request<{
    instance?: { instanceName: string; status: string };
    qrcode?: { base64?: string | null; pairingCode?: string; count?: number };
  }>("instance/create", "POST", {
    instanceName,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
  });

  return {
    ...response,
    qrcode: response?.qrcode
      ? { ...response.qrcode, base64: normalizeQrBase64(response.qrcode.base64) }
      : undefined,
  };
}

export async function connectInstance(instanceName: string) {
  const response = await request<{
    base64?: string | null;
    code?: string | null;
    pairingCode?: string;
    count?: number;
    qrcode?: { base64?: string | null; count?: number; pairingCode?: string };
  }>(`instance/connect/${instanceName}`, "GET");

  return {
    base64: normalizeQrBase64(response?.base64) ?? normalizeQrBase64(response?.qrcode?.base64),
    pairingCode: response?.pairingCode || response?.qrcode?.pairingCode || null,
  };
}

export async function getConnectionState(instanceName: string) {
  const response = await request<{ instance?: { state: string }; state?: string }>(
    `instance/connectionState/${instanceName}`, "GET"
  );
  const state = response?.instance?.state || response?.state;
  return { state: (state as "open" | "close" | "connecting") || "close" };
}

export async function deleteInstance(instanceName: string) {
  return request<void>(`instance/delete/${instanceName}`, "DELETE");
}

export async function logoutInstance(instanceName: string) {
  return request<void>(`instance/logout/${instanceName}`, "DELETE");
}

export async function fetchInstances() {
  return request<{ instance: { instanceName: string; status: string } }[]>(
    "instance/fetchInstances", "GET"
  );
}

// ─── Chat / Conversations ───

export interface EvolutionChat {
  id: string;
  remoteJid: string;
  name?: string;
  pushName?: string;
  profilePicUrl?: string;
  lastMsgTimestamp?: number;
  unreadMessages?: number;
  unreadCount?: number;
  lastMessage?: {
    key: { fromMe: boolean; remoteJid?: string; remoteJidAlt?: string; participantAlt?: string };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text: string };
      imageMessage?: { caption?: string };
      documentMessage?: { fileName?: string };
      audioMessage?: Record<string, unknown>;
    };
    messageTimestamp?: number;
  };
}

export async function findChats(instanceName: string): Promise<EvolutionChat[]> {
  return request<EvolutionChat[]>(`chat/findChats/${instanceName}`, "POST", {});
}

export interface EvolutionMessage {
  key: { remoteJid: string; remoteJidAlt?: string; fromMe: boolean; id: string };
  pushName?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text: string };
    imageMessage?: { url?: string; caption?: string; mimetype?: string; base64?: string };
    documentMessage?: { url?: string; fileName?: string; mimetype?: string; base64?: string };
    audioMessage?: { url?: string; mimetype?: string; ptt?: boolean; base64?: string };
    videoMessage?: { url?: string; caption?: string; mimetype?: string; base64?: string };
    stickerMessage?: { url?: string; mimetype?: string; base64?: string };
  };
  messageTimestamp?: number;
  status?: number;
}

export async function getBase64FromMediaMessage(
  instanceName: string, messageId: string, remoteJid: string, fromMe: boolean
) {
  try {
    return await request<{ base64?: string; mimetype?: string }>(
      `chat/getBase64FromMediaMessage/${instanceName}`, "POST",
      { message: { key: { remoteJid, fromMe, id: messageId } }, convertToMp4: false }
    );
  } catch { return null; }
}

export async function findMessages(instanceName: string, remoteJid: string, limit = 50): Promise<EvolutionMessage[]> {
  const result = await request<{ messages?: { records: EvolutionMessage[] } } | EvolutionMessage[]>(
    `chat/findMessages/${instanceName}`, "POST", { where: { key: { remoteJid } }, limit }
  );
  if (Array.isArray(result)) return result;
  return result?.messages?.records || [];
}

export interface EvolutionContact { id: string; remoteJid: string; pushName?: string; profilePicUrl?: string }

export async function findContacts(instanceName: string): Promise<EvolutionContact[]> {
  return request<EvolutionContact[]>(`chat/findContacts/${instanceName}`, "POST", {});
}

// ─── Message Sending ───

export async function sendTextMessage(instanceName: string, phone: string, text: string) {
  return request<{ key: { id: string } }>(`message/sendText/${instanceName}`, "POST", { number: phone, text });
}

export async function sendMedia(
  instanceName: string, phone: string, mediaUrl: string, caption: string,
  mediatype: "image" | "video" | "document"
) {
  return request<{ key: { id: string } }>(`message/sendMedia/${instanceName}`, "POST", {
    number: phone, mediatype, media: mediaUrl, caption,
  });
}

export async function sendAudio(instanceName: string, phone: string, audioUrl: string) {
  return request<{ key: { id: string } }>(`message/sendWhatsAppAudio/${instanceName}`, "POST", {
    number: phone, audio: audioUrl,
  });
}

export async function sendDocument(instanceName: string, phone: string, docUrl: string, fileName: string) {
  return request<{ key: { id: string } }>(`message/sendMedia/${instanceName}`, "POST", {
    number: phone, mediatype: "document", media: docUrl, fileName,
  });
}

// ─── Presence / Read ───

export async function markAsRead(instanceName: string, remoteJid: string, messageId: string, fromMe: boolean) {
  return request<void>(`chat/markMessageAsRead/${instanceName}`, "POST", {
    readMessages: [{ id: messageId, remoteJid, fromMe }],
  });
}

export async function getProfilePicture(instanceName: string, remoteJid: string) {
  try {
    const result = await request<{ profilePictureUrl?: string; wpiPicUrl?: string }>(
      `chat/fetchProfilePictureUrl/${instanceName}`, "POST", { number: remoteJid }
    );
    return result?.profilePictureUrl || result?.wpiPicUrl || null;
  } catch { return null; }
}
