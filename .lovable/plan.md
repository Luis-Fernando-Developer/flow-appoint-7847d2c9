## Objetivo

Sincronizar o controle de planos entre **flow-appoint** (origem da assinatura) e **builder-flow-api** (consumidor embedado), de forma que:

- Quando a empresa é criada/embedada via flow-appoint, o builder respeita o plano do flow-appoint.
- Quando o builder é vendido standalone, ele continua usando seu próprio plano interno.
- A chave de identificação é a flag `embed_source` já existente no builder.

## Etapa 1 — Lado do Flow-Appoint (este projeto)

### 1.1 Mapeamento de planos
Adicionar coluna `builder_tier` em `subscription_plans`:
- `starter` (default para Prata)
- `pro` (Ouro)
- `business` (Diamante)
- `suspended` (usado quando status = paused/blocked)

Migration popula o valor para os 3 planos já existentes.

### 1.2 Edge function `sync-builder-plan`
Nova função em `supabase/functions/sync-builder-plan/index.ts`:
- Recebe `{ company_id }`.
- Busca empresa + assinatura + plano + status.
- Resolve o `tier` final:
  - status `paused`/`blocked` → `suspended`
  - senão → `subscription_plans.builder_tier`
- Gera JWT HS256 com `EMBED_SHARED_SECRET` (mesmo padrão do `provision-talkmap`), claims: `iss=flow-appoint`, `aud=builder-flow-api`, `purpose=sync-plan`, `exp=60s`.
- POST para `https://fwoescubnnagdvwasbjl.supabase.co/functions/v1/sync-embed-plan` com `{ company_id, slug, tier, source: "flow-appoint" }`.
- Em sucesso atualiza `companies.builder_synced_at`.
- Fire-and-forget; falha apenas loga.

Configurar `[functions.sync-builder-plan] verify_jwt = false` no `config.toml`.

### 1.3 Pontos de chamada no flow-appoint
Disparar `sync-builder-plan` em:
1. `provision-talkmap` (logo após criar a conta no builder, com tier inicial).
2. `EditCompanyDialog` — após salvar plano/status.
3. `PlansManagement` — não necessário (afeta o template, não a empresa).
4. `SuperAdminDashboard` — qualquer alteração de status da empresa.
5. (Opcional) cron diário de reconciliação.

### 1.4 Banco
- `subscription_plans.builder_tier text not null default 'starter'`
- `companies.builder_synced_at timestamptz null`

---

## Etapa 2 — Documento/Prompt para o Builder-Flow-API

Conteúdo a colar no chat do outro projeto:

````text
# Sincronização de Planos com Flow-Appoint (embed)

## Contexto
O Flow-Appoint cria contas no builder via `provision-account` e marca o
workspace com `embed_source = 'flow-appoint'`. A partir de agora, o plano
desses workspaces é gerenciado pelo Flow-Appoint, não pela tabela de planos
interna do builder. Workspaces standalone (`embed_source IS NULL`)
continuam funcionando como hoje.

## Mudanças requeridas no builder-flow-api

### 1. Schema
Adicionar na tabela de workspace/conta:
- `embed_plan_tier text` — valores: 'starter' | 'pro' | 'business' | 'suspended'
- `embed_plan_synced_at timestamptz`
- (já existe) `embed_source text`

### 2. Nova edge function `sync-embed-plan`
- POST autenticado via JWT HS256 assinado com `EMBED_SHARED_SECRET`
  (mesmo secret usado no `provision-account`).
- Claims esperadas: `iss=flow-appoint`, `aud=builder-flow-api`,
  `purpose=sync-plan`, `exp` futuro.
- Body: `{ company_id, slug, tier, source }`.
- Localizar workspace pela combinação (`embed_source = source` AND
  `embed_company_id = company_id`) — se não existir, criar log e responder 404.
- Atualizar `embed_plan_tier` e `embed_plan_synced_at`.
- Resposta: `{ ok: true }`.
- Configurar `verify_jwt = false` (auth feita internamente).

### 3. Resolução efetiva do plano
Criar função `resolveEffectivePlan(workspace)`:
- Se `embed_source = 'flow-appoint'`: usar `embed_plan_tier`.
- Senão: usar plano interno (lógica atual).
- Se tier = 'suspended': bloquear bots e edição, mas manter dados.

Aplicar essa função em todos os pontos que hoje leem o plano interno
(limites de bots, mensagens, integrações, gating de UI).

### 4. Tabela de limites por tier (embed)
| tier       | bots | msgs/mês | integrações | observação                    |
|------------|------|----------|-------------|-------------------------------|
| starter    | 1    | 1.000    | 2           | equivale ao plano Prata       |
| pro        | 5    | 10.000   | 10          | equivale ao plano Ouro        |
| business   | 20   | 50.000   | ilimitado   | equivale ao plano Diamante    |
| suspended  | 0    | 0        | 0           | empresa pausada/bloqueada     |

(Ajustar valores conforme regra de negócio definitiva.)

### 5. UI
Esconder a aba "Pagamento/Plano" quando `embed_source = 'flow-appoint'`
(já existe). Adicionar badge "Plano gerenciado pelo Flow-Appoint" e link
opcional para o painel da empresa lá.

### 6. Endpoint opcional de auditoria
`GET /embed/plan-status?company_id=...` (mesmo JWT) → retorna
`{ tier, synced_at, source }`. Útil para reconciliação.

## Contrato resumido
- Source of truth do plano: Flow-Appoint.
- Canal: edge function `sync-embed-plan` (push do flow-appoint).
- Gatilhos: signup, mudança de plano, mudança de status, cron diário.
- Kill switch: tier `suspended`.
````

---

## Detalhes técnicos

- **Secret compartilhado**: `EMBED_SHARED_SECRET` já existe nos dois projetos.
- **URL builder**: `https://fwoescubnnagdvwasbjl.supabase.co/functions/v1/sync-embed-plan`.
- **Idempotência**: a função no builder deve aceitar múltiplos sync com mesmo tier sem efeito colateral.
- **Falhas**: o flow-appoint nunca bloqueia operação do usuário se o sync falhar — só loga e tenta de novo no próximo evento/cron.
- **Mapeamento atual** (ajustável em `subscription_plans.builder_tier`):
  Prata → starter, Ouro → pro, Diamante → business.

## Ordem de execução sugerida

1. Migration: `builder_tier` em `subscription_plans` + `builder_synced_at` em `companies`.
2. Edge function `sync-builder-plan` + entrada no `config.toml`.
3. Chamada no `provision-talkmap` (após criar conta).
4. Chamada no `EditCompanyDialog` (após `update`).
5. Chamada nos pontos de mudança de status do super-admin.
6. (Depois que o builder implementar `sync-embed-plan`) testar ponta a ponta.
