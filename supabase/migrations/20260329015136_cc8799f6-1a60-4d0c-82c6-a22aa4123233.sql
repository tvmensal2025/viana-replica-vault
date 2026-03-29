ALTER TABLE public.crm_deals
  ADD COLUMN approved_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.kanban_stages
  ADD COLUMN auto_message_enabled BOOLEAN NOT NULL DEFAULT true;