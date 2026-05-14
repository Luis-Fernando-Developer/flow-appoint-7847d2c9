## Objetivo

Tornar o botão "Gerenciar Plano" funcional na aba de Configurações da empresa, integrando ao Asaas como gateway. Cobrir: cobrança recorrente (cartão, débito automático, PIX), antecipação de fatura D-3, upgrade/downgrade com proration, troca de método de pagamento (último usado vira padrão), histórico/lista de faturas com download de PDF, e exibição de plano atual + limites.

---

## Modelo de cobrança (decisões)

**Antecipação D-3:** cron diário consulta assinaturas cuja `next_billing_date` está em D+3 e cria a próxima cobrança no Asaas com `dueDate` igual ao dia da renovação. Cliente recebe PIX/boleto/cartão com 3 dias de antecedência. Cartão e débito automático são cobrados pelo Asaas no vencimento (sem ação manual). PIX exige ação do cliente — enviamos link/QR por e-mail.

**Upgrade (proration imediata):**
- Calcula `valor_diferenca = (preço_novo − preço_atual) × dias_restantes ÷ dias_ciclo`
- Cria cobrança avulsa no Asaas pelo valor proporcional, vencimento em 1 dia
- Quando paga (ou se for cartão recorrente, cobrada na hora), troca o plano e mantém a `next_billing_date` original
- Bloqueio: não permite upgrade se houver fatura vencida em aberto

**Downgrade (agendado):**
- Marca `pending_plan_change = { plan_id, effective_at: next_billing_date }` na `company_subscriptions`
- Plano atual permanece até o fim do ciclo
- No D-3, cron gera a próxima fatura já com o novo plano e zera o `pending_plan_change`
- Permite cancelar o downgrade antes do efetivo

**Por quê assim:** evita reembolso (downgrade) e maximiza receita justa (upgrade). Padrão Stripe/Chargebee.

---

## Métodos de pagamento

Tabela `company_payment_methods`:
- `type`: `credit_card` | `pix` | `bank_debit`
- `asaas_token` (cartão tokenizado / mandato débito)
- `last_digits`, `brand`, `bank_name` (display)
- `is_default` (último usado = default automático)
- Apenas 1 default por empresa (trigger)

Fluxo:
- **Cartão**: tokenização via Asaas Checkout (não armazenamos PAN). Renovação automática.
- **Débito automático**: aceite + dados bancários via Asaas (mandato). Renovação automática.
- **PIX**: não armazena nada; cada fatura gera novo QR. Default = "última usada", mas exige ação manual no vencimento.

Após pagamento bem-sucedido, webhook do Asaas atualiza `is_default` para o método usado.

---

## Banco de dados (migrations)

```sql
-- assinatura: rastreio de ciclo e mudanças pendentes
ALTER TABLE company_subscriptions ADD COLUMN
  asaas_subscription_id text,
  next_billing_date date,
  pending_plan_change jsonb,
  current_payment_method_id uuid;

-- métodos de pagamento
CREATE TABLE company_payment_methods (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  type text NOT NULL,           -- credit_card | pix | bank_debit
  asaas_token text,
  display_label text,           -- "Visa •••• 1234"
  brand text, last_digits text, bank_name text,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- faturas (espelho das cobranças do Asaas, p/ relatório e PDF)
CREATE TABLE company_invoices (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  subscription_id uuid,
  asaas_charge_id text UNIQUE,
  amount numeric NOT NULL,
  status text NOT NULL,         -- pending | paid | overdue | refunded | cancelled
  billing_type text,            -- CREDIT_CARD | PIX | DEBIT
  due_date date NOT NULL,
  paid_at timestamptz,
  invoice_url text,             -- PDF do Asaas
  pix_qr_code text,
  description text,
  created_at timestamptz DEFAULT now()
);

-- limites por tier (espelha o builder, mas centralizado aqui)
CREATE TABLE plan_limits (
  plan_id uuid PRIMARY KEY,
  max_employees int, max_services int, max_bookings_month int,
  max_chatbots int, max_chatbot_messages int, max_integrations int,
  features jsonb
);
```

