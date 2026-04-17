import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateCustomerForPortal } from "../_shared/validators.ts";
import { logStructured, fetchWithTimeout, fetchInsecure, withRetry, buscarCepPorEndereco, normalizePhone, TIMEOUT_VIA_CEP } from "../_shared/utils.ts";
import { getNextMissingStep, getReplyForStep, validarCPFDigitos } from "../_shared/conversation-helpers.ts";
import { ocrContaEnergia, ocrDocumentoFrenteVerso } from "../_shared/ocr.ts";
import { createEvolutionSender, parseEvolutionMessage, extractMediaUrl } from "../_shared/evolution-api.ts";
import { checkAndMarkProcessed, logStepTransition, jsonLog, generateCorrelationId } from "../_shared/audit.ts";

// Threshold mínimo de confiança para aceitar dados extraídos pelo OCR.
// Abaixo disso, pedimos reenvio da imagem.
const OCR_CONFIDENCE_THRESHOLD = 70;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-instance-name",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY") || "";
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

// ─── Auto-resolve CEP from address data (avoid asking user) ──────────
async function autoResolveCepIfNeeded(merged: any, updates: any): Promise<string> {
  let step = getNextMissingStep(merged);
  if (step === "ask_cep" && merged.address_city && merged.address_state && merged.address_street) {
    console.log("🔍 Auto-resolvendo CEP via ViaCEP antes de perguntar ao usuário...");
    try {
      const cepAuto = await buscarCepPorEndereco(merged.address_state, merged.address_city, merged.address_street);
      if (cepAuto && cepAuto.length === 8 && !/000$/.test(cepAuto)) {
        console.log(`✅ CEP auto-resolvido: ${cepAuto}`);
        merged.cep = cepAuto;
        updates.cep = cepAuto;
        // Recalcular next step agora que CEP foi preenchido
        step = getNextMissingStep(merged);
      } else {
        console.log("⚠️ ViaCEP não retornou CEP específico, perguntando ao usuário.");
      }
    } catch (e: any) {
      console.warn(`⚠️ Erro auto-resolve CEP: ${e?.message}`);
    }
  }
  return step;
}

// ─── Rate limiter por telefone (anti-flood) ──────────────────────────
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 5_000; // 5 segundos
const RATE_LIMIT_MAX = 4; // máximo 4 msgs por janela

