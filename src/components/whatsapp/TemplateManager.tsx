import { useState } from "react";
import { FileText, Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { MessageTemplate } from "@/types/whatsapp";

interface TemplateManagerProps {
  templates: MessageTemplate[]; isLoading: boolean;
  onCreateTemplate: (name: string, content: string) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
}

export function TemplateManager({ templates, isLoading, onCreateTemplate, onDeleteTemplate }: TemplateManagerProps) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim() || !content.trim()) return;
    setIsSaving(true);
    try { await onCreateTemplate(name.trim(), content.trim()); setName(""); setContent(""); } finally { setIsSaving(false); }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-purple-950/10">
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-purple-500/3 rounded-full blur-3xl" />
      <div className="relative p-5 sm:p-7">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center border border-purple-500/20">
            <Wand2 className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-foreground text-lg">Templates</h3>
            <p className="text-xs text-muted-foreground">Modelos de mensagens reutilizáveis</p>
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
                    <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <p className="text-sm font-bold text-foreground truncate">{t.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">{t.content}</p>
                </div>
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
            ))}
          </div>
        )}

        {/* Create form */}
        <div className="border-t border-border/30 pt-5 space-y-3">
          <p className="text-sm font-bold text-foreground flex items-center gap-2">
            <Plus className="w-4 h-4 text-purple-400" /> Novo Template
          </p>
          <Input placeholder="Nome do template" value={name} onChange={(e) => setName(e.target.value)} disabled={isSaving} className="rounded-xl bg-secondary/50 border-border/50" />
          <Textarea placeholder="Conteúdo da mensagem..." value={content} onChange={(e) => setContent(e.target.value)} rows={4} disabled={isSaving} className="rounded-xl bg-secondary/30 border-border/40 resize-none" />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Placeholders:</span>
            <code className="rounded-md bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-xs text-purple-400 font-mono">{"{{nome}}"}</code>
            <code className="rounded-md bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-xs text-purple-400 font-mono">{"{{valor_conta}}"}</code>
          </div>
          <Button onClick={handleCreate} disabled={!name.trim() || !content.trim() || isSaving} className="gap-2 rounded-xl h-11 font-bold shadow-lg shadow-green-500/10 transition-all" style={{ background: "var(--gradient-green)" }}>
            <Plus className="w-4 h-4" /> Salvar Template
          </Button>
        </div>
      </div>
    </div>
  );
}
