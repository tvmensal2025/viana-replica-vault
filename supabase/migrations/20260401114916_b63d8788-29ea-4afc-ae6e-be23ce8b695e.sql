-- Restrict template SELECT to owner only
DROP POLICY IF EXISTS "All authenticated read templates" ON public.message_templates;
CREATE POLICY "Owner select templates"
  ON public.message_templates
  FOR SELECT
  TO authenticated
  USING (consultant_id = auth.uid());