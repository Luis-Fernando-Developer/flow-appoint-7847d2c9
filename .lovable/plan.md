## Objetivo

Permitir que clientes finais paguem agendamentos online. Cada estabelecimento decide como receber, quais métodos aceitar e em quais serviços o pagamento é exigido.

---

## Modelos de recebimento (escolha por empresa)

**Modo 1 — Asaas Gerenciado (split com taxa da plataforma):**
- Empresa faz onboarding (CNPJ/CPF + dados bancários) que cria uma subconta Asaas
- Cobranças geradas via API Asaas com `split` automático para a subconta
- Taxa da plataforma fica configurável (zero por padrão até você definir)
- Ideal pra estabelecimento que não tem gateway próprio

**Modo 2 — Gateway Próprio:**
- Empresa cola a própria API key do Asaas/Mercado Pago/Stripe nas configurações
- Edge function usa a key dela diretamente; pagamento cai 100% na conta dela
- Sem split, sem taxa da plataforma
- MVP: começamos só com Asaas próprio (Mercado Pago/Stripe ficam para fase 2 — mesma estrutura)

**Modo 3 — Sem pagamento online:**
- Cliente só agenda; pagamento é presencial
- Dono pode marcar booking como pago manualmente

---

## Regras de pagamento

**Por empresa (settings):**
- `payment_mode`: `asaas_managed` | `own_gateway` | `none`
- `accepted_methods`: `{pix, credit_card, debit_card, boleto}` com toggle individual (boleto OFF por padrão)
- `own_gateway_provider` + `own_gateway_api_key` (criptografada) quando modo 2

**Por serviço:**
- `payment_required`: `always` | `optional` | `never` (default `optional`)

**Ao agendar:**
- Se `never` ou modo `none` → fluxo atual (sem pagamento)
- Se `optional` → cliente vê "Pagar agora" ou "Pagar no local"
- Se `always` → checkout obrigatório antes de confirmar booking

---

## Banco de dados (migration)

```sql
-- nova tabela: subconta Asaas por empresa (modo 1)
CREATE TABLE company_payment_accounts (
  id uuid PK,
  company_id uuid UNIQUE,
  asaas_subaccount_id text,
  asaas_api_key_encrypted text,   -- key da subconta retornada no onboarding
  status text,                     -- pending | active | rejected
  cpf_cnpj text,
  bank_data jsonb,
  created_at timestamptz
);

-- configurações de pagamento da empresa
CREATE TABLE company_payment_settings (
  company_id uuid PK,
  payment_mode text DEFAULT 'none',
  accepted_methods jsonb DEFAULT '{"pix":true,"credit_card":true,"debit_card":true,"boleto":false}',
  platform_fee_percentage numeric DEFAULT 0,
  own_gateway_provider text,            -- asaas | mercadopago | stripe
  own_gateway_api_key_encrypted text,
  updated_at timestamptz
);

-- regra por serviço
ALTER TABLE services ADD COLUMN payment_required text DEFAULT 'optional';

-- pagamentos de bookings (espelho)
CREATE TABLE booking_payments (
  id uuid PK,
  booking_id uuid UNIQUE,
  company_id uuid,
  amount numeric,
  status text,                    -- pending | paid | failed | refunded
  method text,                    -- pix | credit_card | debit_card | boleto
  asaas_charge_id text,
  invoice_url text,
  pix_qr_code text,
  pix_payload text,
  paid_at timestamptz,
  created_at timestamptz
);

ALTER TABLE bookings ADD COLUMN payment_status text DEFAULT 'not_required';
```

Tudo com RLS (SELECT público controlado, INSERT/UPDATE só authenticated; webhook usa service role).

---

## Edge functions

1. **`asaas-onboard-subaccount`** — cria subconta Asaas para empresa (modo 1), salva `asaas_subaccount_id` + key
2. **`booking-create-payment`** — recebe `booking_id`, lê `payment_mode` da empresa, gera cobrança no Asaas correto (subconta com split, ou key própria) e devolve QR PIX / link cartão / boleto
3. **`asaas-payment-webhook`** — recebe `PAYMENT_CONFIRMED/RECEIVED/REFUNDED`, atualiza `booking_payments` + `bookings.payment_status` + dispara confirmação automática do agendamento
4. Reutiliza `_shared/asaas.ts` com helper que aceita key dinâmica (subconta ou própria)

---

## Frontend

**Settings (empresa):**
- Nova aba "Pagamentos" com seleção de modo, onboarding subconta, toggles de métodos, taxa da plataforma (somente leitura para dono)

**Cadastro/edição de serviço:**
- Campo `payment_required` (radio: Sempre / Opcional / Nunca)

**Booking público (cliente final):**
- Step novo após escolher horário: "Como você quer pagar?"
- Renderiza QR PIX / form cartão tokenizado / link boleto conforme método escolhido
- Polling até confirmação OU exibe "aguardando pagamento" e libera quando webhook chegar
- Se `optional`, botão "Pagar no local" pula o checkout

**Painel de bookings (dono):**
- Badge de status de pagamento por agendamento
- Botão "Marcar como pago" para presencial
- Link para fatura/comprovante

---

## Detalhes técnicos

- Helper `asaas()` aceita parâmetro opcional `apiKey` para usar key da subconta ou key própria da empresa
- Split via `split: [{walletId, percentualValue}]` do Asaas no modo 1
- Criptografia de keys próprias usa o mesmo `CHATBOT_KEY_ENCRYPTION_SECRET` já configurado
- Webhook único `asaas-payment-webhook` com `verify_jwt=false`, valida `ASAAS_WEBHOOK_TOKEN`
- Booking só vira `confirmed` automaticamente após `paid` quando `payment_required=always`

---

## Ordem de execução

1. Migration (tabelas + colunas + RLS)
2. Edge functions (onboard, create-payment, webhook)
3. Aba "Pagamentos" em Settings + onboarding modo 1
4. Campo `payment_required` em serviços
5. Step de pagamento no booking público
6. Status de pagamento no painel de bookings

---

## Fora de escopo desta entrega

- Mercado Pago e Stripe como gateway próprio (estrutura fica pronta, conector real fica fase 2)
- Reembolso automatizado pelo painel (manual via Asaas por enquanto)
- Parcelamento no cartão (1x apenas no MVP)
- Notificações por email/WhatsApp ao pagar
