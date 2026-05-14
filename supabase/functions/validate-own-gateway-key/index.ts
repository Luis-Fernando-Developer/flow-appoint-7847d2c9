// Valida uma API key de gateway próprio (Asaas no MVP) consultando /myAccount.
import { asaas, corsHeaders } from "../_shared/asaas.ts";

interface Body {
  api_key: string;
  provider?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body.api_key) return json({ error: "api_key obrigatória" }, 400);
    const provider = (body.provider || "asaas").toLowerCase();
    if (provider !== "asaas") return json({ error: "Provedor não suportado ainda" }, 400);

    const account = await asaas<any>(`/myAccount`, {}, body.api_key);
    return json({
      ok: true,
      account_name: account?.name || account?.email || "Conta Asaas",
      account_email: account?.email || null,
    });
  } catch (e: any) {
    return json({ error: e.message || "erro ao validar" }, 200);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
