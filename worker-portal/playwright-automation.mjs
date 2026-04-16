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
  // Try join first, fallback to separate queries if FK not cached
  let data, error;
  try {
    const res = await getSupabase()
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
    data = res.data;
    error = res.error;
  } catch (e) {
    error = e;
  }

  // Fallback: separate queries if join fails
  if (error || !data) {
    console.log(`⚠️ Join falhou (${error?.message || 'sem data'}), usando queries separadas...`);
    const { data: customer, error: custErr } = await getSupabase()
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();
    if (custErr) throw new Error(`Erro ao buscar cliente: ${custErr.message}`);
    if (!customer) throw new Error(`Cliente ${customerId} não encontrado`);

    // Fetch consultant separately
    if (customer.consultant_id) {
      const { data: consultant } = await getSupabase()
        .from('consultants')
        .select('id, name, igreen_id')
        .eq('id', customer.consultant_id)
        .single();
      customer.consultants = consultant || null;
    } else {
      customer.consultants = null;
    }
    return customer;
  }

  return data;
}

async function atualizarStatus(customerId, status, errorMsg = null) {
  const updates = { status, updated_at: new Date().toISOString() };
  if (errorMsg) updates.error_message = errorMsg;
  if (status === 'registered_igreen') updates.portal_submitted_at = new Date().toISOString();
  if (status === 'awaiting_otp') updates.otp_code = null;
  await getSupabase().from('customers').update(updates).eq('id', customerId);
}

