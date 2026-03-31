import { useState, useRef, useCallback } from "react";
import { FileText, Plus, Trash2, Wand2, Image, Mic, File, Type, Play, Eye, Upload, Loader2, CheckCircle2, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { MessageTemplate, TemplateMediaType } from "@/types/whatsapp";
import { uploadMedia, getAcceptString, formatFileSize } from "@/services/minioUpload";
import { toast } from "sonner";

const MEDIA_TYPES: { value: TemplateMediaType; label: string; icon: React.ElementType; desc: string }[] = [
  { value: "text", label: "Texto", icon: Type, desc: "Mensagem de texto com simulação de digitação" },
  { value: "image", label: "Imagem", icon: Image, desc: "Envia imagem com legenda opcional" },
  { value: "audio", label: "Áudio", icon: Mic, desc: "Envia áudio MP3/OGG como mensagem de voz" },
  { value: "document", label: "Documento", icon: File, desc: "Envia PDF ou outro documento" },
];

function mediaIcon(type: TemplateMediaType) {
  switch (type) {
    case "image": return <Image className="w-3.5 h-3.5 text-blue-400" />;
    case "audio": return <Mic className="w-3.5 h-3.5 text-orange-400" />;
    case "document": return <File className="w-3.5 h-3.5 text-red-400" />;
    default: return <Type className="w-3.5 h-3.5 text-purple-400" />;
  }
}

function mediaBadge(type: TemplateMediaType) {
  const colors: Record<TemplateMediaType, string> = {
    text: "bg-purple-500/15 text-purple-400 border-purple-500/20",
    image: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    audio: "bg-orange-500/15 text-orange-400 border-orange-500/20",
    document: "bg-red-500/15 text-red-400 border-red-500/20",
  };
  const labels: Record<TemplateMediaType, string> = { text: "Texto", image: "Imagem", audio: "Áudio", document: "PDF" };
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${colors[type]}`}>
      {labels[type]}
    </span>
  );
}

interface TemplateManagerProps {
  templates: MessageTemplate[];
  isLoading: boolean;
  onCreateTemplate: (name: string, content: string, mediaType?: string, mediaUrl?: string | null, imageUrl?: string | null) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
}

export function TemplateManager({ templates, isLoading, onCreateTemplate, onDeleteTemplate }: TemplateManagerProps) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [mediaType, setMediaType] = useState<TemplateMediaType>("text");
  const [mediaUrl, setMediaUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<MessageTemplate | null>(null);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const formatRecordingTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

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
        const file = Object.assign(blob, { name: `gravacao_${Date.now()}.webm`, lastModified: Date.now() }) as unknown as File;

        setIsUploading(true);
        setUploadProgress(0);
        setUploadedFileName(file.name);
        try {
          const result = await uploadMedia(file, (pct) => setUploadProgress(pct));
          setMediaUrl(result.url);
          toast.success(`Áudio gravado e enviado: ${formatFileSize(result.size)}`);
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : "Erro no upload do áudio");
          setUploadedFileName("");
        } finally {
          setIsUploading(false);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  }, []);

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

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máximo 100MB)");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadedFileName(file.name);

    try {
      const result = await uploadMedia(file, (pct) => setUploadProgress(pct));
      setMediaUrl(result.url);
      toast.success(`Arquivo enviado: ${formatFileSize(result.size)}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro no upload");
      setUploadedFileName("");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleCreate() {
    if (!name.trim()) return;
    if (mediaType === "text" && !content.trim()) return;
    if (mediaType !== "text" && !mediaUrl.trim()) return;
    setIsSaving(true);
    try {
      await onCreateTemplate(
        name.trim(),
        content.trim(),
        mediaType,
        mediaType !== "text" ? mediaUrl.trim() : null
      );
      setName("");
      setContent("");
      setMediaType("text");
      setMediaUrl("");
      setUploadedFileName("");
    } finally {
      setIsSaving(false);
    }
  }

  const canSave = name.trim() && (
    (mediaType === "text" && content.trim()) ||
    (mediaType !== "text" && mediaUrl.trim())
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-purple-950/10">
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-purple-500/3 rounded-full blur-3xl" />
      <div className="relative p-5 sm:p-7">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center border border-purple-500/20">
            <Wand2 className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-foreground text-lg">Templates</h3>
            <p className="text-xs text-muted-foreground">Texto, áudio, imagem e documentos personalizáveis</p>
          </div>
        </div>

        {/* Templates list */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum template salvo</p>
        ) : (
          <div className="space-y-2 mb-5">
            {templates.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-3 rounded-xl border border-border/40 bg-secondary/20 px-4 py-3 group hover:border-purple-500/20 transition-all">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {mediaIcon(t.media_type || "text")}
                    <p className="text-sm font-bold text-foreground truncate">{t.name}</p>
                    {mediaBadge(t.media_type || "text")}
                  </div>
                  {t.content && (
                    <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">{t.content}</p>
                  )}
                  {t.media_url && (
                    <div className="mt-2">
                      {(t.media_type === "image") && (
                        <img src={t.media_url} alt={t.name} className="rounded-md max-h-20 object-contain border border-border/20" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      )}
                      {(t.media_type === "audio") && (
                        <audio controls src={t.media_url} className="w-full h-8 max-w-[240px]" />
                      )}
                      {(t.media_type === "document") && (
                        <a href={t.media_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-400 hover:underline flex items-center gap-1">
                          <File className="w-3 h-3" /> Abrir documento
                        </a>
                      )}
                      {!["image", "audio", "document"].includes(t.media_type || "") && (
                        <p className="text-[10px] text-muted-foreground/50 truncate font-mono">📎 {t.media_url}</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPreviewTemplate(t)}
                    className="text-muted-foreground hover:text-foreground h-8 w-8 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="shrink-0 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 h-8 w-8 opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir template</AlertDialogTitle>
                        <AlertDialogDescription>Excluir "{t.name}"? Essa ação não pode ser desfeita.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onDeleteTemplate(t.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create form */}
        <div className="border-t border-border/30 pt-5 space-y-4">
          <p className="text-sm font-bold text-foreground flex items-center gap-2">
            <Plus className="w-4 h-4 text-purple-400" /> Novo Template
          </p>

          {/* Media type selector */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {MEDIA_TYPES.map((mt) => {
              const Icon = mt.icon;
              const isActive = mediaType === mt.value;
              return (
                <button
                  key={mt.value}
                  onClick={() => {
                    setMediaType(mt.value);
                    setMediaUrl("");
                    setUploadedFileName("");
                  }}
                  disabled={isSaving}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all text-center ${
                    isActive
                      ? "border-purple-500/50 bg-purple-500/10 shadow-lg shadow-purple-500/5"
                      : "border-border/40 bg-secondary/10 hover:border-border/60 hover:bg-secondary/20"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? "text-purple-400" : "text-muted-foreground"}`} />
                  <span className={`text-xs font-bold ${isActive ? "text-purple-400" : "text-muted-foreground"}`}>{mt.label}</span>
                </button>
              );
            })}
          </div>

          <Input
            placeholder="Nome do template"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSaving}
            className="rounded-xl bg-secondary/50 border-border/50"
          />

          {/* Content field */}
          <Textarea
            placeholder={mediaType === "text" ? "Conteúdo da mensagem..." : "Legenda / texto da mensagem (opcional)..."}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            disabled={isSaving}
            className="rounded-xl bg-secondary/30 border-border/40 resize-none"
          />

          {/* Media Upload + URL field */}
          {mediaType !== "text" && (
            <div className="space-y-3">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                {mediaType === "image" && <><Image className="w-3.5 h-3.5 text-blue-400" /> Imagem</>}
                {mediaType === "audio" && <><Mic className="w-3.5 h-3.5 text-orange-400" /> Áudio (MP3, OGG)</>}
                {mediaType === "document" && <><File className="w-3.5 h-3.5 text-red-400" /> Documento (PDF)</>}
              </label>

              {/* Upload button */}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={getAcceptString(mediaType)}
                  onChange={handleFileUpload}
                  disabled={isSaving || isUploading}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSaving || isUploading}
                  className="gap-2 rounded-xl border-dashed border-2 border-border/60 hover:border-purple-500/40 hover:bg-purple-500/5 flex-1 h-12"
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                  ) : uploadedFileName ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  ) : (
                    <Upload className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="text-xs truncate">
                    {isUploading
                      ? "Enviando..."
                      : uploadedFileName
                      ? uploadedFileName
                      : "Clique para enviar arquivo"}
                  </span>
                </Button>
              </div>

              {/* Record audio button (only for audio type) */}
              {mediaType === "audio" && (
                <div className="space-y-2">
                  {isRecording ? (
                    <div className="flex items-center gap-3 rounded-xl border-2 border-red-500/40 bg-red-500/5 px-4 py-3 animate-pulse">
                      <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-sm font-bold text-red-400 tabular-nums">{formatRecordingTime(recordingTime)}</span>
                      <span className="text-xs text-muted-foreground">Gravando...</span>
                      <div className="ml-auto flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={cancelRecording}
                          className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={stopRecording}
                          className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Square className="w-4 h-4 fill-current" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={startRecording}
                      disabled={isSaving || isUploading}
                      className="gap-2 rounded-xl border-dashed border-2 border-orange-500/30 hover:border-orange-500/50 hover:bg-orange-500/5 w-full h-12"
                    >
                      <Mic className="w-4 h-4 text-orange-400" />
                      <span className="text-xs text-orange-400 font-bold">Gravar áudio agora</span>
                    </Button>
                  )}
                </div>
              )}

              {/* Upload progress */}
              {isUploading && (
                <Progress value={uploadProgress} className="h-1.5" />
              )}

              {/* Preview of uploaded file */}
              {mediaUrl && !isUploading && (
                <div className="rounded-lg border border-border/30 bg-secondary/10 p-2 overflow-hidden">
                  {mediaType === "image" && (
                    <img src={mediaUrl} alt="Preview" className="rounded-lg max-h-32 object-contain" onError={(e) => { (e.target as HTMLImageElement).replaceWith(Object.assign(document.createElement("p"), { className: "text-xs text-muted-foreground py-2", textContent: "⚠️ Não foi possível carregar preview" })); }} />
                  )}
                  {mediaType === "audio" && (
                    <audio controls src={mediaUrl} className="w-full h-8" />
                  )}
                  {mediaType === "document" && (
                    <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                      <File className="w-3.5 h-3.5" /> Abrir documento
                    </a>
                  )}
                </div>
              )}

              {/* Manual URL fallback */}
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground/60">Ou cole uma URL manualmente:</p>
                <Input
                  placeholder="https://exemplo.com/arquivo..."
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  disabled={isSaving || isUploading}
                  className="rounded-xl bg-secondary/50 border-border/50 font-mono text-xs"
                />
              </div>

              <p className="text-[10px] text-muted-foreground/60">
                {mediaType === "audio" && "Formatos aceitos: MP3, OGG. Será enviado como mensagem de voz."}
                {mediaType === "image" && "Formatos aceitos: JPG, PNG, WEBP."}
                {mediaType === "document" && "Formatos aceitos: PDF, DOCX, XLSX."}
              </p>
            </div>
          )}

          {/* Placeholders */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Placeholders:</span>
            <code className="rounded-md bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-xs text-purple-400 font-mono">{"{{nome}}"}</code>
            <code className="rounded-md bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-xs text-purple-400 font-mono">{"{{valor_conta}}"}</code>
          </div>

          {/* Typing simulation info */}
          {mediaType === "text" && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/5 border border-green-500/15 px-3 py-2">
              <Play className="w-3.5 h-3.5 text-green-400 shrink-0" />
              <p className="text-[11px] text-green-400/80">Ao enviar, simulará "digitando..." antes da mensagem</p>
            </div>
          )}

          <Button
            onClick={handleCreate}
            disabled={!canSave || isSaving || isUploading}
            className="gap-2 rounded-xl h-11 font-bold shadow-lg shadow-green-500/10 transition-all w-full sm:w-auto"
            style={{ background: "var(--gradient-green)" }}
          >
            <Plus className="w-4 h-4" /> Salvar Template
          </Button>
        </div>
      </div>

      {/* Preview dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {previewTemplate && mediaIcon(previewTemplate.media_type || "text")}
              {previewTemplate?.name}
            </DialogTitle>
          </DialogHeader>
          {previewTemplate && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {mediaBadge(previewTemplate.media_type || "text")}
                {previewTemplate.media_type === "text" && (
                  <span className="text-[10px] text-green-400/80 flex items-center gap-1">
                    <Play className="w-3 h-3" /> Simulação de digitação
                  </span>
                )}
              </div>

              {previewTemplate.media_url && (
                <div className="rounded-lg border border-border/40 bg-secondary/20 p-3">
                  <p className="text-[10px] text-muted-foreground mb-1 font-bold">Mídia anexada:</p>
                  {previewTemplate.media_type === "image" && (
                    <img src={previewTemplate.media_url} alt="Preview" className="rounded-lg max-h-40 object-contain" />
                  )}
                  {previewTemplate.media_type === "audio" && (
                    <audio controls src={previewTemplate.media_url} className="w-full h-10" />
                  )}
                  {previewTemplate.media_type === "document" && (
                    <a href={previewTemplate.media_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                      <File className="w-3.5 h-3.5" /> Abrir documento
                    </a>
                  )}
                </div>
              )}

              {previewTemplate.content && (
                <div className="rounded-xl bg-green-900/20 border border-green-500/10 px-4 py-3 max-w-[280px]">
                  <p className="text-sm text-foreground whitespace-pre-wrap">{previewTemplate.content}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
