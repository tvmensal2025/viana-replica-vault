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

function isMediaFetchPath(path: string): boolean {
  return path.startsWith("chat/getBase64FromMediaMessage/");
}

function createGracefulMediaUnavailableResponse(extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ base64: null, mimetype: null, mediaUnavailable: true, ...extra }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function isLikelyMediaInfrastructureError(body: string): boolean {
  const normalizedBody = body.toLowerCase();
  return normalizedBody.includes("getaddrinfo") ||
    normalizedBody.includes("eai_again") ||
    normalizedBody.includes("enotfound") ||
    normalizedBody.includes("minio");
}

function isConnectionClosedError(body: string): boolean {
  const lower = body.toLowerCase();
  return lower.includes("connection closed") || lower.includes("read messages fail");
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
  if (path.startsWith("instance/connectionState/")) return 8000;
  if (path === "instance/fetchInstances") return 10000;
  if (path.startsWith("instance/connect/")) return 15000;
  if (path === "instance/create") return 30000;
  if (path.startsWith("chat/findChats/")) return 20000;
  if (path.startsWith("chat/findMessages/")) return 20000;
  if (path.startsWith("message/")) return 15000;
  return 15000;
}

function getMaxAttempts(path: string): number {
  if (path.startsWith("instance/connectionState/")) return 1;
  if (path.startsWith("instance/connect/")) return 1;
  if (path === "instance/create") return 1;
  if (path === "instance/fetchInstances") return 1;
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
    return new Response(JSON.stringify({ state: "unknown", timeout: true }), {
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

  if (isMediaFetchPath(safePath)) {
    return createGracefulMediaUnavailableResponse({ timeout: true });
  }

  // Avatar fetches are non-critical — return graceful null instead of 504
  if (safePath.startsWith("chat/fetchProfilePictureUrl/")) {
    return new Response(JSON.stringify({ profilePictureUrl: null, timeout: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Chat/message fetches — return empty arrays so frontend never crashes
  if (safePath.startsWith("chat/findChats/") || safePath.startsWith("chat/findMessages/")) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Mark-as-read is non-critical
  if (safePath.startsWith("chat/markMessageAsRead/")) {
    return new Response(JSON.stringify({ message: "Read messages", read: "skipped", timeout: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Message-sending routes — return a clear error object instead of 504 so frontend can handle it
  if (safePath.startsWith("message/")) {
    return new Response(JSON.stringify({ error: "Timeout ao enviar mensagem. Tente novamente.", timeout: true, sent: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Default fallback — never return null, always return a graceful response
  return new Response(JSON.stringify({ error: "Serviço temporariamente indisponível.", timeout: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
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
      console.warn(`[evolution-proxy] Falling back to graceful response for ${safePath}`);
      evolutionResponse = gracefulResponse;
    }

    const responseBody = await evolutionResponse.text();
    console.log("[evolution-proxy] <-", evolutionResponse.status, responseBody.substring(0, 300));

    // Gracefully handle non-critical media fetch failures so chat rendering never breaks.
    if (isMediaFetchPath(safePath) && (evolutionResponse.status === 400 || evolutionResponse.status >= 500)) {
      const infrastructureIssue = isLikelyMediaInfrastructureError(responseBody);
      console.warn(
        `[evolution-proxy] Media fetch failed with status ${evolutionResponse.status}${infrastructureIssue ? " (storage/DNS issue)" : ""}, returning graceful null`,
      );
      return new Response(
        JSON.stringify({
          base64: null,
          mimetype: null,
          mediaUnavailable: true,
          upstreamStatus: evolutionResponse.status,
          storageUnavailable: infrastructureIssue || undefined,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Gracefully handle connect/QR errors — instance may still be initializing
    // Return { base64: null } so the frontend keeps polling instead of crashing
    if (safePath.startsWith("instance/connect/") && evolutionResponse.status >= 400) {
      console.warn(`[evolution-proxy] connect returned ${evolutionResponse.status}, returning graceful null QR`);
      return new Response(
        JSON.stringify({ base64: null, notReady: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Gracefully handle infrastructure errors (DNS/MinIO) on message-sending routes
    if (safePath.startsWith("message/") && evolutionResponse.status >= 400 && isLikelyMediaInfrastructureError(responseBody)) {
      console.warn(
        `[evolution-proxy] Infrastructure error on ${safePath} (status ${evolutionResponse.status}), returning graceful failure`,
      );
      return new Response(
        JSON.stringify({
          error: "Servidor de mídia temporariamente indisponível. Tente novamente em instantes.",
          timeout: true,
          sent: false,
          storageUnavailable: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Handle "Connection Closed" and similar transient errors gracefully
    if (evolutionResponse.status >= 400 && isConnectionClosedError(responseBody)) {
      console.warn(`[evolution-proxy] Connection closed on ${safePath} (status ${evolutionResponse.status}), returning graceful response`);

      if (safePath.startsWith("chat/findMessages/") || safePath.startsWith("chat/findChats/") || safePath.startsWith("chat/findContacts/")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (safePath.startsWith("chat/fetchProfilePictureUrl/")) {
        return new Response(JSON.stringify({ profilePictureUrl: null, connectionClosed: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (safePath.startsWith("chat/markMessageAsRead/")) {
        return new Response(JSON.stringify({ message: "Read messages", read: "skipped", connectionClosed: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (safePath.startsWith("message/")) {
        return new Response(JSON.stringify({ error: "Conexão temporariamente instável. Tente novamente.", timeout: true, sent: false, connectionClosed: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (safePath.startsWith("instance/connectionState/")) {
        return new Response(JSON.stringify({ instance: { state: "connecting" }, connectionClosed: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Generic fallback for any other path with connection closed
      return new Response(JSON.stringify({ error: "Conexão temporariamente instável.", unavailable: true, connectionClosed: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(responseBody, {
      status: evolutionResponse.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("evolution-proxy error:", error);
    const errMsg = (error as Error).message || "Internal error";
    // Catch connection-closed errors that bubble up as exceptions
    if (isConnectionClosedError(errMsg)) {
      console.warn("[evolution-proxy] Connection closed in catch block, returning graceful response");
      return new Response(
        JSON.stringify({ error: "Conexão temporariamente instável.", unavailable: true, connectionClosed: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
