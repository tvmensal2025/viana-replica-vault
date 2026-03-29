import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { GripVertical, User, MessageSquare } from "lucide-react";
import { useEffect } from "react";

interface Deal {
  id: string;
  consultant_id: string;
  customer_id: string | null;
  remote_jid: string | null;
  stage: string;
  notes: string | null;
  created_at: string;
}

const STAGES = [
  { key: "novo_lead", label: "Novo Lead", color: "bg-blue-500/20 text-blue-400" },
  { key: "em_contato", label: "Em Contato", color: "bg-yellow-500/20 text-yellow-400" },
  { key: "negociacao", label: "Negociação", color: "bg-orange-500/20 text-orange-400" },
  { key: "fechado", label: "Fechado", color: "bg-green-500/20 text-green-400" },
  { key: "perdido", label: "Perdido", color: "bg-red-500/20 text-red-400" },
];

interface KanbanBoardProps {
  consultantId: string;
}

export function KanbanBoard({ consultantId }: KanbanBoardProps) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchDeals = useCallback(async () => {
    const { data } = await supabase
      .from("crm_deals")
      .select("*")
      .eq("consultant_id", consultantId)
      .order("created_at", { ascending: false });
    if (data) setDeals(data as Deal[]);
  }, [consultantId]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  const handleDragStart = (id: string) => setDraggedId(id);

  const handleDrop = async (stage: string) => {
    if (!draggedId) return;
    const deal = deals.find((d) => d.id === draggedId);
    if (!deal || deal.stage === stage) {
      setDraggedId(null);
      return;
    }

    // Optimistic update
    setDeals((prev) =>
      prev.map((d) => (d.id === draggedId ? { ...d, stage } : d))
    );
    setDraggedId(null);

    const { error } = await supabase
      .from("crm_deals")
      .update({ stage })
      .eq("id", draggedId);

    if (error) {
      toast({ title: "Erro ao mover deal", variant: "destructive" });
      fetchDeals();
    }
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {STAGES.map((s) => {
        const stageDeals = deals.filter((d) => d.stage === s.key);
        return (
          <div
            key={s.key}
            className="min-w-[220px] flex-1 bg-secondary/50 rounded-lg p-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(s.key)}
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
  );
}
