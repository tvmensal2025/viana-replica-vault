/**
 * Unified message sending pipeline.
 * Routes to the correct Evolution API function and returns typed results.
 */
import {
  sendTextMessage,
  sendMedia,
  sendAudio,
  sendDocument,
} from "@/services/evolutionApi";
import { createLogger } from "@/lib/logger";

const logger = createLogger("messageSender");

export type SendStatus = "sent" | "timeout" | "failed";

export interface SendResult {
  status: SendStatus;
  error?: string;
}

export type MediaCategory = "text" | "image" | "video" | "audio" | "document";

export interface SendPayload {
  instanceName: string;
  phone: string;
  mediaCategory: MediaCategory;
  text?: string;
  mediaUrl?: string;
  fileName?: string;
}

function isTimeoutResponse(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as Record<string, unknown>).timeout === true
  );
}

function isUnavailableResponse(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    ((result as Record<string, unknown>).unavailable === true ||
      (result as Record<string, unknown>).connectionClosed === true)
  );
}

/**
 * Send a single message through the correct Evolution API endpoint.
 * Returns a typed SendResult instead of throwing on timeout.
 */
export async function sendWhatsAppMessage(payload: SendPayload): Promise<SendResult> {
  const { instanceName, phone, mediaCategory, text, mediaUrl, fileName } = payload;

  // Block invalid placeholder phones before hitting the API
  if (!phone || /sem_celular/i.test(phone) || phone.replace(/\D/g, "").length < 8) {
    logger.warn("Número inválido ignorado:", phone);
    return { status: "failed", error: `Número inválido: ${phone}` };
  }

  try {
    let result: unknown;

    switch (mediaCategory) {
      case "text":
        if (!text?.trim()) return { status: "failed", error: "Texto vazio" };
        result = await sendTextMessage(instanceName, phone, text, true);
        break;

      case "audio":
        if (!mediaUrl) return { status: "failed", error: "URL de áudio ausente" };
        result = await sendAudio(instanceName, phone, mediaUrl, true);
        break;

      case "document":
        if (!mediaUrl) return { status: "failed", error: "URL do documento ausente" };
        result = await sendDocument(
          instanceName,
          phone,
          mediaUrl,
          fileName || "documento",
          true
        );
        break;

      case "image":
      case "video":
        if (!mediaUrl) return { status: "failed", error: "URL da mídia ausente" };
        result = await sendMedia(
          instanceName,
          phone,
          mediaUrl,
          text || "",
          mediaCategory,
          true
        );
        break;

      default:
        return { status: "failed", error: `Tipo desconhecido: ${mediaCategory}` };
    }

    if (isTimeoutResponse(result)) {
      logger.warn("Timeout ao enviar", { phone, mediaCategory });
      return { status: "timeout", error: "Timeout ao enviar mensagem" };
    }

    if (isUnavailableResponse(result)) {
      logger.warn("Serviço indisponível ao enviar", { phone, mediaCategory });
      return { status: "timeout", error: "Serviço temporariamente indisponível" };
    }

    return { status: "sent" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    logger.error("Falha no envio:", msg);
    return { status: "failed", error: msg };
  }
}

/**
 * Resolve the recipient from a JID for sending.
 * - @s.whatsapp.net → extract phone number
 * - @lid → send full JID (Evolution handles it)
 * - plain number → use as-is
 */
export function resolveRecipient(targetJid: string): string {
  if (targetJid.endsWith("@s.whatsapp.net")) {
    return targetJid.split("@")[0];
  }
  if (targetJid.endsWith("@lid")) {
    return targetJid; // Evolution API handles @lid JIDs
  }
  return targetJid;
}
