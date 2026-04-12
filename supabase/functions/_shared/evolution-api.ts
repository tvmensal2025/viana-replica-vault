/**
 * Evolution API Helper
 * Funções para enviar mensagens via Evolution API
 */

import { fetchWithTimeout, logStructured, TIMEOUT_WHAPI } from "./utils.ts";

export interface EvolutionButton {
  id: string;
  title: string;
}

export interface EvolutionInstance {
  id: string;
  instance_name: string;
  api_url: string;
  api_key: string;
  phone_number?: string;
  status: string;
}

/**
 * Cria sender para Evolution API
 */
export function createEvolutionSender(apiUrl: string, apiKey: string, instanceName: string) {
  const baseUrl = apiUrl.replace(/\/$/, "");

  return {
    /**
     * Envia mensagem de texto
     */
    async sendText(remoteJid: string, text: string): Promise<boolean> {
      try {
        const res = await fetchWithTimeout(`${baseUrl}/message/sendText/${instanceName}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": apiKey,
          },
          body: JSON.stringify({
            number: remoteJid,
            text: text,
          }),
          timeout: TIMEOUT_WHAPI,
        });

        if (!res.ok) {
          const errorText = await res.text();
          logStructured("error", "evolution_send_text_failed", {
            instance: instanceName,
            status: res.status,
            error: errorText.substring(0, 200),
          });
          return false;
        }

        return true;
      } catch (error: any) {
        logStructured("error", "evolution_send_text_exception", {
          instance: instanceName,
          error: error?.message,
        });
        return false;
      }
    },

    /**
     * Envia mensagem com botões
     * Fallback para texto se botões falharem
     */
    async sendButtons(remoteJid: string, message: string, buttons: EvolutionButton[]): Promise<boolean> {
      try {
        // Tentar enviar com botões
        const res = await fetchWithTimeout(`${baseUrl}/message/sendButtons/${instanceName}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": apiKey,
          },
          body: JSON.stringify({
            number: remoteJid,
            title: "Escolha uma opção",
            description: message,
            footer: "iGreen Energy",
            buttons: buttons.map((b) => ({
              buttonId: b.id,
              buttonText: {
                displayText: b.title,
              },
            })),
          }),
          timeout: TIMEOUT_WHAPI,
        });

        if (res.ok) {
          return true;
        }

        // Fallback: enviar como texto com opções numeradas
        logStructured("warn", "evolution_buttons_fallback", {
          instance: instanceName,
          status: res.status,
        });

        const textWithOptions = `${message}\n\n${buttons.map((b, i) => `${i + 1}. ${b.title}`).join("\n")}`;
        return await this.sendText(remoteJid, textWithOptions);
      } catch (error: any) {
        logStructured("error", "evolution_send_buttons_exception", {
          instance: instanceName,
          error: error?.message,
        });

        // Fallback: enviar como texto
        const textWithOptions = `${message}\n\n${buttons.map((b, i) => `${i + 1}. ${b.title}`).join("\n")}`;
        return await this.sendText(remoteJid, textWithOptions);
      }
    },

    /**
     * Baixa mídia via Evolution API
     * Retorna base64
     */
    async downloadMedia(key: any, message: any): Promise<string | null> {
      try {
        const res = await fetchWithTimeout(`${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": apiKey,
          },
          body: JSON.stringify({
            message: {
              key,
              message,
            },
          }),
          timeout: 30_000,
        });

        if (!res.ok) {
          const errorText = await res.text();
          logStructured("error", "evolution_download_media_failed", {
            instance: instanceName,
            status: res.status,
            error: errorText.substring(0, 200),
          });
          return null;
        }

        const data = await res.json();
        return data.base64 || null;
      } catch (error: any) {
        logStructured("error", "evolution_download_media_exception", {
          instance: instanceName,
          error: error?.message,
        });
        return null;
      }
    },
  };
}

/**
 * Extrai dados da mensagem Evolution API
 */
export function parseEvolutionMessage(body: any) {
  const data = body.data || body;
  const key = data.key || {};
  const message = data.message || {};
  const messageTimestamp = data.messageTimestamp || key.timestamp;

  // Remote JID (número do remetente)
  const remoteJid = key.remoteJid || "";
  const fromMe = key.fromMe || false;

  // Ignorar mensagens enviadas por nós
  if (fromMe) {
    return null;
  }

  // Ignorar grupos, newsletters e canais
  if (
    remoteJid.includes("@g.us") ||
    remoteJid.includes("@newsletter") ||
    remoteJid.includes("@broadcast")
  ) {
    return null;
  }

  // Extrair texto
  let messageText = "";
  if (message.conversation) {
    messageText = message.conversation;
  } else if (message.extendedTextMessage?.text) {
    messageText = message.extendedTextMessage.text;
  }

  // Extrair resposta de botão
  let buttonId: string | null = null;
  if (message.buttonsResponseMessage?.selectedButtonId) {
    buttonId = message.buttonsResponseMessage.selectedButtonId;
  } else if (message.listResponseMessage?.singleSelectReply?.selectedRowId) {
    buttonId = message.listResponseMessage.singleSelectReply.selectedRowId;
  }

  // Extrair imagem
  const imageMessage = message.imageMessage;
  const hasImage = !!imageMessage;

  // Extrair documento
  const documentMessage = message.documentMessage;
  const hasDocument = !!documentMessage;

  // Extrair áudio
  const audioMessage = message.audioMessage;
  const hasAudio = !!audioMessage;

  // Extrair vídeo
  const videoMessage = message.videoMessage;
  const hasVideo = !!videoMessage;

  const isFile = hasImage || hasDocument;
  const isButton = !!buttonId;

  return {
    remoteJid,
    messageText: messageText.trim(),
    buttonId,
    hasImage,
    hasDocument,
    hasAudio,
    hasVideo,
    isFile,
    isButton,
    imageMessage,
    documentMessage,
    audioMessage,
    videoMessage,
    key,
    message,
    messageTimestamp,
  };
}

/**
 * Extrai URL de mídia da mensagem (se disponível)
 */
export function extractMediaUrl(message: any): string | null {
  if (message.imageMessage?.url) {
    return message.imageMessage.url;
  }
  if (message.documentMessage?.url) {
    return message.documentMessage.url;
  }
  if (message.videoMessage?.url) {
    return message.videoMessage.url;
  }
  if (message.audioMessage?.url) {
    return message.audioMessage.url;
  }
  return null;
}
