import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ProxyRequest {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
}

function normalizeEvolutionBaseUrl(rawUrl: string | undefined): string {
  const sanitized = (rawUrl || "")
    .trim()
    .replace(/\/manager\/?$/i, "")
    .replace(/\/+$/g, "");

  if (!sanitized) return "";

  if (sanitized.startsWith("http://")) {
    return `https://${sanitized.slice("http://".length)}`;
  }

  return sanitized;
}

function getTimeoutMs(path: string): number {
  if (path.startsWith("instance/connectionState/")) return 12000;
  if (path === "instance/fetchInstances") return 15000;
  return 55000;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const evolutionUrlRaw = Deno.env.get("EVOLUTION_API_URL");
    const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");
    const evolutionUrl = normalizeEvolutionBaseUrl(evolutionUrlRaw);

    console.log("[evolution-proxy] EVOLUTION_API_URL(raw):", evolutionUrlRaw ? evolutionUrlRaw.substring(0, 60) : "NOT SET");
    console.log("[evolution-proxy] EVOLUTION_API_URL(normalized):", evolutionUrl ? evolutionUrl.substring(0, 60) : "NOT SET");
    console.log("[evolution-proxy] EVOLUTION_API_KEY configured:", !!evolutionKey);

    if (!evolutionUrl || !evolutionKey) {
      return new Response(
        JSON.stringify({ error: "Configuração do serviço de conexão incompleta." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Token de autenticação inválido ou ausente" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.log("[evolution-proxy] Auth failed:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Token de autenticação inválido ou ausente" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[evolution-proxy] Auth OK, user:", user.id);

    let payload: ProxyRequest;
    try {
      payload = (await req.json()) as ProxyRequest;
    } catch {
      return new Response(
        JSON.stringify({ error: "Body JSON inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { path, method, body } = payload;

    if (!path) {
      return new Response(
        JSON.stringify({ error: "Campo 'path' é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const safePath = path.replace(/^\/+/, "");
    const targetUrl = `${evolutionUrl}/${safePath}`;
    const timeoutMs = getTimeoutMs(safePath);

    console.log("[evolution-proxy] ->", method || "GET", targetUrl, `(timeout=${timeoutMs}ms)`);

    const fetchOptions: RequestInit = {
      method: method || "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: evolutionKey,
      },
    };

    if (body && (method === "POST" || method === "PUT")) {
      fetchOptions.body = JSON.stringify(body);
    }

    let evolutionResponse: Response;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      evolutionResponse = await fetch(targetUrl, {
        ...fetchOptions,
        signal: controller.signal,
      });
    } catch (networkError) {
      if (networkError instanceof DOMException && networkError.name === "AbortError") {
        console.error(`[evolution-proxy] Timeout after ${timeoutMs}ms for ${method || "GET"} ${targetUrl}`);
        return new Response(
          JSON.stringify({ error: "O serviço de conexão demorou para responder. Tente novamente." }),
          { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.error("[evolution-proxy] Network error connecting to service", networkError);
      return new Response(
        JSON.stringify({ error: "Erro ao conectar com o serviço de conexão" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const responseBody = await evolutionResponse.text();
    console.log("[evolution-proxy] <-", evolutionResponse.status, responseBody.substring(0, 300));

    return new Response(responseBody, {
      status: evolutionResponse.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("evolution-proxy error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});