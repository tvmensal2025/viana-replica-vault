/**
 * Automação Playwright - iGreen Portal
 * Preenche automaticamente o portal iGreen
 */

import { chromium } from 'playwright-chromium';
import fs from 'fs';

// Detectar Chromium do sistema
function findSystemChromium() {
  const paths = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
  ].filter(Boolean);

  for (const p of paths) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch { /* próximo */ }
  }
  return undefined;
}

/**
 * Executar automação completa
 */
export async function executarAutomacao(customerId, supabase) {
  let browser = null;

  try {
    console.log(`🎯 Iniciando automação para customer: ${customerId}`);

    // ─── 1. BUSCAR DADOS DO CLIENTE + CONSULTOR ───────────────────
    if (!supabase) {
      throw new Error('Supabase não configurado');
    }

    const { data: customer, error } = await supabase
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

    if (error || !customer) {
      throw new Error(`Cliente não encontrado: ${customerId}`);
    }

    const consultant = customer.consultants;
    const consultorId = consultant?.igreen_id || consultant?.id;
    const consultorName = consultant?.name || 'Consultor';

    if (!consultorId) {
      throw new Error(`Consultor não encontrado para o cliente: ${customer.name}`);
    }

    console.log(`📊 Dados: ${customer.name} | Consultor: ${consultorName} (${consultorId})`);

    const PORTAL_URL = `https://digital.igreenenergy.com.br/?id=${consultorId}&sendcontract=true`;

    // ─── 2. VALIDAR CAMPOS OBRIGATÓRIOS ───────────────────────────
    const camposObrigatorios = {
      name: 'Nome completo',
      cpf: 'CPF',
      email: 'Email',
      phone_whatsapp: 'WhatsApp',
      cep: 'CEP',
      address_street: 'Endereço',
      address_number: 'Número',
      address_city: 'Cidade',
      address_state: 'Estado',
      distribuidora: 'Distribuidora',
      numero_instalacao: 'Número de instalação',
    };

    const camposFaltando = [];
    for (const [campo, label] of Object.entries(camposObrigatorios)) {
      if (!customer[campo]) {
        camposFaltando.push(label);
      }
    }

    if (camposFaltando.length > 0) {
      throw new Error(`Campos obrigatórios faltando: ${camposFaltando.join(', ')}`);
    }

    // ─── 3. ABRIR NAVEGADOR ───────────────────────────────────────
    console.log('🌐 Abrindo navegador...');

    const executablePath = findSystemChromium();
    if (executablePath) {
      console.log(`✅ Chromium: ${executablePath}`);
    } else {
      console.log('⚠️ Usando Playwright bundled Chromium');
    }

    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--single-process',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // ─── 4. NAVEGAR PARA O PORTAL ─────────────────────────────────
    console.log(`🌐 Navegando: ${PORTAL_URL}`);
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2000);
    console.log('✅ Portal carregado');

    // ─── 5. PREENCHER FORMULÁRIO ──────────────────────────────────
    console.log('📝 Preenchendo formulário...');

    // Helper para preencher campo com retry
    async function fillField(selector, value, fieldName) {
      if (!value) return false;
      try {
        const field = page.locator(selector).first();
        if (await field.count() > 0) {
          await field.scrollIntoViewIfNeeded().catch(() => {});
          await field.fill('');
          await field.fill(String(value));
          await page.waitForTimeout(300);
          console.log(`  ✓ ${fieldName}: ${String(value).substring(0, 30)}`);
          return true;
        }
        console.log(`  ⚠ ${fieldName}: campo não encontrado (${selector})`);
        return false;
      } catch (err) {
        console.log(`  ⚠ ${fieldName}: ${err.message}`);
        return false;
      }
    }

    // Helper para clicar com retry
    async function clickButton(textOrSelector, label, timeout = 15000) {
      try {
        const btn = page.locator(textOrSelector).first();
        if (await btn.count() > 0) {
          await btn.scrollIntoViewIfNeeded().catch(() => {});
          await btn.click();
          await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
          await page.waitForTimeout(1000);
          console.log(`  ✓ Clicou: ${label}`);
          return true;
        }
        console.log(`  ⚠ Botão não encontrado: ${label}`);
        return false;
      } catch (err) {
        console.log(`  ⚠ Erro ao clicar ${label}: ${err.message}`);
        return false;
      }
    }

    // Fase 1: CEP + Valor da conta
    await fillField('input[name="cep"]', formatarCEP(customer.cep), 'CEP');

    const valorConta = customer.electricity_bill_value || 300;
    await fillField('input[name="valor"]', String(valorConta), 'Valor conta');

    await clickButton('button:has-text("Calcular")', 'Calcular');

    // Fase 2: Garantir desconto
    await clickButton('button:has-text("Garantir")', 'Garantir desconto');

    // Fase 3: Dados pessoais
    await fillField('input[name="nome"]', customer.name, 'Nome');
    await fillField('input[name="cpf"]', formatarCPF(customer.cpf), 'CPF');

    if (customer.data_nascimento) {
      await fillField('input[name="nascimento"]', customer.data_nascimento, 'Nascimento');
    }

    await fillField('input[name="whatsapp"]', formatarTelefone(customer.phone_whatsapp), 'WhatsApp');
    await fillField('input[name="email"]', customer.email, 'Email');
    await fillField('input[name="email_confirm"]', customer.email, 'Confirmar email');

    // Endereço
    await fillField('input[name="cep"]', formatarCEP(customer.cep), 'CEP (endereço)');
    await page.waitForTimeout(1500); // Aguardar autocomplete

    await fillField('input[name="endereco"]', customer.address_street, 'Endereço');
    await fillField('input[name="numero"]', customer.address_number, 'Número');

    if (customer.address_neighborhood) {
      await fillField('input[name="bairro"]', customer.address_neighborhood, 'Bairro');
    }
    if (customer.address_city) {
      await fillField('input[name="cidade"]', customer.address_city, 'Cidade');
    }
    if (customer.address_state) {
      await fillField('input[name="estado"]', customer.address_state, 'Estado');
    }
    if (customer.address_complement) {
      await fillField('input[name="complemento"]', customer.address_complement, 'Complemento');
    }

    // Dados da conta de energia
    await fillField('input[name="distribuidora"]', customer.distribuidora, 'Distribuidora');
    await fillField('input[name="instalacao"]', customer.numero_instalacao, 'Nº instalação');

    console.log('✅ Formulário preenchido');

    // ─── 6. SUBMETER FORMULÁRIO ──────────────────────────────────
    console.log('📤 Submetendo...');

    await clickButton(
      'button:has-text("Enviar"), button:has-text("Finalizar"), button:has-text("Cadastrar")',
      'Enviar/Finalizar',
      20000
    );

    // ─── 7. VERIFICAR SE PRECISA OTP ──────────────────────────────
    await page.waitForTimeout(3000);

    const otpInput = page.locator('input[placeholder*="digo"], input[name="otp"], input[placeholder*="SMS"], input[placeholder*="código"]').first();
    const needsOTP = await otpInput.count() > 0;

    if (needsOTP) {
      console.log('📱 Campo OTP detectado - aguardando código do cliente...');

      await supabase
        .from('customers')
        .update({
          status: 'awaiting_otp',
          conversation_step: 'aguardando_otp',
        })
        .eq('id', customerId);

      // Enviar mensagem pedindo OTP via Evolution API
      try {
        await enviarMensagemWhatsApp(
          customerId,
          '📱 *Código de verificação!*\n\n' +
          'Você recebeu um SMS com um código de 6 dígitos.\n' +
          'Por favor, digite o código aqui para concluir seu cadastro.',
          supabase
        );
      } catch (e) {
        console.warn('⚠️ Erro ao pedir OTP via WhatsApp:', e.message);
      }

      const otpCode = await aguardarOTP(customerId, supabase);

      if (otpCode) {
        console.log(`✅ OTP recebido: ${otpCode}`);
        await otpInput.fill(otpCode);
        await page.waitForTimeout(1000);

        await clickButton(
          'button:has-text("Validar"), button:has-text("Confirmar"), button:has-text("Enviar"), button[type="submit"]',
          'Confirmar OTP',
          20000
        );
      } else {
        throw new Error('Timeout aguardando OTP do cliente');
      }
    }

    // ─── 8. CAPTURAR LINK DE ASSINATURA ───────────────────────────
    await page.waitForTimeout(4000);

    let linkAssinatura = null;

    // Procurar links de assinatura
    const signatureLinks = await page.locator('a[href*="certosign"], a[href*="d4sign"], a[href*="assinatura"], a[href*="sign"]').all();
    for (const link of signatureLinks) {
      const href = await link.getAttribute('href');
      if (href && href.startsWith('http')) {
        linkAssinatura = href;
        break;
      }
    }

    // Fallback: procurar no texto da página
    if (!linkAssinatura) {
      const pageText = await page.textContent('body').catch(() => '');
      const linkMatch = pageText?.match(/(https?:\/\/[^\s]*(?:certosign|d4sign|assinatura|sign)[^\s]*)/i);
      if (linkMatch) {
        linkAssinatura = linkMatch[1];
      }
    }

    // Fallback: URL atual da página
    if (!linkAssinatura) {
      linkAssinatura = page.url();
    }

    console.log(`📄 Link assinatura: ${linkAssinatura}`);

    // ─── 9. ATUALIZAR BANCO E ENVIAR LINK ─────────────────────────
    await supabase
      .from('customers')
      .update({
        status: 'awaiting_signature',
        conversation_step: 'aguardando_assinatura',
        link_assinatura: linkAssinatura,
      })
      .eq('id', customerId);

    // Enviar link via WhatsApp
    try {
      await enviarMensagemWhatsApp(
        customerId,
        '🎉 *Parabéns! Seu cadastro foi realizado com sucesso!*\n\n' +
        '📝 Agora falta apenas a *assinatura digital* para finalizar.\n\n' +
        `🔗 Acesse o link abaixo para assinar:\n${linkAssinatura}\n\n` +
        '⚠️ *Importante:*\n' +
        '• Abra o link pelo celular\n' +
        '• Siga as instruções de validação facial\n' +
        '• O link expira em 48 horas\n\n' +
        'Qualquer dúvida, responda aqui! ☀️🌱',
        supabase
      );
      console.log('✅ Link de assinatura enviado via WhatsApp!');
    } catch (whatsErr) {
      console.error('⚠️ Erro ao enviar link via WhatsApp:', whatsErr.message);
    }

    console.log('✅ Automação concluída com sucesso!');

  } catch (error) {
    console.error('❌ Erro na automação:', error.message);
    throw error;
  } finally {
    // SEMPRE fechar o navegador para evitar leak de memória
    if (browser) {
      try {
        await browser.close();
        console.log('🔒 Navegador fechado');
      } catch (e) {
        console.warn('⚠️ Erro ao fechar navegador:', e.message);
      }
    }
  }
}

