// Valida uma API key de gateway próprio em qualquer provedor suportado.
import { validateKey, corsHeaders, type Provider } from "../_shared/gateways.ts";

const SUPPORTED: Provider[] = ["asaas", "mercadopago", "stripe", "pagarme"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    if (!body.api_key) return json({ error: "api_key obrigatória" }, 400);
    const provider = (body.provider || "asaas").toLowerCase() as Provider;
    if (!SUPPORTED.includes(provider)) return json({ error: "Provedor não suportado" }, 400);

    const result = await validateKey(provider, body.api_key);
    return json({ ok: true, ...result });
  } catch (e: any) {
    return json({ error: e.message || "erro ao validar" }, 200);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
