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

async function sendEvolutionText(
  instanceName: string,
  phone: string,
  text: string,
  apiUrl: string,
  apiKey: string
) {
  const res = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number: phone, text }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("Evolution sendText error:", err);
  }
}

async function sendEvolutionMedia(
  instanceName: string,
  phone: string,
  mediaUrl: string,
  caption: string,
  mediatype: "image" | "video" | "document",
  apiUrl: string,
  apiKey: string
) {
  const res = await fetch(`${apiUrl}/message/sendMedia/${instanceName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number: phone, mediatype, media: mediaUrl, caption }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("Evolution sendMedia error:", err);
  }
}

async function sendEvolutionAudio(
  instanceName: string,
  phone: string,
  audioUrl: string,
  apiUrl: string,
  apiKey: string
) {
  const res = await fetch(`${apiUrl}/message/sendWhatsAppAudio/${instanceName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number: phone, audio: audioUrl }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("Evolution sendAudio error:", err);
  }
}

async function sendAutoMessage(
  instanceName: string,
  phone: string,
  stageData: {
    auto_message_type: string | null;
    auto_message_text: string | null;
    auto_message_media_url: string | null;
    auto_message_image_url: string | null;
    label: string;
  },
  apiUrl: string,
  apiKey: string
) {
  const messageText = (stageData.auto_message_text || "")
    .replace(/\{\{nome\}\}/g, phone)
    .replace(/\{\{telefone\}\}/g, phone);

  // Send optional image first (sent before the main message)
  if (stageData.auto_message_image_url) {
    await sendEvolutionMedia(instanceName, phone, stageData.auto_message_image_url, "", "image", apiUrl, apiKey);
  }

  const msgType = stageData.auto_message_type || "text";

  if (msgType === "audio" && stageData.auto_message_media_url) {
    await sendEvolutionAudio(instanceName, phone, stageData.auto_message_media_url, apiUrl, apiKey);
    if (messageText) {
      await sendEvolutionText(instanceName, phone, messageText, apiUrl, apiKey);
    }
  } else if (msgType === "image" && stageData.auto_message_media_url) {
    await sendEvolutionMedia(instanceName, phone, stageData.auto_message_media_url, messageText, "image", apiUrl, apiKey);
  } else if (msgType === "video" && stageData.auto_message_media_url) {
    await sendEvolutionMedia(instanceName, phone, stageData.auto_message_media_url, messageText, "video", apiUrl, apiKey);
  } else {
    await sendEvolutionText(instanceName, phone, messageText, apiUrl, apiKey);
  }

  console.log(`Auto-message sent to ${phone} for stage ${stageData.label} (type: ${msgType})`);
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

      // Send auto-message if enabled (supports text, audio, image, video)
      if (
        stageData.auto_message_enabled &&
        stageData.auto_message_text &&
        deal.remote_jid &&
        evolutionUrl &&
        evolutionKey
      ) {
        const { data: instance } = await supabase
          .from("whatsapp_instances")
          .select("instance_name")
          .eq("consultant_id", deal.consultant_id)
          .limit(1)
          .single();

        if (instance) {
          const phone = deal.remote_jid.split("@")[0];
          await sendAutoMessage(instance.instance_name, phone, stageData, evolutionUrl, evolutionKey);
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
