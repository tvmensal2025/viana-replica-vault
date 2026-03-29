import { useState } from "react";
import { FileText, Plus, Trash2, Wand2, Image, Mic, File, Type, Play, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MessageTemplate, TemplateMediaType } from "@/types/whatsapp";

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
  onCreateTemplate: (name: string, content: string, mediaType?: string, mediaUrl?: string | null) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
}

export function TemplateManager({ templates, isLoading, onCreateTemplate, onDeleteTemplate }: TemplateManagerProps) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [mediaType, setMediaType] = useState<TemplateMediaType>("text");
  const [mediaUrl, setMediaUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<MessageTemplate | null>(null);

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
                    <p className="text-[10px] text-muted-foreground/50 mt-1 truncate font-mono">📎 {t.media_url}</p>
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
                  onClick={() => setMediaType(mt.value)}
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

          {/* Content field - always shown for text, optional caption for others */}
          <Textarea
            placeholder={mediaType === "text" ? "Conteúdo da mensagem..." : "Legenda / texto da mensagem (opcional)..."}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            disabled={isSaving}
            className="rounded-xl bg-secondary/30 border-border/40 resize-none"
          />

          {/* Media URL field */}
          {mediaType !== "text" && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                {mediaType === "image" && <><Image className="w-3.5 h-3.5 text-blue-400" /> URL da Imagem</>}
                {mediaType === "audio" && <><Mic className="w-3.5 h-3.5 text-orange-400" /> URL do Áudio (MP3, OGG)</>}
                {mediaType === "document" && <><File className="w-3.5 h-3.5 text-red-400" /> URL do Documento (PDF)</>}
              </label>
              <Input
                placeholder={
                  mediaType === "image" ? "https://exemplo.com/imagem.jpg" :
                  mediaType === "audio" ? "https://exemplo.com/audio.mp3" :
                  "https://exemplo.com/documento.pdf"
                }
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                disabled={isSaving}
                className="rounded-xl bg-secondary/50 border-border/50 font-mono text-xs"
              />
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

          {/* Info about typing simulation */}
          {mediaType === "text" && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/5 border border-green-500/15 px-3 py-2">
              <Play className="w-3.5 h-3.5 text-green-400 shrink-0" />
              <p className="text-[11px] text-green-400/80">Ao enviar, simulará "digitando..." antes da mensagem</p>
            </div>
          )}

          <Button
            onClick={handleCreate}
            disabled={!canSave || isSaving}
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