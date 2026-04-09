import React, { useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { LogOut, BarChart3, LinkIcon, Settings, Monitor, MessageSquare, LayoutGrid, Users, Copy, Download, X, History, Sparkles, FolderDown, Network, Eye, EyeOff } from "lucide-react";
import { PrivacyModeProvider, usePrivacyMode } from "@/contexts/PrivacyModeContext";
import { useQueryClient } from "@tanstack/react-query";
import { WhatsAppErrorBoundary } from "@/components/whatsapp/WhatsAppErrorBoundary";
import { useWhatsApp } from "@/hooks/useWhatsApp";
import { QRCodeSVG } from "qrcode.react";
import { DashboardTab } from "@/components/admin/DashboardTab";
import { DadosTab } from "@/components/admin/DadosTab";
import { LinksTab } from "@/components/admin/LinksTab";
import { PreviewTab } from "@/components/admin/PreviewTab";
import { NotificationCenter } from "@/components/admin/NotificationCenter";
import { useNotifications } from "@/hooks/useNotifications";
import { AIChatPanel } from "@/components/admin/AIChatPanel";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useConsultantForm } from "@/hooks/useConsultantForm";

const WhatsAppTab = lazy(() => import("@/components/whatsapp/WhatsAppTab").then(m => ({ default: m.WhatsAppTab })));
const KanbanBoard = lazy(() => import("@/components/whatsapp/KanbanBoard").then(m => ({ default: m.KanbanBoard })));
const CustomerManager = lazy(() => import("@/components/whatsapp/CustomerManager").then(m => ({ default: m.CustomerManager })));
const AutoMessageLog = lazy(() => import("@/components/whatsapp/AutoMessageLog").then(m => ({ default: m.AutoMessageLog })));
const MaterialsTab = lazy(() => import("@/components/admin/MaterialsTab").then(m => ({ default: m.MaterialsTab })));
const NetworkPanel = lazy(() => import("@/components/admin/NetworkPanel").then(m => ({ default: m.NetworkPanel })));

