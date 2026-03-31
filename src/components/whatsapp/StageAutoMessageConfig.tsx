import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MessageSquare, Image, Video, Mic, X, Check, Bold, Upload, Loader2 } from "lucide-react";
import { uploadMedia, getAcceptString, formatFileSize } from "@/services/minioUpload";
import { useToast } from "@/hooks/use-toast";

interface StageAutoMessageConfigProps {
  stageLabel: string;
  autoMessageText: string | null;
  autoMessageType: string;
  autoMessageMediaUrl: string | null;
  onSave: (text: string | null, type: string, mediaUrl: string | null) => void;
}

const MESSAGE_TYPES = [
  { key: "text", label: "Texto", icon: MessageSquare },
  { key: "image", label: "Imagem", icon: Image },
  { key: "video", label: "Vídeo", icon: Video },
  { key: "audio", label: "Áudio", icon: Mic },
];

export function StageAutoMessageConfig({
  stageLabel,
  autoMessageText,
  autoMessageType,
  autoMessageMediaUrl,
  onSave,
}: StageAutoMessageConfigProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(autoMessageText || "");
  const [type, setType] = useState(autoMessageType || "text");
  const [mediaUrl, setMediaUrl] = useState(autoMessageMediaUrl || "");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const result = await uploadMedia(file, (pct) => setUploadProgress(pct));
      setMediaUrl(result.url);
      toast({ title: "Upload concluído", description: `${file.name} (${formatFileSize(file.size)})` });
    } catch (err: unknown) {
      toast({ title: "Erro no upload", description: err instanceof Error ? err.message : "Falha", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setText(autoMessageText || "");
      setType(autoMessageType || "text");
      setMediaUrl(autoMessageMediaUrl || "");
    }
    setOpen(isOpen);
  };

  const handleSave = () => {
    onSave(
      text.trim() || null,
      type,
      mediaUrl.trim() || null
    );
    setOpen(false);
  };

  const handleClear = () => {
    onSave(null, "text", null);
    setOpen(false);
  };

  const insertBold = () => {
    const textarea = document.getElementById("auto-msg-textarea") as HTMLTextAreaElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = text.substring(start, end);
    const newText = text.substring(0, start) + `*${selected || "texto"}*` + text.substring(end);
    setText(newText);
  };

  const insertItalic = () => {
    const textarea = document.getElementById("auto-msg-textarea") as HTMLTextAreaElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = text.substring(start, end);
    const newText = text.substring(0, start) + `_${selected || "texto"}_` + text.substring(end);
    setText(newText);
  };

  const hasAutoMessage = !!autoMessageText;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-5 w-5 ${hasAutoMessage ? "text-primary" : "text-muted-foreground/50 hover:text-muted-foreground"}`}
          title={hasAutoMessage ? "Mensagem automática configurada" : "Configurar mensagem automática"}
        >
          <MessageSquare className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            Mensagem Automática
            <Badge variant="secondary" className="text-[10px]">{stageLabel}</Badge>
          </DialogTitle>
        </DialogHeader>

        <p className="text-[11px] text-muted-foreground -mt-1">
          Quando um lead for movido para esta coluna, a mensagem abaixo será enviada automaticamente.
        </p>

        {/* Message type selector */}
        <div className="flex gap-1.5">
          {MESSAGE_TYPES.map((mt) => {
            const Icon = mt.icon;
            return (
              <Button
                key={mt.key}
                variant={type === mt.key ? "default" : "outline"}
                size="sm"
                className="h-7 text-[10px] gap-1 flex-1"
                onClick={() => setType(mt.key)}
              >
                <Icon className="h-3 w-3" />
                {mt.label}
              </Button>
            );
          })}
        </div>

        {/* Media URL for non-text types */}
        {type !== "text" && (
          <Input
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder={
              type === "image" ? "URL da imagem (https://...)" :
              type === "video" ? "URL do vídeo (https://...)" :
              "URL do áudio (https://...)"
            }
            className="h-8 text-xs"
          />
        )}

        {/* Formatting toolbar */}
        <div className="flex items-center gap-1 border border-border rounded-t-md px-2 py-1 bg-secondary/30 -mb-2">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={insertBold} title="Negrito *texto*">
            <Bold className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={insertItalic} title="Itálico _texto_">
            <span className="text-xs italic font-serif">I</span>
          </Button>
          <span className="text-[9px] text-muted-foreground ml-auto">
            Use *negrito* e _itálico_ • Variáveis: {"{{nome}}"}, {"{{telefone}}"}
          </span>
        </div>

        {/* Message text */}
        <Textarea
          id="auto-msg-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Ex: Olá *{{nome}}*! 🎉\n\nSeu cadastro foi _aprovado_ com sucesso!\n\nEm breve entraremos em contato.`}
          className="min-h-[120px] text-xs rounded-t-none -mt-2 resize-none"
        />

        {/* Preview */}
        {text && (
          <div className="bg-secondary/50 rounded-lg p-3 border border-border">
            <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">Pré-visualização:</p>
            <div className="text-xs text-foreground whitespace-pre-wrap"
              dangerouslySetInnerHTML={{
                __html: text
                  .replace(/\*(.*?)\*/g, "<strong>$1</strong>")
                  .replace(/_(.*?)_/g, "<em>$1</em>")
                  .replace(/\{\{nome\}\}/g, "<span class='text-primary'>João Silva</span>")
                  .replace(/\{\{telefone\}\}/g, "<span class='text-primary'>11999998888</span>")
              }}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {hasAutoMessage && (
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1 text-destructive" onClick={handleClear}>
              <X className="h-3 w-3" />
              Remover
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1" onClick={handleSave}>
            <Check className="h-3 w-3" />
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
