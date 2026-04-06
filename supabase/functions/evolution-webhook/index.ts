import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    const event = payload.event;

    // Only process incoming messages
    if (event !== "messages.upsert") {
      return new Response(JSON.stringify({ ignored: true, event }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instanceName = payload.instance;
    if (!instanceName) {
      return new Response(JSON.stringify({ error: "No instance in payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find consultant by instance name
    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("consultant_id")
      .eq("instance_name", instanceName)
      .limit(1)
      .maybeSingle();

    if (!instance) {
      return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messages = payload.data || [];
    let saved = 0;

    for (const msg of Array.isArray(messages) ? messages : [messages]) {
      const key = msg.key;
      if (!key || key.fromMe) continue; // skip outbound

      const remoteJid = key.remoteJid;
      if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") continue;

      const phone = remoteJid.split("@")[0];
      const messageContent = msg.message;
      const text =
        messageContent?.conversation ||
        messageContent?.extendedTextMessage?.text ||
        messageContent?.imageMessage?.caption ||
        (messageContent?.imageMessage ? "📷 Imagem" : "") ||
        (messageContent?.audioMessage ? "🎵 Áudio" : "") ||
        (messageContent?.documentMessage?.fileName || "") ||
        "";

      if (!text) continue;

      // Find or create customer
      const { data: customer } = await supabase
        .from("customers")
        .select("id")
        .eq("phone_whatsapp", phone)
        .eq("consultant_id", instance.consultant_id)
        .limit(1)
        .maybeSingle();

      let customerId = customer?.id;
      if (!customerId) {
        const { data: newCustomer } = await supabase
          .from("customers")
          .insert({
            phone_whatsapp: phone,
            consultant_id: instance.consultant_id,
            name: msg.pushName || null,
            status: "lead",
          })
          .select("id")
          .single();
        customerId = newCustomer?.id;
      }

      if (customerId) {
        await supabase.from("conversations").insert({
          customer_id: customerId,
          message_direction: "inbound",
          message_text: text,
          message_type: "text",
        });
        saved++;
      }
    }

    return new Response(
      JSON.stringify({ saved, instance: instanceName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
