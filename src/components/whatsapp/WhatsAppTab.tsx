import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWhatsApp } from "@/hooks/useWhatsApp";
import { useTemplates } from "@/hooks/useTemplates";
import { ConnectionPanel } from "./ConnectionPanel";
import { MessagePanel } from "./MessagePanel";
import { BulkSendPanel } from "./BulkSendPanel";
import { TemplateManager } from "./TemplateManager";
import { CustomerManager } from "./CustomerManager";

interface Customer {
  id: string;
  name: string;
  phone_whatsapp: string;
  electricity_bill_value?: number;
}

interface WhatsAppTabProps {
  userId: string;
}

export function WhatsAppTab({ userId }: WhatsAppTabProps) {
  const {
    connectionStatus,
    instanceName,
    qrCode,
    phoneNumber,
    isLoading,
    error,
    createAndConnect,
    disconnect,
    reconnect,
  } = useWhatsApp(userId);

  const {
    templates,
    isLoading: templatesLoading,
    createTemplate,
    deleteTemplate,
    applyTemplate,
  } = useTemplates(userId);

  const [customers, setCustomers] = useState<Customer[]>([]);

  const fetchCustomers = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone_whatsapp, electricity_bill_value");

      if (data) {
        setCustomers(
          data.map((c) => ({
            id: c.id,
            name: c.name || "Sem nome",
            phone_whatsapp: c.phone_whatsapp,
            electricity_bill_value: c.electricity_bill_value ?? undefined,
          }))
        );
      }
    } catch {
      // silently handle
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  return (
    <div className="flex flex-col gap-4">
      <ConnectionPanel
        connectionStatus={connectionStatus}
        qrCode={qrCode}
        instanceName={instanceName}
        phoneNumber={phoneNumber}
        isLoading={isLoading}
        error={error}
        onConnect={createAndConnect}
        onDisconnect={disconnect}
        onReconnect={reconnect}
      />

      {/* Customer manager always visible when connected */}
      {connectionStatus === "connected" && (
        <CustomerManager
          customers={customers}
          consultantId={userId}
          onCustomersChange={fetchCustomers}
        />
      )}

      {connectionStatus === "connected" && instanceName && (
        <>
          <MessagePanel
            instanceName={instanceName}
            customers={customers}
            templates={templates}
            applyTemplate={applyTemplate}
          />

          <BulkSendPanel
            instanceName={instanceName}
            customers={customers}
            templates={templates}
            applyTemplate={applyTemplate}
          />

          <TemplateManager
            templates={templates}
            isLoading={templatesLoading}
            onCreateTemplate={createTemplate}
            onDeleteTemplate={deleteTemplate}
          />
        </>
      )}
    </div>
  );
}
