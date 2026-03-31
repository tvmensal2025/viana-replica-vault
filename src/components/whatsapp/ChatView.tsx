import { useEffect, useRef, useState, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageBubble } from "./MessageBubble";
import { MessageComposer } from "./MessageComposer";
import { AddCustomerDialog } from "./AddCustomerDialog";
import { useMessages } from "@/hooks/useMessages";
import { sendAudio as sendAudioApi, sendMedia as sendMediaApi } from "@/services/evolutionApi";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { MessageTemplate } from "@/types/whatsapp";
import type { ChatItem } from "@/hooks/useChats";
import { Loader2, MessageSquareText, UserPlus, UserCheck, KanbanSquare } from "lucide-react";
import { createLogger } from "@/lib/logger";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Tables } from "@/integrations/supabase/types";

const logger = createLogger("ChatView");

interface ChatViewProps {
  instanceName: string;
  chat: ChatItem | null;
  templates: MessageTemplate[];
  consultantId: string;
  initialMessage?: string | null;
}

export function ChatView({ instanceName, chat, templates, consultantId, initialMessage }: ChatViewProps) {
  const { messages, isLoading, sendMessage, loadMedia } = useMessages(
    instanceName,
    chat?.remoteJid || null,
    chat?.sendTargetJid || null
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [isCustomer, setIsCustomer] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [kanbanStages, setKanbanStages] = useState<Tables<"kanban_stages">[]>([]);
  const [sendingToCrm, setSendingToCrm] = useState(false);

  // Fetch kanban stages
  useEffect(() => {
    supabase
      .from("kanban_stages")
      .select("*")
      .eq("consultant_id", consultantId)
      .order("position")
      .then(({ data }) => {
        if (data && data.length > 0) setKanbanStages(data);
      });
  }, [consultantId]);

  const handleSendToCrm = useCallback(async (stageKey: string) => {
    if (!chat) return;
    setSendingToCrm(true);
    try {
      // Check if deal already exists for this remoteJid
      const { data: existing } = await supabase
        .from("crm_deals")
        .select("id")
        .eq("consultant_id", consultantId)
        .eq("remote_jid", chat.remoteJid)
        .maybeSingle();

      if (existing) {
        // Update stage
        await supabase
          .from("crm_deals")
          .update({ stage: stageKey, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        toast({ title: "CRM atualizado", description: `Movido para ${kanbanStages.find(s => s.stage_key === stageKey)?.label || stageKey}` });
      } else {
        // Create new deal
        await supabase
          .from("crm_deals")
          .insert({
            consultant_id: consultantId,
            remote_jid: chat.remoteJid,
            stage: stageKey,
          });
        toast({ title: "Adicionado ao CRM", description: `Enviado para ${kanbanStages.find(s => s.stage_key === stageKey)?.label || stageKey}` });
      }
    } catch (err) {
      logger.error("Erro ao enviar ao CRM:", err);
      toast({ title: "Erro ao enviar ao CRM", variant: "destructive" });
    } finally {
      setSendingToCrm(false);
    }
  }, [chat, consultantId, kanbanStages, toast]);

  // Check if this contact is already a customer
  useEffect(() => {
    if (!chat) { setIsCustomer(false); return; }
    const phone = chat.remoteJid.split("@")[0];
    supabase
      .from("customers")
      .select("id")
      .eq("phone_whatsapp", phone)
      .maybeSingle()
      .then(({ data }) => setIsCustomer(!!data));
  }, [chat]);

  const handleCustomerAdded = useCallback(() => {
    setIsCustomer(true);
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!chat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background/50 text-muted-foreground">
        <MessageSquareText className="h-16 w-16 mb-4 opacity-30" />
        <p className="text-sm">Selecione uma conversa para começar</p>
        <p className="text-xs mt-1">Use "/" para respostas rápidas no campo de mensagem</p>
      </div>
    );
  }

  const phoneNumber = chat.remoteJid.split("@")[0];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card">
        <Avatar className="h-9 w-9">
          <AvatarImage src={chat.profilePicUrl} />
          <AvatarFallback className="bg-primary/20 text-primary text-xs">
            {chat.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{chat.name}</p>
          <p className="text-[10px] text-muted-foreground">{phoneNumber}</p>
        </div>
        {/* Add as customer button */}
        {isCustomer ? (
          <div className="flex items-center gap-1.5 text-primary">
            <UserCheck className="h-4 w-4" />
            <span className="text-[10px] font-medium">Cliente</span>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px] gap-1 border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => setShowAddDialog(true)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Adicionar Cliente
          </Button>
        )}
        {/* Send to CRM */}
        {kanbanStages.length > 0 && (
          <Select
            onValueChange={handleSendToCrm}
            disabled={sendingToCrm}
          >
            <SelectTrigger className="h-7 w-auto gap-1 text-[10px] border-accent/30 text-accent-foreground px-2">
              {sendingToCrm ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <KanbanSquare className="h-3.5 w-3.5" />
              )}
              <span>CRM</span>
            </SelectTrigger>
            <SelectContent>
              {kanbanStages.map((stage) => (
                <SelectItem key={stage.id} value={stage.stage_key}>
                  {stage.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}
      >
        {isLoading && messages.length === 0 && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!isLoading && messages.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8">
            Nenhuma mensagem encontrada
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onLoadMedia={loadMedia} />
        ))}
      </div>

      {/* Composer */}
      <MessageComposer
        onSend={sendMessage}
        initialMessage={initialMessage}
        onSendAudio={async (base64) => {
          if (!chat) return;
          const targetJid = chat.sendTargetJid || chat.remoteJid;
          const phone = targetJid.split("@")[0];
          try {
            const audioDataUrl = `data:audio/ogg;base64,${base64}`;
            await sendAudioApi(instanceName, phone, audioDataUrl);
          } catch (err: unknown) {
            logger.error("Erro ao enviar áudio:", err);
            toast({ title: "Erro ao enviar áudio", description: err instanceof Error ? err.message : "Falha no envio", variant: "destructive" });
          }
        }}
        onSendMedia={async (mediaUrl, caption, mediaType) => {
          if (!chat) return;
          const targetJid = chat.sendTargetJid || chat.remoteJid;
          const phone = targetJid.split("@")[0];
          try {
            await sendMediaApi(instanceName, phone, mediaUrl, caption, mediaType as "image" | "video" | "document");
          } catch (err: unknown) {
            logger.error("Erro ao enviar mídia:", err);
            toast({ title: "Erro ao enviar mídia", description: err instanceof Error ? err.message : "Falha no envio", variant: "destructive" });
          }
        }}
        templates={templates}
      />

      {/* Add Customer Dialog */}
      {chat && (
        <AddCustomerDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          phone={phoneNumber}
          name={chat.name !== phoneNumber ? chat.name : null}
          onAdded={handleCustomerAdded}
        />
      )}
    </div>
  );
}
