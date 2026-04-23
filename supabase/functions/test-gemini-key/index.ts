// Edge function temporária para validar GEMINI_API_KEY
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) {
    return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY missing' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Responda apenas: OK' }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 10 }
      })
    }
  );
  const data = await r.json();
  return new Response(JSON.stringify({
    ok: r.ok && !data.error,
    status: r.status,
    keyPrefix: key.slice(0, 10),
    text: data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null,
    error: data?.error ?? null,
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
