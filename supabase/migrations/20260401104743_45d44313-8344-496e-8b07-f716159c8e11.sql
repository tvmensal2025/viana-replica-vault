DROP POLICY IF EXISTS "Owner update templates" ON public.message_templates;
CREATE POLICY "Owner update templates" ON public.message_templates
  FOR UPDATE TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());