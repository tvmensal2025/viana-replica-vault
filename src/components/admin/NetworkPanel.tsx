import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Users, UserCheck, TrendingUp, CheckCircle2, RefreshCw, Loader2, Search, MessageCircle, Table2, Network, ZoomIn, ZoomOut, ChevronDown, ChevronRight } from "lucide-react";
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
  graduacao: string | null;
  graduacao_expansao: string | null;
  data_nascimento: string | null;
  gp_total: number;
  gi_total: number;
  bonificavel: number;
  green_points: number;
  gp_mes: number;
  gi_mes: number;
  green_points_mes: number;
  diretos_ativos: number;
  pro: string | null;
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

function openWhatsApp(phone: string | null) {
  if (!phone) return;
  const clean = phone.replace(/\D/g, "");
  const num = clean.startsWith("55") ? clean : `55${clean}`;
  window.open(`https://wa.me/${num}`, "_blank");
}

function formatPhone(phone: string | null) {
  if (!phone || phone.length < 10) return null;
  const clean = phone.replace(/^55/, "");
  if (clean.length === 11) return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  if (clean.length === 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  return phone;
}

const NIVEL_COLORS = [
  { dot: "bg-primary", ring: "ring-primary/30", text: "text-primary" },
  { dot: "bg-blue-500", ring: "ring-blue-500/30", text: "text-blue-400" },
  { dot: "bg-emerald-500", ring: "ring-emerald-500/30", text: "text-emerald-400" },
  { dot: "bg-amber-500", ring: "ring-amber-500/30", text: "text-amber-400" },
  { dot: "bg-purple-500", ring: "ring-purple-500/30", text: "text-purple-400" },
  { dot: "bg-rose-500", ring: "ring-rose-500/30", text: "text-rose-400" },
];

function getColor(nivel: number) {
  return NIVEL_COLORS[Math.min(nivel, NIVEL_COLORS.length - 1)];
}

/* ── Compact Mini Card (default) ── */
function MiniCard({ member, hasChildren, childCount, isExpanded, onToggle, onOpenDetails }: {
  member: NetworkMember;
  hasChildren: boolean;
  childCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenDetails: () => void;
}) {
  const c = getColor(member.nivel);
  const initials = member.name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative rounded-lg border border-border/60 bg-card hover:bg-secondary/30 transition-all
          w-[90px] p-1.5 cursor-pointer select-none group hover:shadow-md hover:shadow-black/10"
        onClick={onOpenDetails}
      >
        {/* Avatar */}
        <div className="flex justify-center mb-1">
          <div className={`w-8 h-8 rounded-full ${c.dot} ring-2 ${c.ring} flex items-center justify-center`}>
            <span className="text-[10px] font-bold text-white">{initials}</span>
          </div>
        </div>
        {/* Name */}
        <p className="text-[10px] font-semibold text-foreground text-center leading-tight truncate sensitive-name">{member.name.split(" ")[0]}</p>
        <p className="text-[8px] text-muted-foreground text-center">{member.clientes_ativos} cli</p>

        {/* WhatsApp on hover */}
        {member.phone && (
          <button
            onClick={e => { e.stopPropagation(); openWhatsApp(member.phone); }}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-green-500 text-white
              flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity
              hover:bg-green-600 z-10"
            title="WhatsApp"
          >
            <MessageCircle className="w-2.5 h-2.5" />
          </button>
        )}
      </div>

      {/* Expand children toggle */}
      {hasChildren && (
        <button
          onClick={onToggle}
          className={`mt-1 w-5 h-5 rounded-full border border-border bg-card flex items-center justify-center
            text-[9px] font-bold transition-colors hover:bg-secondary ${isExpanded ? "text-primary" : "text-muted-foreground"}`}
        >
          {isExpanded ? "−" : childCount}
        </button>
      )}
    </div>
  );
}

