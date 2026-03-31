import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  UserPlus, Trash2, Users, Search, Phone, Mail, MapPin, Zap,
  ChevronDown, ChevronUp, Pencil, CreditCard, User, Save, X,
  Loader2, Upload, FileSpreadsheet, CheckCircle2, CheckSquare, Square,
  MessageCircle, Copy, Building2, AlertTriangle, FileText, ClipboardCopy,
  RefreshCw,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getProfilePicture } from "@/services/evolutionApi";
import { AddCustomerDialog } from "./AddCustomerDialog";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";

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
  distribuidora?: string | null;
  registered_by_name?: string | null;
  registered_by_igreen_id?: string | null;
  media_consumo?: number | null;
  desconto_cliente?: number | null;
  andamento_igreen?: string | null;
  devolutiva?: string | null;
  observacao?: string | null;
  igreen_code?: string | null;
  data_cadastro?: string | null;
  data_ativo?: string | null;
  data_validado?: string | null;
  status_financeiro?: string | null;
  cashback?: string | null;
  nivel_licenciado?: string | null;
  assinatura_cliente?: string | null;
  assinatura_igreen?: string | null;
  link_assinatura?: string | null;
}

interface CustomerManagerProps {
  customers: Customer[];
  consultantId: string;
  onCustomersChange: () => void;
  instanceName?: string | null;
  onOpenChat?: (phone: string, suggestedMessage?: string) => void;
}

interface ParsedCustomer {
  phone: string;
  name: string | null;
  status: string;
  data: Record<string, unknown>;
  isNew: boolean;
}

type StatusFilter = "all" | "approved" | "pending" | "devolutiva" | "lead" | "rejected";

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

function normalizePhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 11) return `55${digits}`;
  if (digits.length === 10) return `55${digits}`;
  if (digits.length >= 12) return digits;
  return "";
}

function mapStatus(andamento: string | undefined): string {
  if (!andamento) return "pending";
  const lower = andamento.toLowerCase().trim();
  if (lower === "validado" || lower === "aprovado" || lower === "ativo") return "approved";
  if (lower === "devolutiva" || lower === "reprovado" || lower === "cancelado") return "rejected";
  if (lower.includes("falta assinatura")) return "pending";
  if (lower.includes("aguardando")) return "pending";
  if (lower === "pendente" || lower === "em análise" || lower === "em analise") return "pending";
  if (lower === "lead" || lower === "novo") return "lead";
  if (lower === "dados completos" || lower === "data_complete") return "data_complete";
  if (lower === "registrado" || lower === "registered_igreen") return "registered_igreen";
  if (lower === "contrato enviado" || lower === "contract_sent") return "contract_sent";
  return "pending";
}

function safeString(val: unknown): string | null {
  if (val == null || val === "" || val === undefined) return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

function safeNumber(val: unknown): number | null {
  if (val == null || val === "" || val === undefined) return null;
  const n = parseFloat(String(val).replace(",", ".").replace("%", ""));
  return isNaN(n) ? null : n;
}

function findColumnValue(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] != null && row[key] !== "") return row[key];
    const found = Object.keys(row).find((k) => k.toLowerCase().trim() === key.toLowerCase().trim());
    if (found && row[found] != null && row[found] !== "") return row[found];
  }
  return null;
}

