// Webhook do Mercado Pago. Marca booking_payments como pago quando approved.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/gateways.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    // MP envia { type, data: { id } }. Buscamos o pagamento pra ler external_reference + status.
    // Para isso precisamos da access_token da empresa — fazemos lookup pelo external_reference quando disponível.
    let externalRef: string | null = body?.data?.external_reference || body?.external_reference || null;
    let status: string | null = body?.data?.status || null;

    // Caso só tenha o id, buscamos via API usando a key da empresa (varremos as configs).
    const paymentId = body?.data?.id;
    if ((!externalRef || !status) && paymentId) {
      // Tentar todas as keys configuradas (fallback simples).
      const { data: settings } = await supabase
        .from("company_payment_settings")
        .select("own_gateway_api_key_encrypted")
        .eq("own_gateway_provider", "mercadopago")
        .eq("payment_mode", "own_gateway");
      for (const s of settings || []) {
        if (!s.own_gateway_api_key_encrypted) continue;
        const { data: key } = await supabase.rpc("decrypt_chatbot_key", {
          p_cipher: s.own_gateway_api_key_encrypted, p_secret: "asaas-own-gateway",
        });
        if (!key) continue;
        const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (r.ok) {
          const p = await r.json();
          externalRef = p.external_reference;
          status = p.status;
          break;
        }
      }
    }

    if (!externalRef?.startsWith("booking:")) return ok();
    const bookingId = externalRef.split(":")[1];
    const paid = status === "approved";

    if (paid) {
      await supabase.from("booking_payments").update({ status: "paid", paid_at: new Date().toISOString() }).eq("booking_id", bookingId);
      await supabase.from("bookings").update({ payment_status: "paid" }).eq("id", bookingId);
    }
    return ok();
  } catch (e) {
    console.error("[mercadopago-webhook]", e);
    return ok();
  }
});

function ok() { return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
