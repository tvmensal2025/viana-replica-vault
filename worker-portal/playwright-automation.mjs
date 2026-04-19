// Automação Playwright - Portal iGreen v11.3
// Fluxo 100% automático: CEP → Calcular → Garantir → Formulário → Upload Docs → Perguntas → OTP → Enviar
//
// v11.3 - Correções críticas:
// ✅ Email fallback: tvmensal11@gmail.com (quando cliente não informou)
// ✅ Telefone fallback: 11971254913 (quando cliente não informou)
// ✅ waitForSelector antes de preencher email/telefone (campos dinâmicos)
// ✅ Confirmação email/telefone aguarda campo aparecer antes de preencher
// ✅ Validação de obrigatórios não bloqueia email/telefone (têm fallback)

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { logPhase, WORKER_VERSION_TAG } from './phase-logger.mjs';

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
  
  // Detectar campos com máscara (telefone/celular/WhatsApp/CPF/CEP/data)
  // Para esses, PULAR Tier 1 (que quebra a máscara MUI/react-imask) e ir direto para digitação real.
  let isMasked = false;
  try {
    isMasked = await el.evaluate((input) => {
      const ph = (input.getAttribute('placeholder') || '').toLowerCase();
      const name = (input.getAttribute('name') || '').toLowerCase();
      const type = (input.getAttribute('type') || '').toLowerCase();
      const maskKeywords = ['whatsapp', 'celular', 'telefone', 'phone', 'cpf', 'cnpj', 'cep', 'data', 'nascimento'];
      return type === 'tel'
        || maskKeywords.some(k => ph.includes(k) || name.includes(k))
        || !!input.getAttribute('data-mask')
        || !!input.closest('.MuiInputBase-root')?.querySelector('[data-mask]');
    }).catch(() => false);
  } catch (_) { /* noop */ }
  
  if (isMasked) {
    console.log(`   🎭 [reactFill] Campo com máscara detectado (${selectorStr}) — usando digitação real`);
    const onlyDigitsValue = String(value).replace(/\D/g, '');
    // Até 3 tentativas: o React do portal iGreen pode re-renderizar entre o autofill (CPF→Receita)
    // e o próximo campo, fazendo o input ficar STALE. Re-resolvemos a referência a cada tentativa.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Re-resolver o locator a cada tentativa (caso o React tenha re-montado o input)
        const fresh = typeof selector === 'string' ? page.locator(selector).first() : selector;
        if (await fresh.count() === 0) {
          console.log(`   ⚠️  [reactFill MASK attempt ${attempt}] locator desapareceu`);
          await new Promise(r => setTimeout(r, 400));
          continue;
        }
        await fresh.scrollIntoViewIfNeeded().catch(() => {});
        // Forçar foco real (click + focus JS) antes de digitar
        await fresh.click({ timeout: 3000 }).catch(() => {});
        await fresh.evaluate((input) => input.focus()).catch(() => {});
        await new Promise(r => setTimeout(r, 120));
        // Limpar usando seleção + Backspace (não quebra máscara) em vez de fill('')
        await fresh.evaluate((input) => {
          input.select?.();
        }).catch(() => {});
        await page.keyboard.press('Backspace').catch(() => {});
        await new Promise(r => setTimeout(r, 80));
        await fresh.type(onlyDigitsValue, { delay: 70 });
        await fresh.evaluate((input) => input.dispatchEvent(new Event('blur', { bubbles: true }))).catch(() => {});
        await new Promise(r => setTimeout(r, 250));
        const filled = await fresh.inputValue().catch(() => '');
        const onlyDigitsFilled = filled.replace(/\D/g, '');
        if (onlyDigitsFilled === onlyDigitsValue) {
          console.log(`   ✅ [reactFill MASK attempt ${attempt}] ${selectorStr}: "${filled}"`);
          return true;
        }
        console.log(`   ⚠️  [reactFill MASK attempt ${attempt}] valor não bate. Atual: "${filled}" / esperado: "${onlyDigitsValue}"`);
      } catch (e) {
        console.log(`   ⚠️  [reactFill MASK attempt ${attempt}] erro: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 500));
    }
    return false;
  }
  
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

// ─── bulletproofType: NUNCA falha em campos com placeholder conhecido ──────
// Estratégia "à prova de balas" para o portal iGreen (react-imask + MUI re-renders):
// 1. Aguarda input com placeholder aparecer (até 30s, polling 250ms)
// 2. Re-resolve o handle a cada tentativa (input pode ser re-montado)
// 3. Foca via .click(force) + .focus() JS
// 4. Limpa com Ctrl+A + Backspace (compatível com máscara)
// 5. Digita via page.keyboard.type (foco no input, não importa se re-renderizar)
// 6. Verifica valor; se não bater, retenta (até 5x). Aceita match por dígitos.
async function bulletproofType(page, placeholder, value, opts = {}) {
  const { maxAttempts = 5, appearTimeoutMs = 30000, label = placeholder } = opts;
  const onlyDigits = String(value).replace(/\D/g, '');
  const expected = onlyDigits || String(value);
  const escPh = placeholder.replace(/"/g, '\\"');
  const getLocator = () => page.locator(`input[placeholder="${escPh}"]`).first();

  console.log(`   🛡️  [bulletproof] aguardando "${label}" aparecer...`);
  const appearStart = Date.now();
  while (Date.now() - appearStart < appearTimeoutMs) {
    const loc = getLocator();
    if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) break;
    await new Promise(r => setTimeout(r, 250));
  }
  if ((await getLocator().count()) === 0) {
    throw new Error(`[bulletproof] Campo "${label}" não apareceu em ${appearTimeoutMs}ms`);
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const fresh = getLocator();
      if ((await fresh.count()) === 0) { await new Promise(r => setTimeout(r, 500)); continue; }
      await fresh.scrollIntoViewIfNeeded().catch(() => {});
      await fresh.click({ timeout: 5000, force: true }).catch(() => {});
      await fresh.evaluate((el) => el.focus()).catch(() => {});
      await new Promise(r => setTimeout(r, 150));

      // Limpar
      await page.keyboard.down('Control').catch(() => {});
      await page.keyboard.press('a').catch(() => {});
      await page.keyboard.up('Control').catch(() => {});
      await page.keyboard.press('Backspace').catch(() => {});
      await new Promise(r => setTimeout(r, 80));

      // Re-focar (Backspace pode ter desfocado em alguns browsers)
      const fresh2 = getLocator();
      await fresh2.click({ timeout: 3000, force: true }).catch(() => {});
      await fresh2.evaluate((el) => el.focus()).catch(() => {});
      await new Promise(r => setTimeout(r, 80));

      // Digitar via teclado
      await page.keyboard.type(expected, { delay: 60 });
      await new Promise(r => setTimeout(r, 200));
      await page.keyboard.press('Tab').catch(() => {});
      await new Promise(r => setTimeout(r, 250));

      const filled = await getLocator().inputValue().catch(() => '');
      if (filled.replace(/\D/g, '') === expected || filled === expected) {
        console.log(`   ✅ [bulletproof attempt ${attempt}] ${label}: "${filled}"`);
        return true;
      }
      console.log(`   🔁 [bulletproof attempt ${attempt}] "${filled}" ≠ "${expected}", retry`);
    } catch (e) {
      console.log(`   ⚠️  [bulletproof attempt ${attempt}] erro: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 500 + attempt * 200));
  }

  const finalVal = await getLocator().inputValue().catch(() => '');
  if (finalVal.replace(/\D/g, '') === expected) {
    console.log(`   ✅ [bulletproof FINAL] ${label}: "${finalVal}"`);
    return true;
  }
  throw new Error(`[bulletproof] Falhou "${label}" após ${maxAttempts} tentativas. Final: "${finalVal}"`);
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

// ─── waitForAutoFill: aguarda portal preencher Nome + DataNasc após CPF ────
// O portal iGreen consulta a Receita Federal via CPF e auto-preenche esses
// campos. NUNCA sobrescrever — eles são a fonte da verdade.
async function waitForAutoFill(page, timeoutMs = 15000) {
  const start = Date.now();
  let result = { nome: '', nascimento: '' };
  while (Date.now() - start < timeoutMs) {
    try {
      result = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const findValue = (regex) => {
          for (const input of inputs) {
            const ph = (input.getAttribute('placeholder') || '').toLowerCase();
            const name = (input.getAttribute('name') || '').toLowerCase();
            const aria = (input.getAttribute('aria-label') || '').toLowerCase();
            if (regex.test(ph) || regex.test(name) || regex.test(aria)) {
              const v = (input).value || '';
              if (v && v.trim().length > 1) return v.trim();
            }
          }
          return '';
        };
        return {
          nome: findValue(/(^|\s)nome|fullname|full[_-]?name|titular/i),
          nascimento: findValue(/nascim|birth|nasc/i),
        };
      });
      // Considerar preenchido quando nome (>= 5 chars) OU nasc (>= 8 chars) chegar
      if ((result.nome && result.nome.length >= 5) || (result.nascimento && result.nascimento.replace(/\D/g, '').length >= 8)) {
        return result;
      }
    } catch (_) { /* noop */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return result;
}

