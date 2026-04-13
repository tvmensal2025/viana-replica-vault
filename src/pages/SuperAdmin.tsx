import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Shield, Users, CheckCircle, XCircle, LogOut, Loader2, UserCheck, UserX,
  KeyRound, Brain, MessageSquare, Wifi, WifiOff, AlertTriangle, Send,
  Search, Eye, TrendingUp, Phone, Calendar, RefreshCw,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AIKnowledgePanel } from "@/components/superadmin/AIKnowledgePanel";
import { CrmAnalyticsTab } from "@/components/superadmin/CrmAnalyticsTab";

interface WhatsAppMetrics {
  hasInstance: boolean;
  instanceName: string | null;
  totalMsgsSent: number;
  totalMsgsReceived: number;
  scheduledSent: number;
  scheduledFailed: number;
}

interface ConsultantRow {
  id: string;
  name: string;
  license: string;
  phone: string;
  created_at: string | null;
  approved: boolean;
  total_customers?: number;
  customers_7d?: number;
  total_deals?: number;
  views_7d?: number;
  last_activity?: string | null;
  wa?: WhatsAppMetrics;
}

const SuperAdmin = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [consultants, setConsultants] = useState<ConsultantRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"consultores" | "ia" | "crm">("consultores");
  const [searchTerm, setSearchTerm] = useState("");
  const accessDeniedToastShownRef = useRef(false);
  const { isAdmin, loading: roleLoading } = useUserRole(userId);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) { setUserId(null); setAuthLoading(false); navigate("/auth", { replace: true }); return; }
      setUserId(session.user.id);
      setAuthLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setUserId(null); setAuthLoading(false); navigate("/auth", { replace: true }); return; }
      setUserId(session.user.id);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (authLoading || roleLoading || !userId) return;
    if (!isAdmin) {
      if (!accessDeniedToastShownRef.current) {
        accessDeniedToastShownRef.current = true;
        toast({ title: "Acesso negado", description: "Você não tem permissão de administrador.", variant: "destructive" });
      }
      navigate("/admin", { replace: true });
      return;
    }
    accessDeniedToastShownRef.current = false;
    loadConsultants();
  }, [authLoading, isAdmin, roleLoading, userId, navigate, toast]);

  const loadConsultants = async () => {
    setLoadingData(true);
    const { data, error } = await supabase
      .from("consultants")
      .select("id, name, license, phone, created_at, approved")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar consultores", description: error.message, variant: "destructive" });
      setLoadingData(false);
      return;
    }

    const rows: ConsultantRow[] = (data as any[])?.map(c => ({ ...c, approved: c.approved ?? false })) || [];

    const [waInstancesRes, scheduledRes] = await Promise.all([
      supabase.from("whatsapp_instances").select("consultant_id, instance_name"),
      supabase.from("scheduled_messages").select("consultant_id, status"),
    ]);

    const waMap = new Map<string, string>();
    (waInstancesRes.data || []).forEach((w: any) => waMap.set(w.consultant_id, w.instance_name));

    const schedMap = new Map<string, { sent: number; failed: number }>();
    (scheduledRes.data || []).forEach((s: any) => {
      const entry = schedMap.get(s.consultant_id) || { sent: 0, failed: 0 };
      if (s.status === "sent") entry.sent++;
      else if (s.status === "failed") entry.failed++;
      schedMap.set(s.consultant_id, entry);
    });

    const enriched = await Promise.all(rows.map(async (c) => {
      const [custRes, cust7dRes, dealsRes, viewsRes, lastCustRes, lastViewRes, convRes] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("consultant_id", c.id),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("consultant_id", c.id).gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
        supabase.from("crm_deals").select("id", { count: "exact", head: true }).eq("consultant_id", c.id),
        supabase.from("page_views").select("id", { count: "exact", head: true }).eq("consultant_id", c.id).gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
        supabase.from("customers").select("created_at").eq("consultant_id", c.id).order("created_at", { ascending: false }).limit(1),
        supabase.from("page_views").select("created_at").eq("consultant_id", c.id).order("created_at", { ascending: false }).limit(1),
        supabase.from("conversations").select("message_direction", { count: "exact" })
          .in("customer_id", (await supabase.from("customers").select("id").eq("consultant_id", c.id)).data?.map((cu: any) => cu.id) || []),
      ]);

      const lastCust = (lastCustRes.data as any)?.[0]?.created_at;
      const lastView = (lastViewRes.data as any)?.[0]?.created_at;
      const dates = [lastCust, lastView].filter(Boolean).sort().reverse();
      const convData = (convRes.data || []) as any[];
      const outbound = convData.filter((m: any) => m.message_direction === "outbound").length;
      const inbound = convData.filter((m: any) => m.message_direction === "inbound").length;
      const sched = schedMap.get(c.id) || { sent: 0, failed: 0 };

      return {
        ...c,
        total_customers: custRes.count || 0,
        customers_7d: cust7dRes.count || 0,
        total_deals: dealsRes.count || 0,
        views_7d: viewsRes.count || 0,
        last_activity: dates[0] || null,
        wa: {
          hasInstance: waMap.has(c.id),
          instanceName: waMap.get(c.id) || null,
          totalMsgsSent: outbound + sched.sent,
          totalMsgsReceived: inbound,
          scheduledSent: sched.sent,
          scheduledFailed: sched.failed,
        },
      };
    }));

    setConsultants(enriched);
    setLoadingData(false);
  };

  const toggleApproval = async (consultantId: string, currentApproved: boolean) => {
    setTogglingId(consultantId);
    const { error } = await supabase.from("consultants").update({ approved: !currentApproved } as any).eq("id", consultantId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setConsultants(prev => prev.map(c => c.id === consultantId ? { ...c, approved: !currentApproved } : c));
      toast({ title: !currentApproved ? "✅ Consultor aprovado!" : "❌ Acesso revogado" });
    }
    setTogglingId(null);
  };

  const handleResetPassword = async (consultantId: string, consultantName: string) => {
    setResettingId(consultantId);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-password", {
        body: { consultant_id: consultantId, redirect_url: `${window.location.origin}/auth` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "✅ Email de redefinição enviado!", description: `Link enviado para ${data?.email || consultantName}` });
    } catch (err: any) {
      toast({ title: "Erro ao resetar senha", description: err.message || "Erro desconhecido", variant: "destructive" });
    }
    setResettingId(null);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (authLoading || roleLoading || (!isAdmin && userId)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Verificando permissões...</p>
      </div>
    );
  }

  const approvedCount = consultants.filter(c => c.approved).length;
  const pendingCount = consultants.filter(c => !c.approved).length;
  const totalCustomers = consultants.reduce((s, c) => s + (c.total_customers || 0), 0);
  const totalDeals = consultants.reduce((s, c) => s + (c.total_deals || 0), 0);
  const connectedWA = consultants.filter(c => c.wa?.hasInstance).length;

  const filtered = consultants.filter(c => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.license.toLowerCase().includes(q) || c.phone.includes(q);
  });

  const tabs = [
    { id: "consultores" as const, label: "Consultores", icon: Users },
    { id: "crm" as const, label: "CRM Analytics", icon: TrendingUp },
    { id: "ia" as const, label: "IA / Conhecimento", icon: Brain },
  ];

  const formatActivity = (lastAct: string | null) => {
    if (!lastAct) return { text: "Sem atividade", color: "text-muted-foreground", dot: "bg-muted-foreground" };
    const d = new Date(lastAct);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days === 0) return { text: "Hoje", color: "text-green-400", dot: "bg-green-400" };
    if (days === 1) return { text: "Ontem", color: "text-green-400", dot: "bg-green-400" };
    if (days <= 7) return { text: `${days}d atrás`, color: "text-yellow-400", dot: "bg-yellow-400" };
    return { text: `${days}d atrás`, color: "text-red-400", dot: "bg-red-400" };
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold font-heading text-foreground leading-tight">Super Admin</h1>
              <p className="text-xs text-muted-foreground">Gerenciamento da plataforma</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={loadConsultants} disabled={loadingData} className="gap-1.5 text-muted-foreground hover:text-foreground">
              <RefreshCw className={`w-4 h-4 ${loadingData ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground gap-2">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="border-b border-border bg-card/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                    isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}>
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {activeTab === "consultores" && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: "Consultores", value: consultants.length, icon: Users, color: "text-primary" },
                { label: "Aprovados", value: approvedCount, icon: CheckCircle, color: "text-green-400" },
                { label: "Pendentes", value: pendingCount, icon: XCircle, color: "text-orange-400" },
                { label: "Clientes Total", value: totalCustomers, icon: TrendingUp, color: "text-blue-400" },
                { label: "WhatsApp Ativo", value: connectedWA, icon: Phone, color: "text-emerald-400" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Search */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, licença ou telefone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-card border-border"
                />
              </div>
              <span className="text-xs text-muted-foreground">{filtered.length} consultor(es)</span>
            </div>

            {/* Consultant Cards */}
            {loadingData ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">Nenhum consultor encontrado</div>
            ) : (
              <TooltipProvider>
                <div className="grid gap-3">
                  {filtered.map((c) => {
                    const activity = formatActivity(c.last_activity || null);
                    const wa = c.wa;
                    const totalMsgs = (wa?.totalMsgsSent || 0) + (wa?.totalMsgsReceived || 0);

                    return (
                      <div key={c.id} className="rounded-xl border border-border bg-card hover:border-primary/30 transition-colors">
                        <div className="p-4">
                          {/* Top row: name + status + actions */}
                          <div className="flex items-start justify-between gap-4 mb-4">
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Avatar placeholder */}
                              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-sm font-bold text-primary">
                                  {c.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold text-foreground truncate">{c.name}</h3>
                                  <Badge
                                    variant={c.approved ? "default" : "secondary"}
                                    className={`text-[10px] px-1.5 py-0 shrink-0 ${
                                      c.approved
                                        ? "bg-green-500/15 text-green-400 border-green-500/25"
                                        : "bg-orange-500/15 text-orange-400 border-orange-500/25"
                                    }`}
                                  >
                                    {c.approved ? "Aprovado" : "Pendente"}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground truncate">{c.license}</p>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost" size="sm"
                                    onClick={() => handleResetPassword(c.id, c.name)}
                                    disabled={resettingId === c.id}
                                    className="h-8 w-8 p-0"
                                  >
                                    {resettingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Resetar Senha</TooltipContent>
                              </Tooltip>
                              <Button
                                variant={c.approved ? "ghost" : "default"}
                                size="sm"
                                onClick={() => toggleApproval(c.id, c.approved)}
                                disabled={togglingId === c.id}
                                className="h-8 gap-1 text-xs"
                              >
                                {togglingId === c.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : c.approved ? (
                                  <UserX className="w-3.5 h-3.5" />
                                ) : (
                                  <UserCheck className="w-3.5 h-3.5" />
                                )}
                                {c.approved ? "Revogar" : "Aprovar"}
                              </Button>
                            </div>
                          </div>

                          {/* Metrics row */}
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            {/* Clientes */}
                            <div className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-3 py-2">
                              <Users className="w-4 h-4 text-blue-400 shrink-0" />
                              <div>
                                <p className="text-sm font-semibold text-foreground leading-none">{c.total_customers || 0}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  Clientes
                                  {(c.customers_7d || 0) > 0 && (
                                    <span className="text-green-400 ml-1">+{c.customers_7d}</span>
                                  )}
                                </p>
                              </div>
                            </div>

                            {/* Deals */}
                            <div className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-3 py-2">
                              <TrendingUp className="w-4 h-4 text-purple-400 shrink-0" />
                              <div>
                                <p className="text-sm font-semibold text-foreground leading-none">{c.total_deals || 0}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Deals CRM</p>
                              </div>
                            </div>

                            {/* Views 7d */}
                            <div className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-3 py-2">
                              <Eye className="w-4 h-4 text-amber-400 shrink-0" />
                              <div>
                                <p className="text-sm font-semibold text-foreground leading-none">{c.views_7d || 0}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Views 7d</p>
                              </div>
                            </div>

                            {/* WhatsApp */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-3 py-2 cursor-default">
                                  {wa?.hasInstance ? (
                                    <Wifi className="w-4 h-4 text-green-400 shrink-0" />
                                  ) : (
                                    <WifiOff className="w-4 h-4 text-muted-foreground shrink-0" />
                                  )}
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm font-semibold text-foreground leading-none">{totalMsgs}</span>
                                      {(wa?.scheduledFailed || 0) > 0 && (
                                        <AlertTriangle className="w-3 h-3 text-red-400" />
                                      )}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                      {wa?.hasInstance ? "WhatsApp" : "Sem conexão"}
                                    </p>
                                  </div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs space-y-1">
                                <p className="font-semibold">{wa?.hasInstance ? "✅ Conectado" : "❌ Desconectado"}</p>
                                {wa?.instanceName && <p className="text-muted-foreground">{wa.instanceName}</p>}
                                <div className="flex items-center gap-3">
                                  <span className="flex items-center gap-1 text-green-400"><Send className="w-3 h-3" /> {wa?.totalMsgsSent || 0} enviadas</span>
                                  <span className="flex items-center gap-1 text-blue-400"><MessageSquare className="w-3 h-3" /> {wa?.totalMsgsReceived || 0} recebidas</span>
                                </div>
                                {(wa?.scheduledFailed || 0) > 0 && (
                                  <p className="text-red-400">⚠️ {wa?.scheduledFailed} falha(s) de agendamento</p>
                                )}
                              </TooltipContent>
                            </Tooltip>

                            {/* Última Atividade */}
                            <div className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-3 py-2">
                              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-1.5 h-1.5 rounded-full ${activity.dot}`} />
                                  <p className={`text-sm font-semibold leading-none ${activity.color}`}>{activity.text}</p>
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Atividade</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TooltipProvider>
            )}
          </>
        )}

        {activeTab === "crm" && <CrmAnalyticsTab />}
        {activeTab === "ia" && <AIKnowledgePanel />}
      </main>
    </div>
  );
};

export default SuperAdmin;
// cache-bust
