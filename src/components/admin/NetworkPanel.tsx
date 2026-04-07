import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Users, UserCheck, TrendingUp, CheckCircle2, RefreshCw, Loader2, Search, MessageCircle, Table2, Network, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
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

/* ── helpers ── */
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

const NIVEL_STYLES: Record<number, { bg: string; border: string; text: string; badge: string }> = {
  0: { bg: "from-primary/30 to-primary/10", border: "border-primary/40", text: "text-primary", badge: "bg-primary text-primary-foreground" },
  1: { bg: "from-blue-500/25 to-blue-500/10", border: "border-blue-500/40", text: "text-blue-400", badge: "bg-blue-500 text-white" },
  2: { bg: "from-emerald-500/25 to-emerald-500/10", border: "border-emerald-500/40", text: "text-emerald-400", badge: "bg-emerald-500 text-white" },
  3: { bg: "from-amber-500/25 to-amber-500/10", border: "border-amber-500/40", text: "text-amber-400", badge: "bg-amber-500 text-white" },
  4: { bg: "from-purple-500/25 to-purple-500/10", border: "border-purple-500/40", text: "text-purple-400", badge: "bg-purple-500 text-white" },
  5: { bg: "from-rose-500/25 to-rose-500/10", border: "border-rose-500/40", text: "text-rose-400", badge: "bg-rose-500 text-white" },
};

function getStyle(nivel: number) {
  return NIVEL_STYLES[nivel] || NIVEL_STYLES[5];
}

/* ── MLM Card ── */
function MemberCard({ member, collapsed, onToggle, childCount }: {
  member: NetworkMember;
  collapsed: boolean;
  onToggle: () => void;
  childCount: number;
}) {
  const s = getStyle(member.nivel);
  const phone = formatPhone(member.phone);
  const firstName = member.name.split(" ")[0];
  const lastName = member.name.split(" ").slice(1).join(" ");

  return (
    <div
      className={`relative rounded-xl border ${s.border} bg-gradient-to-b ${s.bg} backdrop-blur-sm
        w-[140px] sm:w-[160px] p-2.5 sm:p-3 cursor-pointer select-none transition-all duration-200
        hover:scale-105 hover:shadow-lg hover:shadow-primary/10 group`}
      onClick={onToggle}
    >
      {/* Level badge */}
      <div className={`absolute -top-2 -right-2 w-5 h-5 rounded-full ${s.badge} text-[9px] font-bold flex items-center justify-center shadow-sm`}>
        N{member.nivel}
      </div>

      {/* Name */}
      <div className="text-center mb-1.5">
        <p className="font-bold text-xs text-foreground leading-tight truncate">{firstName}</p>
        <p className="text-[10px] text-muted-foreground leading-tight truncate">{lastName}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-center">
        <div>
          <span className="text-[9px] text-muted-foreground/70 block">GP</span>
          <span className="text-[11px] font-bold text-foreground">{Number(member.gp).toLocaleString("pt-BR")}</span>
        </div>
        <div>
          <span className="text-[9px] text-muted-foreground/70 block">GI</span>
          <span className="text-[11px] font-bold text-foreground">{Number(member.gi).toLocaleString("pt-BR")}</span>
        </div>
        <div>
          <span className="text-[9px] text-muted-foreground/70 block">Clientes</span>
          <span className="text-[11px] font-bold text-green-400">{member.clientes_ativos}</span>
        </div>
        <div>
          <span className="text-[9px] text-muted-foreground/70 block">Diretos</span>
          <span className="text-[11px] font-bold text-foreground">{member.qtde_diretos}</span>
        </div>
      </div>

      {/* Location */}
      {member.cidade && (
        <p className="text-[9px] text-muted-foreground text-center mt-1 truncate">
          📍 {member.cidade}{member.uf ? `/${member.uf}` : ""}
        </p>
      )}

      {/* WhatsApp button */}
      {member.phone && (
        <button
          onClick={e => { e.stopPropagation(); openWhatsApp(member.phone); }}
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-green-500 text-white
            flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-all
            hover:bg-green-600 hover:scale-110"
          title="Enviar WhatsApp"
        >
          <MessageCircle className="w-3 h-3" />
        </button>
      )}

      {/* Expand/collapse indicator */}
      {childCount > 0 && (
        <div className={`absolute -bottom-2 right-2 w-5 h-5 rounded-full bg-card border border-border
          text-[9px] font-bold flex items-center justify-center shadow-sm ${collapsed ? "text-muted-foreground" : s.text}`}>
          {collapsed ? `+${childCount}` : "−"}
        </div>
      )}
    </div>
  );
}

