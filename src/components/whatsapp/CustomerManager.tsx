import { useState } from "react";
import {
  UserPlus,
  Trash2,
  Users,
  Search,
  User,
  Phone,
  Mail,
  MapPin,
  Zap,
  ChevronDown,
  ChevronUp,
  Pencil,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { AddCustomerDialog } from "./AddCustomerDialog";

interface Customer {
  id: string;
  name: string | null;
  phone_whatsapp: string;
  electricity_bill_value?: number | null;
  email?: string | null;
  cpf?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  status?: string | null;
  created_at?: string | null;
}

interface CustomerManagerProps {
  customers: Customer[];
  consultantId: string;
  onCustomersChange: () => void;
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
  if (!name || name.trim() === "") return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function getStatusBadge(status: string | null | undefined) {
  switch (status) {
    case "approved":
      return { label: "Aprovado", className: "bg-green-500/15 text-green-400 border-green-500/20" };
    case "rejected":
      return { label: "Reprovado", className: "bg-red-500/15 text-red-400 border-red-500/20" };
    case "pending":
      return { label: "Pendente", className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20" };
    case "lead":
      return { label: "Lead", className: "bg-blue-500/15 text-blue-400 border-blue-500/20" };
    default:
      return { label: status || "Novo", className: "bg-muted text-muted-foreground border-border" };
  }
}

export function CustomerManager({ customers, consultantId, onCustomersChange }: CustomerManagerProps) {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const { toast } = useToast();

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
      toast({
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
      {/* Decorative gradient */}
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
          <Button
            onClick={() => setShowAddDialog(true)}
            size="sm"
            className="gap-2 rounded-xl font-semibold shadow-lg shadow-primary/15 h-9 px-4"
          >
            <UserPlus className="w-4 h-4" />
            Novo Cliente
          </Button>
        </div>

        {/* Search */}
        <div className="px-5 pt-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <Input
              placeholder="Buscar por nome, telefone, email ou CPF..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 rounded-xl bg-secondary/30 border-border/50 focus:border-primary/40 text-sm"
            />
          </div>
        </div>

        {/* Stats bar */}
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

        {/* Customer List */}
        <div className="px-5 pb-5">
          <div className="max-h-[calc(100vh-420px)] overflow-y-auto space-y-2 pr-1">
            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-secondary/50 flex items-center justify-center mx-auto mb-3">
                  <Users className="w-7 h-7 text-muted-foreground/30" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {customers.length === 0 ? "Nenhum cliente cadastrado" : "Nenhum resultado encontrado"}
                </p>
                {customers.length === 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 gap-1.5 text-xs"
                    onClick={() => setShowAddDialog(true)}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Adicionar primeiro cliente
                  </Button>
                )}
              </div>
            ) : (
              filtered.map((c) => {
                const isExpanded = expandedId === c.id;
                const status = getStatusBadge(c.status);

                return (
                  <div
                    key={c.id}
                    className={`rounded-xl border transition-all duration-200 ${
                      isExpanded
                        ? "border-primary/20 bg-primary/[0.02] shadow-md shadow-primary/5"
                        : "border-border/40 bg-secondary/10 hover:border-border/60 hover:bg-secondary/20"
                    }`}
                  >
                    {/* Main row */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    >
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center border border-primary/10 shrink-0">
                        <span className="text-xs font-bold text-primary">{getInitials(c.name)}</span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {c.name || "Sem nome"}
                          </p>
                          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${status.className}`}>
                            {status.label}
                          </Badge>
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

                      {/* Value + expand */}
                      <div className="flex items-center gap-3 shrink-0">
                        {c.electricity_bill_value != null && c.electricity_bill_value > 0 && (
                          <div className="text-right">
                            <p className="text-xs font-bold text-primary">
                              R${c.electricity_bill_value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </p>
                            <p className="text-[9px] text-muted-foreground">consumo</p>
                          </div>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground/50" />
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-border/30">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-2">
                          {c.cpf && (
                            <DetailItem icon={CreditCard} label="CPF" value={formatCpfDisplay(c.cpf)} />
                          )}
                          {c.email && (
                            <DetailItem icon={Mail} label="Email" value={c.email} />
                          )}
                          {c.phone_whatsapp && (
                            <DetailItem icon={Phone} label="WhatsApp" value={formatPhoneDisplay(c.phone_whatsapp)} />
                          )}
                          {(c.address_city || c.address_state) && (
                            <DetailItem
                              icon={MapPin}
                              label="Localidade"
                              value={`${c.address_city || ""}${c.address_state ? ` / ${c.address_state}` : ""}`}
                            />
                          )}
                          {c.electricity_bill_value != null && (
                            <DetailItem
                              icon={Zap}
                              label="Média de Consumo"
                              value={`R$ ${c.electricity_bill_value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                            />
                          )}
                          {c.created_at && (
                            <DetailItem
                              icon={User}
                              label="Cadastrado em"
                              value={new Date(c.created_at).toLocaleDateString("pt-BR")}
                            />
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-border/20">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[10px] gap-1 text-destructive border-destructive/20 hover:bg-destructive/10"
                              >
                                <Trash2 className="w-3 h-3" />
                                Remover
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover cliente</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja remover {c.name || "este cliente"}?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(c.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Remover
                                </AlertDialogAction>
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

      {/* Add Customer Dialog */}
      <AddCustomerDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        phone=""
        name={null}
        onAdded={onCustomersChange}
      />
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
