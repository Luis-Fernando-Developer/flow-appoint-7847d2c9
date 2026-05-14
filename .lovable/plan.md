## Objetivo

Remover o modo "Asaas Gerenciado" (subconta + split). Manter apenas:
- **`own_gateway`** — empresa cola própria API key (Asaas no MVP)
- **`none`** — sem pagamento online (presencial)

---

## Mudanças

### 1. Banco de dados (migration)

- **Drop** da tabela `company_payment_accounts` (não há mais subconta)
- Em `company_payment_settings`:
  - Remover coluna `platform_fee_percentage` (não há mais split)
  - Manter `payment_mode` mas restringir valores a `none | own_gateway` (default `none`)
  - Manter `accepted_methods`, `own_gateway_provider`, `own_gateway_api_key_encrypted`
- `services.payment_required` permanece (`always | optional | never`)
- `bookings.payment_status` e `booking_payments` permanecem (são agnósticos ao modo)

### 2. Edge functions

- **Deletar** `asaas-onboard-subaccount` por completo
- **`booking-create-payment`**: remover todo o branch `asaas_managed` (split, walletId, platformFee). Aceitar apenas `own_gateway` (com key descriptografada da empresa) e bloquear `none`
- **`asaas-webhook`**: o handler de booking permanece igual — segue identificando por `externalReference="booking:<id>"` e atualizando status

### 3. Frontend

- **`PaymentSettings.tsx`**: remover toda a UI de onboarding de subconta (CPF/CNPJ, dados bancários, faturamento, etc). Substituir por:
  - Toggle "Aceitar pagamento online" (liga/desliga `own_gateway` vs `none`)
  - Select de provider (Asaas no MVP; MP/Stripe desabilitados com tooltip "em breve")
  - Input mascarado pra colar API key (criptografada via `encrypt_chatbot_key`)
  - Botão "Testar conexão" (chama um ping no Asaas com a key pra validar)
  - Toggles dos métodos aceitos (PIX, crédito, débito, boleto)
- **`AddServiceDialog` / `EditServiceDialog`**: campo `payment_required` permanece sem alteração
- **`Booking.tsx` + `BookingPaymentDialog.tsx`**: nenhum ajuste lógico — eles só consomem `booking-create-payment` e exibem QR/cartão/boleto

### 4. `_shared/asaas.ts`

- O helper já aceita `overrideKey` — mantém como está
- Remover qualquer referência a wallet/split nos exemplos

---

## Detalhes técnicos

- **Criptografia da key própria**: usar as funções `encrypt_chatbot_key` / `decrypt_chatbot_key` que já existem no banco com o secret `CHATBOT_KEY_ENCRYPTION_SECRET`
- **Validação da key**: ao salvar, edge function nova `validate-own-gateway-key` que faz `GET /myAccount` no Asaas com a key e devolve nome da conta pra confirmação visual
- **Webhook**: como cada empresa terá uma key própria, ela mesma precisa cadastrar a URL do webhook no painel Asaas dela. A UI de Settings deve exibir a URL pronta pra copiar (`{SUPABASE_URL}/functions/v1/asaas-webhook`) + o token compartilhado. *Alternativa futura*: cadastrar o webhook automaticamente via API quando a key é salva — fica fora do MVP
- **Sem taxa da plataforma**: pagamento cai 100% na conta da empresa, sem retenção

---

## Ordem de execução

1. Migration: drop `company_payment_accounts`, remove `platform_fee_percentage`
2. Deletar edge function `asaas-onboard-subaccount`
3. Simplificar `booking-create-payment` (remove branch managed)
4. Criar edge function `validate-own-gateway-key`
5. Refazer `PaymentSettings.tsx` com nova UI
6. Atualizar `.lovable/plan.md`

---

## Pontos pra confirmar

1. **Webhook**: tá ok exibir a URL + token pro dono colar manualmente no painel Asaas dele? Ou prefere que tentemos cadastrar automaticamente via API (mais código, mas zero fricção)?
2. **Outros gateways**: deixo Mercado Pago/Stripe visíveis como "em breve" ou escondo até implementar?
