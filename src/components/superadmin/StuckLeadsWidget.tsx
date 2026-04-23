import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Clock, RefreshCw, Phone, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface StuckLead {
  id: string;
  name: string | null;
  phone_whatsapp: string;
  conversation_step: string | null;
  last_bot_reply_at: string | null;
  rescue_attempts: number | null;
  status: string;
  consultant_id: string | null;
}

const STEP_LABELS: Record<string, string> = {
  ask_name: "Aguardando nome",
  ask_cpf: "Aguardando CPF",
  ask_rg: "Aguardando RG",
  ask_birth_date: "Aguardando nascimento",
  ask_phone_confirm: "Confirmando telefone",
  ask_phone: "Aguardando telefone",
  ask_email: "Aguardando email",
  ask_cep: "Aguardando CEP",
  ask_number: "Aguardando número",
  ask_complement: "Aguardando complemento",
  ask_installation_number: "Aguardando nº instalação",
  ask_bill_value: "Aguardando valor da conta",
  aguardando_conta: "Aguardando foto da conta",
  aguardando_doc_frente: "Aguardando frente do doc",
  aguardando_doc_verso: "Aguardando verso do doc",
  confirmando_dados_conta: "Confirmando dados da conta",
  confirmando_dados_doc: "Confirmando dados do doc",
  ask_finalizar: "Aguardando finalização",
};

function formatIdle(iso: string | null): { text: string; severity: "low" | "medium" | "high" } {
  if (!iso) return { text: "—", severity: "low" };
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 60) return { text: `${min}min`, severity: "low" };
  if (min < 60 * 6) return { text: `${Math.floor(min / 60)}h`, severity: "medium" };
  return { text: `${Math.floor(min / 60)}h`, severity: "high" };
}

export function StuckLeadsWidget() {
  const [leads, setLeads] = useState<StuckLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
    // Só leads que efetivamente conversaram pela instância (têm conversation_step ask_*/aguardando_*)
    // E que não estão em fases finais. Importações antigas (sem step) NÃO entram.
    const { data } = await supabase
      .from("customers")
      .select("id, name, phone_whatsapp, conversation_step, last_bot_reply_at, rescue_attempts, status, consultant_id")
      .lt("last_bot_reply_at", cutoff)
      .not("conversation_step", "is", null)
      .or("conversation_step.like.ask_%,conversation_step.like.aguardando_%,conversation_step.like.confirmando_%,conversation_step.like.editing_%,conversation_step.in.(welcome,menu_inicial,pos_video)")
      .not("status", "in", "(complete,cadastro_concluido,portal_submitting,registered_igreen,abandoned)")
      .order("last_bot_reply_at", { ascending: true })
      .limit(50);
    setLeads((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const triggerRescue = async () => {
    setResending("all");
    try {
      await supabase.functions.invoke("bot-stuck-recovery", { body: {} });
      setTimeout(load, 2500);
    } finally {
      setResending(null);
    }
  };

  return (
    <div className="premium-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <AlertTriangle className="w-4.5 h-4.5 text-amber-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Leads Travados</h3>
            <p className="text-xs text-muted-foreground">Sem resposta há mais de 10 min</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant="outline" className="text-xs">
            {leads.length} parado(s)
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={triggerRescue}
            disabled={resending === "all" || leads.length === 0}
            className="h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${resending === "all" ? "animate-spin" : ""}`} />
            Resgatar agora
          </Button>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="h-8 w-8 p-0">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-xs text-muted-foreground">Carregando...</div>
      ) : leads.length === 0 ? (
        <div className="text-center py-8 text-xs text-muted-foreground">
          ✨ Nenhum lead travado. Tudo fluindo normalmente.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-auto">
          {leads.map((lead) => {
            const idle = formatIdle(lead.last_bot_reply_at);
            const stepLabel = STEP_LABELS[lead.conversation_step || ""] || lead.conversation_step || "—";
            const sevColor =
              idle.severity === "high"
                ? "text-red-500 bg-red-500/10 border-red-500/20"
                : idle.severity === "medium"
                ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
                : "text-blue-500 bg-blue-500/10 border-blue-500/20";
            return (
              <div
                key={lead.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/40 bg-card/40 hover:bg-card/70 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {lead.name || "Sem nome"}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      <Phone className="w-2.5 h-2.5 mr-1" />
                      {lead.phone_whatsapp}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <MessageSquare className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">{stepLabel}</span>
                    {(lead.rescue_attempts ?? 0) > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        · {lead.rescue_attempts} tentativa(s) de resgate
                      </span>
                    )}
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium ${sevColor}`}>
                  <Clock className="w-3 h-3" />
                  {idle.text}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}