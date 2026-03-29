import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWhatsApp } from "@/hooks/useWhatsApp";
import { useTemplates } from "@/hooks/useTemplates";
import { useChats } from "@/hooks/useChats";
import { ConnectionPanel } from "./ConnectionPanel";
import { MessagePanel } from "./MessagePanel";
import { BulkSendPanel } from "./BulkSendPanel";
import { TemplateManager } from "./TemplateManager";
import { CustomerManager } from "./CustomerManager";
import { ChatSidebar } from "./ChatSidebar";
import { ChatView } from "./ChatView";
import { KanbanBoard } from "./KanbanBoard";
import { SchedulePanel } from "./SchedulePanel";
import { MessageSquare, LayoutGrid, Send, FileText, Clock, Users } from "lucide-react";

interface Customer {
  id: string;
  name: string;
  phone_whatsapp: string;
  electricity_bill_value?: number;
}

interface WhatsAppTabProps {
  userId: string;
}

type SubTab = "conversas" | "crm" | "envio_massa" | "templates" | "agendamentos" | "clientes";

const SUB_TABS: { key: SubTab; label: string; icon: React.ElementType }[] = [
  { key: "conversas", label: "Conversas", icon: MessageSquare },
  { key: "crm", label: "CRM", icon: LayoutGrid },
  { key: "envio_massa", label: "Envio em Massa", icon: Send },
  { key: "templates", label: "Templates", icon: FileText },
  { key: "agendamentos", label: "Agendamentos", icon: Clock },
  { key: "clientes", label: "Clientes", icon: Users },
];

export function WhatsAppTab({ userId }: WhatsAppTabProps) {
  const {
    connectionStatus,
    instanceName,
    qrCode,
    qrGeneratedAt,
    phoneNumber,
    isLoading,
    error,
    connectionLog,
    createAndConnect,
    disconnect,
    reconnect,
    refreshQr,
  } = useWhatsApp(userId);

  const {
    templates,
    isLoading: templatesLoading,
    createTemplate,
    deleteTemplate,
    applyTemplate,
  } = useTemplates(userId);

  const { chats, isLoading: chatsLoading } = useChats(
    connectionStatus === "connected" ? instanceName : null
  );

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("conversas");
  const [selectedChatJid, setSelectedChatJid] = useState<string | null>(null);

  const selectedChat = chats.find((c) => c.remoteJid === selectedChatJid) || null;

  const fetchCustomers = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone_whatsapp, electricity_bill_value, email, cpf, address_city, address_state, address_street, address_neighborhood, address_complement, address_number, cep, numero_instalacao, data_nascimento, status, created_at");
      if (data) {
        setCustomers(
          data.map((c) => ({
            id: c.id,
            name: c.name || "Sem nome",
            phone_whatsapp: c.phone_whatsapp,
            electricity_bill_value: c.electricity_bill_value ?? undefined,
            email: c.email,
            cpf: c.cpf,
            address_city: c.address_city,
            address_state: c.address_state,
            address_street: c.address_street,
            address_neighborhood: c.address_neighborhood,
            address_complement: c.address_complement,
            address_number: c.address_number,
            cep: c.cep,
            numero_instalacao: c.numero_instalacao,
            data_nascimento: c.data_nascimento,
            status: c.status,
            created_at: c.created_at,
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

  // If not connected, show only the connection panel
  if (connectionStatus !== "connected") {
    return (
      <div className="flex flex-col gap-4">
        <ConnectionPanel
          connectionStatus={connectionStatus}
          qrCode={qrCode}
          qrGeneratedAt={qrGeneratedAt}
          instanceName={instanceName}
          phoneNumber={phoneNumber}
          isLoading={isLoading}
          error={error}
          connectionLog={connectionLog}
          onConnect={createAndConnect}
          onDisconnect={disconnect}
          onReconnect={reconnect}
          onRefreshQr={refreshQr}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 h-[calc(100vh-200px)] min-h-[500px]">
      {/* Compact connection status */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-card border border-border rounded-t-lg">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-foreground font-medium">WhatsApp Conectado</span>
          {instanceName && (
            <span className="text-[10px] text-muted-foreground">({instanceName})</span>
          )}
        </div>
        <button
          onClick={disconnect}
          className="text-[10px] text-destructive hover:underline"
        >
          Desconectar
        </button>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex border-x border-border bg-card overflow-x-auto">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveSubTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                activeSubTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content area */}
      <div className="flex-1 border border-t-0 border-border rounded-b-lg overflow-hidden bg-background">
        {activeSubTab === "conversas" && instanceName && (
          <div className="flex h-full">
            <div className="w-[300px] shrink-0">
              <ChatSidebar
                chats={chats}
                isLoading={chatsLoading}
                selectedJid={selectedChatJid}
                onSelectChat={setSelectedChatJid}
              />
            </div>
            <ChatView
              instanceName={instanceName}
              chat={selectedChat}
              templates={templates}
              consultantId={userId}
            />
          </div>
        )}

        {activeSubTab === "crm" && (
          <div className="p-4 overflow-auto h-full">
            <KanbanBoard consultantId={userId} instanceName={instanceName} />
          </div>
        )}

        {activeSubTab === "envio_massa" && instanceName && (
          <div className="p-4 overflow-auto h-full">
            <BulkSendPanel
              instanceName={instanceName}
              customers={customers}
              templates={templates}
              applyTemplate={applyTemplate}
            />
          </div>
        )}

        {activeSubTab === "templates" && (
          <div className="p-4 overflow-auto h-full">
            <TemplateManager
              templates={templates}
              isLoading={templatesLoading}
              onCreateTemplate={(name, content, mediaType, mediaUrl) => createTemplate(name, content, mediaType, mediaUrl)}
              onDeleteTemplate={deleteTemplate}
            />
          </div>
        )}

        {activeSubTab === "agendamentos" && instanceName && (
          <div className="p-4 overflow-auto h-full">
            <SchedulePanel
              consultantId={userId}
              instanceName={instanceName}
            />
          </div>
        )}

        {activeSubTab === "clientes" && (
          <div className="p-4 overflow-auto h-full">
            <CustomerManager
              customers={customers}
              consultantId={userId}
              onCustomersChange={fetchCustomers}
              instanceName={instanceName}
            />
          </div>
        )}
      </div>
    </div>
  );
}
