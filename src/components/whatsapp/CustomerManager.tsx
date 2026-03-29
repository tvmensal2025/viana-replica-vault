import { useState } from "react";
import { UserPlus, Trash2, Users, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Customer { id: string; name: string; phone_whatsapp: string; electricity_bill_value?: number; }
interface CustomerManagerProps { customers: Customer[]; consultantId: string; onCustomersChange: () => void; }

export function CustomerManager({ customers, consultantId, onCustomersChange }: CustomerManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [billValue, setBillValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const filtered = search.trim() ? customers.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone_whatsapp.includes(search)) : customers;

  async function handleAdd() {
    if (!name.trim() || !phone.trim()) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from("customers").insert({ name: name.trim(), phone_whatsapp: phone.replace(/\D/g, ""), electricity_bill_value: billValue ? parseFloat(billValue) : null, status: "lead" });
      if (error) throw error;
      toast({ title: "✅ Cliente adicionado" }); setName(""); setPhone(""); setBillValue(""); setShowForm(false); onCustomersChange();
    } catch (err) { toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro", variant: "destructive" }); }
    finally { setIsSaving(false); }
  }
  async function handleDelete(id: string) {
    try { const { error } = await supabase.from("customers").delete().eq("id", id); if (error) throw error; toast({ title: "Cliente removido" }); onCustomersChange(); }
    catch (err) { toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro", variant: "destructive" }); }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-cyan-950/10">
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-cyan-500/3 rounded-full blur-3xl" />
      <div className="relative p-5 sm:p-7">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center border border-cyan-500/20">
              <Users className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-foreground text-lg">Clientes <span className="text-sm font-normal text-muted-foreground ml-1">({customers.length})</span></h3>
              <p className="text-xs text-muted-foreground">Gerencie seus contatos</p>
            </div>
          </div>
          <Button onClick={() => setShowForm(!showForm)} size="sm" className="gap-2 rounded-xl font-bold shadow-lg shadow-green-500/10 transition-all" style={{ background: "var(--gradient-green)" }}>
            <UserPlus className="w-4 h-4" /> Adicionar
          </Button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="rounded-xl border border-cyan-500/15 bg-cyan-500/3 p-4 mb-4 space-y-3">
            <Input placeholder="Nome do cliente" value={name} onChange={(e) => setName(e.target.value)} disabled={isSaving} className="rounded-xl bg-secondary/50 border-border/50" />
            <Input placeholder="WhatsApp (ex: 5511999999999)" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isSaving} className="rounded-xl bg-secondary/50 border-border/50" />
            <Input placeholder="Valor da conta de luz (opcional)" type="number" value={billValue} onChange={(e) => setBillValue(e.target.value)} disabled={isSaving} className="rounded-xl bg-secondary/50 border-border/50" />
            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={!name.trim() || !phone.trim() || isSaving} size="sm" className="gap-2 rounded-xl font-bold" style={{ background: "var(--gradient-green)" }}>
                <UserPlus className="w-4 h-4" /> {isSaving ? "Salvando..." : "Salvar"}
              </Button>
              <Button onClick={() => setShowForm(false)} variant="outline" size="sm" className="rounded-xl">Cancelar</Button>
            </div>
          </div>
        )}

        {/* Search */}
        {customers.length > 0 && (
          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
            <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 rounded-xl bg-secondary/50 border-border/50" />
          </div>
        )}

        {/* List */}
        <div className="max-h-64 overflow-y-auto space-y-1.5">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{customers.length === 0 ? "Nenhum cliente. Adicione o primeiro." : "Nenhum resultado."}</p>
          ) : filtered.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-secondary/20 px-4 py-2.5 group hover:border-cyan-500/20 transition-all">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground/70">{c.phone_whatsapp}</p>
                </div>
              </div>
              {c.electricity_bill_value != null && <span className="text-xs font-bold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full shrink-0">R${c.electricity_bill_value}</span>}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 h-8 w-8 opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Remover cliente</AlertDialogTitle><AlertDialogDescription>Remover {c.name}?</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(c.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
