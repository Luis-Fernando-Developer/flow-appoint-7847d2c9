# Guia de Migração para Independência Total (VPS + Supabase Externo)

Este projeto foi desconectado da infraestrutura do Lovable Cloud e está pronto para ser hospedado de forma independente.

## 1. Migração do Banco de Dados (Supabase Externo)

Seu projeto Supabase: `pmczddukpylhdeaemmyv`

1. **Criar Estrutura**:
   - Localize o arquivo `full_schema.sql` na raiz do seu repositório.
   - Abra o painel do Supabase > **SQL Editor** > **New Query**.
   - Cole todo o conteúdo do `full_schema.sql` e clique em **Run**.
   - Isso criará todas as tabelas, RLS, triggers e buckets de storage.

2. **Configurar Secrets (Edge Functions)**:
   - No painel do Supabase, vá em **Edge Functions** > **Manage Secrets**.
   - Adicione todas as chaves necessárias (ex: `ASAAS_API_KEY`, `CHATBOT_KEY_ENCRYPTION_SECRET`, `EMBED_SHARED_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`).
   - Sem isso, as automações de pagamento e chatbot não funcionarão.

## 2. Implantação na VPS (via Portainer)

1. **Stack no Portainer**:
   - Use o repositório GitHub: `https://github.com/MestreDaIa/flow-appoint.git`
   - O Portainer lerá o arquivo `docker-compose.yml` na raiz.
   
2. **Variáveis de Ambiente (Vite)**:
   - No Portainer, na aba **Environment variables**, adicione:
     - `VITE_SUPABASE_URL`: `https://pmczddukpylhdeaemmyv.supabase.co`
     - `VITE_SUPABASE_ANON_KEY`: `sb_publishable_1PR6NDccypa2ukxNErqx0Q_zZ59bFlz`
   - Essas variáveis são injetadas durante o build da imagem Docker.

3. **Rede e Domínio**:
   - Certifique-se de que a rede `zailom-booking` existe no seu Docker (o `docker-compose` espera que ela seja externa).
   - O domínio configurado é `booking.zailom.com`.

## 3. Edge Functions (Deploy Manual)

As funções residem em `supabase/functions/`. Como você não usa mais o deploy automático do Lovable:

1. Instale o [Supabase CLI](https://supabase.com/docs/guides/cli) na sua máquina.
2. `supabase login`
3. `supabase link --project-ref pmczddukpylhdeaemmyv`
4. `supabase functions deploy`

## 4. Autenticação e Storage

- **Auth**: No painel do Supabase (**Authentication > URL Configuration**), atualize o "Site URL" para `https://booking.zailom.com`.
- **Storage**: As políticas foram migradas no passo 1, mas verifique em **Storage** se os buckets (ex: `company-assets`) aparecem corretamente.

O arquivo `.lovable/` foi removido para garantir que o projeto não tenha dependências ocultas.
