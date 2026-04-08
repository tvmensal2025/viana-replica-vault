import { Card } from "@/components/ui/card";
import { GripVertical, User, Pencil, Trash2, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Tables } from "@/integrations/supabase/types";

type CrmDealRow = Tables<"crm_deals">;

interface KanbanDealCardProps {
  deal: CrmDealRow;
  onDragStart: (id: string) => void;
  onEdit: (deal: CrmDealRow) => void;
  onDelete: (id: string) => void;
}

export function KanbanDealCard({ deal, onDragStart, onEdit, onDelete }: KanbanDealCardProps) {
  return (
    <Card
      draggable
      onDragStart={() => onDragStart(deal.id)}
      className="p-2.5 cursor-grab active:cursor-grabbing bg-card border-border hover:border-primary/30 transition-colors group"
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
          {deal.rejected_at && (
            <p className="text-[9px] text-muted-foreground mt-0.5">
              Reprovado: {new Date(deal.rejected_at).toLocaleDateString("pt-BR")}
              {deal.rejection_reason && ` (${deal.rejection_reason.replace(/_/g, " ")})`}
            </p>
          )}
          {deal.notes && (
            <p className="text-[10px] text-muted-foreground truncate mt-1">{deal.notes}</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-secondary/80 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem className="text-xs gap-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); onEdit(deal); }}>
              <Pencil className="h-3 w-3" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs gap-2 cursor-pointer text-destructive focus:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(deal.id); }}>
              <Trash2 className="h-3 w-3" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
