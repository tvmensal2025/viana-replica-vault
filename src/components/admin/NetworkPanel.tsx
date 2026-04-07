import { useState, useEffect, useMemo } from "react";
import { Users, UserCheck, AlertTriangle, CheckCircle2, RefreshCw, Loader2, Search, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface NetworkMember {
  id: string;
  igreen_id: number;
  name: string;
  phone: string | null;
  sponsor_id: number | null;
  nivel: number;
  data_ativo: string | null;
  cidade: string | null;
  uf: string | null;
  clientes_ativos: number;
  gp: number;
  gi: number;
  qtde_diretos: number;
  total_pontos: number;
  updated_at: string;
}

interface NetworkPanelProps {
  consultantId: string;
}

export function NetworkPanel({ consultantId }: NetworkPanelProps) {
  const [members, setMembers] = useState<NetworkMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("network_members" as any)
        .select("*")
        .eq("consultant_id", consultantId)
        .order("nivel", { ascending: true });
      if (error) throw error;
      setMembers((data as unknown as NetworkMember[]) || []);
    } catch {
      /* silently handle */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMembers(); }, [consultantId]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: consultant } = await supabase
        .from("consultants")
        .select("igreen_portal_email, igreen_portal_password")
        .eq("id", consultantId)
        .maybeSingle();

      const email = (consultant as any)?.igreen_portal_email;
      const password = (consultant as any)?.igreen_portal_password;

      if (!email || !password) {
        toast({ title: "⚠️ Credenciais não configuradas", description: "Preencha email e senha do portal na aba Dados.", variant: "destructive" });
        setSyncing(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("sync-igreen-customers", {
        body: { mode: "sync_network", consultant_id: consultantId, portal_email: email, portal_password: password },
      });

      if (error) throw error;
      if (data?.success) {
        toast({ title: "✅ Rede sincronizada!", description: `${data.total_members} licenciados encontrados.` });
        await fetchMembers();
      } else {
        toast({ title: "⚠️ Erro", description: data?.error || "Erro desconhecido", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return members;
    const q = search.toLowerCase();
    return members.filter(m =>
      m.name.toLowerCase().includes(q) ||
      String(m.igreen_id).includes(q) ||
      (m.cidade || "").toLowerCase().includes(q) ||
      (m.phone || "").includes(q)
    );
  }, [members, search]);

  const totalClientes = members.reduce((sum, m) => sum + m.clientes_ativos, 0);
  const totalGP = members.reduce((sum, m) => sum + m.gp, 0);
  const totalGI = members.reduce((sum, m) => sum + m.gi, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon={Users} label="Licenciados" value={members.length} color="text-primary" />
        <SummaryCard icon={UserCheck} label="Clientes Ativos" value={totalClientes} color="text-green-500" />
        <SummaryCard icon={TrendingUp} label="GP Total" value={totalGP.toLocaleString("pt-BR")} color="text-blue-500" />
        <SummaryCard icon={CheckCircle2} label="GI Total" value={totalGI.toLocaleString("pt-BR")} color="text-emerald-500" />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/15">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-base">Mapa de Rede</h3>
              <p className="text-xs text-muted-foreground">{members.length} licenciados na sua rede</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
              <Input
                placeholder="Buscar nome, ID, cidade..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 rounded-xl bg-secondary/30 border-border/50 text-sm w-full sm:w-56"
              />
            </div>
            <Button onClick={handleSync} size="sm" variant="outline" disabled={syncing} className="gap-1.5 rounded-xl font-semibold h-9 px-4 text-xs border-green-500/20 text-green-600 hover:bg-green-500/10">
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {syncing ? "Sincronizando..." : "Sincronizar Rede"}
            </Button>
          </div>
        </div>

        {members.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">Nenhum licenciado encontrado.</p>
            <Button onClick={handleSync} size="sm" disabled={syncing} className="gap-1.5 rounded-xl">
              <RefreshCw className="w-3.5 h-3.5" /> Sincronizar agora
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/30 text-muted-foreground text-xs">
                  <th className="text-center px-2 py-2.5 font-medium w-12">Nível</th>
                  <th className="text-center px-2 py-2.5 font-medium w-16">ID</th>
                  <th className="text-left px-3 py-2.5 font-medium">Nome</th>
                  <th className="text-center px-2 py-2.5 font-medium hidden sm:table-cell">Patrocinador</th>
                  <th className="text-center px-2 py-2.5 font-medium hidden md:table-cell">Celular</th>
                  <th className="text-center px-2 py-2.5 font-medium hidden sm:table-cell">Cidade</th>
                  <th className="text-center px-2 py-2.5 font-medium w-10 hidden sm:table-cell">UF</th>
                  <th className="text-center px-2 py-2.5 font-medium">Cli. Ativos</th>
                  <th className="text-center px-2 py-2.5 font-medium hidden lg:table-cell">GP</th>
                  <th className="text-center px-2 py-2.5 font-medium hidden lg:table-cell">GI</th>
                  <th className="text-center px-2 py-2.5 font-medium hidden lg:table-cell">Diretos</th>
                  <th className="text-center px-2 py-2.5 font-medium hidden xl:table-cell">Pontos</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => (
                  <tr key={m.id} className="border-t border-border/30 hover:bg-secondary/20 transition-colors">
                    <td className="text-center px-2 py-2.5">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                        m.nivel === 0 ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                      }`}>
                        {m.nivel}
                      </span>
                    </td>
                    <td className="text-center px-2 py-2.5 font-mono text-xs text-muted-foreground">{m.igreen_id}</td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{m.name}</td>
                    <td className="text-center px-2 py-2.5 font-mono text-xs text-muted-foreground hidden sm:table-cell">{m.sponsor_id || "—"}</td>
                    <td className="text-center px-2 py-2.5 text-xs text-muted-foreground hidden md:table-cell">{formatPhone(m.phone)}</td>
                    <td className="text-center px-2 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{m.cidade || "—"}</td>
                    <td className="text-center px-2 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{m.uf || "—"}</td>
                    <td className="text-center px-2 py-2.5">
                      <span className="font-bold text-green-500">{m.clientes_ativos}</span>
                    </td>
                    <td className="text-center px-2 py-2.5 text-xs hidden lg:table-cell">{m.gp.toLocaleString("pt-BR")}</td>
                    <td className="text-center px-2 py-2.5 text-xs hidden lg:table-cell">{m.gi.toLocaleString("pt-BR")}</td>
                    <td className="text-center px-2 py-2.5 text-xs hidden lg:table-cell">{m.qtde_diretos}</td>
                    <td className="text-center px-2 py-2.5 text-xs hidden xl:table-cell">{m.total_pontos.toLocaleString("pt-BR")}</td>
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

function SummaryCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number | string; color: string }) {
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

function formatPhone(phone: string | null) {
  if (!phone || phone.length < 10) return "—";
  const clean = phone.replace(/^55/, "");
  if (clean.length === 11) return `(${clean.slice(0,2)}) ${clean.slice(2,7)}-${clean.slice(7)}`;
  if (clean.length === 10) return `(${clean.slice(0,2)}) ${clean.slice(2,6)}-${clean.slice(6)}`;
  return phone;
}
