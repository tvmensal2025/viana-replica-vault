import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import * as XLSX from "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PORTAL_BASE = "https://escritorio.igreenenergy.com.br";

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

function safeString(val: unknown): string | null {
  if (val == null || val === "" || val === undefined) return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

function safeNumber(val: unknown): number | null {
  if (val == null || val === "" || val === undefined) return null;
  const n = parseFloat(String(val).replace(",", ".").replace("%", ""));
  return isNaN(n) ? null : n;
}

function findColumnValue(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] != null && row[key] !== "") return row[key];
    const found = Object.keys(row).find((k) => k.toLowerCase().trim() === key.toLowerCase().trim());
    if (found && row[found] != null && row[found] !== "") return row[found];
  }
  return null;
}

function buildCustomerData(row: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  const mediaConsumo = safeNumber(findColumnValue(row, "Consumo Médio", "Consumo Medio", "Consumo", "consumo"));
  if (mediaConsumo != null) data.media_consumo = mediaConsumo;

  const cpf = safeString(findColumnValue(row, "Documento", "CPF", "cpf", "CNPJ"));
  if (cpf) data.cpf = cpf.replace(/\D/g, "");

  const instalacao = safeString(findColumnValue(row, "Instalação", "Instalacao", "Nº Instalação", "N Instalacao"));
  if (instalacao) data.numero_instalacao = instalacao;

  const cidade = safeString(findColumnValue(row, "Cidade", "cidade", "Municipio", "Município"));
  if (cidade) data.address_city = cidade;

  const uf = safeString(findColumnValue(row, "UF", "uf", "Estado", "estado"));
  if (uf) data.address_state = (uf as string).toUpperCase();

  const distribuidora = safeString(findColumnValue(row, "Distribuidora", "distribuidora"));
  if (distribuidora) data.distribuidora = distribuidora;

  const email = safeString(findColumnValue(row, "E-mail", "Email", "email", "EMAIL"));
  if (email) data.email = email;

  const desconto = safeNumber(findColumnValue(row, "Desconto Cliente", "Desconto", "desconto"));
  if (desconto != null) data.desconto_cliente = desconto;

  const nascimento = safeString(findColumnValue(row, "Data Nascimento", "Nascimento", "data_nascimento"));
  if (nascimento) data.data_nascimento = nascimento;

  const licenciado = safeString(findColumnValue(row, "Licenciado", "licenciado", "LICENCIADO", "Nome Licenciado", "Nome do Licenciado", "Consultor", "consultor", "Representante", "representante"));
  if (licenciado) data.registered_by_name = licenciado;

  const codigoLic = safeString(findColumnValue(row, "Código Licenciado", "Codigo Licenciado", "código licenciado", "CÓDIGO LICENCIADO", "Cod Licenciado", "Cod. Licenciado", "ID Licenciado", "Cód Licenciado", "Cód. Licenciado"));
  if (codigoLic) data.registered_by_igreen_id = codigoLic;

  const andamento = safeString(findColumnValue(row, "Andamento", "andamento"));
  if (andamento) data.andamento_igreen = andamento;

  const devolutiva = safeString(findColumnValue(row, "Devolutiva", "devolutiva"));
  if (devolutiva) data.devolutiva = devolutiva;

  const observacao = safeString(findColumnValue(row, "Observação", "Observacao", "observação", "observacao", "Obs"));
  if (observacao) data.observacao = observacao;

  const igreenCode = safeString(findColumnValue(row, "Código", "Codigo", "código", "codigo"));
  if (igreenCode) data.igreen_code = igreenCode;

  const dataCadastro = safeString(findColumnValue(row, "Data Cadastro", "data_cadastro"));
  if (dataCadastro) data.data_cadastro = dataCadastro;

  const dataAtivo = safeString(findColumnValue(row, "Data Ativo", "data_ativo"));
  if (dataAtivo) data.data_ativo = dataAtivo;

  const dataValidado = safeString(findColumnValue(row, "Data Validado", "data_validado"));
  if (dataValidado) data.data_validado = dataValidado;

  const statusFinanceiro = safeString(findColumnValue(row, "Status Financeiro", "status_financeiro"));
  if (statusFinanceiro) data.status_financeiro = statusFinanceiro;

  const cashbackVal = safeString(findColumnValue(row, "Cashback", "cashback"));
  if (cashbackVal) data.cashback = cashbackVal;

  const nivel = safeString(findColumnValue(row, "Nível", "Nivel", "nível", "nivel"));
  if (nivel) data.nivel_licenciado = nivel;

  const assinaturaCliente = safeString(findColumnValue(row, "Assinatura Cliente", "assinatura_cliente"));
  if (assinaturaCliente) data.assinatura_cliente = assinaturaCliente;

  const assinaturaIgreen = safeString(findColumnValue(row, "Assinatura iGreen", "Assinatura Igreen", "assinatura_igreen"));
  if (assinaturaIgreen) data.assinatura_igreen = assinaturaIgreen;

  const linkAssinatura = safeString(findColumnValue(row, "Link Assinatura", "link_assinatura"));
  if (linkAssinatura) data.link_assinatura = linkAssinatura;

  return data;
}

