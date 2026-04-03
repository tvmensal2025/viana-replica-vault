import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/admin/StatCard";
import { Users, DollarSign, LayoutGrid, FileText, Clock, TrendingUp } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

interface WhatsAppDashboardProps {
  consultantId: string;
}

export function WhatsAppDashboard({ consultantId }: WhatsAppDashboardProps) {
  const { data: customers } = useQuery({
    queryKey: ["waDashCustomers", consultantId],
    queryFn: async () => {
      const all: any[] = [];
      let page = 0;
      while (true) {
        const { data, error } = await supabase.from("customers").select("id, status, electricity_bill_value, created_at")
          .eq("consultant_id", consultantId).range(page * 1000, (page + 1) * 1000 - 1);
        if (error) throw error;
        if (data) all.push(...data);
        if (!data || data.length < 1000) break;
        page++;
      }
      return all;
    },
  });

  const { data: deals } = useQuery({
    queryKey: ["waDashDeals", consultantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("crm_deals").select("stage").eq("consultant_id", consultantId);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: kanbanStages } = useQuery({
    queryKey: ["waDashStages", consultantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("kanban_stages").select("stage_key, label, color").eq("consultant_id", consultantId).order("position");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: templates } = useQuery({
    queryKey: ["waDashTemplates", consultantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("message_templates").select("id").eq("consultant_id", consultantId);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: scheduledMsgs } = useQuery({
    queryKey: ["waDashScheduled", consultantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("scheduled_messages").select("id, status").eq("consultant_id", consultantId);
      if (error) throw error;
      return data || [];
    },
  });

  const metrics = useMemo(() => {
    if (!customers) return null;
    const total = customers.length;
    const approved = customers.filter((c) => c.status === "approved").length;
    const pending = customers.filter((c) => c.status === "pending").length;
    const rejected = customers.filter((c) => c.status === "rejected").length;
    const totalBill = customers.reduce((sum, c) => sum + (Number(c.electricity_bill_value) || 0), 0);
    const withBill = customers.filter((c) => Number(c.electricity_bill_value) > 0);
    const avgBill = withBill.length > 0 ? totalBill / withBill.length : 0;

    const statusData = [
      { name: "Aprovados", value: approved, color: "hsl(130, 100%, 36%)" },
      { name: "Pendentes", value: pending, color: "hsl(45, 100%, 50%)" },
      { name: "Reprovados", value: rejected, color: "hsl(0, 80%, 45%)" },
    ].filter((s) => s.value > 0);

    const pendingScheduled = (scheduledMsgs || []).filter((m) => m.status === "pending").length;
    const sentScheduled = (scheduledMsgs || []).filter((m) => m.status === "sent").length;

    return { total, approved, pending, rejected, totalBill, avgBill, statusData, pendingScheduled, sentScheduled };
  }, [customers, scheduledMsgs]);

  const dealsByStage = useMemo(() => {
    if (!deals || !kanbanStages) return [];
    const stageMap = new Map<string, number>();
    for (const d of deals) stageMap.set(d.stage, (stageMap.get(d.stage) || 0) + 1);
    return kanbanStages.map((s) => ({
      label: s.label,
      count: stageMap.get(s.stage_key) || 0,
    }));
  }, [deals, kanbanStages]);

  // Weekly new customers (last 30 days)
  const weeklyData = useMemo(() => {
    if (!customers) return [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 28);
    const weeks: { label: string; count: number }[] = [];
    for (let i = 3; i >= 0; i--) {
      const start = new Date(); start.setDate(start.getDate() - (i + 1) * 7);
      const end = new Date(); end.setDate(end.getDate() - i * 7);
      const label = `${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
      const count = customers.filter((c) => {
        const d = new Date(c.created_at);
        return d >= start && d < end;
      }).length;
      weeks.push({ label, count });
    }
    return weeks;
  }, [customers]);

  if (!metrics) {
    return <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">Carregando métricas...</div>;
  }

  return (
    <div className="space-y-6 p-4 overflow-auto h-full">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Users className="w-5 h-5" />} label="Total Clientes" value={metrics.total} color="primary" />
        <StatCard icon={<Users className="w-5 h-5" />} label="Aprovados" value={metrics.approved} color="accent" />
        <StatCard icon={<DollarSign className="w-5 h-5" />} label="Valor Total Contas" value={`R$ ${metrics.totalBill.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`} color="primary" subtitle={`Média: R$ ${metrics.avgBill.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`} />
        <StatCard icon={<FileText className="w-5 h-5" />} label="Templates" value={templates?.length ?? 0} color="accent" subtitle={`${metrics.pendingScheduled} agendados pendentes`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Donut */}
        <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
          <h3 className="font-heading font-bold text-foreground mb-4 flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-primary" /> Status dos Clientes
          </h3>
          {metrics.statusData.length > 0 ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={metrics.statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value" stroke="none">
                    {metrics.statusData.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(120, 8%, 8%)", border: "1px solid hsl(120, 8%, 18%)", borderRadius: "12px", fontSize: "13px", color: "hsl(0, 0%, 95%)" }} />
                  <Legend iconType="circle" iconSize={8} formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
          )}
        </div>

        {/* Deals by Stage */}
        <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
          <h3 className="font-heading font-bold text-foreground mb-4 flex items-center gap-2 text-sm">
            <LayoutGrid className="w-4 h-4 text-primary" /> Deals por Etapa
          </h3>
          {dealsByStage.length > 0 ? (
            <div style={{ height: Math.max(200, dealsByStage.length * 36) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dealsByStage} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(120, 8%, 18%)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 11 }} tickLine={false} axisLine={false} width={100} />
                  <Tooltip contentStyle={{ background: "hsl(120, 8%, 8%)", border: "1px solid hsl(120, 8%, 18%)", borderRadius: "12px", fontSize: "13px", color: "hsl(0, 0%, 95%)" }} />
                  <Bar dataKey="count" name="Deals" fill="hsl(130, 100%, 36%)" radius={[0, 6, 6, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum deal no CRM</p>
          )}
        </div>
      </div>

      {/* Weekly new customers */}
      {weeklyData.some((w) => w.count > 0) && (
        <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
          <h3 className="font-heading font-bold text-foreground mb-4 flex items-center gap-2 text-sm">
            <TrendingUp className="w-4 h-4 text-primary" /> Novos Clientes por Semana
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(120, 8%, 18%)" />
                <XAxis dataKey="label" tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(120, 8%, 8%)", border: "1px solid hsl(120, 8%, 18%)", borderRadius: "12px", fontSize: "13px", color: "hsl(0, 0%, 95%)" }} />
                <Bar dataKey="count" name="Novos Clientes" fill="hsl(200, 100%, 50%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Scheduled Messages Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-2xl border border-border p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xl font-bold font-heading text-foreground">{metrics.pendingScheduled}</p>
            <p className="text-[10px] text-muted-foreground">Agendadas pendentes</p>
          </div>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
            <Clock className="w-5 h-5 text-accent" />
          </div>
          <div>
            <p className="text-xl font-bold font-heading text-foreground">{metrics.sentScheduled}</p>
            <p className="text-[10px] text-muted-foreground">Agendadas enviadas</p>
          </div>
        </div>
      </div>
    </div>
  );
}
