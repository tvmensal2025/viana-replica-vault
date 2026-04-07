import { useMemo } from "react";
import { Users, UserCheck, Clock, AlertTriangle, CheckCircle2, XCircle, FileText } from "lucide-react";

interface Customer {
  id: string;
  name: string;
  phone_whatsapp: string;
  status: string;
  registered_by_name?: string | null;
  registered_by_igreen_id?: string | null;
  andamento_igreen?: string | null;
  data_cadastro?: string | null;
  data_ativo?: string | null;
}

interface NetworkPanelProps {
  customers: Customer[];
}

interface LicenciadoSummary {
  name: string;
  igreenId: string | null;
  totalClients: number;
  approved: number;
  pending: number;
  awaitingSignature: number;
  devolutiva: number;
  rejected: number;
  lead: number;
  lastRegister: string | null;
}

export function NetworkPanel({ customers }: NetworkPanelProps) {
  const licenciados = useMemo(() => {
    const map = new Map<string, LicenciadoSummary>();

    for (const c of customers) {
      const licName = c.registered_by_name || "Sem licenciado";
      const key = licName.toLowerCase().trim();

      if (!map.has(key)) {
        map.set(key, {
          name: licName,
          igreenId: c.registered_by_igreen_id || null,
          totalClients: 0,
          approved: 0,
          pending: 0,
          awaitingSignature: 0,
          devolutiva: 0,
          rejected: 0,
          lead: 0,
          lastRegister: null,
        });
      }

      const lic = map.get(key)!;
      lic.totalClients++;

      if (c.status === "approved") lic.approved++;
      else if (c.status === "pending") lic.pending++;
      else if (c.status === "awaiting_signature") lic.awaitingSignature++;
      else if (c.status === "devolutiva") lic.devolutiva++;
      else if (c.status === "rejected") lic.rejected++;
      else if (c.status === "lead") lic.lead++;

      if (!lic.igreenId && c.registered_by_igreen_id) {
        lic.igreenId = c.registered_by_igreen_id;
      }

      if (c.data_cadastro && (!lic.lastRegister || c.data_cadastro > lic.lastRegister)) {
        lic.lastRegister = c.data_cadastro;
      }
    }

    return Array.from(map.values()).sort((a, b) => b.totalClients - a.totalClients);
  }, [customers]);

  const totalClients = customers.length;
  const totalLicenciados = licenciados.filter(l => l.name !== "Sem licenciado").length;

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon={Users} label="Licenciados" value={totalLicenciados} color="text-primary" />
        <SummaryCard icon={UserCheck} label="Total Clientes" value={totalClients} color="text-green-500" />
        <SummaryCard icon={CheckCircle2} label="Aprovados" value={customers.filter(c => c.status === "approved").length} color="text-emerald-500" />
        <SummaryCard icon={AlertTriangle} label="Devolutivas" value={customers.filter(c => c.status === "devolutiva").length} color="text-red-400" />
      </div>

      {/* Licenciados Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border/50 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/15">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-foreground text-base">Rede de Licenciados</h3>
            <p className="text-xs text-muted-foreground">{totalLicenciados} licenciados na sua rede</p>
          </div>
        </div>

        {licenciados.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum licenciado encontrado. Sincronize os clientes primeiro.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/30 text-muted-foreground text-xs">
                  <th className="text-left px-4 py-2.5 font-medium">Licenciado</th>
                  <th className="text-center px-2 py-2.5 font-medium">Código</th>
                  <th className="text-center px-2 py-2.5 font-medium">Total</th>
                  <th className="text-center px-2 py-2.5 font-medium hidden sm:table-cell">
                    <span className="flex items-center justify-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> Aprov.</span>
                  </th>
                  <th className="text-center px-2 py-2.5 font-medium hidden sm:table-cell">
                    <span className="flex items-center justify-center gap-1"><Clock className="w-3 h-3 text-yellow-500" /> Pend.</span>
                  </th>
                  <th className="text-center px-2 py-2.5 font-medium hidden sm:table-cell">
                    <span className="flex items-center justify-center gap-1"><FileText className="w-3 h-3 text-orange-500" /> Assin.</span>
                  </th>
                  <th className="text-center px-2 py-2.5 font-medium hidden sm:table-cell">
                    <span className="flex items-center justify-center gap-1"><AlertTriangle className="w-3 h-3 text-red-500" /> Dev.</span>
                  </th>
                  <th className="text-center px-2 py-2.5 font-medium hidden md:table-cell">
                    <span className="flex items-center justify-center gap-1"><XCircle className="w-3 h-3 text-red-400" /> Rep.</span>
                  </th>
                  <th className="text-center px-2 py-2.5 font-medium hidden md:table-cell">Leads</th>
                  <th className="text-right px-4 py-2.5 font-medium hidden lg:table-cell">Último Cadastro</th>
                </tr>
              </thead>
              <tbody>
                {licenciados.map((lic, i) => (
                  <tr key={lic.name + i} className="border-t border-border/30 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{lic.name}</span>
                    </td>
                    <td className="text-center px-2 py-3">
                      <span className="text-xs text-muted-foreground font-mono">{lic.igreenId || "—"}</span>
                    </td>
                    <td className="text-center px-2 py-3">
                      <span className="font-bold text-primary">{lic.totalClients}</span>
                    </td>
                    <td className="text-center px-2 py-3 hidden sm:table-cell">
                      <StatusBadge count={lic.approved} color="bg-green-500/15 text-green-500" />
                    </td>
                    <td className="text-center px-2 py-3 hidden sm:table-cell">
                      <StatusBadge count={lic.pending} color="bg-yellow-500/15 text-yellow-500" />
                    </td>
                    <td className="text-center px-2 py-3 hidden sm:table-cell">
                      <StatusBadge count={lic.awaitingSignature} color="bg-orange-500/15 text-orange-500" />
                    </td>
                    <td className="text-center px-2 py-3 hidden sm:table-cell">
                      <StatusBadge count={lic.devolutiva} color="bg-red-500/15 text-red-500" />
                    </td>
                    <td className="text-center px-2 py-3 hidden md:table-cell">
                      <StatusBadge count={lic.rejected} color="bg-red-400/15 text-red-400" />
                    </td>
                    <td className="text-center px-2 py-3 hidden md:table-cell">
                      <StatusBadge count={lic.lead} color="bg-blue-500/15 text-blue-500" />
                    </td>
                    <td className="text-right px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {lic.lastRegister ? formatDate(lic.lastRegister) : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-xl sm:text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ count, color }: { count: number; color: string }) {
  if (count === 0) return <span className="text-muted-foreground/40">0</span>;
  return (
    <span className={`inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-md text-xs font-semibold ${color}`}>
      {count}
    </span>
  );
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch {
    return dateStr;
  }
}
