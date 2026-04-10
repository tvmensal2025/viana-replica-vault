import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Eye, MousePointerClick, Smartphone, Monitor, Tablet, Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

interface CrmEvent {
  id: string;
  event_type: string;
  event_target: string | null;
  device_type: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
  created_at: string;
}

const COLORS = ["hsl(130,70%,45%)", "hsl(200,70%,50%)", "hsl(40,80%,50%)", "hsl(280,60%,55%)", "hsl(0,70%,55%)"];

export function CrmAnalyticsTab() {
  const [events, setEvents] = useState<CrmEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodDays, setPeriodDays] = useState(30);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - periodDays * 86400000).toISOString();
    const { data } = await supabase
      .from("crm_page_events" as any)
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    setEvents((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [periodDays]);

  const metrics = useMemo(() => {
    const views = events.filter(e => e.event_type === "view");
    const clicks = events.filter(e => e.event_type === "click");

    // Device breakdown
    const deviceMap = new Map<string, number>();
    views.forEach(v => {
      const d = v.device_type || "unknown";
      deviceMap.set(d, (deviceMap.get(d) || 0) + 1);
    });
    const deviceLabels: Record<string, string> = { mobile: "Mobile", tablet: "Tablet", desktop: "Desktop", unknown: "Outro" };
    const deviceData = Array.from(deviceMap.entries()).map(([key, value]) => ({
      name: deviceLabels[key] || key, value,
    })).sort((a, b) => b.value - a.value);

    // Click targets
    const targetMap = new Map<string, number>();
    clicks.forEach(c => {
      const t = c.event_target || "unknown";
      targetMap.set(t, (targetMap.get(t) || 0) + 1);
    });
    const clickTargets = Array.from(targetMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Daily views
    const dayMap = new Map<string, { views: number; clicks: number }>();
    const days = Math.min(periodDays, 30);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      dayMap.set(key, { views: 0, clicks: 0 });
    }
    events.forEach(e => {
      const key = e.created_at.split("T")[0];
      const entry = dayMap.get(key);
      if (entry) {
        if (e.event_type === "view") entry.views++;
        else entry.clicks++;
      }
    });
    const dailyData = Array.from(dayMap.entries()).map(([date, data]) => ({
      label: new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      ...data,
    }));

    // UTM sources
    const utmMap = new Map<string, number>();
    views.forEach(v => {
      if (v.utm_source) utmMap.set(v.utm_source, (utmMap.get(v.utm_source) || 0) + 1);
    });
    const utmData = Array.from(utmMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Referrers
    const refMap = new Map<string, number>();
    views.forEach(v => {
      if (v.referrer) {
        try {
          const host = new URL(v.referrer).hostname;
          refMap.set(host, (refMap.get(host) || 0) + 1);
        } catch {}
      }
    });
    const referrerData = Array.from(refMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    return {
      totalViews: views.length,
      totalClicks: clicks.length,
      conversionRate: views.length > 0 ? ((clicks.length / views.length) * 100).toFixed(1) : "0.0",
      deviceData,
      clickTargets,
      dailyData,
      utmData,
      referrerData,
    };
  }, [events, periodDays]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-heading text-foreground flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" /> Analytics da Página CRM
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} className="h-8 text-xs gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </Button>
          <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v))}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="15">Últimos 15 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <Eye className="w-5 h-5 text-primary mb-2" />
          <p className="text-2xl font-bold text-foreground">{metrics.totalViews}</p>
          <p className="text-[11px] text-muted-foreground">Visualizações</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <MousePointerClick className="w-5 h-5 text-accent mb-2" />
          <p className="text-2xl font-bold text-foreground">{metrics.totalClicks}</p>
          <p className="text-[11px] text-muted-foreground">Cliques</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <TrendingUp className="w-5 h-5 text-primary mb-2" />
          <p className="text-2xl font-bold text-foreground">{metrics.conversionRate}%</p>
          <p className="text-[11px] text-muted-foreground">Taxa de Clique</p>
        </div>
      </div>

      {/* Daily Chart */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-4">Visualizações e Cliques por Dia</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={metrics.dailyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="views" name="Visualizações" fill="hsl(130,70%,45%)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="clicks" name="Cliques" fill="hsl(40,80%,50%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Device Pie */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Dispositivos</h3>
          {metrics.deviceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={metrics.deviceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {metrics.deviceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>}
        </div>

        {/* Click Targets */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Cliques por Botão</h3>
          {metrics.clickTargets.length > 0 ? (
            <div className="space-y-2">
              {metrics.clickTargets.map((t) => (
                <div key={t.name} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <span className="text-xs text-foreground truncate max-w-[70%]">{t.name}</span>
                  <span className="text-xs font-bold text-primary">{t.value}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground text-center py-8">Sem cliques registrados</p>}
        </div>
      </div>

      {/* UTM & Referrers */}
      <div className="grid md:grid-cols-2 gap-4">
        {metrics.utmData.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">UTM Sources</h3>
            <div className="space-y-2">
              {metrics.utmData.map((u) => (
                <div key={u.name} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <span className="text-xs text-foreground truncate max-w-[70%]">{u.name}</span>
                  <span className="text-xs font-bold text-primary">{u.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {metrics.referrerData.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Referrers</h3>
            <div className="space-y-2">
              {metrics.referrerData.map((r) => (
                <div key={r.name} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <span className="text-xs text-foreground truncate max-w-[70%]">{r.name}</span>
                  <span className="text-xs font-bold text-primary">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
