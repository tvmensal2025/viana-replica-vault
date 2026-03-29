ALTER TABLE public.kanban_stages
  ADD COLUMN auto_message_text TEXT,
  ADD COLUMN auto_message_type TEXT DEFAULT 'text',
  ADD COLUMN auto_message_media_url TEXT;