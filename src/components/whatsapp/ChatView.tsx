import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageBubble } from "./MessageBubble";
import { MessageComposer } from "./MessageComposer";
import { useMessages } from "@/hooks/useMessages";
import type { MessageTemplate } from "@/types/whatsapp";
import type { ChatItem } from "@/hooks/useChats";
import { Loader2, MessageSquareText } from "lucide-react";

interface ChatViewProps {
  instanceName: string;
  chat: ChatItem | null;
  templates: MessageTemplate[];
}

export function ChatView({ instanceName, chat, templates }: ChatViewProps) {
  const { messages, isLoading, sendMessage } = useMessages(
    instanceName,
    chat?.remoteJid || null
  );
  const scrollRef = useRef<HTMLDivElement>(null);

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
          <p className="text-[10px] text-muted-foreground">
            {chat.remoteJid.split("@")[0]}
          </p>
        </div>
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
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>

      {/* Composer */}
      <MessageComposer
        onSend={sendMessage}
        templates={templates}
      />
    </div>
  );
}
