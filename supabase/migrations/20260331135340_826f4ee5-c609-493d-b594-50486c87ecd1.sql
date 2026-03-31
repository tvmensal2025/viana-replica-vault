
-- 1. Remove the dangerous "Public read" policy
DROP POLICY IF EXISTS "Public read" ON public.consultants;

-- 2. Create "Owner read" policy so authenticated users can read their own record
CREATE POLICY "Owner read" ON public.consultants
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- 3. Create a public view with only safe columns (no passwords/emails)
CREATE OR REPLACE VIEW public.consultants_public AS
SELECT
  id,
  name,
  license,
  phone,
  photo_url,
  cadastro_url,
  licenciada_cadastro_url,
  igreen_id,
  facebook_pixel_id,
  google_analytics_id,
  created_at,
  referred_by
FROM public.consultants;

-- 4. Grant public access to the view
GRANT SELECT ON public.consultants_public TO anon, authenticated;