function buildWhatsAppMessage(customer: Customer): string {
  const nome = customer.name || "cliente";
  if (customer.devolutiva || customer.andamento_igreen?.toLowerCase().includes("devolutiva")) {
    return `Olá ${nome}! 👋\n\nIdentificamos uma pendência no seu cadastro de energia solar:\n\n⚠️ *Devolutiva:* ${customer.devolutiva || customer.andamento_igreen || "Verificar pendência"}\n${customer.distribuidora ? `📍 *Distribuidora:* ${customer.distribuidora}` : ""}\n\nPodemos resolver isso juntos? Me avise se precisar de ajuda! 🙏`;
  }
  if (customer.andamento_igreen?.toLowerCase().includes("falta assinatura")) {
    return `Olá ${nome}! 👋\n\nSeu cadastro de energia solar está quase pronto! Falta apenas a *assinatura* para concluir o processo. ✍️\n${customer.distribuidora ? `📍 *Distribuidora:* ${customer.distribuidora}` : ""}\n\nPode assinar o quanto antes para garantir seu desconto? 💚`;
  }
  return `Olá ${nome}! 👋\n\nTudo bem? Estou entrando em contato sobre seu cadastro de energia solar.\n${customer.distribuidora ? `📍 *Distribuidora:* ${customer.distribuidora}` : ""}\n\nPosso te ajudar com alguma dúvida? 💚`;
}

function isDevolutiva(c: Customer): boolean {
  return !!(c.devolutiva || c.andamento_igreen?.toLowerCase().includes("devolutiva"));
}

