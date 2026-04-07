import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Notification {
  id: string;
  type: "new_lead" | "status_change" | "devolutiva" | "new_customer" | "deal_moved" | "page_view";
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  meta?: Record<string, string>;
}

export function useNotifications(consultantId: string | null) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevCustomersRef = useRef<Map<string, string>>(new Map());
  const initialLoadDone = useRef(false);

  // Load initial customer statuses (so we only notify on CHANGES)
  useEffect(() => {
    if (!consultantId) return;
    (async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, status, name")
        .eq("consultant_id", consultantId);
      if (data) {
        const map = new Map<string, string>();
        data.forEach((c) => map.set(c.id, c.status));
        prevCustomersRef.current = map;
      }
      initialLoadDone.current = true;
    })();
  }, [consultantId]);

  const addNotification = useCallback((n: Omit<Notification, "id" | "timestamp" | "read">) => {
    const notification: Notification = {
      ...n,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      read: false,
    };
    setNotifications((prev) => [notification, ...prev].slice(0, 50));
    setUnreadCount((prev) => prev + 1);
  }, []);

  // Listen for new CRM deals (new leads)
  useEffect(() => {
    if (!consultantId) return;
    const channel = supabase
      .channel("notif-new-deals")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "crm_deals",
          filter: `consultant_id=eq.${consultantId}`,
        },
        (payload) => {
          const deal = payload.new as any;
          const phone = deal.remote_jid?.split("@")[0] || "Desconhecido";
          addNotification({
            type: "new_lead",
            title: "🟢 Novo lead no CRM",
            description: `Lead ${phone} adicionado na etapa "${deal.stage}"`,
            meta: { dealId: deal.id, phone },
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [consultantId, addNotification]);

  // Listen for customer status changes (approved, rejected, devolutiva)
  useEffect(() => {
    if (!consultantId) return;
    const channel = supabase
      .channel("notif-customer-changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "customers",
          filter: `consultant_id=eq.${consultantId}`,
        },
        (payload) => {
          if (!initialLoadDone.current) return;
          const customer = payload.new as any;
          const oldStatus = prevCustomersRef.current.get(customer.id);
          const newStatus = customer.status;

          // Only notify if status actually changed
          if (oldStatus === newStatus) return;
          prevCustomersRef.current.set(customer.id, newStatus);

          const name = customer.name || customer.phone_whatsapp || "Cliente";

          if (newStatus === "approved") {
            addNotification({
              type: "status_change",
              title: "✅ Cliente aprovado",
              description: `${name} foi aprovado pela iGreen`,
              meta: { customerId: customer.id, status: "approved" },
            });
          } else if (newStatus === "rejected") {
            addNotification({
              type: "status_change",
              title: "❌ Cliente reprovado",
              description: `${name} foi reprovado`,
              meta: { customerId: customer.id, status: "rejected" },
            });
          } else if (newStatus === "devolutiva") {
            addNotification({
              type: "devolutiva",
              title: "⚠️ Devolutiva recebida",
              description: `${name} — ${customer.devolutiva || "Verificar pendência"}`,
              meta: { customerId: customer.id, status: "devolutiva" },
            });
          } else if (newStatus === "awaiting_signature") {
            addNotification({
              type: "status_change",
              title: "✍️ Falta assinatura",
              description: `${name} precisa assinar o contrato`,
              meta: { customerId: customer.id, status: "awaiting_signature" },
            });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [consultantId, addNotification]);

  // Listen for new customers (from sync or landing page)
  useEffect(() => {
    if (!consultantId) return;
    const channel = supabase
      .channel("notif-new-customers")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "customers",
          filter: `consultant_id=eq.${consultantId}`,
        },
        (payload) => {
          const customer = payload.new as any;
          const name = customer.name || customer.phone_whatsapp || "Novo cliente";
          prevCustomersRef.current.set(customer.id, customer.status);
          addNotification({
            type: "new_customer",
            title: "👤 Novo cliente cadastrado",
            description: `${name} foi adicionado à sua base`,
            meta: { customerId: customer.id },
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [consultantId, addNotification]);

  // Listen for deal stage changes (moved in kanban)
  useEffect(() => {
    if (!consultantId) return;
    const channel = supabase
      .channel("notif-deal-moves")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "crm_deals",
          filter: `consultant_id=eq.${consultantId}`,
        },
        (payload) => {
          const oldDeal = payload.old as any;
          const newDeal = payload.new as any;
          if (oldDeal.stage === newDeal.stage) return;
          const phone = newDeal.remote_jid?.split("@")[0] || "Lead";
          addNotification({
            type: "deal_moved",
            title: "📋 Deal movido",
            description: `${phone}: ${oldDeal.stage} → ${newDeal.stage}`,
            meta: { dealId: newDeal.id, from: oldDeal.stage, to: newDeal.stage },
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [consultantId, addNotification]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  return { notifications, unreadCount, markAllRead, markRead, clearAll };
}
