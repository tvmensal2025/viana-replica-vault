-- Deduplicate whatsapp_instances and add UNIQUE(consultant_id)

-- Step 1: Remove duplicates, keeping the most recent row per consultant
DELETE FROM public.whatsapp_instances
WHERE id NOT IN (
  SELECT DISTINCT ON (consultant_id) id
  FROM public.whatsapp_instances
  ORDER BY consultant_id, created_at DESC NULLS LAST
);

-- Step 2: Add the unique constraint
ALTER TABLE public.whatsapp_instances
ADD CONSTRAINT whatsapp_instances_consultant_id_key UNIQUE (consultant_id);