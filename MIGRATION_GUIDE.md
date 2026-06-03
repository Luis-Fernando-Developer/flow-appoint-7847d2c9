# Guia de Migração para Supabase Externo e VPS

Este projeto foi preparado para ser hospedado fora da infraestrutura do Lovable Cloud.

## 1. Migração do Banco de Dados (Supabase Externo)

Você deve configurar o seu novo projeto no Supabase (`pmczddukpylhdeaemmyv`):

1. Acesse o SQL Editor no painel do Supabase.
2. Copie o conteúdo do arquivo `full_schema.sql` (gerado na raiz do projeto) e execute-o. Isso criará todas as tabelas, políticas (RLS), funções e gatilhos.
3. **Importante**: Você precisará configurar manualmente as Secrets (variáveis de ambiente) no painel do Supabase em **Edge Functions > Secrets** para que as funções funcionem corretamente. Exemplos: `ASAAS_API_KEY`, `BUILDER_API_KEY`, etc.

## 2. Implantação na VPS (via Portainer/Docker)

Os arquivos necessários estão na pasta `deployment/`.

1. Copie a pasta do projeto para sua VPS.
2. No Portainer, você pode criar um "Stack" usando o conteúdo do `docker-compose.yml`.
3. Certifique-se de que o arquivo `.env` na pasta `deployment/` contenha as chaves corretas:
   - `VITE_SUPABASE_URL=https://pmczddukpylhdeaemmyv.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=sb_publishable_1PR6NDccypa2ukxNErqx0Q_zZ59bFlz`

## 3. Implantação das Edge Functions

Como você não está mais no Lovable Cloud, as Edge Functions devem ser enviadas para o seu Supabase via CLI:

1. Instale o Supabase CLI localmente.
2. Faça login: `supabase login`
3. Link o projeto: `supabase link --project-ref pmczddukpylhdeaemmyv`
4. Deploy: `supabase functions deploy` (isso enviará todas as funções da pasta `supabase/functions`)

## 4. Configurações Finais

- **Auth**: Configure os domínios permitidos (Site URL e Redirect URLs) no painel do Supabase em **Authentication > URL Configuration**.
- **CORS**: Se encontrar erros de CORS nas Edge Functions, verifique as configurações no painel do Supabase.
