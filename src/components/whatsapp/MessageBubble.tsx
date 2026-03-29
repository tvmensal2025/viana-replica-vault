import { Check, CheckCheck, Clock, FileText, Image, Mic, Video } from "lucide-react";
import type { ChatMessage } from "@/hooks/useMessages";

interface MessageBubbleProps {
  message: ChatMessage;
}

function formatTime(ts: number): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusIcon({ status }: { status?: number }) {
  if (status === undefined || status === null) return null;
  if (status <= 1) return <Clock className="h-3 w-3 text-muted-foreground" />;
  if (status === 2) return <Check className="h-3 w-3 text-muted-foreground" />;
  if (status === 3) return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
  if (status >= 4) return <CheckCheck className="h-3 w-3 text-blue-400" />;
  return null;
}

function MediaIcon({ type }: { type?: ChatMessage["mediaType"] }) {
  if (!type) return null;
  const cls = "h-4 w-4 text-muted-foreground mr-1";
  switch (type) {
    case "image": return <Image className={cls} />;
    case "video": return <Video className={cls} />;
    case "audio": return <Mic className={cls} />;
    case "document": return <FileText className={cls} />;
    default: return null;
  }
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { fromMe, text, timestamp, status, mediaType, mediaUrl } = message;

  return (
    <div className={`flex ${fromMe ? "justify-end" : "justify-start"} mb-1`}>
      <div
        className={`max-w-[75%] rounded-lg px-3 py-1.5 ${
          fromMe
            ? "bg-primary/20 text-foreground rounded-br-none"
            : "bg-secondary text-foreground rounded-bl-none"
        }`}
      >
        {mediaType === "image" && mediaUrl && (
          <img
            src={mediaUrl}
            alt="media"
            className="rounded max-w-full max-h-60 mb-1"
            loading="lazy"
          />
        )}
        {mediaType && mediaType !== "image" && (
          <div className="flex items-center mb-1">
            <MediaIcon type={mediaType} />
            <span className="text-xs text-muted-foreground">{message.fileName || mediaType}</span>
          </div>
        )}
        <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
        <div className="flex items-center justify-end gap-1 mt-0.5">
          <span className="text-[10px] text-muted-foreground">{formatTime(timestamp)}</span>
          {fromMe && <StatusIcon status={status} />}
        </div>
      </div>
    </div>
  );
}
