import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Phone, Mail, MapPin, FileText, Calendar, Download } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface Customer {
  id: string;
  name: string | null;
  cpf: string | null;
  rg: string | null;
  email: string | null;
  phone_whatsapp: string;
  phone_landline: string | null;
  data_nascimento: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  cep: string | null;
  distribuidora: string | null;
  numero_instalacao: string | null;
  electricity_bill_value: number | null;
  conversation_step: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function WhatsAppClientsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Buscar consultant_id do usuário logado
      const { data: consultant } = await supabase
        .from("consultants")
        .select("id")
        .eq("id", user.id)
        .single();

      if (!consultant) {
        toast.error("Consultor não encontrado");
        return;
      }

      // Buscar clientes do consultor
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("consultant_id", consultant.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setCustomers(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar clientes:", error);
      toast.error("Erro ao carregar clientes");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "Pendente", variant: "secondary" },
      portal_submitting: { label: "Enviando", variant: "default" },
      awaiting_otp: { label: "Aguardando OTP", variant: "default" },
      validating_otp: { label: "Validando OTP", variant: "default" },
      awaiting_signature: { label: "Aguardando Assinatura", variant: "default" },
      complete: { label: "Completo", variant: "default" },
      registered_igreen: { label: "Cadastrado iGreen", variant: "default" },
      worker_offline: { label: "Worker Offline", variant: "destructive" },
      automation_failed: { label: "Falha", variant: "destructive" },
    };

    const config = statusMap[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getStepLabel = (step: string) => {
    const stepMap: Record<string, string> = {
      welcome: "Boas-vindas",
      aguardando_conta: "Aguardando Conta",
      processando_ocr_conta: "Processando OCR Conta",
      confirmando_dados_conta: "Confirmando Dados Conta",
      ask_tipo_documento: "Tipo Documento",
      aguardando_doc_frente: "Aguardando Doc Frente",
      aguardando_doc_verso: "Aguardando Doc Verso",
      confirmando_dados_doc: "Confirmando Dados Doc",
      ask_name: "Perguntando Nome",
      ask_cpf: "Perguntando CPF",
      ask_rg: "Perguntando RG",
      ask_birth_date: "Perguntando Data Nasc",
      ask_phone_confirm: "Confirmando Telefone",
      ask_phone: "Perguntando Telefone",
      ask_email: "Perguntando Email",
      ask_cep: "Perguntando CEP",
      ask_number: "Perguntando Número",
      ask_complement: "Perguntando Complemento",
      ask_installation_number: "Perguntando Nº Instalação",
      ask_bill_value: "Perguntando Valor Conta",
      ask_finalizar: "Pronto para Finalizar",
      finalizando: "Finalizando",
      portal_submitting: "Enviando ao Portal",
      aguardando_otp: "Aguardando OTP",
      validando_otp: "Validando OTP",
      aguardando_assinatura: "Aguardando Assinatura",
      complete: "Completo",
    };

    return stepMap[step] || step;
  };

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.cpf?.includes(searchTerm) ||
      customer.phone_whatsapp?.includes(searchTerm) ||
      customer.email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = filterStatus === "all" || customer.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  const exportToCSV = () => {
    const headers = [
      "Nome", "CPF", "RG", "Email", "Telefone", "Data Nascimento",
      "Rua", "Número", "Complemento", "Bairro", "Cidade", "Estado", "CEP",
      "Distribuidora", "Nº Instalação", "Consumo Médio (kW)", "Valor Conta (R$)", "Desconto Cliente (%)",
      "Tipo Produto", "Código iGreen", "Andamento", "Devolutiva", "Status Financeiro",
      "Cashback", "Nível Licenciado", "Licenciado", "Código Licenciado",
      "Indicado Por", "Telefone Indicador",
      "Assinatura Cliente", "Assinatura iGreen", "Link Assinatura",
      "Data Cadastro", "Data Ativo", "Data Validado",
      "Status", "Step", "Observação",
    ];

    const rows = filteredCustomers.map((c: any) => [
      c.name || "", c.cpf || "", c.rg || "", c.email || "",
      c.phone_whatsapp || "", c.data_nascimento || "",
      c.address_street || "", c.address_number || "", c.address_complement || "",
      c.address_neighborhood || "", c.address_city || "", c.address_state || "", c.cep || "",
      c.distribuidora || "", c.numero_instalacao || "",
      c.media_consumo ?? "", c.electricity_bill_value ?? "", c.desconto_cliente ?? "",
      c.tipo_produto || "energia", c.igreen_code || "", c.andamento_igreen || "",
      c.devolutiva || "", c.status_financeiro || "",
      c.cashback || "", c.nivel_licenciado || "",
      c.registered_by_name || "", c.registered_by_igreen_id || "",
      c.customer_referred_by_name || "", c.customer_referred_by_phone || "",
      c.assinatura_cliente || "", c.assinatura_igreen || "", c.link_assinatura || "",
      c.data_cadastro || (c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : ""),
      c.data_ativo || "", c.data_validado || "",
      c.status || "", getStepLabel(c.conversation_step || ""), c.observacao || "",
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `clientes-whatsapp-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    toast.success("Exportado com sucesso!");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Clientes WhatsApp</h1>
          <p className="text-muted-foreground">Clientes cadastrados via automação WhatsApp</p>
        </div>
        <Button onClick={exportToCSV} variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{customers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {customers.filter((c) => c.status === "complete" || c.status === "registered_igreen").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {customers.filter((c) => c.status === "pending").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Falhas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {customers.filter((c) => c.status === "automation_failed" || c.status === "worker_offline").length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Buscar por nome, CPF, telefone ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border rounded-md bg-background"
            >
              <option value="all">Todos os Status</option>
              <option value="pending">Pendente</option>
              <option value="portal_submitting">Enviando</option>
              <option value="awaiting_otp">Aguardando OTP</option>
              <option value="complete">Completo</option>
              <option value="registered_igreen">Cadastrado iGreen</option>
              <option value="worker_offline">Worker Offline</option>
              <option value="automation_failed">Falha</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {filteredCustomers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Nenhum cliente encontrado</p>
            </CardContent>
          </Card>
        ) : (
          filteredCustomers.map((customer) => (
            <Card key={customer.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold">{customer.name || "Nome não informado"}</h3>
                      {getStatusBadge(customer.status)}
                      <Badge variant="outline">{getStepLabel(customer.conversation_step || "")}</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                      {customer.cpf && (
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <span className="text-muted-foreground">CPF:</span>
                          <span className="font-medium">{customer.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}</span>
                        </div>
                      )}
                      {customer.phone_whatsapp && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-muted-foreground" />
                          <span className="text-muted-foreground">WhatsApp:</span>
                          <span className="font-medium">{customer.phone_whatsapp}</span>
                        </div>
                      )}
                      {customer.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Email:</span>
                          <span className="font-medium">{customer.email}</span>
                        </div>
                      )}
                      {customer.address_city && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Cidade:</span>
                          <span className="font-medium">{customer.address_city}/{customer.address_state}</span>
                        </div>
                      )}
                      {customer.distribuidora && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Distribuidora:</span>
                          <span className="font-medium">{customer.distribuidora}</span>
                        </div>
                      )}
                      {customer.electricity_bill_value && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Valor Conta:</span>
                          <span className="font-medium">R$ {customer.electricity_bill_value.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Cadastro:</span>
                        <span className="font-medium">{format(new Date(customer.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                      </div>
                    </div>
                  </div>
                </div>
                {customer.address_street && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4 inline mr-1" />
                      {customer.address_street}, {customer.address_number}
                      {customer.address_complement && ` - ${customer.address_complement}`}
                      {customer.address_neighborhood && ` - ${customer.address_neighborhood}`}
                      {customer.cep && ` - CEP: ${customer.cep.replace(/(\d{5})(\d{3})/, "$1-$2")}`}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
