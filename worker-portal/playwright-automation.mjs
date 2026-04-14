/**
 * Automação Playwright - iGreen Portal
 * Preenche automaticamente o portal iGreen
 */

import { chromium } from 'playwright-chromium';

/**
 * Executar automação completa
 */
export async function executarAutomacao(customerId, supabase) {
  let browser = null;
  let page = null;

  try {
    console.log(`🎯 Iniciando automação para customer: ${customerId}`);

    // ─── 1. BUSCAR DADOS DO CLIENTE + CONSULTOR ───────────────────
    if (!supabase) {
      throw new Error('Supabase não configurado');
    }

    // Buscar cliente COM consultor (join)
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

    // Extrair dados do consultor
    const consultant = customer.consultants as any;
    const consultorId = consultant?.igreen_id || consultant?.id;
    const consultorName = consultant?.name || 'Consultor';

    if (!consultorId) {
      throw new Error(`Consultor não encontrado para o cliente: ${customer.name}`);
    }

    console.log(`📊 Dados do cliente carregados: ${customer.name}`);
    console.log(`👤 Consultor: ${consultorName} (ID: ${consultorId})`);

    // Montar URL do portal com ID do consultor INDIVIDUAL
    const PORTAL_URL = `https://digital.igreenenergy.com.br/?id=${consultorId}&sendcontract=true`;
    console.log(`🔗 URL do portal: ${PORTAL_URL}`);

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

    // SEMPRE headless em produção — evita erro de X Server
    const isHeadless = process.env.HEADLESS !== '0';
    console.log(`🖥️ Modo headless: ${isHeadless}`);

    // Auto-detectar Chromium do sistema (prioridade sobre Playwright bundled)
    const systemChromiumPaths = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
    ].filter(Boolean);

    let executablePath = undefined;
    for (const p of systemChromiumPaths) {
      try {
        const { accessSync } = await import('fs');
        accessSync(p);
        executablePath = p;
        console.log(`✅ Usando Chromium do sistema: ${p}`);
        break;
      } catch { /* não existe, tentar próximo */ }
    }

    if (!executablePath) {
      console.log('⚠️ Nenhum Chromium do sistema encontrado — usando Playwright bundled');
    }

    const launchOptions = {
      headless: isHeadless,
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
    };

    browser = await chromium.launch(launchOptions);

    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    page = await context.newPage();

    // ─── 4. NAVEGAR PARA O PORTAL ─────────────────────────────────
    console.log(`🌐 Navegando para: ${PORTAL_URL}`);
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    console.log('✅ Portal carregado');

    // ─── 5. PREENCHER FORMULÁRIO ──────────────────────────────────
    console.log('📝 Preenchendo formulário...');

    // Fase 1: CEP + Valor da conta
    await page.fill('input[name="cep"]', formatarCEP(customer.cep));
    await page.waitForTimeout(300);

    const valorConta = customer.electricity_bill_value || 300;
    await page.fill('input[name="valor"]', String(valorConta));
    await page.waitForTimeout(300);

    await page.click('button:has-text("Calcular")');
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Fase 2: Garantir desconto
    await page.click('button:has-text("Garantir")');
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Fase 3: Dados pessoais
    await page.fill('input[name="nome"]', customer.name);
    await page.waitForTimeout(300);

    await page.fill('input[name="cpf"]', formatarCPF(customer.cpf));
    await page.waitForTimeout(300);

    if (customer.data_nascimento) {
      await page.fill('input[name="nascimento"]', customer.data_nascimento);
      await page.waitForTimeout(300);
    }

    await page.fill('input[name="whatsapp"]', formatarTelefone(customer.phone_whatsapp));
    await page.waitForTimeout(300);

    await page.fill('input[name="email"]', customer.email);
    await page.waitForTimeout(300);

    await page.fill('input[name="email_confirm"]', customer.email);
    await page.waitForTimeout(300);

    // Endereço
    await page.fill('input[name="cep"]', formatarCEP(customer.cep));
    await page.waitForTimeout(1000); // Aguardar autocomplete

    await page.fill('input[name="endereco"]', customer.address_street);
    await page.waitForTimeout(300);

    await page.fill('input[name="numero"]', customer.address_number);
    await page.waitForTimeout(300);

    if (customer.address_neighborhood) {
      await page.fill('input[name="bairro"]', customer.address_neighborhood);
      await page.waitForTimeout(300);
    }

    if (customer.address_city) {
      await page.fill('input[name="cidade"]', customer.address_city);
      await page.waitForTimeout(300);
    }

    if (customer.address_state) {
      await page.fill('input[name="estado"]', customer.address_state);
      await page.waitForTimeout(300);
    }

    if (customer.address_complement) {
      await page.fill('input[name="complemento"]', customer.address_complement);
      await page.waitForTimeout(300);
    }

    // Dados da conta de energia
    await page.fill('input[name="distribuidora"]', customer.distribuidora);
    await page.waitForTimeout(300);

    await page.fill('input[name="instalacao"]', customer.numero_instalacao);
    await page.waitForTimeout(300);

    console.log('✅ Formulário preenchido');

    // ─── 6. VERIFICAR SE PRECISA OTP ──────────────────────────────
    await page.waitForTimeout(2000);

    const otpInput = page.locator('input[placeholder*="digo"], input[name="otp"]').first();
    const needsOTP = await otpInput.count() > 0;

    if (needsOTP) {
      console.log('📱 Campo OTP detectado - aguardando código...');

      // Atualizar status
      await supabase
        .from('customers')
        .update({ status: 'awaiting_otp' })
        .eq('id', customerId);

      // Aguardar OTP (polling)
      const otpCode = await aguardarOTP(customerId, supabase);

      if (otpCode) {
        console.log(`✅ OTP recebido: ${otpCode}`);
        await otpInput.fill(otpCode);
        await page.waitForTimeout(1000);
      } else {
        throw new Error('Timeout aguardando OTP');
      }
    }

    // ─── 7. FINALIZAR ─────────────────────────────────────────────
    console.log('🎉 Clicando em Finalizar...');

    await page.click('button:has-text("Enviar"), button:has-text("Finalizar")');
    await page.waitForTimeout(4000);

    // Capturar URL final
    const finalUrl = page.url();
    console.log(`📄 URL final: ${finalUrl}`);

    // Atualizar status
    await supabase
      .from('customers')
      .update({
        status: 'registered_igreen',
        link_assinatura: finalUrl,
      })
      .eq('id', customerId);

    console.log('✅ Automação concluída!');

    // IMPORTANTE: NÃO fechar o navegador
    // O navegador permanece aberto para conferência manual

  } catch (error) {
    console.error('❌ Erro na automação:', error.message);
    throw error;
  }
}

