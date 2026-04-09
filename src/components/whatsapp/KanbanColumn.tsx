import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Zap } from "lucide-react";
import { KanbanDealCard } from "./KanbanDealCard";
import type { Tables } from "@/integrations/supabase/types";

type KanbanStageRow = Tables<"kanban_stages">;
type CrmDealRow = Tables<"crm_deals">;

interface KanbanColumnProps {
  stage: KanbanStageRow;
  deals: CrmDealRow[];
  searchQuery: string;
  onDrop: (stageKey: string) => void;
  onDragStart: (id: string) => void;
  onEditDeal: (deal: CrmDealRow) => void;
  onDeleteDeal: (id: string) => void;
}

export function KanbanColumn({ stage, deals, searchQuery, onDrop, onDragStart, onEditDeal, onDeleteDeal }: KanbanColumnProps) {
  const allStageDeals = deals.filter((d) => d.stage === stage.stage_key);
  const stageDeals = searchQuery.trim()
    ? allStageDeals.filter((d) => {
        const q = searchQuery.toLowerCase();
        const phone = d.remote_jid?.split("@")[0] || "";
        const notes = d.notes || "";
        const name = ((d as any).customer_name || "").toLowerCase();
        return phone.includes(q) || notes.toLowerCase().includes(q) || name.includes(q);
      })
    : allStageDeals;

  return (
    <div
      className="min-w-[200px] flex-1 bg-secondary/50 rounded-lg p-2"
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => onDrop(stage.stage_key)}
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className={`text-[10px] ${stage.color}`}>
            {stage.label}
          </Badge>
          {stage.auto_message_enabled && stage.auto_message_text && (
            <Zap className="h-2.5 w-2.5 text-primary/60" />
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">{stageDeals.length}</span>
      </div>
      <ScrollArea className="max-h-[400px]">
        <div className="space-y-2">
          {stageDeals.map((deal) => (
            <KanbanDealCard
              key={deal.id}
              deal={deal}
              onDragStart={onDragStart}
              onEdit={onEditDeal}
              onDelete={onDeleteDeal}
            />
          ))}
          {stageDeals.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-4">Vazio</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