export function CustomerManager({ customers, consultantId, onCustomersChange, instanceName, onOpenChat }: CustomerManagerProps) {
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
  const [showPreview, setShowPreview] = useState(false);
  const [parsedCustomers, setParsedCustomers] = useState<ParsedCustomer[]>([]);
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [parsing, setParsing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch last sync timestamp
  useEffect(() => {
    supabase.from("settings").select("value").eq("key", "last_igreen_sync").maybeSingle().then(({ data }) => {
      if (data?.value) setLastSync(data.value);
    });
  }, []);

  async function handleSyncIgreen() {
    setSyncing(true);
    try {
      // Fetch consultant's portal credentials
      const { data: consultant } = await supabase.from("consultants").select("igreen_portal_email, igreen_portal_password").eq("id", consultantId).maybeSingle();
      const portalEmail = (consultant as any)?.igreen_portal_email;
      const portalPassword = (consultant as any)?.igreen_portal_password;

      if (!portalEmail || !portalPassword) {
        toast({ title: "⚠️ Credenciais não configuradas", description: "Preencha seu email e senha do portal iGreen na aba Dados.", variant: "destructive" });
        setSyncing(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("sync-igreen-customers", {
        body: { consultant_id: consultantId, portal_email: portalEmail, portal_password: portalPassword },
      });
      if (error) throw error;
      if (data?.success) {
        toast({ title: "✅ Sincronização concluída!", description: `${data.processed} clientes processados, ${data.updated} atualizados.` });
        setLastSync(data.synced_at);
        onCustomersChange();
      } else {
        toast({ title: "⚠️ Problema na sincronização", description: data?.error || "Erro desconhecido", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Erro na sincronização", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }
  useEffect(() => {
    if (!instanceName) return;
    // Only fetch profile pics when WhatsApp is actually connected (instanceName exists and we can reach the API)
    let cancelled = false;
    const fetchPics = async () => {
      const pics: Record<string, string> = {};
      for (const c of customers.slice(0, 50)) {
        if (cancelled) break;
        const phone = c.phone_whatsapp.replace(/\D/g, "");
        if (phone.length < 10 || pics[c.id]) continue;
        try {
          const result = await getProfilePicture(instanceName, `${phone}@s.whatsapp.net`);
          if (result && typeof result === "string") pics[c.id] = result;
        } catch { /* skip */ }
      }
      if (!cancelled) setProfilePics((prev) => ({ ...prev, ...pics }));
    };
    // Delay to avoid hammering the API during initial connection
    const timer = setTimeout(fetchPics, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [instanceName, customers]);

  // Filter by search
  const searchFiltered = search.trim()
    ? customers.filter(
        (c) =>
          (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
          c.phone_whatsapp.includes(search) ||
          (c.email || "").toLowerCase().includes(search.toLowerCase()) ||
          (c.cpf || "").includes(search)
      )
    : customers;

  // Filter by status
  const filtered = statusFilter === "all"
    ? searchFiltered
    : statusFilter === "devolutiva"
    ? searchFiltered.filter((c) => isDevolutiva(c))
    : searchFiltered.filter((c) => c.status === statusFilter);

  // Stats
  const devolutivaCount = customers.filter((c) => isDevolutiva(c)).length;

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
      name: c.name || "", cpf: c.cpf || "", data_nascimento: c.data_nascimento || "",
      email: c.email || "", phone_whatsapp: c.phone_whatsapp, cep: c.cep || "",
      address_street: c.address_street || "", address_number: c.address_number || "",
      address_neighborhood: c.address_neighborhood || "", address_complement: c.address_complement || "",
      address_city: c.address_city || "", address_state: c.address_state || "",
      numero_instalacao: c.numero_instalacao || "", electricity_bill_value: c.electricity_bill_value?.toString() || "",
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

  function buildCustomerData(row: Record<string, unknown>): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    const mediaConsumo = safeNumber(findColumnValue(row, "Consumo Médio", "Consumo Medio", "Consumo", "consumo"));
    if (mediaConsumo != null) data.media_consumo = mediaConsumo;

    const cpf = safeString(findColumnValue(row, "Documento", "CPF", "cpf", "CNPJ"));
    if (cpf) data.cpf = cpf.replace(/\D/g, "");

    const instalacao = safeString(findColumnValue(row, "Instalação", "Instalacao", "Nº Instalação", "N Instalacao"));
    if (instalacao) data.numero_instalacao = instalacao;

    const cidade = safeString(findColumnValue(row, "Cidade", "cidade", "Municipio", "Município"));
    if (cidade) data.address_city = cidade;

    const uf = safeString(findColumnValue(row, "UF", "uf", "Estado", "estado"));
    if (uf) data.address_state = (uf as string).toUpperCase();

    const distribuidora = safeString(findColumnValue(row, "Distribuidora", "distribuidora"));
    if (distribuidora) data.distribuidora = distribuidora;

    const email = safeString(findColumnValue(row, "E-mail", "Email", "email", "EMAIL"));
    if (email) data.email = email;

    const desconto = safeNumber(findColumnValue(row, "Desconto Cliente", "Desconto", "desconto"));
    if (desconto != null) data.desconto_cliente = desconto;

    const nascimento = safeString(findColumnValue(row, "Data Nascimento", "Nascimento", "data_nascimento"));
    if (nascimento) data.data_nascimento = nascimento;

    const licenciado = safeString(findColumnValue(row, "Licenciado", "licenciado", "LICENCIADO", "Nome Licenciado", "Nome do Licenciado", "Consultor", "consultor", "Representante", "representante"));
    if (licenciado) data.registered_by_name = licenciado;

    const codigoLic = safeString(findColumnValue(row, "Código Licenciado", "Codigo Licenciado", "código licenciado", "CÓDIGO LICENCIADO", "Cod Licenciado", "Cod. Licenciado", "ID Licenciado", "Cód Licenciado", "Cód. Licenciado"));
    if (codigoLic) data.registered_by_igreen_id = codigoLic;

    // New fields
    const andamento = safeString(findColumnValue(row, "Andamento", "andamento"));
    if (andamento) data.andamento_igreen = andamento;

    const devolutiva = safeString(findColumnValue(row, "Devolutiva", "devolutiva"));
    if (devolutiva) data.devolutiva = devolutiva;

    const observacao = safeString(findColumnValue(row, "Observação", "Observacao", "observação", "observacao", "Obs"));
    if (observacao) data.observacao = observacao;

    const igreenCode = safeString(findColumnValue(row, "Código", "Codigo", "código", "codigo"));
    if (igreenCode) data.igreen_code = igreenCode;

    const dataCadastro = safeString(findColumnValue(row, "Data Cadastro", "data_cadastro"));
    if (dataCadastro) data.data_cadastro = dataCadastro;

    const dataAtivo = safeString(findColumnValue(row, "Data Ativo", "data_ativo"));
    if (dataAtivo) data.data_ativo = dataAtivo;

    const dataValidado = safeString(findColumnValue(row, "Data Validado", "data_validado"));
    if (dataValidado) data.data_validado = dataValidado;

    const statusFinanceiro = safeString(findColumnValue(row, "Status Financeiro", "status_financeiro"));
    if (statusFinanceiro) data.status_financeiro = statusFinanceiro;

    const cashbackVal = safeString(findColumnValue(row, "Cashback", "cashback"));
    if (cashbackVal) data.cashback = cashbackVal;

    const nivel = safeString(findColumnValue(row, "Nível", "Nivel", "nível", "nivel"));
    if (nivel) data.nivel_licenciado = nivel;

    const assinaturaCliente = safeString(findColumnValue(row, "Assinatura Cliente", "assinatura_cliente"));
    if (assinaturaCliente) data.assinatura_cliente = assinaturaCliente;

    const assinaturaIgreen = safeString(findColumnValue(row, "Assinatura iGreen", "Assinatura Igreen", "assinatura_igreen"));
    if (assinaturaIgreen) data.assinatura_igreen = assinaturaIgreen;

    const linkAssinatura = safeString(findColumnValue(row, "Link Assinatura", "link_assinatura"));
    if (linkAssinatura) data.link_assinatura = linkAssinatura;

    return data;
  }

  async function handleFileSelected(file: File) {
    setParsing(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);

      const existingPhones = new Set(customers.map((c) => c.phone_whatsapp.replace(/\D/g, "")));
      const seenPhones = new Set<string>();
      const parsed: ParsedCustomer[] = [];

      for (const row of rows) {
        const phoneRaw = findColumnValue(row, "Celular", "celular", "Telefone", "telefone", "WhatsApp", "whatsapp", "Fone", "Phone");
        let phone = normalizePhone(String(phoneRaw || ""));

        // If no valid phone, generate a placeholder from Código or Instalação so we don't skip the row
        if (!phone || phone.length < 12) {
          const codigo = safeString(findColumnValue(row, "Código", "Codigo", "código", "codigo"));
          const instalacao = safeString(findColumnValue(row, "Instalação", "Instalacao", "Nº Instalação", "N Instalacao"));
          const fallbackId = codigo || instalacao;
          if (fallbackId) {
            phone = `sem_celular_${fallbackId.replace(/\D/g, "")}`;
          } else {
            continue;
          }
        }
        if (seenPhones.has(phone)) continue;
        seenPhones.add(phone);

        const name = safeString(findColumnValue(row, "Nome do Cliente", "Nome", "nome", "NOME", "Cliente", "Name"));
        const statusRaw = safeString(findColumnValue(row, "Andamento", "Status", "status")) || undefined;
        const isNew = !existingPhones.has(phone);

        parsed.push({ phone, name, status: mapStatus(statusRaw), data: buildCustomerData(row), isNew });
      }

      setParsedCustomers(parsed);
      // Pre-select ALL customers (new + existing for update)
      setSelectedPhones(new Set(parsed.map((p) => p.phone)));
      setShowPreview(true);
    } catch (err) {
      toast({ title: "Erro ao ler arquivo", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function toggleSelect(phone: string) {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone); else next.add(phone);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedPhones.size === parsedCustomers.length) setSelectedPhones(new Set());
    else setSelectedPhones(new Set(parsedCustomers.map((p) => p.phone)));
  }

  async function handleConfirmImport() {
    const toImport = parsedCustomers.filter((p) => selectedPhones.has(p.phone));
    if (toImport.length === 0) { toast({ title: "Nenhum cliente selecionado" }); return; }

    setShowPreview(false);
    setImporting(true);
    setShowImportResult(false);
    const progress = { current: 0, total: toImport.length, newCount: 0, updatedCount: 0, errorCount: 0 };
    setImportProgress({ ...progress });

    const BATCH_SIZE = 100;
    for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
      const batch = toImport.slice(i, i + BATCH_SIZE);
      const batchData = batch.map((item) => ({
        phone_whatsapp: item.phone,
        name: item.name,
        status: item.status,
        consultant_id: consultantId,
        ...item.data,
      })) as TablesInsert<"customers">[];

      try {
        const { data: upserted, error } = await supabase
          .from("customers")
          .upsert(batchData, { onConflict: "phone_whatsapp" })
          .select("id, phone_whatsapp");
        if (error) throw error;

        if (upserted && upserted.length > 0) {
          // Build deals for new customers in batch
          const jids = upserted.map((u) => `${u.phone_whatsapp}@s.whatsapp.net`);
          const { data: existingDeals } = await supabase
            .from("crm_deals")
            .select("remote_jid")
            .in("remote_jid", jids)
            .eq("consultant_id", consultantId);
          const existingJids = new Set((existingDeals || []).map((d) => d.remote_jid));

          const newDeals = upserted
            .filter((u) => !existingJids.has(`${u.phone_whatsapp}@s.whatsapp.net`))
            .map((u) => ({
              consultant_id: consultantId,
              customer_id: u.id,
              remote_jid: `${u.phone_whatsapp}@s.whatsapp.net`,
              stage: "novo_lead",
            }));
          if (newDeals.length > 0) {
            await supabase.from("crm_deals").insert(newDeals);
          }

          const newPhones = new Set(batch.filter((b) => b.isNew).map((b) => b.phone));
          for (const u of upserted) {
            if (newPhones.has(u.phone_whatsapp)) progress.newCount++;
            else progress.updatedCount++;
          }
        }
      } catch (err) {
        console.error("[import] Batch error at offset", i, err);
        progress.errorCount += batch.length;
      }
      progress.current = Math.min(i + BATCH_SIZE, toImport.length);
      setImportProgress({ ...progress });
    }

    setShowImportResult(true);
    setImporting(false);
    toast({ title: "✅ Importação concluída!", description: `${progress.newCount} novos, ${progress.updatedCount} atualizados${progress.errorCount > 0 ? `, ${progress.errorCount} erros` : ""}` });
    onCustomersChange();
    await queryClient.invalidateQueries({ queryKey: ["analytics", consultantId] });
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

  function handleCopyMessage(customer: Customer) {
    const msg = buildWhatsAppMessage(customer);
    navigator.clipboard.writeText(msg);
    toast({ title: "📋 Mensagem copiada!", description: "Cole no WhatsApp para enviar" });
  }

  function handleOpenWhatsApp(customer: Customer) {
    const phone = customer.phone_whatsapp.replace(/\D/g, "");
    const msg = buildWhatsAppMessage(customer);
    if (onOpenChat) {
      onOpenChat(phone, msg);
    } else {
      const encoded = encodeURIComponent(msg);
      window.open(`https://wa.me/${phone}?text=${encoded}`, "_blank");
    }
  }

  const newCount = parsedCustomers.filter((p) => p.isNew).length;
  const existingCount = parsedCustomers.length - newCount;
  const selectedCount = selectedPhones.size;

  const filterButtons: { key: StatusFilter; label: string; count: number; color: string }[] = [
    { key: "all", label: "Todos", count: customers.length, color: "text-foreground" },
    { key: "approved", label: "Aprovados", count: customers.filter((c) => c.status === "approved").length, color: "text-green-400" },
    { key: "pending", label: "Pendentes", count: customers.filter((c) => c.status === "pending").length, color: "text-yellow-400" },
    { key: "devolutiva", label: "Devolutiva", count: devolutivaCount, color: "text-red-400" },
    { key: "lead", label: "Leads", count: customers.filter((c) => c.status === "lead").length, color: "text-blue-400" },
  ];

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
              <p className="text-[11px] text-muted-foreground">
                Gerencie sua carteira de clientes
                {lastSync && <span className="ml-2 text-muted-foreground/60">• Última sync: {new Date(lastSync).toLocaleString("pt-BR")}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleSyncIgreen} size="sm" variant="outline" className="gap-2 rounded-xl font-semibold h-9 px-4 border-green-500/20 text-green-600 hover:bg-green-500/10" disabled={syncing}>
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sincronizar iGreen
            </Button>
            <Button onClick={() => fileInputRef.current?.click()} size="sm" variant="outline" className="gap-2 rounded-xl font-semibold h-9 px-4 border-primary/20 text-primary hover:bg-primary/10" disabled={importing || parsing}>
              {(importing || parsing) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Importar Excel
            </Button>
            <Button onClick={() => setShowAddDialog(true)} size="sm" className="gap-2 rounded-xl font-semibold shadow-lg shadow-primary/15 h-9 px-4">
              <UserPlus className="w-4 h-4" /> Novo Cliente
            </Button>
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileSelected(file); }} />
        </div>

        {/* Import Progress */}
        {importing && (
          <div className="px-5 py-3 border-b border-border/50">
            <div className="flex items-center gap-3 mb-2">
              <FileSpreadsheet className="w-4 h-4 text-primary animate-pulse" />
              <span className="text-xs font-medium text-foreground">Importando... {importProgress.current}/{importProgress.total}</span>
            </div>
            <div className="w-full h-2 bg-secondary/50 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%` }} />
            </div>
            <div className="flex gap-4 mt-1.5 text-[10px] text-muted-foreground">
              <span className="text-green-400">{importProgress.newCount} novos</span>
              {importProgress.errorCount > 0 && <span className="text-red-400">{importProgress.errorCount} erros</span>}
            </div>
          </div>
        )}

        {showImportResult && !importing && (
          <div className="px-5 py-3 border-b border-border/50 bg-green-500/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span className="text-xs font-medium text-foreground">
                  Importação concluída: {importProgress.newCount} novos, {importProgress.updatedCount} atualizados
                  {importProgress.errorCount > 0 && `, ${importProgress.errorCount} erros`}
                </span>
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowImportResult(false)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="px-5 pt-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <Input placeholder="Buscar por nome, telefone, email ou CPF..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-10 rounded-xl bg-secondary/30 border-border/50 focus:border-primary/40 text-sm" />
          </div>
        </div>

        {/* Clickable Status Filters */}
        <div className="flex gap-2 px-5 pb-3 flex-wrap">
          {filterButtons.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                statusFilter === f.key
                  ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
                  : "border-border/30 bg-secondary/20 hover:bg-secondary/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className={`text-sm font-bold ${statusFilter === f.key ? "text-primary" : f.color}`}>{f.count}</span>
              <span>{f.label}</span>
            </button>
          ))}
        </div>

        {/* List */}
        <div className="px-5 pb-5">
          <div className="max-h-[calc(100vh-460px)] overflow-y-auto space-y-2 pr-1">
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
                const hasDevolutiva = isDevolutiva(c);

                return (
                  <div key={c.id} className={`rounded-xl border transition-all duration-200 ${isExpanded ? "border-primary/20 bg-primary/[0.02] shadow-md shadow-primary/5" : hasDevolutiva ? "border-red-500/20 bg-red-500/[0.02] hover:border-red-500/30" : "border-border/40 bg-secondary/10 hover:border-border/60 hover:bg-secondary/20"}`}>
                    <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : c.id)}>
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
                          {hasDevolutiva && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-red-500/15 text-red-400 border-red-500/20">
                              ⚠️ Devolutiva
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Phone className="h-2.5 w-2.5" />
                            {formatPhoneDisplay(c.phone_whatsapp)}
                          </span>
                          {c.distribuidora && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Building2 className="h-2.5 w-2.5" />
                              {c.distribuidora}
                            </span>
                          )}
                          {c.address_city && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-2.5 w-2.5" />
                              {c.address_city}{c.address_state ? `/${c.address_state}` : ""}
                            </span>
                          )}
                          {c.registered_by_name && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <User className="h-2.5 w-2.5" />
                              {c.registered_by_name}
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
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 mt-2">
                          {c.igreen_code && <DetailItem icon={FileText} label="Código iGreen" value={c.igreen_code} />}
                          {c.cpf && <DetailItem icon={CreditCard} label="CPF" value={formatCpfDisplay(c.cpf)} />}
                          {c.email && <DetailItem icon={Mail} label="Email" value={c.email} />}
                          <DetailItem icon={Phone} label="WhatsApp" value={formatPhoneDisplay(c.phone_whatsapp)} />
                          {c.data_nascimento && <DetailItem icon={User} label="Nascimento" value={c.data_nascimento} />}
                          {c.distribuidora && <DetailItem icon={Building2} label="Distribuidora" value={c.distribuidora} />}
                          {c.registered_by_name && <DetailItem icon={User} label="Licenciado" value={`${c.registered_by_name}${c.registered_by_igreen_id ? ` (${c.registered_by_igreen_id})` : ""}`} />}
                          {c.nivel_licenciado && <DetailItem icon={User} label="Nível" value={c.nivel_licenciado} />}
                          {c.andamento_igreen && <DetailItem icon={FileText} label="Andamento iGreen" value={c.andamento_igreen} />}
                          {c.status_financeiro && <DetailItem icon={CreditCard} label="Status Financeiro" value={c.status_financeiro} />}
                          {c.media_consumo != null && <DetailItem icon={Zap} label="Consumo Médio" value={`${c.media_consumo} kWh`} />}
                          {c.desconto_cliente != null && <DetailItem icon={Zap} label="Desconto" value={`${c.desconto_cliente}%`} />}
                          {c.cashback && <DetailItem icon={Zap} label="Cashback" value={c.cashback} />}
                          {(c.address_city || c.address_state) && <DetailItem icon={MapPin} label="Localidade" value={`${c.address_city || ""}${c.address_state ? ` / ${c.address_state}` : ""}`} />}
                          {c.address_street && <DetailItem icon={MapPin} label="Endereço" value={`${c.address_street}${c.address_number ? `, ${c.address_number}` : ""}`} />}
                          {c.numero_instalacao && <DetailItem icon={Zap} label="Nº Instalação" value={c.numero_instalacao} />}
                          {c.electricity_bill_value != null && <DetailItem icon={Zap} label="Valor Conta" value={`R$ ${c.electricity_bill_value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />}
                          {c.assinatura_cliente && <DetailItem icon={FileText} label="Assinatura Cliente" value={c.assinatura_cliente} />}
                          {c.assinatura_igreen && <DetailItem icon={FileText} label="Assinatura iGreen" value={c.assinatura_igreen} />}
                          {c.data_cadastro && <DetailItem icon={User} label="Data Cadastro" value={c.data_cadastro} />}
                          {c.data_ativo && <DetailItem icon={User} label="Data Ativo" value={c.data_ativo} />}
                          {c.data_validado && <DetailItem icon={User} label="Data Validado" value={c.data_validado} />}
                          {c.created_at && <DetailItem icon={User} label="Cadastrado Sistema" value={new Date(c.created_at).toLocaleDateString("pt-BR")} />}
                          {c.link_assinatura && (
                            <div className="flex items-start gap-2">
                              <FileText className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                              <div>
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Link Assinatura</p>
                                <a href={c.link_assinatura} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate block max-w-[200px]">Abrir link</a>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Devolutiva highlight */}
                        {(c.devolutiva || c.observacao) && (
                          <div className="mt-3 space-y-2">
                            {c.devolutiva && (
                              <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <AlertTriangle className="h-3 w-3 text-red-400" />
                                  <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">Devolutiva</span>
                                </div>
                                <p className="text-xs text-foreground">{c.devolutiva}</p>
                              </div>
                            )}
                            {c.observacao && (
                              <div className="rounded-lg border border-border/30 bg-secondary/20 px-3 py-2">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <FileText className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Observação</span>
                                </div>
                                <p className="text-xs text-foreground">{c.observacao}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex justify-between gap-2 mt-3 pt-3 border-t border-border/20">
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 text-green-400 border-green-500/20 hover:bg-green-500/10" onClick={() => handleOpenWhatsApp(c)}>
                              <MessageCircle className="w-3 h-3" /> Enviar WhatsApp
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 text-muted-foreground border-border/30 hover:bg-secondary/30" onClick={() => handleCopyMessage(c)}>
                              <ClipboardCopy className="w-3 h-3" /> Copiar Msg
                            </Button>
                          </div>
                          <div className="flex gap-2">
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
      <AddCustomerDialog open={showAddDialog} onOpenChange={setShowAddDialog} phone="" name={null} consultantId={consultantId} onAdded={onCustomersChange} />

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

      {/* Import Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden">
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 pt-6 pb-4 border-b border-border">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-primary" />
                Aprovar Importação
              </DialogTitle>
            </DialogHeader>
            <div className="flex gap-4 mt-3 text-xs">
              <span className="text-muted-foreground">Total na planilha: <strong className="text-foreground">{parsedCustomers.length}</strong></span>
              <span className="text-green-400">Novos: <strong>{newCount}</strong></span>
              <span className="text-muted-foreground">Já cadastrados: <strong>{existingCount}</strong> (ignorados)</span>
              <span className="text-primary">Selecionados: <strong>{selectedCount}</strong></span>
            </div>
          </div>

          <div className="px-6 py-2 border-b border-border/50 flex items-center justify-between">
            <button onClick={toggleSelectAll} className="flex items-center gap-2 text-xs font-medium text-foreground hover:text-primary transition-colors">
              <Checkbox checked={parsedCustomers.length > 0 && selectedPhones.size === parsedCustomers.length} onCheckedChange={toggleSelectAll} />
              Selecionar todos ({parsedCustomers.length})
            </button>
          </div>

          <ScrollArea className="max-h-[55vh]">
            <div className="px-6 py-2 space-y-1">
              {parsedCustomers.map((p) => {
                const isSelected = selectedPhones.has(p.phone);
                const statusBadge = getStatusBadge(p.status);
                return (
                  <div key={p.phone} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${isSelected ? "border-primary/30 bg-primary/[0.04]" : "border-border/30 bg-secondary/5 hover:bg-secondary/15"}`}>
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(p.phone)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{p.name || "Sem nome"}</p>
                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${statusBadge.className}`}>{statusBadge.label}</Badge>
                        {!p.isNew && <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-yellow-500/10 text-yellow-400 border-yellow-500/20">Atualizar</Badge>}
                        {p.isNew && <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-green-500/10 text-green-400 border-green-500/20">Novo</Badge>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Phone className="h-2.5 w-2.5" />{formatPhoneDisplay(p.phone)}
                        </span>
                        {p.data.address_city && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-2.5 w-2.5" />{String(p.data.address_city)}{p.data.address_state ? `/${p.data.address_state}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              <strong className="text-green-400">Novos</strong> serão criados, <strong className="text-yellow-400">existentes</strong> serão atualizados com dados do Excel.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-9 text-xs px-4" onClick={() => setShowPreview(false)}>Cancelar</Button>
              <Button size="sm" className="h-9 text-xs px-5 gap-1.5 font-semibold shadow-lg shadow-primary/20" onClick={handleConfirmImport} disabled={selectedCount === 0}>
                <Upload className="w-3.5 h-3.5" />
                Importar {selectedCount} cliente{selectedCount !== 1 ? "s" : ""}
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
