import { useState, useEffect, useCallback, useRef } from "react";
import {
  UserPlus,
  Trash2,
  Users,
  Search,
  Phone,
  Mail,
  MapPin,
  Zap,
  ChevronDown,
  ChevronUp,
  Pencil,
  CreditCard,
  User,
  Save,
  X,
  Loader2,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getProfilePicture } from "@/services/evolutionApi";
import { AddCustomerDialog } from "./AddCustomerDialog";
import type { TablesUpdate } from "@/integrations/supabase/types";

interface Customer {
  id: string;
  name: string | null;
  phone_whatsapp: string;
  electricity_bill_value?: number | null;
  email?: string | null;
  cpf?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_street?: string | null;
  address_neighborhood?: string | null;
  address_complement?: string | null;
  address_number?: string | null;
  cep?: string | null;
  numero_instalacao?: string | null;
  data_nascimento?: string | null;
  status?: string | null;
  created_at?: string | null;
}

interface CustomerManagerProps {
  customers: Customer[];
  consultantId: string;
  onCustomersChange: () => void;
  instanceName?: string | null;
}

function formatPhoneDisplay(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 5)} ${d.slice(5, 9)}-${d.slice(9)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

function formatCpfDisplay(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return cpf;
}

function getInitials(name: string | null): string {
  if (!name || name.trim() === "" || name === "Sem nome") return "?";
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function getStatusBadge(status: string | null | undefined) {
  switch (status) {
    case "approved": return { label: "Aprovado", className: "bg-green-500/15 text-green-400 border-green-500/20" };
    case "rejected": return { label: "Reprovado", className: "bg-red-500/15 text-red-400 border-red-500/20" };
    case "pending": return { label: "Pendente", className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20" };
    case "lead": return { label: "Lead", className: "bg-blue-500/15 text-blue-400 border-blue-500/20" };
    default: return { label: status || "Novo", className: "bg-muted text-muted-foreground border-border" };
  }
}

export function CustomerManager({ customers, consultantId, onCustomersChange, instanceName }: CustomerManagerProps) {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [profilePics, setProfilePics] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, newCount: 0, updatedCount: 0, errorCount: 0 });
  const [showImportResult, setShowImportResult] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Fetch profile pictures from Evolution API
  useEffect(() => {
    if (!instanceName) return;
    const fetchPics = async () => {
      const pics: Record<string, string> = {};
      for (const c of customers.slice(0, 50)) {
        const phone = c.phone_whatsapp.replace(/\D/g, "");
        if (phone.length < 10 || pics[c.id]) continue;
        try {
          const result = await getProfilePicture(instanceName, `${phone}@s.whatsapp.net`);
          if (result && typeof result === "string") {
            pics[c.id] = result;
          }
        } catch {
          // skip
        }
      }
      setProfilePics((prev) => ({ ...prev, ...pics }));
    };
    fetchPics();
  }, [instanceName, customers]);

  const filtered = search.trim()
    ? customers.filter(
        (c) =>
          (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
          c.phone_whatsapp.includes(search) ||
          (c.email || "").toLowerCase().includes(search.toLowerCase()) ||
          (c.cpf || "").includes(search)
      )
    : customers;

  async function handleDelete(id: string) {
    try {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Cliente removido" });
      onCustomersChange();
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    }
  }

  function openEdit(c: Customer) {
    setEditingCustomer(c);
    setEditForm({
      name: c.name || "",
      cpf: c.cpf || "",
      data_nascimento: c.data_nascimento || "",
      email: c.email || "",
      phone_whatsapp: c.phone_whatsapp,
      cep: c.cep || "",
      address_street: c.address_street || "",
      address_number: c.address_number || "",
      address_neighborhood: c.address_neighborhood || "",
      address_complement: c.address_complement || "",
      address_city: c.address_city || "",
      address_state: c.address_state || "",
      numero_instalacao: c.numero_instalacao || "",
      electricity_bill_value: c.electricity_bill_value?.toString() || "",
      status: c.status || "pending",
    });
  }

  async function handleSaveEdit() {
    if (!editingCustomer) return;
    setSaving(true);
    try {
      const updateData: TablesUpdate<"customers"> = {};
      if (editForm.name) updateData.name = editForm.name;
      if (editForm.cpf) updateData.cpf = editForm.cpf.replace(/\D/g, "");
      if (editForm.data_nascimento) updateData.data_nascimento = editForm.data_nascimento;
      if (editForm.email) updateData.email = editForm.email;
      if (editForm.phone_whatsapp) updateData.phone_whatsapp = editForm.phone_whatsapp.replace(/\D/g, "");
      if (editForm.cep) updateData.cep = editForm.cep.replace(/\D/g, "");
      updateData.address_street = editForm.address_street || null;
      updateData.address_number = editForm.address_number || null;
      updateData.address_neighborhood = editForm.address_neighborhood || null;
      updateData.address_complement = editForm.address_complement || null;
      updateData.address_city = editForm.address_city || null;
      updateData.address_state = editForm.address_state || null;
      updateData.numero_instalacao = editForm.numero_instalacao || null;
      updateData.electricity_bill_value = editForm.electricity_bill_value ? parseFloat(editForm.electricity_bill_value) : null;
      updateData.status = editForm.status || "pending";

      const { error } = await supabase.from("customers").update(updateData).eq("id", editingCustomer.id);
      if (error) throw error;
      toast({ title: "✅ Cliente atualizado!" });
      setEditingCustomer(null);
      onCustomersChange();
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function normalizePhone(raw: string): string {
    const digits = String(raw || "").replace(/\D/g, "");
    if (digits.length === 0) return "";
    if (digits.startsWith("55") && digits.length >= 12) return digits;
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    return digits;
  }

  function mapStatus(andamento: string | undefined): string {
    if (!andamento) return "pending";
    const lower = andamento.toLowerCase().trim();
    if (lower === "validado" || lower === "aprovado") return "approved";
    if (lower === "devolutiva" || lower === "reprovado") return "rejected";
    return "pending";
  }

  async function handleImportExcel(file: File) {
    setImporting(true);
    setShowImportResult(false);
    const progress = { current: 0, total: 0, newCount: 0, updatedCount: 0, errorCount: 0 };

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);

      progress.total = rows.length;
      setImportProgress({ ...progress });

      for (const row of rows) {
        progress.current++;

        const phoneRaw = String(row["Celular"] || row["celular"] || row["Telefone"] || row["telefone"] || "");
        const phone = normalizePhone(phoneRaw);
        if (!phone || phone.length < 10) {
          progress.errorCount++;
          setImportProgress({ ...progress });
          continue;
        }

        const customerData = {
          phone_whatsapp: phone,
          name: String(row["Nome do Cliente"] || row["Nome"] || row["nome"] || "").trim() || null,
          media_consumo: row["Consumo Médio"] != null ? parseFloat(String(row["Consumo Médio"]).replace(",", ".")) || null : null,
          cpf: row["Documento"] ? String(row["Documento"]).replace(/\D/g, "") : null,
          numero_instalacao: row["Instalação"] ? String(row["Instalação"]).trim() : (row["Código"] ? String(row["Código"]).trim() : null),
          address_city: row["Cidade"] ? String(row["Cidade"]).trim() : null,
          address_state: row["UF"] ? String(row["UF"]).trim().toUpperCase() : null,
          distribuidora: row["Distribuidora"] ? String(row["Distribuidora"]).trim() : null,
          email: row["E-mail"] || row["Email"] ? String(row["E-mail"] || row["Email"]).trim() : null,
          desconto_cliente: row["Desconto Cliente"] != null ? parseFloat(String(row["Desconto Cliente"]).replace(",", ".").replace("%", "")) || null : null,
          data_nascimento: row["Data Nascimento"] ? String(row["Data Nascimento"]).trim() : null,
          status: mapStatus(String(row["Andamento"] || "")),
        };

        try {
          // Check if customer exists by phone
          const { data: existing } = await supabase
            .from("customers")
            .select("id")
            .eq("phone_whatsapp", phone)
            .maybeSingle();

          if (existing) {
            // Update existing
            const { error } = await supabase
              .from("customers")
              .update(customerData)
              .eq("id", existing.id);
            if (error) throw error;
            progress.updatedCount++;
          } else {
            // Insert new
            const { data: newCustomer, error } = await supabase
              .from("customers")
              .insert(customerData)
              .select("id")
              .single();
            if (error) throw error;
            progress.newCount++;

            // Create CRM deal for new customer
            if (newCustomer) {
              await supabase.from("crm_deals").insert({
                consultant_id: consultantId,
                customer_id: newCustomer.id,
                remote_jid: `${phone}@s.whatsapp.net`,
                stage: "novo_lead",
              });
            }
          }
        } catch {
          progress.errorCount++;
        }

        setImportProgress({ ...progress });
      }

      setShowImportResult(true);
      toast({
        title: "✅ Importação concluída!",
        description: `${progress.newCount} novos, ${progress.updatedCount} atualizados, ${progress.errorCount} erros`,
      });
      onCustomersChange();
    } catch (err) {
      toast({
        title: "Erro na importação",
        description: err instanceof Error ? err.message : "Erro ao ler arquivo",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const fetchCep = async () => {
    const cep = (editForm.cep || "").replace(/\D/g, "");
    if (cep.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setEditForm((prev) => ({
          ...prev,
          address_street: data.logradouro || prev.address_street,
          address_neighborhood: data.bairro || prev.address_neighborhood,
          address_city: data.localidade || prev.address_city,
          address_state: data.uf || prev.address_state,
        }));
      }
    } catch { /* skip */ }
  };

  const updateEdit = (field: string, value: string) => setEditForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-cyan-500/[0.02] pointer-events-none" />

      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/15 shadow-lg shadow-primary/5">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-lg tracking-tight">
                Clientes
                <span className="ml-2 text-sm font-normal text-muted-foreground">({customers.length})</span>
              </h3>
              <p className="text-[11px] text-muted-foreground">Gerencie sua carteira de clientes</p>
            </div>
          </div>
          <Button onClick={() => setShowAddDialog(true)} size="sm" className="gap-2 rounded-xl font-semibold shadow-lg shadow-primary/15 h-9 px-4">
            <UserPlus className="w-4 h-4" /> Novo Cliente
          </Button>
        </div>

        {/* Search */}
        <div className="px-5 pt-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <Input placeholder="Buscar por nome, telefone, email ou CPF..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-10 rounded-xl bg-secondary/30 border-border/50 focus:border-primary/40 text-sm" />
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4 px-5 pb-3">
          {[
            { label: "Total", value: customers.length, color: "text-foreground" },
            { label: "Aprovados", value: customers.filter((c) => c.status === "approved").length, color: "text-green-400" },
            { label: "Pendentes", value: customers.filter((c) => c.status === "pending").length, color: "text-yellow-400" },
            { label: "Leads", value: customers.filter((c) => c.status === "lead").length, color: "text-blue-400" },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-1.5">
              <span className={`text-sm font-bold ${stat.color}`}>{stat.value}</span>
              <span className="text-[10px] text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </div>

        {/* List */}
        <div className="px-5 pb-5">
          <div className="max-h-[calc(100vh-420px)] overflow-y-auto space-y-2 pr-1">
            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-secondary/50 flex items-center justify-center mx-auto mb-3">
                  <Users className="w-7 h-7 text-muted-foreground/30" />
                </div>
                <p className="text-sm text-muted-foreground">{customers.length === 0 ? "Nenhum cliente cadastrado" : "Nenhum resultado"}</p>
              </div>
            ) : (
              filtered.map((c) => {
                const isExpanded = expandedId === c.id;
                const status = getStatusBadge(c.status);
                const pic = profilePics[c.id];

                return (
                  <div key={c.id} className={`rounded-xl border transition-all duration-200 ${isExpanded ? "border-primary/20 bg-primary/[0.02] shadow-md shadow-primary/5" : "border-border/40 bg-secondary/10 hover:border-border/60 hover:bg-secondary/20"}`}>
                    <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                      {/* Avatar with photo */}
                      <Avatar className="h-10 w-10 shrink-0 border border-primary/10">
                        <AvatarImage src={pic} />
                        <AvatarFallback className="bg-gradient-to-br from-primary/15 to-primary/5 text-xs font-bold text-primary">
                          {getInitials(c.name)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">{c.name || "Sem nome"}</p>
                          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${status.className}`}>{status.label}</Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Phone className="h-2.5 w-2.5" />
                            {formatPhoneDisplay(c.phone_whatsapp)}
                          </span>
                          {c.address_city && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-2.5 w-2.5" />
                              {c.address_city}{c.address_state ? `/${c.address_state}` : ""}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {c.electricity_bill_value != null && c.electricity_bill_value > 0 && (
                          <div className="text-right">
                            <p className="text-xs font-bold text-primary">R${c.electricity_bill_value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                            <p className="text-[9px] text-muted-foreground">consumo</p>
                          </div>
                        )}
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground/50" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-border/30">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-2">
                          {c.cpf && <DetailItem icon={CreditCard} label="CPF" value={formatCpfDisplay(c.cpf)} />}
                          {c.email && <DetailItem icon={Mail} label="Email" value={c.email} />}
                          <DetailItem icon={Phone} label="WhatsApp" value={formatPhoneDisplay(c.phone_whatsapp)} />
                          {c.data_nascimento && <DetailItem icon={User} label="Nascimento" value={c.data_nascimento} />}
                          {(c.address_city || c.address_state) && <DetailItem icon={MapPin} label="Localidade" value={`${c.address_city || ""}${c.address_state ? ` / ${c.address_state}` : ""}`} />}
                          {c.address_street && <DetailItem icon={MapPin} label="Endereço" value={`${c.address_street}${c.address_number ? `, ${c.address_number}` : ""}`} />}
                          {c.numero_instalacao && <DetailItem icon={Zap} label="Nº Instalação" value={c.numero_instalacao} />}
                          {c.electricity_bill_value != null && <DetailItem icon={Zap} label="Consumo" value={`R$ ${c.electricity_bill_value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />}
                          {c.created_at && <DetailItem icon={User} label="Cadastrado em" value={new Date(c.created_at).toLocaleDateString("pt-BR")} />}
                        </div>

                        <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-border/20">
                          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 text-primary border-primary/20 hover:bg-primary/10" onClick={() => openEdit(c)}>
                            <Pencil className="w-3 h-3" /> Editar
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 text-destructive border-destructive/20 hover:bg-destructive/10">
                                <Trash2 className="w-3 h-3" /> Remover
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover cliente</AlertDialogTitle>
                                <AlertDialogDescription>Tem certeza que deseja remover {c.name || "este cliente"}?</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(c.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Add Dialog */}
      <AddCustomerDialog open={showAddDialog} onOpenChange={setShowAddDialog} phone="" name={null} onAdded={onCustomersChange} />

      {/* Edit Dialog */}
      <Dialog open={!!editingCustomer} onOpenChange={(open) => !open && setEditingCustomer(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto p-0">
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 pt-6 pb-4 border-b border-border">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-3">
                {editingCustomer && profilePics[editingCustomer.id] && (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profilePics[editingCustomer.id]} />
                    <AvatarFallback>{getInitials(editingCustomer.name)}</AvatarFallback>
                  </Avatar>
                )}
                Editar Cliente
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="px-6 pb-6 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <SectionLabel icon={User} title="Dados Pessoais" />

              <div className="col-span-2">
                <Label className="text-[11px] text-muted-foreground">Nome Completo</Label>
                <Input value={editForm.name || ""} onChange={(e) => updateEdit("name", e.target.value)} className="h-9 text-xs mt-1 bg-secondary/30 border-border/50" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">CPF</Label>
                <Input value={editForm.cpf || ""} onChange={(e) => updateEdit("cpf", e.target.value)} placeholder="000.000.000-00" className="h-9 text-xs mt-1 bg-secondary/30 border-border/50" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Data de Nascimento</Label>
                <Input type="date" value={editForm.data_nascimento || ""} onChange={(e) => updateEdit("data_nascimento", e.target.value)} className="h-9 text-xs mt-1 bg-secondary/30 border-border/50" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Email</Label>
                <Input value={editForm.email || ""} onChange={(e) => updateEdit("email", e.target.value)} className="h-9 text-xs mt-1 bg-secondary/30 border-border/50" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Celular</Label>
                <Input value={editForm.phone_whatsapp || ""} onChange={(e) => updateEdit("phone_whatsapp", e.target.value)} className="h-9 text-xs mt-1 bg-secondary/30 border-border/50" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Status</Label>
                <select value={editForm.status || "pending"} onChange={(e) => updateEdit("status", e.target.value)} className="h-9 text-xs mt-1 w-full bg-secondary/30 border border-border/50 rounded-md px-2">
                  <option value="pending">Pendente</option>
                  <option value="approved">Aprovado</option>
                  <option value="rejected">Reprovado</option>
                  <option value="lead">Lead</option>
                </select>
              </div>

              <SectionLabel icon={MapPin} title="Endereço" />

              <div>
                <Label className="text-[11px] text-muted-foreground">CEP</Label>
                <div className="flex gap-1.5 mt-1">
                  <Input value={editForm.cep || ""} onChange={(e) => updateEdit("cep", e.target.value)} placeholder="00000-000" className="h-9 text-xs flex-1 bg-secondary/30 border-border/50" onBlur={fetchCep} />
                  <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={fetchCep}>
                    <Search className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Rua</Label>
                <Input value={editForm.address_street || ""} onChange={(e) => updateEdit("address_street", e.target.value)} className="h-9 text-xs mt-1 bg-secondary/30 border-border/50" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Número</Label>
                <Input value={editForm.address_number || ""} onChange={(e) => updateEdit("address_number", e.target.value)} className="h-9 text-xs mt-1 bg-secondary/30 border-border/50" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Bairro</Label>
                <Input value={editForm.address_neighborhood || ""} onChange={(e) => updateEdit("address_neighborhood", e.target.value)} className="h-9 text-xs mt-1 bg-secondary/30 border-border/50" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Complemento</Label>
                <Input value={editForm.address_complement || ""} onChange={(e) => updateEdit("address_complement", e.target.value)} className="h-9 text-xs mt-1 bg-secondary/30 border-border/50" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Cidade / UF</Label>
                <div className="flex gap-1.5 mt-1">
                  <Input value={editForm.address_city || ""} onChange={(e) => updateEdit("address_city", e.target.value)} className="h-9 text-xs flex-1 bg-secondary/30 border-border/50" />
                  <Input value={editForm.address_state || ""} onChange={(e) => updateEdit("address_state", e.target.value.toUpperCase())} className="h-9 text-xs w-16 bg-secondary/30 border-border/50" maxLength={2} />
                </div>
              </div>

              <SectionLabel icon={Zap} title="Dados de Energia" />

              <div>
                <Label className="text-[11px] text-muted-foreground">Nº Instalação</Label>
                <Input value={editForm.numero_instalacao || ""} onChange={(e) => updateEdit("numero_instalacao", e.target.value)} className="h-9 text-xs mt-1 bg-secondary/30 border-border/50" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Média de Consumo (R$)</Label>
                <Input type="number" value={editForm.electricity_bill_value || ""} onChange={(e) => updateEdit("electricity_bill_value", e.target.value)} className="h-9 text-xs mt-1 bg-secondary/30 border-border/50" />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-border">
              <Button variant="outline" size="sm" className="h-9 text-xs px-4 gap-1" onClick={() => setEditingCustomer(null)}>
                <X className="h-3 w-3" /> Cancelar
              </Button>
              <Button size="sm" className="h-9 text-xs px-5 gap-1.5 font-semibold shadow-lg shadow-primary/20" onClick={handleSaveEdit} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar Alterações
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionLabel({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 col-span-2 mt-2 mb-1">
      <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
        <Icon className="h-3 w-3 text-primary" />
      </div>
      <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">{title}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function DetailItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-xs text-foreground">{value}</p>
      </div>
    </div>
  );
}
