import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Brain, Save, Loader2, Info, Lightbulb } from "lucide-react";

export function AIKnowledgePanel() {
  const [extraKnowledge, setExtraKnowledge] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadKnowledge();
  }, []);

  const loadKnowledge = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "ai_knowledge_extra")
      .maybeSingle();

    if (data?.value) {
      setExtraKnowledge(data.value);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("settings")
      .update({ value: extraKnowledge } as any)
      .eq("key", "ai_knowledge_extra");

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✅ Conhecimento da IA atualizado!", description: "As mudanças já estão ativas para todos os consultores." });
    }
    setSaving(false);
  };

  const charCount = extraKnowledge.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Brain className="w-6 h-6 text-primary" />
        <div>
          <h2 className="font-heading font-bold text-foreground text-lg">Gestão do Conhecimento da IA</h2>
          <p className="text-xs text-muted-foreground">Adicione informações extras que a IA deve saber</p>
        </div>
      </div>

      {/* Info panel */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm text-foreground space-y-2">
            <p className="font-semibold">Como funciona?</p>
            <p>A IA já possui conhecimento base completo sobre:</p>
            <ul className="list-disc pl-4 text-muted-foreground space-y-1">
              <li>8 produtos iGreen (Green, Livre, Solar, Placas, Club, Club PJ, Expansão, Telecom)</li>
              <li>Comissões CP e CI detalhadas por estado</li>
              <li>Plano de carreira com 8 níveis (Sênior a Acionista)</li>
              <li>27 estados e distribuidoras</li>
              <li>FAQ e objeções comuns</li>
              <li>Funcionalidades do painel do consultor</li>
            </ul>
            <p className="text-primary font-medium">O campo abaixo é para informações EXTRAS que você quer adicionar além do conhecimento base.</p>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-yellow-500" />
          <p className="text-sm font-semibold text-foreground">Dicas para deixar a IA mais inteligente:</p>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1.5 pl-6 list-disc">
          <li><strong>Promoções atuais:</strong> "Em julho/2025, temos promoção de R$200 de bônus extra por licenciado"</li>
          <li><strong>Novos produtos:</strong> "Lançamos o Conexão Auto - seguro veicular com comissão de 15%"</li>
          <li><strong>Atualizações de comissão:</strong> "A partir de agosto, Conexão Green em MG passa para 5% CP"</li>
          <li><strong>Eventos:</strong> "Próximo Grand Show será dia 15/08 em São Paulo"</li>
          <li><strong>Scripts de venda:</strong> "Quando o cliente perguntar sobre prazo, dizer que..."</li>
          <li><strong>Regras novas:</strong> "Novo critério: mínimo 100 kWh para clientes do Nordeste"</li>
          <li><strong>Links úteis:</strong> "Link do treinamento novo: https://..."</li>
        </ul>
      </div>

      {/* Editor */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Carregando...</span>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="text-sm font-medium text-foreground">
            Conhecimento Extra da IA
          </label>
          <Textarea
            value={extraKnowledge}
            onChange={(e) => setExtraKnowledge(e.target.value)}
            placeholder={`Escreva aqui informações extras para a IA...

Exemplo:
PROMOÇÕES ATIVAS:
- Até 30/07/2025: Bônus de R$500 para quem cadastrar 10 clientes no mês
- Novo plano Telecom: 50GB por R$49,90

EVENTOS:
- Grand Show dia 20/08 em Uberlândia, MG
- Live Connect toda segunda às 20h

ATUALIZAÇÕES:
- Conexão Green agora aceita clientes com mínimo de 100 kWh em MG`}
            className="min-h-[300px] font-mono text-sm"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {charCount.toLocaleString("pt-BR")} caracteres
            </span>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Conhecimento
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
