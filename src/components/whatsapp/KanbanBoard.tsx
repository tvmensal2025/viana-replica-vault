import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  GripVertical,
  User,
  Plus,
  Pencil,
  Trash2,
  Settings2,
  Check,
  X,
  Zap,
} from "lucide-react";
import { StageAutoMessageConfig } from "./StageAutoMessageConfig";
import { AddLeadDialog } from "./AddLeadDialog";
import { DropConfirmDialog } from "./DropConfirmDialog";
import { sendWhatsAppMessage, resolveRecipient } from "@/services/messageSender";
import type { MediaCategory } from "@/services/messageSender";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type KanbanStageRow = Tables<"kanban_stages">;
type KanbanStageInsert = TablesInsert<"kanban_stages">;
type KanbanStageUpdate = TablesUpdate<"kanban_stages">;
type CrmDealRow = Tables<"crm_deals">;
type CrmDealUpdate = TablesUpdate<"crm_deals">;

const DEFAULT_STAGES: Omit<KanbanStageInsert, "consultant_id">[] = [
  { stage_key: "novo_lead", label: "Novo Lead", color: "bg-purple-500/20 text-purple-400", position: 0, auto_message_text: null, auto_message_type: "text", auto_message_media_url: null, auto_message_enabled: true },
  { stage_key: "aprovado", label: "Aprovado", color: "bg-green-500/20 text-green-400", position: 1, auto_message_text: "Olá *{{nome}}*! 🎉\n\nSeu cadastro foi *aprovado* com sucesso!\n\nEm breve entraremos em contato.", auto_message_type: "text", auto_message_media_url: null, auto_message_enabled: true },
  { stage_key: "reprovado", label: "Reprovado", color: "bg-red-500/20 text-red-400", position: 2, auto_message_text: null, auto_message_type: "text", auto_message_media_url: null, auto_message_enabled: true },
  { stage_key: "30_dias", label: "30 DIAS", color: "bg-blue-500/20 text-blue-400", position: 3, auto_message_text: "Olá *{{nome}}*! 👋\n\nJá se passaram *30 dias* desde sua aprovação.\n\nComo está indo? Precisa de alguma ajuda?", auto_message_type: "text", auto_message_media_url: null, auto_message_enabled: true },
  { stage_key: "60_dias", label: "60 DIAS", color: "bg-cyan-500/20 text-cyan-400", position: 4, auto_message_text: "Olá *{{nome}}*! 🌱\n\nJá são *60 dias* desde sua aprovação!\n\nEstamos acompanhando seu progresso.", auto_message_type: "text", auto_message_media_url: null, auto_message_enabled: true },
  { stage_key: "90_dias", label: "90 DIAS", color: "bg-yellow-500/20 text-yellow-400", position: 5, auto_message_text: "Olá *{{nome}}*! ☀️\n\n*90 dias* de aprovação!\n\nComo está a economia na sua conta de luz?", auto_message_type: "text", auto_message_media_url: null, auto_message_enabled: true },
  { stage_key: "120_dias", label: "120 DIAS", color: "bg-orange-500/20 text-orange-400", position: 6, auto_message_text: "Olá *{{nome}}*! 🏆\n\n*120 dias* de aprovação!\n\nQue tal indicar um amigo e ganhar benefícios?", auto_message_type: "text", auto_message_media_url: null, auto_message_enabled: true },
  { stage_key: "reprovado_60_dias", label: "Reprovado 60 Dias", color: "bg-red-800/20 text-red-300", position: 7, auto_message_text: null, auto_message_type: "text", auto_message_media_url: null, auto_message_enabled: true },
];

