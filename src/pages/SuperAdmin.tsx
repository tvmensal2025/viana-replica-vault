import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Shield, Users, CheckCircle, XCircle, LogOut, Loader2, UserCheck, UserX, BarChart3, KeyRound, Brain,
  MessageSquare, Wifi, WifiOff, AlertTriangle, Send,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AIKnowledgePanel } from "@/components/superadmin/AIKnowledgePanel";

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
  const [activeTab, setActiveTab] = useState<"consultores" | "ia">("consultores");
  const accessDeniedToastShownRef = useRef(false);
  const { isAdmin, loading: roleLoading } = useUserRole(userId);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) {
        setUserId(null);
        setAuthLoading(false);
        navigate("/auth", { replace: true });
        return;
      }
      setUserId(session.user.id);
      setAuthLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setUserId(null);
        setAuthLoading(false);
        navigate("/auth", { replace: true });
        return;
      }
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

    // Pre-fetch WhatsApp instances and scheduled messages for all consultants
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

    // Load activity metrics in parallel
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
    const { error } = await supabase
      .from("consultants")
      .update({ approved: !currentApproved } as any)
      .eq("id", consultantId);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setConsultants(prev =>
        prev.map(c => c.id === consultantId ? { ...c, approved: !currentApproved } : c)
      );
      toast({ title: !currentApproved ? "✅ Consultor aprovado!" : "❌ Acesso revogado" });
    }
    setTogglingId(null);
  };

  const handleResetPassword = async (consultantId: string, consultantName: string) => {
    setResettingId(consultantId);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-password", {
        body: {
          consultant_id: consultantId,
          redirect_url: `${window.location.origin}/auth`,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "✅ Email de redefinição enviado!",
        description: `Link enviado para ${data?.email || consultantName}`,
      });
    } catch (err: any) {
      toast({
        title: "Erro ao resetar senha",
        description: err.message || "Erro desconhecido",
        variant: "destructive",
      });
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

  const tabs = [
    { id: "consultores" as const, label: "Consultores", icon: Users },
    { id: "ia" as const, label: "IA / Conhecimento", icon: Brain },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-base font-bold font-heading text-foreground leading-tight">Super Admin</h1>
              <p className="text-xs text-muted-foreground">Gerenciamento da plataforma</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground gap-2">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="border-b border-border bg-card/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
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

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {activeTab === "consultores" && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                <Users className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{consultants.length}</p>
                  <p className="text-xs text-muted-foreground">Total Consultores</p>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                <CheckCircle className="w-8 h-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{approvedCount}</p>
                  <p className="text-xs text-muted-foreground">Aprovados</p>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                <XCircle className="w-8 h-8 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{pendingCount}</p>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                </div>
              </div>
            </div>

            {/* Consultants Table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="font-heading font-bold text-foreground flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Consultores Cadastrados
                </h2>
              </div>

              {loadingData ? (
                <div className="p-8 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <TooltipProvider>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Licença</TableHead>
                      <TableHead className="text-center">Clientes</TableHead>
                      <TableHead className="text-center">Deals</TableHead>
                      <TableHead className="text-center">Views 7d</TableHead>
                      <TableHead className="text-center">WhatsApp</TableHead>
                      <TableHead>Última Atividade</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consultants.map((c) => {
                      const lastAct = c.last_activity ? new Date(c.last_activity) : null;
                      const daysSince = lastAct ? Math.floor((Date.now() - lastAct.getTime()) / 86400000) : null;
                      const activityColor = daysSince === null ? "text-muted-foreground" : daysSince <= 1 ? "text-green-500" : daysSince <= 7 ? "text-yellow-500" : "text-red-400";
                      const wa = c.wa;

                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{c.license}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-col items-center">
                              <span className="text-sm font-semibold text-foreground">{c.total_customers || 0}</span>
                              {(c.customers_7d || 0) > 0 && (
                                <span className="text-[10px] text-green-500">+{c.customers_7d} 7d</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-sm text-foreground">{c.total_deals || 0}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-sm text-foreground">{c.views_7d || 0}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex flex-col items-center gap-1 cursor-default">
                                  {wa?.hasInstance ? (
                                    <Wifi className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <WifiOff className="w-4 h-4 text-muted-foreground" />
                                  )}
                                  <div className="flex items-center gap-1.5 text-[11px]">
                                    <span className="flex items-center gap-0.5 text-green-500">
                                      <Send className="w-3 h-3" />{wa?.totalMsgsSent || 0}
                                    </span>
                                    <span className="flex items-center gap-0.5 text-blue-400">
                                      <MessageSquare className="w-3 h-3" />{wa?.totalMsgsReceived || 0}
                                    </span>
                                  </div>
                                  {(wa?.scheduledFailed || 0) > 0 && (
                                    <span className="flex items-center gap-0.5 text-[10px] text-red-400">
                                      <AlertTriangle className="w-3 h-3" />{wa.scheduledFailed} erro{wa.scheduledFailed > 1 ? "s" : ""}
                                    </span>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs max-w-[200px]">
                                <p className="font-semibold mb-1">{wa?.hasInstance ? "✅ Instância criada" : "❌ Sem instância"}</p>
                                {wa?.instanceName && <p className="text-muted-foreground mb-1">{wa.instanceName}</p>}
                                <p>📤 Enviadas: {wa?.totalMsgsSent || 0}</p>
                                <p>📥 Recebidas: {wa?.totalMsgsReceived || 0}</p>
                                {(wa?.scheduledFailed || 0) > 0 && (
                                  <p className="text-red-400">⚠️ Falhas agendamento: {wa?.scheduledFailed}</p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <span className={`text-xs font-medium ${activityColor}`}>
                              {lastAct
                                ? daysSince === 0
                                  ? "Hoje"
                                  : daysSince === 1
                                  ? "Ontem"
                                  : `${daysSince}d atrás`
                                : "Sem atividade"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={c.approved ? "default" : "secondary"} className={c.approved ? "bg-green-500/20 text-green-700 border-green-500/30" : "bg-orange-500/20 text-orange-700 border-orange-500/30"}>
                              {c.approved ? "Aprovado" : "Pendente"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleResetPassword(c.id, c.name)}
                                disabled={resettingId === c.id}
                                className="gap-1.5"
                                title="Enviar email de redefinição de senha"
                              >
                                {resettingId === c.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <KeyRound className="w-3.5 h-3.5" />
                                )}
                                Resetar Senha
                              </Button>
                              <Button
                                variant={c.approved ? "outline" : "default"}
                                size="sm"
                                onClick={() => toggleApproval(c.id, c.approved)}
                                disabled={togglingId === c.id}
                                className="gap-1.5"
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
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {consultants.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          Nenhum consultor cadastrado
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        )}

        {activeTab === "ia" && <AIKnowledgePanel />}
      </main>
    </div>
  );
};

export default SuperAdmin;
