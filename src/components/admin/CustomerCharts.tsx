import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, Users } from "lucide-react";

interface CustomerMetrics {
  totalCustomers: number;
  totalKw: number;
  avgKw: number;
  customersByStatus: { status: string; count: number; label: string }[];
  weeklyNewCustomers: { week: string; count: number }[];
}

interface LicenciadoData {
  name: string;
  deals: number;
}

interface CustomerChartsProps {
  filteredMetrics: CustomerMetrics | null;
  topLicenciados?: LicenciadoData[];
}

const STATUS_COLORS: Record<string, string> = {
  approved: "hsl(130, 100%, 36%)", pending: "hsl(45, 100%, 50%)", rejected: "hsl(0, 80%, 45%)",
  devolutiva: "hsl(30, 100%, 50%)", lead: "hsl(200, 100%, 50%)", data_complete: "hsl(180, 70%, 45%)",
  registered_igreen: "hsl(260, 60%, 55%)", contract_sent: "hsl(30, 100%, 50%)",
};

const BADGE_COLORS: Record<string, string> = {
  approved: "bg-green-500/20 text-green-400", pending: "bg-yellow-500/20 text-yellow-400",
  rejected: "bg-red-800/30 text-red-300", devolutiva: "bg-orange-500/20 text-orange-400",
  lead: "bg-blue-500/20 text-blue-400", data_complete: "bg-teal-500/20 text-teal-400",
  registered_igreen: "bg-purple-500/20 text-purple-400", contract_sent: "bg-orange-500/20 text-orange-400",
};

export function CustomerCharts({ filteredMetrics, topLicenciados }: CustomerChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Top Licenciados */}
      <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
        <h3 className="font-heading font-bold text-foreground mb-1 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" /> 🏆 Licenciados — Cadastros
        </h3>
        <p className="text-xs text-muted-foreground mb-4">Top licenciados por contas cadastradas</p>
        {topLicenciados && topLicenciados.length > 0 ? (
          <div style={{ height: Math.max(200, topLicenciados.length * 36) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topLicenciados} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(120, 8%, 18%)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 11 }} tickLine={false} axisLine={false} width={100} />
                <Tooltip contentStyle={{ background: "hsl(120, 8%, 8%)", border: "1px solid hsl(120, 8%, 18%)", borderRadius: "12px", fontSize: "13px", color: "hsl(0, 0%, 95%)" }} formatter={(value: number) => [`${value} cadastros`, "Contas"]} />
                <defs><linearGradient id="barGradientLic" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="hsl(130, 100%, 30%)" /><stop offset="100%" stopColor="hsl(130, 100%, 45%)" /></linearGradient></defs>
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
                    {filteredMetrics.customersByStatus.map((s, i) => (
                      <Cell key={i} fill={STATUS_COLORS[s.status] || "hsl(260, 60%, 55%)"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(120, 8%, 8%)", border: "1px solid hsl(120, 8%, 18%)", borderRadius: "12px", fontSize: "13px", color: "hsl(0, 0%, 95%)" }} />
                  <Legend iconType="circle" iconSize={8} formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2 mt-3 justify-center">
              {filteredMetrics.customersByStatus.map((s) => (
                <span key={s.status} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${BADGE_COLORS[s.status] || "bg-purple-500/20 text-purple-400"}`}>
                  {s.label}: {s.count}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">Sem clientes cadastrados</p>
        )}
      </div>
    </div>
  );
}
