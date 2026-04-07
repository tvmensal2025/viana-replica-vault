import { useState, useEffect, useMemo, useCallback } from "react";
import { Users, UserCheck, TrendingUp, CheckCircle2, RefreshCw, Loader2, Search, MessageCircle, ChevronRight, ChevronDown, TreePine, Table2 } from "lucide-react";
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

interface TreeNode {
  member: NetworkMember;
  children: TreeNode[];
}

interface NetworkPanelProps {
  consultantId: string;
}

function buildTree(members: NetworkMember[]): TreeNode[] {
  const byId = new Map<number, TreeNode>();
  members.forEach(m => byId.set(m.igreen_id, { member: m, children: [] }));

  const roots: TreeNode[] = [];
  members.forEach(m => {
    const node = byId.get(m.igreen_id)!;
    if (m.sponsor_id && byId.has(m.sponsor_id)) {
      byId.get(m.sponsor_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function formatPhone(phone: string | null) {
  if (!phone || phone.length < 10) return null;
  const clean = phone.replace(/^55/, "");
  if (clean.length === 11) return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  if (clean.length === 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  return phone;
}

function openWhatsApp(phone: string | null) {
  if (!phone) return;
  const clean = phone.replace(/\D/g, "");
  const num = clean.startsWith("55") ? clean : `55${clean}`;
  window.open(`https://wa.me/${num}`, "_blank");
}

const LEVEL_COLORS = [
  "bg-primary/20 text-primary border-primary/30",
  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "bg-rose-500/20 text-rose-400 border-rose-500/30",
];

function TreeNodeComponent({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const m = node.member;
  const hasChildren = node.children.length > 0;
  const colorClass = LEVEL_COLORS[Math.min(depth, LEVEL_COLORS.length - 1)];
  const formatted = formatPhone(m.phone);

  return (
    <div className={depth > 0 ? "ml-4 sm:ml-6 border-l border-border/40 pl-3 sm:pl-4" : ""}>
      <div
        className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-secondary/30 transition-colors group cursor-pointer"
        onClick={() => hasChildren && setOpen(!open)}
      >
        {hasChildren ? (
          <button className="w-5 h-5 flex items-center justify-center text-muted-foreground shrink-0">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-5 h-5 shrink-0" />
        )}

        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold border shrink-0 ${colorClass}`}>
          {m.nivel}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground truncate">{m.name}</span>
            <span className="text-[10px] font-mono text-muted-foreground/60">#{m.igreen_id}</span>
            {m.phone && (
              <button
                onClick={e => { e.stopPropagation(); openWhatsApp(m.phone); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-green-500/20"
                title="Enviar WhatsApp"
              >
                <MessageCircle className="w-3.5 h-3.5 text-green-500" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
            {m.cidade && <span>{m.cidade}{m.uf ? `/${m.uf}` : ""}</span>}
            {formatted && <span>{formatted}</span>}
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-4 text-xs shrink-0">
          <div className="text-center">
            <span className="text-muted-foreground/60 block text-[10px]">GP</span>
            <span className="font-bold text-foreground">{Number(m.gp).toLocaleString("pt-BR")}</span>
          </div>
          <div className="text-center">
            <span className="text-muted-foreground/60 block text-[10px]">GI</span>
            <span className="font-bold text-foreground">{Number(m.gi).toLocaleString("pt-BR")}</span>
          </div>
          <div className="text-center">
            <span className="text-muted-foreground/60 block text-[10px]">Cli</span>
            <span className="font-bold text-green-500">{m.clientes_ativos}</span>
          </div>
          <div className="text-center">
            <span className="text-muted-foreground/60 block text-[10px]">Diretos</span>
            <span className="font-bold text-foreground">{m.qtde_diretos}</span>
          </div>
        </div>
      </div>

      {open && hasChildren && (
        <div className="mt-0.5">
          {node.children.map(child => (
            <TreeNodeComponent key={child.member.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function NetworkPanel({ consultantId }: NetworkPanelProps) {
  const [members, setMembers] = useState<NetworkMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"tree" | "table">("tree");
  const { toast } = useToast();

  const fetchMembers = useCallback(async () => {
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
  }, [consultantId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

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

  const rootMember = useMemo(() => members.find(m => m.nivel === 0), [members]);
  const totalClientes = useMemo(() => members.reduce((sum, m) => sum + m.clientes_ativos, 0), [members]);
  const networkCount = useMemo(() => members.filter(m => m.nivel > 0).length, [members]);

  const tree = useMemo(() => buildTree(members), [members]);

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
        <SummaryCard icon={Users} label="Licenciados" value={networkCount} color="text-primary" />
        <SummaryCard icon={UserCheck} label="Clientes Ativos" value={totalClientes} color="text-green-500" />
        <SummaryCard icon={TrendingUp} label="GP" value={rootMember ? Number(rootMember.gp).toLocaleString("pt-BR") : "0"} color="text-blue-500" />
        <SummaryCard icon={CheckCircle2} label="GI" value={rootMember ? Number(rootMember.gi).toLocaleString("pt-BR") : "0"} color="text-emerald-500" />
      </div>

      {/* Content */}
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
            {/* View Toggle */}
            <div className="flex items-center rounded-lg border border-border/50 overflow-hidden">
              <button
                onClick={() => setViewMode("tree")}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === "tree" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/50"}`}
              >
                <TreePine className="w-3.5 h-3.5" /> Árvore
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === "table" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/50"}`}
              >
                <Table2 className="w-3.5 h-3.5" /> Tabela
              </button>
            </div>

            {viewMode === "table" && (
              <div className="relative flex-1 sm:flex-initial">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <Input
                  placeholder="Buscar..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 h-9 rounded-xl bg-secondary/30 border-border/50 text-sm w-full sm:w-48"
                />
              </div>
            )}

            <Button onClick={handleSync} size="sm" variant="outline" disabled={syncing} className="gap-1.5 rounded-xl font-semibold h-9 px-4 text-xs border-green-500/20 text-green-600 hover:bg-green-500/10">
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {syncing ? "Sincronizando..." : "Sincronizar"}
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
        ) : viewMode === "tree" ? (
          <div className="p-3 sm:p-4">
            {tree.map(root => (
              <TreeNodeComponent key={root.member.id} node={root} depth={0} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/30 text-muted-foreground text-xs">
                  <th className="text-center px-2 py-2.5 font-medium w-12">Nível</th>
                  <th className="text-center px-2 py-2.5 font-medium w-16">ID</th>
                  <th className="text-left px-3 py-2.5 font-medium">Nome</th>
                  <th className="text-center px-2 py-2.5 font-medium hidden sm:table-cell">Cidade</th>
                  <th className="text-center px-2 py-2.5 font-medium">Cli.</th>
                  <th className="text-center px-2 py-2.5 font-medium hidden lg:table-cell">GP</th>
                  <th className="text-center px-2 py-2.5 font-medium hidden lg:table-cell">GI</th>
                  <th className="text-center px-2 py-2.5 font-medium hidden lg:table-cell">Diretos</th>
                  <th className="text-center px-2 py-2.5 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id} className="border-t border-border/30 hover:bg-secondary/20 transition-colors">
                    <td className="text-center px-2 py-2.5">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${m.nivel === 0 ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}>
                        {m.nivel}
                      </span>
                    </td>
                    <td className="text-center px-2 py-2.5 font-mono text-xs text-muted-foreground">{m.igreen_id}</td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{m.name}</td>
                    <td className="text-center px-2 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{m.cidade || "—"}{m.uf ? `/${m.uf}` : ""}</td>
                    <td className="text-center px-2 py-2.5"><span className="font-bold text-green-500">{m.clientes_ativos}</span></td>
                    <td className="text-center px-2 py-2.5 text-xs hidden lg:table-cell">{Number(m.gp).toLocaleString("pt-BR")}</td>
                    <td className="text-center px-2 py-2.5 text-xs hidden lg:table-cell">{Number(m.gi).toLocaleString("pt-BR")}</td>
                    <td className="text-center px-2 py-2.5 text-xs hidden lg:table-cell">{m.qtde_diretos}</td>
                    <td className="text-center px-2 py-2.5">
                      {m.phone && (
                        <button onClick={() => openWhatsApp(m.phone)} className="p-1 rounded-md hover:bg-green-500/20 transition-colors" title="WhatsApp">
                          <MessageCircle className="w-4 h-4 text-green-500" />
                        </button>
                      )}
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
