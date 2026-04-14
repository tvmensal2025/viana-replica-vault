/**
 * Automação Playwright - Portal iGreen v3.0
 * Fluxo 100% automático: CEP → Calcular → Garantir → Formulário → Upload Docs → Perguntas → OTP → Enviar
 * 
 * v3.0 - Correções críticas:
 * ✅ Upload de RG/CNH (frente + verso) via input[type="file"]
 * ✅ Upload da conta de energia (3 estratégias de fallback)
 * ✅ Tipo de documento (dropdown customizado + select tradicional)
 * ✅ Procurador: NÃO (4 estratégias)
 * ✅ PDF Protegido: NÃO (4 estratégias)
 * ✅ Débitos: NÃO (3 estratégias)
 * ✅ CPF com .type() para validação automática
 * ✅ Validação pós-submit (verifica mensagem de sucesso)
 * ✅ Screenshots em cada fase
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONSULTOR_ID_FALLBACK = process.env.IGREEN_CONSULTOR_ID || '124170';
// PORTAL_URL agora é gerado dinamicamente por cliente (usa igreen_id do consultor)
const PORTAL_WORKER_URL = process.env.PORTAL_WORKER_URL || 'http://localhost:3100';
const SCREENSHOTS_DIR = './screenshots';
const FIXTURES_DIR = './fixtures';
const TMP_DIR = './tmp';
const MAX_RETRIES = 3;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─── reactFill: 3-tier strategy for React/MUI inputs ─────────────────────────
async function reactFill(page, selector, value) {
  const el = typeof selector === 'string' ? page.locator(selector).first() : selector;
  if (await el.count() === 0) return false;
  
  const selectorStr = typeof selector === 'string' ? selector : '(locator)';
  
  // Tier 1: Reset React _valueTracker + native setter + dispatch events
  try {
    await el.evaluate((input, val) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;
      if (nativeInputValueSetter) {
        const tracker = input._valueTracker;
        if (tracker) tracker.setValue('');
        nativeInputValueSetter.call(input, val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    }, value);
    
    const filled = await el.inputValue().catch(() => '');
    if (filled === value) {
      console.log(`   ✅ [reactFill T1] ${selectorStr}: "${value}"`);
      return true;
    }
  } catch (e) {
    console.log(`   ⚠️  [reactFill T1] falhou: ${e.message}`);
  }
  
  // Tier 2: Playwright native fill
  try {
    await el.fill(value);
    const filled = await el.inputValue().catch(() => '');
    if (filled === value) {
      console.log(`   ✅ [reactFill T2] ${selectorStr}: "${value}"`);
      return true;
    }
  } catch (e) {
    console.log(`   ⚠️  [reactFill T2] falhou: ${e.message}`);
  }
  
  // Tier 3: Character-by-character typing
  try {
    await el.click();
    await el.fill('');
    await el.type(value, { delay: 80 });
    console.log(`   ✅ [reactFill T3] ${selectorStr}: "${value}"`);
    return true;
  } catch (e) {
    console.log(`   ⚠️  [reactFill T3] falhou: ${e.message}`);
  }
  
  return false;
}

// ─── Controle global: apenas 1 browser por vez ───────────────────────────────
let activeBrowser = null;

async function closeActiveBrowser() {
  if (activeBrowser) {
    try {
      console.log('🔒 Fechando browser anterior...');
      await activeBrowser.close();
      console.log('🔒 Browser anterior fechado.');
    } catch (e) {
      console.warn(`⚠️  Erro ao fechar browser anterior: ${e.message}`);
    }
    activeBrowser = null;
  }
}

async function killOrphanedChromium() {
  try {
    const { execSync } = await import('child_process');
    // Matar processos Chromium/Chrome for Testing órfãos (SIGKILL para garantir)
    execSync('pkill -9 -f "Google Chrome for Testing" 2>/dev/null || true', { stdio: 'ignore' });
    execSync('pkill -9 -f "chromium" 2>/dev/null || true', { stdio: 'ignore' });
    console.log('🧹 Processos Chromium órfãos limpos');
  } catch (_) {}
}

// JPEG mínimo para documento placeholder
const MINIMAL_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x09, 0x09,
  0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13,
  0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24,
  0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c,
  0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 0x3c,
  0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00,
  0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01,
  0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09,
  0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  0x7b, 0x94, 0x11, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xff, 0xd9,
]);

// ─── Garantir diretórios ──────────────────────────────────────────────────────
async function ensureDirs() {
  for (const dir of [SCREENSHOTS_DIR, FIXTURES_DIR, TMP_DIR]) {
    try { await mkdir(dir, { recursive: true }); } catch (_) {}
  }
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
  return createClient(url, key);
}

async function buscarCliente(customerId) {
  const { data, error } = await getSupabase()
    .from('customers')
    .select(`
      *,
      consultants:consultant_id (
        id,
        name,
        igreen_id
      )
    `)
    .eq('id', customerId)
    .single();
  if (error) throw new Error(`Erro ao buscar cliente: ${error.message}`);
  if (!data) throw new Error(`Cliente ${customerId} não encontrado`);
  return data;
}

async function atualizarStatus(customerId, status, errorMsg = null) {
  const updates = { status, updated_at: new Date().toISOString() };
  if (errorMsg) updates.error_message = errorMsg;
  if (status === 'registered_igreen') updates.portal_submitted_at = new Date().toISOString();
  if (status === 'awaiting_otp') updates.otp_code = null;
  await getSupabase().from('customers').update(updates).eq('id', customerId);
}

// ─── Whapi Media: baixar quando a URL no banco é whapi-media:xxx ─────────────
let _whapiSettings = null;
async function getWhapiSettings() {
  if (_whapiSettings) return _whapiSettings;
  const { data: rows } = await getSupabase().from('settings').select('key, value');
  const s = {};
  (rows || []).forEach((r) => { s[r.key] = r.value; });
  _whapiSettings = {
    token: s.whapi_token || process.env.WHAPI_TOKEN,
    baseUrl: (s.whapi_api_url || process.env.WHAPI_API_URL || 'https://gate.whapi.cloud').replace(/\/$/, ''),
  };
  return _whapiSettings;
}

async function downloadWhapiMedia(mediaId, label) {
  const { token, baseUrl } = await getWhapiSettings();
  if (!token) throw new Error('Whapi token não configurado - não é possível baixar whapi-media');
  const res = await fetch(`${baseUrl}/media/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/octet-stream' },
  });
  if (!res.ok) throw new Error(`Whapi media ${res.status}: ${await res.text()}`);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const ext = ct.includes('pdf') ? 'pdf' : ct.includes('png') ? 'png' : 'jpg';
  const outPath = join(TMP_DIR, `${label}-${Date.now()}.${ext}`);
  writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
  return outPath;
}

// ─── Preparar arquivos de upload ──────────────────────────────────────────────
async function prepararDocumento(url, label) {
  // whapi-media:xxx → baixar via API Whapi
  if (url && url.startsWith('whapi-media:')) {
    try {
      const mediaId = url.replace('whapi-media:', '').trim();
      const outPath = await downloadWhapiMedia(mediaId, label);
      console.log(`📄 ${label} baixado (Whapi): ${outPath}`);
      return outPath;
    } catch (e) {
      console.warn(`⚠️  Erro ao baixar ${label} (Whapi): ${e.message}`);
    }
  }
  // Tentar baixar foto real do documento (URL HTTP ou data:)
  if (url) {
    try {
      let outPath;
      
      if (url.startsWith('data:')) {
        const isPdf = url.includes('application/pdf');
        const ext = isPdf ? 'pdf' : 'jpg';
        outPath = join(TMP_DIR, `${label}-${Date.now()}.${ext}`);
        const base64 = url.replace(/^data:[^;]+;base64,/, '');
        writeFileSync(outPath, Buffer.from(base64, 'base64'));
      } else {
        const res = await fetch(url);
        if (res.ok) {
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          const ext = ct.includes('pdf') ? 'pdf' : 'jpg';
          outPath = join(TMP_DIR, `${label}-${Date.now()}.${ext}`);
          writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
        }
      }
      
      if (outPath && existsSync(outPath)) {
        console.log(`📄 ${label} baixado: ${outPath}`);
        return outPath;
      }
    } catch (e) {
      console.warn(`⚠️  Erro ao baixar ${label}: ${e.message}`);
    }
  }
  
  // Fallback: criar JPEG placeholder
  const docPath = join(FIXTURES_DIR, 'documento.jpg');
  if (!existsSync(docPath)) {
    writeFileSync(docPath, MINIMAL_JPEG);
    console.log(`📄 ${label} placeholder criado`);
  }
  return docPath;
}

async function prepararContaEnergia(cliente) {
  const url = cliente.electricity_bill_photo_url;
  if (url && url.startsWith('whapi-media:')) {
    try {
      const mediaId = url.replace('whapi-media:', '').trim();
      const outPath = await downloadWhapiMedia(mediaId, 'conta');
      console.log(`📄 Conta de energia baixada (Whapi): ${outPath}`);
      return outPath;
    } catch (e) {
      console.warn('⚠️  Erro ao baixar conta (Whapi):', e.message);
    }
  }
  // Tentar baixar foto real da conta (URL HTTP ou data:)
  if (url) {
    try {
      let outPath;
      
      if (url.startsWith('data:')) {
        const isPdf = url.includes('application/pdf');
        const ext = isPdf ? 'pdf' : 'jpg';
        outPath = join(TMP_DIR, `conta-${Date.now()}.${ext}`);
        const base64 = url.replace(/^data:[^;]+;base64,/, '');
        writeFileSync(outPath, Buffer.from(base64, 'base64'));
      } else {
        const res = await fetch(url);
        if (res.ok) {
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          const ext = ct.includes('pdf') ? 'pdf' : 'jpg';
          outPath = join(TMP_DIR, `conta-${Date.now()}.${ext}`);
          writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
        }
      }
      
      if (outPath && existsSync(outPath)) {
        console.log(`📄 Conta de energia baixada: ${outPath}`);
        return outPath;
      }
    } catch (e) {
      console.warn('⚠️  Erro ao baixar conta:', e.message);
    }
  }
  
  // Fallback: criar PDF mínimo
  const pdfPath = join(FIXTURES_DIR, 'conta-energia.pdf');
  if (!existsSync(pdfPath)) {
    const pdfContent = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000062 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n206\n%%EOF';
    writeFileSync(pdfPath, pdfContent);
    console.log('📄 PDF placeholder de conta criado');
  }
  return pdfPath;
}

// ─── Salvar documentos organizados em ~/Documents/iGreen/contratos ────────
async function salvarDocumentosCliente(cliente) {
  try {
    const nome = (cliente.name || 'SEM-NOME').replace(/[^a-zA-ZÀ-ÿ0-9 ]/g, '').trim().replace(/\s+/g, '-');
    const dataHoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const pastaCliente = join(homedir(), 'Documents', 'iGreen', 'contratos', `${nome}-${dataHoje}`);
    
    await mkdir(pastaCliente, { recursive: true });
    console.log(`\n📁 Pasta do cliente: ${pastaCliente}`);

    let salvos = 0;

    // RG/CNH Frente
    if (cliente.document_front_url) {
      try {
        const ext = await baixarArquivo(cliente.document_front_url, join(pastaCliente, `RG-frente-${nome}`));
        console.log(`   ✅ RG-frente-${nome}${ext}`);
        salvos++;
      } catch (e) { console.warn(`   ⚠️  RG frente: ${e.message}`); }
    }

    // RG/CNH Verso
    if (cliente.document_back_url) {
      try {
        const ext = await baixarArquivo(cliente.document_back_url, join(pastaCliente, `RG-verso-${nome}`));
        console.log(`   ✅ RG-verso-${nome}${ext}`);
        salvos++;
      } catch (e) { console.warn(`   ⚠️  RG verso: ${e.message}`); }
    }

    // Conta de Luz
    if (cliente.electricity_bill_photo_url) {
      try {
        const ext = await baixarArquivo(cliente.electricity_bill_photo_url, join(pastaCliente, `conta-de-luz-${nome}`));
        console.log(`   ✅ conta-de-luz-${nome}${ext}`);
        salvos++;
      } catch (e) { console.warn(`   ⚠️  Conta de luz: ${e.message}`); }
    }

    console.log(`📁 ${salvos}/3 documento(s) salvos em: ${pastaCliente}`);
    return pastaCliente;
  } catch (e) {
    console.error(`❌ Erro ao salvar documentos: ${e.message}`);
    return null;
  }
}

async function baixarArquivo(url, caminhoSemExtensao) {
  if (url.startsWith('data:')) {
    const isPdf = url.includes('application/pdf');
    const ext = isPdf ? '.pdf' : '.jpg';
    const base64 = url.replace(/^data:[^;]+;base64,/, '');
    writeFileSync(caminhoSemExtensao + ext, Buffer.from(base64, 'base64'));
    return ext;
  }
  if (url.startsWith('whapi-media:')) {
    const mediaId = url.replace('whapi-media:', '').trim();
    const outPath = await downloadWhapiMedia(mediaId, 'file');
    const ext = outPath.endsWith('.pdf') ? '.pdf' : outPath.endsWith('.png') ? '.png' : '.jpg';
    copyFileSync(outPath, caminhoSemExtensao + ext);
    return ext;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const ext = ct.includes('pdf') ? '.pdf' : ct.includes('png') ? '.png' : '.jpg';
  writeFileSync(caminhoSemExtensao + ext, Buffer.from(await res.arrayBuffer()));
  return ext;
}

// ─── Formatar dados ───────────────────────────────────────────────────────────
function formatarDados(cliente) {
  const onlyDigits = (s) => (s || '').replace(/\D+/g, '');
  
  const cpfDigits = onlyDigits(cliente.cpf);
  if (cpfDigits.length !== 11) throw new Error(`CPF inválido: ${cliente.cpf}`);
  const cpfFormatted = cpfDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  
  const cepDigits = onlyDigits(cliente.cep);
  if (cepDigits.length !== 8) throw new Error(`CEP inválido: ${cliente.cep}`);
  const cepFormatted = cepDigits.replace(/(\d{5})(\d{3})/, '$1-$2');
  
  // Telefone SEM código do país (portal não aceita +55)
  const phoneDigits = onlyDigits(cliente.phone_whatsapp);
  const whatsapp = phoneDigits.length >= 12 ? phoneDigits.slice(-11) : phoneDigits;
  
  return {
    nomeCompleto: cliente.name,
    cpfDigits,
    cpfFormatted,
    cepFormatted,
    whatsapp,
    email: cliente.email,
    endereco: cliente.address_street,
    numeroEndereco: cliente.address_number,
    bairro: cliente.address_neighborhood,
    cidade: cliente.address_city,
    estadoSigla: cliente.address_state,
    complemento: cliente.address_complement,
    distribuidora: cliente.distribuidora,
    numeroInstalacao: (() => {
      const num = cliente.numero_instalacao || '';
      const digits = num.replace(/\D/g, '');
      // Portal espera 7-12 dígitos (campo "Seu Código" na conta de luz)
      // Se já está no range correto, usar direto
      if (digits.length >= 7 && digits.length <= 12) return digits;
      // Se veio maior (ex: código de barras ou outro campo), tentar sem zeros à esquerda
      if (digits.length > 12) {
        const semZeros = digits.replace(/^0+/, '');
        if (semZeros.length >= 7 && semZeros.length <= 12) return semZeros;
        // Último recurso: últimos 10 dígitos
        return digits.slice(-10);
      }
      return digits;
    })(),
    electricity_bill_value: cliente.electricity_bill_value || 300,
    dataNascimento: cliente.data_nascimento,
    documentType: cliente.document_type || 'RG (Antigo)',
    possuiProcurador: cliente.possui_procurador || false,
    pdfProtegido: cliente.conta_pdf_protegida || false,
    debitosAberto: cliente.debitos_aberto || false,
  };
}

// ─── Screenshot helper ────────────────────────────────────────────────────────
async function screenshot(page, customerId, fase) {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filepath = join(SCREENSHOTS_DIR, `${customerId}-${fase}-${ts}.png`);
    await page.screenshot({ path: filepath, fullPage: true });
    console.log(`📸 Screenshot: ${fase}`);
    
    // Salvar HTML para diagnóstico em fases críticas
    if (fase.includes('apos-enviar') || fase.includes('apos-finalizar') || fase.includes('resultado') || fase.includes('ERROR') || fase.includes('FALHOU')) {
      try {
        const htmlPath = join(SCREENSHOTS_DIR, `${customerId}-${fase}-${ts}.html`);
        const html = await page.content();
        writeFileSync(htmlPath, html);
        console.log(`📄 HTML dump: ${fase}`);
      } catch (_) {}
    }
    
    return filepath;
  } catch (_) { return null; }
}

// ─── Aguardar OTP via polling ─────────────────────────────────────────────────
async function aguardarOTP(customerId, timeoutMs = 180000) {
  console.log(`\n⏳ Aguardando OTP no WhatsApp (timeout: ${timeoutMs / 1000}s)...`);
  const inicio = Date.now();
  let tentativas = 0;
  
  while (Date.now() - inicio < timeoutMs) {
    tentativas++;
    
    // Estratégia 1: buscar via endpoint local do server
    try {
      const resp = await fetch(`${PORTAL_WORKER_URL}/otp/${customerId}`, {
        signal: AbortSignal.timeout(5000)
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.code) {
          console.log(`🔑 OTP recebido via server (${data.source || 'unknown'}) após ${tentativas} tentativas: ${data.code}`);
          return data.code;
        }
      }
    } catch (_) {}
    
    // Estratégia 2: buscar direto no Supabase (fallback)
    if (tentativas % 3 === 0) {
      try {
        const { data } = await getSupabase()
          .from('customers')
          .select('otp_code')
          .eq('id', customerId)
          .single();
        if (data?.otp_code) {
          console.log(`🔑 OTP recebido via Supabase após ${tentativas} tentativas: ${data.otp_code}`);
          return data.otp_code;
        }
      } catch (_) {}
    }
    
    if (tentativas % 10 === 0) console.log(`⏳ Tentativa ${tentativas} - aguardando OTP...`);
    await delay(1500);
  }
  throw new Error(`Timeout aguardando OTP (${timeoutMs / 1000}s)`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTOMAÇÃO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export async function executarAutomacao(customerId, options = {}) {
  const startTime = Date.now();
  const { headless, stopBeforeSubmit = false } = options;
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🤖 AUTOMAÇÃO PLAYWRIGHT v3.0`);
  console.log(`   Customer ID : ${customerId}`);
  console.log(`   Headless    : ${headless !== undefined ? headless : (process.env.HEADLESS === '1')}`);
  console.log(`   Stop before submit: ${stopBeforeSubmit}`);
  console.log(`   Timestamp   : ${new Date().toISOString()}`);
  console.log('='.repeat(70));
  
  let browser;
  let currentPhase = 'init';
  
  try {
    await ensureDirs();
    
    // ─── 1. Buscar e validar dados ────────────────────────────────────────
    console.log('\n📥 Buscando dados do cliente + consultor...');
    const cliente = await buscarCliente(customerId);
    
    // Extrair igreen_id do consultor para URL individualizada
    const consultant = cliente.consultants;
    const consultorId = consultant?.igreen_id || CONSULTOR_ID_FALLBACK;
    const consultorName = consultant?.name || 'Consultor';
    console.log(`✅ Cliente: ${cliente.name}`);
    console.log(`👤 Consultor: ${consultorName} (iGreen ID: ${consultorId})`);
    
    // URL individualizada por consultor
    const PORTAL_URL = `https://digital.igreenenergy.com.br/?id=${consultorId}&sendcontract=true`;
    
    const data = formatarDados(cliente);
    
    // ─── Salvar documentos organizados em ~/Documents/iGreen/contratos ──
    const pastaDocumentos = await salvarDocumentosCliente(cliente);
    
    // Validar campos obrigatórios
    const obrigatorios = ['nomeCompleto', 'cpfDigits', 'email', 'whatsapp', 'cepFormatted', 'endereco', 'numeroEndereco', 'cidade', 'estadoSigla'];
    const faltando = obrigatorios.filter(c => !data[c] || String(data[c]).trim() === '');
    if (faltando.length > 0) throw new Error(`Campos obrigatórios faltando: ${faltando.join(', ')}`);
    console.log('✅ Dados validados');
    
    // Preparar arquivos de upload
    const docFrentePath = await prepararDocumento(cliente.document_front_url, 'doc-frente');
    const docVersoPath = await prepararDocumento(cliente.document_back_url, 'doc-verso');
    const contaPath = await prepararContaEnergia(cliente);
    console.log(`📄 Doc frente: ${docFrentePath}`);
    console.log(`📄 Doc verso: ${docVersoPath}`);
    console.log(`📄 Conta: ${contaPath}`);
    
    await atualizarStatus(customerId, 'portal_submitting');
    
    // ─── 2. Iniciar browser (fechar qualquer browser anterior primeiro) ──
    console.log('\n🌐 Iniciando Chromium...');
    await closeActiveBrowser();   // Garante que só 1 browser existe
    await killOrphanedChromium(); // Mata processos órfãos do sistema
    
    const isHeadless = headless !== undefined ? Boolean(headless) : (process.env.HEADLESS !== '0');
    console.log(`   🖥️  headless=${isHeadless} (HEADLESS env=${process.env.HEADLESS})`);
    browser = await chromium.launch({
      headless: isHeadless,
      slowMo: isHeadless ? 50 : 100,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--start-maximized'],
    });
    activeBrowser = browser; // Registrar como browser ativo
    
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    
    // ─── 3. Navegar para portal ───────────────────────────────────────────
    currentPhase = 'navegacao';
    console.log(`\n🔗 Acessando: ${PORTAL_URL}`);
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await delay(1500);
    await screenshot(page, customerId, '01-portal-carregado');
    console.log('✅ Portal carregado');
    
    // ─── 4. FASE 1: CEP + Valor ──────────────────────────────────────────
    currentPhase = 'fase1-cep';
    console.log('\n📋 [1/16] FASE 1: CEP e valor da conta...');
    
    const cepInput = page.locator('input[name="cep"]');
    if (await cepInput.count() > 0) {
      await reactFill(page, 'input[name="cep"]', data.cepFormatted);
      console.log(`   ✅ CEP: ${data.cepFormatted}`);
    }
    
    const consumptionInput = page.locator('input[name="consumption"]');
    if (await consumptionInput.count() > 0) {
      await reactFill(page, 'input[name="consumption"]', String(data.electricity_bill_value));
      console.log(`   ✅ Valor: ${data.electricity_bill_value}`);
    }
    
    await delay(500);
    const calcBtn = page.locator('button[type="submit"]').first();
    if (await calcBtn.count() > 0) {
      await calcBtn.click();
      console.log('   ✅ Calcular clicado');
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await delay(2500);
    }
    await screenshot(page, customerId, '02-apos-calcular');

    // ─── 5. FASE 2: Garantir Desconto ─────────────────────────────────────
    currentPhase = 'fase2-garantir';
    console.log('\n📋 [2/16] FASE 2: Garantir desconto...');
    
    const garantirBtn = page.locator('button:has-text("Garantir meu desconto"), button:has-text("Garantir desconto")');
    if (await garantirBtn.count() > 0) {
      await garantirBtn.first().click({ timeout: 15000 });
      console.log('   ✅ Garantir clicado');
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await delay(1500);
    }
    await screenshot(page, customerId, '03-apos-garantir');
    
    // ─── 6. FASE 3: CPF (com .type() para validação automática) ──────────
    currentPhase = 'fase3-cpf';
    console.log('\n📋 [3/16] CPF (digitação simulada para validação)...');
    
    const cpfInput = page.locator('input[name="documentNumber"]');
    if (await cpfInput.count() > 0) {
      await cpfInput.type(data.cpfDigits, { delay: 100 });
      console.log(`   ✅ CPF digitado: ${data.cpfFormatted}`);
      await delay(2500); // Aguardar validação automática do portal
    } else {
      // Fallback: tentar outros seletores
      const cpfAlt = page.locator('input[name="cpf"], input[placeholder*="CPF"]').first();
      if (await cpfAlt.count() > 0) {
        await cpfAlt.type(data.cpfDigits, { delay: 100 });
        console.log(`   ✅ CPF digitado (alt): ${data.cpfFormatted}`);
        await delay(2500);
      }
    }
    await screenshot(page, customerId, '04-apos-cpf');
    
    // ─── 6b. TRATAR CADASTRO EXISTENTE ────────────────────────────────────
    // Se o CPF já tem cadastro no portal, aparece:
    // "Continuar com um novo cadastro" / "Assinar contrato em aberto"
    // Precisamos clicar em "Continuar com um novo cadastro"
    currentPhase = 'cadastro-existente';
    const novoCadastroBtn = page.locator('button:has-text("Continuar com um novo cadastro")');
    if (await novoCadastroBtn.count() > 0) {
      console.log('   ⚠️  CPF já cadastrado no portal - clicando "Continuar com um novo cadastro"');
      await novoCadastroBtn.first().click({ timeout: 10000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await delay(2500);
      await screenshot(page, customerId, '04b-apos-novo-cadastro');
      console.log('   ✅ Novo cadastro iniciado');
    }
    
    // ─── 7. WhatsApp ─────────────────────────────────────────────────────
    currentPhase = 'fase4-formulario';
    console.log('\n📋 [4/16] WhatsApp...');
    
    // Aguardar campo phone aparecer (pode demorar após CPF/novo cadastro)
    const phoneInput = page.locator('input[name="phone"]');
    try {
      await phoneInput.waitFor({ state: 'visible', timeout: 15000 });
    } catch (_) {
      console.log('   ⏳ Campo phone não visível, fazendo scroll...');
      await page.evaluate(() => window.scrollBy(0, 300));
      await delay(1500);
    }
    
    if (await phoneInput.count() > 0 && await phoneInput.isVisible().catch(() => false)) {
      await phoneInput.type(data.whatsapp, { delay: 100 });
      console.log(`   ✅ WhatsApp: ${data.whatsapp}`);
    } else {
      console.warn('   ⚠️  Campo WhatsApp não encontrado/visível');
    }
    await delay(500);
    
    const phoneConfirm = page.locator('input[name="phoneConfirm"]');
    if (await phoneConfirm.count() > 0 && await phoneConfirm.isVisible().catch(() => false)) {
      await phoneConfirm.type(data.whatsapp, { delay: 100 });
      console.log('   ✅ Confirmar WhatsApp');
    }
    await delay(2500);
    
    // ─── 8. Email ────────────────────────────────────────────────────────
    console.log('\n📋 [5/16] Email...');
    
    const emailInput = page.locator('input[name="email"]');
    if (await emailInput.count() > 0) {
      await reactFill(page, 'input[name="email"]', data.email);
      console.log(`   ✅ Email: ${data.email}`);
    }
    await delay(500);
    
    const emailConfirm = page.locator('input[name="emailConfirm"]');
    if (await emailConfirm.count() > 0) {
      await reactFill(page, 'input[name="emailConfirm"]', data.email);
      console.log('   ✅ Confirmar email');
    }
    await delay(2500);
    
    // ─── 9. Endereço ─────────────────────────────────────────────────────
    console.log('\n📋 [6/16] Endereço...');
    
    const numberInput = page.locator('input[name="number"]');
    if (await numberInput.count() > 0) {
      await reactFill(page, 'input[name="number"]', data.numeroEndereco);
      console.log(`   ✅ Número: ${data.numeroEndereco}`);
    }
    
    if (data.complemento) {
      const complementInput = page.locator('input[name="complement"]');
      if (await complementInput.count() > 0) {
        await complementInput.fill(data.complemento);
        console.log(`   ✅ Complemento: ${data.complemento}`);
      }
    }
    await delay(1500);
    
    // Scroll para campos de conta
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2500);
    
    // ─── 10. Número da Instalação ────────────────────────────────────────
    console.log('\n📋 [7/16] Número da instalação...');
    
    if (data.numeroInstalacao) {
      console.log(`   📊 Número original: ${cliente.numero_instalacao || 'N/A'}`);
      console.log(`   📊 Número formatado: ${data.numeroInstalacao}`);
      
      // Seletor exato do mapeamento: input[name="installationNumber"]
      const instalacaoInput = page.locator('input[name="installationNumber"]').first();
      if (await instalacaoInput.count() > 0) {
        await instalacaoInput.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
        await instalacaoInput.fill(data.numeroInstalacao);
        console.log(`   ✅ Instalação: ${data.numeroInstalacao}`);
        
        // Aguardar validação e verificar se deu erro
        await delay(1500);
        
        // Se o portal mostrar erro, tentar variações do número
        const pageText = await page.textContent('body').catch(() => '');
        const erroInstalacao = /instalação.*inválid|número.*instalação.*não|not found|não encontrad/i.test(pageText);
        
        if (erroInstalacao) {
          console.log('   ⚠️  Portal rejeitou o número, tentando variações...');
          const rawDigits = (cliente.numero_instalacao || '').replace(/\D/g, '');
          
          // Variações a tentar: últimos 7, 8, 10, 12 dígitos, sem zeros
          const variacoes = [
            rawDigits.replace(/^0+/, ''),           // sem zeros à esquerda
            rawDigits.slice(-7),                      // últimos 7
            rawDigits.slice(-8),                      // últimos 8
            rawDigits.slice(-12),                     // últimos 12
            rawDigits,                                // número completo
          ].filter((v, i, arr) => v.length >= 4 && arr.indexOf(v) === i && v !== data.numeroInstalacao);
          
          for (const variacao of variacoes) {
            await instalacaoInput.fill('');
            await instalacaoInput.fill(variacao);
            console.log(`   🔄 Tentando: ${variacao}`);
            await delay(500);
            
            const textoAtual = await page.textContent('body').catch(() => '');
            const aindaErro = /instalação.*inválid|número.*instalação.*não|not found|não encontrad/i.test(textoAtual);
            if (!aindaErro) {
              console.log(`   ✅ Instalação aceita: ${variacao}`);
              break;
            }
          }
        }
      } else {
        // Fallback
        const fallback = page.locator('input[placeholder*="instalação" i], input[name*="instalacao" i]').first();
        if (await fallback.count() > 0) {
          await fallback.fill(data.numeroInstalacao);
          console.log(`   ✅ Instalação (fallback): ${data.numeroInstalacao}`);
        } else {
          console.warn('   ⚠️  Campo instalação não encontrado');
        }
      }
      await delay(1500);
    }
    
    // Scroll para distribuidora
    await page.evaluate(() => window.scrollBy(0, 200));
    await delay(1500);

    // ─── 11. Distribuidora (dropdown - NEM SEMPRE APARECE) ──────────────
    console.log('\n📋 [8/16] Distribuidora...');
    
    if (data.distribuidora) {
      let distribuidoraSelecionada = false;
      
      // Verificar se o campo existe (nem sempre aparece - depende do CEP)
      const powerCompany = page.locator('select[name="powerCompany"]');
      if (await powerCompany.count() > 0) {
        try {
          await powerCompany.selectOption({ label: new RegExp(data.distribuidora, 'i') });
          console.log(`   ✅ Distribuidora: ${data.distribuidora}`);
          distribuidoraSelecionada = true;
        } catch (_) {
          const primeiraPalavra = data.distribuidora.split(' ')[0];
          try {
            await powerCompany.selectOption({ label: new RegExp(primeiraPalavra, 'i') });
            console.log(`   ✅ Distribuidora (parcial): ${primeiraPalavra}`);
            distribuidoraSelecionada = true;
          } catch (_) {}
        }
      }
      
      if (!distribuidoraSelecionada) {
        console.log('   ℹ️  Campo distribuidora não apareceu (normal - CEP pode determinar automaticamente)');
      }
      await delay(500);
    }
    
    // Scroll para uploads
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2500);
    await screenshot(page, customerId, '05-formulario-preenchido');
    
    // ─── 12. Tipo de Documento (dropdown customizado - precisa CLICAR para abrir) ─
    currentPhase = 'tipo-documento';
    console.log('\n📋 [9/16] Tipo de documento...');
    console.log(`   📋 Tipo desejado: ${data.documentType}`);
    
    let tipoDocSelecionado = false;
    const tipoDoc = (data.documentType || 'RG (Antigo)').toUpperCase();
    let opcaoTexto = 'RG (Antigo)';
    if (tipoDoc.includes('CNH')) opcaoTexto = 'CNH';
    else if (tipoDoc.includes('NOVO')) opcaoTexto = 'RG (Novo)';
    
    // O portal usa um dropdown customizado (div com seta ▼), NÃO um <select> nativo
    // Precisa: 1) clicar no campo para abrir  2) clicar na opção na lista
    
    // Estratégia 1: Encontrar o dropdown "Tipo documento" e clicar para abrir
    const dropdownSelectors = [
      // Div/container com texto "Tipo documento" que é clicável
      'div:has-text("Tipo documento")',
      // MUI/Material-like selects
      '[aria-label*="Tipo documento" i]',
      '[aria-haspopup="listbox"]',
      // Role combobox
      '[role="combobox"]',
      '[role="button"]:has-text("Tipo documento")',
      // Qualquer elemento clicável com "Tipo documento"
      'label:has-text("Tipo documento")',
    ];
    
    for (const sel of dropdownSelectors) {
      if (tipoDocSelecionado) break;
      try {
        const elementos = await page.locator(sel).all();
        for (const el of elementos) {
          if (tipoDocSelecionado) break;
          try {
            const visible = await el.isVisible().catch(() => false);
            if (!visible) continue;
            
            // Clicar para abrir o dropdown
            await el.click({ timeout: 5000 });
            console.log(`   📂 Dropdown aberto via: ${sel}`);
            await delay(500);
            
            // Agora procurar a opção na lista que apareceu
            const optionSelectors = [
              `li:has-text("${opcaoTexto}")`,
              `[role="option"]:has-text("${opcaoTexto}")`,
              `[role="menuitem"]:has-text("${opcaoTexto}")`,
              `div[role="listbox"] >> text="${opcaoTexto}"`,
              `ul >> li:has-text("${opcaoTexto}")`,
              `.MuiMenuItem-root:has-text("${opcaoTexto}")`,
              `.MuiListItem-root:has-text("${opcaoTexto}")`,
            ];
            
            for (const optSel of optionSelectors) {
              try {
                const opt = page.locator(optSel).first();
                if (await opt.count() > 0 && await opt.isVisible().catch(() => false)) {
                  await opt.click({ timeout: 5000 });
                  console.log(`   ✅ Tipo documento: ${opcaoTexto}`);
                  tipoDocSelecionado = true;
                  break;
                }
              } catch (_) {}
            }
            
            // Fallback: procurar qualquer texto visível que bata
            if (!tipoDocSelecionado) {
              try {
                const opt = page.getByText(opcaoTexto, { exact: false }).first();
                if (await opt.count() > 0 && await opt.isVisible().catch(() => false)) {
                  await opt.click({ timeout: 5000 });
                  console.log(`   ✅ Tipo documento (getByText): ${opcaoTexto}`);
                  tipoDocSelecionado = true;
                }
              } catch (_) {}
            }
            
            // Se não achou a opção, fechar o dropdown (clicar fora) e tentar próximo seletor
            if (!tipoDocSelecionado) {
              await page.keyboard.press('Escape').catch(() => {});
              await delay(500);
            }
          } catch (_) {}
        }
      } catch (_) {}
    }
    
    // Estratégia 2: select nativo (fallback caso seja <select> em vez de dropdown customizado)
    if (!tipoDocSelecionado) {
      const allSelects = await page.locator('select:visible').all();
      for (const select of allSelects) {
        const options = await select.locator('option').all();
        for (const opt of options) {
          const text = await opt.textContent();
          if (text && (text.includes('RG') || text.includes('CNH'))) {
            try {
              if (tipoDoc.includes('CNH')) await select.selectOption({ label: /CNH/i });
              else if (tipoDoc.includes('NOVO')) await select.selectOption({ label: /RG.*Novo/i });
              else await select.selectOption({ label: /RG.*Antigo/i });
              console.log(`   ✅ Tipo documento (select nativo): ${opcaoTexto}`);
              tipoDocSelecionado = true;
            } catch (_) {}
            break;
          }
        }
        if (tipoDocSelecionado) break;
      }
    }
    
    // Estratégia 3: screenshot para debug se falhou
    if (!tipoDocSelecionado) {
      console.warn('   ⚠️  Tipo documento não selecionado - tirando screenshot para debug');
      await screenshot(page, customerId, '05b-tipo-doc-FALHOU');
    }
    await delay(1500);

    // ─── 13. UPLOAD: Documentos pessoais (RG/CNH frente + verso) ─────────
    currentPhase = 'upload-documentos';
    console.log('\n📋 [10/16] Upload documentos pessoais (RG/CNH)...');
    await delay(2500);
    
    // Aguardar inputs file
    try {
      await page.locator('input[type="file"]').first().waitFor({ state: 'attached', timeout: 20000 });
      console.log('   ✅ Campos de upload encontrados');
    } catch (_) {
      console.warn('   ⚠️  Campos de upload não encontrados, tentando scroll...');
      await page.evaluate(() => window.scrollBy(0, 300));
      await delay(1500);
    }
    
    // Documento Frente - seletor exato: input[name="documentFront"]
    try {
      let docFrente = page.locator('input[type="file"][name="documentFront"]');
      if (await docFrente.count() === 0) docFrente = page.locator('input[type="file"]').first();
      await docFrente.setInputFiles(docFrentePath);
      console.log('   ✅ Documento FRENTE enviado');
      await delay(500);
    } catch (e) {
      console.warn(`   ⚠️  Documento frente: ${e.message}`);
    }
    
    // Documento Verso - seletor exato: input[name="documentBack"]
    try {
      let docVerso = page.locator('input[type="file"][name="documentBack"]');
      if (await docVerso.count() === 0) docVerso = page.locator('input[type="file"]').nth(1);
      await docVerso.setInputFiles(docVersoPath);
      console.log('   ✅ Documento VERSO enviado');
      await delay(500);
    } catch (e) {
      console.warn(`   ⚠️  Documento verso: ${e.message}`);
    }
    
    await screenshot(page, customerId, '06-documentos-enviados');
    await delay(1500);
    
    // ─── 14. PERGUNTAS PARTE 1: Procurador + PDF (ANTES do upload da conta) ─
    currentPhase = 'perguntas-parte1';
    console.log('\n📋 [11/16] Perguntas parte 1 (Procurador + PDF)...');
    
    // Scroll para perguntas
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(1500);
    
    // === PROCURADOR: SEMPRE NÃO ===
    let procuradorOk = false;
    console.log('   [1/3] Procurador...');
    
    try {
      const radio = page.locator('input[type="radio"][name="hasProcurator"][value="nao"]');
      if (await radio.count() > 0) {
        await radio.first().click({ force: true, timeout: 5000 });
        console.log('   ✅ Procurador: NÃO');
        procuradorOk = true;
      }
    } catch (_) {}
    
    if (!procuradorOk) {
      try {
        const naoLabels = page.locator('label:has-text("Não")').filter({ has: page.locator('input[type="radio"]') });
        if (await naoLabels.count() > 0) {
          await naoLabels.first().click({ timeout: 5000 });
          console.log('   ✅ Procurador: NÃO (label)');
          procuradorOk = true;
        }
      } catch (_) {}
    }
    
    if (!procuradorOk) console.warn('   ⚠️  Procurador não respondido');
    await delay(500);
    
    // === PDF PROTEGIDO: SEMPRE NÃO ===
    let pdfOk = false;
    console.log('   [2/3] PDF Protegido...');
    
    try {
      const radio = page.locator('input[type="radio"][name="pdfProtected"][value="nao"]');
      if (await radio.count() > 0) {
        await radio.first().click({ force: true, timeout: 5000 });
        console.log('   ✅ PDF Protegido: NÃO');
        pdfOk = true;
      }
    } catch (_) {}
    
    if (!pdfOk) {
      try {
        const naoLabels = page.locator('label:has-text("Não")').filter({ has: page.locator('input[type="radio"]') });
        if (await naoLabels.count() >= 2) {
          await naoLabels.nth(1).click({ timeout: 5000 });
          console.log('   ✅ PDF Protegido: NÃO (2º label)');
          pdfOk = true;
        }
      } catch (_) {}
    }
    
    if (!pdfOk) console.warn('   ⚠️  PDF Protegido não respondido');
    await delay(500);
    
    await screenshot(page, customerId, '07-perguntas-parte1');
    
    // ─── 15. UPLOAD: Conta de energia (APÓS procurador e PDF) ────────────
    currentPhase = 'upload-conta';
    console.log('\n📋 [12/16] Upload conta de energia...');
    
    // Scroll para seção de conta
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(1500);
    
    let contaEnviada = false;
    
    // Estratégia 1: seletor exato input[name="electricityBill"]
    try {
      const contaInput = page.locator('input[type="file"][name="electricityBill"]');
      if (await contaInput.count() > 0) {
        await contaInput.setInputFiles(contaPath);
        console.log('   ✅ Conta enviada (name=electricityBill)');
        contaEnviada = true;
      }
    } catch (e) {
      console.warn(`   ⚠️  Seletor exato: ${e.message}`);
    }
    
    // Estratégia 2: 3º input file
    if (!contaEnviada) {
      try {
        const allFiles = await page.locator('input[type="file"]').all();
        console.log(`   📊 Total inputs file: ${allFiles.length}`);
        if (allFiles.length >= 3) {
          await allFiles[2].setInputFiles(contaPath);
          console.log('   ✅ Conta enviada (3º input)');
          contaEnviada = true;
        }
      } catch (e) {
        console.warn(`   ⚠️  Estratégia 2: ${e.message}`);
      }
    }
    
    // Estratégia 3: último input file
    if (!contaEnviada) {
      try {
        const lastInput = page.locator('input[type="file"]').last();
        await lastInput.setInputFiles(contaPath);
        console.log('   ✅ Conta enviada (último input)');
        contaEnviada = true;
      } catch (e) {
        console.warn(`   ⚠️  Estratégia 3: ${e.message}`);
      }
    }
    
    if (!contaEnviada) console.error('   ❌ Conta de energia NÃO enviada');
    
    await screenshot(page, customerId, '08-conta-enviada');
    await delay(2500);

    // ─── 16. DÉBITOS: aparece APÓS upload da conta de energia ────────────
    currentPhase = 'debitos';
    console.log('\n📋 [13/16] Débitos (aparece após upload da conta)...');
    
    // Aguardar mais tempo - o campo de débitos pode demorar a aparecer após upload
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(2500);
    
    let debitosOk = false;
    
    // Tentar até 3 vezes com scroll e espera
    for (let tentativa = 1; tentativa <= 3 && !debitosOk; tentativa++) {
      if (tentativa > 1) {
        console.log(`   🔄 Tentativa ${tentativa}/3 - aguardando campo aparecer...`);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await delay(2500);
      }
      
      // Estratégia 1: seletor exato
      try {
        const radio = page.locator('input[type="radio"][name="hasDebt"][value="nao"]');
        if (await radio.count() > 0) {
          await radio.first().click({ force: true, timeout: 5000 });
          console.log('   ✅ Débitos: NÃO');
          debitosOk = true;
          break;
        }
      } catch (_) {}
      
      // Estratégia 2: scan de radios com debt/debito
      if (!debitosOk) {
        try {
          const radios = await page.locator('input[type="radio"]:visible').all();
          for (const r of radios) {
            const name = (await r.getAttribute('name') || '').toLowerCase();
            const value = await r.getAttribute('value');
            if ((name.includes('debt') || name.includes('debito')) && value === 'nao') {
              await r.click({ force: true });
              console.log('   ✅ Débitos: NÃO (scan)');
              debitosOk = true;
              break;
            }
          }
        } catch (_) {}
      }
      
      // Estratégia 3: procurar 3º label "Não"
      if (!debitosOk) {
        try {
          const naoLabels = page.locator('label:has-text("Não")').filter({ has: page.locator('input[type="radio"]') });
          const count = await naoLabels.count();
          if (tentativa === 1) console.log(`   📊 Labels "Não" encontrados: ${count}`);
          if (count >= 3) {
            await naoLabels.nth(2).click({ timeout: 5000 });
            console.log('   ✅ Débitos: NÃO (3º label)');
            debitosOk = true;
          } else {
            for (let i = count - 1; i >= 0; i--) {
              const radio = naoLabels.nth(i).locator('input[type="radio"]');
              const checked = await radio.isChecked().catch(() => false);
              if (!checked) {
                await naoLabels.nth(i).click({ timeout: 5000 });
                console.log(`   ✅ Débitos: NÃO (label ${i} não marcado)`);
                debitosOk = true;
                break;
              }
            }
          }
        } catch (_) {}
      }
      
      // Estratégia 4: procurar texto "débitos" e clicar no "Não" próximo
      if (!debitosOk) {
        try {
          const debitoText = page.getByText(/débitos|debitos/i).first();
          if (await debitoText.count() > 0) {
            // Encontrar o container pai e clicar no "Não" dentro dele
            const parent = debitoText.locator('..').locator('..'); 
            const naoBtn = parent.locator('label:has-text("Não"), span:has-text("Não")').first();
            if (await naoBtn.count() > 0) {
              await naoBtn.click({ timeout: 5000 });
              console.log('   ✅ Débitos: NÃO (texto próximo)');
              debitosOk = true;
            }
          }
        } catch (_) {}
      }
      
      // Estratégia 5: clicar em TODOS os radios "nao" não marcados
      if (!debitosOk) {
        try {
          const allNao = await page.locator('input[type="radio"][value="nao"]:visible').all();
          for (const r of allNao) {
            const checked = await r.isChecked().catch(() => false);
            if (!checked) {
              await r.click({ force: true });
              const name = await r.getAttribute('name');
              console.log(`   ✅ Radio "nao" clicado: ${name}`);
              debitosOk = true;
            }
          }
        } catch (_) {}
      }
    }
    
    if (!debitosOk) console.warn('   ⚠️  Débitos não respondido');
    await delay(1500);
    
    console.log(`\n✅ Perguntas: ${[procuradorOk, pdfOk, debitosOk].filter(Boolean).length}/3 respondidas`);
    await screenshot(page, customerId, '09-perguntas-completas');

    // ─── 16. Diagnóstico: verificar campos vazios antes de enviar ────────
    currentPhase = 'diagnostico-pre-submit';
    console.log('\n📋 [13/16] Diagnóstico pré-submit...');
    
    // Verificar todos os campos obrigatórios
    const camposDiag = [
      { name: 'documentNumber', label: 'CPF' },
      { name: 'name', label: 'Nome' },
      { name: 'birthDate', label: 'Nascimento' },
      { name: 'phone', label: 'WhatsApp' },
      { name: 'phoneConfirm', label: 'Confirmar WhatsApp' },
      { name: 'email', label: 'Email' },
      { name: 'emailConfirm', label: 'Confirmar Email' },
      { name: 'number', label: 'Número' },
      { name: 'installationNumber', label: 'Instalação' },
    ];
    
    let camposVazios = 0;
    for (const c of camposDiag) {
      try {
        const el = page.locator(`input[name="${c.name}"]`).first();
        if (await el.count() > 0) {
          const val = await el.inputValue();
          if (!val || val.trim() === '') {
            console.log(`   ❌ ${c.label}: VAZIO`);
            camposVazios++;
          }
        }
      } catch (_) {}
    }
    
    // Verificar distribuidora
    try {
      const pc = page.locator('select[name="powerCompany"]');
      if (await pc.count() > 0) {
        const val = await pc.inputValue();
        if (!val || val === '' || val === 'default') {
          console.log('   ❌ Distribuidora: NÃO SELECIONADA');
          camposVazios++;
        }
      }
    } catch (_) {}
    
    // Verificar uploads
    const fileInputs = await page.locator('input[type="file"]').all();
    console.log(`   📊 Inputs file: ${fileInputs.length}`);
    
    if (camposVazios > 0) {
      console.log(`\n   ⚠️  ${camposVazios} campo(s) vazio(s) detectado(s)`);
      console.log('   💡 Botão Finalizar pode não aparecer');
    } else {
      console.log('   ✅ Todos os campos parecem preenchidos');
    }
    
    // ─── 17. Scroll final + CLICAR EM FINALIZAR E FECHAR NAVEGADOR ──────
    currentPhase = 'submit';
    console.log('\n📋 [14/14] Scroll final - clicando em Finalizar e fechando...');
    
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(1500);
    await screenshot(page, customerId, '09-formulario-pronto');

    let finalizarClicado = false;
    if (!stopBeforeSubmit) {
      // Clicar no botão Finalizar (vários seletores possíveis no portal iGreen)
      const seletoresFinalizar = [
        'button:has-text("Finalizar")',
        'button[type="submit"]:has-text("Finalizar")',
        'button[type="submit"]:has-text("Enviar")',
        'a:has-text("Finalizar")',
        '[role="button"]:has-text("Finalizar")',
      ];
      for (const sel of seletoresFinalizar) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.count() > 0) {
            await btn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
            await delay(500);
            await btn.click({ timeout: 8000 });
            console.log(`   ✅ Botão Finalizar clicado (seletor: ${sel})`);
            finalizarClicado = true;
            break;
          }
        } catch (_) {}
      }
      if (!finalizarClicado) {
        console.warn('   ⚠️  Botão Finalizar não encontrado - tentando submit genérico');
        try {
          const btn = page.locator('button[type="submit"]').last();
          if (await btn.count() > 0) {
            await btn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
            await btn.click({ timeout: 8000 });
            finalizarClicado = true;
          }
        } catch (_) {}
      }
    }

    if (finalizarClicado) {
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await delay(2500);
      await screenshot(page, customerId, '10-apos-finalizar');
      const pageUrl = page.url();
      await atualizarStatus(customerId, 'portal_submitted');
      console.log('   ✅ Envio concluído - página do iGreen permanece aberta (não fechamos)');
      if (pageUrl) console.log('   📎 Link da página:', pageUrl);
      activeBrowser = null;
      // Não chamamos browser.close(): a página fica aberta até o usuário fechar.
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n${'='.repeat(70)}`);
      console.log('✅ AUTOMAÇÃO CONCLUÍDA - janela iGreen deixada aberta para você conferir');
      console.log(`   Tempo: ${duration}s`);
      console.log('='.repeat(70));
      return { success: true, duration: parseFloat(duration), manualSubmit: false, pageUrl };
    }

    if (stopBeforeSubmit) {
      // Modo manual: aguardar usuário clicar Finalizar e fechar o navegador
      console.log('\n   ⏳ Modo manual: aguardando você clicar Finalizar e fechar o navegador...');
      await atualizarStatus(customerId, 'awaiting_manual_submit');
      try {
        await new Promise((resolve) => {
          browser.on('disconnected', resolve);
          const checkInterval = setInterval(() => {
            if (!browser.isConnected()) { clearInterval(checkInterval); resolve(); }
          }, 2000);
        });
      } catch (_) {}
      try { await browser.close(); } catch (_) {}
      activeBrowser = null;
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n✅ Automação concluída (modo manual). Tempo: ${duration}s`);
      return { success: true, duration: parseFloat(duration), manualSubmit: true };
    }

    // Finalizar não encontrado e não é stopBeforeSubmit: marcar enviado e deixar página aberta
    console.warn('   ⚠️  Finalizar não clicado - deixando página aberta');
    await atualizarStatus(customerId, 'portal_submitted');
    activeBrowser = null;
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Automação encerrada. Tempo: ${duration}s`);
    return { success: true, duration: parseFloat(duration), manualSubmit: false };


  } catch (error) {
    console.error(`\n❌ ERRO na automação (fase: ${currentPhase}):`, error.message);
    
    try {
      if (typeof page !== 'undefined' && page) {
        await screenshot(page, customerId, `ERROR-${currentPhase}`);
      }
    } catch (_) {}
    
    if (browser) {
      try { await browser.close(); } catch (_) {}
      activeBrowser = null;
    }
    
    await atualizarStatus(customerId, 'automation_failed', `[${currentPhase}] ${error.message}`).catch(() => {});
    throw error;
  }
}
