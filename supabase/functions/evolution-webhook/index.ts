import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateCustomerForPortal } from "../_shared/validators.ts";
import { logStructured, fetchWithTimeout, fetchInsecure, withRetry, buscarCepPorEndereco, normalizePhone, TIMEOUT_VIA_CEP } from "../_shared/utils.ts";
import { getNextMissingStep, getReplyForStep, validarCPFDigitos } from "../_shared/conversation-helpers.ts";
import { ocrContaEnergia, ocrDocumentoFrenteVerso } from "../_shared/ocr.ts";
import { createEvolutionSender, parseEvolutionMessage, extractMediaUrl } from "../_shared/evolution-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-instance-name",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

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
      console.log(`📡 CONNECTION_UPDATE: instance=${connInstance}, state=${connState}`);

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

    const { sendText, sendButtons, downloadMedia } = createEvolutionSender(
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
    console.log(`📱 Mensagem de: ${phone} | Texto: "${messageText}" | Botão: ${buttonId} | Arquivo: ${isFile}`);

    // ─── Buscar ou criar cliente ──────────────────────────────────────
    const statusFinalizados = [
      'data_complete', 'portal_submitting', 'awaiting_otp', 'validating_otp',
      'awaiting_manual_submit', 'portal_submitted', 'registered_igreen',
      'awaiting_signature', 'complete', 'automation_failed',
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

    // Se tem arquivo, tentar extrair URL ou baixar via Evolution
    if (isFile) {
      fileUrl = extractMediaUrl(message);
      if (!fileUrl) {
        // Baixar via Evolution API
        console.log("📥 Baixando mídia via Evolution API...");
        fileBase64 = await downloadMedia(key, message);
        if (fileBase64) {
          // Converter base64 para data URL
          const mimeType = imageMessage?.mimetype || documentMessage?.mimetype || "application/octet-stream";
          fileUrl = `data:${mimeType};base64,${fileBase64}`;
          console.log(`✅ Mídia baixada (${mimeType})`);
        } else {
          console.error("❌ Falha ao baixar mídia");
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // MÁQUINA DE ESTADOS
    // ═══════════════════════════════════════════════════════════════════
    switch (step) {

      // ─── 1. BOAS-VINDAS ─────────────────────────────────────────────
      case "welcome": {
        reply =
          `👋 Olá! Eu sou o assistente da *${nomeRepresentante}* em parceria com a *iGreen Energy*!\n\n` +
          "💡 Sabia que você pode economizar até *20% na sua conta de luz* com energia solar?\n\n" +
          "Para fazer uma simulação gratuita, preciso de alguns dados.\n\n" +
          "📸 *Envie uma FOTO ou PDF da sua conta de energia* para começarmos!";
        updates.conversation_step = "aguardando_conta";
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

        try {
          console.log("📡 Chamando OCR Gemini para conta:", fileUrl?.substring(0, 100));

          const ocrData = await ocrContaEnergia(fileUrl, GEMINI_API_KEY, undefined, undefined);
          console.log("📊 OCR Conta resultado:", JSON.stringify(ocrData).substring(0, 400));

          if (ocrData.sucesso && ocrData.dados) {
            const d = ocrData.dados;
            updates.name = d.nome || "";
            updates.address_street = d.endereco || "";
            updates.address_number = d.numero || "";
            updates.address_neighborhood = d.bairro || "";
            updates.cep = d.cep || "";
            updates.address_city = d.cidade || "";
            updates.address_state = d.estado || "";
            updates.distribuidora = d.distribuidora || "";
            updates.numero_instalacao = d.numeroInstalacao || "";
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
          reply = "✅ Dados da conta confirmados!\n\n📋 Qual documento de identidade você vai enviar?\n\nToque em uma opção:";

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
          reply = "Escolha o tipo de documento (toque em um botão):";
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
              undefined,
              undefined,
              undefined
            );
            console.log("📊 OCR CNH resultado:", JSON.stringify(ocrData).substring(0, 400));

            if (ocrData.sucesso && ocrData.dados) {
              const d = ocrData.dados;
              if (d.nome) updates.name = d.nome;
              if (d.cpf) updates.cpf = d.cpf.replace(/\D/g, "");
              if (d.rg) updates.rg = d.rg;
              if (d.data_nascimento) updates.data_nascimento = d.data_nascimento;
              if (d.nome_pai) updates.nome_pai = d.nome_pai;
              if (d.nome_mae) updates.nome_mae = d.nome_mae;
            }
          } catch (e) {
            console.error("❌ OCR CNH falhou:", e);
          }

          updates.conversation_step = "confirmando_dados_doc";
          const nome = updates.name || customer.name || "—";
          const cpf = updates.cpf || customer.cpf || "—";
          const rg = updates.rg || customer.rg || "—";
          const nasc = updates.data_nascimento || customer.data_nascimento || "—";
          reply = `📋 *Dados extraídos da CNH:*\n\n👤 Nome: *${nome}*\n🆔 CPF: *${cpf}*\n🪪 RG: *${rg}*\n🎂 Nascimento: *${nasc}*\n\n✅ Dados corretos?\n\n1️⃣ *SIM* - Continuar\n2️⃣ *NÃO* - Reenviar CNH\n3️⃣ *EDITAR* - Corrigir dados`;
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

        try {
          const docFrenteUrl = customer.document_front_url || updates.document_front_url;
          const docVersoUrl = updates.document_back_url || customer.document_back_url;

          console.log("📡 Chamando OCR documento (frente+verso)");

          const ocrData = await ocrDocumentoFrenteVerso(
            docFrenteUrl,
            docVersoUrl,
            customer.document_type || "RG",
            GEMINI_API_KEY,
            undefined,
            undefined,
            undefined
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
          const nextStep = getNextMissingStep(merged);
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
        const next = getNextMissingStep(merged);
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
        const next = getNextMissingStep(merged);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }

      case "ask_rg": {
        if (messageText.length < 4) { reply = "Por favor, informe um *RG válido*:"; break; }
        updates.rg = messageText.trim();
        const merged = { ...customer, ...updates };
        const next = getNextMissingStep(merged);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }

      case "ask_birth_date": {
        const dateMatch = messageText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (!dateMatch) { reply = "❌ Data inválida. Use *DD/MM/AAAA* (ex: 20/07/1993):"; break; }
        updates.data_nascimento = messageText.trim();
        const merged = { ...customer, ...updates };
        const next = getNextMissingStep(merged);
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
          const next = getNextMissingStep(merged);
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
        const next = getNextMissingStep(merged);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }

      case "ask_email": {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(messageText)) { reply = "❌ E-mail inválido. Digite um e-mail válido:"; break; }
        updates.email = messageText.trim().toLowerCase();
        const merged = { ...customer, ...updates };
        const next = getNextMissingStep(merged);
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
        const next = getNextMissingStep(merged);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }

      case "ask_number": {
        updates.address_number = messageText.trim();
        const merged = { ...customer, ...updates };
        const next = getNextMissingStep(merged);
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
        const next = getNextMissingStep(merged);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }

      case "ask_installation_number": {
        const instClean = messageText.replace(/\D/g, "");
        if (instClean.length < 7) { reply = "❌ Número inválido. Digite pelo menos 7 dígitos:"; break; }
        updates.numero_instalacao = instClean;
        const merged = { ...customer, ...updates };
        const next = getNextMissingStep(merged);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }

      case "ask_bill_value": {
        const val = parseFloat(messageText.replace(/[^\d.,]/g, "").replace(",", "."));
        if (isNaN(val) || val <= 0) { reply = "❌ Valor inválido. Digite um número (ex: 350):"; break; }
        updates.electricity_bill_value = val;
        const merged = { ...customer, ...updates };
        const next = getNextMissingStep(merged);
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
        const next = getNextMissingStep(merged);
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
        const next = getNextMissingStep(merged);
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
          reply = getReplyForStep("ask_finalizar", customer);
        }
        break;
      }

      // ─── 12. OTP ──────────────────────────────────────────────────────
      case "aguardando_otp": {
        const otpCode = messageText.replace(/\D/g, "");
        if (otpCode.length >= 4 && otpCode.length <= 8) {
          updates.otp_code = otpCode;
          updates.otp_received_at = new Date().toISOString();
          updates.conversation_step = "validando_otp";
          updates.status = "validating_otp";

          reply = `✅ Código *${otpCode}* recebido! ⏳ Validando no portal...\n\nAguarde alguns instantes...`;

          try {
            const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
            const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
            const otpRes = await fetchWithTimeout(`${supabaseUrl}/functions/v1/submit-otp`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({ customer_id: customer.id, otp_code: otpCode }),
              timeout: 50_000,
            });
            const otpData = await otpRes.text();
            console.log(`📡 submit-otp resposta (${otpRes.status}): ${otpData.substring(0, 200)}`);
          } catch (e: any) {
            console.error("⚠️ Erro ao chamar submit-otp:", e.message);
          }
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

      // ─── DEFAULT ─────────────────────────────────────────────────────
      default: {
        updates.conversation_step = "welcome";
        reply =
          `👋 Olá! Eu sou o assistente da *${nomeRepresentante}* em parceria com a *iGreen Energy*!\n\n` +
          "📸 *Envie uma FOTO ou PDF da sua conta de energia* para começarmos!\n\n" +
          "Formatos aceitos: JPG, PNG ou PDF";
        updates.conversation_step = "aguardando_conta";
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