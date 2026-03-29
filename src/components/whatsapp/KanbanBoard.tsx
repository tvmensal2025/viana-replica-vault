import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";

interface Deal {
  id: string;
  consultant_id: string;
  customer_id: string | null;
  remote_jid: string | null;
  stage: string;
  notes: string | null;
  created_at: string;
}

interface KanbanStage {
  id: string;
  consultant_id: string;
  stage_key: string;
  label: string;
  color: string;
  position: number;
}

const DEFAULT_STAGES: Omit<KanbanStage, "id" | "consultant_id" | "created_at">[] = [
  { stage_key: "aprovado", label: "Aprovado", color: "bg-green-500/20 text-green-400", position: 0 },
  { stage_key: "reprovado", label: "Reprovado", color: "bg-red-500/20 text-red-400", position: 1 },
  { stage_key: "30_dias", label: "30 DIAS", color: "bg-blue-500/20 text-blue-400", position: 2 },
  { stage_key: "60_dias", label: "60 DIAS", color: "bg-cyan-500/20 text-cyan-400", position: 3 },
  { stage_key: "90_dias", label: "90 DIAS", color: "bg-yellow-500/20 text-yellow-400", position: 4 },
  { stage_key: "120_dias", label: "120 DIAS", color: "bg-orange-500/20 text-orange-400", position: 5 },
];

const COLOR_OPTIONS = [
  { value: "bg-green-500/20 text-green-400", label: "Verde" },
  { value: "bg-red-500/20 text-red-400", label: "Vermelho" },
  { value: "bg-blue-500/20 text-blue-400", label: "Azul" },
  { value: "bg-cyan-500/20 text-cyan-400", label: "Ciano" },
  { value: "bg-yellow-500/20 text-yellow-400", label: "Amarelo" },
  { value: "bg-orange-500/20 text-orange-400", label: "Laranja" },
  { value: "bg-purple-500/20 text-purple-400", label: "Roxo" },
  { value: "bg-pink-500/20 text-pink-400", label: "Rosa" },
  { value: "bg-teal-500/20 text-teal-400", label: "Teal" },
  { value: "bg-indigo-500/20 text-indigo-400", label: "Índigo" },
];

interface KanbanBoardProps {
  consultantId: string;
}

export function KanbanBoard({ consultantId }: KanbanBoardProps) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<KanbanStage[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [editingStage, setEditingStage] = useState<KanbanStage | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(COLOR_OPTIONS[2].value);
  const [addingNew, setAddingNew] = useState(false);
  const { toast } = useToast();

  const fetchStages = useCallback(async () => {
    const { data } = await supabase
      .from("kanban_stages")
      .select("*")
      .eq("consultant_id", consultantId)
      .order("position", { ascending: true });

    if (data && data.length > 0) {
      setStages(data as KanbanStage[]);
    } else {
      // Initialize with defaults
      const inserts = DEFAULT_STAGES.map((s) => ({
        ...s,
        consultant_id: consultantId,
      }));
      const { data: inserted } = await supabase
        .from("kanban_stages")
        .insert(inserts)
        .select();
      if (inserted) setStages(inserted as KanbanStage[]);
    }
  }, [consultantId]);

  const fetchDeals = useCallback(async () => {
    const { data } = await supabase
      .from("crm_deals")
      .select("*")
      .eq("consultant_id", consultantId)
      .order("created_at", { ascending: false });
    if (data) setDeals(data as Deal[]);
  }, [consultantId]);

  useEffect(() => {
    fetchStages();
    fetchDeals();
  }, [fetchStages, fetchDeals]);

  const handleDragStart = (id: string) => setDraggedId(id);

  const handleDrop = async (stageKey: string) => {
    if (!draggedId) return;
    const deal = deals.find((d) => d.id === draggedId);
    if (!deal || deal.stage === stageKey) {
      setDraggedId(null);
      return;
    }

    setDeals((prev) =>
      prev.map((d) => (d.id === draggedId ? { ...d, stage: stageKey } : d))
    );
    setDraggedId(null);

    const { error } = await supabase
      .from("crm_deals")
      .update({ stage: stageKey })
      .eq("id", draggedId);

    if (error) {
      toast({ title: "Erro ao mover deal", variant: "destructive" });
      fetchDeals();
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
      setStages((prev) => [...prev, data as KanbanStage]);
      setNewLabel("");
      setNewColor(COLOR_OPTIONS[2].value);
      setAddingNew(false);
      toast({ title: "Coluna criada!" });
    }
  };

  const handleUpdateStage = async (stage: KanbanStage) => {
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

  return (
    <div className="space-y-3">
      {/* Header with settings */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">CRM Kanban</h3>
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
              <Settings2 className="h-3.5 w-3.5" />
              Configurar Colunas
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">Configurar Colunas do Kanban</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {stages.map((stage) => (
                <div key={stage.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50">
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
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-primary"
                        onClick={() => handleUpdateStage(editingStage)}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground"
                        onClick={() => setEditingStage(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Badge variant="secondary" className={`text-[10px] ${stage.color}`}>
                        {stage.label}
                      </Badge>
                      <span className="flex-1" />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground hover:text-primary"
                        onClick={() => setEditingStage({ ...stage })}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteStage(stage.id, stage.stage_key)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              ))}

              {/* Add new stage */}
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
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-primary"
                    onClick={handleAddStage}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground"
                    onClick={() => {
                      setAddingNew(false);
                      setNewLabel("");
                    }}
                  >
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
                <Badge variant="secondary" className={`text-[10px] ${s.color}`}>
                  {s.label}
                </Badge>
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
