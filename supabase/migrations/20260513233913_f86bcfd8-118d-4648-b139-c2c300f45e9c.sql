ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS builder_tier text NOT NULL DEFAULT 'starter';

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS builder_synced_at timestamptz;

UPDATE public.subscription_plans SET builder_tier = 'starter'  WHERE lower(name) LIKE '%prata%';
UPDATE public.subscription_plans SET builder_tier = 'pro'      WHERE lower(name) LIKE '%ouro%';
UPDATE public.subscription_plans SET builder_tier = 'business' WHERE lower(name) LIKE '%diamante%';