const AdminContent = () => {
  const { privacyMode, togglePrivacy } = usePrivacyMode();
  const { loading, approved, userId, form, photoPreview, setPhotoPreview, handleFormChange, handleLogout, setForm } = useAdminAuth();
  const { saving, photoPreview: localPhotoPreview, handlePhotoChange, handleSave } = useConsultantForm(userId, form, setForm, setPhotoPreview);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"materiais" | "dashboard" | "dados" | "links" | "preview" | "whatsapp" | "crm" | "clientes" | "historico" | "rede">("dashboard");
  const [pendingChatPhone, setPendingChatPhone] = useState<string | null>(null);
  const [pendingChatMessage, setPendingChatMessage] = useState<string | undefined>(undefined);
  const [qrModal, setQrModal] = useState<{ url: string; label: string } | null>(null);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [periodDays, setPeriodDays] = useState(30);

  const { instanceName } = useWhatsApp(userId || "");
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([]);
  const { notifications, unreadCount, markAllRead, markRead, clearAll } = useNotifications(userId);

  const fetchCustomers = React.useCallback(async () => {
    if (!userId) return;
    try {
      const selectFields = "id, name, phone_whatsapp, electricity_bill_value, email, cpf, address_city, address_state, address_street, address_neighborhood, address_complement, address_number, cep, numero_instalacao, data_nascimento, status, created_at, distribuidora, registered_by_name, registered_by_igreen_id, media_consumo, desconto_cliente, andamento_igreen, devolutiva, observacao, igreen_code, data_cadastro, data_ativo, data_validado, status_financeiro, cashback, nivel_licenciado, assinatura_cliente, assinatura_igreen, link_assinatura";
      const allRows: Record<string, unknown>[] = [];
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
      setCustomers(allRows.map((c) => ({
        id: c.id, name: (c.name as string) || "Sem nome", phone_whatsapp: c.phone_whatsapp,
        electricity_bill_value: c.electricity_bill_value ?? undefined,
        email: c.email, cpf: c.cpf, address_city: c.address_city, address_state: c.address_state,
        address_street: c.address_street, address_neighborhood: c.address_neighborhood,
        address_complement: c.address_complement, address_number: c.address_number,
        cep: c.cep, numero_instalacao: c.numero_instalacao, data_nascimento: c.data_nascimento,
        status: c.status, created_at: c.created_at, distribuidora: c.distribuidora,
        registered_by_name: c.registered_by_name, registered_by_igreen_id: c.registered_by_igreen_id,
        media_consumo: c.media_consumo, desconto_cliente: c.desconto_cliente,
        andamento_igreen: c.andamento_igreen, devolutiva: c.devolutiva, observacao: c.observacao,
        igreen_code: c.igreen_code, data_cadastro: c.data_cadastro, data_ativo: c.data_ativo,
        data_validado: c.data_validado, status_financeiro: c.status_financeiro,
        cashback: c.cashback, nivel_licenciado: c.nivel_licenciado,
        assinatura_cliente: c.assinatura_cliente, assinatura_igreen: c.assinatura_igreen,
        link_assinatura: c.link_assinatura,
      })));
    } catch { /* silently handle */ }
  }, [userId]);

  React.useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const handleOpenChatFromCustomer = React.useCallback((phone: string, suggestedMessage?: string) => {
    setPendingChatPhone(phone);
    setPendingChatMessage(suggestedMessage);
    setActiveTab("whatsapp");
  }, []);

  const copyLink = (url: string) => { navigator.clipboard.writeText(url); toast({ title: "✅ Link copiado!" }); };

  const baseUrl = "igreen.institutodossonhos.com.br";
  const slug = form.license || "sua-licenca";

  const tabs = [
    { id: "dashboard" as const, label: "Dashboard", icon: BarChart3 },
    { id: "preview" as const, label: "Preview", icon: Monitor },
    { id: "crm" as const, label: "CRM", icon: LayoutGrid },
    { id: "clientes" as const, label: "Clientes", icon: Users },
    { id: "rede" as const, label: "Rede", icon: Network },
    { id: "whatsapp" as const, label: "WhatsApp", icon: MessageSquare },
    { id: "historico" as const, label: "Histórico", icon: History },
    { id: "links" as const, label: "Links", icon: LinkIcon },
    { id: "dados" as const, label: "Dados", icon: Settings },
    { id: "materiais" as const, label: "Materiais", icon: FolderDown },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <img src="/images/logo-colorida-igreen.png" alt="iGreen" className="w-32 animate-pulse" />
        <p className="text-muted-foreground">Carregando painel...</p>
      </div>
    );
  }

  if (!approved) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4">
        <img src="/images/logo-colorida-igreen.png" alt="iGreen" className="w-32" />
        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold font-heading text-foreground">Aguardando Aprovação</h1>
          <p className="text-muted-foreground text-sm max-w-md">Sua conta está sendo analisada pelo administrador. Você receberá acesso assim que for aprovado.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground gap-2">
          <LogOut className="w-4 h-4" /> Sair
        </Button>
      </div>
    );
  }

  const effectivePhotoPreview = localPhotoPreview || photoPreview;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/images/logo-colorida-igreen.png" alt="iGreen" className="w-20 sm:w-24" />
            <div className="hidden sm:block">
              <h1 className="text-base font-bold font-heading text-foreground leading-tight">Painel do Consultor</h1>
              <p className="text-xs text-muted-foreground sensitive-name">{form.name || "Bem-vindo"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={togglePrivacy}
              className={`relative p-2 rounded-lg transition-colors ${privacyMode ? 'text-primary bg-primary/20' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}
              aria-label={privacyMode ? "Mostrar dados sensíveis" : "Ocultar dados sensíveis"}
              title={privacyMode ? "Modo privacidade ATIVO — clique para desativar" : "Ocultar dados sensíveis para gravação"}
            >
              {privacyMode ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
            <button
              onClick={() => setAiChatOpen(true)}
              className="relative p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              aria-label="Assistente iGreen IA"
              title="Assistente iGreen IA"
            >
              <Sparkles className="h-5 w-5" />
            </button>
            <NotificationCenter
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkAllRead={markAllRead}
              onMarkRead={markRead}
              onClearAll={clearAll}
              onAction={(n) => {
                if (n.type === "new_lead" || n.type === "deal_moved") setActiveTab("crm");
                else if (n.type === "devolutiva" || n.type === "status_change" || n.type === "new_customer") setActiveTab("clientes");
              }}
            />
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground gap-2">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="border-b border-border bg-card/50">
        <div className="max-w-6xl mx-auto px-2 sm:px-6">
          <div className="flex overflow-x-auto no-scrollbar -mx-2 sm:mx-0" style={{ WebkitOverflowScrolling: 'touch' }}>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => {
                  if (tab.id === "materiais") {
                    window.open("https://drive.google.com/drive/folders/1KupNLRpZaJwHfgRUgbWV-cGYQenreSfu", "_blank", "noopener,noreferrer");
                    return;
                  }
                  setActiveTab(tab.id);
                }}
                  className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-3 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-all shrink-0 ${
                    isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}>
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label.length > 8 ? tab.label.slice(0, 6) + '…' : tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {activeTab === "dashboard" && userId && (
          <DashboardTab userId={userId} form={form} onFormUpdate={handleFormChange} periodDays={periodDays} onPeriodChange={setPeriodDays} />
        )}

        {activeTab === "dados" && (
          <DadosTab form={form} photoPreview={effectivePhotoPreview} saving={saving} onFormChange={handleFormChange} onPhotoChange={handlePhotoChange} onSave={handleSave} userId={userId || ""} />
        )}

        {activeTab === "links" && (
          <LinksTab slug={slug} baseUrl={baseUrl} onCopy={copyLink} onQrOpen={(url, label) => setQrModal({ url, label })} />
        )}

        <Suspense fallback={<div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>}>
          {activeTab === "materiais" && (
            <MaterialsTab />
          )}

          {userId && activeTab === "crm" && (
            <KanbanBoard consultantId={userId} instanceName={instanceName} />
          )}

          {userId && activeTab === "clientes" && (
            <CustomerManager
              customers={customers as never[]}
              consultantId={userId}
              onCustomersChange={fetchCustomers}
              instanceName={instanceName}
              onOpenChat={handleOpenChatFromCustomer}
            />
          )}

          {userId && activeTab === "rede" && (
            <NetworkPanel consultantId={userId} />
          )}

          {userId && activeTab === "whatsapp" && (
            <WhatsAppErrorBoundary>
              <WhatsAppTab
                key="whatsapp-tab"
                userId={userId}
                customers={customers as never[]}
                pendingChatPhone={pendingChatPhone}
                pendingChatMessage={pendingChatMessage}
                onPendingChatConsumed={() => { setPendingChatPhone(null); setPendingChatMessage(undefined); }}
              />
            </WhatsAppErrorBoundary>
          )}

          {userId && activeTab === "historico" && (
            <AutoMessageLog consultantId={userId} />
          )}
        </Suspense>

        {/* Preview Tab */}
        <div className="space-y-4" style={{ display: activeTab === "preview" ? "block" : "none" }}>
          <PreviewTab slug={slug} baseUrl={baseUrl} />
        </div>
      </main>

      {/* QR Code Modal */}
      {qrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setQrModal(null)}>
          <div className="bg-card rounded-2xl border border-border p-6 sm:p-8 max-w-sm w-full mx-4 space-y-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-foreground text-lg">QR Code</h3>
              <button onClick={() => setQrModal(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">{qrModal.label}</p>
            <div className="flex justify-center bg-white rounded-xl p-6">
              <QRCodeSVG id="qr-canvas" value={qrModal.url} size={200} level="H" includeMargin={false} />
            </div>
            <p className="text-xs text-muted-foreground text-center break-all">{qrModal.url}</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 gap-2 rounded-xl" onClick={() => copyLink(qrModal.url)}>
                <Copy className="w-4 h-4" /> Copiar link
              </Button>
              <Button className="flex-1 gap-2 rounded-xl" style={{ background: "var(--gradient-green)" }} onClick={() => {
                const svg = document.getElementById("qr-canvas");
                if (!svg) return;
                const svgData = new XMLSerializer().serializeToString(svg);
                const canvas = document.createElement("canvas");
                canvas.width = 600; canvas.height = 600;
                const ctx = canvas.getContext("2d")!;
                ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 600, 600);
                const img = new Image();
                img.onload = () => {
                  ctx.drawImage(img, 50, 50, 500, 500);
                  const a = document.createElement("a");
                  a.download = `qrcode-${qrModal.label.toLowerCase().replace(/[^a-z0-9]/g, "-")}.png`;
                  a.href = canvas.toDataURL("image/png"); a.click();
                };
                img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
              }}>
                <Download className="w-4 h-4" /> Baixar PNG
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* AI Chat Panel */}
      <AIChatPanel open={aiChatOpen} onClose={() => setAiChatOpen(false)} />
    </div>
  );
};

const Admin = () => (
  <PrivacyModeProvider>
    <AdminContent />
  </PrivacyModeProvider>
);

export default Admin;
