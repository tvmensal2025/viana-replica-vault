import { supabase } from "@/integrations/supabase/client";
import { createInstance } from "@/services/evolutionApi";
import { createLogger } from "@/lib/logger";

const logger = createLogger("preCreate");

/**
 * Deterministic instance name per consultant (same logic as useWhatsApp).
 */
function getFixedInstanceName(consultantId: string): string {
  const slug = consultantId.replace(/-/g, "").slice(0, 12);
  return `igreen-${slug}`;
}

/**
 * Pre-creates the WhatsApp instance in the background right after login/signup.
 * Fire-and-forget — errors are logged but don't block the user.
 */
export async function preCreateWhatsAppInstance(userId: string): Promise<void> {
  // Guard: only proceed if we have a valid session token
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.access_token) {
    logger.info("[preCreate] Skipped — no active session yet");
    return;
  }

  const fixedName = getFixedInstanceName(userId);

  try {
    // Save to DB first (upsert so it's idempotent)
    const { error: dbError } = await supabase
      .from("whatsapp_instances")
      .upsert(
        { consultant_id: userId, instance_name: fixedName },
        { onConflict: "consultant_id" }
      );

    if (dbError) {
      logger.error("[preCreate] DB upsert failed:", dbError.message);
      return; // Don't try Evolution API if DB failed
    }

    // Fire instance creation on Evolution API
    await createInstance(fixedName);
    logger.info("[preCreate] Instance created successfully:", fixedName);
  } catch (err) {
    logger.error("[preCreate] Failed:", err instanceof Error ? err.message : err);
    // Don't throw — the useWhatsApp hook will handle recovery
  }
}