const COLOR_OPTIONS = [
  { value: "bg-purple-500/20 text-purple-400", label: "Roxo" },
  { value: "bg-green-500/20 text-green-400", label: "Verde" },
  { value: "bg-red-500/20 text-red-400", label: "Vermelho" },
  { value: "bg-blue-500/20 text-blue-400", label: "Azul" },
  { value: "bg-cyan-500/20 text-cyan-400", label: "Ciano" },
  { value: "bg-yellow-500/20 text-yellow-400", label: "Amarelo" },
  { value: "bg-orange-500/20 text-orange-400", label: "Laranja" },
  { value: "bg-pink-500/20 text-pink-400", label: "Rosa" },
  { value: "bg-teal-500/20 text-teal-400", label: "Teal" },
  { value: "bg-indigo-500/20 text-indigo-400", label: "Índigo" },
];

interface KanbanBoardProps {
  consultantId: string;
  instanceName?: string | null;
}

export function KanbanBoard({ consultantId, instanceName }: KanbanBoardProps) {
  const [deals, setDeals] = useState<CrmDealRow[]>([]);
  const [stages, setStages] = useState<KanbanStageRow[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [editingStage, setEditingStage] = useState<KanbanStageRow | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(COLOR_OPTIONS[0].value);
  const [addingNew, setAddingNew] = useState(false);
  const [draggedStageId, setDraggedStageId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{ dealId: string; stageKey: string; stageId: string; stageLabel: string } | null>(null);
  const { toast } = useToast();

  const fetchStages = useCallback(async () => {
    const { data } = await supabase
      .from("kanban_stages")
      .select("*")
      .eq("consultant_id", consultantId)
      .order("position", { ascending: true });

    if (data && data.length > 0) {
      setStages(data);
    } else {
      const inserts: KanbanStageInsert[] = DEFAULT_STAGES.map((s) => ({
        ...s,
        consultant_id: consultantId,
      }));
      const { data: inserted } = await supabase
        .from("kanban_stages")
        .insert(inserts)
        .select();
      if (inserted) setStages(inserted);
    }
  }, [consultantId]);

  const fetchDeals = useCallback(async () => {
    const { data } = await supabase
      .from("crm_deals")
      .select("*")
      .eq("consultant_id", consultantId)
      .order("created_at", { ascending: false });
    if (data) setDeals(data);
  }, [consultantId]);

  useEffect(() => {
    fetchStages();
    fetchDeals();
  }, [fetchStages, fetchDeals]);

  const handleDragStart = (id: string) => setDraggedId(id);

  // Send auto-messages when deal moves to a stage (now supports multiple)
  const sendAutoMessages = async (stage: KanbanStageRow, deal: CrmDealRow) => {
    if (!stage.auto_message_enabled || !instanceName || !deal.remote_jid) return;

    // Fetch multi-messages from stage_auto_messages
    const { data: autoMsgs } = await supabase
      .from("stage_auto_messages")
      .select("*")
      .eq("stage_id", stage.id)
      .eq("consultant_id", consultantId)
      .order("position", { ascending: true });

    const phone = resolveRecipient(deal.remote_jid);

    // If no multi-messages, fall back to legacy single message
    const messagesToSend = autoMsgs && autoMsgs.length > 0
      ? autoMsgs
      : (stage.auto_message_text || stage.auto_message_media_url || (stage as any).auto_message_image_url)
        ? [{
            message_type: stage.auto_message_type || "text",
            message_text: stage.auto_message_text,
            media_url: stage.auto_message_media_url,
            image_url: (stage as any).auto_message_image_url,
            delay_seconds: 0,
          }]
        : [];

    if (messagesToSend.length === 0) return;

    try {
      for (let i = 0; i < messagesToSend.length; i++) {
        const msg = messagesToSend[i];
        if (i > 0 && msg.delay_seconds > 0) {
          await new Promise((r) => setTimeout(r, msg.delay_seconds * 1000));
        }

        const messageText = (msg.message_text || "")
          .replace(/\{\{nome\}\}/g, phone)
          .replace(/\{\{telefone\}\}/g, phone);
        const mediaCategory: MediaCategory = (msg.message_type as MediaCategory) || "text";

        // Send optional image first
        if (msg.image_url && mediaCategory !== "image") {
          await sendWhatsAppMessage({ instanceName, phone, mediaCategory: "image", mediaUrl: msg.image_url });
          await new Promise((r) => setTimeout(r, 1500));
        }

        if (mediaCategory === "audio" && msg.media_url) {
          await sendWhatsAppMessage({ instanceName, phone, mediaCategory: "audio", mediaUrl: msg.media_url });
          if (messageText) {
            await new Promise((r) => setTimeout(r, 1500));
            await sendWhatsAppMessage({ instanceName, phone, mediaCategory: "text", text: messageText });
          }
        } else if ((mediaCategory === "image" || mediaCategory === "video") && msg.media_url) {
          await sendWhatsAppMessage({ instanceName, phone, mediaCategory, mediaUrl: msg.media_url, text: messageText });
        } else if (messageText) {
          await sendWhatsAppMessage({ instanceName, phone, mediaCategory: "text", text: messageText });
        }
      }
      toast({ title: `✅ ${messagesToSend.length} msg(s) automática(s) enviada(s) (${stage.label})` });
    } catch {
      toast({ title: "Erro ao enviar msg automática", variant: "destructive" });
    }
  };

  const handleDrop = async (stageKey: string) => {
    if (!draggedId) return;
    const deal = deals.find((d) => d.id === draggedId);
    if (!deal || deal.stage === stageKey) {
      setDraggedId(null);
      return;
    }

    const updateData: CrmDealUpdate = { stage: stageKey };
    if (stageKey === "aprovado" && !deal.approved_at) {
      updateData.approved_at = new Date().toISOString();
    }
    if (stageKey === "reprovado" && !(deal as any).rejected_at) {
      (updateData as any).rejected_at = new Date().toISOString();
    }

    setDeals((prev) =>
      prev.map((d) => (d.id === draggedId ? { ...d, ...updateData } : d))
    );
    setDraggedId(null);

    const { error } = await supabase
      .from("crm_deals")
      .update(updateData)
      .eq("id", draggedId);

    if (error) {
      toast({ title: "Erro ao mover deal", variant: "destructive" });
      fetchDeals();
    } else {
      const targetStage = stages.find((s) => s.stage_key === stageKey);
      if (targetStage) {
        sendAutoMessages(targetStage, deal);
      }
    }
  };

  // ── Stage CRUD ──

  const handleAddStage = async () => {
    if (!newLabel.trim()) return;
    const stageKey = newLabel
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    const position = stages.length;

    const { data, error } = await supabase
      .from("kanban_stages")
      .insert({
        consultant_id: consultantId,
        stage_key: stageKey || `stage_${Date.now()}`,
        label: newLabel.trim(),
        color: newColor,
        position,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao criar coluna", variant: "destructive" });
    } else if (data) {
      setStages((prev) => [...prev, data]);
      setNewLabel("");
      setNewColor(COLOR_OPTIONS[0].value);
      setAddingNew(false);
      toast({ title: "Coluna criada!" });
    }
  };

  const handleUpdateStage = async (stage: KanbanStageRow) => {
    const { error } = await supabase
      .from("kanban_stages")
      .update({ label: stage.label, color: stage.color })
      .eq("id", stage.id);

    if (error) {
      toast({ title: "Erro ao editar coluna", variant: "destructive" });
    } else {
      setStages((prev) =>
        prev.map((s) => (s.id === stage.id ? stage : s))
      );
      setEditingStage(null);
      toast({ title: "Coluna atualizada!" });
    }
  };

  const handleDeleteStage = async (stageId: string, stageKey: string) => {
    const dealsInStage = deals.filter((d) => d.stage === stageKey);
    if (dealsInStage.length > 0) {
      toast({
        title: "Mova os deals antes de excluir",
        description: `Existem ${dealsInStage.length} deal(s) nesta coluna.`,
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase
      .from("kanban_stages")
      .delete()
      .eq("id", stageId);

    if (error) {
      toast({ title: "Erro ao excluir coluna", variant: "destructive" });
    } else {
      setStages((prev) => prev.filter((s) => s.id !== stageId));
      toast({ title: "Coluna excluída!" });
    }
  };

  const handleSaveAutoMessage = async (
    stageId: string,
    text: string | null,
    type: string,
    mediaUrl: string | null,
    imageUrl: string | null
  ) => {
    const { error } = await supabase
      .from("kanban_stages")
      .update({
        auto_message_text: text,
        auto_message_type: type,
        auto_message_media_url: mediaUrl,
        auto_message_image_url: imageUrl,
      } as any)
      .eq("id", stageId);

    if (error) {
      toast({ title: "Erro ao salvar msg automática", variant: "destructive" });
    } else {
      setStages((prev) =>
        prev.map((s) =>
          s.id === stageId
            ? { ...s, auto_message_text: text, auto_message_type: type, auto_message_media_url: mediaUrl, auto_message_image_url: imageUrl } as any
            : s
        )
      );
    }
  };

  const handleToggleAutoMessage = async (stageId: string, enabled: boolean) => {
    const { error } = await supabase
      .from("kanban_stages")
      .update({ auto_message_enabled: enabled })
      .eq("id", stageId);

    if (error) {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    } else {
      setStages((prev) =>
        prev.map((s) =>
          s.id === stageId ? { ...s, auto_message_enabled: enabled } : s
        )
      );
    }
  };

  const handleStageDragStart = (stageId: string) => {
    setDraggedStageId(stageId);
  };

  const handleStageDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    if (draggedStageId && draggedStageId !== stageId) {
      setDragOverStageId(stageId);
    }
  };

  const handleStageDrop = async (targetStageId: string) => {
    if (!draggedStageId || draggedStageId === targetStageId) {
      setDraggedStageId(null);
      setDragOverStageId(null);
      return;
    }

    const fromIndex = stages.findIndex((s) => s.id === draggedStageId);
    const toIndex = stages.findIndex((s) => s.id === targetStageId);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...stages];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    const updated = reordered.map((s, i) => ({ ...s, position: i }));
    setStages(updated);
    setDraggedStageId(null);
    setDragOverStageId(null);

    for (const s of updated) {
      await supabase
        .from("kanban_stages")
        .update({ position: s.position })
        .eq("id", s.id);
    }
    toast({ title: "Ordem das colunas atualizada!" });
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">CRM Kanban</h3>
          <Badge variant="secondary" className="text-[9px] gap-1">
            <Zap className="h-2.5 w-2.5" />
            Auto-progressão ativa
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <AddLeadDialog
            consultantId={consultantId}
            stages={stages.map((s) => ({ stage_key: s.stage_key, label: s.label, color: s.color }))}
            onLeadAdded={fetchDeals}
          />
          <Dialog open={showSettings} onOpenChange={setShowSettings}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                <Settings2 className="h-3.5 w-3.5" />
                Configurar Colunas
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-sm">Configurar Colunas do Kanban</DialogTitle>
              </DialogHeader>
              <p className="text-[11px] text-muted-foreground -mt-1">
                Leads aprovados progridem automaticamente para 30 → 60 → 90 → 120 DIAS.
                Reprovados progridem para "Reprovado 60 Dias" após 60 dias.
                Cada coluna pode ter múltiplas mensagens automáticas.
              </p>
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {stages.map((stage) => (
                  <div
                    key={stage.id}
                    draggable={!editingStage}
                    onDragStart={() => handleStageDragStart(stage.id)}
                    onDragOver={(e) => handleStageDragOver(e, stage.id)}
                    onDrop={() => handleStageDrop(stage.id)}
                    onDragEnd={() => { setDraggedStageId(null); setDragOverStageId(null); }}
                    className={`flex items-center gap-2 p-2.5 rounded-lg bg-secondary/50 transition-all ${
                      draggedStageId === stage.id ? "opacity-50 scale-95" : ""
                    } ${dragOverStageId === stage.id ? "border-2 border-primary/40 border-dashed" : ""} ${
                      !editingStage ? "cursor-grab active:cursor-grabbing" : ""
                    }`}
                  >
                    {!editingStage && (
                      <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                    )}
                    {editingStage?.id === stage.id ? (
                      <>
                        <Input
                          value={editingStage.label}
                          onChange={(e) =>
                            setEditingStage({ ...editingStage, label: e.target.value })
                          }
                          className="h-7 text-xs flex-1"
                        />
                        <select
                          value={editingStage.color}
                          onChange={(e) =>
                            setEditingStage({ ...editingStage, color: e.target.value })
                          }
                          className="h-7 text-xs bg-background border border-border rounded px-1"
                        >
                          {COLOR_OPTIONS.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-primary" onClick={() => handleUpdateStage(editingStage)}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => setEditingStage(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Badge variant="secondary" className={`text-[10px] ${stage.color}`}>
                          {stage.label}
                        </Badge>

                        {/* Auto-message toggle */}
                        <Switch
                          checked={stage.auto_message_enabled}
                          onCheckedChange={(checked) => handleToggleAutoMessage(stage.id, checked)}
                          className="h-4 w-7 data-[state=checked]:bg-primary"
                        />

                        {/* Auto-message config - now multi-message */}
                        <StageAutoMessageConfig
                          stageId={stage.id}
                          stageLabel={stage.label}
                          stageKey={stage.stage_key}
                          consultantId={consultantId}
                          autoMessageText={stage.auto_message_text}
                          autoMessageType={stage.auto_message_type || "text"}
                          autoMessageMediaUrl={stage.auto_message_media_url}
                          autoMessageImageUrl={(stage as any).auto_message_image_url}
                          onSave={(text, type, mediaUrl, imageUrl) =>
                            handleSaveAutoMessage(stage.id, text, type, mediaUrl, imageUrl)
                          }
                        />

                        <span className="flex-1" />
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={() => setEditingStage({ ...stage })}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteStage(stage.id, stage.stage_key)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}

                {addingNew ? (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50 border border-dashed border-primary/30">
                    <Input
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="Nome da coluna"
                      className="h-7 text-xs flex-1"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleAddStage()}
                    />
                    <select
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="h-7 text-xs bg-background border border-border rounded px-1"
                    >
                      {COLOR_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-primary" onClick={handleAddStage}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => { setAddingNew(false); setNewLabel(""); }}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs gap-1.5 border-dashed"
                    onClick={() => setAddingNew(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar Coluna
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Kanban columns */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {stages.map((s) => {
          const stageDeals = deals.filter((d) => d.stage === s.stage_key);
          return (
            <div
              key={s.id}
              className="min-w-[200px] flex-1 bg-secondary/50 rounded-lg p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(s.stage_key)}
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className={`text-[10px] ${s.color}`}>
                    {s.label}
                  </Badge>
                  {s.auto_message_enabled && s.auto_message_text && (
                    <Zap className="h-2.5 w-2.5 text-primary/60" />
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">{stageDeals.length}</span>
              </div>
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-2">
                  {stageDeals.map((deal) => (
                    <Card
                      key={deal.id}
                      draggable
                      onDragStart={() => handleDragStart(deal.id)}
                      className="p-2.5 cursor-grab active:cursor-grabbing bg-card border-border hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs font-medium text-foreground truncate">
                              {deal.remote_jid?.split("@")[0] || "Sem contato"}
                            </span>
                          </div>
                          {deal.approved_at && (
                            <p className="text-[9px] text-muted-foreground mt-0.5">
                              Aprovado: {new Date(deal.approved_at).toLocaleDateString("pt-BR")}
                            </p>
                          )}
                          {(deal as any).rejected_at && (
                            <p className="text-[9px] text-muted-foreground mt-0.5">
                              Reprovado: {new Date((deal as any).rejected_at).toLocaleDateString("pt-BR")}
                            </p>
                          )}
                          {deal.notes && (
                            <p className="text-[10px] text-muted-foreground truncate mt-1">
                              {deal.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                  {stageDeals.length === 0 && (
                    <p className="text-[10px] text-muted-foreground text-center py-4">
                      Vazio
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>
    </div>
  );
}
