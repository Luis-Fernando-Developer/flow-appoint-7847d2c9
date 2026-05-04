
## Objetivo

No momento do cadastro de empresa (SignUp.tsx e CreateCompany.tsx), chamar automaticamente a edge function `provision-account` do builder-flow-api para criar a conta do usuário lá, usando email, senha e slug. Atualizar o campo `talkmap_provisioned` no banco ao ter sucesso.

## O que será feito

### 1. Criar edge function `provision-talkmap` no Flow-Appoint

Nova edge function em `supabase/functions/provision-talkmap/index.ts` que:

- Recebe `{ email, password, slug, display_name, plan, company_id }` via POST
- Gera um JWT HS256 assinado com `EMBED_SHARED_SECRET` (já configurado como secret) com claims `iss: "flow-appoint"`, `aud: "builder-flow-api"`, `purpose: "provision"`, `exp: 60s`
- Faz POST para `https://fwoescubnnagdvwasbjl.supabase.co/functions/v1/provision-account` com o JWT no header Authorization
- Retorna o resultado (`ok`, `user_id`, `created`)
- Em caso de sucesso, atualiza `chatbot_integration` setando `talkmap_provisioned = true` e `talkmap_provisioned_at = now()` via service role

### 2. Atualizar `SignUp.tsx`

Após o passo 4 (inserção do stub da integração TalkMap), adicionar chamada à edge function `provision-talkmap` passando email, senha, slug, nome e company_id. Se falhar, apenas logar o erro (não bloqueia o cadastro). Se funcionar, o flag `talkmap_provisioned` já estará `true` no banco.

### 3. Atualizar `CreateCompany.tsx`

Mesma lógica: após criar empresa + auth + employee, chamar `provision-talkmap` com os dados do formulário.

### 4. Configurar function no config.toml

Adicionar bloco `[functions.provision-talkmap]` com `verify_jwt = false` (a autenticação é feita internamente via EMBED_SHARED_SECRET).

## Detalhes Tecnicas

- A URL do builder (`https://fwoescubnnagdvwasbjl.supabase.co/functions/v1/provision-account`) será hardcoded na edge function -- é o mesmo projeto Supabase do builder-flow-api.
- O JWT é gerado server-side na edge function usando `crypto.subtle` (mesmo padrão do `chatbot-integration/index.ts`).
- A chamada é fire-and-forget do ponto de vista do frontend: se falhar, o cadastro no Flow-Appoint continua normalmente. O status pode ser verificado depois na tela de Integração.
- Secrets necessários: `EMBED_SHARED_SECRET` (ja existe).