/* ── Detail Panel (opens on click) ── */
function DetailPanel({ member, onClose }: { member: NetworkMember; onClose: () => void }) {
  const c = getColor(member.nivel);
  const phone = formatPhone(member.phone);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-[380px] max-w-[90vw] max-h-[85vh] overflow-y-auto p-5 animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 rounded-full ${c.dot} ring-2 ${c.ring} flex items-center justify-center shrink-0`}>
            <span className="text-sm font-bold text-white">
              {member.name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-bold text-foreground text-sm leading-tight sensitive-name">{member.name}</p>
            <p className="text-xs text-muted-foreground">ID: {member.igreen_id} • Nível {member.nivel}</p>
            {member.graduacao && <p className="text-xs text-primary font-medium">{member.graduacao}</p>}
          </div>
        </div>

        {/* Graduação */}
        {(member.graduacao || member.graduacao_expansao) && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {member.graduacao && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">{member.graduacao}</span>}
            {member.graduacao_expansao && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">{member.graduacao_expansao}</span>}
            {member.pro && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium">PRO</span>}
          </div>
        )}

        {/* Stats - Totais */}
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 font-semibold">Acumulado</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <StatBox label="GP Total" value={Number(member.gp_total).toLocaleString("pt-BR")} />
          <StatBox label="GI Total" value={Number(member.gi_total).toLocaleString("pt-BR")} />
          <StatBox label="Bonificável" value={Number(member.bonificavel).toLocaleString("pt-BR")} />
        </div>

        {/* Stats - Mês */}
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 font-semibold">Mês Atual</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <StatBox label="GP" value={Number(member.gp_mes || member.gp).toLocaleString("pt-BR")} />
          <StatBox label="GI" value={Number(member.gi_mes || member.gi).toLocaleString("pt-BR")} />
          <StatBox label="Green Points" value={Number(member.green_points_mes).toLocaleString("pt-BR")} />
        </div>

        {/* Stats - Rede */}
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 font-semibold">Rede</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <StatBox label="Clientes Ativos" value={String(member.clientes_ativos)} highlight />
          <StatBox label="Diretos" value={String(member.qtde_diretos)} />
          <StatBox label="Diretos Ativos" value={String(member.diretos_ativos)} />
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <StatBox label="Green Points Total" value={Number(member.green_points).toLocaleString("pt-BR")} />
          <StatBox label="Patrocinador" value={member.sponsor_id ? String(member.sponsor_id) : "—"} />
        </div>

        {/* Location & Dates */}
        <div className="space-y-1 mb-3">
          {member.cidade && (
            <p className="text-xs text-muted-foreground">📍 {member.cidade}{member.uf ? `/${member.uf}` : ""}</p>
          )}
          {member.data_nascimento && (
            <p className="text-xs text-muted-foreground">🎂 {member.data_nascimento}</p>
          )}
          {member.data_ativo && (
            <p className="text-xs text-muted-foreground">📅 Ativo desde: {member.data_ativo}</p>
          )}
        </div>

        {/* Phone + WhatsApp */}
        <div className="flex items-center gap-2">
          {phone && <span className="text-xs text-muted-foreground flex-1">{phone}</span>}
          {member.phone && (
            <Button
              size="sm"
              className="gap-1.5 rounded-xl bg-green-500 hover:bg-green-600 text-white h-8 px-3 text-xs"
              onClick={() => openWhatsApp(member.phone)}
            >
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </Button>
          )}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-secondary/40 p-2 text-center">
      <span className="text-[10px] text-muted-foreground block">{label}</span>
      <span className={`text-sm font-bold ${highlight ? "text-green-500" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

/* ── Org Chart Node ── */
function OrgChartNode({ node, depth = 0, onSelect }: { node: TreeNode; depth?: number; onSelect: (m: NetworkMember) => void }) {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = node.children.length > 0;

  return (
    <div className="flex flex-col items-center">
      <MiniCard
        member={node.member}
        hasChildren={hasChildren}
        childCount={node.children.length}
        isExpanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        onOpenDetails={() => onSelect(node.member)}
      />

      {hasChildren && expanded && (
        <>
          {/* Vertical line down */}
          <div className="w-px h-4 bg-border/50" />

          {/* Children */}
          <div className="flex items-start gap-1.5 relative">
            {/* Horizontal connector */}
            {node.children.length > 1 && (
              <div
                className="absolute top-0 h-px bg-border/50"
                style={{
                  left: `calc(100% / ${node.children.length * 2})`,
                  right: `calc(100% / ${node.children.length * 2})`,
                }}
              />
            )}
            {node.children.map(child => (
              <div key={child.member.id} className="flex flex-col items-center">
                <div className="w-px h-4 bg-border/50" />
                <OrgChartNode node={child} depth={depth + 1} onSelect={onSelect} />
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
  const [zoom, setZoom] = useState(0.9);
  const [selectedMember, setSelectedMember] = useState<NetworkMember | null>(null);
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
    } catch { /* silently handle */ } finally { setLoading(false); }
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
    } finally { setSyncing(false); }
  };

  const rootMember = useMemo(() => members.find(m => m.nivel === 0), [members]);
  const totalClientes = useMemo(() => members.reduce((sum, m) => sum + m.clientes_ativos, 0), [members]);
  const networkCount = useMemo(() => members.filter(m => m.nivel > 0).length, [members]);
  const tree = useMemo(() => buildTree(members), [members]);

  const filtered = useMemo(() => {
    if (!search.trim()) return members;
    const q = search.toLowerCase();
    return members.filter(m =>
      m.name.toLowerCase().includes(q) || String(m.igreen_id).includes(q) ||
      (m.cidade || "").toLowerCase().includes(q) || (m.phone || "").includes(q)
    );
  }, [members, search]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Detail Modal */}
      {selectedMember && <DetailPanel member={selectedMember} onClose={() => setSelectedMember(null)} />}

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
              <Network className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-base">Mapa de Rede</h3>
              <p className="text-xs text-muted-foreground">{members.length} licenciados • clique para ver detalhes</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded-lg border border-border/50 overflow-hidden">
              <button onClick={() => setViewMode("tree")}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === "tree" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/50"}`}>
                <Network className="w-3.5 h-3.5" /> Rede
              </button>
              <button onClick={() => setViewMode("table")}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === "table" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/50"}`}>
                <Table2 className="w-3.5 h-3.5" /> Tabela
              </button>
            </div>

            {viewMode === "tree" && (
              <div className="flex items-center rounded-lg border border-border/50 overflow-hidden">
                <button onClick={() => setZoom(z => Math.max(z - 0.15, 0.3))} className="px-2 py-1.5 text-muted-foreground hover:bg-secondary/50">
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setZoom(0.9)} className="px-2 py-1.5 text-[10px] text-muted-foreground hover:bg-secondary/50 font-mono">
                  {Math.round(zoom * 100)}%
                </button>
                <button onClick={() => setZoom(z => Math.min(z + 0.15, 1.5))} className="px-2 py-1.5 text-muted-foreground hover:bg-secondary/50">
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {viewMode === "table" && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
                  className="pl-9 h-9 rounded-xl bg-secondary/30 border-border/50 text-sm w-full sm:w-48" />
              </div>
            )}

            <Button onClick={handleSync} size="sm" variant="outline" disabled={syncing}
              className="gap-1.5 rounded-xl font-semibold h-9 px-4 text-xs border-green-500/20 text-green-600 hover:bg-green-500/10">
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {syncing ? "Sincronizando..." : "Sincronizar"}
            </Button>
          </div>
        </div>

        {members.length === 0 ? (
          <div className="text-center py-12">
            <Network className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">Nenhum licenciado encontrado.</p>
            <Button onClick={handleSync} size="sm" disabled={syncing} className="gap-1.5 rounded-xl">
              <RefreshCw className="w-3.5 h-3.5" /> Sincronizar agora
            </Button>
          </div>
        ) : viewMode === "tree" ? (
          <div className="overflow-auto bg-gradient-to-b from-secondary/10 to-transparent" style={{ maxHeight: "70vh" }}>
            <div className="flex justify-center py-8 px-6 min-w-max"
              style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>
              {tree.map(root => (
                <OrgChartNode key={root.member.id} node={root} depth={0} onSelect={setSelectedMember} />
              ))}
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
                  <th className="text-center px-2 py-2.5 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id} className="border-t border-border/30 hover:bg-secondary/20 transition-colors cursor-pointer"
                    onClick={() => setSelectedMember(m)}>
                    <td className="text-center px-2 py-2.5">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${m.nivel === 0 ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}>{m.nivel}</span>
                    </td>
                    <td className="text-center px-2 py-2.5 font-mono text-xs text-muted-foreground">{m.igreen_id}</td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{m.name}</td>
                    <td className="text-center px-2 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{m.cidade || "—"}</td>
                    <td className="text-center px-2 py-2.5"><span className="font-bold text-green-500">{m.clientes_ativos}</span></td>
                    <td className="text-center px-2 py-2.5 text-xs hidden lg:table-cell">{Number(m.gp).toLocaleString("pt-BR")}</td>
                    <td className="text-center px-2 py-2.5 text-xs hidden lg:table-cell">{Number(m.gi).toLocaleString("pt-BR")}</td>
                    <td className="text-center px-2 py-2.5">
                      {m.phone && (
                        <button onClick={e => { e.stopPropagation(); openWhatsApp(m.phone); }} className="p-1 rounded-md hover:bg-green-500/20" title="WhatsApp">
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