/* ── MLM Tree Node (recursive, org-chart style) ── */
function OrgChartNode({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth >= 3);
  const hasChildren = node.children.length > 0;

  return (
    <div className="flex flex-col items-center">
      {/* Card */}
      <MemberCard
        member={node.member}
        collapsed={collapsed}
        onToggle={() => hasChildren && setCollapsed(!collapsed)}
        childCount={node.children.length}
      />

      {/* Connector line down from card */}
      {hasChildren && !collapsed && (
        <>
          <div className="w-px h-5 bg-border/60" />

          {/* Horizontal connector bar */}
          {node.children.length > 1 && (
            <div className="relative flex items-start">
              <div
                className="absolute top-0 bg-border/60"
                style={{
                  height: "1px",
                  left: "50%",
                  right: "50%",
                }}
              />
            </div>
          )}

          {/* Children row */}
          <div className="flex items-start gap-2 sm:gap-3 relative">
            {/* Horizontal line connecting children */}
            {node.children.length > 1 && (
              <div className="absolute top-0 left-[calc(50%_/_var(--child-count))] right-[calc(50%_/_var(--child-count))] h-px bg-border/60"
                style={{
                  "--child-count": node.children.length,
                  left: `calc(100% / ${node.children.length * 2})`,
                  right: `calc(100% / ${node.children.length * 2})`,
                } as any}
              />
            )}

            {node.children.map(child => (
              <div key={child.member.id} className="flex flex-col items-center">
                {/* Vertical connector from horizontal bar */}
                <div className="w-px h-5 bg-border/60" />
                <OrgChartNode node={child} depth={depth + 1} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Main Panel ── */
export function NetworkPanel({ consultantId }: NetworkPanelProps) {
  const [members, setMembers] = useState<NetworkMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"tree" | "table">("tree");
  const [zoom, setZoom] = useState(0.85);
  const scrollRef = useRef<HTMLDivElement>(null);
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

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.15, 1.5));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.15, 0.3));
  const handleZoomReset = () => setZoom(0.85);

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
        {/* Header */}
        <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/15">
              <Network className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-base">Mapa de Rede MMN</h3>
              <p className="text-xs text-muted-foreground">{members.length} licenciados na sua rede</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View Toggle */}
            <div className="flex items-center rounded-lg border border-border/50 overflow-hidden">
              <button
                onClick={() => setViewMode("tree")}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === "tree" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/50"}`}
              >
                <Network className="w-3.5 h-3.5" /> Rede
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === "table" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/50"}`}
              >
                <Table2 className="w-3.5 h-3.5" /> Tabela
              </button>
            </div>

            {viewMode === "tree" && (
              <div className="flex items-center rounded-lg border border-border/50 overflow-hidden">
                <button onClick={handleZoomOut} className="px-2 py-1.5 text-muted-foreground hover:bg-secondary/50 transition-colors">
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleZoomReset} className="px-2 py-1.5 text-[10px] text-muted-foreground hover:bg-secondary/50 transition-colors font-mono">
                  {Math.round(zoom * 100)}%
                </button>
                <button onClick={handleZoomIn} className="px-2 py-1.5 text-muted-foreground hover:bg-secondary/50 transition-colors">
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {viewMode === "table" && (
              <div className="relative">
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

        {/* Body */}
        {members.length === 0 ? (
          <div className="text-center py-12">
            <Network className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">Nenhum licenciado encontrado.</p>
            <Button onClick={handleSync} size="sm" disabled={syncing} className="gap-1.5 rounded-xl">
              <RefreshCw className="w-3.5 h-3.5" /> Sincronizar agora
            </Button>
          </div>
        ) : viewMode === "tree" ? (
          <div
            ref={scrollRef}
            className="overflow-auto bg-gradient-to-b from-secondary/20 to-secondary/5"
            style={{ maxHeight: "70vh" }}
          >
            <div
              className="flex justify-center py-8 px-6 min-w-max"
              style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
            >
              <div className="flex flex-col items-center gap-0">
                {tree.map(root => (
                  <OrgChartNode key={root.member.id} node={root} depth={0} />
                ))}
              </div>
            </div>
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
