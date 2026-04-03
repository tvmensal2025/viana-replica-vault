import { useState, useEffect, useCallback, useMemo } from "react";
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
import { WhatsAppDashboard } from "./WhatsAppDashboard";
import { BarChart3, MessageSquare, LayoutGrid, Send, FileText, Clock, Users } from "lucide-react";

interface Customer {
  id: string;
  name: string;
  phone_whatsapp: string;
  electricity_bill_value?: number;
}

interface WhatsAppTabProps {
  userId: string;
}

type SubTab = "dashboard" | "conversas" | "crm" | "envio_massa" | "templates" | "agendamentos" | "clientes";

const SUB_TABS: { key: SubTab; label: string; icon: React.ElementType }[] = [
  { key: "dashboard", label: "Dashboard", icon: BarChart3 },
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
    updateTemplate,
    deleteTemplate,
    applyTemplate,
  } = useTemplates(userId);

  const { chats, isLoading: chatsLoading } = useChats(
    connectionStatus === "connected" ? instanceName : null
  );

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("dashboard");
  const [selectedChatJid, setSelectedChatJid] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [pendingMessageKey, setPendingMessageKey] = useState(0);

  // Build selectedChat: either from existing chats or a synthetic entry for new conversations
  const selectedChat = (() => {
    const found = chats.find((c) => c.remoteJid === selectedChatJid);
    if (found) return found;
    // If we have a JID but no chat (new conversation from customer list), create synthetic entry
    if (selectedChatJid) {
      const phone = selectedChatJid.split("@")[0];
      return {
        remoteJid: selectedChatJid,
        sendTargetJid: selectedChatJid,
        name: phone,
        lastMessage: "",
        lastMessageTimestamp: 0,
        unreadCount: 0,
        isGroup: false,
      } as import("@/hooks/useChats").ChatItem;
    }
    return null;
  })();

  const handleSelectChat = useCallback((jid: string | null) => {
    setSelectedChatJid(jid);
    setPendingMessage(null); // Clear pending message when manually selecting a chat
  }, []);

  const handleOpenChatFromCustomer = useCallback((phone: string, suggestedMessage?: string) => {
    setActiveSubTab("conversas");
    const cleanPhone = phone.replace(/\D/g, "");

    // Try exact match first
    let match = chats.find((c) => c.remoteJid.includes(cleanPhone));

    // Try Brazilian 9th digit variations (add or remove the 9 after area code)
    if (!match && cleanPhone.startsWith("55") && cleanPhone.length >= 12) {
      const ddd = cleanPhone.substring(2, 4);
      const rest = cleanPhone.substring(4);
      // If has 9 digits after DDD (with 9th digit), try without
      if (rest.length === 9 && rest.startsWith("9")) {
        const without9 = `55${ddd}${rest.substring(1)}`;
        match = chats.find((c) => c.remoteJid.includes(without9));
      }
      // If has 8 digits after DDD (without 9th digit), try with
      if (!match && rest.length === 8) {
        const with9 = `55${ddd}9${rest}`;
        match = chats.find((c) => c.remoteJid.includes(with9));
      }
    }

    // Also try matching by chat name containing the phone
    if (!match) {
      match = chats.find((c) => c.name?.includes(cleanPhone.slice(-8)));
    }

    if (match) {
      setSelectedChatJid(match.remoteJid);
    } else {
      // No existing chat — create a synthetic JID so user can start a new conversation
      const syntheticJid = `${cleanPhone}@s.whatsapp.net`;
      setSelectedChatJid(syntheticJid);
    }
    setPendingMessage(suggestedMessage || null);
    setPendingMessageKey((k) => k + 1);
  }, [chats]);

  const fetchCustomers = useCallback(async () => {
    try {
      const selectFields = "id, name, phone_whatsapp, electricity_bill_value, email, cpf, address_city, address_state, address_street, address_neighborhood, address_complement, address_number, cep, numero_instalacao, data_nascimento, status, created_at, distribuidora, registered_by_name, registered_by_igreen_id, media_consumo, desconto_cliente, andamento_igreen, devolutiva, observacao, igreen_code, data_cadastro, data_ativo, data_validado, status_financeiro, cashback, nivel_licenciado, assinatura_cliente, assinatura_igreen, link_assinatura";
      const allRows: any[] = [];
      const pageSize = 1000;
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from("customers")
          .select(selectFields)
          .eq("consultant_id", userId)
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        if (data) allRows.push(...data);
        if (!data || data.length < pageSize) break;
        page++;
      }
      if (allRows.length > 0) {
        setCustomers(
          allRows.map((c) => ({
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
            distribuidora: c.distribuidora,
            registered_by_name: c.registered_by_name,
            registered_by_igreen_id: c.registered_by_igreen_id,
            media_consumo: c.media_consumo,
            desconto_cliente: c.desconto_cliente,
            andamento_igreen: c.andamento_igreen,
            devolutiva: c.devolutiva,
            observacao: c.observacao,
            igreen_code: c.igreen_code,
            data_cadastro: c.data_cadastro,
            data_ativo: c.data_ativo,
            data_validado: c.data_validado,
            status_financeiro: c.status_financeiro,
            cashback: c.cashback,
            nivel_licenciado: c.nivel_licenciado,
            assinatura_cliente: c.assinatura_cliente,
            assinatura_igreen: c.assinatura_igreen,
            link_assinatura: c.link_assinatura,
          }))
        );
      }
    } catch {
      // silently handle
    }
  }, [userId]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const totalUnread = useMemo(() => chats.reduce((sum, c) => sum + c.unreadCount, 0), [chats]);
  const isConnected = connectionStatus === "connected";

  return (
    <div className="flex flex-col gap-0 h-[calc(100vh-200px)] min-h-[500px]">
      {/* Compact connection status */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-card border border-border rounded-t-lg">
        {isConnected ? (
          <>
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
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-destructive" />
              <span className="text-xs text-foreground font-medium">
                {connectionStatus === "connecting" ? "WhatsApp Conectando..." : "WhatsApp Desconectado"}
              </span>
            </div>
            <button
              onClick={() => {
                setActiveSubTab("conversas");
                if (connectionStatus === "disconnected") createAndConnect();
              }}
              disabled={isLoading}
              className="text-[10px] text-primary hover:underline font-medium"
            >
              {isLoading || connectionStatus === "connecting" ? "Conectando..." : "Conectar"}
            </button>
          </>
        )}
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
        {activeSubTab === "conversas" && (
          isConnected && instanceName ? (
            <div className="flex h-full">
              <div className="w-[300px] shrink-0">
                <ChatSidebar
                  chats={chats}
                  isLoading={chatsLoading}
                  selectedJid={selectedChatJid}
                  onSelectChat={handleSelectChat}
                  consultantId={userId}
                />
              </div>
              <ChatView
                instanceName={instanceName}
                chat={selectedChat}
                templates={templates}
                consultantId={userId}
                initialMessage={pendingMessage}
                key={`chat-${selectedChatJid}-${pendingMessageKey}`}
              />
            </div>
          ) : (
            <div className="p-4 overflow-auto h-full">
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
          )
        )}

        {activeSubTab === "crm" && (
          <div className="p-4 overflow-auto h-full">
            <KanbanBoard consultantId={userId} instanceName={instanceName} />
          </div>
        )}

        {activeSubTab === "envio_massa" && (
          <div className="p-4 overflow-auto h-full">
            {isConnected && instanceName ? (
              <BulkSendPanel
                instanceName={instanceName}
                customers={customers}
                templates={templates}
                applyTemplate={applyTemplate}
              />
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                Conecte o WhatsApp para enviar mensagens em massa.
              </div>
            )}
          </div>
        )}

        {activeSubTab === "templates" && (
          <div className="p-4 overflow-auto h-full">
            <TemplateManager
              templates={templates}
              isLoading={templatesLoading}
              consultantId={userId}
              onCreateTemplate={(name, content, mediaType, mediaUrl, imageUrl) => createTemplate(name, content, mediaType, mediaUrl, imageUrl)}
              onUpdateTemplate={updateTemplate}
              onDeleteTemplate={deleteTemplate}
            />
          </div>
        )}

        {activeSubTab === "agendamentos" && (
          <div className="p-4 overflow-auto h-full">
            {isConnected && instanceName ? (
              <SchedulePanel
                consultantId={userId}
                instanceName={instanceName}
              />
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                Conecte o WhatsApp para gerenciar agendamentos.
              </div>
            )}
          </div>
        )}

        {activeSubTab === "clientes" && (
          <div className="p-4 overflow-auto h-full">
            <CustomerManager
              customers={customers}
              consultantId={userId}
              onCustomersChange={fetchCustomers}
              instanceName={instanceName}
              onOpenChat={handleOpenChatFromCustomer}
            />
          </div>
        )}
      </div>
    </div>
  );
}