function isRateLimited(phone: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(phone) || [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  rateLimitMap.set(phone, recent);
  // Limpar phones antigos periodicamente (a cada 100 entries)
  if (rateLimitMap.size > 100) {
    for (const [key, ts] of rateLimitMap) {
      if (ts.every(t => now - t > 60_000)) rateLimitMap.delete(key);
    }
  }
  return recent.length > RATE_LIMIT_MAX;
}

// ─── Deduplicação de mensagens (PERSISTENTE via tabela webhook_message_dedup) ──
// Substituiu o Map em memória anterior, que não funcionava em ambiente
// horizontalmente escalado (cada execução tinha seu próprio map).
// Agora a dedup é atômica via INSERT com ON CONFLICT.

// ─── Cooldown de reconexão (evitar loop infinito) ────────────────────
const reconnectCooldowns = new Map<string, number>();
const RECONNECT_COOLDOWN_MS = 120_000; // 2 minutos entre tentativas

function canReconnect(instance: string): boolean {
  const now = Date.now();
  const last = reconnectCooldowns.get(instance) || 0;
  if (now - last < RECONNECT_COOLDOWN_MS) return false;
  reconnectCooldowns.set(instance, now);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─── Parse body ───────────────────────────────────────────────────────
    const body = await req.json();
    console.log("Evolution webhook received:", JSON.stringify(body).substring(0, 500));

    // ─── Handle CONNECTION_UPDATE events ─────────────────────────────────
    const eventType = body.event;
    if (eventType === "connection.update" || eventType === "CONNECTION_UPDATE") {
      const connState = body.data?.state || body.state;
      const connInstance = body.instance || body.data?.instance || req.headers.get("x-instance-name");
      const statusReason = body.data?.statusReason || 0;
      console.log(`📡 CONNECTION_UPDATE: instance=${connInstance}, state=${connState}, reason=${statusReason}`);

      if (connState === "open" && connInstance) {
        // Extract the owner's phone number from the connection data
        const ownerJid = body.data?.ownerJid || body.ownerJid || "";
        const ownerPhone = ownerJid ? ownerJid.replace(/@.*$/, "") : "";
        
        if (ownerPhone) {
          console.log(`📱 Saving connected phone: ${ownerPhone} for instance: ${connInstance}`);
          await supabase
            .from("whatsapp_instances")
            .update({ connected_phone: ownerPhone })
            .eq("instance_name", connInstance);
        }
      }

      // ─── Auto-reconexão: se a instância caiu, tentar reconectar ────────
      if (connState === "close" && connInstance && EVOLUTION_API_URL && EVOLUTION_API_KEY && canReconnect(connInstance)) {
        const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");
        console.log(`🔄 Instância ${connInstance} desconectou (reason=${statusReason}). Tentando reconectar em 5s...`);
        
        try {
          await new Promise(r => setTimeout(r, 5000));
          
          const reconnRes = await fetchWithTimeout(`${baseUrl}/instance/connect/${connInstance}`, {
            method: "GET",
            headers: { "apikey": EVOLUTION_API_KEY },
            timeout: 10_000,
          });
          
          if (reconnRes.ok) {
            console.log(`✅ Reconexão iniciada para ${connInstance}`);
          } else {
            const errText = await reconnRes.text();
            console.warn(`⚠️ Falha ao reconectar ${connInstance}: ${reconnRes.status} ${errText.substring(0, 200)}`);
          }
        } catch (e: any) {
          console.warn(`⚠️ Erro ao tentar reconectar ${connInstance}: ${e.message}`);
        }
      } else if (connState === "close" && connInstance) {
        console.log(`⏳ Reconexão em cooldown para ${connInstance}, aguardando 2 min`);
      }

      return new Response(JSON.stringify({ ok: true, event: "connection_update" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Identificar instância (pode vir no body ou header)
    const instanceName = body.instance || req.headers.get("x-instance-name");
    if (!instanceName) {
      console.error("❌ Instance name not found in body or header");
      return new Response(JSON.stringify({ error: "Instance name required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar instância no banco
    const { data: instanceData, error: instanceError } = await supabase
      .from("whatsapp_instances")
      .select("id, instance_name, consultant_id")
      .eq("instance_name", instanceName)
      .single();

    if (instanceError || !instanceData) {
      console.error(`❌ Instance not found: ${instanceName}`, instanceError);
      return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar consultor separadamente (sem join FK)
    const { data: consultantData } = await supabase
      .from("consultants")
      .select("id, name, igreen_id")
      .eq("id", instanceData.consultant_id)
      .single();

    console.log(`✅ Instance found: ${instanceName} (consultant: ${consultantData?.name || "unknown"})`);

    const nomeRepresentante = consultantData?.name || "iGreen Energy";
    const consultorId = consultantData?.igreen_id || "124170";

    // Criar sender Evolution usando variáveis de ambiente
    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      console.error("❌ EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados");
      return new Response(JSON.stringify({ error: "Evolution API not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { sendText, sendButtons, downloadMedia, sendMedia } = createEvolutionSender(
      EVOLUTION_API_URL,
      EVOLUTION_API_KEY,
      instanceName
    );

    // Parse mensagem Evolution
    const parsed = parseEvolutionMessage(body);
    if (!parsed) {
      console.log("⏭️ Mensagem ignorada (from_me ou grupo)");
      return new Response(JSON.stringify({ ok: true, msg: "ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Deduplicação por messageId (persistente) ───────────────────
    const messageId = body.data?.key?.id || "";
    if (await checkAndMarkProcessed(supabase, messageId, instanceName)) {
      jsonLog("info", "duplicate message ignored", { instance_name: instanceName, message_id: messageId });
      return new Response(JSON.stringify({ ok: true, msg: "duplicate" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const {
      remoteJid,
      messageText,
      buttonId,
      hasImage,
      hasDocument,
      isFile,
      isButton,
      imageMessage,
      documentMessage,
      key,
      message,
    } = parsed;

    if (!messageText && !isFile && !isButton) {
      console.log("⏭️ Mensagem vazia");
      return new Response(JSON.stringify({ ok: true, msg: "empty" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phone = normalizePhone(remoteJid.replace("@s.whatsapp.net", ""));

    // ─── Rate limit check ─────────────────────────────────────────
    if (isRateLimited(phone)) {
      console.warn(`🚫 Rate limited: ${phone} (>${RATE_LIMIT_MAX} msgs em ${RATE_LIMIT_WINDOW_MS}ms)`);
      return new Response(JSON.stringify({ ok: true, msg: "rate_limited" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // ─── INTERCEPTAR OTP: capturar código antes de buscar cliente ativo ──
    // O OTP chega via WhatsApp (não SMS). O cliente responde na conversa.
    if (messageText) {
      const otpMatch = messageText.replace(/\D/g, '');
      // OTP válido: 4-8 dígitos puros ou extraído de frase
      const otpPatterns = [
        /(?:c[oó]digo|code|otp|token|verifica[cç][aã]o)[^\d]*(\d{4,8})/i,
        /^(\d{4,8})$/,
      ];
      let extractedOtp: string | null = null;
      for (const pat of otpPatterns) {
        const m = messageText.match(pat);
        if (m) { extractedOtp = m[1] || m[0]; break; }
      }
      // Se mensagem é apenas dígitos (4-8), considerar como OTP
      if (!extractedOtp && /^\d{4,8}$/.test(otpMatch)) {
        extractedOtp = otpMatch;
      }

      if (extractedOtp) {
        // Verificar se este telefone tem um lead em awaiting_otp ou portal_submitting
        const { data: otpCustomer } = await supabase
          .from("customers")
          .select("id, name, status")
          .eq("phone_whatsapp", phone)
          .eq("consultant_id", instanceData.consultant_id)
          .in("status", ["awaiting_otp", "portal_submitting"])
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (otpCustomer) {
          console.log(`🔑 OTP capturado via WhatsApp: ${extractedOtp} para ${otpCustomer.name} (${otpCustomer.id})`);
          
          // Salvar OTP no banco
          await supabase.from("customers").update({
            otp_code: extractedOtp,
            otp_received_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", otpCustomer.id);

          // Notificar o Worker VPS (se configurado)
          const workerUrl = Deno.env.get("WORKER_PORTAL_URL");
          const workerSecret = Deno.env.get("WORKER_SECRET");
          if (workerUrl) {
            try {
              await fetchWithTimeout(`${workerUrl}/confirm-otp`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${workerSecret || ""}`,
                },
                body: JSON.stringify({
                  customer_id: otpCustomer.id,
                  otp_code: extractedOtp,
                }),
                timeout: 5000,
              });
              console.log(`✅ OTP enviado ao Worker VPS`);
            } catch (e: any) {
              console.warn(`⚠️ Falha ao notificar Worker: ${e.message}`);
            }
          }

          // Responder ao cliente
          await sendText(remoteJid, `✅ Código recebido! Processando...`);

          // Log
          await supabase.from("conversations").insert({
            customer_id: otpCustomer.id,
            message_direction: "inbound",
            message_text: messageText,
            message_type: "text",
            conversation_step: "otp_received",
          });

          return new Response(JSON.stringify({ ok: true, otp: extractedOtp, customer_id: otpCustomer.id }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // ─── Buscar ou criar cliente ──────────────────────────────────────
    const statusFinalizados = [
      'data_complete', 'portal_submitting', 'awaiting_otp', 'validating_otp',
      'awaiting_manual_submit', 'portal_submitted', 'registered_igreen',
      'awaiting_signature', 'complete',
    ];
    const stepsFinalizados = ['complete', 'portal_submitting'];

    let { data: activeRecords } = await supabase
      .from("customers")
      .select("*")
      .eq("phone_whatsapp", phone)
      .eq("consultant_id", instanceData.consultant_id)
      .not("status", "in", `(${statusFinalizados.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(1);

    let customer = activeRecords?.[0] || null;

    // Se a automação falhou, permitir que o cliente recomece
    if (customer && customer.status === "automation_failed") {
      console.log(`♻️ Telefone ${phone}: automation_failed → resetando para welcome`);
      await supabase.from("customers").update({ conversation_step: "welcome", status: "pending", error_message: null }).eq("id", customer.id);
      customer.conversation_step = "welcome";
      customer.status = "pending";
    }

    if (customer && stepsFinalizados.includes(customer.conversation_step || "")) {
      console.log(`📱 Telefone ${phone}: cliente com step="${customer.conversation_step}" (finalizado). Criando novo.`);
      customer = null;
    }

    if (!customer) {
      console.log(`📱 Telefone ${phone}: criando novo registro.`);
      const { data: newCustomer, error } = await supabase
        .from("customers")
        .insert({
          phone_whatsapp: phone,
          consultant_id: instanceData.consultant_id,
          status: "pending",
          conversation_step: "welcome",
        })
        .select().single();
      if (error) {
        console.error("Error creating customer:", error);
        // Fallback: if insert failed (e.g. duplicate), try to reuse existing record
        const { data: fallback } = await supabase
          .from("customers")
          .select("*")
          .eq("phone_whatsapp", phone)
          .eq("consultant_id", instanceData.consultant_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fallback) {
          console.log(`♻️ Reusing existing record for ${phone} (step: ${fallback.conversation_step})`);
          // Reset to welcome if it was finalized
          if (stepsFinalizados.includes(fallback.conversation_step || "") || statusFinalizados.includes(fallback.status)) {
            await supabase.from("customers").update({ conversation_step: "welcome", status: "pending" }).eq("id", fallback.id);
            fallback.conversation_step = "welcome";
            fallback.status = "pending";
          }
          customer = fallback;
        } else {
          return new Response(JSON.stringify({ error: "Failed to create customer" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } else {
        customer = newCustomer;
      }
    }

    // Log inbound
    await supabase.from("conversations").insert({
      customer_id: customer.id,
      message_direction: "inbound",
      message_text: isFile ? "[arquivo]" : messageText,
      message_type: isFile ? "image" : "text",
      conversation_step: customer.conversation_step,
    });

    const step = customer.conversation_step || "welcome";
    let reply = "";
    const updates: Record<string, any> = {};

    // Variáveis para armazenar URL/base64 de mídia
    let fileUrl: string | null = null;
    let fileBase64: string | null = null;

    // Se tem arquivo, SEMPRE baixar via Evolution API (getBase64FromMediaMessage)
    // As URLs mmg.whatsapp.net são criptografadas e expiram — não servem para OCR
    if (isFile) {
      console.log("📥 Baixando mídia via Evolution API (getBase64FromMediaMessage)...");
      fileBase64 = await downloadMedia(key, message);
      if (fileBase64) {
        const mimeType = imageMessage?.mimetype || documentMessage?.mimetype || "application/octet-stream";
        fileUrl = `data:${mimeType};base64,${fileBase64}`;
        console.log(`✅ Mídia baixada via Evolution (${mimeType}, b64 len: ${fileBase64.length})`);
      } else {
        // Fallback: tentar URL direta (pode funcionar para URLs públicas)
        fileUrl = extractMediaUrl(message);
        if (fileUrl) {
          console.warn("⚠️ downloadMedia falhou, usando URL direta como fallback:", fileUrl.substring(0, 80));
        } else {
          console.error("❌ Falha total ao baixar mídia — sem base64 e sem URL");
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // MÁQUINA DE ESTADOS
    // ═══════════════════════════════════════════════════════════════════
    switch (step) {

      // ─── 1. BOAS-VINDAS (Menu Inicial com 3 opções) ────────────────────
      case "welcome": {
        const welcomeMsg =
          `👋 Olá! Eu sou o assistente digital da *${nomeRepresentante}* em parceria com a *iGreen Energy*! ☀️\n\n` +
          `💡 Você sabia que pode *economizar até 20% na sua conta de luz* sem precisar instalar nada?\n\n` +
          `🌱 A iGreen Energy oferece energia limpa e renovável, direto da fonte para a sua casa!\n\n` +
          `Como posso te ajudar?`;

        await sendButtons(remoteJid, welcomeMsg, [
          { id: "entender_desconto", title: "💡 Como funciona?" },
          { id: "cadastrar_agora", title: "📋 Cadastrar" },
          { id: "falar_humano", title: "🧑 Falar com humano" },
        ]);

        updates.conversation_step = "menu_inicial";
        reply = "";
        break;
      }

      // ─── 1b. MENU INICIAL (processa resposta do welcome) ──────────────
      case "menu_inicial": {
        const resp = isButton ? buttonId : messageText.toLowerCase().trim();

        if (resp === "entender_desconto" || resp === "1" || resp?.includes("funciona") || resp?.includes("entender") || resp?.includes("desconto")) {
          // Opção 1: Enviar vídeo explicativo
          const videoUrl = "https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/video%20igreen/WhatsApp%20Video%202025-05-29%20at%2021.37.39.mp4";
          
          await sendText(remoteJid, "🎬 Assista este vídeo rápido e entenda como funciona o desconto na sua conta de luz:");
          
          const sent = await sendMedia(remoteJid, videoUrl, "☀️ Conexão Green — Energia limpa com até 20% de desconto!", "video");
          
          if (!sent) {
            // Sem fallback de link — apenas avisar que o vídeo virá em instantes
            await sendText(remoteJid, "⚠️ Tive um problema momentâneo ao enviar o vídeo. Mas vamos seguir com seu cadastro normalmente!");
          }

          // Aguardar 3 segundos antes do menu pós-vídeo
          await new Promise(r => setTimeout(r, 3000));

          const posVideoMsg = "📺 Assistiu o vídeo? Agora escolha como deseja prosseguir:";
          await sendButtons(remoteJid, posVideoMsg, [
            { id: "cadastrar_agora", title: "📋 Cadastrar agora" },
            { id: "falar_humano", title: "🧑 Falar com humano" },
          ]);

          updates.conversation_step = "pos_video";
          reply = "";

        } else if (resp === "cadastrar_agora" || resp === "2" || resp?.includes("cadastr")) {
          // Opção 2: Ir direto para cadastro
          reply =
            "📋 Ótimo! Vamos iniciar seu cadastro.\n\n" +
            "📸 *Envie uma FOTO ou PDF da sua conta de energia* para começarmos!\n\n" +
            "Formatos aceitos: JPG, PNG ou PDF";
          updates.conversation_step = "aguardando_conta";

        } else if (resp === "falar_humano" || resp === "3" || resp?.includes("humano") || resp?.includes("atendente") || resp?.includes("pessoa")) {
          // Opção 3: Falar com humano
          reply =
            `🧑 Entendido! Um consultor da equipe *${nomeRepresentante}* entrará em contato com você em breve.\n\n` +
            "⏰ Nosso horário de atendimento é de segunda a sexta, das 8h às 18h.\n\n" +
            "Enquanto isso, se mudar de ideia, é só digitar *cadastrar* para iniciar!";
          updates.conversation_step = "aguardando_humano";

        } else {
          // Resposta não reconhecida — reenviar menu
          const retryMsg = "🤔 Não entendi sua resposta. Por favor, escolha uma das opções:";
          await sendButtons(remoteJid, retryMsg, [
            { id: "entender_desconto", title: "💡 Como funciona?" },
            { id: "cadastrar_agora", title: "📋 Cadastrar" },
            { id: "falar_humano", title: "🧑 Falar com humano" },
          ]);
          reply = "";
        }
        break;
      }

      // ─── 1c. PÓS-VÍDEO (menu reduzido) ───────────────────────────────
      case "pos_video": {
        const resp = isButton ? buttonId : messageText.toLowerCase().trim();

        if (resp === "cadastrar_agora" || resp === "1" || resp?.includes("cadastr")) {
          reply =
            "📋 Ótimo! Vamos iniciar seu cadastro.\n\n" +
            "📸 *Envie uma FOTO ou PDF da sua conta de energia* para começarmos!\n\n" +
            "Formatos aceitos: JPG, PNG ou PDF";
          updates.conversation_step = "aguardando_conta";

        } else if (resp === "falar_humano" || resp === "2" || resp?.includes("humano") || resp?.includes("atendente") || resp?.includes("pessoa")) {
          reply =
            `🧑 Entendido! Um consultor da equipe *${nomeRepresentante}* entrará em contato com você em breve.\n\n` +
            "⏰ Nosso horário de atendimento é de segunda a sexta, das 8h às 18h.\n\n" +
            "Enquanto isso, se mudar de ideia, é só digitar *cadastrar* para iniciar!";
          updates.conversation_step = "aguardando_humano";

        } else {
          const retryMsg = "🤔 Não entendi. Escolha uma opção:";
          await sendButtons(remoteJid, retryMsg, [
            { id: "cadastrar_agora", title: "📋 Cadastrar agora" },
            { id: "falar_humano", title: "🧑 Falar com humano" },
          ]);
          reply = "";
        }
        break;
      }

      // ─── 1d. AGUARDANDO HUMANO ────────────────────────────────────────
      case "aguardando_humano": {
        const resp = messageText.toLowerCase().trim();
        if (resp?.includes("cadastr") || resp === "2") {
          reply =
            "📋 Vamos iniciar seu cadastro!\n\n" +
            "📸 *Envie uma FOTO ou PDF da sua conta de energia* para começarmos!\n\n" +
            "Formatos aceitos: JPG, PNG ou PDF";
          updates.conversation_step = "aguardando_conta";
        } else {
          reply = `⏳ Sua solicitação já foi registrada! Um consultor da equipe *${nomeRepresentante}* entrará em contato em breve.\n\nSe quiser iniciar o cadastro agora, digite *cadastrar*.`;
        }
        break;
      }

      // ─── 2. AGUARDANDO CONTA DE ENERGIA ──────────────────────────────
      case "aguardando_conta": {
        if (!isFile) {
          reply = "📸 Por favor, envie a *FOTO ou PDF da sua conta de energia*.\n\nFormatos aceitos: JPG, PNG ou PDF";
          break;
        }

        updates.electricity_bill_photo_url = fileUrl || "evolution-media:pending";
        updates.conversation_step = "processando_ocr_conta";

        await sendText(remoteJid, "✅ Conta recebida! ⏳ Analisando seus dados...\n\nAguarde alguns instantes...");

        // Logs detalhados para debug
        console.log("📥 Arquivo recebido:");
        console.log("  - isFile:", isFile);
        console.log("  - hasImage:", hasImage);
        console.log("  - hasDocument:", hasDocument);
        console.log("  - imageMessage:", !!imageMessage);
        console.log("  - documentMessage:", !!documentMessage);
        console.log("  - fileUrl:", fileUrl?.substring(0, 100));
        console.log("  - fileBase64 length:", fileBase64?.length || 0);
        console.log("  - mimetype:", imageMessage?.mimetype || documentMessage?.mimetype);

        // Validar base64
        if (fileBase64) {
          if (fileBase64.length < 100) {
            console.error("❌ Base64 muito pequeno:", fileBase64.length);
            updates.conversation_step = "aguardando_conta";
            reply = "⚠️ Erro ao processar imagem. Tente enviar uma foto mais nítida.";
            break;
          }
          
          // Verificar se é base64 válido
          try {
            atob(fileBase64.substring(0, 100));
          } catch (e) {
            console.error("❌ Base64 inválido");
            updates.conversation_step = "aguardando_conta";
            reply = "⚠️ Erro ao processar imagem. Tente enviar novamente.";
            break;
          }
        }

        // Garantir que mediaMessage sempre tem valor
        const mediaMsg = documentMessage || imageMessage || { 
          mimetype: imageMessage?.mimetype || documentMessage?.mimetype || "image/jpeg" 
        };

        try {
          console.log("📡 Chamando OCR Gemini para conta:", fileUrl?.substring(0, 100));
          console.log("📡 Media message:", JSON.stringify(mediaMsg).substring(0, 200));
          console.log("📡 Base64 length:", fileBase64?.length || 0);

          // Passar base64 e mediaMessage para OCR (importante para PDFs)
          const ocrData = await ocrContaEnergia(
            fileUrl, 
            GEMINI_API_KEY, 
            fileBase64 || undefined, 
            mediaMsg
          );
          console.log("📊 OCR Conta resultado:", JSON.stringify(ocrData).substring(0, 400));

          if (ocrData.sucesso && ocrData.dados) {
            const d = ocrData.dados;
            const confianca = typeof d.confianca === "number" ? d.confianca : 100;

            // ─── Threshold de confiança ─────────────────────────────
            if (confianca < OCR_CONFIDENCE_THRESHOLD) {
              jsonLog("warn", "OCR conta abaixo do threshold", {
                customer_id: customer.id,
                confianca,
                threshold: OCR_CONFIDENCE_THRESHOLD,
              });
              updates.conversation_step = "aguardando_conta";
              reply =
                `⚠️ Não consegui ler a conta com clareza suficiente (qualidade: ${confianca}%).\n\n` +
                `📸 Por favor, envie uma *foto mais nítida e bem iluminada* da conta de energia.\n\n` +
                `Dicas:\n• Use boa iluminação\n• Evite reflexos\n• Foco nos dados principais\n• Tire em ambiente claro`;
              break;
            }

            updates.name = d.nome || "";
            updates.address_street = d.endereco || "";
            updates.address_number = d.numero || "";
            updates.address_neighborhood = d.bairro || "";
            updates.cep = d.cep || "";
            updates.address_city = d.cidade || "";
            updates.address_state = d.estado || "";
            updates.distribuidora = d.distribuidora || "";
            updates.numero_instalacao = d.numeroInstalacao || "";
            updates.ocr_confianca = confianca;
            const valorParsed = d.valorConta ? parseFloat(d.valorConta) : 0;
            updates.electricity_bill_value = (valorParsed >= 30) ? valorParsed : 0;

            // Buscar CEP se não encontrado
            if (!updates.cep && updates.address_city && updates.address_state && updates.address_street) {
              console.log("🔍 CEP não encontrado. Buscando via ViaCEP...");
              const cepBuscado = await buscarCepPorEndereco(updates.address_state, updates.address_city, updates.address_street);
              if (cepBuscado) {
                updates.cep = cepBuscado;
                console.log(`✅ CEP auto-preenchido: ${cepBuscado}`);
              }
            }

            updates.conversation_step = "confirmando_dados_conta";

            reply =
              "📋 *Dados encontrados na conta:*\n\n" +
              `👤 *Nome:* ${updates.name || "❌ não encontrado"}\n` +
              `📍 *Endereço:* ${updates.address_street || "❌"} ${updates.address_number || ""}\n` +
              `🏘️ *Bairro:* ${updates.address_neighborhood || "❌"}\n` +
              `🏙️ *Cidade:* ${updates.address_city || "❌"} - ${updates.address_state || ""}\n` +
              `📮 *CEP:* ${updates.cep || "❌"}\n` +
              `⚡ *Distribuidora:* ${updates.distribuidora || "❌"}\n` +
              `🔢 *Nº Instalação:* ${updates.numero_instalacao || "❌"}\n` +
              `💰 *Valor:* R$ ${updates.electricity_bill_value || "❌"}\n\n` +
              "Está tudo correto?";

            const sent = await sendButtons(remoteJid, reply, [
              { id: "sim_conta", title: "✅ SIM" },
              { id: "nao_conta", title: "❌ NÃO" },
              { id: "editar_conta", title: "✏️ EDITAR" }
            ]);
            reply = "";
          } else {
            console.error("❌ OCR conta falhou:", ocrData.erro);
            updates.conversation_step = "aguardando_conta";
            reply = "⚠️ Não consegui ler a conta. Tente enviar uma foto mais nítida ou com melhor iluminação.";
          }
        } catch (e) {
          console.error("❌ Erro OCR conta:", e);
          updates.conversation_step = "aguardando_conta";
          reply = "⚠️ Erro ao processar a conta. Tente enviar novamente.";
        }
        break;
      }

      // ─── 3. CONFIRMANDO DADOS DA CONTA ───────────────────────────────
      case "confirmando_dados_conta": {
        const resp = isButton ? buttonId : messageText.toLowerCase().trim();

        if (resp === "sim_conta" || resp === "sim" || resp === "s" || resp === "1" || resp === "ok" || resp === "correto" || resp === "✅") {
          updates.conversation_step = "ask_tipo_documento";
          const tipoMsg = "✅ Dados da conta confirmados!\n\n📋 Qual documento de identidade você vai enviar?\n\nToque em uma opção:";
          await sendButtons(remoteJid, tipoMsg, [
            { id: "tipo_rg_novo", title: "📄 RG Novo" },
            { id: "tipo_rg_antigo", title: "📄 RG Antigo" },
            { id: "tipo_cnh", title: "🪪 CNH" },
          ]);
          reply = "";

        } else if (resp === "nao_conta" || resp === "nao" || resp === "não" || resp === "n" || resp === "2" || resp === "errado" || resp === "❌") {
          updates.conversation_step = "aguardando_conta";
          reply = "📸 Ok! Envie novamente a *FOTO da conta de energia* com melhor qualidade.";

        } else if (resp === "editar_conta" || resp === "editar" || resp === "3") {
          updates.conversation_step = "editing_conta_menu";
          reply = "✏️ Qual campo deseja editar?\n\n" +
            "1️⃣ Nome\n2️⃣ Endereço\n3️⃣ CEP\n4️⃣ Distribuidora\n5️⃣ Nº Instalação\n6️⃣ Valor da conta\n\nDigite o número:";
        } else {
          const sent = await sendButtons(remoteJid, "Os dados da conta estão corretos?", [
            { id: "sim_conta", title: "✅ SIM" },
            { id: "nao_conta", title: "❌ NÃO" },
            { id: "editar_conta", title: "✏️ EDITAR" }
          ]);
          if (!sent) reply = "Digite *SIM*, *NÃO* ou *EDITAR*:";
        }
        break;
      }

      // ─── 3b. TIPO DE DOCUMENTO ──────────────────────────────────────
      case "ask_tipo_documento": {
        const resp = isButton ? buttonId : messageText.trim().toLowerCase();
        const rgNovo = resp === "tipo_rg_novo" || resp === "1" || resp === "rg novo";
        const rgAntigo = resp === "tipo_rg_antigo" || resp === "2" || resp === "rg antigo";
        const cnh = resp === "tipo_cnh" || resp === "3" || resp === "cnh";
        if (rgNovo) {
          updates.document_type = "RG (Novo)";
          updates.conversation_step = "aguardando_doc_frente";
          reply = "📄 *RG (Novo)*\n\n📸 Envie a *FRENTE do seu RG*.\n\nFormatos: JPG, PNG ou PDF";
        } else if (rgAntigo) {
          updates.document_type = "RG (Antigo)";
          updates.conversation_step = "aguardando_doc_frente";
          reply = "📄 *RG (Antigo)*\n\n📸 Envie a *FRENTE do seu RG*.\n\nFormatos: JPG, PNG ou PDF";
        } else if (cnh) {
          updates.document_type = "CNH";
          updates.conversation_step = "aguardando_doc_frente";
          reply = "📄 *CNH*\n\n📸 Envie a *FRENTE da sua CNH*.\n\nFormatos: JPG, PNG ou PDF";
        } else {
          const sent = await sendButtons(remoteJid, "📋 Qual documento de identidade você vai enviar?\n\nToque em uma opção:", [
            { id: "tipo_rg_novo", title: "📄 RG Novo" },
            { id: "tipo_rg_antigo", title: "📄 RG Antigo" },
            { id: "tipo_cnh", title: "🪪 CNH" },
          ]);
          if (!sent) reply = "Escolha: *1* = RG Novo, *2* = RG Antigo, *3* = CNH";
        }
        break;
      }

      // ─── 4. FRENTE DO DOCUMENTO ──────────────────────────────────────
      case "aguardando_doc_frente": {
        if (!isFile) {
          const tipo = customer.document_type || "documento";
          const msgCNH = tipo === "CNH" ? "FRENTE da sua CNH" : "FRENTE do seu RG";
          reply = `📸 Envie a *${msgCNH}*.\n\nFormatos: JPG, PNG ou PDF`;
          break;
        }

        updates.document_front_url = fileUrl || "evolution-media:pending";
        
        // Salvar base64 da frente para usar depois no OCR conjunto
        if (fileBase64) {
          updates.document_front_base64 = fileBase64;
        }

        // CNH só tem frente — pular verso
        if (customer.document_type === "CNH") {
          updates.document_back_url = "nao_aplicavel";

          await sendText(remoteJid, "✅ CNH recebida! ⏳ Analisando...\n\nAguarde...");

          try {
            const docFrenteUrl = fileUrl || "evolution-media:pending";
            console.log("📡 Chamando OCR documento CNH (apenas frente)");

            const ocrData = await ocrDocumentoFrenteVerso(
              docFrenteUrl,
              "nao_aplicavel",
              "CNH",
              GEMINI_API_KEY,
              fileBase64 || undefined,
              documentMessage || imageMessage,
              undefined
            );
            console.log("📊 OCR CNH resultado:", JSON.stringify(ocrData).substring(0, 400));

            if (ocrData.sucesso && ocrData.dados) {
              const d = ocrData.dados;
              if (d.nome) updates.name = d.nome;
              if (d.cpf) updates.cpf = d.cpf.replace(/\D/g, "");
              if (d.rg) updates.rg = d.rg;
              // OCR retorna camelCase (dataNascimento, nomePai, nomeMae)
              // CNH: só salva data se confiança for "alta". Senão deixa em branco para o portal preencher via CPF.
              const dataConf = String(d.dataNascimentoConfianca || "").toLowerCase();
              const dataConfiavel = d.dataNascimento && (dataConf === "alta" || (!dataConf && /cnh/i.test(customer.document_type || "") === false));
              if (dataConfiavel) {
                updates.data_nascimento = d.dataNascimento;
                console.log(`✅ CNH: data nasc ${d.dataNascimento} aceita (confiança: ${dataConf || "n/a"})`);
              } else if (d.dataNascimento) {
                console.warn(`⚠️ CNH: data nasc ${d.dataNascimento} NÃO salva (confiança: ${dataConf}). Será confirmada com cliente ou virá do portal via CPF.`);
              }
              if (d.nomePai) updates.nome_pai = d.nomePai;
              if (d.nomeMae) updates.nome_mae = d.nomeMae;
            }
          } catch (e) {
            console.error("❌ OCR CNH falhou:", e);
          }

          updates.conversation_step = "confirmando_dados_doc";
          const nome = updates.name || customer.name || "—";
          const cpf = updates.cpf || customer.cpf || "—";
          const rg = updates.rg || customer.rg || "—";
          const nasc = updates.data_nascimento || customer.data_nascimento || "_(será preenchido pelo portal via CPF)_";
          const chnConfirmMsg = `📋 *Dados extraídos da CNH:*\n\n👤 Nome: *${nome}*\n🆔 CPF: *${cpf}*\n🪪 RG: *${rg}*\n🎂 Nascimento: *${nasc}*\n\nEstá tudo correto?`;
          const sent = await sendButtons(remoteJid, chnConfirmMsg, [
            { id: "sim_doc", title: "✅ SIM" },
            { id: "nao_doc", title: "❌ NÃO" },
            { id: "editar_doc", title: "✏️ EDITAR" }
          ]);
          reply = "";
          break;
        }

        // RG — pedir verso
        updates.conversation_step = "aguardando_doc_verso";
        reply = "✅ Frente recebida!\n\n📸 Agora envie o *VERSO do RG*.\n\nFormatos: JPG, PNG ou PDF";
        break;
      }

      // ─── 5. VERSO DO DOCUMENTO + OCR ─────────────────────────────────
      case "aguardando_doc_verso": {
        if (!isFile) {
          reply = "📸 Envie o *VERSO do documento*.\n\nFormatos: JPG, PNG ou PDF";
          break;
        }

        updates.document_back_url = fileUrl || "evolution-media:pending";

        await sendText(remoteJid, "✅ Documento recebido! ⏳ Analisando...\n\nAguarde...");

        // Logs detalhados
        console.log("📥 Documento verso recebido:");
        console.log("  - fileBase64 length:", fileBase64?.length || 0);
        console.log("  - mimetype:", imageMessage?.mimetype || documentMessage?.mimetype);

        // Validar base64
        if (fileBase64 && fileBase64.length < 100) {
          console.error("❌ Base64 muito pequeno:", fileBase64.length);
          updates.conversation_step = "aguardando_doc_verso";
          reply = "⚠️ Erro ao processar documento. Tente enviar uma foto mais nítida.";
          break;
        }

        // Garantir mediaMessage
        const mediaMsg = documentMessage || imageMessage || { 
          mimetype: imageMessage?.mimetype || documentMessage?.mimetype || "image/jpeg" 
        };

        try {
          const docFrenteUrl = customer.document_front_url || updates.document_front_url;
          const docVersoUrl = updates.document_back_url || customer.document_back_url;
          
          // Recuperar base64 da frente (se foi salvo)
          const frenteBase64 = customer.document_front_base64 || undefined;

          console.log("📡 Chamando OCR documento (frente+verso)");
          console.log(`📡 Frente base64: ${frenteBase64 ? 'SIM' : 'NÃO'}, Verso base64: ${fileBase64 ? 'SIM' : 'NÃO'}`);

          const ocrData = await ocrDocumentoFrenteVerso(
            docFrenteUrl,
            docVersoUrl,
            customer.document_type || "RG",
            GEMINI_API_KEY,
            frenteBase64 || undefined,
            undefined, // frenteMediaId (não temos mais)
            fileBase64 || undefined // versoBase64
          );
          console.log("📊 OCR Doc resultado:", JSON.stringify(ocrData).substring(0, 400));

          if (ocrData.sucesso && ocrData.dados) {
            const d = ocrData.dados;

            if (d.nome) updates.name = d.nome;
            if (d.cpf) updates.cpf = d.cpf.replace(/\D/g, "");
            if (d.rg) updates.rg = d.rg;
            if (d.dataNascimento) updates.data_nascimento = d.dataNascimento;
            if (d.nomePai) updates.nome_pai = d.nomePai;
            if (d.nomeMae) updates.nome_mae = d.nomeMae;

            updates.conversation_step = "confirmando_dados_doc";

            reply =
              "📋 *Confirme seus dados pessoais:*\n\n" +
              `👤 *Nome:* ${d.nome || "❌ não encontrado"}\n` +
              `🆔 *CPF:* ${d.cpf || "❌ não encontrado"}\n` +
              `📄 *RG:* ${d.rg || "❌ não encontrado"}\n` +
              `🎂 *Data Nasc:* ${d.dataNascimento || "❌ não encontrado"}\n\n` +
              "Está tudo correto?";

            const sent = await sendButtons(remoteJid, reply, [
              { id: "sim_doc", title: "✅ SIM" },
              { id: "nao_doc", title: "❌ NÃO" },
              { id: "editar_doc", title: "✏️ EDITAR" }
            ]);
            reply = "";
          } else {
            console.error("❌ OCR doc falhou:", ocrData.erro);
            updates.conversation_step = "ask_name";
            reply = "⚠️ Não consegui ler o documento. Vou pedir os dados manualmente.\n\nQual é o seu *nome completo*?";
          }
        } catch (e) {
          console.error("❌ Erro OCR doc:", e);
          updates.conversation_step = "ask_name";
          reply = "⚠️ Erro ao processar documento. Vou pedir os dados manualmente.\n\nQual é o seu *nome completo*?";
        }
        break;
      }

      // ─── 6. CONFIRMANDO DADOS DO DOCUMENTO ──────────────────────────
      case "confirmando_dados_doc": {
        const resp = isButton ? buttonId : messageText.toLowerCase().trim();

        if (resp === "sim_doc" || resp === "sim" || resp === "s" || resp === "1" || resp === "ok" || resp === "correto" || resp === "✅") {
          const merged = { ...customer, ...updates };
          if (!merged.document_front_url) merged.document_front_url = customer.document_front_url || "collected";
          if (!merged.document_back_url) merged.document_back_url = customer.document_back_url || "collected";
          const nextStep = await autoResolveCepIfNeeded(merged, updates);
          updates.conversation_step = nextStep;
          reply = getReplyForStep(nextStep, merged);

        } else if (resp === "nao_doc" || resp === "nao" || resp === "não" || resp === "n" || resp === "2" || resp === "errado" || resp === "❌") {
          updates.conversation_step = "ask_name";
          reply = "Ok! Vou pedir os dados manualmente.\n\nQual é o seu *nome completo*?";

        } else if (resp === "editar_doc" || resp === "editar" || resp === "3") {
          updates.conversation_step = "editing_doc_menu";
          reply = "✏️ Qual campo deseja editar?\n\n1️⃣ Nome\n2️⃣ CPF\n3️⃣ RG\n4️⃣ Data de Nascimento\n\nDigite o número:";
        } else {
          const sent = await sendButtons(remoteJid, "Os dados do documento estão corretos?", [
            { id: "sim_doc", title: "✅ SIM" },
            { id: "nao_doc", title: "❌ NÃO" },
            { id: "editar_doc", title: "✏️ EDITAR" }
          ]);
          if (!sent) reply = "Digite *SIM*, *NÃO* ou *EDITAR*:";
        }
        break;
      }

      // ─── 7. EDIÇÃO CONTA ─────────────────────────────────────────────
      case "editing_conta_menu": {
        const op = messageText.trim();
        const fieldMap: Record<string, [string, string]> = {
          "1": ["editing_conta_nome", "Digite o *nome completo* correto:"],
          "2": ["editing_conta_endereco", "Digite o *endereço completo* correto:"],
          "3": ["editing_conta_cep", "Digite o *CEP* correto (8 dígitos):"],
          "4": ["editing_conta_distribuidora", "Digite o nome da *distribuidora*:"],
          "5": ["editing_conta_instalacao", "Digite o *número da instalação*:"],
          "6": ["editing_conta_valor", "Digite o *valor da conta* (ex: 350.50):"],
        };
        if (fieldMap[op]) {
          updates.conversation_step = fieldMap[op][0];
          reply = fieldMap[op][1];
        } else {
          reply = "❌ Opção inválida. Digite um número de 1 a 6:";
        }
        break;
      }

      case "editing_conta_nome":
        updates.name = messageText.trim();
        updates.conversation_step = "confirmando_dados_conta";
        reply = `✅ Nome atualizado: *${messageText.trim()}*\n\nOs dados estão corretos agora?`;
        { const s = await sendButtons(remoteJid, reply, [{ id: "sim_conta", title: "✅ SIM" }, { id: "nao_conta", title: "❌ NÃO" }, { id: "editar_conta", title: "✏️ EDITAR" }]); reply = ""; }
        break;

      case "editing_conta_endereco":
        updates.address_street = messageText.trim();
        updates.conversation_step = "confirmando_dados_conta";
        reply = `✅ Endereço atualizado.\n\nOs dados estão corretos agora?`;
        { const s = await sendButtons(remoteJid, reply, [{ id: "sim_conta", title: "✅ SIM" }, { id: "nao_conta", title: "❌ NÃO" }, { id: "editar_conta", title: "✏️ EDITAR" }]); reply = ""; }
        break;

      case "editing_conta_cep": {
        const cepClean = messageText.replace(/\D/g, "");
        if (cepClean.length === 8) {
          updates.cep = cepClean;
          updates.conversation_step = "confirmando_dados_conta";
          reply = `✅ CEP atualizado: *${cepClean.replace(/(\d{5})(\d{3})/, "$1-$2")}*\n\nOs dados estão corretos agora?`;
          { const s = await sendButtons(remoteJid, reply, [{ id: "sim_conta", title: "✅ SIM" }, { id: "nao_conta", title: "❌ NÃO" }, { id: "editar_conta", title: "✏️ EDITAR" }]); reply = ""; }
        } else {
          reply = "❌ CEP inválido. Digite os 8 números:";
        }
        break;
      }

      case "editing_conta_distribuidora":
        updates.distribuidora = messageText.trim();
        updates.conversation_step = "confirmando_dados_conta";
        reply = `✅ Distribuidora atualizada: *${messageText.trim()}*\n\nOs dados estão corretos agora?`;
        { const s = await sendButtons(remoteJid, reply, [{ id: "sim_conta", title: "✅ SIM" }, { id: "nao_conta", title: "❌ NÃO" }, { id: "editar_conta", title: "✏️ EDITAR" }]); reply = ""; }
        break;

      case "editing_conta_instalacao": {
        const instClean = messageText.replace(/\D/g, "");
        if (instClean.length >= 7) {
          updates.numero_instalacao = instClean;
          updates.conversation_step = "confirmando_dados_conta";
          reply = `✅ Nº instalação atualizado: *${instClean}*\n\nOs dados estão corretos agora?`;
          { const s = await sendButtons(remoteJid, reply, [{ id: "sim_conta", title: "✅ SIM" }, { id: "nao_conta", title: "❌ NÃO" }, { id: "editar_conta", title: "✏️ EDITAR" }]); reply = ""; }
        } else {
          reply = "❌ Número inválido. Digite pelo menos 7 dígitos:";
        }
        break;
      }

      case "editing_conta_valor": {
        const val = parseFloat(messageText.replace(/[^\d.,]/g, "").replace(",", "."));
        if (!isNaN(val) && val > 0) {
          updates.electricity_bill_value = val;
          updates.conversation_step = "confirmando_dados_conta";
          reply = `✅ Valor atualizado: *R$ ${val.toFixed(2)}*\n\nOs dados estão corretos agora?`;
          { const s = await sendButtons(remoteJid, reply, [{ id: "sim_conta", title: "✅ SIM" }, { id: "nao_conta", title: "❌ NÃO" }, { id: "editar_conta", title: "✏️ EDITAR" }]); reply = ""; }
        } else {
          reply = "❌ Valor inválido. Digite um número (ex: 350.50):";
        }
        break;
      }

      // ─── 8. EDIÇÃO DOCUMENTO ─────────────────────────────────────────
      case "editing_doc_menu": {
        const op = messageText.trim();
        const fieldMap: Record<string, [string, string]> = {
          "1": ["editing_doc_nome", "Digite o *nome completo* correto:"],
          "2": ["editing_doc_cpf", "Digite o *CPF* correto (apenas números):"],
          "3": ["editing_doc_rg", "Digite o *RG* correto:"],
          "4": ["editing_doc_nascimento", "Digite a *data de nascimento* (DD/MM/AAAA):"],
        };
        if (fieldMap[op]) {
          updates.conversation_step = fieldMap[op][0];
          reply = fieldMap[op][1];
        } else {
          reply = "❌ Opção inválida. Digite um número de 1 a 4:";
        }
        break;
      }

      case "editing_doc_nome":
        updates.name = messageText.trim();
        updates.conversation_step = "confirmando_dados_doc";
        reply = `✅ Nome atualizado: *${messageText.trim()}*\n\nOs dados estão corretos agora?`;
        { const s = await sendButtons(remoteJid, reply, [{ id: "sim_doc", title: "✅ SIM" }, { id: "nao_doc", title: "❌ NÃO" }, { id: "editar_doc", title: "✏️ EDITAR" }]); reply = ""; }
        break;

      case "editing_doc_cpf": {
        const cpfClean = messageText.replace(/\D/g, "");
        if (cpfClean.length === 11) {
          updates.cpf = cpfClean;
          updates.conversation_step = "confirmando_dados_doc";
          reply = `✅ CPF atualizado: *${cpfClean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}*\n\nOs dados estão corretos agora?`;
          { const s = await sendButtons(remoteJid, reply, [{ id: "sim_doc", title: "✅ SIM" }, { id: "nao_doc", title: "❌ NÃO" }, { id: "editar_doc", title: "✏️ EDITAR" }]); reply = ""; }
        } else {
          reply = "❌ CPF inválido. Digite os 11 números:";
        }
        break;
      }

      case "editing_doc_rg":
        updates.rg = messageText.trim();
        updates.conversation_step = "confirmando_dados_doc";
        reply = `✅ RG atualizado: *${messageText.trim()}*\n\nOs dados estão corretos agora?`;
        { const s = await sendButtons(remoteJid, reply, [{ id: "sim_doc", title: "✅ SIM" }, { id: "nao_doc", title: "❌ NÃO" }, { id: "editar_doc", title: "✏️ EDITAR" }]); reply = ""; }
        break;

      case "editing_doc_nascimento": {
        const dateMatch = messageText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (dateMatch) {
          updates.data_nascimento = messageText.trim();
          updates.conversation_step = "confirmando_dados_doc";
          reply = `✅ Data atualizada: *${messageText.trim()}*\n\nOs dados estão corretos agora?`;
          { const s = await sendButtons(remoteJid, reply, [{ id: "sim_doc", title: "✅ SIM" }, { id: "nao_doc", title: "❌ NÃO" }, { id: "editar_doc", title: "✏️ EDITAR" }]); reply = ""; }
        } else {
          reply = "❌ Data inválida. Use DD/MM/AAAA (ex: 20/07/1993):";
        }
        break;
      }

      // ─── 9. PERGUNTAS MANUAIS ────────────────────────────────────────
      case "ask_name": {
        if (messageText.length < 3) { reply = "Por favor, digite seu *nome completo*."; break; }
        updates.name = messageText.trim();
        const merged = { ...customer, ...updates };
        const next = await autoResolveCepIfNeeded(merged, updates);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }

      case "ask_cpf": {
        const cpfClean = messageText.replace(/\D/g, "");
        if (cpfClean.length !== 11) { reply = "❌ CPF inválido. Digite os *11 números*:"; break; }
        if (!validarCPFDigitos(cpfClean)) { reply = "❌ CPF inválido. Verifique os números:"; break; }

        updates.cpf = cpfClean;
        const merged = { ...customer, ...updates };
        const next = await autoResolveCepIfNeeded(merged, updates);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }

      case "ask_rg": {
        if (messageText.length < 4) { reply = "Por favor, informe um *RG válido*:"; break; }
        updates.rg = messageText.trim();
        const merged = { ...customer, ...updates };
        const next = await autoResolveCepIfNeeded(merged, updates);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }

      case "ask_birth_date": {
        const dateMatch = messageText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (!dateMatch) { reply = "❌ Data inválida. Use *DD/MM/AAAA* (ex: 20/07/1993):"; break; }
        updates.data_nascimento = messageText.trim();
        const merged = { ...customer, ...updates };
        const next = await autoResolveCepIfNeeded(merged, updates);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }

      case "ask_phone_confirm": {
        const resp = isButton ? buttonId : messageText.toLowerCase().trim();
        const sim = resp === "sim_phone" || resp === "1" || resp === "sim" || resp === "s";
        const editar = resp === "editar_phone" || resp === "2" || resp === "editar";
        const cancelar = resp === "cancelar_phone" || resp === "3" || resp === "cancelar" || resp === "cancel";

        if (sim) {
          const p = (customer.phone_whatsapp || phone).replace(/\D/g, "");
          const num = p.length >= 11 ? p.slice(-11) : p;
          updates.phone_landline = num.length === 11
            ? num.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")
            : num.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
          updates.phone_whatsapp = normalizePhone(num);
          const merged = { ...customer, ...updates };
          const next = await autoResolveCepIfNeeded(merged, updates);
          updates.conversation_step = next;
          reply = getReplyForStep(next, merged);
        } else if (editar) {
          updates.conversation_step = "ask_phone";
          reply = "Informe o *telefone* com DDD (ex: 11999998888):";
        } else if (cancelar) {
          updates.conversation_step = "ask_birth_date";
          reply = "Qual sua *data de nascimento*? (DD/MM/AAAA)";
        } else {
          const msgConfirm = getReplyForStep("ask_phone_confirm", customer);
          const sent = await sendButtons(remoteJid, msgConfirm, [
            { id: "sim_phone", title: "✅ Sim" },
            { id: "editar_phone", title: "✏️ Editar" },
            { id: "cancelar_phone", title: "❌ Cancelar" },
          ]);
          if (!sent) reply = "Digite *1* (Sim), *2* (Editar) ou *3* (Cancelar):";
          else reply = "";
        }
        break;
      }

      case "ask_phone": {
        const phoneClean = messageText.replace(/\D/g, "");
        if (phoneClean.length < 10 || phoneClean.length > 11) { reply = "❌ Telefone inválido. Digite com DDD (ex: 11999998888):"; break; }
        const num11 = phoneClean.length >= 11 ? phoneClean.slice(-11) : phoneClean;
        updates.phone_landline = num11.length === 11
          ? num11.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")
          : num11.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
        updates.phone_whatsapp = normalizePhone(num11);
        const merged = { ...customer, ...updates };
        const next = await autoResolveCepIfNeeded(merged, updates);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }

      case "ask_email": {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(messageText)) { reply = "❌ E-mail inválido. Digite um e-mail válido:"; break; }
        updates.email = messageText.trim().toLowerCase();
        const merged = { ...customer, ...updates };
        const next = await autoResolveCepIfNeeded(merged, updates);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }

      case "ask_cep": {
        const cepClean = messageText.replace(/\D/g, "");
        if (cepClean.length !== 8) { reply = "❌ CEP inválido. Informe os *8 números*:"; break; }
        try {
          const viaCepRes = await fetchWithTimeout(`https://viacep.com.br/ws/${cepClean}/json/`, { timeout: TIMEOUT_VIA_CEP });
          const viaCep = await viaCepRes.json();
          if (viaCep.erro) { reply = "❌ CEP não encontrado. Verifique e tente novamente:"; break; }
          updates.cep = cepClean;
          updates.address_street = viaCep.logradouro || customer.address_street || "";
          updates.address_neighborhood = viaCep.bairro || customer.address_neighborhood || "";
          updates.address_city = viaCep.localidade || customer.address_city || "";
          updates.address_state = viaCep.uf || customer.address_state || "";
        } catch { reply = "⚠️ Erro ao buscar CEP. Tente novamente:"; break; }
        const merged = { ...customer, ...updates };
        const next = await autoResolveCepIfNeeded(merged, updates);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }

      case "ask_number": {
        updates.address_number = messageText.trim();
        const merged = { ...customer, ...updates };
        const next = await autoResolveCepIfNeeded(merged, updates);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }

      case "ask_complement": {
        if (messageText.toLowerCase() !== "não" && messageText.toLowerCase() !== "nao" && messageText.toLowerCase() !== "n") {
          updates.address_complement = messageText.trim();
        } else {
          updates.address_complement = "";
        }
        const merged = { ...customer, ...updates };
        const next = await autoResolveCepIfNeeded(merged, updates);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }

      case "ask_installation_number": {
        const instClean = messageText.replace(/\D/g, "");
        if (instClean.length < 7) { reply = "❌ Número inválido. Digite pelo menos 7 dígitos:"; break; }
        updates.numero_instalacao = instClean;
        const merged = { ...customer, ...updates };
        const next = await autoResolveCepIfNeeded(merged, updates);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }

      case "ask_bill_value": {
        const val = parseFloat(messageText.replace(/[^\d.,]/g, "").replace(",", "."));
        if (isNaN(val) || val <= 0) { reply = "❌ Valor inválido. Digite um número (ex: 350):"; break; }
        updates.electricity_bill_value = val;
        const merged = { ...customer, ...updates };
        const next = await autoResolveCepIfNeeded(merged, updates);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }

      // ─── 10. DOCUMENTOS MANUAIS ──────────────────────────────────────
      case "ask_doc_frente_manual": {
        if (!isFile) {
          reply = "📸 Envie a *FRENTE do seu documento* (RG ou CNH)\n\nFormatos: JPG, PNG ou PDF";
          break;
        }
        updates.document_front_url = fileUrl || "evolution-media:pending";
        const merged = { ...customer, ...updates };
        const next = await autoResolveCepIfNeeded(merged, updates);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }

      case "ask_doc_verso_manual": {
        if (!isFile) {
          reply = "📸 Envie o *VERSO do seu documento*\n\nFormatos: JPG, PNG ou PDF";
          break;
        }
        updates.document_back_url = fileUrl || "evolution-media:pending";
        const merged = { ...customer, ...updates };
        const next = await autoResolveCepIfNeeded(merged, updates);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }

      // ─── 11. CONFIRMAR FINALIZAR ─────────────────────────────────────
      case "ask_finalizar": {
        const resp = isButton ? buttonId : messageText.toLowerCase().trim();
        const finalizar = resp === "btn_finalizar" || resp === "1" || resp === "finalizar" || resp === "sim" || resp === "s";
        if (finalizar) {
          updates.conversation_step = "finalizando";
          reply = "";
        } else {
          const sent = await sendButtons(remoteJid, "📋 Todos os dados foram preenchidos!\n\nDeseja finalizar o cadastro?", [
            { id: "btn_finalizar", title: "✅ Finalizar" },
          ]);
          if (!sent) reply = "Digite *FINALIZAR* ou *1* para confirmar o cadastro:";
        }
        break;
      }

      // ─── 11b. PORTAL SUBMITTING (Worker está processando) ─────────
      case "portal_submitting": {
        reply = "⏳ Estamos processando seu cadastro no portal...\n\n📱 Em breve você receberá um *código de verificação por SMS*. Quando receber, *digite aqui*!\n\nAguarde alguns instantes...";
        break;
      }

      // ─── 12. OTP ──────────────────────────────────────────────────────
      case "aguardando_otp": {
        const otpCode = messageText.replace(/\D/g, "");
        if (otpCode.length >= 4 && otpCode.length <= 8) {
          updates.otp_code = otpCode;
          updates.otp_received_at = new Date().toISOString();
          // NÃO mudar conversation_step — o Worker faz polling no otp_code
          // e ele mesmo mudará para aguardando_assinatura após preencher
          reply = `✅ Código *${otpCode}* recebido! ⏳ Validando no portal...\n\nAguarde alguns instantes...`;
        } else {
          reply = "📱 Por favor, digite o *código numérico* que você recebeu por SMS.\n\n(Geralmente são 4 a 6 dígitos)";
        }
        break;
      }

      case "validando_otp": {
        reply = "⏳ Estamos validando seu código no portal. Aguarde um momento...\n\nSe já passou mais de 2 minutos, digite o código novamente.";
        break;
      }

      case "aguardando_assinatura": {
        const link = customer.link_assinatura;
        if (link) {
          reply = `🔗 O link para validação facial já foi enviado:\n\n${link}\n\nAbra o link e siga as instruções para finalizar seu cadastro.`;
        } else {
          reply = "⏳ Estamos preparando o link de assinatura. Você será notificado em breve!";
        }
        break;
      }

      case "complete": {
        reply = "✅ Seus dados já foram registrados! Se precisar de algo, um consultor entrará em contato. ☀️";
        break;
      }

      // ─── DEFAULT (step desconhecido — NUNCA travar) ──────────────────
      default: {
        console.warn(`⚠️ Step desconhecido: ${currentStep} — resetando para aguardando_conta`);
        // Não resetar se é um step de edição (editing_*)
        if (currentStep?.startsWith("editing_")) {
          reply = "❌ Opção inválida. Digite novamente:";
        } else {
          updates.conversation_step = "aguardando_conta";
          reply =
            `👋 Olá! Eu sou o assistente da *${nomeRepresentante}* em parceria com a *iGreen Energy*!\n\n` +
            "📸 *Envie uma FOTO ou PDF da sua conta de energia* para começarmos!\n\n" +
            "Formatos aceitos: JPG, PNG ou PDF";
        }
        break;
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // AUTO-FINALIZAÇÃO (BLOCO ESPECIAL)
    // ═══════════════════════════════════════════════════════════════════
    if (updates.conversation_step === "finalizando") {
      const merged = { ...customer, ...updates };

      const validation = validateCustomerForPortal(merged);
      if (!validation.valid) {
        logStructured("warn", "validation_failed", {
          customer_id: customer.id,
          step: "finalizando",
          errors: validation.errors,
        });
        let redirected = false;
        for (const err of validation.errors) {
          if (err.includes("CPF")) { updates.conversation_step = "ask_cpf"; reply = `⚠️ ${err}\n\nQual o seu *CPF*? (apenas números)`; redirected = true; break; }
          if (err.includes("RG")) { updates.conversation_step = "ask_rg"; reply = `⚠️ ${err}\n\nQual o seu *RG*?`; redirected = true; break; }
          if (err.includes("CEP")) { updates.conversation_step = "ask_cep"; reply = `⚠️ ${err}\n\nQual o seu *CEP*? (8 dígitos)`; redirected = true; break; }
          if (err.includes("rua") || err.includes("Endereço")) { updates.conversation_step = "editing_conta_endereco"; reply = `⚠️ ${err}\n\nDigite o *endereço completo*:`; redirected = true; break; }
          if (err.includes("Número")) { updates.conversation_step = "ask_number"; reply = `⚠️ ${err}\n\nQual o *número* da residência?`; redirected = true; break; }
          if (err.includes("Bairro")) { updates.conversation_step = "editing_conta_endereco"; reply = `⚠️ ${err}\n\nDigite o *endereço completo* (rua, número, bairro):`; redirected = true; break; }
          if (err.includes("Cidade")) { updates.conversation_step = "ask_cep"; reply = `⚠️ ${err}\n\nInforme o *CEP* correto para completar a cidade:`; redirected = true; break; }
          if (err.includes("Estado")) { updates.conversation_step = "ask_cep"; reply = `⚠️ ${err}\n\nInforme o *CEP* correto:`; redirected = true; break; }
          if (err.includes("Telefone")) { updates.conversation_step = "ask_phone"; reply = `⚠️ ${err}\n\nInforme seu *telefone* com DDD:`; redirected = true; break; }
          if (err.includes("Valor")) { updates.conversation_step = "ask_bill_value"; reply = `⚠️ ${err}\n\nQual o *valor* da sua conta de luz?`; redirected = true; break; }
          if (err.includes("Foto da conta")) { updates.conversation_step = "aguardando_conta"; reply = `⚠️ ${err}\n\n📸 Envie a foto da conta de energia:`; redirected = true; break; }
          if (err.includes("Documento") && err.includes("frente")) { updates.conversation_step = "ask_doc_frente_manual"; reply = `⚠️ ${err}\n\n📸 Envie a frente do documento:`; redirected = true; break; }
          if (err.includes("Documento") && err.includes("verso")) { updates.conversation_step = "ask_doc_verso_manual"; reply = `⚠️ ${err}\n\n📸 Envie o verso do documento:`; redirected = true; break; }
          if (err.includes("Nome")) { updates.conversation_step = "ask_name"; reply = `⚠️ ${err}\n\nQual é o seu *nome completo*?`; redirected = true; break; }
        }
        if (!redirected) {
          const firstError = validation.errors[0] || "Dados incompletos";
          updates.conversation_step = "ask_name";
          reply = `⚠️ ${firstError}\n\nQual é o seu *nome completo*?`;
        }
      } else {
        updates.possui_procurador = false;
        updates.conta_pdf_protegida = false;
        updates.debitos_aberto = false;
        updates.status = "portal_submitting";
        updates.conversation_step = "portal_submitting";

        console.log(`📝 Salvando updates ANTES do portal worker para ${customer.id}:`, JSON.stringify(updates).substring(0, 500));
        const { error: saveError } = await supabase.from("customers").update(updates).eq("id", customer.id).select();
        if (saveError) {
          console.error(`❌ ERRO ao salvar updates antes do portal:`, saveError);
        }

        await sendText(remoteJid,
          "✅ *Todos os dados coletados com sucesso!* 🎉\n\n" +
          "⏳ Estamos processando seu cadastro no portal...\n\n" +
          "📱 Em breve você receberá um *código de verificação por SMS*. Quando receber, *digite aqui*!\n\n" +
          "Obrigado pela confiança! ☀️🌱"
        );

        console.log(`✅ Lead completo: ${merged.name} (${merged.id}) - disparando worker-portal`);

        // Buscar settings do consultor
        const { data: settingsRows } = await supabase.from("settings").select("*");
        const settings: Record<string, string> = {};
        settingsRows?.forEach((s: any) => { settings[s.key] = s.value; });

        const portalWorkerUrl = (settings.portal_worker_url || Deno.env.get("PORTAL_WORKER_URL") || "").replace(/\/$/, "");
        const workerSecret = settings.worker_secret || settings.portal_worker_secret || Deno.env.get("WORKER_SECRET") || "";

        if (portalWorkerUrl && workerSecret) {
          // ── Health check antes de submeter ──
          let workerOnline = false;
          try {
            const healthRes = await fetchInsecure(`${portalWorkerUrl}/health`, { timeout: 5_000 });
            workerOnline = healthRes.ok;
            console.log(`🏥 Health check: ${healthRes.status} (online: ${workerOnline})`);
          } catch (e: any) {
            console.warn(`🏥 Health check falhou: ${e?.message}`);
          }

          if (!workerOnline) {
            logStructured("warn", "worker_offline", { customer_id: customer.id, url: portalWorkerUrl });
            console.warn("⚠️ Worker offline — lead ficará em fila para reprocessamento automático");
            await supabase.from("customers").update({ status: "worker_offline", error_message: "Worker offline no momento do envio" }).eq("id", customer.id);
            try {
              await sendText(remoteJid,
                "⏳ Estamos com um pequeno atraso no processamento. Em até *alguns minutos* você receberá o link para continuar pelo celular.\n\n" +
                "Se não receber em *10 minutos*, responda aqui que verificamos para você. Obrigado!"
              );
            } catch (_) {}
          } else {
            // ── Submeter lead ao worker ──
            let workerOk = false;
            try {
              logStructured("info", "lead_complete", { customer_id: customer.id, step: "data_complete", worker: "dispatching" });
              await withRetry(
                async () => {
                  const portalRes = await fetchInsecure(`${portalWorkerUrl}/submit-lead`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${workerSecret}`,
                    },
                    body: JSON.stringify({ customer_id: customer.id }),
                    timeout: 25_000,
                  });
                  const portalData = await portalRes.text();
                  console.log(`📡 Worker-portal resposta (${portalRes.status}): ${portalData.substring(0, 200)}`);
                  if (!portalRes.ok) {
                    logStructured("warn", "worker_portal_error", { customer_id: customer.id, status: portalRes.status, body: portalData.substring(0, 150) });
                    throw new Error(`Worker ${portalRes.status}: ${portalData.substring(0, 100)}`);
                  }
                  workerOk = true;
                },
                { maxAttempts: 3, delayMs: 2000, retryOn: () => true }
              );
            } catch (e: any) {
              logStructured("error", "worker_portal_fetch_failed", { customer_id: customer.id, error: e?.message });
              console.error("⚠️ Erro ao disparar worker-portal (após 3 tentativas):", e?.message);
              await supabase.from("customers").update({ status: "worker_offline", error_message: `Worker falhou: ${e?.message?.substring(0, 200)}` }).eq("id", customer.id);
              try {
                await sendText(remoteJid,
                  "⏳ Estamos com um pequeno atraso no processamento. Em até *alguns minutos* você receberá o link para continuar pelo celular.\n\n" +
                  "Se não receber em *10 minutos*, responda aqui que verificamos para você. Obrigado!"
                );
              } catch (_) {}
            }
          }
        } else {
          logStructured("info", "lead_complete", { customer_id: customer.id, step: "data_complete", worker: "not_configured" });
          console.log("⚠️ PORTAL_WORKER_URL ou WORKER_SECRET não configurados - worker-portal terá que pegar via polling");
        }

        // ─── UPLOAD DOCUMENTOS PARA MINIO (fire-and-forget) ───
        const supabaseUrlForMinio = Deno.env.get("SUPABASE_URL");
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (supabaseUrlForMinio && serviceRoleKey) {
          fetchWithTimeout(`${supabaseUrlForMinio}/functions/v1/upload-documents-minio`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ customer_id: customer.id }),
            timeout: 25_000,
          }).then(r => console.log(`📦 MinIO upload response: ${r.status}`))
            .catch(err => console.error("⚠️ MinIO upload failed (non-blocking):", err?.message));
        }

        for (const k of Object.keys(updates)) delete updates[k];
        reply = "";
      }
    }

    // ─── Salvar updates ─────────────────────────────────────────────────
    if (Object.keys(updates).length > 0) {
      console.log(`📝 Salvando updates para ${customer.id}:`, JSON.stringify(updates).substring(0, 500));
      const { error: updateError } = await supabase.from("customers").update(updates).eq("id", customer.id).select();
      if (updateError) {
        console.error(`❌ ERRO ao salvar updates para ${customer.id}:`, updateError);
      }

      // ─── Log de transição de etapa (analytics de funil) ──────────
      if (updates.conversation_step && updates.conversation_step !== step) {
        await logStepTransition(supabase, {
          customer_id: customer.id,
          consultant_id: instanceData.consultant_id,
          phone,
          from_step: step,
          to_step: updates.conversation_step,
        });
      }
    }

    // ─── Enviar reply ─────────────────────────────────────────────────
    const stepToSend = updates.conversation_step || step;
    if (reply) {
      try {
        if (stepToSend === "ask_phone_confirm") {
          await sendButtons(remoteJid, reply, [
            { id: "sim_phone", title: "✅ Sim" },
            { id: "editar_phone", title: "✏️ Editar" },
            { id: "cancelar_phone", title: "❌ Cancelar" },
          ]);
        } else if (stepToSend === "ask_finalizar") {
          await sendButtons(remoteJid, reply, [
            { id: "btn_finalizar", title: "✅ Finalizar" },
          ]);
        } else if (stepToSend === "ask_tipo_documento") {
          await sendButtons(remoteJid, reply || "Qual documento de identidade?", [
            { id: "tipo_rg_novo", title: "📄 RG Novo" },
            { id: "tipo_rg_antigo", title: "📄 RG Antigo" },
            { id: "tipo_cnh", title: "🪪 CNH" },
          ]);
        } else {
          await sendText(remoteJid, reply);
        }
      } catch (e: any) {
        logStructured("error", "send_reply_failed", { customer_id: customer.id, error: e?.message });
        console.error("Erro enviar:", e);
      }
    }

    // Log outbound
    await supabase.from("conversations").insert({
      customer_id: customer.id,
      message_direction: "outbound",
      message_text: reply || "[botões enviados]",
      message_type: "text",
      conversation_step: updates.conversation_step || step,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Evolution webhook error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});