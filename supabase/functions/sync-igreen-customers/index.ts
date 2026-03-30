import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PORTAL_BASE = "https://escritorio.igreenenergy.com.br";

interface PortalCustomer {
  id?: string;
  nome?: string;
  celular?: string;
  telefone?: string;
  cpf?: string;
  email?: string;
  cidade?: string;
  uf?: string;
  distribuidora?: string;
  andamento?: string;
  devolutiva?: string;
  observacao?: string;
  codigo?: string;
  consumo_medio?: number;
  desconto_cliente?: number;
  data_cadastro?: string;
  data_ativo?: string;
  data_validado?: string;
  status_financeiro?: string;
  cashback?: string;
  nivel?: string;
  assinatura_cliente?: string;
  assinatura_igreen?: string;
  link_assinatura?: string;
  licenciado?: string;
  codigo_licenciado?: string;
  numero_instalacao?: string;
  data_nascimento?: string;
  [key: string]: unknown;
}

function normalizePhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 11) return `55${digits}`;
  if (digits.length === 10) return `55${digits}`;
  if (digits.length >= 12) return digits;
  return "";
}

function mapStatus(andamento: string | undefined): string {
  if (!andamento) return "pending";
  const lower = andamento.toLowerCase().trim();
  if (lower === "validado" || lower === "aprovado" || lower === "ativo") return "approved";
  if (lower === "devolutiva" || lower === "reprovado" || lower === "cancelado") return "rejected";
  if (lower.includes("falta assinatura")) return "pending";
  if (lower.includes("aguardando")) return "pending";
  if (lower === "pendente" || lower === "em análise" || lower === "em analise") return "pending";
  if (lower === "lead" || lower === "novo") return "lead";
  if (lower === "dados completos" || lower === "data_complete") return "data_complete";
  if (lower === "registrado" || lower === "registered_igreen") return "registered_igreen";
  if (lower === "contrato enviado" || lower === "contract_sent") return "contract_sent";
  return "pending";
}

function getField(obj: PortalCustomer, ...keys: string[]): string | null {
  for (const key of keys) {
    const val = obj[key];
    if (val != null && String(val).trim() !== "") return String(val).trim();
  }
  return null;
}

function getNumber(obj: PortalCustomer, ...keys: string[]): number | null {
  const s = getField(obj, ...keys);
  if (!s) return null;
  const n = parseFloat(s.replace(",", ".").replace("%", ""));
  return isNaN(n) ? null : n;
}

function buildCustomerRecord(c: PortalCustomer) {
  const phone = normalizePhone(
    getField(c, "celular", "telefone", "phone", "whatsapp", "Celular", "Telefone") || ""
  );

  if (!phone || phone.length < 12) {
    const fallbackId = getField(c, "codigo", "Codigo", "Código", "id", "numero_instalacao");
    if (fallbackId) return { phone_whatsapp: `sem_celular_${fallbackId.replace(/\D/g, "")}` };
    return null;
  }

  const record: Record<string, unknown> = {
    phone_whatsapp: phone,
    name: getField(c, "nome", "Nome", "nome_cliente", "Nome do Cliente", "name"),
    status: mapStatus(getField(c, "andamento", "Andamento", "status") || undefined),
    cpf: getField(c, "cpf", "CPF", "documento", "Documento")?.replace(/\D/g, "") || null,
    email: getField(c, "email", "Email", "E-mail"),
    address_city: getField(c, "cidade", "Cidade", "municipio", "Município"),
    address_state: getField(c, "uf", "UF", "estado", "Estado")?.toUpperCase() || null,
    distribuidora: getField(c, "distribuidora", "Distribuidora"),
    andamento_igreen: getField(c, "andamento", "Andamento"),
    devolutiva: getField(c, "devolutiva", "Devolutiva"),
    observacao: getField(c, "observacao", "Observação", "Observacao", "obs"),
    igreen_code: getField(c, "codigo", "Codigo", "Código"),
    media_consumo: getNumber(c, "consumo_medio", "Consumo Médio", "consumo"),
    desconto_cliente: getNumber(c, "desconto_cliente", "Desconto Cliente", "desconto"),
    data_cadastro: getField(c, "data_cadastro", "Data Cadastro"),
    data_ativo: getField(c, "data_ativo", "Data Ativo"),
    data_validado: getField(c, "data_validado", "Data Validado"),
    status_financeiro: getField(c, "status_financeiro", "Status Financeiro"),
    cashback: getField(c, "cashback", "Cashback"),
    nivel_licenciado: getField(c, "nivel", "Nível", "Nivel"),
    assinatura_cliente: getField(c, "assinatura_cliente", "Assinatura Cliente"),
    assinatura_igreen: getField(c, "assinatura_igreen", "Assinatura iGreen"),
    link_assinatura: getField(c, "link_assinatura", "Link Assinatura"),
    registered_by_name: getField(c, "licenciado", "Licenciado"),
    registered_by_igreen_id: getField(c, "codigo_licenciado", "Código Licenciado"),
    numero_instalacao: getField(c, "numero_instalacao", "Instalação", "Nº Instalação"),
    data_nascimento: getField(c, "data_nascimento", "Data Nascimento"),
  };

  // Remove null values
  for (const key of Object.keys(record)) {
    if (record[key] === null || record[key] === undefined) delete record[key];
  }

  return record;
}