Todas com RLS: SELECT público controlado por company, ALL apenas service_role (webhook + admin).

---

## Edge functions (Asaas)

1. **`asaas-create-customer`** — cria/atualiza cliente Asaas a partir da company.
2. **`asaas-create-subscription`** — cria assinatura recorrente quando empresa adere a um plano pago.
3. **`asaas-change-plan`** — recebe `{ company_id, new_plan_id, action: 'upgrade'|'downgrade' }`, calcula proration e age de acordo.
4. **`asaas-tokenize-card`** — proxy para Asaas Checkout / tokenização (retorna URL hospedada do Asaas).
5. **`asaas-set-payment-method`** — define método ativo da próxima cobrança e marca como default.
6. **`asaas-webhook`** (verify_jwt=false, valida `asaas-access-token` no header) — recebe eventos `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, atualiza `company_invoices`, marca método como default, sincroniza `next_billing_date`, e em caso de overdue dispara downgrade automático para `suspended` (que sincroniza com builder).
7. **`asaas-billing-cron`** (cron diário 03:00) — varre subscriptions com `next_billing_date = hoje + 3 dias`, aplica `pending_plan_change` se houver, cria a próxima cobrança no Asaas.
8. **`asaas-list-invoices`** — proxy autenticado que lista faturas da empresa com URL do PDF.

Secret necessário: `ASAAS_API_KEY` + `ASAAS_WEBHOOK_TOKEN` + `ASAAS_ENV` (sandbox/prod).

---

## Frontend — Página `Gerenciar Plano`

Rota: `/business/:slug/billing` (botão "Gerenciar Plano" em Settings.tsx aponta pra cá).

Layout em abas:
- **Plano Atual**: nome, preço, ciclo, próxima cobrança, limites (uso × máximo via `plan_limits`), badge se houver `pending_plan_change`. Botões "Mudar de plano" e "Cancelar assinatura".
- **Mudar de plano**: lista todos os planos. Mostra preview de proration (upgrade) ou data efetiva (downgrade) antes de confirmar.
- **Métodos de pagamento**: lista de cartões/débitos salvos + opção PIX. Botão "Adicionar cartão" abre Asaas Checkout em iframe/redirect. "Definir como padrão" e "Remover".
- **Histórico de faturas**: tabela com data, valor, status (badge), método, ação "Baixar PDF" (abre `invoice_url` do Asaas) + "Pagar agora" se pendente (abre QR PIX ou cartão).

---

## Sincronia com builder-flow-api

Já existe `syncBuilderPlan`. Adicionar gatilhos em:
- Webhook do Asaas após `PAYMENT_CONFIRMED` de upgrade efetivado → sync (novo tier).
- Webhook após `PAYMENT_OVERDUE` (3+ dias) → sync com `suspended`.
- Cron de billing após aplicar `pending_plan_change` → sync (downgrade efetivado).

---

## Ordem de execução

1. Migration (tabelas + colunas + RLS + plan_limits seed).
2. Pedir secret `ASAAS_API_KEY` + `ASAAS_WEBHOOK_TOKEN`.
3. Edge functions Asaas (create-customer, create-subscription, webhook, list-invoices).
4. Página `BillingManagement.tsx` com aba Plano Atual + Faturas (somente leitura primeiro).
5. Tokenização de cartão + métodos de pagamento.
6. Mudança de plano com proration (upgrade/downgrade).
7. Cron de antecipação D-3.
8. Wire-up botão "Gerenciar Plano" em Settings.tsx + rota.

---

## Fora de escopo desta entrega

- Emissão de NFS-e (fica para fase 2).
- PDF customizado (usamos o do Asaas).
- Pagamento de fatura avulsa fora do ciclo (não-renovação).
- Multi-moeda.

Se aprovar, começo pela migration + pedido do `ASAAS_API_KEY`.