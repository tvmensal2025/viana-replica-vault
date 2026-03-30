
-- Delete duplicate customers, keeping only the most recent one per phone
DELETE FROM public.customers
WHERE id NOT IN (
  SELECT DISTINCT ON (phone_whatsapp) id
  FROM public.customers
  ORDER BY phone_whatsapp, updated_at DESC
);

-- Delete group chat entries (not real customers)
DELETE FROM public.customers
WHERE phone_whatsapp LIKE '%@g.us';

-- Add unique constraint on phone_whatsapp to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique ON public.customers (phone_whatsapp);
