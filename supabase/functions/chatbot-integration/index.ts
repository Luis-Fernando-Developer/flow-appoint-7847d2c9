// Edge Function: chatbot-integration
// Gerencia a conexão entre o Flow-Appoint e o builder externo (TalkMap / builder-flow-api).
//
// Endpoints:
//   POST   /chatbot-integration/validate          { api_key }              → valida formato (e futuramente chama o builder)
//   POST   /chatbot-integration/save              { company_id, api_key }  → salva cifrada no banco
//   GET    /chatbot-integration/status?company_id=...                      → retorna status (sem expor a key)
//   DELETE /chatbot-integration/disconnect?company_id=...                  → revoga
//   POST   /chatbot-integration/sign-embed-token  { company_id, user_id }  → gera JWT HS256 pra injetar no iframe

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { create as createJwt, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS, PUT, PATCH",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENCRYPTION_SECRET = Deno.env.get("CHATBOT_KEY_ENCRYPTION_SECRET")!;
const EMBED_SHARED_SECRET = Deno.env.get("EMBED_SHARED_SECRET")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isValidApiKeyFormat(key: string): boolean {
  // Formato esperado do builder: tmk_{tipo}_{>=20 chars}
  // Aceita também qualquer string >= 20 chars enquanto o builder não emite formato fixo.
  if (typeof key !== "string") return false;
  const trimmed = key.trim();
  if (trimmed.length < 20) return false;
  if (/^tmk_/.test(trimmed)) return true;
  return trimmed.length >= 20;
}

function getKeyPrefix(key: string): string {
  const t = key.trim();
  // mostra primeiros 12 chars + "..."
  return t.length > 12 ? `${t.slice(0, 12)}...` : t;
}

async function encryptKey(key: string): Promise<string> {
  const { data, error } = await admin.rpc("encrypt_chatbot_key", {
    p_plain: key,
    p_secret: ENCRYPTION_SECRET,
  });
  if (error) throw error;
  return data as unknown as string;
}

async function decryptKey(encrypted: string): Promise<string> {
  const { data, error } = await admin.rpc("decrypt_chatbot_key", {
    p_cipher: encrypted,
    p_secret: ENCRYPTION_SECRET,
  });
  if (error) throw error;
  return data as unknown as string;
}

async function signEmbedJwt(payload: Record<string, unknown>): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(EMBED_SHARED_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return await createJwt(
    { alg: "HS256", typ: "JWT" },
    {
      iss: "bookingfy",
      aud: "talkmap",
      iat: getNumericDate(0),
      exp: getNumericDate(60 * 5), // 5 minutos
      ...payload,
    },
    key,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleValidate(req: Request): Promise<Response> {
  const { api_key } = await req.json().catch(() => ({}));
  if (!api_key) return json({ valid: false, error: "api_key obrigatório" }, 400);
  if (!isValidApiKeyFormat(api_key)) {
    return json({ valid: false, error: "Formato de chave inválido" }, 400);
  }
  // TODO: quando o builder tiver endpoint /validate-key, chamar aqui via fetch.
  return json({
    valid: true,
    prefix: getKeyPrefix(api_key),
    note: "Validação local. O builder ainda não expõe endpoint de verificação remota.",
  });
}

async function handleSave(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { company_id, api_key, builder_workspace_slug, builder_user_id, builder_base_url } = body;
  if (!company_id || !api_key) {
    return json({ error: "company_id e api_key são obrigatórios" }, 400);
  }
  if (!isValidApiKeyFormat(api_key)) {
    return json({ error: "Formato de chave inválido" }, 400);
  }

  const encrypted = await encryptKey(api_key);
  const prefix = getKeyPrefix(api_key);

  // Upsert manual (delete-then-insert pra evitar problemas com unique constraint)
  await admin.from("chatbot_integration").delete().eq("company_id", company_id);

  const { data, error } = await admin
    .from("chatbot_integration")
    .insert({
      company_id,
      api_key_encrypted: encrypted,
      api_key_prefix: prefix,
      builder_workspace_slug: builder_workspace_slug ?? null,
      builder_user_id: builder_user_id ?? null,
      builder_base_url: builder_base_url ?? "https://talkbuilder.lovable.app",
      connected_at: new Date().toISOString(),
      last_validated_at: new Date().toISOString(),
      is_active: true,
    })
    .select("id, company_id, api_key_prefix, builder_base_url, connected_at, is_active")
    .single();

  if (error) return json({ error: error.message }, 500);
  return json({ success: true, integration: data });
}

async function handleStatus(url: URL): Promise<Response> {
  const company_id = url.searchParams.get("company_id");
  if (!company_id) return json({ error: "company_id obrigatório" }, 400);

  const { data, error } = await admin
    .from("chatbot_integration")
    .select("id, api_key_prefix, builder_workspace_slug, builder_base_url, connected_at, last_validated_at, is_active")
    .eq("company_id", company_id)
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  return json({ connected: !!data && data.is_active, integration: data ?? null });
}

async function handleDisconnect(url: URL): Promise<Response> {
  const company_id = url.searchParams.get("company_id");
  if (!company_id) return json({ error: "company_id obrigatório" }, 400);

  const { error } = await admin
    .from("chatbot_integration")
    .delete()
    .eq("company_id", company_id);

  if (error) return json({ error: error.message }, 500);
  return json({ success: true });
}

async function handleSignEmbedToken(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { company_id, user_id, plan } = body;
  if (!company_id || !user_id) {
    return json({ error: "company_id e user_id são obrigatórios" }, 400);
  }

  // Busca empresa pra extrair o slug
  const { data: company, error: companyErr } = await admin
    .from("companies")
    .select("id, slug, name")
    .eq("id", company_id)
    .maybeSingle();
  if (companyErr || !company) {
    return json({ error: "Empresa não encontrada" }, 404);
  }

  // Confirma que a integração existe e está ativa
  const { data: integration } = await admin
    .from("chatbot_integration")
    .select("is_active, builder_base_url")
    .eq("company_id", company_id)
    .maybeSingle();

  if (!integration?.is_active) {
    return json({ error: "Integração não conectada" }, 403);
  }

  const token = await signEmbedJwt({
    sub: user_id,
    tenantId: company_id,
    userId: user_id,
    slug: company.slug,
    plan: plan ?? "pro",
  });

  return json({
    token,
    builder_base_url: integration.builder_base_url ?? "https://talkbuilder.lovable.app",
    expires_in: 300,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // path final (último segmento depois de /chatbot-integration)
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = pathParts[pathParts.length - 1];

    if (req.method === "POST" && action === "validate") return await handleValidate(req);
    if (req.method === "POST" && action === "save") return await handleSave(req);
    if (req.method === "GET" && action === "status") return await handleStatus(url);
    if (req.method === "DELETE" && action === "disconnect") return await handleDisconnect(url);
    if (req.method === "POST" && action === "sign-embed-token") return await handleSignEmbedToken(req);

    return json({ error: `Rota desconhecida: ${req.method} ${action}` }, 404);
  } catch (err) {
    console.error("[chatbot-integration] erro:", err);
    return json({ error: (err as Error).message ?? "Erro interno" }, 500);
  }
});
