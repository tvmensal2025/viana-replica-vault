import { useState } from "react";
import { Search, MessageCirclePlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { ChatItem } from "@/hooks/useChats";

interface ChatSidebarProps {
  chats: ChatItem[];
  isLoading: boolean;
  selectedJid: string | null;
  onSelectChat: (jid: string) => void;
}

function formatTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function ChatSidebar({ chats, isLoading, selectedJid, onSelectChat }: ChatSidebarProps) {
  const [search, setSearch] = useState("");

  const filtered = chats.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.remoteJid.includes(search)
  );

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">Conversas</h3>
        <MessageCirclePlus className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-primary transition-colors" />
      </div>

      {/* Search */}
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs bg-secondary border-none"
          />
        </div>
      </div>

      {/* Chat list */}
      <ScrollArea className="flex-1">
        {isLoading && chats.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Carregando conversas...
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Nenhuma conversa encontrada
          </div>
        )}
        {filtered.map((chat) => (
          <button
            key={chat.remoteJid}
            onClick={() => onSelectChat(chat.remoteJid)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary/80 ${
              selectedJid === chat.remoteJid ? "bg-secondary" : ""
            }`}
          >
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage src={chat.profilePicUrl} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs">
                {chat.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground truncate">
                  {chat.name}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                  {formatTime(chat.lastMessageTimestamp)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground truncate">
                  {chat.lastMessage || "..."}
                </span>
                {chat.unreadCount > 0 && (
                  <span className="bg-primary text-primary-foreground text-[10px] rounded-full h-4 min-w-[16px] flex items-center justify-center px-1 shrink-0 ml-1">
                    {chat.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </ScrollArea>
    </div>
  );
}
