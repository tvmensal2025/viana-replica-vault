import { useState, useRef, useCallback } from "react";
import { Send, Paperclip, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuickReplyMenu } from "./QuickReplyMenu";
import type { MessageTemplate } from "@/types/whatsapp";

interface MessageComposerProps {
  onSend: (text: string) => Promise<void>;
  templates: MessageTemplate[];
  disabled?: boolean;
}

export function MessageComposer({ onSend, templates, disabled }: MessageComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showQuickReply, setShowQuickReply] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setText(val);

      // Check for "/" trigger
      if (val.startsWith("/")) {
        setShowQuickReply(true);
        setQuickSearch(val.slice(1));
      } else {
        setShowQuickReply(false);
        setQuickSearch("");
      }
    },
    []
  );

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setText("");
      setShowQuickReply(false);
    } catch {
      // handled upstream
    } finally {
      setSending(false);
    }
  }, [text, sending, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === "Escape") {
        setShowQuickReply(false);
      }
    },
    [handleSend]
  );

  const handleTemplateSelect = useCallback((t: MessageTemplate) => {
    setText(t.content);
    setShowQuickReply(false);
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="relative border-t border-border bg-card p-2">
      {showQuickReply && (
        <QuickReplyMenu
          templates={templates}
          search={quickSearch}
          onSelect={handleTemplateSelect}
          onClose={() => setShowQuickReply(false)}
        />
      )}

      <div className="flex items-end gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          disabled={disabled}
        >
          <Smile className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          disabled={disabled}
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder='Mensagem (use "/" para respostas rápidas)'
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-secondary rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring min-h-[36px] max-h-[120px]"
          style={{ overflow: "auto" }}
        />

        <Button
          onClick={handleSend}
          disabled={!text.trim() || sending || disabled}
          size="icon"
          className="h-8 w-8 shrink-0 bg-primary hover:bg-primary/90"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
