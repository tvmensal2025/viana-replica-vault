// Main bot state machine — extracted verbatim from the giant switch in index.ts.
// All conversation steps live here. Receives a BotContext and returns
// { reply, updates }. The caller persists updates and sends reply.
//
// Behavior is identical to the previous inline version. Only structural change:
// the closure variables are now properties of `ctx`.

import { validateCustomerForPortal } from "../../_shared/validators.ts";
import {
  fetchWithTimeout,
  fetchInsecure,
  withRetry,
  buscarCepPorEndereco,
  normalizePhone,
  TIMEOUT_VIA_CEP,
  logStructured,
} from "../../_shared/utils.ts";
import {
  getReplyForStep,
  getNextMissingStep,
  validarCPFDigitos,
} from "../../_shared/conversation-helpers.ts";
import { ocrContaEnergia, ocrDocumentoFrenteVerso } from "../../_shared/ocr.ts";
import { normalizeDocumentType, isCNH, friendlyLabel } from "../../_shared/document-type.ts";
import { uploadMediaToMinio, OCR_CONFIDENCE_THRESHOLD } from "../_helpers.ts";
import { jsonLog } from "../../_shared/audit.ts";
import type { BotContext, BotResult } from "./types.ts";

// ── Auto-resolve CEP from address data (avoid asking user) ──
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

// ── Quick HEAD check to confirm a media URL is reachable before sending ──
async function urlExists(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    clearTimeout(timer);
    return r.ok;
  } catch {
    return false;
  }
}

