import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FALLBACK_KNOWLEDGE = "Você é a assistente virtual da iGreen Energy. Responda em português brasileiro de forma simpática e objetiva.";

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
      baseKnowledge = sections.map((s: { title: string; content: string }) =>
        `==========================================================\n${s.title}\n==========================================================\n\n${s.content}`
      ).join("\n\n");
    }

    const { data: extraData } = await sb.from("settings").select("value").eq("key", "ai_knowledge_extra").maybeSingle();
    if (extraData?.value) {
      extraKnowledge = `\n\n==========================================================\nCONHECIMENTO EXTRA (atualizado pelo administrador)\n==========================================================\n\n${extraData.value}`;
    }

    const { data: coverageRows } = await sb.rpc("get_coverage_summary" as any);
    if (coverageRows && Array.isArray(coverageRows) && coverageRows.length > 0) {
      const lines = (coverageRows as any[]).map((r: any) =>
        `- ${r.distribuidora} | ${r.uf} | Cidades confirmadas: ${r.cidades} (${r.total_clientes} clientes ativos)`
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
  } catch (e) {
    console.error("Failed to load knowledge:", e);
  }

  return baseKnowledge + extraKnowledge + coverageData;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, history, stream } = await req.json();
    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ reply: "Desculpe, o assistente está temporariamente indisponível. Entre em contato pelo WhatsApp do consultor. 💚" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const fullKnowledge = await loadKnowledge(supabaseUrl, supabaseKey);

    const contents = [];
    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-14)) {
        contents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.text }],
        });
      }
    }
    contents.push({ role: "user", parts: [{ text: message }] });

    // Streaming mode
    if (stream) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: fullKnowledge }] },
            contents,
            generationConfig: { temperature: 0.4, maxOutputTokens: 1500, topP: 0.85 },
          }),
        }
      );

      if (!res.ok) {
        const errorBody = await res.text();
        console.error("Gemini streaming error:", res.status, errorBody);
        return new Response(
          JSON.stringify({ reply: "Desculpe, não consegui processar sua pergunta agora. Tente novamente em instantes. 💚" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(res.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }

    // Non-streaming mode (fallback)
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: fullKnowledge }] },
          contents,
          generationConfig: { temperature: 0.4, maxOutputTokens: 1500, topP: 0.85 },
        }),
      }
    );

    if (!res.ok) {
      const errorBody = await res.text();
      console.error("Gemini API error:", res.status, errorBody);
      return new Response(
        JSON.stringify({ reply: "Desculpe, não consegui processar sua pergunta agora. Tente novamente em instantes. 💚" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, não entendi. Pode reformular? 😊";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({ reply: "Ocorreu um erro. Tente novamente. 💚" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
