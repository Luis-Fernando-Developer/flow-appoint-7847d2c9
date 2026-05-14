// Webhook do Stripe. Marca booking_payments como pago em checkout.session.completed.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/gateways.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const event = await req.json();
    const session = event?.data?.object;
    const ref = session?.client_reference_id || session?.metadata?.external_reference;
    if (!ref?.startsWith("booking:")) return ok();
    const bookingId = ref.split(":")[1];

    const t = event?.type || "";
    const paid =
      (t === "checkout.session.completed" && (session?.payment_status === "paid" || session?.status === "complete")) ||
      t === "checkout.session.async_payment_succeeded" ||
      t === "payment_intent.succeeded";

    if (paid) {
      await supabase.from("booking_payments").update({ status: "paid", paid_at: new Date().toISOString() }).eq("booking_id", bookingId);
      await supabase.from("bookings").update({ payment_status: "paid" }).eq("id", bookingId);
    }
    return ok();
  } catch (e) {
    console.error("[stripe-webhook]", e);
    return ok();
  }
});

function ok() { return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
