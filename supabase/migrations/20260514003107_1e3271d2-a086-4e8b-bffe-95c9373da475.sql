
-- 1. Colunas extras em company_subscriptions
ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text,
  ADD COLUMN IF NOT EXISTS next_billing_date date,
  ADD COLUMN IF NOT EXISTS pending_plan_change jsonb,
  ADD COLUMN IF NOT EXISTS current_payment_method_id uuid;

-- 2. Métodos de pagamento da empresa
CREATE TABLE IF NOT EXISTS public.company_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('credit_card','pix','bank_debit')),
  asaas_token text,
  asaas_customer_id text,
  display_label text,
  brand text,
  last_digits text,
  bank_name text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpm_company ON public.company_payment_methods(company_id);

ALTER TABLE public.company_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view payment methods"
  ON public.company_payment_methods FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage payment methods"
  ON public.company_payment_methods FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Garante apenas 1 default por empresa
CREATE OR REPLACE FUNCTION public.enforce_single_default_payment_method()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.company_payment_methods
       SET is_default = false
     WHERE company_id = NEW.company_id
       AND id <> NEW.id
       AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_default_pm ON public.company_payment_methods;
CREATE TRIGGER trg_single_default_pm
  BEFORE INSERT OR UPDATE OF is_default ON public.company_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_default_payment_method();

-- 3. Faturas
CREATE TABLE IF NOT EXISTS public.company_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  subscription_id uuid,
  asaas_charge_id text UNIQUE,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','overdue','refunded','cancelled','processing')),
  billing_type text,
  due_date date NOT NULL,
  paid_at timestamptz,
  invoice_url text,
  bank_slip_url text,
  pix_qr_code text,
  pix_payload text,
  description text,
  payment_method_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_company ON public.company_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.company_invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON public.company_invoices(due_date);

ALTER TABLE public.company_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view invoices"
  ON public.company_invoices FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage invoices"
  ON public.company_invoices FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Limites por plano
CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan_id uuid PRIMARY KEY,
  max_employees int,
  max_services int,
  max_bookings_month int,
  max_chatbots int,
  max_chatbot_messages int,
  max_integrations int,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view plan limits"
  ON public.plan_limits FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage plan limits"
  ON public.plan_limits FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Seed inicial baseado no builder_tier
INSERT INTO public.plan_limits (plan_id, max_employees, max_services, max_bookings_month, max_chatbots, max_chatbot_messages, max_integrations, features)
SELECT
  sp.id,
  CASE sp.builder_tier WHEN 'starter' THEN 3 WHEN 'pro' THEN 15 WHEN 'business' THEN 100 ELSE 1 END,
  CASE sp.builder_tier WHEN 'starter' THEN 10 WHEN 'pro' THEN 50 WHEN 'business' THEN 500 ELSE 5 END,
  CASE sp.builder_tier WHEN 'starter' THEN 200 WHEN 'pro' THEN 2000 WHEN 'business' THEN 20000 ELSE 50 END,
  CASE sp.builder_tier WHEN 'starter' THEN 1 WHEN 'pro' THEN 5 WHEN 'business' THEN 20 ELSE 0 END,
  CASE sp.builder_tier WHEN 'starter' THEN 1000 WHEN 'pro' THEN 10000 WHEN 'business' THEN 50000 ELSE 0 END,
  CASE sp.builder_tier WHEN 'starter' THEN 2 WHEN 'pro' THEN 10 WHEN 'business' THEN 999 ELSE 0 END,
  COALESCE(sp.features, '[]'::jsonb)
FROM public.subscription_plans sp
ON CONFLICT (plan_id) DO NOTHING;
