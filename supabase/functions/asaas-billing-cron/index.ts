// Daily cron: for subscriptions whose next_billing_date is in 3 days,
// apply pending_plan_change (if any) and ensure the next charge exists in Asaas.
// Asaas already auto-generates the next charge based on the subscription cycle,
// so this function syncs metadata + applies plan changes for the upcoming cycle.
import { createClient } from "npm:@supabase/supabase-js@2";
import { asaas, corsHeaders, addDays } from "../_shared/asaas.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const target = addDays(new Date(), 3);
    const { data: subs } = await admin
      .from("company_subscriptions")
      .select("*")
      .eq("next_billing_date", target)
      .eq("status", "active");

    let processed = 0;
    for (const sub of subs || []) {
      try {
        // Apply pending plan change to the upcoming cycle
        const pending: any = sub.pending_plan_change;
        if (pending?.plan_id && sub.asaas_subscription_id) {
          await asaas(`/subscriptions/${sub.asaas_subscription_id}`, {
            method: "POST",
            body: JSON.stringify({
              value: Number(pending.value),
              cycle: pending.billing_period === "annual" ? "YEARLY"
                : pending.billing_period === "quarterly" ? "QUARTERLY" : "MONTHLY",
            }),
          });
          await admin
            .from("company_subscriptions")
            .update({
              plan_id: pending.plan_id,
              billing_period: pending.billing_period,
              original_price: pending.value,
              pending_plan_change: null,
            })
            .eq("id", sub.id);
        }
        processed++;
      } catch (e) {
        console.error("[cron] sub", sub.id, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
