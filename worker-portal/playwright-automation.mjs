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

    // ─── 6. SUBMETER FORMULÁRIO ──────────────────────────────────
    console.log('🎉 Clicando em Calcular/Garantir/Enviar...');

    // Tentar clicar no botão de envio do formulário
    const submitButton = page.locator('button:has-text("Enviar"), button:has-text("Finalizar"), button:has-text("Cadastrar")').first();
    if (await submitButton.count() > 0) {
      await submitButton.click();
      await page.waitForTimeout(4000);
    }

    // ─── 7. VERIFICAR SE PRECISA OTP ──────────────────────────────
    await page.waitForTimeout(2000);

    const otpInput = page.locator('input[placeholder*="digo"], input[name="otp"], input[placeholder*="SMS"], input[placeholder*="código"]').first();
    const needsOTP = await otpInput.count() > 0;

    if (needsOTP) {
      console.log('📱 Campo OTP detectado - aguardando código do cliente...');

      // Atualizar status E conversation_step para que o webhook saiba aceitar OTP
      await supabase
        .from('customers')
        .update({
          status: 'awaiting_otp',
          conversation_step: 'aguardando_otp',
        })
        .eq('id', customerId);

      // Aguardar OTP (polling no banco - o cliente digita no WhatsApp)
      const otpCode = await aguardarOTP(customerId, supabase);

      if (otpCode) {
        console.log(`✅ OTP recebido: ${otpCode}`);
        await otpInput.fill(otpCode);
        await page.waitForTimeout(1000);

        // Clicar no botão de validar/confirmar OTP
        const confirmButton = page.locator('button:has-text("Validar"), button:has-text("Confirmar"), button:has-text("Enviar"), button[type="submit"]').first();
        if (await confirmButton.count() > 0) {
          await confirmButton.click();
          await page.waitForTimeout(5000);
        }
      } else {
        throw new Error('Timeout aguardando OTP');
      }
    }

    // ─── 8. CAPTURAR LINK DE ASSINATURA (CERTOSIGN) ───────────────
    await page.waitForTimeout(3000);

    // Tentar capturar o link de assinatura da página final
    let linkAssinatura = page.url();

    // Procurar por links de assinatura na página (CertoSign, D4Sign, etc.)
    const signatureLinks = await page.locator('a[href*="certosign"], a[href*="d4sign"], a[href*="assinatura"], a[href*="sign"]').all();
    for (const link of signatureLinks) {
      const href = await link.getAttribute('href');
      if (href) {
        linkAssinatura = href;
        console.log(`🔗 Link de assinatura encontrado: ${href}`);
        break;
      }
    }

    // Se não encontrou link explícito, verificar texto da página
    if (linkAssinatura === page.url()) {
      const pageText = await page.textContent('body');
      const linkMatch = pageText?.match(/(https?:\/\/[^\s]*(?:certosign|d4sign|assinatura|sign)[^\s]*)/i);
      if (linkMatch) {
        linkAssinatura = linkMatch[1];
        console.log(`🔗 Link de assinatura extraído do texto: ${linkAssinatura}`);
      }
    }

    console.log(`📄 URL final / Link assinatura: ${linkAssinatura}`);

    // ─── 9. ATUALIZAR BANCO E ENVIAR LINK VIA WHATSAPP ────────────
    await supabase
      .from('customers')
      .update({
        status: 'awaiting_signature',
        conversation_step: 'aguardando_assinatura',
        link_assinatura: linkAssinatura,
      })
      .eq('id', customerId);

    // Enviar link de assinatura via WhatsApp
    try {
      await enviarLinkAssinaturaWhatsApp(customerId, linkAssinatura, supabase);
      console.log('✅ Link de assinatura enviado via WhatsApp!');
    } catch (whatsErr) {
      console.error('⚠️ Erro ao enviar link via WhatsApp (não-bloqueante):', whatsErr.message);
    }

    console.log('✅ Automação concluída!');

  } catch (error) {
    console.error('❌ Erro na automação:', error.message);
    throw error;
  }
}

/**
 * Enviar link de assinatura via WhatsApp (Evolution API)
 */
async function enviarLinkAssinaturaWhatsApp(customerId, linkAssinatura, supabase) {
  // Buscar dados do cliente + instância do consultor
  const { data: customer } = await supabase
    .from('customers')
    .select('phone_whatsapp, consultant_id')
    .eq('id', customerId)
    .single();

  if (!customer) {
    console.warn('⚠️ Cliente não encontrado para envio WhatsApp');
    return;
  }

  // Buscar instância WhatsApp do consultor
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('instance_name')
    .eq('consultant_id', customer.consultant_id)
    .limit(1)
    .single();

  if (!instance) {
    console.warn('⚠️ Instância WhatsApp não encontrada para o consultor');
    return;
  }

  const EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    console.warn('⚠️ EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados');
    return;
  }

  // Normalizar telefone para JID
  let phone = (customer.phone_whatsapp || '').replace(/\D/g, '');
  if (!phone.startsWith('55')) phone = '55' + phone;
  const remoteJid = `${phone}@s.whatsapp.net`;

  const mensagem =
    '🎉 *Parabéns! Seu cadastro foi realizado com sucesso!*\n\n' +
    '📝 Agora falta apenas a *assinatura digital* para finalizar.\n\n' +
    `🔗 Acesse o link abaixo para assinar:\n${linkAssinatura}\n\n` +
    '⚠️ *Importante:*\n' +
    '• Abra o link pelo celular\n' +
    '• Siga as instruções de validação facial\n' +
    '• O link expira em 48 horas\n\n' +
    'Qualquer dúvida, responda aqui! ☀️🌱';

  const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance.instance_name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVOLUTION_API_KEY,
    },
    body: JSON.stringify({
      number: remoteJid,
      text: mensagem,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Evolution API ${res.status}: ${body.substring(0, 200)}`);
  }

  console.log(`✅ Mensagem enviada para ${remoteJid} via instância ${instance.instance_name}`);
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
