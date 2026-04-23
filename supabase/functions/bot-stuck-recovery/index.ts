// Bot Stuck Recovery — cron a cada 30 min.
// Detecta leads que pararam de receber resposta há > 5 min em steps "esperando ação do cliente"
// e re-envia a última pergunta para reabrir a conversa.
// Não toca em leads que já estão em fases finais (worker/portal/OTP/facial/complete).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createEvolutionSender } from "../_shared/evolution-api.ts";
import { getReplyForStep } from "../_shared/conversation-helpers.ts";
import { captureError } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STUCK_MINUTES = 5;
const MAX_RESCUES_PER_RUN = 50;

// Steps onde faz sentido re-perguntar. Steps técnicos (portal/otp/facial) NÃO entram.
const RESCUABLE_STEPS = new Set([
  "welcome", "menu_inicial", "pos_video",
  "aguardando_conta", "confirmando_dados_conta",
  "ask_tipo_documento", "aguardando_doc_frente", "aguardando_doc_verso",
  "confirmando_dados_doc",
  "ask_name", "ask_cpf", "ask_rg", "ask_birth_date",
  "ask_phone_confirm", "ask_phone", "ask_email",
  "ask_cep", "ask_number", "ask_complement",
  "ask_installation_number", "ask_bill_value",
  "ask_doc_frente_manual", "ask_doc_verso_manual",
  "ask_finalizar",
  "editing_conta_menu", "editing_conta_nome", "editing_conta_endereco",
  "editing_conta_cep", "editing_conta_distribuidora", "editing_conta_instalacao",
  "editing_conta_valor",
  "editing_doc_menu", "editing_doc_nome", "editing_doc_cpf",
  "editing_doc_rg", "editing_doc_nascimento",
]);

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();
  const stats = { scanned: 0, rescued: 0, skipped: 0, errors: 0 };

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Evolution API não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cutoff = new Date(Date.now() - STUCK_MINUTES * 60_000).toISOString();

    // Busca leads parados
    const { data: stuck, error } = await supabase
      .from("customers")
      .select("id, phone_whatsapp, consultant_id, conversation_step, last_bot_reply_at, name")
      .lt("last_bot_reply_at", cutoff)
      .not("status", "in", "(complete,cadastro_concluido,portal_submitting,registered_igreen)")
      .order("last_bot_reply_at", { ascending: true })
      .limit(MAX_RESCUES_PER_RUN);

    if (error) {
      captureError(error as any, { tags: { function: "bot-stuck-recovery", kind: "query_failed" } });
      throw error;
    }

    stats.scanned = stuck?.length || 0;
    console.log(`🔍 ${stats.scanned} leads candidatos a rescue (cutoff: ${cutoff})`);

    // Mapa: consultant_id -> instance_name (cache)
    const instanceCache = new Map<string, string>();
    async function getInstanceName(consultantId: string): Promise<string | null> {
      if (instanceCache.has(consultantId)) return instanceCache.get(consultantId)!;
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("instance_name")
        .eq("consultant_id", consultantId)
        .maybeSingle();
      const name = data?.instance_name || null;
      if (name) instanceCache.set(consultantId, name);
      return name;
    }

    for (const lead of stuck || []) {
      const step = lead.conversation_step || "";
      if (!RESCUABLE_STEPS.has(step)) {
        stats.skipped++;
        continue;
      }
      if (!lead.consultant_id) {
        stats.skipped++;
        continue;
      }

      try {
        const instanceName = await getInstanceName(lead.consultant_id);
        if (!instanceName) {
          stats.skipped++;
          continue;
        }

        const sender = createEvolutionSender(EVOLUTION_API_URL, EVOLUTION_API_KEY, instanceName);
        const remoteJid = `${lead.phone_whatsapp}@s.whatsapp.net`;

        // Buscar dados completos do customer para gerar reply correto
        const { data: full } = await supabase
          .from("customers")
          .select("*")
          .eq("id", lead.id)
          .single();

        const baseReply = getReplyForStep(step, full || lead);
        const rescueMsg = `👋 Oi${lead.name ? `, ${String(lead.name).split(" ")[0]}` : ""}! Estamos por aqui esperando você.\n\n${baseReply}`;

        const sent = await sender.sendText(remoteJid, rescueMsg);
        if (sent) {
          stats.rescued++;
          await supabase
            .from("customers")
            .update({ last_bot_reply_at: new Date().toISOString() })
            .eq("id", lead.id);
          await supabase.from("conversations").insert({
            customer_id: lead.id,
            message_direction: "outbound",
            message_text: rescueMsg,
            message_type: "text",
            conversation_step: step,
          });
          console.log(`✅ Rescued ${lead.id} (step: ${step})`);
        } else {
          stats.errors++;
        }
      } catch (e: any) {
        stats.errors++;
        console.error(`❌ Rescue failed for ${lead.id}:`, e?.message);
        captureError(e, {
          tags: { function: "bot-stuck-recovery", kind: "rescue_failed" },
          extra: { customer_id: lead.id, step },
        });
      }
    }

    const duration = Date.now() - startedAt;
    console.log(`📊 Rescue done in ${duration}ms:`, stats);
    return new Response(
      JSON.stringify({ ok: true, duration_ms: duration, ...stats }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Bot rescue error:", err);
    captureError(err, { tags: { function: "bot-stuck-recovery" } });
    return new Response(JSON.stringify({ error: String(err?.message || err), stats }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});