import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Brain, Save, Loader2, Info, Lightbulb, Upload, FileText, X, CheckCircle } from "lucide-react";

interface UploadedDoc {
  name: string;
  text: string;
  date: string;
}

export function AIKnowledgePanel() {
  const [extraKnowledge, setExtraKnowledge] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadKnowledge();
  }, []);

  const loadKnowledge = async () => {
    setLoading(true);
    const [extraRes, docsRes] = await Promise.all([
      supabase.from("settings").select("value").eq("key", "ai_knowledge_extra").maybeSingle(),
      supabase.from("settings").select("value").eq("key", "ai_knowledge_docs").maybeSingle(),
    ]);

    if (extraRes.data?.value) setExtraKnowledge(extraRes.data.value);
    if (docsRes.data?.value) {
      try { setUploadedDocs(JSON.parse(docsRes.data.value)); } catch {}
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
      toast({ title: "✅ Conhecimento da IA atualizado!", description: "As mudanças já estão ativas." });
    }
    setSaving(false);
  };

  const handlePDFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newDocs: UploadedDoc[] = [];

    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        toast({ title: "Arquivo ignorado", description: `${file.name} não é PDF`, variant: "destructive" });
        continue;
      }

      try {
        // Read file as text and send to AI to extract/summarize
        const formData = new FormData();
        formData.append("file", file);

        const { data, error } = await supabase.functions.invoke("extract-pdf-text", {
          body: formData,
        });

        if (error) throw error;

        const extractedText = data?.text || "";

        if (extractedText.length < 20) {
          // If basic extraction failed, read as base64 and try AI
          toast({
            title: `⚠️ ${file.name}`,
            description: "PDF com pouco texto extraído. Tente copiar o conteúdo manualmente no campo de texto.",
            variant: "destructive",
          });
          continue;
        }

        // Now use AI to organize the content
        const aiResponse = await supabase.functions.invoke("igreen-chat", {
          body: {
            message: `Organize o seguinte conteúdo extraído de um PDF chamado "${file.name}" em formato limpo e estruturado para servir como base de conhecimento. Mantenha TODAS as informações importantes (valores, datas, regras, comissões, produtos, etc). Remova apenas lixo de formatação. Responda APENAS com o conteúdo organizado, sem explicações:\n\n${extractedText.substring(0, 15000)}`,
          },
        });

        const organizedText = aiResponse.data?.reply || extractedText;

        newDocs.push({
          name: file.name,
          text: organizedText,
          date: new Date().toISOString(),
        });

        toast({ title: `✅ ${file.name} processado!`, description: `${organizedText.length} caracteres extraídos e organizados.` });
      } catch (err: any) {
        console.error("PDF upload error:", err);
        toast({ title: `Erro em ${file.name}`, description: err.message || "Falha ao processar", variant: "destructive" });
      }
    }

    if (newDocs.length > 0) {
      const allDocs = [...uploadedDocs, ...newDocs];
      setUploadedDocs(allDocs);

      // Save docs list
      await supabase.from("settings").upsert(
        { key: "ai_knowledge_docs", value: JSON.stringify(allDocs) } as any,
        { onConflict: "key" }
      );

      // Append all doc contents to extra knowledge
      const docsText = newDocs.map(d => `\n\n--- DOCUMENTO: ${d.name} (${new Date(d.date).toLocaleDateString("pt-BR")}) ---\n${d.text}`).join("");
      const updatedKnowledge = extraKnowledge + docsText;
      setExtraKnowledge(updatedKnowledge);

      await supabase
        .from("settings")
        .update({ value: updatedKnowledge } as any)
        .eq("key", "ai_knowledge_extra");

      toast({ title: "🧠 IA atualizada!", description: `${newDocs.length} documento(s) integrado(s) ao conhecimento.` });
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeDoc = async (index: number) => {
    const doc = uploadedDocs[index];
    const newDocs = uploadedDocs.filter((_, i) => i !== index);
    setUploadedDocs(newDocs);

    // Remove doc content from knowledge
    const marker = `--- DOCUMENTO: ${doc.name}`;
    const lines = extraKnowledge.split("\n");
    const filteredLines: string[] = [];
    let skipping = false;

    for (const line of lines) {
      if (line.includes(marker)) {
        skipping = true;
        continue;
      }
      if (skipping && line.startsWith("--- DOCUMENTO:")) {
        skipping = false;
      }
      if (!skipping) filteredLines.push(line);
    }

    const updatedKnowledge = filteredLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    setExtraKnowledge(updatedKnowledge);

    await Promise.all([
      supabase.from("settings").update({ value: JSON.stringify(newDocs) } as any).eq("key", "ai_knowledge_docs"),
      supabase.from("settings").update({ value: updatedKnowledge } as any).eq("key", "ai_knowledge_extra"),
    ]);

    toast({ title: "Documento removido", description: `${doc.name} foi removido do conhecimento da IA.` });
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
            <p className="text-primary font-medium">Envie PDFs ou escreva no campo abaixo para adicionar informações EXTRAS.</p>
          </div>
        </div>
      </div>

      {/* PDF Upload Section */}
      <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary" />
          <p className="text-sm font-semibold text-foreground">Upload de PDFs — A IA lê e aprende automaticamente</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Envie PDFs com tabelas de comissão, scripts de venda, regulamentos, treinamentos, etc. 
          A IA extrai o conteúdo, organiza e integra ao seu conhecimento. Os documentos mais recentes têm prioridade.
        </p>

        <div className="flex gap-3 items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            multiple
            onChange={handlePDFUpload}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            variant="outline"
            className="gap-2 border-primary/40 hover:bg-primary/10"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {uploading ? "Processando PDF..." : "Enviar PDF(s)"}
          </Button>
          <span className="text-xs text-muted-foreground">Aceita múltiplos PDFs de uma vez</span>
        </div>

        {/* Uploaded docs list */}
        {uploadedDocs.length > 0 && (
          <div className="space-y-2 mt-3">
            <p className="text-xs font-medium text-muted-foreground">Documentos integrados ({uploadedDocs.length}):</p>
            {uploadedDocs.map((doc, i) => (
              <div key={i} className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  <span className="text-sm text-foreground">{doc.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({new Date(doc.date).toLocaleDateString("pt-BR")}) — {doc.text.length.toLocaleString("pt-BR")} chars
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeDoc(i)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
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
            Conhecimento Extra da IA (texto manual + conteúdo dos PDFs)
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
