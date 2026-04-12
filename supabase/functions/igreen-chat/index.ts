import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FALLBACK_KNOWLEDGE = "Você é a assistente virtual da iGreen Energy. Responda em português brasileiro de forma simpática, objetiva e útil.";
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

interface IncomingMessage {
  role?: string;
  text?: string;
}

async function loadKnowledge(supabaseUrl: string, supabaseKey: string): Promise<string> {
  let baseKnowledge = FALLBACK_KNOWLEDGE;
  let extraKnowledge = "";
  let coverageData = "";

  try {
    if (!supabaseUrl || !supabaseKey) return baseKnowledge;
    const sb = createClient(supabaseUrl, supabaseKey);

    const { data: sections } = await sb
      .from("ai_knowledge_sections")
      .select("title, content")
      .eq("is_active", true)
      .order("position", { ascending: true });

    if (sections && sections.length > 0) {
      baseKnowledge = sections
        .map((s: { title: string; content: string }) =>
          `==========================================================\n${s.title}\n==========================================================\n\n${s.content}`,
        )
        .join("\n\n");
    }

    const { data: extraData } = await sb
      .from("settings")
      .select("value")
      .eq("key", "ai_knowledge_extra")
      .maybeSingle();

    if (extraData?.value) {
      extraKnowledge = `\n\n==========================================================\nCONHECIMENTO EXTRA (atualizado pelo administrador)\n==========================================================\n\n${extraData.value}`;
    }

    const { data: coverageRows } = await sb.rpc("get_coverage_summary" as never);
    if (coverageRows && Array.isArray(coverageRows) && coverageRows.length > 0) {
      const lines = (coverageRows as Array<Record<string, unknown>>).map(
        (r) =>
          `- ${String(r.distribuidora)} | ${String(r.uf)} | Cidades confirmadas: ${String(r.cidades)} (${String(r.total_clientes)} clientes ativos)`,
      );
      coverageData = `\n\n==========================================================\nDADOS REAIS DE COBERTURA (fonte: banco de dados atualizado)\n==========================================================\n\nEstas são as distribuidoras e cidades onde a iGreen TEM clientes ativos confirmados:\n\n${lines.join("\n")}`;
    } else {
      const { data: rawCoverage } = await sb
        .from("customers")
        .select("distribuidora, address_state, address_city")
        .not("distribuidora", "is", null)
        .not("address_state", "is", null)
        .eq("status", "active");

      if (rawCoverage && rawCoverage.length > 0) {
        const coverageMap = new Map<string, { cities: Set<string>; count: number }>();

        for (const c of rawCoverage) {
          const key = `${c.distribuidora}|${c.address_state}`;
          if (!coverageMap.has(key)) coverageMap.set(key, { cities: new Set(), count: 0 });
          const entry = coverageMap.get(key)!;
          if (c.address_city) entry.cities.add(c.address_city);
          entry.count++;
        }

        const lines: string[] = [];
        for (const [key, val] of coverageMap.entries()) {
          const [dist, uf] = key.split("|");
          const cityList = [...val.cities].sort().slice(0, 20).join(", ");
          lines.push(`- ${dist} | ${uf} | Cidades: ${cityList} (${val.count} clientes)`);
        }

        if (lines.length > 0) {
          coverageData = `\n\n==========================================================\nDADOS REAIS DE COBERTURA (fonte: banco de dados atualizado)\n==========================================================\n\nEstas são as distribuidoras e cidades onde a iGreen TEM clientes ativos confirmados:\n\n${lines.join("\n")}`;
        }
      }
    }
  } catch (error) {
    console.error("Failed to load knowledge:", error);
  }

  return baseKnowledge + extraKnowledge + coverageData;
}

function normalizeHistory(history: IncomingMessage[] | undefined) {
  if (!Array.isArray(history)) return [];

  return history
    .slice(-14)
    .filter((msg) => typeof msg?.text === "string" && msg.text.trim().length > 0)
    .map((msg) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.text!.trim(),
    }));
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, history } = await req.json();

    if (!message || typeof message !== "string") {
      return jsonResponse({ error: "message is required" }, 400);
    }

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return jsonResponse({
        reply: "Desculpe, o assistente está temporariamente indisponível. Tente novamente em instantes. 💚",
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const fullKnowledge = await loadKnowledge(supabaseUrl, supabaseKey);

    const messages = [
      {
        role: "system",
        content:
          `${fullKnowledge}\n\n` +
          "INSTRUÇÕES DE RESPOSTA:\n" +
          "- Responda sempre em português do Brasil.\n" +
          "- Seja clara, simpática e objetiva.\n" +
          "- Use markdown quando isso melhorar a leitura.\n" +
          "- Se a resposta não estiver no conhecimento disponível, diga isso com honestidade e sugira falar com um consultor iGreen.\n" +
          "- Nunca invente números, regras, comissões ou coberturas.",
      },
      ...normalizeHistory(history),
      { role: "user", content: message.trim() },
    ];

    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        temperature: 0.4,
        max_tokens: 1200,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("Lovable AI gateway error:", aiResponse.status, errorText);

      if (aiResponse.status === 429) {
        return jsonResponse({
          reply: "O assistente está recebendo muitas solicitações agora. Tente novamente em alguns instantes. 💚",
          error_code: 429,
        });
      }

      if (aiResponse.status === 402) {
        return jsonResponse({
          reply: "O assistente está temporariamente indisponível por limite de créditos da IA. 💚",
          error_code: 402,
        });
      }

      return jsonResponse({
        reply: "Desculpe, não consegui processar sua pergunta agora. Tente novamente em instantes. 💚",
        error_code: aiResponse.status,
      });
    }

    const data = await aiResponse.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    return jsonResponse({
      reply: reply || "Desculpe, não entendi. Pode reformular? 😊",
    });
  } catch (error) {
    console.error("Chat error:", error);
    return jsonResponse({
      reply: "Ocorreu um erro. Tente novamente. 💚",
    });
  }
});
