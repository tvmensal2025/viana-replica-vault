export interface WhatsAppInstance {
  id: string;
  consultant_id: string;
  instance_name: string;
  created_at: string;
}

export type TemplateMediaType = "text" | "image" | "audio" | "document";

export interface MessageTemplate {
  id: string;
  consultant_id: string;
  name: string;
  content: string;
  media_type: TemplateMediaType;
  media_url: string | null;
  image_url: string | null;
  created_at: string;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface BulkSendProgress {
  total: number;
  sent: number;
  failed: number;
  inProgress: boolean;
}
