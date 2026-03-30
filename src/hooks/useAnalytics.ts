import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DailyViews {
  date: string;
  client: number;
  licenciada: number;
}

export interface HourlyData {
  hour: number;
  views: number;
}

export interface DeviceData {
  device: string;
  count: number;
}

export interface UtmData {
  source: string;
  count: number;
}

export interface CustomerStatusData {
  status: string;
  count: number;
  label: string;
}

export interface CustomerConsumption {
  name: string;
  consumo: number;
}

export interface WeeklyNewCustomers {
  week: string;
  count: number;
}

// Friendly labels for click targets
const CLICK_LABELS: Record<string, string> = {
  whatsapp: "💬 WhatsApp",
  whatsapp_intermediate: "💬 WhatsApp (CTA)",
  cadastro_cta: "📋 Botão de Cadastro",
  cadastro: "📋 Cadastro",
  cadastro_hero: "🏠 Cadastro (Hero)",
  cadastro_final: "📋 Cadastro (Final)",
  licenciada_cta: "💼 Licenciada (CTA)",
  licenciada: "💼 Licenciada",
  telefone: "📞 Telefone",
  instagram: "📸 Instagram",
  facebook: "📘 Facebook",
};

export function friendlyClickLabel(target: string): string {
  return CLICK_LABELS[target] || target.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function useAnalytics(consultantId: string | null) {
  return useQuery({
    queryKey: ["analytics", consultantId],
    enabled: !!consultantId,
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const since = thirtyDaysAgo.toISOString();

      // Fetch views, events, deals and customers in parallel
      const [viewsRes, eventsRes, dealsRes] = await Promise.all([
        supabase
          .from("page_views")
          .select("page_type, created_at, device_type, utm_source")
          .eq("consultant_id", consultantId!)
          .gte("created_at", since),
        supabase
          .from("page_events")
          .select("event_type, event_target, page_type, created_at, device_type, utm_source")
          .eq("consultant_id", consultantId!)
          .gte("created_at", since),
        supabase
          .from("crm_deals")
          .select("customer_id")
          .eq("consultant_id", consultantId!),
      ]);

      if (viewsRes.error) throw viewsRes.error;
      if (eventsRes.error) throw eventsRes.error;
      if (dealsRes.error) throw dealsRes.error;

      const views = viewsRes.data;
      const events = eventsRes.data;
      const deals = dealsRes.data;

      // Get unique customer IDs from deals
      const customerIds = [...new Set(deals.map((d) => d.customer_id).filter(Boolean))] as string[];

      // Fetch customers if we have IDs
      let customers: Array<{
        id: string;
        name: string | null;
        status: string;
        media_consumo: number | null;
        electricity_bill_value: number | null;
        created_at: string;
      }> = [];

      if (customerIds.length > 0) {
        const { data: custData, error: custError } = await supabase
          .from("customers")
          .select("id, name, status, media_consumo, electricity_bill_value, created_at")
          .in("id", customerIds);
        if (!custError && custData) customers = custData;
      }

      const totalClient = views.filter((v) => v.page_type === "client").length;
      const totalLicenciada = views.filter((v) => v.page_type === "licenciada").length;

      // Clicks
      const totalClicks = events.filter((e) => e.event_type === "click").length;
      const clicksByTarget: Record<string, number> = {};
      for (const e of events) {
        if (e.event_type === "click" && e.event_target) {
          clicksByTarget[e.event_target] = (clicksByTarget[e.event_target] || 0) + 1;
        }
      }

      // Daily views
      const dayMap = new Map<string, { client: number; licenciada: number }>();
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dayMap.set(d.toISOString().split("T")[0], { client: 0, licenciada: 0 });
      }
      for (const row of views) {
        const key = row.created_at.split("T")[0];
        const entry = dayMap.get(key);
        if (entry) {
          if (row.page_type === "client") entry.client++;
          else entry.licenciada++;
        }
      }
      const daily: DailyViews[] = Array.from(dayMap.entries()).map(([date, counts]) => ({
        date,
        ...counts,
      }));

      // Hourly distribution
      const hourMap = new Map<number, number>();
      for (let h = 0; h < 24; h++) hourMap.set(h, 0);
      for (const row of views) {
        const h = new Date(row.created_at).getHours();
        hourMap.set(h, (hourMap.get(h) || 0) + 1);
      }
      const hourly: HourlyData[] = Array.from(hourMap.entries()).map(([hour, views]) => ({
        hour,
        views,
      }));

      // Device distribution
      const deviceMap = new Map<string, number>();
      for (const row of views) {
        const d = row.device_type || "desconhecido";
        deviceMap.set(d, (deviceMap.get(d) || 0) + 1);
      }
      const devices: DeviceData[] = Array.from(deviceMap.entries())
        .map(([device, count]) => ({ device, count }))
        .sort((a, b) => b.count - a.count);

      // UTM sources
      const utmMap = new Map<string, number>();
      for (const row of views) {
        const s = row.utm_source || "direto";
        utmMap.set(s, (utmMap.get(s) || 0) + 1);
      }
      const utmSources: UtmData[] = Array.from(utmMap.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);

      // --- Customer Metrics ---
      const totalCustomers = customers.length;

      // Customer status distribution
      const statusMap = new Map<string, number>();
      for (const c of customers) {
        const s = c.status || "pending";
        statusMap.set(s, (statusMap.get(s) || 0) + 1);
      }
      const statusLabels: Record<string, string> = {
        approved: "Aprovados",
        pending: "Pendentes",
        rejected: "Rejeitados",
        lead: "Leads",
      };
      const customersByStatus: CustomerStatusData[] = Array.from(statusMap.entries())
        .map(([status, count]) => ({
          status,
          count,
          label: statusLabels[status] || status.charAt(0).toUpperCase() + status.slice(1),
        }))
        .sort((a, b) => b.count - a.count);

      // Total kW and bill value
      const totalKw = customers.reduce((sum, c) => sum + (Number(c.media_consumo) || 0), 0);
      const totalBillValue = customers.reduce((sum, c) => sum + (Number(c.electricity_bill_value) || 0), 0);
      const customersWithBill = customers.filter((c) => Number(c.electricity_bill_value) > 0);
      const avgBillValue = customersWithBill.length > 0 ? totalBillValue / customersWithBill.length : 0;

      // Customer consumption chart (top 15)
      const customerConsumption: CustomerConsumption[] = customers
        .filter((c) => Number(c.media_consumo) > 0)
        .map((c) => ({
          name: c.name || "Sem nome",
          consumo: Number(c.media_consumo) || 0,
        }))
        .sort((a, b) => b.consumo - a.consumo)
        .slice(0, 15);

      // Weekly new customers (last 30 days)
      const weekMap = new Map<string, number>();
      for (let i = 3; i >= 0; i--) {
        const start = new Date();
        start.setDate(start.getDate() - (i + 1) * 7);
        const end = new Date();
        end.setDate(end.getDate() - i * 7);
        const label = `${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} - ${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
        weekMap.set(label, 0);
      }
      for (const c of customers) {
        const created = new Date(c.created_at);
        if (created >= thirtyDaysAgo) {
          const daysAgo = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));
          const weekIdx = Math.min(3, Math.floor(daysAgo / 7));
          const keys = Array.from(weekMap.keys());
          const key = keys[3 - weekIdx];
          if (key) weekMap.set(key, (weekMap.get(key) || 0) + 1);
        }
      }
      const weeklyNewCustomers: WeeklyNewCustomers[] = Array.from(weekMap.entries()).map(
        ([week, count]) => ({ week, count })
      );

      // Conversion rate
      const total = totalClient + totalLicenciada;
      const conversionRate = total > 0 ? (totalClicks / total) * 100 : 0;

      return {
        totalClient,
        totalLicenciada,
        total,
        totalClicks,
        clicksByTarget,
        daily,
        hourly,
        devices,
        utmSources,
        // New customer metrics
        totalCustomers,
        customersByStatus,
        totalKw,
        totalBillValue,
        avgBillValue,
        customerConsumption,
        weeklyNewCustomers,
        conversionRate,
      };
    },
  });
}
