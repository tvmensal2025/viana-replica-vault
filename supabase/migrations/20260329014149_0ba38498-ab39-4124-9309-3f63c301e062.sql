CREATE TABLE public.kanban_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  consultant_id TEXT NOT NULL,
  stage_key TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'bg-blue-500/20 text-blue-400',
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(consultant_id, stage_key)
);

ALTER TABLE public.kanban_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own stages"
  ON public.kanban_stages
  FOR ALL
  TO authenticated
  USING (consultant_id = auth.uid()::text)
  WITH CHECK (consultant_id = auth.uid()::text);
