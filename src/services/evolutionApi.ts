function getBaseUrl(): string {
  return import.meta.env.VITE_EVOLUTION_API_URL;
}

function getApiKey(): string {
  return import.meta.env.VITE_EVOLUTION_API_KEY;
}

function getHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    apikey: getApiKey(),
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    throw new Error("Erro de autenticação com a API do WhatsApp");
  }
  if (!response.ok) {
    throw new Error(response.statusText || "Erro desconhecido na API");
  }
  return response.json();
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...getHeaders(), ...options?.headers },
    });
    return handleResponse<T>(response);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Erro de conexão. Verifique sua internet.");
    }
    throw error;
  }
}

// ─── Instance Management ───

export async function createInstance(instanceName: string) {
  return request<{
    instance: { instanceName: string; status: string };
    qrcode: { base64: string };
  }>(`${getBaseUrl()}/instance/create`, {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });
}

export async function connectInstance(instanceName: string) {
  return request<{ base64: string }>(
    `${getBaseUrl()}/instance/connect/${instanceName}`
  );
}

export async function getConnectionState(instanceName: string) {
  const response = await request<{ instance?: { state: string }; state?: string }>(
    `${getBaseUrl()}/instance/connectionState/${instanceName}`
  );
  const state = response?.instance?.state || response?.state;
  return { state: (state as "open" | "close" | "connecting") || "close" };
}

export async function deleteInstance(instanceName: string) {
  return request<void>(
    `${getBaseUrl()}/instance/delete/${instanceName}`,
    { method: "DELETE" }
  );
}

// ─── Chat / Conversations ───

export interface EvolutionChat {
  id: string;
  remoteJid: string;
  name?: string;
  profilePicUrl?: string;
  lastMsgTimestamp?: number;
  unreadMessages?: number;
  lastMessage?: {
    key: {
      fromMe: boolean;
      remoteJid?: string;
      remoteJidAlt?: string;
    };
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
  return request<EvolutionChat[]>(
    `${getBaseUrl()}/chat/findChats/${instanceName}`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export interface EvolutionMessage {
  key: {
    remoteJid: string;
    remoteJidAlt?: string;
    fromMe: boolean;
    id: string;
  };
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
  status?: number; // 0=ERROR, 1=PENDING, 2=SERVER_ACK, 3=DELIVERY_ACK, 4=READ, 5=PLAYED
}

// Download media as base64 from Evolution API
export async function getBase64FromMediaMessage(
  instanceName: string,
  messageId: string,
  remoteJid: string,
  fromMe: boolean
) {
  try {
    const result = await request<{ base64?: string; mimetype?: string }>(
      `${getBaseUrl()}/chat/getBase64FromMediaMessage/${instanceName}`,
      {
        method: "POST",
        body: JSON.stringify({
          message: { key: { remoteJid, fromMe, id: messageId } },
          convertToMp4: false,
        }),
      }
    );
    return result;
  } catch {
    return null;
  }
}

export async function findMessages(
  instanceName: string,
  remoteJid: string,
  limit = 50
): Promise<EvolutionMessage[]> {
  const result = await request<{ messages?: { records: EvolutionMessage[] } } | EvolutionMessage[]>(
    `${getBaseUrl()}/chat/findMessages/${instanceName}`,
    {
      method: "POST",
      body: JSON.stringify({
        where: { key: { remoteJid } },
        limit,
      }),
    }
  );
  if (Array.isArray(result)) return result;
  return result?.messages?.records || [];
}

export interface EvolutionContact {
  id: string;
  remoteJid: string;
  pushName?: string;
  profilePicUrl?: string;
}

export async function findContacts(instanceName: string): Promise<EvolutionContact[]> {
  return request<EvolutionContact[]>(
    `${getBaseUrl()}/chat/findContacts/${instanceName}`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

// ─── Message Sending ───

export async function sendTextMessage(
  instanceName: string,
  phone: string,
  text: string
) {
  return request<{ key: { id: string } }>(
    `${getBaseUrl()}/message/sendText/${instanceName}`,
    {
      method: "POST",
      body: JSON.stringify({ number: phone, text }),
    }
  );
}

export async function sendMedia(
  instanceName: string,
  phone: string,
  mediaUrl: string,
  caption: string,
  mediatype: "image" | "video" | "document"
) {
  return request<{ key: { id: string } }>(
    `${getBaseUrl()}/message/sendMedia/${instanceName}`,
    {
      method: "POST",
      body: JSON.stringify({
        number: phone,
        mediatype,
        media: mediaUrl,
        caption,
      }),
    }
  );
}

export async function sendAudio(
  instanceName: string,
  phone: string,
  audioUrl: string
) {
  return request<{ key: { id: string } }>(
    `${getBaseUrl()}/message/sendWhatsAppAudio/${instanceName}`,
    {
      method: "POST",
      body: JSON.stringify({
        number: phone,
        audio: audioUrl,
      }),
    }
  );
}

export async function sendDocument(
  instanceName: string,
  phone: string,
  docUrl: string,
  fileName: string
) {
  return request<{ key: { id: string } }>(
    `${getBaseUrl()}/message/sendMedia/${instanceName}`,
    {
      method: "POST",
      body: JSON.stringify({
        number: phone,
        mediatype: "document",
        media: docUrl,
        fileName,
      }),
    }
  );
}

// ─── Presence / Read ───

export async function markAsRead(instanceName: string, remoteJid: string) {
  return request<void>(
    `${getBaseUrl()}/chat/markMessageAsRead/${instanceName}`,
    {
      method: "PUT",
      body: JSON.stringify({ readMessages: [{ remoteJid }] }),
    }
  );
}

export async function getProfilePicture(instanceName: string, remoteJid: string) {
  try {
    const result = await request<{ profilePictureUrl?: string; wpiPicUrl?: string }>(
      `${getBaseUrl()}/chat/fetchProfilePictureUrl/${instanceName}`,
      {
        method: "POST",
        body: JSON.stringify({ number: remoteJid }),
      }
    );
    return result?.profilePictureUrl || result?.wpiPicUrl || null;
  } catch {
    return null;
  }
}
