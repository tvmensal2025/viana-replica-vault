
-- 1. Add consultant_id column to customers
ALTER TABLE public.customers ADD COLUMN consultant_id uuid;

-- 2. Drop old permissive RLS policy on customers
DROP POLICY IF EXISTS "Allow all for anon" ON public.customers;

-- 3. Create new RLS policies for customers (filtered by consultant_id)
CREATE POLICY "Owner select customers"
  ON public.customers FOR SELECT
  TO authenticated
  USING (consultant_id = auth.uid());

CREATE POLICY "Owner insert customers"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (consultant_id = auth.uid());

CREATE POLICY "Owner update customers"
  ON public.customers FOR UPDATE
  TO authenticated
  USING (consultant_id = auth.uid());

CREATE POLICY "Owner delete customers"
  ON public.customers FOR DELETE
  TO authenticated
  USING (consultant_id = auth.uid());

-- 4. Allow service_role (edge functions) full access - they bypass RLS by default

-- 5. Drop old RLS policy on message_templates
DROP POLICY IF EXISTS "Users can manage own templates" ON public.message_templates;

-- 6. Create new RLS policies for templates (shared read, owner write)
CREATE POLICY "All authenticated read templates"
  ON public.message_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Owner insert templates"
  ON public.message_templates FOR INSERT
  TO authenticated
  WITH CHECK (consultant_id = auth.uid());

CREATE POLICY "Owner update templates"
  ON public.message_templates FOR UPDATE
  TO authenticated
  USING (consultant_id = auth.uid());

CREATE POLICY "Owner delete templates"
  ON public.message_templates FOR DELETE
  TO authenticated
  USING (consultant_id = auth.uid());
