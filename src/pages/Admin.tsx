import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import { LogOut, BarChart3, LinkIcon, Settings, Monitor, MessageSquare, LayoutGrid, Users, Copy, Download, X, History, Sparkles, FolderDown, Network } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { WhatsAppTab } from "@/components/whatsapp/WhatsAppTab";
import { WhatsAppErrorBoundary } from "@/components/whatsapp/WhatsAppErrorBoundary";
import { KanbanBoard } from "@/components/whatsapp/KanbanBoard";
import { CustomerManager } from "@/components/whatsapp/CustomerManager";
import { AutoMessageLog } from "@/components/whatsapp/AutoMessageLog";
import { useWhatsApp } from "@/hooks/useWhatsApp";
import { QRCodeSVG } from "qrcode.react";
import { DashboardTab } from "@/components/admin/DashboardTab";
import { DadosTab } from "@/components/admin/DadosTab";
import { LinksTab } from "@/components/admin/LinksTab";
import { PreviewTab } from "@/components/admin/PreviewTab";
import { NotificationCenter } from "@/components/admin/NotificationCenter";
import { useNotifications } from "@/hooks/useNotifications";
import { AIChatPanel } from "@/components/admin/AIChatPanel";
import { MaterialsTab } from "@/components/admin/MaterialsTab";

function buildPendingConsultantDefaults(uid: string, email?: string | null) {
  const rawBase = (email?.split("@")[0] || `consultor-${uid.slice(0, 8)}`)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const slugBase = rawBase.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 18) || `consultor-${uid.slice(0, 6)}`;
  return {
    id: uid, name: email?.split("@")[0] || "Novo consultor",
    license: `${slugBase}-${uid.slice(0, 4)}`, phone: "", cadastro_url: "", approved: false,
  } satisfies Database["public"]["Tables"]["consultants"]["Insert"];
}

function normalizeLicenseValue(value: string, uid: string) {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || `consultor-${uid.slice(0, 8).toLowerCase()}`;
}

function buildFallbackLicense(value: string, uid: string) {
  return `${value.replace(/-+$/g, "")}-${uid.slice(0, 8).toLowerCase()}`;
}

const DEFAULT_CONSULTANT_FORM = {
  name: "", license: "", phone: "", cadastro_url: "", igreen_id: "",
  licenciada_cadastro_url: "", facebook_pixel_id: "", google_analytics_id: "",
  igreen_portal_email: "", igreen_portal_password: "",
};

