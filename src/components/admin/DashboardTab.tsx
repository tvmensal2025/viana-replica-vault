import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area, PieChart, Pie, Cell, Legend,
} from "recharts";
import { Eye, Users, MousePointerClick, Zap, TrendingUp, Clock, Smartphone, Globe, RefreshCw, Loader2, Filter, KeyRound } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAnalytics, friendlyClickLabel } from "@/hooks/useAnalytics";
import { StatCard } from "./StatCard";
import { Eye as EyeIcon, EyeOff } from "lucide-react";

interface DashboardTabProps {
  userId: string;
  form: { igreen_portal_email: string; igreen_portal_password: string };
  onFormUpdate: (updates: Record<string, string>) => void;
  periodDays: number;
  onPeriodChange: (days: number) => void;
}

export function DashboardTab({ userId, form, onFormUpdate, periodDays, onPeriodChange }: DashboardTabProps) {
  const { data: analytics } = useAnalytics(userId, periodDays);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncingDashboard, setSyncingDashboard] = useState(false);
  const [syncCooldown, setSyncCooldown] = useState(0);
  const [selectedLicenciado, setSelectedLicenciado] = useState("all");
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);
  const [credForm, setCredForm] = useState({ email: "", password: "" });
  const [showCredPassword, setShowCredPassword] = useState(false);

  const licenciadoOptions = useMemo(() => {
    if (!analytics?.allCustomers) return [];
    const names = new Set<string>();
    for (const c of analytics.allCustomers) {
      if (c.registered_by_name) names.add(c.registered_by_name);
    }
    return Array.from(names).sort();
  }, [analytics?.allCustomers]);

  const filteredMetrics = useMemo(() => {
    if (!analytics) return null;
    const filtered = selectedLicenciado === "all"
      ? analytics.allCustomers
      : analytics.allCustomers.filter((c: any) => c.registered_by_name === selectedLicenciado);

    const totalCustomers = filtered.length;
    const totalKw = filtered.reduce((sum: number, c: any) => sum + (Number(c.media_consumo) || 0), 0);
    const withConsumption = filtered.filter((c: any) => Number(c.media_consumo) > 0);
    const avgKw = withConsumption.length > 0 ? totalKw / withConsumption.length : 0;

    const statusMap = new Map<string, number>();
    for (const c of filtered) {
      const s = (c as any).status || "pending";
      statusMap.set(s, (statusMap.get(s) || 0) + 1);
    }
    const statusLabels: Record<string, string> = {
      approved: "Aprovados", pending: "Pendentes", rejected: "Reprovados", lead: "Leads",
      devolutiva: "Devolutiva", awaiting_signature: "Falta Assinatura",
      data_complete: "Dados Completos", registered_igreen: "Cadastrado iGreen", contract_sent: "Contrato Enviado",
    };
    const chartOnlyStatuses = ["approved", "devolutiva", "rejected"];
    for (const s of chartOnlyStatuses) {
      if (!statusMap.has(s)) statusMap.set(s, 0);
    }
    const customersByStatus = Array.from(statusMap.entries())
      .filter(([status]) => chartOnlyStatuses.includes(status))
      .map(([status, count]) => ({
        status, count,
        label: statusLabels[status] || status.charAt(0).toUpperCase() + status.slice(1),
      }))
      .sort((a, b) => b.count - a.count);

    const daysAgoDate = new Date();
    daysAgoDate.setDate(daysAgoDate.getDate() - periodDays);
    const weeks = Math.ceil(periodDays / 7);
    const weekMap = new Map<string, number>();
    for (let i = weeks - 1; i >= 0; i--) {
      const start = new Date(); start.setDate(start.getDate() - (i + 1) * 7);
      const end = new Date(); end.setDate(end.getDate() - i * 7);
      const label = `${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} - ${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
      weekMap.set(label, 0);
    }
    for (const c of filtered) {
      const created = new Date((c as any).created_at);
      if (created >= daysAgoDate) {
        const daysAgo = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));
        const weekIdx = Math.min(weeks - 1, Math.floor(daysAgo / 7));
        const keys = Array.from(weekMap.keys());
        const key = keys[keys.length - 1 - weekIdx];
        if (key) weekMap.set(key, (weekMap.get(key) || 0) + 1);
      }
    }
    const weeklyNewCustomers = Array.from(weekMap.entries()).map(([week, count]) => ({ week, count }));

    return { totalCustomers, totalKw, avgKw, customersByStatus, weeklyNewCustomers };
  }, [analytics, selectedLicenciado, periodDays]);

  const runSync = async (email: string, password: string) => {
    setSyncingDashboard(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-igreen-customers", {
        body: { portal_email: email, portal_password: password, consultant_id: userId },
      });
      if (error) throw error;
      if (data?.success) {
        toast({ title: "✅ Sincronização concluída!", description: `${data.processed} clientes processados, ${data.updated} atualizados.` });
        queryClient.invalidateQueries({ queryKey: ["analytics"] });
      } else {
        toast({ title: "Erro na sincronização", description: data?.error || "Erro desconhecido", variant: "destructive" });
      }
    } catch (err: unknown) {
      toast({ title: "Erro na sincronização", description: err instanceof Error ? err.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setSyncingDashboard(false);
    }
  };

  const handleDashboardSync = () => {
    if (form.igreen_portal_email && form.igreen_portal_password) {
      runSync(form.igreen_portal_email, form.igreen_portal_password);
    } else {
      setCredForm({ email: "", password: "" });
      setShowCredentialsDialog(true);
    }
  };

  const handleSaveCredentialsAndSync = async () => {
    if (!credForm.email || !credForm.password) return;
    try {
      const { error } = await supabase.from("consultants").update({
        igreen_portal_email: credForm.email,
        igreen_portal_password: credForm.password,
      }).eq("id", userId);
      if (error) throw error;
      onFormUpdate({ igreen_portal_email: credForm.email, igreen_portal_password: credForm.password });
      setShowCredentialsDialog(false);
      toast({ title: "✅ Credenciais salvas!" });
      runSync(credForm.email, credForm.password);
    } catch (err: unknown) {
      toast({ title: "Erro ao salvar credenciais", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    }
  };

  const chartData = analytics?.daily.map((d) => ({
    ...d,
    label: new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
  })) || [];

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-end">
        <Select value={String(periodDays)} onValueChange={(v) => onPeriodChange(Number(v))}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="15">Últimos 15 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={<Eye className="w-5 h-5" />} label="Total de Visualizações" value={analytics?.total ?? 0} color="primary" />
        <StatCard icon={<Users className="w-5 h-5" />} label="Página Cliente" value={analytics?.totalClient ?? 0} color="accent" />
        <StatCard icon={<Users className="w-5 h-5" />} label="Página Licenciado" value={analytics?.totalLicenciada ?? 0} color="primary" />
        <StatCard icon={<MousePointerClick className="w-5 h-5" />} label="Cliques nos Botões" value={analytics?.totalClicks ?? 0} color="accent" />
      </div>

      {/* Customer KPI Cards */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="font-heading font-bold text-foreground text-sm flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> Clientes iGreen
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedLicenciado} onValueChange={setSelectedLicenciado}>
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <Filter className="w-3.5 h-3.5 mr-1.5" />
              <SelectValue placeholder="Filtrar licenciado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Licenciados</SelectItem>
              {licenciadoOptions.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleDashboardSync} disabled={syncingDashboard} className="h-8 text-xs gap-1.5">
            {syncingDashboard ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {syncingDashboard ? "Sincronizando..." : "Sincronizar iGreen"}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard icon={<Users className="w-5 h-5" />} label="Total de Clientes" value={filteredMetrics?.totalCustomers ?? 0} color="primary" />
        <StatCard icon={<Zap className="w-5 h-5" />} label="Total kW (Consumo)" value={`${(filteredMetrics?.totalKw ?? 0).toLocaleString("pt-BR")} kW`} color="accent" subtitle={`Média: ${(filteredMetrics?.avgKw ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kW`} />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Taxa de Conversão" value={`${(analytics?.conversionRate ?? 0).toFixed(1)}%`} color="primary" subtitle="Cliques / Visualizações" />
      </div>

      {/* Customer Consumption + Status Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Licenciados by Deals */}
        <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
          <h3 className="font-heading font-bold text-foreground mb-1 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> 🏆 Licenciados — Cadastros
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Top licenciados por contas cadastradas</p>
          {analytics?.topLicenciados && analytics.topLicenciados.length > 0 ? (
            <div style={{ height: Math.max(200, analytics.topLicenciados.length * 36) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.topLicenciados} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(120, 8%, 18%)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 11 }} tickLine={false} axisLine={false} width={100} />
                  <Tooltip contentStyle={{ background: "hsl(120, 8%, 8%)", border: "1px solid hsl(120, 8%, 18%)", borderRadius: "12px", fontSize: "13px", color: "hsl(0, 0%, 95%)" }} formatter={(value: number) => [`${value} cadastros`, "Contas"]} />
                  <defs>
                    <linearGradient id="barGradientLic" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="hsl(130, 100%, 30%)" />
                      <stop offset="100%" stopColor="hsl(130, 100%, 45%)" />
                    </linearGradient>
                  </defs>
                  <Bar dataKey="deals" name="Cadastros" fill="url(#barGradientLic)" radius={[0, 6, 6, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum licenciado vinculado ainda</p>
          )}
        </div>

        {/* Customer Status Donut */}
        <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
          <h3 className="font-heading font-bold text-foreground mb-1 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> Status dos Clientes
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Distribuição por status</p>
          {filteredMetrics?.customersByStatus && filteredMetrics.customersByStatus.length > 0 ? (
            <>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={filteredMetrics.customersByStatus.map((s) => ({ name: s.label, value: s.count }))} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value" stroke="none">
                      {filteredMetrics.customersByStatus.map((s, i) => {
                        const statusColors: Record<string, string> = {
                          approved: "hsl(130, 100%, 36%)", pending: "hsl(45, 100%, 50%)", rejected: "hsl(0, 80%, 45%)",
                          devolutiva: "hsl(30, 100%, 50%)", lead: "hsl(200, 100%, 50%)", data_complete: "hsl(180, 70%, 45%)",
                          registered_igreen: "hsl(260, 60%, 55%)", contract_sent: "hsl(30, 100%, 50%)",
                        };
                        return <Cell key={i} fill={statusColors[s.status] || "hsl(260, 60%, 55%)"} />;
                      })}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(120, 8%, 8%)", border: "1px solid hsl(120, 8%, 18%)", borderRadius: "12px", fontSize: "13px", color: "hsl(0, 0%, 95%)" }} />
                    <Legend iconType="circle" iconSize={8} formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 mt-3 justify-center">
                {filteredMetrics.customersByStatus.map((s) => {
                  const badgeColors: Record<string, string> = {
                    approved: "bg-green-500/20 text-green-400", pending: "bg-yellow-500/20 text-yellow-400",
                    rejected: "bg-red-800/30 text-red-300", devolutiva: "bg-orange-500/20 text-orange-400",
                    lead: "bg-blue-500/20 text-blue-400", data_complete: "bg-teal-500/20 text-teal-400",
                    registered_igreen: "bg-purple-500/20 text-purple-400", contract_sent: "bg-orange-500/20 text-orange-400",
                  };
                  return (
                    <span key={s.status} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${badgeColors[s.status] || "bg-purple-500/20 text-purple-400"}`}>
                      {s.label}: {s.count}
                    </span>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sem clientes cadastrados</p>
          )}
        </div>
      </div>

      {/* Weekly New Customers */}
      {filteredMetrics?.weeklyNewCustomers && filteredMetrics.weeklyNewCustomers.some((w) => w.count > 0) && (
        <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
          <h3 className="font-heading font-bold text-foreground mb-1 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Novos Clientes por Semana
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Últimos {periodDays} dias</p>
          <div className="h-48 sm:h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredMetrics.weeklyNewCustomers} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorNewCust" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(200, 100%, 50%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(200, 100%, 50%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(120, 8%, 18%)" />
                <XAxis dataKey="week" tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(120, 8%, 8%)", border: "1px solid hsl(120, 8%, 18%)", borderRadius: "12px", fontSize: "13px", color: "hsl(0, 0%, 95%)" }} />
                <Area type="monotone" dataKey="count" name="Novos Clientes" stroke="hsl(200, 100%, 50%)" strokeWidth={2} fill="url(#colorNewCust)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Area Chart */}
      <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
        <h3 className="font-heading font-bold text-foreground mb-1">Visualizações — Últimos {periodDays} dias</h3>
        <p className="text-xs text-muted-foreground mb-4">Acompanhe o tráfego das suas landing pages</p>
        <div className="h-52 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorClient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(130, 100%, 36%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(130, 100%, 36%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorLic" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(30, 100%, 50%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(30, 100%, 50%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(120, 8%, 18%)" />
              <XAxis dataKey="label" tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "hsl(120, 8%, 8%)", border: "1px solid hsl(120, 8%, 18%)", borderRadius: "12px", fontSize: "13px", color: "hsl(0, 0%, 95%)" }} labelStyle={{ color: "hsl(0, 0%, 95%)", fontWeight: 600 }} />
              <Area type="monotone" dataKey="client" name="Cliente" stroke="hsl(130, 100%, 36%)" strokeWidth={2} fill="url(#colorClient)" />
              <Area type="monotone" dataKey="licenciada" name="Licenciado" stroke="hsl(30, 100%, 50%)" strokeWidth={2} fill="url(#colorLic)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-6 mt-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: "hsl(130, 100%, 36%)" }} />
            <span className="text-xs text-muted-foreground">Cliente</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: "hsl(30, 100%, 50%)" }} />
            <span className="text-xs text-muted-foreground">Licenciado</span>
          </div>
        </div>
      </div>

      {/* Hourly + Device + UTM row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hourly Distribution */}
        <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
          <h3 className="font-heading font-bold text-foreground mb-1 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Horários de Pico
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Visitas por hora do dia</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.hourly || []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(120, 8%, 18%)" />
                <XAxis dataKey="hour" tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(h) => `${h}h`} />
                <YAxis tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(120, 8%, 8%)", border: "1px solid hsl(120, 8%, 18%)", borderRadius: "12px", fontSize: "13px", color: "hsl(0, 0%, 95%)" }} labelFormatter={(h) => `${h}:00`} />
                <Bar dataKey="views" name="Visitas" fill="hsl(130, 100%, 36%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Device Distribution */}
        <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
          <h3 className="font-heading font-bold text-foreground mb-1 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-primary" /> Dispositivos
          </h3>
          <p className="text-xs text-muted-foreground mb-4">De onde seus visitantes acessam</p>
          <div className="space-y-3">
            {(analytics?.devices || []).map((d) => {
              const total = analytics?.total || 1;
              const pct = Math.round((d.count / total) * 100);
              const labels: Record<string, string> = { mobile: "📱 Mobile", tablet: "📱 Tablet", desktop: "💻 Desktop", desconhecido: "❓ Outro" };
              return (
                <div key={d.device}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-foreground">{labels[d.device] || d.device}</span>
                    <span className="text-muted-foreground">{d.count} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {(!analytics?.devices || analytics.devices.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">Sem dados ainda</p>
            )}
          </div>
        </div>

        {/* UTM Sources */}
        <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
          <h3 className="font-heading font-bold text-foreground mb-1 flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" /> Origem do Tráfego
          </h3>
          <p className="text-xs text-muted-foreground mb-4">De onde vêm seus visitantes</p>
          {analytics?.utmSources && analytics.utmSources.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={analytics.utmSources.map((u) => ({ name: u.source, value: u.count }))} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value" stroke="none">
                    {analytics.utmSources.map((_, i) => (
                      <Cell key={i} fill={["hsl(130,100%,36%)", "hsl(30,100%,50%)", "hsl(200,100%,50%)", "hsl(280,80%,60%)", "hsl(0,80%,55%)"][i % 5]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(120, 8%, 8%)", border: "1px solid hsl(120, 8%, 18%)", borderRadius: "12px", fontSize: "13px", color: "hsl(0, 0%, 95%)" }} formatter={(value: number, name: string) => { const total = analytics?.total || 1; return [`${value} (${Math.round((value / total) * 100)}%)`, name]; }} />
                  <Legend iconType="circle" iconSize={8} formatter={(value: string) => <span className="text-xs text-muted-foreground capitalize">{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Sem dados ainda</p>
          )}
        </div>
      </div>

      {/* Bar Chart */}
      <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
        <h3 className="font-heading font-bold text-foreground mb-1">Comparativo diário</h3>
        <p className="text-xs text-muted-foreground mb-4">Visitas por tipo de página</p>
        <div className="h-48 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData.slice(-14)} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(120, 8%, 18%)" />
              <XAxis dataKey="label" tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "hsl(120, 8%, 8%)", border: "1px solid hsl(120, 8%, 18%)", borderRadius: "12px", fontSize: "13px", color: "hsl(0, 0%, 95%)" }} />
              <Bar dataKey="client" name="Cliente" fill="hsl(130, 100%, 36%)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="licenciada" name="Licenciado" fill="hsl(30, 100%, 50%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Clicks by target */}
      {analytics?.clicksByTarget && Object.keys(analytics.clicksByTarget).length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
          <h3 className="font-heading font-bold text-foreground mb-1 flex items-center gap-2">
            <MousePointerClick className="w-4 h-4 text-primary" /> Cliques por Botão
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Quais botões seus visitantes mais clicam — separado por página</p>
          {analytics.clicksByPage?.client && Object.keys(analytics.clicksByPage.client).length > 0 && (
            <div className="mb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">📄 Página Cliente</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(analytics.clicksByPage.client).map(([target, count]) => (
                  <div key={target} className="bg-secondary rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold font-heading text-foreground">{count}</p>
                    <p className="text-xs text-muted-foreground">{friendlyClickLabel(target)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {analytics.clicksByPage?.licenciada && Object.keys(analytics.clicksByPage.licenciada).length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">💼 Página Licenciada</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(analytics.clicksByPage.licenciada).map(([target, count]) => (
                  <div key={target} className="bg-secondary rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold font-heading text-foreground">{count}</p>
                    <p className="text-xs text-muted-foreground">{friendlyClickLabel(target)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Credentials Dialog */}
      <Dialog open={showCredentialsDialog} onOpenChange={setShowCredentialsDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              Conectar ao Portal iGreen
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Informe suas credenciais do portal iGreen para sincronizar seus clientes automaticamente.
          </p>
          <div className="space-y-4 mt-2">
            <div>
              <Label htmlFor="cred-email">Email do Portal</Label>
              <Input id="cred-email" type="email" placeholder="seu@email.com" value={credForm.email} onChange={(e) => setCredForm(prev => ({ ...prev, email: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="cred-password">Senha do Portal</Label>
              <div className="relative">
                <Input id="cred-password" type={showCredPassword ? "text" : "password"} placeholder="••••••••" value={credForm.password} onChange={(e) => setCredForm(prev => ({ ...prev, password: e.target.value }))} />
                <button type="button" onClick={() => setShowCredPassword(!showCredPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showCredPassword ? <EyeOff className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button className="w-full" onClick={handleSaveCredentialsAndSync} disabled={!credForm.email || !credForm.password}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Conectar e Sincronizar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
