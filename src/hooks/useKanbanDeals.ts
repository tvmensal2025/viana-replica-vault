import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";

type CrmDealRow = Tables<"crm_deals">;
type CrmDealUpdate = TablesUpdate<"crm_deals">;

export function useKanbanDeals(consultantId: string) {
  const [deals, setDeals] = useState<CrmDealRow[]>([]);
  const { toast } = useToast();

  const fetchDeals = useCallback(async () => {
    const { data } = await supabase
      .from("crm_deals")
      .select("*")
      .eq("consultant_id", consultantId)
      .order("created_at", { ascending: false });
    if (data) setDeals(data);
  }, [consultantId]);

  const moveDeal = async (dealId: string, stageKey: string, rejectionReason?: string) => {
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return null;

    const updateData: CrmDealUpdate = { stage: stageKey };
    if (stageKey === "aprovado") {
      updateData.approved_at = new Date().toISOString();
      (updateData as any).deal_origin = "aprovado";
      (updateData as any).rejected_at = null;
      (updateData as any).rejection_reason = null;
    }
    if (stageKey === "reprovado") {
      (updateData as any).rejected_at = new Date().toISOString();
      (updateData as any).deal_origin = "reprovado";
    }
    if (rejectionReason) {
      (updateData as any).rejection_reason = rejectionReason;
    }

    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, ...updateData } : d)));

    const { error } = await supabase.from("crm_deals").update(updateData).eq("id", dealId);
    if (error) {
      toast({ title: "Erro ao mover deal", variant: "destructive" });
      fetchDeals();
      return null;
    }
    return { ...deal, ...updateData } as CrmDealRow;
  };

  const editDeal = async (dealId: string, phone: string, notes: string, originalJid: string | null) => {
    const newJid = phone.replace(/\D/g, "");
    const { error } = await supabase.from("crm_deals").update({
      remote_jid: newJid ? `${newJid}@s.whatsapp.net` : originalJid,
      notes: notes || null,
    }).eq("id", dealId);
    if (error) {
      toast({ title: "Erro ao editar deal", variant: "destructive" });
    } else {
      setDeals((prev) => prev.map((d) => d.id === dealId ? { ...d, remote_jid: newJid ? `${newJid}@s.whatsapp.net` : d.remote_jid, notes: notes || null } : d));
      toast({ title: "Deal atualizado!" });
    }
  };

  const deleteDeal = async (dealId: string) => {
    const { error } = await supabase.from("crm_deals").delete().eq("id", dealId);
    if (error) {
      toast({ title: "Erro ao excluir deal", variant: "destructive" });
    } else {
      setDeals((prev) => prev.filter((d) => d.id !== dealId));
      toast({ title: "Deal excluído!" });
    }
  };

  return { deals, setDeals, fetchDeals, moveDeal, editDeal, deleteDeal };
}
