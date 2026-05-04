// =============================================================================
// provision-talkmap — Edge Function do Flow-Appoint
// Chama o builder-flow-api para provisionar conta automaticamente no cadastro.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const BUILDER_PROVISION_URL =
  "https://fwoescubnnagdvwasbjl.supabase.co/functions/v1/provision-account";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ─── JWT HS256 helper ────────────────────────────────────────────────────────

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signProvisionJwt(secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "flow-appoint",
    aud: "builder-flow-api",
    purpose: "provision",
    iat: now,
    exp: now + 60,
  };

  const enc = new TextEncoder();
  const headerB64 = toBase64Url(enc.encode(JSON.stringify(header)).buffer);
  const payloadB64 = toBase64Url(enc.encode(JSON.stringify(payload)).buffer);
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
  return `${signingInput}.${toBase64Url(sig)}`;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const sharedSecret = Deno.env.get("EMBED_SHARED_SECRET");
  if (!sharedSecret) {
    return json({ error: "EMBED_SHARED_SECRET não configurado" }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const { email, password, slug, display_name, plan, company_id } = body as {
    email: string;
    password: string;
    slug: string;
    display_name?: string;
    plan?: string;
    company_id?: string;
  };

  if (!email || !password || !slug) {
    return json({ error: "email, password e slug são obrigatórios" }, 400);
  }

  try {
    // 1) Sign JWT
    const token = await signProvisionJwt(sharedSecret);

    // 2) Call builder-flow-api provision-account
    console.log(`[provision-talkmap] Provisionando ${email} (slug: ${slug})…`);
    const res = await fetch(BUILDER_PROVISION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        slug,
        display_name: display_name ?? undefined,
        plan: plan ?? "starter",
        company_id: company_id ?? undefined,
      }),
    });

    const result = await res.json();
    console.log(`[provision-talkmap] Resposta do builder: ${res.status}`, result);

    if (!result.ok) {
      return json(
        { error: result.error ?? "Falha no builder", builder_status: res.status },
        502,
      );
    }

    // 3) Update talkmap_provisioned flag
    if (company_id) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(supabaseUrl, serviceRole);

      const { error: updateErr } = await admin
        .from("chatbot_integration")
        .update({
          talkmap_provisioned: true,
          talkmap_provisioned_at: new Date().toISOString(),
          is_active: true,
        })
        .eq("company_id", company_id);

      if (updateErr) {
        console.error("[provision-talkmap] Erro ao atualizar flag:", updateErr);
      }
    }

    return json({
      ok: true,
      created: result.created,
      user_id: result.user_id,
      email: result.email,
      slug: result.slug,
    });
  } catch (err) {
    console.error("[provision-talkmap] Erro:", err);
    return json({ error: (err as Error).message ?? "Erro interno" }, 500);
  }
});
