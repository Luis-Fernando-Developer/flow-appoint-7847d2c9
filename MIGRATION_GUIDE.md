# Guia de Migração para Supabase Externo e VPS

Este projeto foi preparado para ser hospedado fora da infraestrutura do Lovable Cloud.

## 1. Migração do Banco de Dados (Supabase Externo)

Você deve configurar o seu novo projeto no Supabase (`pmczddukpylhdeaemmyv`):

1. Acesse o SQL Editor no painel do Supabase.
2. Copie o conteúdo do arquivo `full_schema.sql` (gerado na raiz do projeto) e execute-o. Isso criará todas as tabelas, políticas (RLS), funções e gatilhos.
3. **Importante**: Você precisará configurar manualmente as Secrets (variáveis de ambiente) no painel do Supabase em **Edge Functions > Secrets** para que as funções funcionem corretamente. Exemplos: `ASAAS_API_KEY`, `BUILDER_API_KEY`, etc.

## 2. Implantação na VPS (via Portainer/Docker)

Os arquivos necessários para o Docker estão na raiz e na pasta `deployment/`.

1. O Portainer agora encontrará automaticamente o `docker-compose.yml` na raiz do repositório.
2. Certifique-se de definir as variáveis de ambiente no Portainer ou no arquivo `.env` na raiz:
   - `VITE_SUPABASE_URL=https://pmczddukpylhdeaemmyv.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=sb_publishable_1PR6NDccypa2ukxNErqx0Q_zZ59bFlz`
3. O domínio `booking.zailom.com` já está configurado via labels do Traefik no `docker-compose.yml`.
4. A rede `zailom-booking` está definida como externa.

## 3. Implantação das Edge Functions

Como você não está mais no Lovable Cloud, as Edge Functions devem ser enviadas para o seu Supabase via CLI:

1. Instale o Supabase CLI localmente.
2. Faça login: `supabase login`
3. Link o projeto: `supabase link --project-ref pmczddukpylhdeaemmyv`
4. Deploy: `supabase functions deploy` (isso enviará todas as funções da pasta `supabase/functions`)

## 4. Configurações Finais

- **Auth**: Configure os domínios permitidos (Site URL e Redirect URLs) no painel do Supabase em **Authentication > URL Configuration**.
- **CORS**: Se encontrar erros de CORS nas Edge Functions, verifique as configurações no painel do Supabase.
