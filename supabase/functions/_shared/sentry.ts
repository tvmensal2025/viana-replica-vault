// Shared Sentry helper for Supabase Edge Functions (Deno).
// Initializes once per isolate; safe to import from any function.
import * as Sentry from "https://esm.sh/@sentry/deno@8.45.0";

let initialized = false;

function ensureInit() {
  if (initialized) return;
  const dsn = Deno.env.get("SENTRY_DSN");
  if (!dsn) return;
  try {
    Sentry.init({
      dsn,
      environment: Deno.env.get("SUPABASE_ENV") || "production",
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
    });
    initialized = true;
  } catch (e) {
    console.error("Sentry init failed:", (e as Error).message);
  }
}

ensureInit();

export function captureError(
  err: unknown,
  context: Record<string, unknown> = {},
): void {
  ensureInit();
  if (!initialized) return;
  try {
    const { tags, extra, ...rest } = context as {
      tags?: Record<string, string>;
      extra?: Record<string, unknown>;
    };
    Sentry.withScope((scope) => {
      if (tags) scope.setTags(tags);
      const merged = { ...rest, ...(extra || {}) };
      if (Object.keys(merged).length > 0) scope.setExtras(merged);
      Sentry.captureException(err);
    });
  } catch (e) {
    console.error("Sentry capture failed:", (e as Error).message);
  }
}

export { Sentry };