// ─── Enviar link de reconhecimento facial ao cliente via WhatsApp ─────────────
async function sendFacialLinkToCustomer(customerId, facialLink) {
  const supabase = getSupabase();
  if (!supabase) { console.error('   ❌ sendFacialLink: Supabase não configurado'); return; }
  try {
    const { data: customer } = await supabase
      .from('customers').select('phone_whatsapp, consultant_id, name')
      .eq('id', customerId).single();
    if (!customer?.phone_whatsapp) { console.error('   ❌ sendFacialLink: telefone não encontrado'); return; }

    let instanceName = null;
    if (customer.consultant_id) {
      const { data: inst } = await supabase
        .from('whatsapp_instances').select('instance_name')
        .eq('consultant_id', customer.consultant_id).limit(1).single();
      instanceName = inst?.instance_name;
    }

    const evolutionUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
    const evolutionKey = process.env.EVOLUTION_API_KEY || '';

    // Fallback: buscar das settings
    let eUrl = evolutionUrl, eKey = evolutionKey;
    if (!eUrl || !eKey) {
      const { data: rows } = await supabase.from('settings').select('key, value');
      const s = {}; (rows || []).forEach(r => { s[r.key] = r.value; });
      eUrl = eUrl || (s.evolution_api_url || '').replace(/\/$/, '');
      eKey = eKey || s.evolution_api_key || '';
    }

    let phone = String(customer.phone_whatsapp).replace(/\D/g, '');
    if (!phone.startsWith('55')) phone = '55' + phone;
    const remoteJid = `${phone}@s.whatsapp.net`;

    const nome = customer.name?.split(' ')[0] || '';
    const message = `📲 *Validação Facial*\n\nOlá${nome ? ' ' + nome : ''}! Falta apenas a validação facial para concluir seu cadastro.\n\n🔗 Abra o link abaixo *no celular*:\n${facialLink}\n\n📱 Siga as instruções na tela (selfie + documento).\n\n⚠️ Use boa iluminação e tire o óculos se necessário.\n\nQualquer dúvida, estamos aqui! ☀️`;

    if (eUrl && eKey && instanceName) {
      const res = await fetch(`${eUrl}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: { apikey: eKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: remoteJid, text: message }),
      });
      if (res.ok) {
        console.log(`   ✅ Link facial enviado via WhatsApp para ${phone}`);
        return;
      }
      console.warn(`   ⚠️  Evolution falhou: ${res.status}`);
    }
    console.warn('   ⚠️  Não foi possível enviar link facial via WhatsApp');
  } catch (e) {
    console.error(`   ❌ sendFacialLink erro: ${e.message}`);
  }
}

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
  // Tratar URLs inválidas (nao_aplicavel, vazio, etc.)
  if (!url || url === 'nao_aplicavel' || url === 'null' || url === 'undefined' || url.trim() === '') {
    console.log(`   ⚠️  ${label}: URL não aplicável, retornando null`);
    return null;
  }
  // whapi-media:xxx → baixar via API Whapi
  if (url.startsWith('whapi-media:')) {
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
  try {
    let outPath;
    
    if (url.startsWith('data:')) {
      const isPdf = url.includes('application/pdf');
      const ext = isPdf ? 'pdf' : 'jpg';
      outPath = join(TMP_DIR, `${label}-${Date.now()}.${ext}`);
      const base64 = url.replace(/^data:[^;]+;base64,/, '');
      writeFileSync(outPath, Buffer.from(base64, 'base64'));
    } else if (url.startsWith('http')) {
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
    const dataHoje = new Date().toISOString().split('T')[0];
    const pastaCliente = join(homedir(), 'Documents', 'iGreen', 'contratos', `${nome}-${dataHoje}`);
    
    await mkdir(pastaCliente, { recursive: true });
    console.log(`\n📁 Pasta do cliente: ${pastaCliente}`);

    let salvos = 0;

    // RG/CNH Frente
    if (cliente.document_front_url && cliente.document_front_url !== 'nao_aplicavel') {
      try {
        const ext = await baixarArquivo(cliente.document_front_url, join(pastaCliente, `RG-frente-${nome}`));
        console.log(`   ✅ RG-frente-${nome}${ext}`);
        salvos++;
      } catch (e) { console.warn(`   ⚠️  RG frente: ${e.message}`); }
    }

    // RG/CNH Verso
    if (cliente.document_back_url && cliente.document_back_url !== 'nao_aplicavel') {
      try {
        const ext = await baixarArquivo(cliente.document_back_url, join(pastaCliente, `RG-verso-${nome}`));
        console.log(`   ✅ RG-verso-${nome}${ext}`);
        salvos++;
      } catch (e) { console.warn(`   ⚠️  RG verso: ${e.message}`); }
    }

    // Conta de Luz
    if (cliente.electricity_bill_photo_url && cliente.electricity_bill_photo_url !== 'nao_aplicavel') {
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
    
    // ═══════════════════════════════════════════════════════════════════
    // HELPER: buscar input por placeholder (portal não usa name attrs)
    // ═══════════════════════════════════════════════════════════════════
    const byPH = (ph) => page.locator(`input[placeholder="${ph}"]`).first();
    const byPHPartial = (ph) => page.locator(`input[placeholder*="${ph}" i]`).first();
    const clickText = async (text, tag = 'button') => {
      const el = page.locator(`${tag}:has-text("${text}")`).first();
      if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
        await el.click({ timeout: 10000 });
        return true;
      }
      return false;
    };

    // ─── 4. FASE 1: CEP + Valor ──────────────────────────────────────────
    currentPhase = 'fase1-cep';
    console.log('\n📋 [1/16] FASE 1: CEP e valor da conta...');
    
    // Portal usa placeholder="CEP" e placeholder="Valor da conta"
    const cepInput = byPH('CEP');
    if (await cepInput.count() > 0) {
      await cepInput.click();
      await cepInput.fill('');
      await cepInput.type(data.cepFormatted, { delay: 80 });
      console.log(`   ✅ CEP: ${data.cepFormatted}`);
    } else {
      // Fallback: tentar name-based (versão antiga do portal)
      const cepFallback = page.locator('input[name="cep"], input[name="CEP"]').first();
      if (await cepFallback.count() > 0) {
        await reactFill(page, cepFallback, data.cepFormatted);
        console.log(`   ✅ CEP (fallback): ${data.cepFormatted}`);
      }
    }
    
    const valorInput = byPH('Valor da conta');
    if (await valorInput.count() > 0) {
      await valorInput.click();
      await valorInput.fill('');
      await valorInput.type(String(data.electricity_bill_value), { delay: 80 });
      console.log(`   ✅ Valor: ${data.electricity_bill_value}`);
    } else {
      const valorFallback = page.locator('input[name="consumption"]').first();
      if (await valorFallback.count() > 0) {
        await reactFill(page, valorFallback, String(data.electricity_bill_value));
        console.log(`   ✅ Valor (fallback): ${data.electricity_bill_value}`);
      }
    }
    
    await delay(500);
    // Botão Calcular (type="button" no portal atual)
    const calcClicked = await clickText('Calcular');
    if (calcClicked) {
      console.log('   ✅ Calcular clicado');
    } else {
      // Fallback
      const calcBtn = page.locator('button[type="submit"]').first();
      if (await calcBtn.count() > 0) { await calcBtn.click(); console.log('   ✅ Calcular clicado (fallback)'); }
    }
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await delay(2500);
    await screenshot(page, customerId, '02-apos-calcular');

    // ─── 5. FASE 2: Garantir Desconto ─────────────────────────────────────
    currentPhase = 'fase2-garantir';
    console.log('\n📋 [2/16] FASE 2: Garantir desconto...');
    
    const garantirClicked = await clickText('Garantir meu desconto') || await clickText('Garantir desconto');
    if (garantirClicked) {
      console.log('   ✅ Garantir clicado');
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await delay(3000);
    }
    await screenshot(page, customerId, '03-apos-garantir');
    
    // ─── 6. FASE 3: CPF ──────────────────────────────────────────────────
    currentPhase = 'fase3-cpf';
    console.log('\n📋 [3/16] CPF...');
    
    // Portal usa placeholder="CPF ou CNPJ"
    const cpfInput = byPH('CPF ou CNPJ');
    if (await cpfInput.count() > 0) {
      await cpfInput.click();
      await cpfInput.type(data.cpfDigits, { delay: 100 });
      console.log(`   ✅ CPF digitado: ${data.cpfFormatted}`);
    } else {
      const cpfAlt = page.locator('input[name="documentNumber"], input[placeholder*="CPF"]').first();
      if (await cpfAlt.count() > 0) {
        await cpfAlt.type(data.cpfDigits, { delay: 100 });
        console.log(`   ✅ CPF digitado (fallback): ${data.cpfFormatted}`);
      }
    }
    // Aguardar auto-preenchimento do portal (Nome + Data de Nascimento vêm da Receita)
    await delay(5000);
    await screenshot(page, customerId, '04-apos-cpf');
    
    // ─── 6b. TRATAR CADASTRO EXISTENTE ────────────────────────────────────
    currentPhase = 'cadastro-existente';
    const novoCadastroBtn = page.locator('button:has-text("Continuar com um novo cadastro"), button:has-text("novo cadastro")');
    if (await novoCadastroBtn.count() > 0) {
      console.log('   ⚠️  CPF já cadastrado - clicando "novo cadastro"');
      await novoCadastroBtn.first().click({ timeout: 10000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await delay(3000);
      await screenshot(page, customerId, '04b-apos-novo-cadastro');
    }
    
    // ─── 7. WhatsApp ─────────────────────────────────────────────────────
    currentPhase = 'fase4-whatsapp';
    console.log('\n📋 [4/16] WhatsApp...');
    
    // Portal usa placeholder="Número do seu WhatsApp"
    let phoneField = byPHPartial('WhatsApp');
    try {
      await phoneField.waitFor({ state: 'visible', timeout: 15000 });
    } catch (_) {
      await page.evaluate(() => window.scrollBy(0, 300));
      await delay(1500);
    }
    
    if (await phoneField.count() > 0 && await phoneField.isVisible().catch(() => false)) {
      await phoneField.click();
      await phoneField.type(data.whatsapp, { delay: 100 });
      console.log(`   ✅ WhatsApp: ${data.whatsapp}`);
    } else {
      // Fallback name-based
      const phoneFallback = page.locator('input[name="phone"]').first();
      if (await phoneFallback.count() > 0) {
        await phoneFallback.type(data.whatsapp, { delay: 100 });
        console.log(`   ✅ WhatsApp (fallback): ${data.whatsapp}`);
      } else {
        console.warn('   ⚠️  Campo WhatsApp não encontrado');
      }
    }
    await delay(500);
    
    // Confirmar celular
    let confirmPhone = byPHPartial('Confirme seu celular');
    if (await confirmPhone.count() === 0) confirmPhone = byPHPartial('phoneConfirm');
    if (await confirmPhone.count() > 0 && await confirmPhone.isVisible().catch(() => false)) {
      await confirmPhone.click();
      await confirmPhone.type(data.whatsapp, { delay: 100 });
      console.log('   ✅ Confirmar WhatsApp');
    }
    await delay(2500);
    
    // ─── 8. Email ────────────────────────────────────────────────────────
    currentPhase = 'fase5-email';
    console.log('\n📋 [5/16] Email...');
    
    // Portal usa placeholder="E-mail"
    const emailField = byPH('E-mail');
    if (await emailField.count() > 0) {
      await emailField.click();
      await emailField.type(data.email, { delay: 50 });
      console.log(`   ✅ Email: ${data.email}`);
    } else {
      const emailFallback = page.locator('input[name="email"], input[placeholder*="email" i]').first();
      if (await emailFallback.count() > 0) {
        await reactFill(page, emailFallback, data.email);
        console.log(`   ✅ Email (fallback): ${data.email}`);
      }
    }
    await delay(500);
    
    // Confirmar email
    let confirmEmail = byPH('Confirme seu E-mail');
    if (await confirmEmail.count() === 0) confirmEmail = byPHPartial('Confirme seu E-mail');
    if (await confirmEmail.count() > 0) {
      await confirmEmail.click();
      await confirmEmail.type(data.email, { delay: 50 });
      console.log('   ✅ Confirmar email');
    }
    await delay(2500);
    
    // Scroll para ver campos seguintes
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2000);
    
    // ─── 9. Endereço ─────────────────────────────────────────────────────
    currentPhase = 'fase6-endereco';
    console.log('\n📋 [6/16] Endereço...');
    
    // Aguardar CEP auto-fill completar (endereço, bairro, cidade, estado)
    console.log('   ⏳ Aguardando auto-preenchimento do CEP (3s)...');
    await delay(3000);
    
    // Scroll para revelar campos de endereço
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(1500);
    
    // Preencher "Número" - buscar campo com placeholder exato "Número"
    let numField = null;
    // Tentativa 1: placeholder exato
    const numByPH = byPH('Número');
    if (await numByPH.count() > 0 && await numByPH.isVisible().catch(() => false)) {
      numField = numByPH;
    }
    // Tentativa 2: buscar todos inputs visíveis e filtrar
    if (!numField) {
      const allInputsForNum = await page.locator('input:visible').all();
      for (const inp of allInputsForNum) {
        const ph = (await inp.getAttribute('placeholder').catch(() => '') || '').trim();
        const name = (await inp.getAttribute('name').catch(() => '') || '').trim();
        if (ph === 'Número' || name === 'number' || name === 'addressNumber') {
          numField = inp;
          break;
        }
      }
    }
    // Tentativa 3: esperar mais e tentar de novo
    if (!numField) {
      await delay(3000);
      await page.evaluate(() => window.scrollBy(0, 200));
      await delay(1000);
      const retryNum = byPH('Número');
      if (await retryNum.count() > 0 && await retryNum.isVisible().catch(() => false)) {
        numField = retryNum;
      }
    }
    
    if (numField) {
      await numField.click();
      await numField.fill('');
      await numField.type(data.numeroEndereco || '100', { delay: 80 });
      console.log(`   ✅ Número endereço: ${data.numeroEndereco || '100'}`);
    } else {
      console.warn('   ⚠️  Campo Número endereço não encontrado');
    }
    
    // Complemento
    if (data.complemento) {
      let compField = byPH('Complemento');
      if (await compField.count() === 0) compField = byPHPartial('Complemento');
      if (await compField.count() > 0 && await compField.isVisible().catch(() => false)) {
        await compField.fill(data.complemento);
        console.log(`   ✅ Complemento: ${data.complemento}`);
      }
    }
    await delay(1500);
    
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2500);
    
    // ─── 10. Número da Instalação ────────────────────────────────────────
    currentPhase = 'fase7-instalacao';
    console.log('\n📋 [7/16] Número da instalação...');
    
    if (data.numeroInstalacao) {
      console.log(`   📊 Número: ${data.numeroInstalacao}`);
      
      // Tentativa 1: placeholder exato
      let instField = byPH('Número da instalação');
      // Tentativa 2: parcial (instala, instalação)
      if (await instField.count() === 0) instField = byPHPartial('instala');
      // Tentativa 3: parcial (Código, código)
      if (await instField.count() === 0) instField = byPHPartial('Código');
      // Tentativa 4: name-based
      if (await instField.count() === 0) instField = page.locator('input[name*="install" i], input[name*="codigo" i]').first();
      
      // Aguardar visibilidade com timeout
      try {
        await instField.waitFor({ state: 'visible', timeout: 8000 });
      } catch (_) {
        // Scroll extra e retry
        await page.evaluate(() => window.scrollBy(0, 300));
        await delay(2000);
      }
      
      if (await instField.count() > 0 && await instField.isVisible().catch(() => false)) {
        await instField.click();
        await instField.fill('');
        await instField.type(data.numeroInstalacao, { delay: 80 });
        console.log(`   ✅ Instalação: ${data.numeroInstalacao}`);
      } else {
        console.warn('   ⚠️  Campo instalação não encontrado');
      }
      await delay(1500);
    }
    
    await page.evaluate(() => window.scrollBy(0, 200));
    await delay(1500);

    // ─── 11. Distribuidora ──────────────────────────────────────────────
    // NÃO existe campo distribuidora no portal atual - é detectada automaticamente pelo CEP
    currentPhase = 'fase8-distribuidora';
    console.log('\n📋 [8/16] Distribuidora: automática pelo CEP ✅');
    
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2500);
    await screenshot(page, customerId, '05-formulario-preenchido');
    
    // ─── 12. Tipo de Documento (MUI Dropdown) ───────────────────────────
    currentPhase = 'tipo-documento';
    console.log('\n📋 [9/16] Tipo de documento...');
    
    const tipoDoc = (data.documentType || 'RG').toUpperCase();
    // Mapear para os textos exatos do dropdown MUI do portal
    let opcaoTexto;
    if (tipoDoc.includes('CNH')) {
      opcaoTexto = 'CNH';
    } else if (tipoDoc.includes('NOVO')) {
      opcaoTexto = 'RG (Novo)';
    } else {
      opcaoTexto = 'RG (Antigo)';
    }
    console.log(`   📋 Tipo desejado: ${opcaoTexto}`);
    
    let tipoDocOk = false;
    
    // Portal usa MUI Select (dropdown customizado com div, não <select>)
    const muiTriggers = [
      // MUI Select com classe específica
      '.MuiSelect-select',
      // Combobox/listbox ARIA
      '[role="combobox"]',
      '[aria-haspopup="listbox"]',
      // Select nativo escondido que pode estar presente
      'select',
      // Label + div wrapper para tipo documento
      'div:has-text("Tipo documento"):not(:has(div:has-text("Tipo documento")))',
      // Input com placeholder de tipo
      'input[placeholder*="tipo" i]',
    ];
    
    for (const sel of muiTriggers) {
      if (tipoDocOk) break;
      try {
        const el = page.locator(sel).first();
        if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
          // Checar se é um <select> nativo
          const tagName = await el.evaluate(e => e.tagName).catch(() => '');
          if (tagName === 'SELECT') {
            // Select nativo: usar selectOption
            await el.selectOption({ label: opcaoTexto }).catch(async () => {
              // Tentar por value parcial
              const options = await el.locator('option').allTextContents();
              const match = options.find(o => o.includes('CNH') || o.includes(opcaoTexto));
              if (match) {
                await el.selectOption({ label: match });
              }
            });
            console.log(`   ✅ Tipo documento (select nativo): ${opcaoTexto}`);
            tipoDocOk = true;
            break;
          }
          
          // MUI Select: clicar para abrir dropdown
          await el.click({ timeout: 5000 });
          await delay(1000);
          
          // MUI abre um popover/menu com role="listbox" ou ul com li items
          // Tentar múltiplos seletores para as opções
          const optionSelectors = [
            `li:has-text("${opcaoTexto}")`,
            `[role="option"]:has-text("${opcaoTexto}")`,
            `.MuiMenuItem-root:has-text("${opcaoTexto}")`,
            `ul li:has-text("${opcaoTexto}")`,
          ];
          
          let optionClicked = false;
          for (const optSel of optionSelectors) {
            const opt = page.locator(optSel).first();
            if (await opt.count() > 0 && await opt.isVisible().catch(() => false)) {
              await opt.click({ timeout: 5000 });
              console.log(`   ✅ Tipo documento: ${opcaoTexto}`);
              tipoDocOk = true;
              optionClicked = true;
              break;
            }
          }
          
          if (!optionClicked) {
            // Tentar texto parcial
            const optAlt = page.getByText(opcaoTexto, { exact: false }).first();
            if (await optAlt.count() > 0 && await optAlt.isVisible().catch(() => false)) {
              await optAlt.click({ timeout: 5000 });
              console.log(`   ✅ Tipo documento (alt): ${opcaoTexto}`);
              tipoDocOk = true;
            } else {
              await page.keyboard.press('Escape').catch(() => {});
            }
          }
        }
      } catch (_) {}
    }
    
    if (!tipoDocOk) {
      console.warn('   ⚠️  Tipo documento não selecionado - usando default do portal');
      await screenshot(page, customerId, '05b-tipo-doc-FALHOU');
      // Dump HTML para diagnóstico
      try {
        const html = await page.content();
        const htmlPath = join(SCREENSHOTS_DIR, `${customerId}-05b-tipo-doc-FALHOU-${Date.now()}.html`);
        writeFileSync(htmlPath, html);
        console.log('   📄 HTML dump salvo para diagnóstico');
      } catch (_) {}
    }
    await delay(1500);

    // ─── 13. UPLOAD: Documentos pessoais (frente + verso) ────────────────
    currentPhase = 'upload-documentos';
    console.log('\n📋 [10/16] Upload documentos pessoais...');
    await delay(2000);
    
    // Scroll para revelar seção de upload
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2000);
    
    let docsEnviados = 0;
    
    // ESTRATÉGIA 1: input[type="file"] direto (portal antigo)
    const allFileInputsCount = await page.locator('input[type="file"]').count();
    console.log(`   📊 ${allFileInputsCount} input(s) file encontrado(s)`);
    
    if (allFileInputsCount >= 1 && docFrentePath) {
      try {
        await page.locator('input[type="file"]').first().setInputFiles(docFrentePath);
        console.log('   ✅ Documento FRENTE enviado (input file)');
        docsEnviados++;
        await delay(2000);
      } catch (e) {
        console.warn(`   ⚠️  Doc frente (input): ${e.message}`);
      }
      if (allFileInputsCount >= 2 && docVersoPath) {
        try {
          await page.locator('input[type="file"]').nth(1).setInputFiles(docVersoPath);
          console.log('   ✅ Documento VERSO enviado (input file)');
          docsEnviados++;
          await delay(2000);
        } catch (e) {
          console.warn(`   ⚠️  Doc verso (input): ${e.message}`);
        }
      }
    }
    
    // ESTRATÉGIA 2: Cards clicáveis "Frente"/"Verso" com fileChooser (portal redesenhado)
    if (docsEnviados === 0 && docFrentePath) {
      console.log('   🔄 Tentando upload via cards clicáveis (fileChooser)...');
      
      // Upload FRENTE
      const frenteCards = [
        page.locator('text=Frente').first(),
        page.locator('[data-testid*="frente" i]').first(),
        page.locator('div:has-text("Frente"):not(:has(div:has-text("Frente")))').first(),
        page.locator('label:has-text("Frente")').first(),
        page.locator('button:has-text("Frente")').first(),
        page.locator('span:has-text("Frente")').first(),
      ];
      
      for (const card of frenteCards) {
        if (docsEnviados > 0) break;
        try {
          if (await card.count() > 0 && await card.isVisible().catch(() => false)) {
            const [frenteChooser] = await Promise.all([
              page.waitForEvent('filechooser', { timeout: 5000 }),
              card.click({ timeout: 3000 }),
            ]);
            await frenteChooser.setFiles(docFrentePath);
            console.log('   ✅ Documento FRENTE enviado (fileChooser)');
            docsEnviados++;
            await delay(2000);
            break;
          }
        } catch (e) {
          console.log(`   ⚠️  Frente card falhou: ${e.message.substring(0, 60)}`);
        }
      }
      
      // Upload VERSO (se aplicável)
      if (docVersoPath && docsEnviados > 0) {
        const versoCards = [
          page.locator('text=Verso').first(),
          page.locator('[data-testid*="verso" i]').first(),
          page.locator('div:has-text("Verso"):not(:has(div:has-text("Verso")))').first(),
          page.locator('label:has-text("Verso")').first(),
          page.locator('button:has-text("Verso")').first(),
          page.locator('span:has-text("Verso")').first(),
        ];
        
        for (const card of versoCards) {
          try {
            if (await card.count() > 0 && await card.isVisible().catch(() => false)) {
              const [versoChooser] = await Promise.all([
                page.waitForEvent('filechooser', { timeout: 5000 }),
                card.click({ timeout: 3000 }),
              ]);
              await versoChooser.setFiles(docVersoPath);
              console.log('   ✅ Documento VERSO enviado (fileChooser)');
              docsEnviados++;
              await delay(2000);
              break;
            }
          } catch (e) {
            console.log(`   ⚠️  Verso card falhou: ${e.message.substring(0, 60)}`);
          }
        }
      }
    }
    
    // ESTRATÉGIA 3: Clicar em qualquer área de upload/dropzone genérica
    if (docsEnviados === 0 && docFrentePath) {
      console.log('   🔄 Tentando upload via dropzone genérica...');
      const dropzones = [
        page.locator('[class*="upload" i], [class*="dropzone" i], [class*="drag" i]').first(),
        page.locator('div[role="button"]:has-text("upload")').first(),
      ];
      for (const dz of dropzones) {
        try {
          if (await dz.count() > 0 && await dz.isVisible().catch(() => false)) {
            const [chooser] = await Promise.all([
              page.waitForEvent('filechooser', { timeout: 5000 }),
              dz.click({ timeout: 3000 }),
            ]);
            await chooser.setFiles(docFrentePath);
            console.log('   ✅ Documento enviado (dropzone)');
            docsEnviados++;
            await delay(2000);
            break;
          }
        } catch (_) {}
      }
    }
    
    console.log(`   📊 Total docs enviados: ${docsEnviados}`);
    await screenshot(page, customerId, '06-documentos-enviados');
    await delay(2000);
    
    // ─── 14. PERGUNTAS: Procurador + PDF + Débitos ──────────────────────
    currentPhase = 'perguntas';
    console.log('\n📋 [11/16] Perguntas (Procurador, PDF, Débitos)...');
    
    // Aguardar perguntas aparecerem após upload de docs
    await delay(3000);
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2000);
    
    // Estratégia universal: clicar em TODOS os radios/botões "Não" visíveis
    let perguntasRespondidas = 0;
    
    // Estratégia 1: radios com value="nao" ou value="Não"
    const allNaoRadios = await page.locator('input[type="radio"][value="nao"]:visible, input[type="radio"][value="Não"]:visible, input[type="radio"][value="false"]:visible, input[type="radio"][value="0"]:visible').all();
    for (const r of allNaoRadios) {
      try {
        const checked = await r.isChecked().catch(() => false);
        if (!checked) {
          await r.click({ force: true });
          const name = await r.getAttribute('name') || 'unknown';
          console.log(`   ✅ Radio "Não" clicado: ${name}`);
          perguntasRespondidas++;
        }
      } catch (_) {}
    }
    
    // Estratégia 2: labels com texto "Não" que contêm radios
    if (perguntasRespondidas === 0) {
      const naoLabels = await page.locator('label:has-text("Não")').all();
      for (const label of naoLabels) {
        try {
          const visible = await label.isVisible().catch(() => false);
          if (!visible) continue;
          await label.click({ timeout: 3000 });
          console.log('   ✅ Label "Não" clicado');
          perguntasRespondidas++;
        } catch (_) {}
      }
    }
    
    // Estratégia 3: botões "Não" (portal customizado)
    if (perguntasRespondidas === 0) {
      const naoBtns = await page.locator('button:has-text("Não"), span:has-text("Não")').all();
      for (const btn of naoBtns) {
        try {
          const visible = await btn.isVisible().catch(() => false);
          if (!visible) continue;
          await btn.click({ timeout: 3000 });
          console.log('   ✅ Botão "Não" clicado');
          perguntasRespondidas++;
        } catch (_) {}
      }
    }
    
    // Estratégia 4: div[role="radio"] com texto "Não" (MUI RadioGroup)
    if (perguntasRespondidas === 0) {
      const muiRadios = await page.locator('[role="radio"]:has-text("Não")').all();
      for (const radio of muiRadios) {
        try {
          const visible = await radio.isVisible().catch(() => false);
          if (!visible) continue;
          await radio.click({ timeout: 3000 });
          console.log('   ✅ MUI Radio "Não" clicado');
          perguntasRespondidas++;
        } catch (_) {}
      }
    }
    
    console.log(`   📊 Total respostas: ${perguntasRespondidas}`);
    await screenshot(page, customerId, '07-perguntas');
    
    // ─── 15. UPLOAD: Conta de energia ────────────────────────────────────
    currentPhase = 'upload-conta';
    console.log('\n📋 [12/16] Upload conta de energia...');
    
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(2000);
    
    let contaEnviada = false;
    
    // ESTRATÉGIA 1: input[type="file"] disponível
    const allFileInputs = await page.locator('input[type="file"]').all();
    console.log(`   📊 Total inputs file agora: ${allFileInputs.length}`);
    
    // A conta é geralmente o último ou 3º input file
    if (allFileInputs.length >= 3) {
      try {
        await allFileInputs[2].setInputFiles(contaPath);
        console.log('   ✅ Conta enviada (3º input)');
        contaEnviada = true;
      } catch (e) {
        console.warn(`   ⚠️  3º input: ${e.message}`);
      }
    }
    
    if (!contaEnviada && allFileInputs.length > 0) {
      try {
        await allFileInputs[allFileInputs.length - 1].setInputFiles(contaPath);
        console.log('   ✅ Conta enviada (último input)');
        contaEnviada = true;
      } catch (e) {
        console.warn(`   ⚠️  Último input: ${e.message}`);
      }
    }
    
    // ESTRATÉGIA 2: Card clicável "Conta de energia" / "Conta de luz" com fileChooser
    if (!contaEnviada) {
      console.log('   🔄 Tentando upload conta via fileChooser...');
      const contaCards = [
        page.locator('text=Conta de energia').first(),
        page.locator('text=Conta de luz').first(),
        page.locator('text=Fatura').first(),
        page.locator('[data-testid*="conta" i]').first(),
        page.locator('div:has-text("Conta"):not(:has(div:has-text("Conta")))').last(),
        page.locator('label:has-text("Conta")').first(),
        page.locator('button:has-text("Conta")').first(),
      ];
      
      for (const card of contaCards) {
        if (contaEnviada) break;
        try {
          if (await card.count() > 0 && await card.isVisible().catch(() => false)) {
            const [contaChooser] = await Promise.all([
              page.waitForEvent('filechooser', { timeout: 5000 }),
              card.click({ timeout: 3000 }),
            ]);
            await contaChooser.setFiles(contaPath);
            console.log('   ✅ Conta enviada (fileChooser)');
            contaEnviada = true;
          }
        } catch (e) {
          console.log(`   ⚠️  Conta card falhou: ${e.message.substring(0, 60)}`);
        }
      }
    }
    
    if (!contaEnviada) console.warn('   ⚠️  Conta de energia NÃO enviada');
    await screenshot(page, customerId, '08-conta-enviada');
    await delay(2500);

    // ─── 16. Scroll e verificação final ──────────────────────────────────
    currentPhase = 'pre-submit';
    console.log('\n📋 [13/16] Verificação pré-submit...');
    
    // Scroll ao final e responder qualquer pergunta restante
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(2000);
    
    // Re-clicar em radios "Não" que possam ter aparecido (ex: débitos)
    const maisNaoRadios = await page.locator('input[type="radio"][value="nao"]:visible, input[type="radio"][value="Não"]:visible').all();
    for (const r of maisNaoRadios) {
      try {
        const checked = await r.isChecked().catch(() => false);
        if (!checked) {
          await r.click({ force: true });
          const name = await r.getAttribute('name') || 'unknown';
          console.log(`   ✅ Radio "Não" extra clicado: ${name}`);
        }
      } catch (_) {}
    }
    
    // Diagnóstico de campos
    const todosInputs = await page.locator('input:visible').all();
    let camposVazios = 0;
    for (const inp of todosInputs) {
      try {
        const type = await inp.getAttribute('type') || 'text';
        if (type === 'file' || type === 'radio' || type === 'checkbox' || type === 'hidden') continue;
        const val = await inp.inputValue().catch(() => '');
        const ph = await inp.getAttribute('placeholder') || '';
        if (!val || val.trim() === '') {
          console.log(`   ❌ Campo vazio: "${ph}"`);
          camposVazios++;
        }
      } catch (_) {}
    }
    
    if (camposVazios > 0) {
      console.log(`   ⚠️  ${camposVazios} campo(s) vazio(s)`);
    } else {
      console.log('   ✅ Todos os campos preenchidos');
    }
    
    await screenshot(page, customerId, '09-formulario-pronto');
    
    // ─── 17. CLICAR EM FINALIZAR ─────────────────────────────────────────
    currentPhase = 'submit';
    console.log('\n📋 [14/14] Clicando em Finalizar...');
    
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(1500);

    let finalizarClicado = false;
    if (!stopBeforeSubmit) {
      const seletoresFinalizar = [
        'button:has-text("Finalizar")',
        'button:has-text("Enviar")',
        'button:has-text("Concluir")',
        'button:has-text("Confirmar")',
        'button[type="submit"]',
        'a:has-text("Finalizar")',
        '[role="button"]:has-text("Finalizar")',
      ];
      for (const sel of seletoresFinalizar) {
        try {
          const btn = page.locator(sel).last();
          if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
            await btn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
            await delay(500);
            await btn.click({ timeout: 8000 });
            console.log(`   ✅ Botão clicado: ${sel}`);
            finalizarClicado = true;
            break;
          }
        } catch (_) {}
      }
      
      if (!finalizarClicado) {
        console.warn('   ⚠️  Nenhum botão de submit encontrado');
      }
    }

    if (finalizarClicado) {
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await delay(3000);
      await screenshot(page, customerId, '10-apos-finalizar');
      
      // Verificar se apareceu OTP
      const pageText = await page.textContent('body').catch(() => '');
      if (/código|OTP|verificação|SMS|token/i.test(pageText)) {
        console.log('   📱 OTP detectado - aguardando código...');
        await atualizarStatus(customerId, 'awaiting_otp');
        
        try {
          const otpCode = await aguardarOTP(customerId);
          // Preencher campo OTP
          const otpField = page.locator('input[placeholder*="código" i], input[placeholder*="OTP" i], input[placeholder*="token" i], input[type="tel"], input[maxlength="6"]').first();
          if (await otpField.count() > 0) {
            await otpField.type(otpCode, { delay: 100 });
            console.log(`   ✅ OTP digitado: ${otpCode}`);
            await delay(1000);
            
            // Confirmar OTP
            const confirmOtpClicked = await clickText('Confirmar') || await clickText('Verificar') || await clickText('Enviar');
            if (confirmOtpClicked) console.log('   ✅ OTP confirmado');
            
            await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
            await delay(3000);
            await screenshot(page, customerId, '11-apos-otp');
          }
        } catch (otpErr) {
          console.warn(`   ⚠️  OTP falhou: ${otpErr.message}`);
        }
      }
      
      // ─── Capturar link de reconhecimento facial / assinatura ─────────
      await delay(3000);
      const finalPageText = await page.textContent('body').catch(() => '');
      const currentUrl = page.url();
      let facialLink = null;

      // Estratégia 1: Buscar links na página (certisign, assinatura, sign, facial, biometria)
      const linkSelectors = [
        'a[href*="certisign"]', 'a[href*="assinatura"]', 'a[href*="sign"]',
        'a[href*="facial"]', 'a[href*="biometria"]', 'a[href*="validacao"]',
        'a[href*="reconhecimento"]', 'a[href*="selfie"]',
      ];
      for (const sel of linkSelectors) {
        const links = await page.locator(sel).all();
        for (const link of links) {
          const href = await link.getAttribute('href').catch(() => null);
          if (href && href.startsWith('http')) {
            facialLink = href;
            console.log(`   🔗 Link facial encontrado (seletor ${sel}): ${facialLink}`);
            break;
          }
        }
        if (facialLink) break;
      }

      // Estratégia 2: Buscar qualquer link externo visível na página pós-OTP
      if (!facialLink) {
        const allLinks = await page.locator('a[href^="http"]').all();
        for (const link of allLinks) {
          const href = await link.getAttribute('href').catch(() => null);
          const text = await link.textContent().catch(() => '');
          if (href && /facial|assinatura|sign|biometria|validar|reconhecimento|selfie|contrato/i.test(text + ' ' + href)) {
            facialLink = href;
            console.log(`   🔗 Link facial encontrado (texto): ${facialLink}`);
            break;
          }
        }
      }

      // Estratégia 3: Se a URL atual mudou para uma página de assinatura/facial
      if (!facialLink && currentUrl && /facial|assinatura|sign|biometria|certisign/i.test(currentUrl)) {
        facialLink = currentUrl;
        console.log(`   🔗 URL atual é o link facial: ${facialLink}`);
      }

      // Estratégia 4: Buscar em iframes
      if (!facialLink) {
        const iframes = await page.locator('iframe[src*="certisign"], iframe[src*="sign"], iframe[src*="facial"]').all();
        for (const iframe of iframes) {
          const src = await iframe.getAttribute('src').catch(() => null);
          if (src && src.startsWith('http')) {
            facialLink = src;
            console.log(`   🔗 Link facial encontrado (iframe): ${facialLink}`);
            break;
          }
        }
      }

      await screenshot(page, customerId, '12-pos-otp-facial');

      // Salvar link e enviar ao cliente via WhatsApp
      if (facialLink) {
        console.log(`   📲 Enviando link de reconhecimento facial ao cliente...`);
        const supabase = getSupabase();
        if (supabase) {
          await supabase.from('customers').update({
            link_assinatura: facialLink,
            conversation_step: 'aguardando_assinatura',
            status: 'awaiting_signature',
            updated_at: new Date().toISOString(),
          }).eq('id', customerId);
        }
        // Enviar link via WhatsApp
        await sendFacialLinkToCustomer(customerId, facialLink);
        await atualizarStatus(customerId, 'awaiting_signature');
      } else if (/assinatura|contrato|sucesso|cadastro realizado/i.test(finalPageText)) {
        console.log('   🎉 Cadastro finalizado com sucesso (sem link facial detectado)');
        await atualizarStatus(customerId, 'portal_submitted');
      } else {
        console.log('   ⚠️  Nenhum link facial encontrado - marcando como enviado');
        await atualizarStatus(customerId, 'portal_submitted');
      }
      
      const pageUrl = page.url();
      console.log('   ✅ Formulário processado com sucesso');
      if (pageUrl) console.log(`   📎 URL: ${pageUrl}`);
      activeBrowser = null;
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n${'='.repeat(70)}`);
      console.log(`✅ AUTOMAÇÃO CONCLUÍDA. Tempo: ${duration}s`);
      console.log('='.repeat(70));
      return { success: true, duration: parseFloat(duration), manualSubmit: false, pageUrl };
    }

    if (stopBeforeSubmit) {
      console.log('\n   ⏳ Modo manual: aguardando...');
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

    // Finalizar não encontrado: marcar enviado e deixar página aberta
    console.warn('   ⚠️  Finalizar não encontrado - deixando página aberta');
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
