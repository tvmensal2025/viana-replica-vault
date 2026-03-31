import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MessageTemplate } from "@/types/whatsapp";

/**
 * Pure function that replaces placeholders in a template with customer data.
 * Exported separately so it can be tested independently.
 */
export function applyTemplate(
  template: MessageTemplate,
  customer: { name: string; electricity_bill_value?: number }
): string {
  let result = template.content;
  result = result.split("{{nome}}").join(customer.name);
  result = result.split("{{valor_conta}}").join(
    customer.electricity_bill_value != null
      ? String(customer.electricity_bill_value)
      : ""
  );
  return result;
}

export function useTemplates(consultantId: string) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("message_templates")
        .select("*");

      if (error) throw error;
      setTemplates((data as MessageTemplate[]) ?? []);
    } catch {
      // silently handle – consumer can check templates length
    } finally {
      setIsLoading(false);
    }
  }, [consultantId]);

  const createTemplate = useCallback(
    async (name: string, content: string, mediaType: string = "text", mediaUrl: string | null = null, imageUrl: string | null = null) => {
      const { error } = await supabase.from("message_templates").insert({
        consultant_id: consultantId,
        name,
        content,
        media_type: mediaType,
        media_url: mediaUrl,
        image_url: imageUrl,
      });
      if (error) throw error;
      await fetchTemplates();
    },
    [consultantId, fetchTemplates]
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("message_templates")
        .delete()
        .eq("id", id);
      if (error) throw error;
      await fetchTemplates();
    },
    [fetchTemplates]
  );

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return {
    templates,
    isLoading,
    createTemplate,
    deleteTemplate,
    applyTemplate,
  };
}
