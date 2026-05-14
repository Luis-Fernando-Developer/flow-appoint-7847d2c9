-- 1. Subconta Asaas por empresa (modo gerenciado)
CREATE TABLE public.company_payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE,
  asaas_subaccount_id text,
  asaas_wallet_id text,
  asaas_api_key_encrypted text,
  status text NOT NULL DEFAULT 'pending',
  cpf_cnpj text,
  bank_data jsonb DEFAULT '{}'::jsonb,
  onboarding_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_payment_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view payment accounts"
  ON public.company_payment_accounts FOR SELECT USING (true);

CREATE POLICY "Authenticated can manage payment accounts"
  ON public.company_payment_accounts FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Configurações de pagamento da empresa
CREATE TABLE public.company_payment_settings (
  company_id uuid PRIMARY KEY,
  payment_mode text NOT NULL DEFAULT 'none',
  accepted_methods jsonb NOT NULL DEFAULT '{"pix":true,"credit_card":true,"debit_card":true,"boleto":false}'::jsonb,
  platform_fee_percentage numeric NOT NULL DEFAULT 0,
  own_gateway_provider text,
  own_gateway_api_key_encrypted text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view payment settings"
  ON public.company_payment_settings FOR SELECT USING (true);

CREATE POLICY "Authenticated can manage payment settings"
  ON public.company_payment_settings FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Pagamentos de agendamentos
CREATE TABLE public.booking_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE,
  company_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  method text,
  asaas_charge_id text,
  invoice_url text,
  bank_slip_url text,
  pix_qr_code text,
  pix_payload text,
  platform_fee_amount numeric DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_payments_company ON public.booking_payments(company_id);
CREATE INDEX idx_booking_payments_charge ON public.booking_payments(asaas_charge_id);

ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view booking payments"
  ON public.booking_payments FOR SELECT USING (true);

CREATE POLICY "Anyone can create booking payments"
  ON public.booking_payments FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated can update booking payments"
  ON public.booking_payments FOR UPDATE USING (true);

-- 4. Regra de pagamento por serviço
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS payment_required text NOT NULL DEFAULT 'optional';

-- 5. Status de pagamento por booking
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_required';

-- 6. Trigger updated_at
CREATE TRIGGER trg_company_payment_accounts_updated
  BEFORE UPDATE ON public.company_payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_chatbot_updated_at();

CREATE TRIGGER trg_company_payment_settings_updated
  BEFORE UPDATE ON public.company_payment_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_chatbot_updated_at();

CREATE TRIGGER trg_booking_payments_updated
  BEFORE UPDATE ON public.booking_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_chatbot_updated_at();