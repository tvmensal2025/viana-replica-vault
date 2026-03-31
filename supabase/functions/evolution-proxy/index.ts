import { createClient } from "npm:@supabase/supabase-js@2.100.1";

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
  if (path.startsWith("instance/connectionState/")) return 15000;
  if (path === "instance/fetchInstances") return 15000;
  if (path.startsWith("instance/connect/")) return 20000;
  if (path === "instance/create") return 30000;
  if (path.startsWith("chat/findChats/")) return 25000;
  if (path.startsWith("chat/findMessages/")) return 25000;
  if (path.startsWith("message/")) return 20000;
  return 20000;
}

function getMaxAttempts(path: string): number {
  if (path.startsWith("instance/connectionState/")) return 2;
  if (path.startsWith("instance/connect/")) return 2;
  if (path === "instance/create") return 1;
  if (path === "instance/fetchInstances") return 2;
  return 1;
}

function getRetryDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt - 1), 5000);
}

function isRetriableResponseStatus(status: number): boolean {
  return status === 408 || status === 546 || status === 502 || status === 503 || status === 504;
}

function createGracefulTimeoutResponse(safePath: string): Response | null {
  if (safePath.startsWith("instance/connectionState/")) {
    return new Response(JSON.stringify({ state: "connecting", timeout: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (safePath === "instance/fetchInstances") {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (safePath.startsWith("instance/connect/")) {
    return new Response(JSON.stringify({ base64: null, timeout: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (safePath === "instance/create") {
    return new Response(JSON.stringify({ instance: { instanceName: "" }, timeout: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Avatar fetches are non-critical — return graceful null instead of 504
  if (safePath.startsWith("chat/fetchProfilePictureUrl/")) {
    return new Response(JSON.stringify({ profilePictureUrl: null, timeout: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}

async function fetchWithTimeout(
  targetUrl: string,
  fetchOptions: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(targetUrl, {
      ...fetchOptions,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function proxyToEvolution(
  safePath: string,
  method: string,
  targetUrl: string,
  fetchOptions: RequestInit,
): Promise<Response> {
  const timeoutMs = getTimeoutMs(safePath);
  const attempts = getMaxAttempts(safePath);

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    console.log(
      "[evolution-proxy] ->",
      method || "GET",
      targetUrl,
      `(timeout=${timeoutMs}ms, attempt=${attempt}/${attempts})`,
    );

    try {
      const response = await fetchWithTimeout(targetUrl, fetchOptions, timeoutMs);
      if (isRetriableResponseStatus(response.status)) {
        const bodyPreview = await response.text();
        console.warn(
          `[evolution-proxy] Retriable status ${response.status} on attempt ${attempt}: ${bodyPreview.substring(0, 200)}`,
        );

        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, getRetryDelay(attempt)));
          continue;
        }

        const gracefulResponse = createGracefulTimeoutResponse(safePath);
        if (gracefulResponse) {
          return gracefulResponse;
        }

        return new Response(bodyPreview, {
          status: response.status,
          headers: {
            "Content-Type": response.headers.get("Content-Type") || "application/json",
          },
        });
      }
      return response;
    } catch (networkError) {
      lastError = networkError;

      if (networkError instanceof DOMException && networkError.name === "AbortError") {
        console.error(
          `[evolution-proxy] Timeout after ${timeoutMs}ms for ${method || "GET"} ${targetUrl} (attempt ${attempt}/${attempts})`,
        );

        const gracefulResponse = createGracefulTimeoutResponse(safePath);
        if (gracefulResponse) {
          return gracefulResponse;
        }

        if (attempt < attempts) {
          const delay = getRetryDelay(attempt);
          console.log(`[evolution-proxy] Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Final attempt timeout — return a clear error instead of throwing
        console.error(`[evolution-proxy] All ${attempts} attempts exhausted for ${safePath}`);
        return new Response(
          JSON.stringify({
            error: "O servidor WhatsApp está demorando para responder. Tente novamente em alguns instantes.",
            timeout: true,
          }),
          { status: 504, headers: { "Content-Type": "application/json" } },
        );
      }

      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, getRetryDelay(attempt)));
        continue;
      }

      throw networkError;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown proxy error");
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
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Token de autenticação inválido ou ausente" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[evolution-proxy] Auth OK, user:", user.id);

    let payload: ProxyRequest;
    try {
      payload = (await req.json()) as ProxyRequest;
    } catch {
      return new Response(
        JSON.stringify({ error: "Body JSON inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { path, method, body } = payload;

    if (!path) {
      return new Response(
        JSON.stringify({ error: "Campo 'path' é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const safePath = path.replace(/^\/+/, "");
    const targetUrl = `${evolutionUrl}/${safePath}`;

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
    try {
      evolutionResponse = await proxyToEvolution(safePath, method || "GET", targetUrl, fetchOptions);
    } catch (networkError) {
      console.error("[evolution-proxy] Network error connecting to service", networkError);

      const gracefulResponse = createGracefulTimeoutResponse(safePath);
      if (gracefulResponse) {
        console.warn(`[evolution-proxy] Falling back to graceful timeout response for ${safePath}`);
        evolutionResponse = gracefulResponse;
      } else {
        return new Response(
          JSON.stringify({ error: "Erro ao conectar com o serviço de conexão. Tente novamente." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const responseBody = await evolutionResponse.text();
    console.log("[evolution-proxy] <-", evolutionResponse.status, responseBody.substring(0, 300));

    // Gracefully handle media download failures (e.g. expired WhatsApp CDN URLs)
    if (
      evolutionResponse.status === 400 &&
      safePath.startsWith("chat/getBase64FromMediaMessage/")
    ) {
      console.warn("[evolution-proxy] Media download failed (likely expired URL), returning graceful null");
      return new Response(
        JSON.stringify({ base64: null, mimetype: null, mediaUnavailable: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(responseBody, {
      status: evolutionResponse.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("evolution-proxy error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
