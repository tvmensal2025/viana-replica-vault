import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Stage progression map: days since approval -> stage_key
const PROGRESSION = [
  { days: 30, stage_key: "30_dias" },
  { days: 60, stage_key: "60_dias" },
  { days: 90, stage_key: "90_dias" },
  { days: 120, stage_key: "120_dias" },
];

async function sendEvolutionMessage(
  instanceName: string,
  phone: string,
  text: string,
  apiUrl: string,
  apiKey: string
) {
  const res = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({
      number: phone,
      text,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("Evolution API error:", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
    const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all approved deals with approved_at set
    const { data: deals, error: dealsErr } = await supabase
      .from("crm_deals")
      .select("*")
      .eq("stage", "aprovado")
      .not("approved_at", "is", null);

    if (dealsErr) throw dealsErr;
    if (!deals || deals.length === 0) {
      return new Response(JSON.stringify({ moved: 0, message: "No deals to progress" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Also check deals in 30/60/90 that should progress further
    const { data: progressDeals } = await supabase
      .from("crm_deals")
      .select("*")
      .in("stage", ["30_dias", "60_dias", "90_dias"])
      .not("approved_at", "is", null);

    const allDeals = [...(deals || []), ...(progressDeals || [])];
    const now = Date.now();
    let movedCount = 0;

    for (const deal of allDeals) {
      const approvedAt = new Date(deal.approved_at).getTime();
      const daysSinceApproval = Math.floor((now - approvedAt) / (1000 * 60 * 60 * 24));

      // Find the highest progression stage this deal qualifies for
      let targetStageKey: string | null = null;
      for (let i = PROGRESSION.length - 1; i >= 0; i--) {
        if (daysSinceApproval >= PROGRESSION[i].days) {
          targetStageKey = PROGRESSION[i].stage_key;
          break;
        }
      }

      if (!targetStageKey || targetStageKey === deal.stage) continue;

      // Check if the target stage exists for this consultant
      const { data: stageData } = await supabase
        .from("kanban_stages")
        .select("*")
        .eq("consultant_id", deal.consultant_id)
        .eq("stage_key", targetStageKey)
        .single();

      if (!stageData) continue;

      // Move the deal
      const { error: updateErr } = await supabase
        .from("crm_deals")
        .update({ stage: targetStageKey })
        .eq("id", deal.id);

      if (updateErr) {
        console.error("Failed to move deal:", deal.id, updateErr);
        continue;
      }

      movedCount++;

      // Send auto-message if enabled
      if (
        stageData.auto_message_enabled &&
        stageData.auto_message_text &&
        deal.remote_jid &&
        evolutionUrl &&
        evolutionKey
      ) {
        // Get the instance name for this consultant
        const { data: instance } = await supabase
          .from("whatsapp_instances")
          .select("instance_name")
          .eq("consultant_id", deal.consultant_id)
          .limit(1)
          .single();

        if (instance) {
          const phone = deal.remote_jid.split("@")[0];
          const messageText = stageData.auto_message_text
            .replace(/\{\{nome\}\}/g, phone)
            .replace(/\{\{telefone\}\}/g, phone);

          await sendEvolutionMessage(
            instance.instance_name,
            phone,
            messageText,
            evolutionUrl,
            evolutionKey
          );
          console.log(`Auto-message sent to ${phone} for stage ${targetStageKey}`);
        }
      }
    }

    return new Response(
      JSON.stringify({ moved: movedCount, checked: allDeals.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
