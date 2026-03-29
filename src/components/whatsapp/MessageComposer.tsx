import { useState, useRef, useCallback } from "react";
import { Send, Paperclip, Mic, MicOff, MessageSquareText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuickReplyMenu } from "./QuickReplyMenu";
import type { MessageTemplate } from "@/types/whatsapp";

interface MessageComposerProps {
  onSend: (text: string) => Promise<void>;
  onSendAudio?: (audioBase64: string) => Promise<void>;
  templates: MessageTemplate[];
  disabled?: boolean;
}

export function MessageComposer({ onSend, onSendAudio, templates, disabled }: MessageComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showQuickReply, setShowQuickReply] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setText(val);
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

  // ── Audio Recording ──
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        // Convert to base64
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(",")[1];
          if (base64 && onSendAudio) {
            setSending(true);
            try {
              await onSendAudio(base64);
            } catch {
              // handled upstream
            } finally {
              setSending(false);
            }
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch {
      // mic permission denied
    }
  }, [onSendAudio]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      // stop tracks
      mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
    }
    chunksRef.current = [];
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const formatRecordingTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ── Recording UI ──
  if (isRecording) {
    return (
      <div className="relative border-t border-border bg-card p-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={cancelRecording}
          >
            <MicOff className="h-4 w-4" />
          </Button>

          <div className="flex-1 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm text-foreground font-mono">
              {formatRecordingTime(recordingTime)}
            </span>
            <span className="text-xs text-muted-foreground">Gravando...</span>
          </div>

          <Button
            onClick={stopRecording}
            size="icon"
            className="h-8 w-8 bg-primary hover:bg-primary/90"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

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

      <div className="flex items-end gap-1.5">
        {/* Quick Reply button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
          disabled={disabled}
          onClick={() => {
            setShowQuickReply(!showQuickReply);
            setQuickSearch("");
          }}
          title="Respostas rápidas"
        >
          <MessageSquareText className="h-4 w-4" />
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

        {/* Send text or Record audio */}
        {text.trim() ? (
          <Button
            onClick={handleSend}
            disabled={sending || disabled}
            size="icon"
            className="h-8 w-8 shrink-0 bg-primary hover:bg-primary/90"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        ) : (
          <Button
            onClick={startRecording}
            disabled={disabled || !onSendAudio}
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
            title="Gravar áudio"
          >
            <Mic className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
