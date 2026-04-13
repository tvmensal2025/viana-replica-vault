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

  // Get all instances from our DB
  const { data: dbInstances } = await supabase
    .from("whatsapp_instances")
    .select("instance_name, consultant_id, connected_phone");

  const results: any[] = [];

  for (const dbInst of (dbInstances || [])) {
    if (dbInst.connected_phone) {
      results.push({ instance: dbInst.instance_name, phone: dbInst.connected_phone, already_set: true });
      continue;
    }

    // Try to get instance details from Evolution API
    try {
      const res = await fetch(`${evolutionUrl}/instance/connectionState/${dbInst.instance_name}`, {
        headers: { "Content-Type": "application/json", apikey: evolutionKey },
      });
      const stateData = await res.json();
      
      // Also try fetchInstances with instance filter
      const res2 = await fetch(`${evolutionUrl}/instance/fetchInstances?instanceName=${dbInst.instance_name}`, {
        headers: { "Content-Type": "application/json", apikey: evolutionKey },
      });
      const instanceData = await res2.json();
      
      results.push({ 
        instance: dbInst.instance_name, 
        state: stateData,
        instanceDetails: JSON.stringify(instanceData).substring(0, 500),
      });
    } catch (e: any) {
      results.push({ instance: dbInst.instance_name, error: e?.message });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
