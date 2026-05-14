CREATE TABLE public.company_credits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  original_amount NUMERIC NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'downgrade',
  status TEXT NOT NULL DEFAULT 'active',
  source_subscription_id UUID,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_by_user_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_credits_company_status ON public.company_credits(company_id, status);
CREATE INDEX idx_company_credits_expires ON public.company_credits(expires_at) WHERE status = 'active';

ALTER TABLE public.company_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view company_credits"
ON public.company_credits FOR SELECT USING (true);

CREATE POLICY "Authenticated can insert company_credits"
ON public.company_credits FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can update company_credits"
ON public.company_credits FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can delete company_credits"
ON public.company_credits FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_company_credits_updated_at
BEFORE UPDATE ON public.company_credits
FOR EACH ROW EXECUTE FUNCTION public.update_chatbot_updated_at();