/**
 * Enviar mensagem genérica via WhatsApp (Evolution API)
 */
async function enviarMensagemWhatsApp(customerId, mensagem, supabase) {
  const { data: customer } = await supabase
    .from('customers')
    .select('phone_whatsapp, consultant_id')
    .eq('id', customerId)
    .single();

  if (!customer) throw new Error('Cliente não encontrado');

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('instance_name')
    .eq('consultant_id', customer.consultant_id)
    .limit(1)
    .single();

  if (!instance) throw new Error('Instância WhatsApp não encontrada');

  const EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    throw new Error('EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados');
  }

  let phone = (customer.phone_whatsapp || '').replace(/\D/g, '');
  if (!phone.startsWith('55')) phone = '55' + phone;

  const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance.instance_name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVOLUTION_API_KEY,
    },
    body: JSON.stringify({
      number: `${phone}@s.whatsapp.net`,
      text: mensagem,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Evolution API ${res.status}: ${body.substring(0, 200)}`);
  }

  console.log(`✅ Msg enviada para ${phone} via ${instance.instance_name}`);
}

/**
 * Aguardar OTP do cliente (polling no banco)
 */
async function aguardarOTP(customerId, supabase, timeoutMs = 180000) {
  const inicio = Date.now();
  let tentativas = 0;

  while (Date.now() - inicio < timeoutMs) {
    tentativas++;

    const { data: customer } = await supabase
      .from('customers')
      .select('otp_code, otp_received_at')
      .eq('id', customerId)
      .single();

    if (customer?.otp_code) {
      return customer.otp_code;
    }

    if (tentativas % 10 === 0) {
      console.log(`⏳ Aguardando OTP... (${Math.floor((Date.now() - inicio) / 1000)}s)`);
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  return null; // Retorna null em vez de throw para tratamento mais limpo
}

/**
 * Formatadores
 */
function formatarCPF(cpf) {
  if (!cpf) return '';
  return cpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatarCEP(cep) {
  if (!cep) return '';
  return cep.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2');
}

function formatarTelefone(tel) {
  if (!tel) return '';
  const n = tel.replace(/\D/g, '');
  if (n.length === 11) return `+55 (${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 13 && n.startsWith('55')) return `+55 (${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}`;
  return `+55 ${n}`;
}
