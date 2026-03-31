import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://api-voffice.igreenenergy.com.br/v1";

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

function safeStr(val: unknown): string | null {
  if (val == null || val === "") return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

function safeNum(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = parseFloat(String(val).replace(",", ".").replace("%", ""));
  return isNaN(n) ? null : n;
}

function get(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] != null && obj[key] !== "") return obj[key];
    const found = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
    if (found && obj[found] != null && obj[found] !== "") return obj[found];
  }
  return null;
}

function buildRecord(c: Record<string, unknown>): Record<string, unknown> | null {
  const phoneRaw = get(c, "celular", "telefone", "phone", "whatsapp", "Celular", "Telefone");
  let phone = normalizePhone(String(phoneRaw || ""));

  if (!phone || phone.length < 12) {
    const codigo = safeStr(get(c, "codigo", "Codigo", "Código", "codigoIgreen", "id"));
    const instalacao = safeStr(get(c, "numeroInstalacao", "numero_instalacao", "Instalação"));
    const fallbackId = codigo || instalacao;
    if (fallbackId) phone = `sem_celular_${fallbackId.replace(/\D/g, "")}`;
    else return null;
  }

  const record: Record<string, unknown> = { phone_whatsapp: phone };

  const name = safeStr(get(c, "nomeCliente", "nome", "Nome", "name", "Nome do Cliente"));
  if (name) record.name = name;

  const statusRaw = safeStr(get(c, "andamento", "Andamento", "status"));
  record.status = mapStatus(statusRaw || undefined);

  const cpf = safeStr(get(c, "cpf", "CPF", "documento", "Documento"));
  if (cpf) record.cpf = cpf.replace(/\D/g, "");

  const email = safeStr(get(c, "email", "Email", "E-mail"));
  if (email) record.email = email;

  const city = safeStr(get(c, "cidade", "Cidade", "municipio"));
  if (city) record.address_city = city;

  const state = safeStr(get(c, "uf", "UF", "estado"));
  if (state) record.address_state = state.toUpperCase();

  const dist = safeStr(get(c, "distribuidora", "Distribuidora"));
  if (dist) record.distribuidora = dist;

  const andamento = safeStr(get(c, "andamento", "Andamento"));
  if (andamento) record.andamento_igreen = andamento;

  const devolutiva = safeStr(get(c, "devolutiva", "Devolutiva"));
  if (devolutiva) record.devolutiva = devolutiva;

  const obs = safeStr(get(c, "observacao", "Observação", "obs"));
  if (obs) record.observacao = obs;

  const icode = safeStr(get(c, "codigoIgreen", "codigo", "Código"));
  if (icode) record.igreen_code = icode;

  const consumo = safeNum(get(c, "consumoMedio", "consumo_medio", "Consumo Médio"));
  if (consumo != null) record.media_consumo = consumo;

  const desc = safeNum(get(c, "descontoCliente", "desconto_cliente", "Desconto"));
  if (desc != null) record.desconto_cliente = desc;

  const dCad = safeStr(get(c, "dataCadastro", "data_cadastro", "Data Cadastro"));
  if (dCad) record.data_cadastro = dCad;

  const dAtivo = safeStr(get(c, "dataAtivo", "data_ativo", "Data Ativo"));
  if (dAtivo) record.data_ativo = dAtivo;

  const dVal = safeStr(get(c, "dataValidado", "data_validado", "Data Validado"));
  if (dVal) record.data_validado = dVal;

  const stFin = safeStr(get(c, "statusFinanceiro", "status_financeiro"));
  if (stFin) record.status_financeiro = stFin;

  const cash = safeStr(get(c, "cashback", "Cashback"));
  if (cash) record.cashback = cash;

  const nivel = safeStr(get(c, "nivel", "Nível"));
  if (nivel) record.nivel_licenciado = nivel;

  const asCl = safeStr(get(c, "assinaturaCliente", "assinatura_cliente"));
  if (asCl) record.assinatura_cliente = asCl;

  const asIg = safeStr(get(c, "assinaturaIgreen", "assinatura_igreen"));
  if (asIg) record.assinatura_igreen = asIg;

  const linkAs = safeStr(get(c, "linkAssinatura", "link_assinatura"));
  if (linkAs) record.link_assinatura = linkAs;

  const lic = safeStr(get(c, "licenciado", "Licenciado", "nomeLicenciado"));
  if (lic) record.registered_by_name = lic;

  const codLic = safeStr(get(c, "codigoLicenciado", "codigo_licenciado"));
  if (codLic) record.registered_by_igreen_id = codLic;

  const inst = safeStr(get(c, "numeroInstalacao", "numero_instalacao", "Instalação"));
  if (inst) record.numero_instalacao = inst;

  const nasc = safeStr(get(c, "dataNascimento", "data_nascimento"));
  if (nasc) record.data_nascimento = nasc.substring(0, 10);

  return record;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get credentials from request body (per-consultant) or fallback to env vars
    let portalEmail = Deno.env.get("IGREEN_PORTAL_EMAIL");
    let portalPassword = Deno.env.get("IGREEN_PORTAL_PASSWORD");
    let consultantId: string | null = null;

    try {
      const body = await req.json();
      if (body.portal_email) portalEmail = body.portal_email;
      if (body.portal_password) portalPassword = body.portal_password;
      if (body.consultant_id) consultantId = body.consultant_id;
    } catch (_) { /* no body or invalid json */ }

    if (!portalEmail || !portalPassword) {
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais do portal iGreen não configuradas. Preencha na aba Dados." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // If consultant_id not provided, try to resolve from portal email
    if (!consultantId && portalEmail) {
      const { data: consultant } = await supabase
        .from("consultants")
        .select("id")
        .eq("igreen_portal_email", portalEmail)
        .maybeSingle();
      if (consultant?.id) {
        consultantId = consultant.id;
        console.log(`Resolved consultant_id from portal email: ${consultantId}`);
      }
    }

    // Step 1: Login to iGreen API
    console.log("Logging in to iGreen API...");
    console.log("Email used:", portalEmail);
    const browserHeaders = {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Origin": "https://escritorio.igreenenergy.com.br",
      "Referer": "https://escritorio.igreenenergy.com.br/",
    };
    const loginRes = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: browserHeaders,
      body: JSON.stringify({ email: portalEmail, password: portalPassword }),
    });

    if (!loginRes.ok) {
      const errText = await loginRes.text();
      console.error(`Login failed: ${loginRes.status} - ${errText}`);

      // Parse Firebase error for a friendlier message
      let friendlyError = "Login no portal iGreen falhou. Verifique email e senha informados na aba Dados.";
      try {
        const errJson = JSON.parse(errText);
        const fbMsg = errJson?.error?.message || "";
        if (fbMsg.includes("wrong-password")) {
          friendlyError = `Senha incorreta para o email ${portalEmail}. Verifique a senha do portal iGreen na aba Dados.`;
        } else if (fbMsg.includes("user-not-found")) {
          friendlyError = `Email ${portalEmail} não encontrado no portal iGreen. Verifique o email na aba Dados.`;
        } else if (fbMsg.includes("too-many-requests")) {
          friendlyError = "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.";
        }
      } catch { /* not JSON */ }

      return new Response(
        JSON.stringify({ success: false, error: friendlyError }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const loginData = await loginRes.json();
    const token = loginData.accessToken || loginData.token || loginData.access_token;
    if (!token) {
      console.error("No token in login response:", Object.keys(loginData));
      return new Response(
        JSON.stringify({ success: false, error: "Login no portal iGreen retornou sem token de acesso." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log("Login successful, token obtained.");

    const authHeaders = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Accept": "application/json, text/plain, */*",
      "Origin": "https://escritorio.igreenenergy.com.br",
      "Referer": "https://escritorio.igreenenergy.com.br/",
    };

    // Step 2: Get consultant info to get the ID
    console.log("Fetching consultant info...");
    const consultantRes = await fetch(`${API_BASE}/consultant`, { headers: authHeaders });
    if (!consultantRes.ok) {
      const errText = await consultantRes.text();
      console.error(`Consultant fetch failed: ${consultantRes.status} - ${errText}`);
      return new Response(
        JSON.stringify({ success: false, error: "Não foi possível obter dados do consultor." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const consultantData = await consultantRes.json();
    console.log("Consultant API response keys:", JSON.stringify(Object.keys(consultantData)));
    console.log("Consultant API response (truncated):", JSON.stringify(consultantData).substring(0, 500));
    
    // Try multiple possible paths for the consultant ID
    const consultorId = consultantData.idconsultor
      || consultantData.id 
      || consultantData.data?.id 
      || consultantData.consultant?.id 
      || consultantData.user?.id
      || consultantData.consultor?.id
      || consultantData._id
      || consultantData.data?._id
      || consultantData.uid
      || consultantData.userId
      || consultantData.user_id;
    
    console.log(`Consultant ID: ${consultorId}`);
    
    if (!consultorId) {
      console.error("Could not extract consultant ID from response:", JSON.stringify(consultantData).substring(0, 1000));
      return new Response(
        JSON.stringify({ success: false, error: "ID do consultor não encontrado na resposta da API iGreen. Verifique suas credenciais.", debug_keys: Object.keys(consultantData) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Fetch ALL customer data (paginated)
    console.log("Fetching customer data...");
    let allCustomers: Record<string, unknown>[] = [];
    let page = 1;
    const pageSize = 500;
    let hasMore = true;

    while (hasMore) {
      const url = `${API_BASE}/customer-map/${consultorId}?page=${page}&pageSize=${pageSize}`;
      console.log(`Fetching page ${page}...`);
      const dataRes = await fetch(url, { headers: authHeaders });

      if (!dataRes.ok) {
        const errText = await dataRes.text();
        console.error(`Data fetch failed on page ${page}: ${dataRes.status} - ${errText}`);
        break;
      }

      const responseData = await dataRes.json();
      const customers = Array.isArray(responseData) ? responseData : (responseData.data || []);
      const total = responseData.total || customers.length;

      console.log(`Page ${page}: got ${customers.length} customers (total: ${total})`);
      allCustomers = allCustomers.concat(customers);

      if (customers.length < pageSize || allCustomers.length >= total) {
        hasMore = false;
      } else {
        page++;
      }
    }

    if (allCustomers.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Nenhum cliente encontrado no portal.", login_ok: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Total customers fetched: ${allCustomers.length}`);
    if (allCustomers.length > 0) {
      console.log(`Sample fields: ${Object.keys(allCustomers[0]).join(", ")}`);
    }

    // Step 4: Build records and upsert
    const seenPhones = new Set<string>();
    const records: Record<string, unknown>[] = [];

    for (const c of allCustomers) {
      const record = buildRecord(c);
      if (!record || !record.phone_whatsapp) continue;
      const phone = String(record.phone_whatsapp);
      if (seenPhones.has(phone)) continue;
      seenPhones.add(phone);
      if (consultantId) record.consultant_id = consultantId;
      records.push(record);
    }

    console.log(`Processing ${records.length} unique customer records...`);

    let updatedCount = 0;
    let errorCount = 0;
    const BATCH_SIZE = 100;

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

    // Step 5: Save last sync timestamp
    const syncTimestamp = new Date().toISOString();
    await supabase
      .from("settings")
      .upsert({ key: "last_igreen_sync", value: syncTimestamp }, { onConflict: "key" });

    const result = {
      success: true,
      total_from_portal: allCustomers.length,
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