const Admin = () => {
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"materiais" | "dashboard" | "dados" | "links" | "preview" | "whatsapp" | "crm" | "clientes" | "historico">("dashboard");
  const [pendingChatPhone, setPendingChatPhone] = useState<string | null>(null);
  const [pendingChatMessage, setPendingChatMessage] = useState<string | undefined>(undefined);
  const [qrModal, setQrModal] = useState<{ url: string; label: string } | null>(null);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...DEFAULT_CONSULTANT_FORM });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState(30);
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const loadingUidRef = useRef<string | null>(null);
  const activeUidRef = useRef<string | null>(null);
  const loadRequestIdRef = useRef(0);

  // WhatsApp connection for CRM/Clientes tabs
  const {
    instanceName,
    connectionStatus,
  } = useWhatsApp(userId || "");

  // Customers state (shared between Clientes tab and WhatsAppTab)
  const [customers, setCustomers] = useState<any[]>([]);

  // Notifications
  const { notifications, unreadCount, markAllRead, markRead, clearAll } = useNotifications(userId);

  const fetchCustomers = React.useCallback(async () => {
    if (!userId) return;
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
      setCustomers(allRows.map((c) => ({
        id: c.id, name: c.name || "Sem nome", phone_whatsapp: c.phone_whatsapp,
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

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const handleOpenChatFromCustomer = React.useCallback((phone: string, suggestedMessage?: string) => {
    setPendingChatPhone(phone);
    setPendingChatMessage(suggestedMessage);
    setActiveTab("whatsapp");
  }, []);

  const resetConsultantState = () => {
    setApproved(false);
    setForm({ ...DEFAULT_CONSULTANT_FORM });
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  useEffect(() => {
    const handleSession = (session: { user: { id: string } } | null) => {
      if (!session) {
        activeUidRef.current = null; loadingUidRef.current = null; loadRequestIdRef.current += 1;
        setUserId(null); resetConsultantState(); setLoading(false); navigate("/auth"); return;
      }
      const uid = session.user.id;
      if (loadingUidRef.current === uid || activeUidRef.current === uid) return;
      loadingUidRef.current = uid; activeUidRef.current = uid;
      const requestId = ++loadRequestIdRef.current;
      setLoading(true); resetConsultantState(); setUserId(uid);
      void loadConsultant(uid, requestId);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => { handleSession(session); });
    supabase.auth.getSession().then(({ data: { session } }) => { handleSession(session); });
    return () => { subscription.unsubscribe(); activeUidRef.current = null; loadingUidRef.current = null; loadRequestIdRef.current += 1; };
  }, [navigate]);

  const loadConsultant = async (uid: string, requestId: number) => {
    const isStale = () => activeUidRef.current !== uid || loadRequestIdRef.current !== requestId;
    const applyConsultantData = (consultant: any) => {
      if (isStale()) return;
      const id = consultant.igreen_id || "";
      setApproved(consultant.approved === true);
      setForm({
        ...DEFAULT_CONSULTANT_FORM, name: consultant.name || "", license: consultant.license || "",
        phone: consultant.phone || "", igreen_id: id,
        cadastro_url: id ? `https://digital.igreenenergy.com.br/?id=${id}&sendcontract=true` : consultant.cadastro_url || "",
        licenciada_cadastro_url: id ? `https://expansao.igreenenergy.com.br/?id=${id}&checkout=true` : consultant.licenciada_cadastro_url || "",
        facebook_pixel_id: consultant.facebook_pixel_id || "", google_analytics_id: consultant.google_analytics_id || "",
        igreen_portal_email: consultant.igreen_portal_email || "", igreen_portal_password: consultant.igreen_portal_password || "",
      });
      if (consultant.photo_url) setPhotoPreview(consultant.photo_url);
    };
    try {
      const { data, error } = await supabase.from("consultants").select("*").eq("id", uid).maybeSingle();
      if (isStale()) return; if (error) throw error;
      if (data) { applyConsultantData(data); return; }
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (isStale()) return; if (userError) throw userError;
      const pendingConsultant = buildPendingConsultantDefaults(uid, userData.user?.email);
      const { data: createdData, error: createError } = await supabase.from("consultants").upsert(pendingConsultant, { onConflict: "id" }).select("*").single();
      if (isStale()) return; if (createError) throw createError;
      applyConsultantData(createdData);
    } catch { if (isStale()) return; resetConsultantState(); }
    finally { if (isStale()) return; setLoading(false); loadingUidRef.current = null; }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); }
  };

  const handleFormChange = (updates: Record<string, string>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSaving(true);
    try {
      let photo_url: string | undefined;
      if (photoFile) {
        const ext = photoFile.name.split(".").pop();
        const path = `${userId}/photo.${ext}`;
        const { error: uploadError } = await supabase.storage.from("consultant-photos").upload(path, photoFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("consultant-photos").getPublicUrl(path);
        photo_url = `${urlData.publicUrl}?t=${Date.now()}`;
      }
      const normalizedLicense = normalizeLicenseValue(form.license, userId);
      const [existingResult, conflictingResult] = await Promise.all([
        supabase.from("consultants").select("id, license").eq("id", userId).maybeSingle(),
        supabase.from("consultants").select("id, license").eq("license", normalizedLicense).neq("id", userId).maybeSingle(),
      ]);
      if (existingResult.error) throw existingResult.error;
      if (conflictingResult.error) throw conflictingResult.error;
      const existingConsultant = existingResult.data;
      const conflictingConsultant = conflictingResult.data;
      let finalLicense = normalizedLicense;
      let licenseAdjusted = false;
      if (conflictingConsultant) {
        finalLicense = existingConsultant?.license && existingConsultant.license !== normalizedLicense
          ? existingConsultant.license : buildFallbackLicense(normalizedLicense, userId);
        licenseAdjusted = finalLicense !== normalizedLicense;
      }
      const consultantFields: Database["public"]["Tables"]["consultants"]["Update"] = {
        name: form.name, license: finalLicense, phone: form.phone.replace(/\D/g, ""),
        cadastro_url: form.cadastro_url, igreen_id: form.igreen_id || null,
        licenciada_cadastro_url: form.licenciada_cadastro_url || null,
        facebook_pixel_id: form.facebook_pixel_id || null, google_analytics_id: form.google_analytics_id || null,
        igreen_portal_email: form.igreen_portal_email || null, igreen_portal_password: form.igreen_portal_password || null,
      };
      if (photo_url) consultantFields.photo_url = photo_url;
      const saveConsultant = async (licenseToSave: string) => {
        const fieldsToSave = { ...consultantFields, license: licenseToSave };
        if (existingConsultant) {
          return supabase.from("consultants").update(fieldsToSave).eq("id", userId).select("*").single();
        }
        const insertPayload: Database["public"]["Tables"]["consultants"]["Insert"] = {
          id: userId, name: form.name, license: licenseToSave, phone: form.phone.replace(/\D/g, ""),
          cadastro_url: form.cadastro_url, igreen_id: form.igreen_id || null,
          licenciada_cadastro_url: form.licenciada_cadastro_url || null,
          facebook_pixel_id: form.facebook_pixel_id || null, google_analytics_id: form.google_analytics_id || null,
          igreen_portal_email: form.igreen_portal_email || null, igreen_portal_password: form.igreen_portal_password || null,
          ...(photo_url ? { photo_url } : {}),
        };
        return supabase.from("consultants").insert(insertPayload).select("*").single();
      };
      let { data: savedConsultant, error } = await saveConsultant(finalLicense);
      if (error?.code === "23505" && `${error.message || ""}`.includes("consultants_license_key")) {
        finalLicense = buildFallbackLicense(normalizedLicense, userId);
        licenseAdjusted = true;
        ({ data: savedConsultant, error } = await saveConsultant(finalLicense));
      }
      if (error) throw error;
      setForm((prev) => ({ ...prev, license: savedConsultant?.license || finalLicense }));
      if (savedConsultant?.photo_url) { setPhotoPreview(savedConsultant.photo_url); setPhotoFile(null); }
      toast({ title: "✅ Dados salvos com sucesso!", ...(licenseAdjusted ? { description: `A licença foi ajustada automaticamente para ${savedConsultant?.license || finalLicense}.` } : {}) });
    } catch (error: any) {
      const msg = error?.message || error?.error_description || (typeof error === "string" ? error : JSON.stringify(error));
      toast({ title: "Erro ao salvar", description: msg || "Erro desconhecido", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); navigate("/auth"); };
  const copyLink = (url: string) => { navigator.clipboard.writeText(url); toast({ title: "✅ Link copiado!" }); };

  const baseUrl = "igreen.institutodossonhos.com.br";
  const slug = form.license || "sua-licenca";

  const tabs = [
    { id: "dashboard" as const, label: "Dashboard", icon: BarChart3 },
    { id: "preview" as const, label: "Preview", icon: Monitor },
    { id: "crm" as const, label: "CRM", icon: LayoutGrid },
    { id: "clientes" as const, label: "Clientes", icon: Users },
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/images/logo-colorida-igreen.png" alt="iGreen" className="w-20 sm:w-24" />
            <div className="hidden sm:block">
              <h1 className="text-base font-bold font-heading text-foreground leading-tight">Painel do Consultor</h1>
              <p className="text-xs text-muted-foreground">{form.name || "Bem-vindo"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* AI Chat button */}
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

        {activeTab === "materiais" && (
          <MaterialsTab />
        )}

        {activeTab === "dados" && (
          <DadosTab form={form} photoPreview={photoPreview} saving={saving} onFormChange={handleFormChange} onPhotoChange={handlePhotoChange} onSave={handleSave} userId={userId || ""} />
        )}

        {activeTab === "links" && (
          <LinksTab slug={slug} baseUrl={baseUrl} onCopy={copyLink} onQrOpen={(url, label) => setQrModal({ url, label })} />
        )}

        {userId && activeTab === "crm" && (
          <KanbanBoard consultantId={userId} instanceName={instanceName} />
        )}

        {userId && activeTab === "clientes" && (
          <CustomerManager
            customers={customers}
            consultantId={userId}
            onCustomersChange={fetchCustomers}
            instanceName={instanceName}
            onOpenChat={handleOpenChatFromCustomer}
          />
        )}

        {userId && activeTab === "whatsapp" && (
          <WhatsAppErrorBoundary>
            <WhatsAppTab
              key="whatsapp-tab"
              userId={userId}
              customers={customers}
              pendingChatPhone={pendingChatPhone}
              pendingChatMessage={pendingChatMessage}
              onPendingChatConsumed={() => { setPendingChatPhone(null); setPendingChatMessage(undefined); }}
            />
          </WhatsAppErrorBoundary>
        )}

        {userId && activeTab === "historico" && (
          <AutoMessageLog consultantId={userId} />
        )}

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

export default Admin;
