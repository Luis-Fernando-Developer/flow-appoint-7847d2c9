// Webhook do Pagar.me. Marca booking_payments como pago em order.paid / charge.paid.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/gateways.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const event = await req.json();
    const data = event?.data;
    const ref = data?.code || data?.order?.code || data?.metadata?.external_reference;
    if (!ref?.startsWith?.("booking:")) return ok();
    const bookingId = ref.split(":")[1];

    const t = event?.type || "";
    const status = data?.status || data?.order?.status;
    const paid = t.endsWith(".paid") || status === "paid";

    if (paid) {
      await supabase.from("booking_payments").update({ status: "paid", paid_at: new Date().toISOString() }).eq("booking_id", bookingId);
      await supabase.from("bookings").update({ payment_status: "paid" }).eq("id", bookingId);
    }
    return ok();
  } catch (e) {
    console.error("[pagarme-webhook]", e);
    return ok();
  }
});

function ok() { return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
