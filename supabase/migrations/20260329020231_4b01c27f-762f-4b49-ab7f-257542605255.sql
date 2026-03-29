ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS media_consumo NUMERIC,
  ADD COLUMN IF NOT EXISTS desconto_cliente NUMERIC;