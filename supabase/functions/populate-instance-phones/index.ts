import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const evolutionUrl = (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/+$/, "");
  const evolutionKey = Deno.env.get("EVOLUTION_API_KEY") || "";

  if (!evolutionUrl || !evolutionKey) {
    return new Response(JSON.stringify({ error: "Evolution API not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch all instances from Evolution API
  const res = await fetch(`${evolutionUrl}/instance/fetchInstances`, {
    headers: { "Content-Type": "application/json", apikey: evolutionKey },
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: "Failed to fetch instances", status: res.status }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const instances = await res.json();
  const results: any[] = [];

  for (const inst of instances) {
    const name = inst?.instance?.instanceName || inst?.instanceName;
    const owner = inst?.instance?.owner || inst?.owner || "";
    const phone = owner.replace(/@.*$/, "");

    if (name && phone) {
      const { error } = await supabase
        .from("whatsapp_instances")
        .update({ connected_phone: phone })
        .eq("instance_name", name);

      results.push({ instance: name, phone, saved: !error, error: error?.message });
    } else {
      results.push({ instance: name, phone: null, skipped: true });
    }
  }

  return new Response(JSON.stringify({ results, total: instances.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