/**
 * Aguardar OTP do cliente
 */
async function aguardarOTP(customerId, supabase, timeoutMs = 180000) {
  const inicio = Date.now();
  let tentativas = 0;

  while (Date.now() - inicio < timeoutMs) {
    tentativas++;

    // Buscar OTP no banco
    const { data: customer } = await supabase
      .from('customers')
      .select('otp_code, otp_received_at')
      .eq('id', customerId)
      .single();

    if (customer?.otp_code) {
      return customer.otp_code;
    }

    // Feedback a cada 30 segundos
    if (tentativas % 10 === 0) {
      console.log(`⏳ Aguardando OTP... (${Math.floor((Date.now() - inicio) / 1000)}s)`);
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  throw new Error(`Timeout após ${tentativas} tentativas aguardando OTP`);
}

/**
 * Formatadores
 */
function formatarCPF(cpf) {
  if (!cpf) return '';
  const numeros = cpf.replace(/\D/g, '');
  return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatarCEP(cep) {
  if (!cep) return '';
  const numeros = cep.replace(/\D/g, '');
  return numeros.replace(/(\d{5})(\d{3})/, '$1-$2');
}

function formatarTelefone(tel) {
  if (!tel) return '';
  const numeros = tel.replace(/\D/g, '');
  if (numeros.length === 11) {
    return `+55 (${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
  }
  return `+55 ${numeros}`;
}
