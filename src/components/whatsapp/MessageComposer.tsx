import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Paperclip, Mic, MicOff, MessageSquareText, Loader2, Image, File, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuickReplyMenu } from "./QuickReplyMenu";
import { Progress } from "@/components/ui/progress";
import type { MessageTemplate } from "@/types/whatsapp";
import { uploadMedia, formatFileSize } from "@/services/minioUpload";
import { toast } from "sonner";
import { createLogger } from "@/lib/logger";

const logger = createLogger("MessageComposer");

type MediaType = "image" | "video" | "document";

interface MessageComposerProps {
  onSend: (text: string) => Promise<void>;
  onSendAudio?: (audioBase64: string) => Promise<void>;
  onSendAudioUrl?: (audioUrl: string) => Promise<void>;
  onSendMedia?: (mediaUrl: string, caption: string, mediaType: MediaType) => Promise<void>;
  templates: MessageTemplate[];
  disabled?: boolean;
  initialMessage?: string | null;
}

export function MessageComposer({ onSend, onSendAudio, onSendAudioUrl, onSendMedia, templates, disabled, initialMessage }: MessageComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showQuickReply, setShowQuickReply] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  // File attach state
  const [attachedFile, setAttachedFile] = useState<{ url: string; name: string; type: MediaType | "audio" } | null>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Pre-fill text when initialMessage changes
  useEffect(() => {
    if (initialMessage != null && initialMessage !== "") {
      setText(initialMessage);
    }
  }, [initialMessage]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    // If there's a file attached, send it as media
    if (attachedFile) {
      setSending(true);
      try {
        // Send pending image first (from template image_url)
        if (pendingImageUrl && onSendMedia) {
          await onSendMedia(pendingImageUrl, "", "image");
        }

        // Audio templates use sendAudioUrl (WhatsApp voice note endpoint)
        if (attachedFile.type === "audio" && onSendAudioUrl) {
          await onSendAudioUrl(attachedFile.url);
          // Send text as separate message if present
          const trimmed = text.trim();
          if (trimmed) {
            await onSend(trimmed);
          }
        } else if (onSendMedia) {
          await onSendMedia(attachedFile.url, text.trim(), attachedFile.type as MediaType);
        }

        setText("");
        setAttachedFile(null);
        setPendingImageUrl(null);
        setShowQuickReply(false);
      } catch {
        // handled upstream
      } finally {
        setSending(false);
      }
      return;
    }

    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      // Send pending image first
      if (pendingImageUrl && onSendMedia) {
        await onSendMedia(pendingImageUrl, "", "image");
        setPendingImageUrl(null);
      }
      await onSend(trimmed);
      setText("");
      setShowQuickReply(false);
    } catch {
      // handled upstream
    } finally {
      setSending(false);
    }
  }, [text, sending, onSend, onSendMedia, onSendAudioUrl, attachedFile, pendingImageUrl]);

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
    // If template has media, set it as attached file
    if (t.media_url && t.media_type && t.media_type !== "text") {
      const mediaStr = t.media_type as string;
      if (mediaStr === "audio") {
        setAttachedFile({ url: t.media_url, name: `${t.name}.audio`, type: "audio" });
      } else {
        const type: MediaType = mediaStr === "image" ? "image" : mediaStr === "video" ? "video" : "document";
        setAttachedFile({ url: t.media_url, name: `${t.name}.${t.media_type}`, type });
      }
    }
    // If template has an optional image, queue it to be sent before the main content
    if (t.image_url) {
      setPendingImageUrl(t.image_url);
    } else {
      setPendingImageUrl(null);
    }
    textareaRef.current?.focus();
  }, []);

  // ── File Attach ──
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máximo 100MB)");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const result = await uploadMedia(file, (pct) => setUploadProgress(pct));
      let fileType: MediaType = "document";
      if (file.type.startsWith("image/")) fileType = "image";
      else if (file.type.startsWith("video/")) fileType = "video";
      setAttachedFile({ url: result.url, name: file.name, type: fileType });
      toast.success(`Arquivo anexado: ${formatFileSize(result.size)}`);
    } catch (err: unknown) {
      logger.error("Erro no upload:", err);
      toast.error(`Erro no upload: ${err instanceof Error ? err.message : "Falha desconhecida"}`, { duration: 8000 });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={cancelRecording}>
            <MicOff className="h-4 w-4" />
          </Button>
          <div className="flex-1 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm text-foreground font-mono">{formatRecordingTime(recordingTime)}</span>
            <span className="text-xs text-muted-foreground">Gravando...</span>
          </div>
          <Button onClick={stopRecording} size="icon" className="h-8 w-8 bg-primary hover:bg-primary/90">
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

      {/* Attached file preview */}
      {attachedFile && (
        <div className="flex items-center gap-2 mb-2 px-1 py-1.5 rounded-lg bg-secondary/30 border border-border/30">
          {attachedFile.type === "image" ? (
            <Image className="w-4 h-4 text-blue-400 shrink-0" />
          ) : attachedFile.type === "video" ? (
            <Video className="w-4 h-4 text-purple-400 shrink-0" />
          ) : (
            <File className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span className="text-xs text-foreground truncate flex-1">{attachedFile.name}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setAttachedFile(null)}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Upload progress */}
      {isUploading && (
        <div className="mb-2 px-1">
          <Progress value={uploadProgress} className="h-1" />
          <p className="text-[10px] text-muted-foreground mt-0.5">Enviando arquivo...</p>
        </div>
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

        {/* File attach button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/ogg,audio/mp4,audio/wav,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
          disabled={disabled || isUploading}
          onClick={() => fileInputRef.current?.click()}
          title="Anexar arquivo"
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={attachedFile ? "Legenda (opcional)..." : 'Mensagem (use "/" para respostas rápidas)'}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-secondary rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring min-h-[36px] max-h-[120px]"
          style={{ overflow: "auto" }}
        />

        {/* Send or Record */}
        {text.trim() || attachedFile ? (
          <Button
            onClick={handleSend}
            disabled={sending || disabled || isUploading}
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
