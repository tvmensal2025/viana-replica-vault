// Shared types for evolution-webhook handlers.
// Defines the BotContext object passed through bot-flow handlers
// so we don't need to keep dozens of free variables in scope.

export type SupabaseClient = ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>;

export interface EvolutionSender {
  sendText: (jid: string, text: string) => Promise<boolean>;
  sendButtons: (jid: string, text: string, buttons: Array<{ id: string; title: string }>) => Promise<boolean>;
  downloadMedia: (key: any, message: any) => Promise<string | null>;
  sendMedia: (jid: string, url: string, caption: string, type: string) => Promise<boolean>;
}

export interface BotContext {
  // Supabase + sender
  supabase: SupabaseClient;
  sender: EvolutionSender;

  // Customer + identity
  customer: any;
  consultorId: string;
  nomeRepresentante: string;

  // Inbound message
  remoteJid: string;
  phone: string;
  messageText: string;
  buttonId: string | null;
  isFile: boolean;
  isButton: boolean;
  hasImage: boolean;
  hasDocument: boolean;
  imageMessage: any;
  documentMessage: any;
  message: any;
  key: any;
  messageId: string;

  // Media (resolved before bot flow)
  fileUrl: string | null;
  fileBase64: string | null;

  // Env
  geminiApiKey: string;
}

export interface BotResult {
  reply: string;
  updates: Record<string, any>;
}