export async function runBotFlow(ctx: BotContext): Promise<BotResult> {
  const {
    supabase,
    sender: { sendText, sendButtons, sendMedia },
    customer,
    consultorId,
    nomeRepresentante,
    remoteJid,
    phone,
    messageText,
    buttonId,
    isFile,
    isButton,
    hasImage,
    hasDocument,
    imageMessage,
    documentMessage,
    message,
    messageId,
    fileUrl,
    fileBase64,
    geminiApiKey,
  } = ctx;

  const step = customer.conversation_step || "welcome";
  let reply = "";
  const updates: Record<string, any> = {};

  switch (step) {
    // ─── 1. BOAS-VINDAS ────────────────────
    case "welcome": {
      const welcomeMsg =
        `Oi! 👋 Aqui é o assistente digital de *${nomeRepresentante}*.\n\n` +
        `Já pensou em pagar menos na sua conta de luz todo mês? 💚\n` +
        `Com a *iGreen Energy* dá pra economizar de *8% a 20%*, de forma simples e sem complicação. ☀️\n\n` +
        `Posso te explicar rapidinho como funciona?`;
      await sendButtons(remoteJid, welcomeMsg, [
        { id: "entender_desconto", title: "💡 Quero saber mais" },
        { id: "cadastrar_agora", title: "📋 Já quero participar" },
        { id: "falar_humano", title: "🧑 Falar com humano" },
      ]);
      updates.conversation_step = "menu_inicial";
      reply = "";
      break;
    }

    case "menu_inicial": {
      const resp = isButton ? buttonId : messageText.toLowerCase().trim();
      if (resp === "entender_desconto" || resp === "1" || resp?.includes("funciona") || resp?.includes("entender") || resp?.includes("desconto")) {
        const videoUrl = "https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/video%20igreen/Green_Energy.mp4";
        await sendText(remoteJid, "🎬 Assista este vídeo rápido e entenda como funciona o desconto na sua conta de luz:");
        if (await urlExists(videoUrl)) {
          const sent = await sendMedia(remoteJid, videoUrl, "☀️ Conexão Green — Energia limpa com até 20% de desconto!", "video");
          if (!sent) {
            console.warn("[bot-flow] sendMedia retornou false para Green_Energy.mp4 — seguindo sem mensagem de erro ao cliente.");
          }
        } else {
          console.warn("[bot-flow] vídeo Green_Energy.mp4 indisponível (HEAD != 200) — pulando envio.");
        }
        await new Promise((r) => setTimeout(r, 1500));
        const posVideoMsg = "📺 Assistiu o vídeo? Agora escolha como deseja prosseguir:";
        await sendButtons(remoteJid, posVideoMsg, [
          { id: "cadastrar_agora", title: "📋 Cadastrar agora" },
          { id: "falar_humano", title: "🧑 Falar com humano" },
        ]);
        updates.conversation_step = "pos_video";
        reply = "";
      } else if (resp === "cadastrar_agora" || resp === "2" || resp?.includes("cadastr")) {
        reply = "📋 Ótimo! Vamos iniciar seu cadastro.\n\n📸 *Envie uma FOTO ou PDF da sua conta de energia* para começarmos!\n\nFormatos aceitos: JPG, PNG ou PDF";
        updates.conversation_step = "aguardando_conta";
      } else if (resp === "falar_humano" || resp === "3" || resp?.includes("humano") || resp?.includes("atendente") || resp?.includes("pessoa")) {
        reply = `🧑 Entendido! Um consultor da equipe *${nomeRepresentante}* entrará em contato com você em breve.\n\n⏰ Nosso horário de atendimento é de segunda a sexta, das 8h às 18h.\n\nEnquanto isso, se mudar de ideia, é só digitar *cadastrar* para iniciar!`;
        updates.conversation_step = "aguardando_humano";
      } else {
        const retryMsg = "Sem problemas 😊 Me conta: como prefere seguir?";
        await sendButtons(remoteJid, retryMsg, [
          { id: "entender_desconto", title: "💡 Quero saber mais" },
          { id: "cadastrar_agora", title: "📋 Já quero participar" },
          { id: "falar_humano", title: "🧑 Falar com humano" },
        ]);
        reply = "";
      }
      break;
    }

    case "pos_video": {
      const resp = isButton ? buttonId : messageText.toLowerCase().trim();
      if (resp === "cadastrar_agora" || resp === "1" || resp?.includes("cadastr")) {
        reply = "📋 Ótimo! Vamos iniciar seu cadastro.\n\n📸 *Envie uma FOTO ou PDF da sua conta de energia* para começarmos!\n\nFormatos aceitos: JPG, PNG ou PDF";
        updates.conversation_step = "aguardando_conta";
      } else if (resp === "falar_humano" || resp === "2" || resp?.includes("humano") || resp?.includes("atendente") || resp?.includes("pessoa")) {
        reply = `🧑 Entendido! Um consultor da equipe *${nomeRepresentante}* entrará em contato com você em breve.\n\n⏰ Nosso horário de atendimento é de segunda a sexta, das 8h às 18h.\n\nEnquanto isso, se mudar de ideia, é só digitar *cadastrar* para iniciar!`;
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

    case "aguardando_humano": {
      const resp = messageText.toLowerCase().trim();
      if (resp?.includes("cadastr") || resp === "2") {
        reply = "📋 Vamos iniciar seu cadastro!\n\n📸 *Envie uma FOTO ou PDF da sua conta de energia* para começarmos!\n\nFormatos aceitos: JPG, PNG ou PDF";
        updates.conversation_step = "aguardando_conta";
      } else {
        reply = `⏳ Sua solicitação já foi registrada! Um consultor da equipe *${nomeRepresentante}* entrará em contato em breve.\n\nSe quiser iniciar o cadastro agora, digite *cadastrar*.`;
      }
      break;
    }

    // ─── 2. AGUARDANDO CONTA ──────────────
    case "aguardando_conta": {
      if (!isFile) {
        reply = "📸 Por favor, envie a *FOTO ou PDF da sua conta de energia*.\n\nFormatos aceitos: JPG, PNG ou PDF";
        break;
      }
      if (fileBase64) {
        const mime = imageMessage?.mimetype || documentMessage?.mimetype || "application/octet-stream";
        updates.electricity_bill_photo_url = `data:${mime};base64,${fileBase64}`;
        updates.bill_base64 = fileBase64;
        updates.bill_message_id = messageId || null;
        updates.media_storage = "inline";
        const custId = customer.id;
        uploadMediaToMinio({
          fileBase64, mimeType: mime, consultantFolder: consultorId, consultantName: nomeRepresentante,
          customerName: customer.name || "cliente", customerBirth: customer.data_nascimento, kind: "conta",
        }).then(async (minioUrl) => {
          if (minioUrl) {
            await supabase.from("customers").update({ electricity_bill_photo_url: minioUrl, media_storage: "minio" }).eq("id", custId);
            console.log(`📦✅ [BG] Conta uploaded MinIO: ${minioUrl.substring(0, 80)}`);
          }
        }).catch((e) => console.warn(`📦⚠️ [BG] MinIO conta falhou: ${e?.message}`));
      } else {
        updates.electricity_bill_photo_url = fileUrl?.startsWith("http") ? fileUrl : "evolution-media:pending";
        updates.bill_message_id = messageId || null;
      }
      updates.conversation_step = "processando_ocr_conta";
      await sendText(remoteJid, "✅ Conta recebida! ⏳ Analisando seus dados...\n\nAguarde alguns instantes...");

      console.log("📥 Arquivo recebido:");
      console.log("  - isFile:", isFile);
      console.log("  - hasImage:", hasImage);
      console.log("  - hasDocument:", hasDocument);
      console.log("  - imageMessage:", !!imageMessage);
      console.log("  - documentMessage:", !!documentMessage);
      console.log("  - fileUrl:", fileUrl?.substring(0, 100));
      console.log("  - fileBase64 length:", fileBase64?.length || 0);
      console.log("  - mimetype:", imageMessage?.mimetype || documentMessage?.mimetype);

      if (fileBase64) {
        if (fileBase64.length < 100) {
          console.error("❌ Base64 muito pequeno:", fileBase64.length);
          updates.conversation_step = "aguardando_conta";
          reply = "⚠️ Erro ao processar imagem. Tente enviar uma foto mais nítida.";
          break;
        }
        try { atob(fileBase64.substring(0, 100)); } catch {
          console.error("❌ Base64 inválido");
          updates.conversation_step = "aguardando_conta";
          reply = "⚠️ Erro ao processar imagem. Tente enviar novamente.";
          break;
        }
      }

      const mediaMsg = documentMessage || imageMessage || {
        mimetype: imageMessage?.mimetype || documentMessage?.mimetype || "image/jpeg",
      };

      try {
        console.log("📡 Chamando OCR Gemini para conta:", fileUrl?.substring(0, 100));
        const ocrData = await ocrContaEnergia(fileUrl, geminiApiKey, fileBase64 || undefined, mediaMsg);
        console.log("📊 OCR Conta resultado:", JSON.stringify(ocrData).substring(0, 400));
        if (ocrData.sucesso && ocrData.dados) {
          const d = ocrData.dados;
          const confianca = typeof d.confianca === "number" ? d.confianca : 100;
          if (confianca < OCR_CONFIDENCE_THRESHOLD) {
            jsonLog("warn", "OCR conta abaixo do threshold", { customer_id: customer.id, confianca, threshold: OCR_CONFIDENCE_THRESHOLD });
            updates.conversation_step = "aguardando_conta";
            reply = `⚠️ Não consegui ler a conta com clareza suficiente (qualidade: ${confianca}%).\n\n📸 Por favor, envie uma *foto mais nítida e bem iluminada* da conta de energia.\n\nDicas:\n• Use boa iluminação\n• Evite reflexos\n• Foco nos dados principais\n• Tire em ambiente claro`;
            break;
          }
          // BLINDAGEM: OCR pode retornar sucesso=true com dados vazios.
          // Exigir ao menos 3 campos críticos preenchidos.
          const criticos = [d.nome, d.endereco, d.cep, d.cidade, d.distribuidora, d.numeroInstalacao, d.valorConta]
            .filter((v) => v && String(v).trim().length > 0);
          if (criticos.length < 3) {
            jsonLog("warn", "OCR conta com poucos campos válidos", { customer_id: customer.id, validos: criticos.length });
            const tries = (customer.ocr_conta_attempts || 0) + 1;
            updates.ocr_conta_attempts = tries;
            if (tries < 2) {
              updates.conversation_step = "aguardando_conta";
              reply = "⚠️ Recebi a conta mas não consegui extrair os dados principais.\n\n📸 Envie uma *foto mais nítida* mostrando claramente:\n• Seu nome\n• Endereço\n• Distribuidora\n• Valor da conta";
            } else {
              updates.conversation_step = "ask_name";
              reply = "⚠️ Tive dificuldade em ler sua conta. Vou perguntar os dados manualmente.\n\nQual é o seu *nome completo*?";
            }
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
          if (!updates.cep && updates.address_city && updates.address_state && updates.address_street) {
            console.log("🔍 CEP não encontrado. Buscando via ViaCEP...");
            const cepBuscado = await buscarCepPorEndereco(updates.address_state, updates.address_city, updates.address_street);
            if (cepBuscado) {
              updates.cep = cepBuscado;
              console.log(`✅ CEP auto-preenchido: ${cepBuscado}`);
            }
          }
          updates.conversation_step = "confirmando_dados_conta";
          reply = "📋 *Dados encontrados na conta:*\n\n" +
            `👤 *Nome:* ${updates.name || "❌ não encontrado"}\n` +
            `📍 *Endereço:* ${updates.address_street || "❌"} ${updates.address_number || ""}\n` +
            `🏘️ *Bairro:* ${updates.address_neighborhood || "❌"}\n` +
            `🏙️ *Cidade:* ${updates.address_city || "❌"} - ${updates.address_state || ""}\n` +
            `📮 *CEP:* ${updates.cep || "❌"}\n` +
            `⚡ *Distribuidora:* ${updates.distribuidora || "❌"}\n` +
            `🔢 *Nº Instalação:* ${updates.numero_instalacao || "❌"}\n` +
            `💰 *Valor:* R$ ${updates.electricity_bill_value || "❌"}\n\n` +
            "Está tudo correto?";
          await sendButtons(remoteJid, reply, [
            { id: "sim_conta", title: "✅ SIM" },
            { id: "nao_conta", title: "❌ NÃO" },
            { id: "editar_conta", title: "✏️ EDITAR" },
          ]);
          reply = "";
        } else {
          console.error("❌ OCR conta falhou:", ocrData.erro);
          const tries = (customer.ocr_conta_attempts || 0) + 1;
          updates.ocr_conta_attempts = tries;
          if (tries < 2) {
            updates.conversation_step = "aguardando_conta";
            reply = "⚠️ Não consegui ler a conta. Por favor, envie uma *foto mais nítida e bem iluminada* (sem reflexos).";
          } else {
            console.warn(`⏭️ OCR conta falhou ${tries}x — pulando para coleta manual`);
            updates.conversation_step = "ask_name";
            reply = "⚠️ Não consegui ler sua conta de luz, mas tudo bem! Vou te perguntar os dados manualmente.\n\nQual é o seu *nome completo*?";
          }
        }
      } catch (e) {
        console.error("❌ Erro OCR conta:", e);
        const tries = (customer.ocr_conta_attempts || 0) + 1;
        updates.ocr_conta_attempts = tries;
        if (tries < 2) {
          updates.conversation_step = "aguardando_conta";
          reply = "⚠️ Erro ao processar a conta. Tente enviar novamente.";
        } else {
          updates.conversation_step = "ask_name";
          reply = "⚠️ Tive um problema ao ler sua conta. Vou continuar perguntando os dados.\n\nQual é o seu *nome completo*?";
        }
      }
      break;
    }

    // ─── 3. CONFIRMANDO DADOS DA CONTA ──────────
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
        reply = "✏️ Qual campo deseja editar?\n\n1️⃣ Nome\n2️⃣ Endereço\n3️⃣ CEP\n4️⃣ Distribuidora\n5️⃣ Nº Instalação\n6️⃣ Valor da conta\n\nDigite o número:";
      } else {
        const sent = await sendButtons(remoteJid, "Os dados da conta estão corretos?", [
          { id: "sim_conta", title: "✅ SIM" },
          { id: "nao_conta", title: "❌ NÃO" },
          { id: "editar_conta", title: "✏️ EDITAR" },
        ]);
        if (!sent) reply = "Digite *SIM*, *NÃO* ou *EDITAR*:";
      }
      break;
    }

    // ─── 3b. TIPO DE DOCUMENTO ─────────
    case "ask_tipo_documento": {
      const resp = isButton ? buttonId : messageText.trim().toLowerCase();
      const rgNovo = resp === "tipo_rg_novo" || resp === "1" || resp === "rg novo";
      const rgAntigo = resp === "tipo_rg_antigo" || resp === "2" || resp === "rg antigo";
      const cnh = resp === "tipo_cnh" || resp === "3" || resp === "cnh";
      if (rgNovo) { updates.document_type = "rg_novo"; updates.conversation_step = "aguardando_doc_frente"; reply = "📄 *RG (Novo)*\n\n📸 Envie a *FRENTE do seu RG*.\n\nFormatos: JPG, PNG ou PDF"; }
      else if (rgAntigo) { updates.document_type = "rg_antigo"; updates.conversation_step = "aguardando_doc_frente"; reply = "📄 *RG (Antigo)*\n\n📸 Envie a *FRENTE do seu RG*.\n\nFormatos: JPG, PNG ou PDF"; }
      else if (cnh) { updates.document_type = "cnh"; updates.conversation_step = "aguardando_doc_frente"; reply = "📄 *CNH*\n\n📸 Envie a *FRENTE da sua CNH*.\n\nFormatos: JPG, PNG ou PDF"; }
      else {
        const sent = await sendButtons(remoteJid, "📋 Qual documento de identidade você vai enviar?\n\nToque em uma opção:", [
          { id: "tipo_rg_novo", title: "📄 RG Novo" },
          { id: "tipo_rg_antigo", title: "📄 RG Antigo" },
          { id: "tipo_cnh", title: "🪪 CNH" },
        ]);
        if (!sent) reply = "Escolha: *1* = RG Novo, *2* = RG Antigo, *3* = CNH";
      }
      break;
    }

    // ─── 4. FRENTE DO DOC ───────────
    case "aguardando_doc_frente": {
      if (!isFile) {
        const tipo = friendlyLabel(customer.document_type);
        const msgDoc = isCNH(customer.document_type) ? "FRENTE da sua CNH" : `FRENTE do seu ${tipo}`;
        reply = `📸 Envie a *${msgDoc}*.\n\nFormatos: JPG, PNG ou PDF`;
        break;
      }
      if (fileBase64) {
        const mime = imageMessage?.mimetype || documentMessage?.mimetype || "application/octet-stream";
        updates.document_front_url = `data:${mime};base64,${fileBase64}`;
        updates.document_front_base64 = fileBase64;
        updates.media_message_id = messageId || null;
        updates.media_storage = "inline";
        const custId = customer.id;
        uploadMediaToMinio({
          fileBase64, mimeType: mime, consultantFolder: consultorId, consultantName: nomeRepresentante,
          customerName: customer.name || "cliente", customerBirth: customer.data_nascimento, kind: "doc_frente",
        }).then(async (minioUrl) => {
          if (minioUrl) {
            await supabase.from("customers").update({ document_front_url: minioUrl, media_storage: "minio" }).eq("id", custId);
            console.log(`📦✅ [BG] Doc frente uploaded MinIO: ${minioUrl.substring(0, 80)}`);
          }
        }).catch((e) => console.warn(`📦⚠️ [BG] MinIO doc_frente falhou: ${e?.message}`));
      } else {
        updates.document_front_url = fileUrl?.startsWith("http") ? fileUrl : "evolution-media:pending";
        updates.media_message_id = messageId || null;
      }

      const tipoEscolhido = normalizeDocumentType(customer.document_type);
      if (tipoEscolhido === "cnh") {
        updates.document_back_url = "nao_aplicavel";
        updates.document_type = "cnh";
        await sendText(remoteJid, "✅ CNH recebida! ⏳ Analisando...\n\nAguarde...");
        try {
          const docFrenteUrl = fileUrl || updates.document_front_url || "evolution-media:pending";
          console.log("📡 Chamando OCR documento CNH (apenas frente)");
          const ocrData = await ocrDocumentoFrenteVerso(
            docFrenteUrl, "nao_aplicavel", "CNH", geminiApiKey,
            fileBase64 || undefined, documentMessage || imageMessage, undefined
          );
          console.log("📊 OCR CNH resultado:", JSON.stringify(ocrData).substring(0, 400));
          if (ocrData.sucesso && ocrData.dados) {
            const d = ocrData.dados;
            if (d.nome) updates.name = d.nome;
            if (d.cpf) updates.cpf = d.cpf.replace(/\D/g, "");
            if (d.rg) updates.rg = d.rg;
            const dataConf = String(d.dataNascimentoConfianca || "").toLowerCase();
            if (d.dataNascimento && dataConf === "alta") {
              updates.data_nascimento = d.dataNascimento;
              console.log(`✅ CNH: data nasc ${d.dataNascimento} aceita (confiança alta)`);
            } else if (d.dataNascimento) {
              console.warn(`⚠️ CNH: data nasc ${d.dataNascimento} NÃO salva (confiança ${dataConf || "n/a"}). Portal preencherá via CPF.`);
            }
            if (d.nomePai) updates.nome_pai = d.nomePai;
            if (d.nomeMae) updates.nome_mae = d.nomeMae;
          }
        } catch (e) { console.error("❌ OCR CNH falhou:", e); }
        updates.conversation_step = "confirmando_dados_doc";
        const nome = updates.name || customer.name || "—";
        const cpf = updates.cpf || customer.cpf || "—";
        const rg = updates.rg || customer.rg || "—";
        const nasc = updates.data_nascimento || customer.data_nascimento || "_(será preenchido pelo portal via CPF)_";
        const chnConfirmMsg = `📋 *Dados extraídos da CNH:*\n\n👤 Nome: *${nome}*\n🆔 CPF: *${cpf}*\n🪪 RG: *${rg}*\n🎂 Nascimento: *${nasc}*\n\nEstá tudo correto?`;
        await sendButtons(remoteJid, chnConfirmMsg, [
          { id: "sim_doc", title: "✅ SIM" },
          { id: "nao_doc", title: "❌ NÃO" },
          { id: "editar_doc", title: "✏️ EDITAR" },
        ]);
        reply = "";
        break;
      }
      updates.conversation_step = "aguardando_doc_verso";
      reply = "✅ Frente recebida!\n\n📸 Agora envie o *VERSO do RG*.\n\nFormatos: JPG, PNG ou PDF";
      break;
    }

    // ─── 5. VERSO ────────
    case "aguardando_doc_verso": {
      if (!isFile) { reply = "📸 Envie o *VERSO do documento*.\n\nFormatos: JPG, PNG ou PDF"; break; }
      if (fileBase64) {
        const mime = imageMessage?.mimetype || documentMessage?.mimetype || "application/octet-stream";
        updates.document_back_url = `data:${mime};base64,${fileBase64}`;
        const custId = customer.id;
        uploadMediaToMinio({
          fileBase64, mimeType: mime, consultantFolder: consultorId, consultantName: nomeRepresentante,
          customerName: customer.name || "cliente", customerBirth: customer.data_nascimento, kind: "doc_verso",
        }).then(async (minioUrl) => {
          if (minioUrl) {
            await supabase.from("customers").update({ document_back_url: minioUrl }).eq("id", custId);
            console.log(`📦✅ [BG] Doc verso uploaded MinIO: ${minioUrl.substring(0, 80)}`);
          }
        }).catch((e) => console.warn(`📦⚠️ [BG] MinIO doc_verso falhou: ${e?.message}`));
      } else {
        updates.document_back_url = fileUrl?.startsWith("http") ? fileUrl : "evolution-media:pending";
      }
      await sendText(remoteJid, "✅ Documento recebido! ⏳ Analisando...\n\nAguarde...");
      console.log("📥 Documento verso recebido:");
      console.log("  - fileBase64 length:", fileBase64?.length || 0);
      console.log("  - mimetype:", imageMessage?.mimetype || documentMessage?.mimetype);
      if (fileBase64 && fileBase64.length < 100) {
        console.error("❌ Base64 muito pequeno:", fileBase64.length);
        updates.conversation_step = "aguardando_doc_verso";
        reply = "⚠️ Erro ao processar documento. Tente enviar uma foto mais nítida.";
        break;
      }
      const mediaMsg = documentMessage || imageMessage || {
        mimetype: imageMessage?.mimetype || documentMessage?.mimetype || "image/jpeg",
      };
      try {
        const docFrenteUrl = customer.document_front_url || updates.document_front_url;
        const docVersoUrl = updates.document_back_url || customer.document_back_url;
        const frenteBase64: string | undefined = undefined;
        console.log("📡 Chamando OCR documento (verso; frente já analisada se disponível)");
        console.log(`📡 Frente base64 banco: NÃO (descontinuado), Verso base64: ${fileBase64 ? 'SIM' : 'NÃO'}`);
        const ocrData = await ocrDocumentoFrenteVerso(
          docFrenteUrl, docVersoUrl, customer.document_type || "rg_antigo",
          geminiApiKey, frenteBase64, undefined, fileBase64 || undefined
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
          reply = "📋 *Confirme seus dados pessoais:*\n\n" +
            `👤 *Nome:* ${d.nome || "❌ não encontrado"}\n` +
            `🆔 *CPF:* ${d.cpf || "❌ não encontrado"}\n` +
            `📄 *RG:* ${d.rg || "❌ não encontrado"}\n` +
            `🎂 *Data Nasc:* ${d.dataNascimento || "❌ não encontrado"}\n\n` +
            "Está tudo correto?";
          await sendButtons(remoteJid, reply, [
            { id: "sim_doc", title: "✅ SIM" },
            { id: "nao_doc", title: "❌ NÃO" },
            { id: "editar_doc", title: "✏️ EDITAR" },
          ]);
          reply = "";
        } else {
          console.error("❌ OCR doc falhou:", ocrData.erro);
          const tries = (customer.ocr_doc_attempts || 0) + 1;
          updates.ocr_doc_attempts = tries;
          if (tries < 2) {
            updates.conversation_step = "aguardando_doc_verso";
            reply = "⚠️ Não consegui ler o documento. Envie uma foto mais nítida do *VERSO*.";
          } else {
            console.warn(`⏭️ OCR doc falhou ${tries}x — pulando para coleta manual de RG/CPF/data nasc`);
            updates.conversation_step = "ask_cpf";
            reply = "⚠️ Não consegui extrair os dados do documento, mas vamos continuar.\n\nQual o seu *CPF*? (apenas números)";
          }
        }
      } catch (e) {
        console.error("❌ Erro OCR doc:", e);
        const tries = (customer.ocr_doc_attempts || 0) + 1;
        updates.ocr_doc_attempts = tries;
        if (tries < 2) {
          updates.conversation_step = "aguardando_doc_verso";
          reply = "⚠️ Erro ao processar o documento. Tente enviar novamente.";
        } else {
          updates.conversation_step = "ask_cpf";
          reply = "⚠️ Tive problemas para ler seu documento. Vamos seguir manualmente.\n\nQual o seu *CPF*? (apenas números)";
        }
      }
      break;
    }

    // ─── 6. CONFIRMANDO DADOS DOC ─────────
    case "confirmando_dados_doc": {
      const resp = isButton ? buttonId : messageText.toLowerCase().trim();
      if (resp === "sim_doc" || resp === "sim" || resp === "s" || resp === "1" || resp === "ok" || resp === "correto" || resp === "✅") {
        const merged = { ...customer, ...updates };
        const next = await autoResolveCepIfNeeded(merged, updates);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
      } else if (resp === "nao_doc" || resp === "nao" || resp === "não" || resp === "n" || resp === "2" || resp === "errado" || resp === "❌") {
        updates.conversation_step = "aguardando_doc_frente";
        reply = "📸 Ok! Envie novamente a *FRENTE do documento* com melhor qualidade.";
      } else if (resp === "editar_doc" || resp === "editar" || resp === "3") {
        updates.conversation_step = "editing_doc_menu";
        reply = "✏️ Qual campo deseja editar?\n\n1️⃣ Nome\n2️⃣ CPF\n3️⃣ RG\n4️⃣ Data de Nascimento\n\nDigite o número:";
      } else {
        const sent = await sendButtons(remoteJid, "Os dados estão corretos?", [
          { id: "sim_doc", title: "✅ SIM" },
          { id: "nao_doc", title: "❌ NÃO" },
          { id: "editar_doc", title: "✏️ EDITAR" },
        ]);
        if (!sent) reply = "Digite *SIM*, *NÃO* ou *EDITAR*:";
      }
      break;
    }

    // ─── 7. EDIÇÃO CONTA ─────────
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
      if (fieldMap[op]) { updates.conversation_step = fieldMap[op][0]; reply = fieldMap[op][1]; }
      else reply = "❌ Opção inválida. Digite um número de 1 a 6:";
      break;
    }

    case "editing_conta_nome":
      updates.name = messageText.trim();
      updates.conversation_step = "confirmando_dados_conta";
      reply = `✅ Nome atualizado: *${messageText.trim()}*\n\nOs dados estão corretos agora?`;
      { await sendButtons(remoteJid, reply, [{ id: "sim_conta", title: "✅ SIM" }, { id: "nao_conta", title: "❌ NÃO" }, { id: "editar_conta", title: "✏️ EDITAR" }]); reply = ""; }
      break;

    case "editing_conta_endereco":
      updates.address_street = messageText.trim();
      updates.conversation_step = "confirmando_dados_conta";
      reply = `✅ Endereço atualizado.\n\nOs dados estão corretos agora?`;
      { await sendButtons(remoteJid, reply, [{ id: "sim_conta", title: "✅ SIM" }, { id: "nao_conta", title: "❌ NÃO" }, { id: "editar_conta", title: "✏️ EDITAR" }]); reply = ""; }
      break;

    case "editing_conta_cep": {
      const cepClean = messageText.replace(/\D/g, "");
      if (cepClean.length === 8) {
        updates.cep = cepClean;
        updates.conversation_step = "confirmando_dados_conta";
        reply = `✅ CEP atualizado: *${cepClean.replace(/(\d{5})(\d{3})/, "$1-$2")}*\n\nOs dados estão corretos agora?`;
        await sendButtons(remoteJid, reply, [{ id: "sim_conta", title: "✅ SIM" }, { id: "nao_conta", title: "❌ NÃO" }, { id: "editar_conta", title: "✏️ EDITAR" }]);
        reply = "";
      } else reply = "❌ CEP inválido. Digite os 8 números:";
      break;
    }

    case "editing_conta_distribuidora":
      updates.distribuidora = messageText.trim();
      updates.conversation_step = "confirmando_dados_conta";
      reply = `✅ Distribuidora atualizada: *${messageText.trim()}*\n\nOs dados estão corretos agora?`;
      { await sendButtons(remoteJid, reply, [{ id: "sim_conta", title: "✅ SIM" }, { id: "nao_conta", title: "❌ NÃO" }, { id: "editar_conta", title: "✏️ EDITAR" }]); reply = ""; }
      break;

    case "editing_conta_instalacao": {
      const instClean = messageText.replace(/\D/g, "");
      if (instClean.length >= 7) {
        updates.numero_instalacao = instClean;
        updates.conversation_step = "confirmando_dados_conta";
        reply = `✅ Nº instalação atualizado: *${instClean}*\n\nOs dados estão corretos agora?`;
        await sendButtons(remoteJid, reply, [{ id: "sim_conta", title: "✅ SIM" }, { id: "nao_conta", title: "❌ NÃO" }, { id: "editar_conta", title: "✏️ EDITAR" }]);
        reply = "";
      } else reply = "❌ Número inválido. Digite pelo menos 7 dígitos:";
      break;
    }

    case "editing_conta_valor": {
      const val = parseFloat(messageText.replace(/[^\d.,]/g, "").replace(",", "."));
      if (!isNaN(val) && val > 0) {
        updates.electricity_bill_value = val;
        updates.conversation_step = "confirmando_dados_conta";
        reply = `✅ Valor atualizado: *R$ ${val.toFixed(2)}*\n\nOs dados estão corretos agora?`;
        await sendButtons(remoteJid, reply, [{ id: "sim_conta", title: "✅ SIM" }, { id: "nao_conta", title: "❌ NÃO" }, { id: "editar_conta", title: "✏️ EDITAR" }]);
        reply = "";
      } else reply = "❌ Valor inválido. Digite um número (ex: 350.50):";
      break;
    }

    // ─── 8. EDIÇÃO DOCUMENTO ─────────
    case "editing_doc_menu": {
      const op = messageText.trim();
      const fieldMap: Record<string, [string, string]> = {
        "1": ["editing_doc_nome", "Digite o *nome completo* correto:"],
        "2": ["editing_doc_cpf", "Digite o *CPF* correto (apenas números):"],
        "3": ["editing_doc_rg", "Digite o *RG* correto:"],
        "4": ["editing_doc_nascimento", "Digite a *data de nascimento* (DD/MM/AAAA):"],
      };
      if (fieldMap[op]) { updates.conversation_step = fieldMap[op][0]; reply = fieldMap[op][1]; }
      else reply = "❌ Opção inválida. Digite um número de 1 a 4:";
      break;
    }

    case "editing_doc_nome":
      updates.name = messageText.trim();
      updates.conversation_step = "confirmando_dados_doc";
      reply = `✅ Nome atualizado: *${messageText.trim()}*\n\nOs dados estão corretos agora?`;
      { await sendButtons(remoteJid, reply, [{ id: "sim_doc", title: "✅ SIM" }, { id: "nao_doc", title: "❌ NÃO" }, { id: "editar_doc", title: "✏️ EDITAR" }]); reply = ""; }
      break;

    case "editing_doc_cpf": {
      const cpfClean = messageText.replace(/\D/g, "");
      if (cpfClean.length === 11) {
        updates.cpf = cpfClean;
        updates.conversation_step = "confirmando_dados_doc";
        reply = `✅ CPF atualizado: *${cpfClean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}*\n\nOs dados estão corretos agora?`;
        await sendButtons(remoteJid, reply, [{ id: "sim_doc", title: "✅ SIM" }, { id: "nao_doc", title: "❌ NÃO" }, { id: "editar_doc", title: "✏️ EDITAR" }]);
        reply = "";
      } else reply = "❌ CPF inválido. Digite os 11 números:";
      break;
    }

    case "editing_doc_rg":
      updates.rg = messageText.trim();
      updates.conversation_step = "confirmando_dados_doc";
      reply = `✅ RG atualizado: *${messageText.trim()}*\n\nOs dados estão corretos agora?`;
      { await sendButtons(remoteJid, reply, [{ id: "sim_doc", title: "✅ SIM" }, { id: "nao_doc", title: "❌ NÃO" }, { id: "editar_doc", title: "✏️ EDITAR" }]); reply = ""; }
      break;

    case "editing_doc_nascimento": {
      const dateMatch = messageText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (dateMatch) {
        updates.data_nascimento = messageText.trim();
        updates.conversation_step = "confirmando_dados_doc";
        reply = `✅ Data atualizada: *${messageText.trim()}*\n\nOs dados estão corretos agora?`;
        await sendButtons(remoteJid, reply, [{ id: "sim_doc", title: "✅ SIM" }, { id: "nao_doc", title: "❌ NÃO" }, { id: "editar_doc", title: "✏️ EDITAR" }]);
        reply = "";
      } else reply = "❌ Data inválida. Use DD/MM/AAAA (ex: 20/07/1993):";
      break;
    }

    // ─── 9. PERGUNTAS MANUAIS ─────────
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
      const txt = (messageText || "").trim();
      const lower = txt.toLowerCase();
      // Permitir pular email com fallback automático
      if (["pular", "skip", "não tenho", "nao tenho", "sem email", "n", "não", "nao"].includes(lower)) {
        updates.email = `${customer.phone_whatsapp}@lead.igreen`;
        console.log(`⏭️ Cliente pulou email — usando fallback ${updates.email}`);
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(txt)) {
        reply = "❌ Não consegui ler esse e-mail.\n\n✅ Exemplo correto: *joao.silva@gmail.com*\n\nOu digite *PULAR* se preferir não informar.";
        break;
      } else {
        updates.email = txt.toLowerCase();
      }
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
      const lower = (messageText || "").toLowerCase().trim();
      const skipWords = ["não", "nao", "n", "pular", "skip", "sem complemento", "sem", "nenhum"];
      if (!skipWords.includes(lower)) {
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

    // ─── 10. DOCUMENTOS MANUAIS ────────
    case "ask_doc_frente_manual": {
      if (!isFile) { reply = "📸 Envie a *FRENTE do seu documento* (RG ou CNH)\n\nFormatos: JPG, PNG ou PDF"; break; }
      if (fileBase64) {
        const mime = imageMessage?.mimetype || documentMessage?.mimetype || "application/octet-stream";
        const minioUrl = await uploadMediaToMinio({
          fileBase64, mimeType: mime, consultantFolder: consultorId, consultantName: nomeRepresentante,
          customerName: customer.name || "cliente", customerBirth: customer.data_nascimento, kind: "doc_frente",
        });
        updates.document_front_url = minioUrl || (fileUrl?.startsWith("http") ? fileUrl : "evolution-media:pending");
      } else {
        updates.document_front_url = fileUrl?.startsWith("http") ? fileUrl : "evolution-media:pending";
      }
      const merged = { ...customer, ...updates };
      const next = await autoResolveCepIfNeeded(merged, updates);
      updates.conversation_step = next;
      reply = getReplyForStep(next, merged);
      break;
    }

    case "ask_doc_verso_manual": {
      if (!isFile) { reply = "📸 Envie o *VERSO do seu documento*\n\nFormatos: JPG, PNG ou PDF"; break; }
      if (fileBase64) {
        const mime = imageMessage?.mimetype || documentMessage?.mimetype || "application/octet-stream";
        const minioUrl = await uploadMediaToMinio({
          fileBase64, mimeType: mime, consultantFolder: consultorId, consultantName: nomeRepresentante,
          customerName: customer.name || "cliente", customerBirth: customer.data_nascimento, kind: "doc_verso",
        });
        updates.document_back_url = minioUrl || (fileUrl?.startsWith("http") ? fileUrl : "evolution-media:pending");
      } else {
        updates.document_back_url = fileUrl?.startsWith("http") ? fileUrl : "evolution-media:pending";
      }
      const merged = { ...customer, ...updates };
      const next = await autoResolveCepIfNeeded(merged, updates);
      updates.conversation_step = next;
      reply = getReplyForStep(next, merged);
      break;
    }

    // ─── 11. CONFIRMAR FINALIZAR ────────
    case "ask_finalizar": {
      const resp = isButton ? buttonId : messageText.toLowerCase().trim();
      const finalizar = resp === "btn_finalizar" || resp === "1" || resp === "finalizar" || resp === "sim" || resp === "s";
      if (finalizar) { updates.conversation_step = "finalizando"; reply = ""; }
      else {
        const sent = await sendButtons(remoteJid, "📋 Todos os dados foram preenchidos!\n\nDeseja finalizar o cadastro?", [
          { id: "btn_finalizar", title: "✅ Finalizar" },
        ]);
        if (!sent) reply = "Digite *FINALIZAR* ou *1* para confirmar o cadastro:";
      }
      break;
    }

    case "portal_submitting": {
      reply = "⏳ Estamos processando seu cadastro no portal...\n\n📱 Em breve você receberá um *código de verificação no WhatsApp*. Quando receber, *digite aqui*!\n\nAguarde alguns instantes...";
      break;
    }

    case "aguardando_otp": {
      const otpCode = messageText.replace(/\D/g, "");
      if (otpCode.length >= 4 && otpCode.length <= 8) {
        updates.otp_code = otpCode;
        updates.otp_received_at = new Date().toISOString();
        reply = `✅ Código *${otpCode}* recebido! ⏳ Validando no portal...\n\nEm instantes vou te enviar o link da *validação facial* (última etapa).`;
      } else {
        reply = "📱 Por favor, digite o *código numérico* que você recebeu no WhatsApp.\n\n(Geralmente são 4 a 6 dígitos)";
      }
      break;
    }

    case "validando_otp": {
      reply = "⏳ Estamos validando seu código no portal. Aguarde um momento...\n\nSe já passou mais de 2 minutos, digite o código novamente.";
      break;
    }

    case "aguardando_facial":
    case "aguardando_assinatura": {
      const link = customer.link_facial || customer.link_assinatura;
      const txt = (messageText || "").toLowerCase().trim();
      const confirmou = /\b(pronto|prontinho|conclu[ií]do|conclui|conclu[ií]|finalizei|terminei|fiz|feito|ok|certo|sim)\b/.test(txt);
      if (confirmou && link) {
        updates.facial_confirmed_at = new Date().toISOString();
        updates.conversation_step = "complete";
        updates.status = "cadastro_concluido";
        reply = "🎉 *Cadastro concluído com sucesso!*\n\nRecebemos a confirmação da sua validação facial. ✅\n\nEm breve você receberá os próximos passos da iGreen Energy. Obrigado por confiar em nós! ☀️💚";
      } else if (link) {
        reply = "📸 *Última etapa: Validação Facial*\n\n👉 Abra este link no seu celular e siga as instruções:\n" + `${link}\n\n` + "Quando terminar a selfie, me responda *PRONTO* aqui que finalizamos seu cadastro! ✅";
      } else {
        reply = "⏳ Estamos preparando o link da validação facial. Você será notificado em instantes!";
      }
      break;
    }

    case "complete": {
      reply = "✅ Seus dados já foram registrados! Se precisar de algo, um consultor entrará em contato. ☀️";
      break;
    }

    default: {
      console.warn(`⚠️ Step desconhecido: ${step} — resetando para aguardando_conta`);
      if (step?.startsWith("editing_")) {
        reply = "❌ Opção inválida. Digite novamente:";
      } else {
        updates.conversation_step = "aguardando_conta";
        reply = `👋 Olá! Eu sou o assistente de *${nomeRepresentante}* em parceria com a *iGreen Energy*!\n\n📸 *Envie uma FOTO ou PDF da sua conta de energia* para começarmos!\n\nFormatos aceitos: JPG, PNG ou PDF`;
      }
      break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // AUTO-FINALIZAÇÃO (BLOCO ESPECIAL — extraído verbatim do index.ts antigo)
  // ═══════════════════════════════════════════════════════════════════
  if (updates.conversation_step === "finalizando") {
    const merged = { ...customer, ...updates };
    const validation = validateCustomerForPortal(merged);
    if (!validation.valid) {
      logStructured("warn", "validation_failed", {
        customer_id: customer.id, step: "finalizando", errors: validation.errors,
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
      if (saveError) console.error(`❌ ERRO ao salvar updates antes do portal:`, saveError);

      await sendText(remoteJid,
        "✅ *Todos os dados coletados com sucesso!* 🎉\n\n" +
        "⏳ Estamos processando seu cadastro no portal...\n\n" +
        "📱 Em breve você receberá um *código de verificação no WhatsApp*. Quando receber, *digite aqui*!\n\n" +
        "Obrigado pela confiança! ☀️🌱"
      );

      console.log(`✅ Lead completo: ${merged.name} (${merged.id}) - disparando worker-portal`);

      const { data: settingsRows } = await supabase.from("settings").select("*");
      const settings: Record<string, string> = {};
      settingsRows?.forEach((s: any) => { settings[s.key] = s.value; });

      const portalWorkerUrl = (settings.portal_worker_url || Deno.env.get("PORTAL_WORKER_URL") || "").replace(/\/$/, "");
      const workerSecret = settings.worker_secret || settings.portal_worker_secret || Deno.env.get("WORKER_SECRET") || "";

      if (portalWorkerUrl && workerSecret) {
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
          try {
            logStructured("info", "lead_complete", { customer_id: customer.id, step: "data_complete", worker: "dispatching" });
            await withRetry(
              async () => {
                const portalRes = await fetchInsecure(`${portalWorkerUrl}/submit-lead`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${workerSecret}` },
                  body: JSON.stringify({ customer_id: customer.id }),
                  timeout: 25_000,
                });
                const portalData = await portalRes.text();
                console.log(`📡 Worker-portal resposta (${portalRes.status}): ${portalData.substring(0, 200)}`);
                if (!portalRes.ok) {
                  logStructured("warn", "worker_portal_error", { customer_id: customer.id, status: portalRes.status, body: portalData.substring(0, 150) });
                  throw new Error(`Worker ${portalRes.status}: ${portalData.substring(0, 100)}`);
                }
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

      // Updates ja foram salvos acima — limpar para o caller nao salvar de novo
      for (const k of Object.keys(updates)) delete updates[k];
      reply = "";
    }
  }

  return { reply, updates };
}
