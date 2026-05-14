// TEMPORARY: end-to-end test helper for Asaas integration.
// Action=fetch_payments | simulate_paid
import { asaas, corsHeaders } from "../_shared/asaas.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "fetch_payments";
  const subscriptionId = url.searchParams.get("subscription_id") || "";
  const paymentId = url.searchParams.get("payment_id") || "";

  try {
    if (action === "fetch_payments") {
      const data = await asaas(`/payments?subscription=${subscriptionId}&limit=10`);
      return json(data);
    }
    if (action === "simulate_paid") {
      // Get the real payment from Asaas, then POST it to our webhook with the secret token
      const p = await asaas<any>(`/payments/${paymentId}`);
      const body = { event: "PAYMENT_CONFIRMED", payment: p };
      const supaUrl = Deno.env.get("SUPABASE_URL")!;
      const token = Deno.env.get("ASAAS_WEBHOOK_TOKEN")!;
      const r = await fetch(`${supaUrl}/functions/v1/asaas-webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "asaas-access-token": token },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      return json({ webhook_status: r.status, webhook_response: text, payment: p });
    }
    return json({ error: "unknown action" }, 400);
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
