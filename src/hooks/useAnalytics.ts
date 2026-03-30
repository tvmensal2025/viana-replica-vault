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

export interface TopLicenciado {
  name: string;
  deals: number;
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

      // Fetch views, events, deals and ALL customers in parallel
      const [viewsRes, eventsRes, dealsRes, allCustomersRes] = await Promise.all([
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
        supabase
          .from("customers")
          .select("id, name, status, media_consumo, electricity_bill_value, created_at, registered_by_name, registered_by_igreen_id"),
      ]);

      if (viewsRes.error) throw viewsRes.error;
      if (eventsRes.error) throw eventsRes.error;
      if (dealsRes.error) throw dealsRes.error;

      const views = viewsRes.data;
      const events = eventsRes.data;
      const deals = dealsRes.data;
      const allCustomers = allCustomersRes.data || [];

      // Get unique customer IDs from deals
      const customerIds = [...new Set(deals.map((d) => d.customer_id).filter(Boolean))] as string[];

      // Filter deal-linked customers for status/consumption metrics
      const customers = allCustomers.filter((c) => customerIds.includes(c.id));

      const totalClient = views.filter((v) => v.page_type === "client").length;
      const totalLicenciada = views.filter((v) => v.page_type === "licenciada").length;

      // Clicks
      const totalClicks = events.filter((e) => e.event_type === "click").length;
      const clicksByTarget: Record<string, number> = {};
      const clicksByPage: Record<string, Record<string, number>> = { client: {}, licenciada: {} };
      for (const e of events) {
        if (e.event_type === "click" && e.event_target) {
          clicksByTarget[e.event_target] = (clicksByTarget[e.event_target] || 0) + 1;
          const page = e.page_type === "licenciada" ? "licenciada" : "client";
          if (!clicksByPage[page][e.event_target]) clicksByPage[page][e.event_target] = 0;
          clicksByPage[page][e.event_target]++;
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

      // Total kW (media_consumo) — used as the unified consumption metric
      const totalKw = customers.reduce((sum, c) => sum + (Number(c.media_consumo) || 0), 0);
      const customersWithConsumption = customers.filter((c) => Number(c.media_consumo) > 0);
      const avgKw = customersWithConsumption.length > 0 ? totalKw / customersWithConsumption.length : 0;

      // Top licenciados by customer count (from registered_by_name)
      const licMap = new Map<string, number>();
      for (const c of customers) {
        const lic = c.registered_by_name;
        if (lic) licMap.set(lic, (licMap.get(lic) || 0) + 1);
      }
      const topLicenciados: TopLicenciado[] = Array.from(licMap.entries())
        .map(([name, deals]) => ({ name, deals }))
        .sort((a, b) => b.deals - a.deals)
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
        clicksByPage,
        daily,
        hourly,
        devices,
        utmSources,
        totalCustomers,
        customersByStatus,
        totalKw,
        avgKw,
        topLicenciados,
        weeklyNewCustomers,
        conversionRate,
      };
    },
  });
}
