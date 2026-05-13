// =============================================================================
// sync-builder-plan — Flow-Appoint → Builder-Flow-API
// Sincroniza o tier do plano da empresa com o builder embedado.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const BUILDER_SYNC_URL =
  "https://fwoescubnnagdvwasbjl.supabase.co/functions/v1/sync-embed-plan";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signSyncJwt(secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "flow-appoint",
    aud: "builder-flow-api",
    purpose: "sync-plan",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const sharedSecret = Deno.env.get("EMBED_SHARED_SECRET");
  if (!sharedSecret) return json({ error: "EMBED_SHARED_SECRET ausente" }, 500);

  let body: { company_id?: string; tier_override?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const { company_id, tier_override } = body;
  if (!company_id) return json({ error: "company_id obrigatório" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1) Buscar empresa
    const { data: company, error: cErr } = await admin
      .from("companies")
      .select("id, slug, status")
      .eq("id", company_id)
      .maybeSingle();
    if (cErr || !company) return json({ error: "Empresa não encontrada" }, 404);

    // 2) Resolver tier
    let tier = tier_override;
    if (!tier) {
      if (company.status === "paused" || company.status === "blocked") {
        tier = "suspended";
      } else {
        const { data: sub } = await admin
          .from("company_subscriptions")
          .select("plan_id, status")
          .eq("company_id", company_id)
          .maybeSingle();

        if (!sub || sub.status !== "active") {
          tier = "starter";
        } else {
          const { data: plan } = await admin
            .from("subscription_plans")
            .select("builder_tier")
            .eq("id", sub.plan_id)
            .maybeSingle();
          tier = (plan as any)?.builder_tier ?? "starter";
        }
      }
    }

    // 3) Chamar builder
    const token = await signSyncJwt(sharedSecret);
    console.log(`[sync-builder-plan] company=${company_id} tier=${tier}`);
    const res = await fetch(BUILDER_SYNC_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        company_id,
        slug: company.slug,
        tier,
        source: "flow-appoint",
      }),
    });

    let result: any = null;
    try { result = await res.json(); } catch { /* ignore */ }
    console.log(`[sync-builder-plan] builder ${res.status}`, result);

    if (!res.ok) {
      return json(
        { error: "Falha no builder", builder_status: res.status, result },
        502,
      );
    }

    await admin
      .from("companies")
      .update({ builder_synced_at: new Date().toISOString() })
      .eq("id", company_id);

    return json({ ok: true, tier });
  } catch (err) {
    console.error("[sync-builder-plan] erro:", err);
    return json({ error: (err as Error).message ?? "Erro interno" }, 500);
  }
});