// Try login with multiple endpoint patterns
async function tryLogin(email: string, password: string): Promise<{ token: string; cookies: string } | null> {
  const loginPaths = [
    "/api/auth/login",
    "/api/login",
    "/api/v1/auth/login",
    "/auth/login",
    "/api/sessions",
    "/api/auth/signin",
    "/api/v1/login",
    "/api/authenticate",
  ];

  // Also try different body formats
  const bodyFormats = [
    { email, password },
    { email, senha: password },
    { login: email, password },
    { login: email, senha: password },
    { username: email, password },
  ];

  for (const path of loginPaths) {
    for (const body of bodyFormats) {
      try {
        console.log(`Trying login at ${PORTAL_BASE}${path} with keys: ${Object.keys(body).join(",")}`);
        const res = await fetch(`${PORTAL_BASE}${path}`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Origin": PORTAL_BASE,
            "Referer": `${PORTAL_BASE}/login`,
          },
          body: JSON.stringify(body),
          redirect: "manual",
        });

        const cookies = res.headers.get("set-cookie") || "";
        const responseText = await res.text();
        
        console.log(`Response from ${path}: status=${res.status}, body length=${responseText.length}`);

        if (res.ok || res.status === 200 || res.status === 201) {
          try {
            const parsed = JSON.parse(responseText);
            const token = parsed.token || parsed.access_token || parsed.accessToken || 
                         parsed.data?.token || parsed.data?.access_token || 
                         parsed.data?.accessToken || parsed.jwt || parsed.data?.jwt || "";
            console.log(`Login successful at ${path}, token present: ${!!token}, keys: ${Object.keys(parsed).join(",")}`);
            return { token, cookies };
          } catch {
            console.log(`Login at ${path} returned non-JSON: ${responseText.substring(0, 200)}`);
          }
        }
      } catch (e) {
        console.log(`Login attempt at ${path} failed: ${e}`);
      }
    }
  }

  return null;
}

// Try to download Excel export from portal
async function tryDownloadExcel(token: string, cookies: string): Promise<Uint8Array | null> {
  const exportPaths = [
    "/api/customers/export",
    "/api/clientes/export",
    "/api/clientes/exportar",
    "/api/export/customers",
    "/api/export/clientes",
    "/api/v1/customers/export",
    "/api/v1/clientes/export",
    "/api/mapa-clientes/export",
    "/api/mapa-clientes/exportar",
    "/api/reports/customers/export",
    "/api/reports/export",
    "/api/customers/excel",
    "/api/clientes/excel",
    "/api/download/customers",
    "/api/customers?format=xlsx",
    "/api/clientes?format=xlsx",
    "/api/customers?export=true",
    "/api/clientes?export=true",
  ];

  const headers: Record<string, string> = {
    "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, application/octet-stream, */*",
    "Origin": PORTAL_BASE,
    "Referer": `${PORTAL_BASE}/mapa-clientes`,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (cookies) headers["Cookie"] = cookies;

  for (const path of exportPaths) {
    try {
      const url = path.includes("?") ? `${PORTAL_BASE}${path}` : `${PORTAL_BASE}${path}`;
      console.log(`Trying Excel export at ${url}`);
      
      const res = await fetch(url, { headers, redirect: "follow" });
      const contentType = res.headers.get("content-type") || "";
      
      console.log(`Export response from ${path}: status=${res.status}, content-type=${contentType}`);
      
      if (res.ok && (
        contentType.includes("spreadsheet") || 
        contentType.includes("excel") || 
        contentType.includes("octet-stream") ||
        contentType.includes("xlsx")
      )) {
        const buffer = await res.arrayBuffer();
        console.log(`Downloaded Excel file: ${buffer.byteLength} bytes`);
        return new Uint8Array(buffer);
      }
      
      // Also check if it's a valid xlsx even with wrong content-type
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        if (buffer.byteLength > 100) {
          // Check for xlsx magic bytes (PK zip header)
          const view = new Uint8Array(buffer);
          if (view[0] === 0x50 && view[1] === 0x4B) {
            console.log(`Found xlsx file at ${path} (${buffer.byteLength} bytes) despite content-type: ${contentType}`);
            return view;
          }
        }
      } else {
        await res.text();
      }
    } catch (e) {
      console.log(`Export attempt at ${path} failed: ${e}`);
    }
  }

  // Try POST requests for export
  const postHeaders = { ...headers, "Content-Type": "application/json" };
  const postPaths = [
    "/api/customers/export",
    "/api/clientes/export",
    "/api/clientes/exportar",
    "/api/mapa-clientes/export",
  ];

  for (const path of postPaths) {
    try {
      console.log(`Trying POST Excel export at ${PORTAL_BASE}${path}`);
      const res = await fetch(`${PORTAL_BASE}${path}`, {
        method: "POST",
        headers: postHeaders,
        body: JSON.stringify({ format: "xlsx", andamento: "todos", status: "todos" }),
        redirect: "follow",
      });

      const contentType = res.headers.get("content-type") || "";
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        const view = new Uint8Array(buffer);
        if (view.length > 100 && view[0] === 0x50 && view[1] === 0x4B) {
          console.log(`Found xlsx via POST at ${path} (${buffer.byteLength} bytes)`);
          return view;
        }
      } else {
        await res.text();
      }
    } catch (e) {
      console.log(`POST export at ${path} failed: ${e}`);
    }
  }

  return null;
}

