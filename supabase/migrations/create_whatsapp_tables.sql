-- Create whatsapp_instances table
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  consultant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Create message_templates table
CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  consultant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- RLS for whatsapp_instances
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own instances" ON public.whatsapp_instances
  FOR ALL USING (auth.uid() = consultant_id);

-- RLS for message_templates
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own templates" ON public.message_templates
  FOR ALL USING (auth.uid() = consultant_id);
