import { useState } from "react";
import { Users, Send, CheckSquare, Loader2, Sparkles, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { sendTextMessage } from "@/services/evolutionApi";
import type { MessageTemplate } from "@/types/whatsapp";

export type BulkSendResult = { total: number; sent: number; failed: number };
interface Customer { id: string; name: string; phone_whatsapp: string; electricity_bill_value?: number; }
interface BulkSendPanelProps {
  instanceName: string; customers: Customer[]; templates: MessageTemplate[];
  applyTemplate: (t: MessageTemplate, c: { name: string; electricity_bill_value?: number }) => string;
}
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function BulkSendPanel({ instanceName, customers, templates, applyTemplate }: BulkSendPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState<BulkSendResult | null>(null);
  const [result, setResult] = useState<BulkSendResult | null>(null);
  const [warning, setWarning] = useState("");
  const { toast } = useToast();
  const allSelected = customers.length > 0 && selectedIds.size === customers.length;

  function toggleCustomer(id: string) {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    setWarning("");
  }
  function toggleAll() { setSelectedIds(allSelected ? new Set() : new Set(customers.map((c) => c.id))); setWarning(""); }
  function handleTemplateChange(tid: string) { const t = templates.find((t) => t.id === tid); if (t) setMessage(t.content); }

  async function handleBulkSend() {
    if (selectedIds.size === 0) { setWarning("Selecione pelo menos um destinatário"); return; }
    if (!message.trim()) return;
    setWarning(""); setIsSending(true); setResult(null);
    const selected = customers.filter((c) => selectedIds.has(c.id));
    let sent = 0, failed = 0;
    for (let i = 0; i < selected.length; i++) {
      setProgress({ total: selected.length, sent, failed });
      try {
        const msg = message.includes("{{") ? applyTemplate({ id: "", consultant_id: "", name: "", content: message, media_type: "text", media_url: null, created_at: "" }, selected[i]) : message;
        await sendTextMessage(instanceName, selected[i].phone_whatsapp, msg); sent++;
      } catch { failed++; }
      if (i < selected.length - 1) await delay(2000);
    }
    const r: BulkSendResult = { total: selected.length, sent, failed };
    setProgress(null); setResult(r); setIsSending(false);
    toast({ title: "Envio concluído", description: `${sent} enviadas, ${failed} falhas`, variant: failed > 0 ? "destructive" : "default" });
  }
  const pct = progress && progress.total > 0 ? ((progress.sent + progress.failed) / progress.total) * 100 : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-orange-950/10">
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-orange-500/3 rounded-full blur-3xl" />
      <div className="relative p-5 sm:p-7">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center border border-orange-500/20">
            <Megaphone className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-foreground text-lg">Envio em Massa</h3>
            <p className="text-xs text-muted-foreground">Envie para vários clientes de uma vez</p>
          </div>
        </div>

        {/* Select all */}
        <div className="flex items-center justify-between mb-3 px-1">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={isSending || customers.length === 0} />
            <span className="text-sm text-foreground font-medium flex items-center gap-1.5">
              <CheckSquare className="w-3.5 h-3.5 text-muted-foreground" /> Selecionar Todos
            </span>
          </label>
          <span className="text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">{selectedIds.size} selecionados</span>
        </div>

        {/* Customer list */}
        <div className="max-h-52 overflow-y-auto rounded-xl border border-border/50 mb-4 divide-y divide-border/30">
          {customers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum cliente</p>
          ) : customers.map((c) => (
            <label key={c.id} className={`w-full flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-all hover:bg-secondary/40 ${selectedIds.has(c.id) ? "bg-orange-500/5" : ""} ${isSending ? "pointer-events-none opacity-50" : ""}`}>
              <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleCustomer(c.id)} disabled={isSending} />
              <div className="min-w-0"><p className="text-sm text-foreground truncate">{c.name}</p><p className="text-xs text-muted-foreground/70">{c.phone_whatsapp}</p></div>
            </label>
          ))}
        </div>

        {warning && (
          <div className="rounded-xl bg-red-500/5 border border-red-500/20 px-4 py-2.5 mb-3">
            <p className="text-sm text-red-400 font-medium">{warning}</p>
          </div>
        )}

        {templates.length > 0 && (
          <div className="mb-3">
            <Select onValueChange={handleTemplateChange} disabled={isSending}>
              <SelectTrigger className="rounded-xl bg-secondary/50 border-border/50">
                <Sparkles className="w-3.5 h-3.5 text-primary mr-2" />
                <SelectValue placeholder="Usar template..." />
              </SelectTrigger>
              <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}

        <Textarea placeholder="Digite sua mensagem..." value={message} onChange={(e) => setMessage(e.target.value)} rows={4} disabled={isSending} className="mb-3 rounded-xl bg-secondary/30 border-border/40 resize-none" />

        {isSending && progress && (
          <div className="mb-4 space-y-2.5 rounded-xl bg-secondary/20 border border-border/30 p-4">
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
              <span className="font-medium">Enviando... {progress.sent + progress.failed}/{progress.total}</span>
            </div>
            <Progress value={pct} className="h-2" />
          </div>
        )}

        {result && !isSending && (
          <div className="rounded-xl border border-border/40 bg-secondary/20 px-4 py-3.5 mb-4">
            <p className="text-sm text-foreground font-bold mb-2">Envio concluído</p>
            <div className="flex gap-4 text-xs font-medium">
              <span className="text-green-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400" />{result.sent} enviadas</span>
              {result.failed > 0 && <span className="text-red-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />{result.failed} falhas</span>}
            </div>
          </div>
        )}

        <Button onClick={handleBulkSend} disabled={selectedIds.size === 0 || !message.trim() || isSending} className="gap-2 rounded-xl h-11 font-bold shadow-lg shadow-green-500/10 hover:shadow-green-500/20 transition-all" style={{ background: "var(--gradient-green)" }}>
          {isSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><Send className="w-4 h-4" /> Enviar para {selectedIds.size} clientes</>}
        </Button>
      </div>
    </div>
  );
}