// Also try fetching JSON data as fallback
async function tryFetchJsonData(token: string, cookies: string): Promise<Record<string, unknown>[]> {
  const dataPaths = [
    "/api/customers",
    "/api/clientes",
    "/api/v1/customers",
    "/api/v1/clientes",
    "/api/mapa-clientes",
    "/api/dashboard/customers",
  ];

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Origin": PORTAL_BASE,
    "Referer": `${PORTAL_BASE}/mapa-clientes`,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (cookies) headers["Cookie"] = cookies;

  for (const path of dataPaths) {
    for (const suffix of ["", "?page=1&per_page=5000&limit=5000"]) {
      try {
        const url = `${PORTAL_BASE}${path}${suffix}`;
        console.log(`Trying JSON data at ${url}`);
        const res = await fetch(url, { headers, redirect: "manual" });
        
        if (res.ok) {
          const body = await res.json();
          const customers = body.data || body.customers || body.clientes || body.results || body;
          if (Array.isArray(customers) && customers.length > 0) {
            console.log(`Found ${customers.length} customers at ${path}${suffix}`);
            return customers;
          }
        } else {
          await res.text();
        }
      } catch (e) {
        console.log(`JSON fetch at ${path} failed: ${e}`);
      }
    }
  }
  return [];
}

function parseExcelToRecords(xlsxData: Uint8Array): Record<string, unknown>[] {
  const workbook = XLSX.read(xlsxData, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);
  console.log(`Parsed ${rows.length} rows from Excel. Columns: ${rows.length > 0 ? Object.keys(rows[0]).join(", ") : "none"}`);
  return rows;
}

function buildRecordFromRow(row: Record<string, unknown>): Record<string, unknown> | null {
  const phoneRaw = findColumnValue(row, "Celular", "celular", "Telefone", "telefone", "WhatsApp", "whatsapp", "Fone", "Phone");
  let phone = normalizePhone(String(phoneRaw || ""));

  if (!phone || phone.length < 12) {
    const codigo = safeString(findColumnValue(row, "Código", "Codigo", "código", "codigo"));
    const instalacao = safeString(findColumnValue(row, "Instalação", "Instalacao", "Nº Instalação", "N Instalacao"));
    const fallbackId = codigo || instalacao;
    if (fallbackId) {
      phone = `sem_celular_${fallbackId.replace(/\D/g, "")}`;
    } else {
      return null;
    }
  }

  const name = safeString(findColumnValue(row, "Nome do Cliente", "Nome", "nome", "NOME", "Cliente", "Name"));
  const statusRaw = safeString(findColumnValue(row, "Andamento", "Status", "status")) || undefined;

  return {
    phone_whatsapp: phone,
    name,
    status: mapStatus(statusRaw),
    ...buildCustomerData(row),
  };
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

    let _consultantId: string | null = null;
    try {
      const body = await req.json();
      _consultantId = body.consultant_id || null;
    } catch {
      // No body (cron job)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Login
    console.log("Starting iGreen portal sync...");
    const loginResult = await tryLogin(portalEmail, portalPassword);

    if (!loginResult) {
      console.error("All login attempts failed");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Não foi possível fazer login no portal iGreen. Verifique email e senha.",
          details: "Nenhum endpoint de login respondeu com sucesso."
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Login successful, attempting to download Excel...");

    // Step 2: Try to download Excel first
    let rows: Record<string, unknown>[] = [];
    const excelData = await tryDownloadExcel(loginResult.token, loginResult.cookies);
    
    if (excelData) {
      console.log("Excel downloaded successfully, parsing...");
      rows = parseExcelToRecords(excelData);
    } else {
      console.log("Excel download failed, trying JSON API fallback...");
      rows = await tryFetchJsonData(loginResult.token, loginResult.cookies);
    }

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Login realizado mas nenhum dado encontrado. A estrutura da API pode ter mudado.",
          login_ok: true,
          source: excelData ? "excel" : "json_fallback"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Build records and upsert
    const seenPhones = new Set<string>();
    const records: Record<string, unknown>[] = [];

    for (const row of rows) {
      const record = buildRecordFromRow(row);
      if (!record || !record.phone_whatsapp) continue;
      const phone = String(record.phone_whatsapp);
      if (seenPhones.has(phone)) continue;
      seenPhones.add(phone);
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

    // Step 4: Save last sync timestamp
    const syncTimestamp = new Date().toISOString();
    await supabase
      .from("settings")
      .upsert({ key: "last_igreen_sync", value: syncTimestamp }, { onConflict: "key" });

    const result = {
      success: true,
      source: excelData ? "excel" : "json",
      total_rows: rows.length,
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
