ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS media_type text DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_url text;