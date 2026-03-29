import { supabase } from "@/integrations/supabase/client";
import { createInstance } from "@/services/evolutionApi";

/**
 * Deterministic instance name per consultant (same logic as useWhatsApp).
 */
function getFixedInstanceName(consultantId: string): string {
  const slug = consultantId.replace(/-/g, "").slice(0, 12);
  return `igreen-${slug}`;
}

/**
 * Pre-creates the WhatsApp instance in the background right after login/signup.
 * This is fire-and-forget — errors are silently ignored.
 * When the consultant opens the WhatsApp tab, the instance will already exist
 * and the QR code will appear immediately.
 */
export async function preCreateWhatsAppInstance(userId: string): Promise<void> {
  const fixedName = getFixedInstanceName(userId);

  try {
    // Save to DB first (upsert so it's idempotent)
    await supabase
      .from("whatsapp_instances")
      .upsert(
        { consultant_id: userId, instance_name: fixedName },
        { onConflict: "consultant_id" }
      );

    // Fire instance creation on Evolution API (fire-and-forget)
    await createInstance(fixedName);
  } catch {
    // Silently ignore — the useWhatsApp hook will handle recovery
  }
}