// ─── waitForFieldByPlaceholder: detecção via MutationObserver ────────────
// Espera por um campo aparecer no DOM observando mutações em vez de só
// fazer polling. Retorna true se encontrou, false se timeout.
async function waitForFieldByPlaceholder(page, regex, timeoutMs = 15000) {
  try {
    const found = await page.evaluate(({ pattern, timeout }) => {
      return new Promise((resolve) => {
        const re = new RegExp(pattern, 'i');
        const check = () => {
          const inputs = Array.from(document.querySelectorAll('input'));
          for (const input of inputs) {
            const ph = input.getAttribute('placeholder') || '';
            const name = input.getAttribute('name') || '';
            const aria = input.getAttribute('aria-label') || '';
            if ((re.test(ph) || re.test(name) || re.test(aria)) && (input).offsetParent !== null) {
              return true;
            }
          }
          return false;
        };
        if (check()) return resolve(true);
        const observer = new MutationObserver(() => {
          if (check()) {
            observer.disconnect();
            resolve(true);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        setTimeout(() => { observer.disconnect(); resolve(false); }, timeout);
      });
    }, { pattern: regex.source, timeout: timeoutMs });
    return found;
  } catch (_) {
    return false;
  }
}

// ─── findFieldFast: detecção AGRESSIVA com waitForFunction (250ms poll) ──
// Múltiplos critérios em OR: placeholder, name, aria-label, type, label adjacente.
// Retorna o handle do elemento (ou null em timeout).
// Usado para campos críticos que demoram a aparecer (ex: WhatsApp após CPF).
async function findFieldFast(page, criteria, timeoutMs = 12000) {
  const start = Date.now();
  try {
    const handle = await page.waitForFunction(
      (crit) => {
        const inputs = Array.from(document.querySelectorAll('input, textarea'));
        for (const input of inputs) {
          if (input.offsetParent === null) continue;
          if (input.disabled) continue;
          const ph = (input.getAttribute('placeholder') || '').toLowerCase();
          const name = (input.getAttribute('name') || '').toLowerCase();
          const aria = (input.getAttribute('aria-label') || '').toLowerCase();
          const type = (input.getAttribute('type') || '').toLowerCase();
          const id = (input.getAttribute('id') || '').toLowerCase();
          // Buscar contexto via label/parent
          let ctx = '';
          try {
            const labelFor = id ? document.querySelector(`label[for="${id}"]`) : null;
            const parentLabel = input.closest('label');
            const formCtl = input.closest('.MuiFormControl-root,[class*="FormControl"],div');
            ctx = ((labelFor?.textContent || '') + ' ' + (parentLabel?.textContent || '') + ' ' + (formCtl?.textContent || '')).toLowerCase();
          } catch (_) {}
          const haystack = `${ph} ${name} ${aria} ${id} ${ctx}`;
          // OR: qualquer keyword bater
          const matchKeyword = (crit.keywords || []).some((k) => haystack.includes(k.toLowerCase()));
          const matchType = crit.type ? type === crit.type : false;
          const matchExclude = (crit.exclude || []).some((x) => haystack.includes(x.toLowerCase()));
          if ((matchKeyword || matchType) && !matchExclude) {
            return true;
          }
        }
        return false;
      },
      criteria,
      { polling: 250, timeout: timeoutMs }
    ).catch(() => null);

    const elapsed = Date.now() - start;
    if (!handle) {
      console.log(`   ⚠️  [findFieldFast] timeout após ${elapsed}ms — keywords=${JSON.stringify(criteria.keywords || [])}`);
      return null;
    }

    // Re-localizar agora que sabemos que existe (handle do waitForFunction é o boolean)
    const locator = await page.evaluateHandle((crit) => {
      const inputs = Array.from(document.querySelectorAll('input, textarea'));
      for (const input of inputs) {
        if (input.offsetParent === null) continue;
        if (input.disabled) continue;
        const ph = (input.getAttribute('placeholder') || '').toLowerCase();
        const name = (input.getAttribute('name') || '').toLowerCase();
        const aria = (input.getAttribute('aria-label') || '').toLowerCase();
        const type = (input.getAttribute('type') || '').toLowerCase();
        const id = (input.getAttribute('id') || '').toLowerCase();
        let ctx = '';
        try {
          const labelFor = id ? document.querySelector(`label[for="${id}"]`) : null;
          const parentLabel = input.closest('label');
          const formCtl = input.closest('.MuiFormControl-root,[class*="FormControl"],div');
          ctx = ((labelFor?.textContent || '') + ' ' + (parentLabel?.textContent || '') + ' ' + (formCtl?.textContent || '')).toLowerCase();
        } catch (_) {}
        const haystack = `${ph} ${name} ${aria} ${id} ${ctx}`;
        const matchKeyword = (crit.keywords || []).some((k) => haystack.includes(k.toLowerCase()));
        const matchType = crit.type ? type === crit.type : false;
        const matchExclude = (crit.exclude || []).some((x) => haystack.includes(x.toLowerCase()));
        if ((matchKeyword || matchType) && !matchExclude) {
          return input;
        }
      }
      return null;
    }, criteria);

    console.log(`   ⚡ [findFieldFast] OK em ${elapsed}ms — keywords=${JSON.stringify(criteria.keywords || [])}`);
    return locator;
  } catch (e) {
    console.warn(`   ⚠️  [findFieldFast] erro: ${e.message}`);
    return null;
  }
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

// ─── Converter PDF para JPG (portal só aceita image/*) ──────────────────────
async function convertPdfToJpg(pdfPath, label) {
  try {
    const { execSync } = await import('child_process');
    const jpgPath = pdfPath.replace(/\.pdf$/i, '.jpg');
    // pdftoppm vem do poppler-utils (já instalado no container playwright)
    execSync(`pdftoppm -jpeg -r 150 -f 1 -l 1 "${pdfPath}" "${jpgPath.replace(/\.jpg$/, '')}" 2>/dev/null`, { stdio: 'ignore' });
    // pdftoppm gera arquivo com sufixo -1.jpg
    const generated = jpgPath.replace(/\.jpg$/, '-1.jpg');
    if (existsSync(generated)) {
      copyFileSync(generated, jpgPath);
      console.log(`   🔄 ${label} convertido PDF→JPG: ${jpgPath}`);
      return jpgPath;
    }
    if (existsSync(jpgPath)) return jpgPath;
  } catch (e) {
    console.warn(`   ⚠️  Conversão PDF→JPG falhou (${label}): ${e.message}`);
  }
  return pdfPath; // fallback: tenta original
}

// ─── Baixar mídia direta via Evolution API (fallback quando MinIO está offline) ─
async function downloadMediaViaEvolution(messageId, instanceName, label) {
  if (!messageId || !instanceName) return null;
  try {
    let evolutionUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
    let evolutionKey = process.env.EVOLUTION_API_KEY || '';
    if (!evolutionUrl || !evolutionKey) {
      const { data: rows } = await getSupabase().from('settings').select('key, value');
      const s = {}; (rows || []).forEach(r => { s[r.key] = r.value; });
      evolutionUrl = evolutionUrl || (s.evolution_api_url || '').replace(/\/$/, '');
      evolutionKey = evolutionKey || s.evolution_api_key || '';
    }
    if (!evolutionUrl || !evolutionKey) {
      console.warn(`   ⚠️  [${label}] Evolution não configurado — pulando fallback`);
      return null;
    }
    console.log(`   📡 [${label}] Re-baixando via Evolution API (msgId=${messageId.substring(0, 16)}...)`);
    const res = await fetch(`${evolutionUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
      method: 'POST',
      headers: { apikey: evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { key: { id: messageId } }, convertToMp4: false }),
    });
    if (!res.ok) {
      console.warn(`   ⚠️  [${label}] Evolution retornou ${res.status}`);
      return null;
    }
    const data = await res.json();
    const b64 = data?.base64;
    const mime = (data?.mimetype || 'application/octet-stream').toLowerCase();
    if (!b64 || b64.length < 100) return null;
    const ext = mime.includes('pdf') ? 'pdf' : mime.includes('png') ? 'png' : 'jpg';
    const outPath = join(TMP_DIR, `${label}-evo-${Date.now()}.${ext}`);
    writeFileSync(outPath, Buffer.from(b64, 'base64'));
    console.log(`   ✅ [${label}] Re-baixado via Evolution: ${outPath}`);
    return outPath;
  } catch (e) {
    console.warn(`   ⚠️  [${label}] downloadMediaViaEvolution falhou: ${e.message}`);
    return null;
  }
}

// ─── Preparar arquivos de upload ──────────────────────────────────────────────
// Hierarquia (FAIL-FAST: nunca cai em fixture genérica para documento):
//   1. URL HTTP do MinIO (se válida)
//   2. data: URL Base64 já no campo *_url
//   3. Base64 inline no banco (cliente.document_front_base64 / cliente.bill_base64)
//   4. Re-baixar via Evolution API (cliente.media_message_id / cliente.bill_message_id)
//   5. ABORT — devolve null e o caller decide (worker hoje aborta para doc-frente)
async function prepararDocumento(url, label, cliente = null, instanceName = null) {
  // Tratar URLs inválidas (nao_aplicavel, vazio, etc.)
  if (!url || url === 'nao_aplicavel' || url === 'null' || url === 'undefined' || String(url).trim() === '') {
    console.log(`   ⚠️  ${label}: URL não aplicável, retornando null`);
    return null;
  }
  // whapi-media:xxx → baixar via API Whapi (legado)
  if (url.startsWith('whapi-media:')) {
    try {
      const mediaId = url.replace('whapi-media:', '').trim();
      const outPath = await downloadWhapiMedia(mediaId, label);
      console.log(`📄 ${label} baixado (Whapi): ${outPath}`);
      return outPath.endsWith('.pdf') ? await convertPdfToJpg(outPath, label) : outPath;
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
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        const ext = ct.includes('pdf') ? 'pdf' : 'jpg';
        outPath = join(TMP_DIR, `${label}-${Date.now()}.${ext}`);
        writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
      } else {
        console.warn(`   ⚠️  ${label}: HTTP ${res.status} ao baixar URL primária`);
      }
    } else {
      // url == "evolution-media:pending" ou outra string inesperada
      console.warn(`   ⚠️  ${label}: URL não-HTTP/data: "${String(url).substring(0, 60)}"`);
    }

    if (outPath && existsSync(outPath)) {
      console.log(`📄 ${label} baixado: ${outPath}`);
      if (outPath.endsWith('.pdf') && (label === 'doc-frente' || label === 'doc-verso')) {
        return await convertPdfToJpg(outPath, label);
      }
      return outPath;
    }
  } catch (e) {
    console.warn(`⚠️  Erro ao baixar ${label}: ${e.message}`);
  }

  // 🆘 FALLBACK 1: Base64 inline no banco
  if (cliente) {
    const inlineB64 = label === 'doc-frente' ? cliente.document_front_base64
                    : label === 'conta'      ? cliente.bill_base64
                    : null;
    if (inlineB64 && inlineB64.length > 100) {
      try {
        // Heurística simples para PDF (header %PDF em base64 começa com "JVBERi")
        const isPdf = inlineB64.startsWith('JVBERi');
        const ext = isPdf ? 'pdf' : 'jpg';
        const outPath = join(TMP_DIR, `${label}-inline-${Date.now()}.${ext}`);
        writeFileSync(outPath, Buffer.from(inlineB64, 'base64'));
        console.log(`   ✅ [${label}] Recuperado do Base64 inline do banco`);
        if (isPdf && (label === 'doc-frente' || label === 'doc-verso')) {
          return await convertPdfToJpg(outPath, label);
        }
        return outPath;
      } catch (e) {
        console.warn(`   ⚠️  [${label}] Falha ao decodar Base64 inline: ${e.message}`);
      }
    }
  }

  // 🆘 FALLBACK 2: Re-baixar via Evolution API
  if (cliente && instanceName) {
    const msgId = label === 'doc-frente' ? cliente.media_message_id
                : label === 'conta'      ? cliente.bill_message_id
                : null;
    if (msgId) {
      const evoPath = await downloadMediaViaEvolution(msgId, instanceName, label);
      if (evoPath) {
        if (evoPath.endsWith('.pdf') && (label === 'doc-frente' || label === 'doc-verso')) {
          return await convertPdfToJpg(evoPath, label);
        }
        return evoPath;
      }
    }
  }

  // 🛑 FAIL-FAST: para documento pessoal, NUNCA usar fixture genérico
  if (label === 'doc-frente') {
    console.error(`   ❌ [${label}] Não foi possível recuperar mídia real (URL/Base64/Evolution todos falharam)`);
    return null;
  }

  // Para verso (RG) e conta, ainda permitimos placeholder porque o worker decide depois
  if (label === 'doc-verso') {
    const docPath = join(FIXTURES_DIR, 'documento.jpg');
    if (!existsSync(docPath)) {
      writeFileSync(docPath, MINIMAL_JPEG);
    }
    console.log(`📄 ${label} placeholder criado (verso opcional)`);
    return docPath;
  }

  return null;
}

async function prepararContaEnergia(cliente, instanceName = null) {
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
      } else if (url.startsWith('http')) {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
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

  // 🆘 Fallbacks: Base64 inline → Evolution API
  const inlineB64 = cliente.bill_base64;
  if (inlineB64 && inlineB64.length > 100) {
    try {
      const isPdf = inlineB64.startsWith('JVBERi');
      const ext = isPdf ? 'pdf' : 'jpg';
      const outPath = join(TMP_DIR, `conta-inline-${Date.now()}.${ext}`);
      writeFileSync(outPath, Buffer.from(inlineB64, 'base64'));
      console.log(`   ✅ [conta] Recuperada do Base64 inline do banco`);
      return outPath;
    } catch (e) {
      console.warn(`   ⚠️  [conta] Falha ao decodar Base64 inline: ${e.message}`);
    }
  }
  if (cliente.bill_message_id && instanceName) {
    const evoPath = await downloadMediaViaEvolution(cliente.bill_message_id, instanceName, 'conta');
    if (evoPath) return evoPath;
  }

  // Fallback final: PDF mínimo (portal exige um arquivo qualquer no campo)
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
// ─── Fallbacks fixos para campos obrigatórios ────────────────────────────────
// Usados quando o cliente não informou email/telefone no WhatsApp
const FALLBACK_EMAIL = process.env.FALLBACK_EMAIL || 'tvmensal11@gmail.com';
const FALLBACK_PHONE = process.env.FALLBACK_PHONE || '11971254913';

function formatarDados(cliente) {
  const onlyDigits = (s) => (s || '').replace(/\D+/g, '');
  
  const cpfDigits = onlyDigits(cliente.cpf);
  if (cpfDigits.length !== 11) throw new Error(`CPF inválido: ${cliente.cpf}`);
  const cpfFormatted = cpfDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  
  const cepDigits = onlyDigits(cliente.cep);
  if (cepDigits.length !== 8) throw new Error(`CEP inválido: ${cliente.cep}`);
  const cepFormatted = cepDigits.replace(/(\d{5})(\d{3})/, '$1-$2');
  
  // Telefone SEM código do país (portal não aceita +55)
  // Fallback: usa FALLBACK_PHONE se cliente não informou
  const phoneDigits = onlyDigits(cliente.phone_whatsapp || '');
  const whatsappRaw = phoneDigits.length >= 12 ? phoneDigits.slice(-11) : phoneDigits;
  const whatsapp = whatsappRaw.length >= 10 ? whatsappRaw : onlyDigits(FALLBACK_PHONE).slice(-11);
  if (whatsappRaw.length < 10) {
    console.warn(`   ⚠️  Telefone do cliente ausente/inválido ("${phoneDigits}") — usando fallback: ${whatsapp}`);
  }

  // Email: fallback se não informado
  const emailRaw = (cliente.email || '').trim();
  const email = emailRaw.includes('@') ? emailRaw : FALLBACK_EMAIL;
  if (!emailRaw.includes('@')) {
    console.warn(`   ⚠️  Email do cliente ausente ("${emailRaw}") — usando fallback: ${email}`);
  }

  return {
    nomeCompleto: cliente.name,
    cpfDigits,
    cpfFormatted,
    cepFormatted,
    whatsapp,
    email,
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
    // Normalizar document_type (aceita "CNH"/"cnh"/"RG (Novo)"/"rg_novo"/etc.)
    documentType: normalizeDocType(cliente.document_type),
    possuiProcurador: cliente.possui_procurador || false,
    pdfProtegido: cliente.conta_pdf_protegida || false,
    debitosAberto: cliente.debitos_aberto || false,
  };
}

// ─── Normalização ÚNICA de document_type (espelha _shared/document-type.ts) ──
// Valores canônicos: "cnh" | "rg_novo" | "rg_antigo".
function normalizeDocType(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return 'rg_antigo';
  if (/cnh|habilita/.test(raw)) return 'cnh';
  if (/novo/.test(raw)) return 'rg_novo';
  if (/antigo|rg/.test(raw)) return 'rg_antigo';
  return 'rg_antigo';
}

// Texto exato da opção no MUI Select do portal igreen.
function portalDocLabel(canonical) {
  if (canonical === 'cnh') return 'CNH';
  if (canonical === 'rg_novo') return 'RG (Novo)';
  return 'RG (Antigo)';
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
    
    // Validar campos obrigatórios (email e whatsapp têm fallback, não bloqueiam)
    const obrigatorios = ['nomeCompleto', 'cpfDigits', 'cepFormatted', 'endereco', 'numeroEndereco', 'cidade', 'estadoSigla'];
    const faltando = obrigatorios.filter(c => !data[c] || String(data[c]).trim() === '');
    if (faltando.length > 0) throw new Error(`Campos obrigatórios faltando: ${faltando.join(', ')}`);
    // Email e telefone sempre têm valor (fallback garantido em formatarDados)
    console.log(`✅ Dados validados | email: ${data.email} | whatsapp: ${data.whatsapp}`);

    
    // Buscar instanceName do consultor (necessário p/ fallback Evolution API)
    let instanceName = null;
    if (cliente.consultant_id) {
      try {
        const { data: inst } = await getSupabase()
          .from('whatsapp_instances').select('instance_name')
          .eq('consultant_id', cliente.consultant_id).limit(1).maybeSingle();
        instanceName = inst?.instance_name || null;
      } catch (_) {}
    }

    // Preparar arquivos de upload (com hierarquia URL → Base64 → Evolution → fail)
    const docFrentePath = await prepararDocumento(cliente.document_front_url, 'doc-frente', cliente, instanceName);
    const docVersoPath = await prepararDocumento(cliente.document_back_url, 'doc-verso', cliente, instanceName);
    const contaPath = await prepararContaEnergia(cliente, instanceName);
    console.log(`📄 Doc frente: ${docFrentePath}`);
    console.log(`📄 Doc verso: ${docVersoPath}`);
    console.log(`📄 Conta: ${contaPath}`);

    // 🛑 FAIL-FAST: se não conseguimos a frente do documento, NÃO abrir browser
    if (!docFrentePath) {
      const msg = 'Documento (frente) indisponível: MinIO offline + Base64 inline ausente + Evolution API sem messageId. Cliente precisa reenviar a foto pelo WhatsApp.';
      console.error(`❌ ${msg}`);
      await atualizarStatus(customerId, 'awaiting_document_resend', msg);
      throw new Error(msg);
    }
    
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
    const escAttr = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const byId = (id) => page.locator(`[id="${escAttr(id)}"]`).first();
    const byPH = (ph) => page.locator(`input[placeholder="${escAttr(ph)}"]`).first();
    const byPHPartial = (ph) => page.locator(`input[placeholder*="${escAttr(ph)}" i]`).first();
    const clickText = async (text, tag = 'button') => {
      const el = page.locator(`${tag}:has-text("${text}")`).first();
      if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
        await el.click({ timeout: 10000 });
        return true;
      }
      return false;
    };
    const normalizeText = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const normalizeDigits = (value) => String(value || '').replace(/\D+/g, '');
    const readValue = async (locator) => locator.inputValue().catch(async () => locator.evaluate((el) => el.value || '').catch(() => ''));
    const matchesExpected = (actual, expected, mode = 'text') => {
      if (mode === 'digits') {
        const actualDigits = normalizeDigits(actual);
        const expectedDigits = normalizeDigits(expected);
        return Boolean(actualDigits) && Boolean(expectedDigits) && (actualDigits === expectedDigits || actualDigits.endsWith(expectedDigits) || expectedDigits.endsWith(actualDigits));
      }
      return normalizeText(actual) === normalizeText(expected);
    };
    const scanVisibleInputs = async (predicate) => {
      const fields = await page.locator('input, textarea, select').all();
      for (const field of fields) {
        const visible = await field.isVisible().catch(() => false);
        if (!visible) continue;
        const meta = await field.evaluate((el) => {
          const root = el.closest('.MuiFormControl-root,[class*="MuiFormControl"],label') || el.parentElement?.parentElement?.parentElement || el.parentElement?.parentElement || el.parentElement;
          return {
            placeholder: el.getAttribute('placeholder') || '',
            name: el.getAttribute('name') || '',
            id: el.getAttribute('id') || '',
            ariaLabel: el.getAttribute('aria-label') || '',
            type: el.getAttribute('type') || '',
            context: root?.textContent || '',
          };
        }).catch(() => null);
        if (meta && predicate(meta)) return field;
      }
      return null;
    };
    const fillRequiredField = async (locator, value, label, mode = 'text') => {
      if (!locator || await locator.count() === 0 || !await locator.isVisible().catch(() => false)) {
        throw new Error(`Campo obrigatório não encontrado no portal: ${label}`);
      }
      const target = locator.first();
      await target.scrollIntoViewIfNeeded().catch(() => {});
      const stringValue = String(value ?? '');
      const filled = await reactFill(page, target, stringValue);
      if (!filled) {
        await target.click();
        await target.fill('');
        await target.type(stringValue, { delay: 80 });
      }
      await delay(300);
      const current = await readValue(target);
      if (!matchesExpected(current, stringValue, mode)) {
        throw new Error(`Falha ao preencher ${label}. Valor atual no portal: "${current}"`);
      }
      console.log(`   ✅ ${label}: ${stringValue}`);
      return target;
    };
    const setFileDirectly = async (locator, filePath, label) => {
      if (!filePath || !locator || await locator.count() === 0) return false;
      await locator.first().setInputFiles(filePath);
      console.log(`   ✅ ${label}`);
      return true;
    };
    const setFileByLabelPattern = async (pattern, filePath, label) => {
      if (!filePath) return false;
      const labels = await page.locator('label').all();
      for (const item of labels) {
        const text = await item.textContent().catch(() => '');
        if (!pattern.test(text || '')) continue;
        const inputId = await item.getAttribute('for').catch(() => null);
        if (!inputId) continue;
        const input = byId(inputId);
        if (await input.count() === 0) continue;
        await input.setInputFiles(filePath);
        console.log(`   ✅ ${label}`);
        return true;
      }
      return false;
    };
    const findComboboxByContext = async (pattern) => {
      const combos = await page.locator('[role="combobox"], .MuiSelect-select, select').all();
      for (const combo of combos) {
        const visible = await combo.isVisible().catch(() => false);
        if (!visible) continue;
        const context = await combo.evaluate((el) => {
          const root = el.closest('.MuiFormControl-root,[class*="MuiFormControl"]') || el.parentElement?.parentElement?.parentElement || el.parentElement?.parentElement || el.parentElement;
          return root?.textContent || '';
        }).catch(() => '');
        if (pattern.test(context)) return combo;
      }
      return null;
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
    // Reduzido de 5s→1s: o waitForAutoFill abaixo já faz polling adaptativo de até 10s
    await delay(1000);
    await screenshot(page, customerId, '04-apos-cpf');

    // ─── 6a. AGUARDAR AUTO-FILL DA RECEITA (Nome + DataNasc) ──────────────
    // REGRA DE OURO: o portal consulta a Receita Federal via CPF e auto-preenche
    // Nome e Data de Nascimento. Esses valores SÃO A FONTE DA VERDADE — nunca
    // sobrescrever com dados do banco/OCR (que podem estar errados).
    // Timeout reduzido de 18s→10s: na prática a Receita responde em 2-4s.
    currentPhase = 'fase3b-autofill';
    await logPhase(customerId, 'fase3b-autofill', 'started');
    console.log('   ⏳ [AUTO-FILL] Aguardando portal preencher Nome + DataNasc via Receita...');
    const autofill = await waitForAutoFill(page, 10000);
    if (autofill.nome || autofill.nascimento) {
      console.log(`   📥 [AUTO-FILL] Portal preencheu: Nome="${autofill.nome || '(vazio)'}" DataNasc="${autofill.nascimento || '(vazio)'}"`);
      await logPhase(customerId, 'fase3b-autofill', 'ok', { message: `Nome="${autofill.nome || ''}" DataNasc="${autofill.nascimento || ''}"` });
    } else {
      console.warn('   ⚠️  [AUTO-FILL] Portal NÃO auto-preencheu (CPF talvez sem registro na Receita). Worker continuará.');
      await logPhase(customerId, 'fase3b-autofill', 'warn', { message: 'Receita não retornou dados' });
    }
    // ⏸️  Aguardar React estabilizar após autofill antes de buscar próximo campo
    // (o portal re-renderiza o form quando a Receita responde)
    await delay(1200);

    // ─── 6a-bis. VALIDAR NOME (crítico v10.1) ───────────────────────────
    currentPhase = 'fase3c-nome-validation';
    await logPhase(customerId, 'fase3c-nome-validation', 'started');
    {
      const portalNomeAtual = (autofill.nome || '').trim();
      const bancoNome = String(data.nomeCompleto || '').trim();
      if (!portalNomeAtual && !bancoNome) {
        const msg = 'Nome ausente: portal não auto-preencheu E banco vazio. Cliente precisa enviar CPF correto.';
        await logPhase(customerId, 'fase3c-nome-validation', 'aborted', { message: msg });
        await atualizarStatus(customerId, 'awaiting_cpf_review', msg);
        throw new Error(msg);
      }
      if (!portalNomeAtual && bancoNome) {
        console.log(`   🆘 Portal sem nome — tentando preencher manualmente: "${bancoNome}"`);
        try {
          const nomeHandle = await findFieldFast(page, {
            keywords: ['nome', 'fullname', 'titular'],
            exclude: ['mãe', 'pai', 'usuário', 'fantasia', 'arquivo'],
          }, 4000);
          if (nomeHandle) {
            const meta = await nomeHandle.evaluate((el) => ({
              placeholder: el.getAttribute('placeholder') || '',
              name: el.getAttribute('name') || '',
              id: el.getAttribute('id') || '',
            })).catch(() => null);
            let nomeLoc = null;
            // IMPORTANTE: usar [id="..."] em vez de #id para suportar IDs do React 18 (ex: ":r5:")
            const escAttr = (s) => String(s).replace(/"/g, '\\"');
            if (meta?.placeholder) nomeLoc = page.locator(`input[placeholder="${escAttr(meta.placeholder)}"]`).first();
            else if (meta?.id) nomeLoc = page.locator(`input[id="${escAttr(meta.id)}"]`).first();
            else if (meta?.name) nomeLoc = page.locator(`input[name="${escAttr(meta.name)}"]`).first();
            if (nomeLoc && await nomeLoc.count() > 0) {
              await reactFill(page, nomeLoc, bancoNome);
              await logPhase(customerId, 'fase3c-nome-validation', 'ok', { message: `Nome preenchido manualmente: ${bancoNome}` });
            } else {
              await logPhase(customerId, 'fase3c-nome-validation', 'warn', { message: 'Campo nome não localizado' });
            }
          } else {
            await logPhase(customerId, 'fase3c-nome-validation', 'warn', { message: 'findFieldFast não achou nome' });
          }
        } catch (e) {
          await logPhase(customerId, 'fase3c-nome-validation', 'warn', { message: `Erro: ${e.message}` });
        }
      } else {
        await logPhase(customerId, 'fase3c-nome-validation', 'ok', { message: `Nome OK: "${portalNomeAtual}"` });
      }
    }


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
    
    // ─── 7. WhatsApp + Confirmação (BULLETPROOF) ─────────────────────────
    // Usa bulletproofType: re-resolve o input por placeholder a CADA tentativa,
    // foca via click(force)+focus(), digita via page.keyboard. NUNCA falha por
    // re-render do React. Até 5 retries × 5s = 25s pior caso por campo.
    currentPhase = 'fase4-whatsapp';
    console.log('\n📋 [4/16] WhatsApp (bulletproof)...');
    console.log(`   📱 Telefone a usar: ${data.whatsapp}`);
    await logPhase(customerId, 'fase4-whatsapp', 'started');
    const waStart = Date.now();

    // Aguardar campo WhatsApp aparecer (pode demorar após auto-fill CPF)
    await page.waitForSelector('input[placeholder*="WhatsApp" i], input[placeholder*="celular" i]', { timeout: 20000 }).catch(() => {});
    await delay(500);

    try {
      await bulletproofType(page, 'Número do seu WhatsApp', data.whatsapp, {
        label: 'WhatsApp',
        maxAttempts: 5,
        appearTimeoutMs: 30000,
      });
      await logPhase(customerId, 'fase4-whatsapp', 'ok', {
        duration_ms: Date.now() - waStart,
        selector_used: 'input[placeholder="Número do seu WhatsApp"]',
      });
    } catch (e) {
      // Fallback: 1º input de telefone visível que não seja "Confirme"
      console.warn(`   ⚠️  bulletproof WhatsApp falhou: ${e.message} — fallback genérico`);
      const fallback = page.locator('input[placeholder*="WhatsApp" i], input[placeholder*="celular" i]:not([placeholder*="onfirme" i]), input[type="tel"]').first();
      if (await fallback.count() > 0 && await fallback.isVisible().catch(() => false)) {
        await fallback.click({ force: true }).catch(() => {});
        await fallback.evaluate((el) => el.focus()).catch(() => {});
        await page.keyboard.type(String(data.whatsapp).replace(/\D/g, ''), { delay: 80 });
        await page.keyboard.press('Tab').catch(() => {});
        await logPhase(customerId, 'fase4-whatsapp', 'warn', { message: 'fallback genérico aplicado' });
      } else {
        await screenshot(page, customerId, 'ERROR-whatsapp');
        await logPhase(customerId, 'fase4-whatsapp', 'failed', { message: e.message });
        throw e;
      }
    }
    await delay(800);

    // Confirme celular — mesmo padrão bulletproof
    currentPhase = 'fase4b-confirme-celular';
    await logPhase(customerId, 'fase4b-confirme-celular', 'started');
    const cStart = Date.now();

    // Aguardar campo "Confirme" aparecer após preencher o primeiro
    await page.waitForSelector('input[placeholder*="onfirme" i][placeholder*="celular" i], input[placeholder*="onfirme" i][placeholder*="WhatsApp" i]', { timeout: 10000 }).catch(() => {});
    await delay(400);

    try {
      await bulletproofType(page, 'Confirme seu celular', data.whatsapp, {
        label: 'Confirme celular',
        maxAttempts: 5,
        appearTimeoutMs: 15000,
      });
      await logPhase(customerId, 'fase4b-confirme-celular', 'ok', { duration_ms: Date.now() - cStart });
    } catch (e) {
      // Fallback: 2º input de telefone na página
      console.warn(`   ⚠️  bulletproof Confirme falhou: ${e.message} — fallback nth(1)`);
      const all = page.locator('input[placeholder*="celular" i], input[placeholder*="WhatsApp" i]');
      if ((await all.count()) >= 2) {
        const second = all.nth(1);
        await second.click({ force: true }).catch(() => {});
        await second.evaluate((el) => el.focus()).catch(() => {});
        await page.keyboard.type(String(data.whatsapp).replace(/\D/g, ''), { delay: 80 });
        await page.keyboard.press('Tab').catch(() => {});
        await logPhase(customerId, 'fase4b-confirme-celular', 'warn', { message: 'fallback nth(1)' });
      } else {
        await screenshot(page, customerId, 'ERROR-confirme-celular');
        await logPhase(customerId, 'fase4b-confirme-celular', 'failed', { message: e.message });
        throw e;
      }
    }
    await delay(800);


    // ─── 8. Email ────────────────────────────────────────────────────────
    currentPhase = 'fase5-email';
    console.log('\n📋 [5/16] Email...');
    console.log(`   📧 Email a usar: ${data.email}`);

    // Aguardar campo aparecer (pode demorar após auto-fill do CPF)
    await page.waitForSelector('input[placeholder="E-mail"], input[placeholder*="mail" i]', { timeout: 15000 }).catch(() => {});
    await delay(500);

    // Portal usa placeholder="E-mail"
    let emailToUse = data.email; // já tem fallback garantido em formatarDados
    const emailField = byPH('E-mail');
    if (await emailField.count() > 0 && await emailField.isVisible().catch(() => false)) {
      // Limpar e preencher com triple-click para garantir substituição
      await emailField.click({ clickCount: 3 });
      await emailField.fill('');
      await emailField.type(emailToUse, { delay: 60 });
      await emailField.dispatchEvent('blur');
      console.log(`   ✅ Email: ${emailToUse}`);
    } else {
      // Fallback: qualquer input de email visível
      const emailFallback = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]').first();
      if (await emailFallback.count() > 0 && await emailFallback.isVisible().catch(() => false)) {
        await emailFallback.click({ clickCount: 3 });
        await emailFallback.fill('');
        await emailFallback.type(emailToUse, { delay: 60 });
        await emailFallback.dispatchEvent('blur');
        console.log(`   ✅ Email (fallback): ${emailToUse}`);
      } else {
        throw new Error('Campo Email não encontrado no portal');
      }
    }
    await delay(800);

    // ─── 8b. v11: detectar email DUPLICADO e aplicar fallback automático ─
    // Portal valida unicidade: "Este email já está cadastrado para outro cliente"
    currentPhase = 'fase5b-email-dup-check';
    await logPhase(customerId, 'fase5b-email-dup-check', 'started');
    {
      const dupCount = await page.locator('text=/(j[áa]\\s*est[áa]\\s*cadastrad)|(email.*j[áa].*cadastrad)/i').count().catch(() => 0);
      if (dupCount > 0) {
        // Gerar email único baseado no CPF
        const cpfDigits = String(data.cpfDigits || '').replace(/\D/g, '');
        const fallback = `${cpfDigits || Date.now()}@igreen.temp.com.br`;
        console.warn(`   ⚠️  Email duplicado detectado — aplicando fallback: ${fallback}`);
        const refield = byPH('E-mail');
        if (await refield.count() > 0) {
          await refield.click({ clickCount: 3 });
          await refield.fill('');
          await refield.type(fallback, { delay: 50 });
          emailToUse = fallback;
          await logPhase(customerId, 'fase5b-email-dup-check', 'warn', { message: `Email duplicado → fallback ${fallback}` });
          await delay(800);
        }
      } else {
        await logPhase(customerId, 'fase5b-email-dup-check', 'ok');
      }
    }

    // Confirmar email — aguardar campo aparecer
    await page.waitForSelector('input[placeholder*="onfirme" i][placeholder*="mail" i], input[placeholder*="Confirme" i]', { timeout: 10000 }).catch(() => {});
    await delay(400);
    let confirmEmail = byPH('Confirme seu E-mail');
    if (await confirmEmail.count() === 0) confirmEmail = byPHPartial('Confirme seu E-mail');
    if (await confirmEmail.count() === 0) confirmEmail = page.locator('input[placeholder*="onfirme" i]').first();
    if (await confirmEmail.count() > 0 && await confirmEmail.isVisible().catch(() => false)) {
      await confirmEmail.click({ clickCount: 3 });
      await confirmEmail.fill('');
      await confirmEmail.type(emailToUse, { delay: 60 });
      await confirmEmail.dispatchEvent('blur');
      console.log(`   ✅ Confirmação Email: ${emailToUse}`);

    } else {
      throw new Error('Campo de confirmação de email não encontrado no portal');
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
    
    // Preencher "Número" - MUI floating labels + placeholder fallback
    let numField = null;
    
    // Tentativa 1: getByLabel (MUI floating label) — exact match para não pegar "Número da instalação"
    try {
      const numByLabel = page.getByLabel('Número', { exact: true });
      if (await numByLabel.count() > 0 && await numByLabel.isVisible().catch(() => false)) {
        numField = numByLabel;
        console.log('   📍 Campo Número encontrado via getByLabel');
      }
    } catch (_) {}
    
    // Tentativa 2: label adjacente ao input (MUI pattern: label + div > input)
    if (!numField) {
      const numByLabelCSS = page.locator('label:has-text("Número") + div input, label:has-text("Número") ~ div input').first();
      if (await numByLabelCSS.count() > 0 && await numByLabelCSS.isVisible().catch(() => false)) {
        // Verificar que não é "Número da instalação" ou "Número do seu WhatsApp"
        const parentText = await numByLabelCSS.evaluate(el => {
          const parent = el.closest('.MuiFormControl-root') || el.parentElement?.parentElement;
          return parent?.textContent || '';
        }).catch(() => '');
        if (!parentText.includes('instalação') && !parentText.includes('WhatsApp') && !parentText.includes('celular')) {
          numField = numByLabelCSS;
          console.log('   📍 Campo Número encontrado via label CSS');
        }
      }
    }
    
    // Tentativa 3: placeholder exato
    if (!numField) {
      const numByPH = byPH('Número');
      if (await numByPH.count() > 0 && await numByPH.isVisible().catch(() => false)) {
        numField = numByPH;
        console.log('   📍 Campo Número encontrado via placeholder');
      }
    }
    
    // Tentativa 4: buscar todos inputs visíveis e filtrar
    if (!numField) {
      numField = await scanVisibleInputs((meta) => {
        const haystack = `${meta.placeholder} ${meta.name} ${meta.ariaLabel} ${meta.context}`;
        return /número/i.test(haystack) && !/instalação|whatsapp|celular/i.test(haystack);
      });
      if (numField) console.log('   📍 Campo Número encontrado via scan contextual');
    }
    
    // Tentativa 5: esperar mais e tentar de novo
    if (!numField) {
      await delay(3000);
      await page.evaluate(() => window.scrollBy(0, 200));
      await delay(1000);
      try {
        const retryLabel = page.getByLabel('Número', { exact: true });
        if (await retryLabel.count() > 0 && await retryLabel.isVisible().catch(() => false)) {
          numField = retryLabel;
        }
      } catch (_) {}
      if (!numField) {
        const retryNum = byPH('Número');
        if (await retryNum.count() > 0 && await retryNum.isVisible().catch(() => false)) {
          numField = retryNum;
        }
      }
    }
    
    if (numField) {
      await fillRequiredField(numField, data.numeroEndereco || '100', 'Número endereço');
    } else {
      throw new Error('Campo Número endereço não encontrado no portal');
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
      
      let instField = null;
      
      // Tentativa 1: getByLabel (MUI floating label)
      try {
        const instByLabel = page.getByLabel(/Número da instalação/i);
        if (await instByLabel.count() > 0 && await instByLabel.isVisible().catch(() => false)) {
          instField = instByLabel;
          console.log('   📍 Campo instalação encontrado via getByLabel');
        }
      } catch (_) {}
      
      // Tentativa 2: label CSS adjacente
      if (!instField) {
        const instByLabelCSS = page.locator('label:has-text("instalação") + div input, label:has-text("instalação") ~ div input').first();
        if (await instByLabelCSS.count() > 0 && await instByLabelCSS.isVisible().catch(() => false)) {
          instField = instByLabelCSS;
          console.log('   📍 Campo instalação encontrado via label CSS');
        }
      }
      
      // Tentativa 3: placeholder exato
      if (!instField) {
        const instByPH = byPH('Número da instalação');
        if (await instByPH.count() > 0 && await instByPH.isVisible().catch(() => false)) {
          instField = instByPH;
        }
      }
      // Tentativa 4: parcial (instala, instalação)
      if (!instField) {
        const instPartial = byPHPartial('instala');
        if (await instPartial.count() > 0 && await instPartial.isVisible().catch(() => false)) {
          instField = instPartial;
        }
      }
      // Tentativa 5: parcial (Código, código)
      if (!instField) {
        const instCodigo = byPHPartial('Código');
        if (await instCodigo.count() > 0 && await instCodigo.isVisible().catch(() => false)) {
          instField = instCodigo;
        }
      }
      // Tentativa 6: name-based
      if (!instField) {
        const instName = page.locator('input[name*="install" i], input[name*="codigo" i]').first();
        if (await instName.count() > 0 && await instName.isVisible().catch(() => false)) {
          instField = instName;
        }
      }

      if (!instField) {
        instField = await scanVisibleInputs((meta) => {
          const haystack = `${meta.placeholder} ${meta.name} ${meta.ariaLabel} ${meta.context}`;
          return /instalação|código/i.test(haystack) && !/whatsapp|celular/i.test(haystack);
        });
        if (instField) console.log('   📍 Campo instalação encontrado via scan contextual');
      }
      
      // Aguardar visibilidade com timeout
      if (!instField) {
        await page.evaluate(() => window.scrollBy(0, 300));
        await delay(2000);
        try {
          const retryInst = page.getByLabel(/instalação/i);
          if (await retryInst.count() > 0 && await retryInst.isVisible().catch(() => false)) {
            instField = retryInst;
          }
        } catch (_) {}
      }
      
      if (instField) {
        await fillRequiredField(instField, data.numeroInstalacao, 'Número da instalação', 'digits');
      } else {
        throw new Error('Campo número da instalação não encontrado no portal');
      }
      await delay(2000);

      // ─── v11: detectar INSTALAÇÃO DUPLICADA ─────────────────────────────
      // Portal mostra: "Número de instalação já cadastrado"
      currentPhase = 'fase7b-instalacao-dup-check';
      await logPhase(customerId, 'fase7b-instalacao-dup-check', 'started');
      try {
        const dupInst = await page
          .locator('text=/(instala[cç][aã]o\\s*j[áa]\\s*cadastrad)|(n[uú]mero.*j[áa].*cadastrad)/i')
          .count()
          .catch(() => 0);
        if (dupInst > 0) {
          const msg = `Número de instalação ${data.numeroInstalacao} já cadastrado no portal iGreen`;
          console.error(`   🚫 ${msg}`);
          await logPhase(customerId, 'fase7b-instalacao-dup-check', 'aborted', { message: msg });
          await screenshot(page, customerId, 'ERROR-instalacao-duplicada');
          await atualizarStatus(customerId, 'installation_duplicate', msg);
          throw new Error(`INSTALLATION_DUPLICATE: ${msg}`);
        } else {
          await logPhase(customerId, 'fase7b-instalacao-dup-check', 'ok');
        }
      } catch (e) {
        if (String(e.message || '').startsWith('INSTALLATION_DUPLICATE')) throw e;
        // Erro do próprio detector — não trava
        console.warn(`   ⚠️  Detector de duplicata falhou: ${e.message}`);
      }
      await delay(800);
    }
    
    await page.evaluate(() => window.scrollBy(0, 200));
    await delay(1500);

    // ─── 11. Distribuidora (MUI Select MANUAL — confirmado ao vivo 17/04/2026) ──
    // O portal NÃO auto-detecta a distribuidora pelo CEP; o usuário precisa selecionar.
    // Estratégia: encontrar o combobox cujo label/contexto contenha "Distribuidora",
    // abrir, e selecionar a opção que case com customer.distribuidora (ou a 1ª como fallback).
    currentPhase = 'fase8-distribuidora';
    console.log('\n📋 [8/16] Distribuidora (MUI Select)...');
    
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(1500);
    
    try {
      const distCombo = await findComboboxByContext(/distribuidora/i);
      if (distCombo) {
        await distCombo.scrollIntoViewIfNeeded().catch(() => {});
        await distCombo.click({ force: true });
        await delay(800);
        
        const desejada = (data.distribuidora || '').trim();
        let opcaoSelecionada = null;
        
        if (desejada) {
          // Tentar match exato/parcial case-insensitive
          const opt = page.locator(`role=option[name=/${desejada.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/i]`).first();
          if (await opt.count() > 0 && await opt.isVisible().catch(() => false)) {
            await opt.click({ force: true });
            opcaoSelecionada = desejada;
          }
        }
        
        if (!opcaoSelecionada) {
          // Fallback: primeira opção da lista
          const firstOpt = page.locator('ul[role="listbox"] li[role="option"]').first();
          if (await firstOpt.count() > 0) {
            const txt = await firstOpt.textContent().catch(() => '');
            await firstOpt.click({ force: true });
            opcaoSelecionada = (txt || '').trim();
          }
        }
        
        if (opcaoSelecionada) {
          console.log(`   ✅ Distribuidora selecionada: ${opcaoSelecionada}`);
        } else {
          console.warn('   ⚠️  Nenhuma opção de distribuidora foi selecionada');
        }
        await delay(1200);
      } else {
        console.log('   ℹ️  Combobox de distribuidora não encontrado — pode estar auto-detectado neste fluxo');
      }
    } catch (e) {
      console.warn(`   ⚠️  Falha ao selecionar distribuidora: ${e.message}`);
    }
    
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(1500);
    await screenshot(page, customerId, '05-formulario-preenchido');
    
    // ─── 11.1 Possui placas solares instaladas? (default: Não) ────────────
    currentPhase = 'fase8c-placas-solares';
    try {
      const placasLabel = page.getByText(/Possui placas solares instaladas/i).first();
      if (await placasLabel.count() > 0 && await placasLabel.isVisible().catch(() => false)) {
        console.log('   ☀️  Pergunta "Possui placas solares" detectada — selecionando "Não"');
        // Tentar radio "Não" (mais seguro como default)
        const radioNao = page.locator('label:has-text("Não") input[type="radio"], input[type="radio"][value="nao" i], input[type="radio"][value="false" i]').first();
        if (await radioNao.count() > 0) {
          await radioNao.check({ force: true }).catch(async () => {
            await page.locator('label:has-text("Não")').first().click({ force: true }).catch(() => {});
          });
          console.log('   ✅ Placas solares: Não');
        }
        await delay(1000);
      }
    } catch (e) {
      console.warn(`   ⚠️  Pergunta placas solares: ${e.message}`);
    }
    
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(1500);
    
    // ─── 12. Tipo de Documento (MUI Dropdown) ───────────────────────────
    currentPhase = 'tipo-documento';
    console.log('\n📋 [9/16] Tipo de documento...');

    // `data.documentType` JÁ vem normalizado em "cnh" | "rg_novo" | "rg_antigo"
    const tipoDocCanonical = normalizeDocType(data.documentType);
    const opcaoTexto = portalDocLabel(tipoDocCanonical); // "CNH" | "RG (Novo)" | "RG (Antigo)"
    const isCNH = tipoDocCanonical === 'cnh';
    console.log(`[FASE_DOC_TYPE] [INPUT] canonical="${tipoDocCanonical}" → portal="${opcaoTexto}" (CNH=${isCNH})`);

    let tipoDocOk = false;

    // Portal usa MUI Select (dropdown customizado com div, não <select>)
    const muiTriggers = [
      '.MuiSelect-select',
      '[role="combobox"]',
      '[aria-haspopup="listbox"]',
      'select',
      'div:has-text("Tipo documento"):not(:has(div:has-text("Tipo documento")))',
      'input[placeholder*="tipo" i]',
    ];

    const comboByContext = await findComboboxByContext(/tipo\s*documento/i);
    if (comboByContext) {
      muiTriggers.unshift('[data-picked-combobox="tipo-documento"]');
      await comboByContext.evaluate((el) => el.setAttribute('data-picked-combobox', 'tipo-documento')).catch(() => {});
    }

    for (const sel of muiTriggers) {
      if (tipoDocOk) break;
      try {
        const el = page.locator(sel).first();
        if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
          // Checar se é um <select> nativo
          const tagName = await el.evaluate(e => e.tagName).catch(() => '');
          if (tagName === 'SELECT') {
            await el.selectOption({ label: opcaoTexto }).catch(async () => {
              const options = await el.locator('option').allTextContents();
              const match = options.find(o => o.trim() === opcaoTexto || o.includes(opcaoTexto));
              if (match) await el.selectOption({ label: match });
            });
            console.log(`[FASE_DOC_TYPE] [OK] select nativo → "${opcaoTexto}"`);
            tipoDocOk = true;
            break;
          }

          // MUI Select: clicar para abrir dropdown
          await el.click({ timeout: 5000 });
          await delay(1000);

          // MUI: a lista pode renderizar fora da árvore → usar seletores globais
          // Importante: para CNH precisamos do match EXATO porque "CNH" pode aparecer
          // em "RG (Novo) - CNH" em algum portal customizado. Tentamos exato primeiro.
          const optionSelectors = [
            `li[role="option"]:text-is("${opcaoTexto}")`,
            `li:text-is("${opcaoTexto}")`,
            `[role="option"]:text-is("${opcaoTexto}")`,
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
              console.log(`[FASE_DOC_TYPE] [OK] MUI option "${opcaoTexto}"`);
              tipoDocOk = true;
              optionClicked = true;
              break;
            }
          }

          if (!optionClicked) {
            // Tentar texto parcial — APENAS se não for ambíguo
            const optAlt = page.getByText(opcaoTexto, { exact: false }).first();
            if (await optAlt.count() > 0 && await optAlt.isVisible().catch(() => false)) {
              await optAlt.click({ timeout: 5000 });
              console.log(`[FASE_DOC_TYPE] [OK-ALT] "${opcaoTexto}"`);
              tipoDocOk = true;
            } else {
              await page.keyboard.press('Escape').catch(() => {});
            }
          }
        }
      } catch (_) {}
    }

    if (!tipoDocOk) {
      console.warn('[FASE_DOC_TYPE] [FAIL] Tipo documento não selecionado');
      await screenshot(page, customerId, '05b-tipo-doc-FALHOU');
      try {
        const html = await page.content();
        const htmlPath = join(SCREENSHOTS_DIR, `${customerId}-05b-tipo-doc-FALHOU-${Date.now()}.html`);
        writeFileSync(htmlPath, html);
        console.log('   📄 HTML dump salvo para diagnóstico');
      } catch (_) {}
      throw new Error(`[FASE_DOC_TYPE] Tipo de documento "${opcaoTexto}" não pôde ser selecionado`);
    }

    // Após selecionar o tipo, o portal mostra/esconde o campo verso.
    // Validamos visualmente: para CNH NÃO deve haver input de verso visível;
    // para RG, deve haver. Se não bater, screenshot e log mas seguimos
    // (o portal pode renderizar tarde).
    await delay(1500);
    try {
      const versoVisible = await page
        .locator('#file_input_verso_documento_pessoal, input[name="verso_documento_pessoal"]')
        .first()
        .isVisible()
        .catch(() => false);
      if (isCNH && versoVisible) {
        console.warn('[FASE_DOC_TYPE] [WARN] Selecionou CNH mas campo verso ainda visível — portal pode estar travado');
      } else if (!isCNH && !versoVisible) {
        console.warn('[FASE_DOC_TYPE] [WARN] Selecionou RG mas campo verso NÃO visível — aguardando portal renderizar...');
        await delay(2000);
      }
      console.log(`[FASE_DOC_TYPE] [STATE] versoVisible=${versoVisible} (esperado=${!isCNH})`);
    } catch (_) {}

    // ─── 13. UPLOAD: Documentos pessoais (frente + verso quando RG) ────────
    currentPhase = 'upload-documentos';
    console.log('\n📋 [10/16] Upload documentos pessoais...');
    await delay(2000);

    // Scroll para revelar seção de upload
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2000);

    let docsEnviados = 0;

    // ESTRATÉGIA 0: IDs REAIS validados live no portal (2026-04-17)
    // Portal usa: #file_input_frente_documento_pessoal e #file_input_verso_documento_pessoal
    // accept="image/*" — NÃO ACEITA PDF! Conversor pdf→jpg deve estar ativo
    if (docFrentePath) {
      const frenteOk = await setFileDirectly(page.locator('#file_input_frente_documento_pessoal'), docFrentePath, 'Documento FRENTE enviado (#file_input_frente_documento_pessoal)')
        || await setFileDirectly(page.locator('input[name="frente_documento_pessoal"]'), docFrentePath, 'Documento FRENTE enviado (name)')
        || await setFileDirectly(page.locator('#file-frente'), docFrentePath, 'Documento FRENTE enviado (legacy #file-frente)')
        || await setFileByLabelPattern(/frente/i, docFrentePath, 'Documento FRENTE enviado (label)');
      if (frenteOk) {
        docsEnviados++;
        console.log('[FASE_UPLOAD_DOC] [OK] frente enviada');
        await delay(2000);
      } else {
        console.warn('[FASE_UPLOAD_DOC] [WARN] frente não enviada via IDs/labels conhecidos');
      }
    }

    // VERSO: somente quando NÃO é CNH
    if (!isCNH && docVersoPath) {
      const versoOk = await setFileDirectly(page.locator('#file_input_verso_documento_pessoal'), docVersoPath, 'Documento VERSO enviado (#file_input_verso_documento_pessoal)')
        || await setFileDirectly(page.locator('input[name="verso_documento_pessoal"]'), docVersoPath, 'Documento VERSO enviado (name)')
        || await setFileDirectly(page.locator('#file-verso'), docVersoPath, 'Documento VERSO enviado (legacy #file-verso)')
        || await setFileByLabelPattern(/verso/i, docVersoPath, 'Documento VERSO enviado (label)');
      if (versoOk) {
        docsEnviados++;
        console.log('[FASE_UPLOAD_DOC] [OK] verso enviado');
        await delay(2000);
      } else {
        console.warn('[FASE_UPLOAD_DOC] [WARN] verso não enviado via IDs/labels conhecidos');
      }
    } else if (isCNH) {
      console.log('[FASE_UPLOAD_DOC] [SKIP] CNH — não precisa de verso');
    }

    // ESTRATÉGIA 1: input[type="file"] direto (portal antigo)
    const allFileInputsCount = await page.locator('input[type="file"]').count();
    console.log(`   📊 ${allFileInputsCount} input(s) file encontrado(s)`);
    
    if (docsEnviados === 0 && allFileInputsCount >= 1 && docFrentePath) {
      try {
        await page.locator('input[type="file"]').first().setInputFiles(docFrentePath);
        console.log('   ✅ Documento FRENTE enviado (input file)');
        docsEnviados++;
        await delay(2000);
      } catch (e) {
        console.warn(`   ⚠️  Doc frente (input): ${e.message}`);
      }
      if (!isCNH && allFileInputsCount >= 2 && docVersoPath) {
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
        page.getByText('Frente', { exact: true }),
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
              page.waitForEvent('filechooser', { timeout: 8000 }),
              card.click({ timeout: 5000 }),
            ]);
            await frenteChooser.setFiles(docFrentePath);
            console.log('   ✅ Documento FRENTE enviado (fileChooser)');
            docsEnviados++;
            await delay(3000);
            break;
          }
        } catch (e) {
          console.log(`   ⚠️  Frente card falhou: ${e.message.substring(0, 60)}`);
        }
      }
      
      // Upload VERSO — SOMENTE se documento NÃO é CNH (CNH só tem Frente)
      if (!isCNH && docVersoPath && docsEnviados > 0) {
        console.log('   📋 Documento é RG — enviando verso...');
        await delay(1500);
        const versoCards = [
          page.getByText('Verso', { exact: true }),
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
                page.waitForEvent('filechooser', { timeout: 8000 }),
                card.click({ timeout: 5000 }),
              ]);
              await versoChooser.setFiles(docVersoPath);
              console.log('   ✅ Documento VERSO enviado (fileChooser)');
              docsEnviados++;
              await delay(3000);
              break;
            }
          } catch (e) {
            console.log(`   ⚠️  Verso card falhou: ${e.message.substring(0, 60)}`);
          }
        }
      } else if (isCNH) {
        console.log('   📋 Documento é CNH — verso não necessário ✅');
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
    
    console.log(`[FASE_UPLOAD_DOC] [SUMMARY] docsEnviados=${docsEnviados} (esperado=${isCNH ? 1 : 2})`);
    if (docsEnviados === 0) {
      throw new Error('[FASE_UPLOAD_DOC] Nenhum documento pessoal foi enviado para o portal');
    }
    if (!isCNH && docsEnviados < 2) {
      console.warn('[FASE_UPLOAD_DOC] [WARN] RG geralmente exige 2 arquivos (frente+verso). Seguindo, mas portal pode reclamar.');
    }
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
    
    // ESTRATÉGIA 0: inputs/labels conhecidos da conta
    contaEnviada = await setFileDirectly(page.locator('#file-conta, #file-fatura, #file-bill'), contaPath, 'Conta enviada (input conhecido)')
      || await setFileByLabelPattern(/conta|fatura/i, contaPath, 'Conta enviada (label)');

    // ESTRATÉGIA 1: input[type="file"] disponível
    const allFileInputs = await page.locator('input[type="file"]').all();
    console.log(`   📊 Total inputs file agora: ${allFileInputs.length}`);
    
    // A conta é geralmente o último ou 3º input file
    if (!contaEnviada && allFileInputs.length >= 3) {
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
    
    if (!contaEnviada) {
      console.warn('   ⚠️  Conta de energia NÃO enviada');
      throw new Error('Conta de energia não foi enviada para o portal');
    }
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
        const disabled = await inp.isDisabled().catch(() => false);
        const readonly = await inp.getAttribute('readonly').catch(() => null);
        if (disabled || readonly !== null) continue;
        const val = await inp.inputValue().catch(() => '');
        const ph = await inp.getAttribute('placeholder') || '';
        if (/complemento/i.test(ph)) continue;
        if (!val || val.trim() === '') {
          console.log(`   ❌ Campo vazio: "${ph}"`);
          camposVazios++;
        }
      } catch (_) {}
    }
    
    if (camposVazios > 0) {
      console.log(`   ⚠️  ${camposVazios} campo(s) vazio(s)`);
      throw new Error(`Ainda há ${camposVazios} campo(s) obrigatório(s) vazio(s) no portal`);
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
        throw new Error('Botão Finalizar/Enviar não encontrado no portal');
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
      } else if (/assinatura|contrato|sucesso|cadastro realizado|cadastro finalizado/i.test(finalPageText)) {
        console.log('   🎉 Cadastro finalizado com sucesso (sem link facial detectado)');
        await atualizarStatus(customerId, 'portal_submitted');
      } else {
        throw new Error('Portal não confirmou envio do formulário após clicar em Finalizar');
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

    throw new Error('Fluxo terminou sem submit real do portal');

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