// Try multiple possible API paths for the iGreen portal
async function tryLoginEndpoints(email: string, password: string): Promise<{ token: string; cookies: string } | null> {
  const loginPaths = [
    "/api/auth/login",
    "/api/login",
    "/api/v1/auth/login",
    "/auth/login",
    "/api/sessions",
    "/api/auth/signin",
  ];

  for (const path of loginPaths) {
    try {
      console.log(`Trying login at ${PORTAL_BASE}${path}`);
      const res = await fetch(`${PORTAL_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        redirect: "manual",
      });

      const cookies = res.headers.get("set-cookie") || "";
      
      if (res.ok) {
        const body = await res.json();
        const token = body.token || body.access_token || body.accessToken || body.data?.token || body.data?.access_token || "";
        console.log(`Login successful at ${path}, token present: ${!!token}`);
        return { token, cookies };
      }
      
      // Consume body to prevent leak
      await res.text();
    } catch (e) {
      console.log(`Login attempt at ${path} failed: ${e}`);
    }
  }

  return null;
}

async function fetchCustomerData(token: string, cookies: string): Promise<PortalCustomer[]> {
  const dataPaths = [
    "/api/customers",
    "/api/clientes",
    "/api/v1/customers",
    "/api/v1/clientes",
    "/api/mapa-clientes",
    "/api/dashboard/customers",
    "/api/reports/customers",
  ];

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (cookies) headers["Cookie"] = cookies;

  for (const path of dataPaths) {
    try {
      console.log(`Trying data fetch at ${PORTAL_BASE}${path}`);
      const res = await fetch(`${PORTAL_BASE}${path}`, { headers, redirect: "manual" });
      
      if (res.ok) {
        const body = await res.json();
        // The data might be nested
        const customers = body.data || body.customers || body.clientes || body.results || body;
        if (Array.isArray(customers) && customers.length > 0) {
          console.log(`Found ${customers.length} customers at ${path}`);
          return customers;
        }
      }
      await res.text();
    } catch (e) {
      console.log(`Data fetch at ${path} failed: ${e}`);
    }
  }

  // Try paginated endpoints
  for (const path of dataPaths) {
    try {
      const res = await fetch(`${PORTAL_BASE}${path}?page=1&per_page=1000&limit=1000`, { headers, redirect: "manual" });
      if (res.ok) {
        const body = await res.json();
        const customers = body.data || body.customers || body.clientes || body.results || body;
        if (Array.isArray(customers) && customers.length > 0) {
          console.log(`Found ${customers.length} customers at ${path} (paginated)`);
          return customers;
        }
      }
      await res.text();
    } catch (e) {
      // skip
    }
  }

  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const portalEmail = Deno.env.get("IGREEN_PORTAL_EMAIL");
    const portalPassword = Deno.env.get("IGREEN_PORTAL_PASSWORD");

    if (!portalEmail || !portalPassword) {
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais do portal iGreen não configuradas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Optional: get consultant_id from request body (for manual sync)
    let consultantId: string | null = null;
    try {
      const body = await req.json();
      consultantId = body.consultant_id || null;
    } catch {
      // No body (cron job call)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Login to portal
    console.log("Starting iGreen portal sync...");
    const loginResult = await tryLoginEndpoints(portalEmail, portalPassword);

    if (!loginResult) {
      console.error("All login attempts failed");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Não foi possível fazer login no portal iGreen. Verifique email e senha.",
          details: "Nenhum endpoint de login respondeu com sucesso. O portal pode ter mudado sua API."
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Fetch customer data
    const portalCustomers = await fetchCustomerData(loginResult.token, loginResult.cookies);

    if (portalCustomers.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Login realizado mas nenhum cliente encontrado. A estrutura da API pode ter mudado.",
          login_ok: true
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Build records and upsert
    let newCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    const BATCH_SIZE = 100;

    const records = portalCustomers
      .map(buildCustomerRecord)
      .filter((r): r is Record<string, unknown> => r !== null && !!r.phone_whatsapp);

    console.log(`Processing ${records.length} customer records...`);

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      
      const { data, error } = await supabase
        .from("customers")
        .upsert(batch, { onConflict: "phone_whatsapp", ignoreDuplicates: false })
        .select("id");

      if (error) {
        console.error(`Batch upsert error at ${i}:`, error);
        errorCount += batch.length;
      } else {
        updatedCount += (data?.length || 0);
      }
    }

    // Step 4: Save last sync timestamp
    const syncTimestamp = new Date().toISOString();
    await supabase
      .from("settings")
      .upsert({ key: "last_igreen_sync", value: syncTimestamp }, { onConflict: "key" });

    const result = {
      success: true,
      total_from_portal: portalCustomers.length,
      processed: records.length,
      updated: updatedCount,
      errors: errorCount,
      synced_at: syncTimestamp,
    };

    console.log("Sync completed:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
