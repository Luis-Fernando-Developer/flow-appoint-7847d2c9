// Tokenize a credit card on the Asaas subscription and save as default method.
// Body: { company_id, type: 'credit_card'|'pix'|'bank_debit', credit_card?, credit_card_holder_info? }
import { createClient } from "npm:@supabase/supabase-js@2";
import { asaas, corsHeaders } from "../_shared/asaas.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims } = await supabase.auth.getClaims(auth.replace("Bearer ", ""));
    if (!claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);

    const { company_id, type, credit_card, credit_card_holder_info } = await req.json();
    if (!company_id || !type) return json({ error: "params" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sub } = await admin
      .from("company_subscriptions")
      .select("asaas_subscription_id")
      .eq("company_id", company_id)
      .maybeSingle();

    let asaas_token: string | null = null;
    let brand: string | null = null;
    let last4: string | null = null;

    if (type === "credit_card") {
      if (!sub?.asaas_subscription_id) return json({ error: "Sem assinatura no gateway" }, 400);
      const updated = await asaas<any>(`/subscriptions/${sub.asaas_subscription_id}`, {
        method: "POST",
        body: JSON.stringify({
          billingType: "CREDIT_CARD",
          creditCard: credit_card,
          creditCardHolderInfo: credit_card_holder_info,
        }),
      });
      asaas_token = updated?.creditCard?.creditCardToken || null;
      brand = updated?.creditCard?.creditCardBrand || null;
      last4 = updated?.creditCard?.creditCardNumber || null;
    } else if (type === "pix" || type === "bank_debit") {
      if (sub?.asaas_subscription_id) {
        await asaas(`/subscriptions/${sub.asaas_subscription_id}`, {
          method: "POST",
          body: JSON.stringify({
            billingType: type === "pix" ? "PIX" : "DEBIT_CARD",
          }),
        });
      }
    }

    // Insert/update method record
    const display =
      type === "credit_card"
        ? `${brand || "Cartão"} •••• ${last4 || "----"}`
        : type === "pix"
          ? "PIX"
          : "Débito automático";

    const { data: inserted } = await admin
      .from("company_payment_methods")
      .insert({
        company_id,
        type,
        asaas_token,
        brand,
        last_digits: last4,
        display_label: display,
        is_default: true,
        is_active: true,
      })
      .select("id")
      .single();

    await admin
      .from("company_subscriptions")
      .update({ current_payment_method_id: inserted?.id })
      .eq("company_id", company_id);

    return json({ ok: true, method_id: inserted?.id });
  } catch (e: any) {
    console.error(e);
    return json({ error: e.message }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
