// Change plan: upgrade (immediate proration) or downgrade (scheduled at next_billing_date).
// Body: { company_id, new_plan_id, billing_period? }
import { createClient } from "npm:@supabase/supabase-js@2";
import { asaas, corsHeaders, addDays, toBRL } from "../_shared/asaas.ts";
import { calculateProration, type BillingPeriod } from "../_shared/proration.ts";

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

    const { company_id, new_plan_id, billing_period } = await req.json();
    if (!company_id || !new_plan_id) return json({ error: "params" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sub } = await admin
      .from("company_subscriptions")
      .select("*, subscription_plans(*)")
      .eq("company_id", company_id)
      .maybeSingle();
    if (!sub) return json({ error: "Sem assinatura ativa" }, 400);

    const { data: newPlan } = await admin
      .from("subscription_plans")
      .select("*")
      .eq("id", new_plan_id)
      .single();
    if (!newPlan) return json({ error: "Plano não encontrado" }, 404);

    const period = billing_period || sub.billing_period;
    const newValue = priceForPeriod(newPlan, period);
    const currentValue = Number(sub.original_price || 0);

    // Block upgrade if there's an overdue invoice
    if (newValue > currentValue) {
      const { data: overdue } = await admin
        .from("company_invoices")
        .select("id")
        .eq("company_id", company_id)
        .eq("status", "overdue")
        .limit(1);
      if (overdue?.length) {
        return json({ error: "Existe fatura vencida em aberto. Quite antes de fazer upgrade." }, 400);
      }
    }

    const action = newValue > currentValue ? "upgrade" : "downgrade";

    if (action === "upgrade") {
      // Proration: charge the difference for remaining days
      const today = new Date();
      const nextBilling = sub.next_billing_date ? new Date(sub.next_billing_date) : addDaysDate(today, 30);
      const cycleDays = period === "annual" ? 365 : period === "quarterly" ? 90 : 30;
      const daysRemaining = Math.max(1, Math.ceil((nextBilling.getTime() - today.getTime()) / 86400000));
      const diff = toBRL(((newValue - currentValue) * daysRemaining) / cycleDays);

      // Update Asaas subscription value/cycle for next cycle
      if (sub.asaas_subscription_id) {
        await asaas(`/subscriptions/${sub.asaas_subscription_id}`, {
          method: "POST",
          body: JSON.stringify({
            value: newValue,
            cycle: cycleFor(period),
          }),
        });
      }

      // Find customer to bill
      const customerId = await getCustomerId(company_id);
      if (!customerId) return json({ error: "Cliente não encontrado no gateway" }, 400);

      // Create one-off charge for proration if > 0
      if (diff > 0) {
        const charge = await asaas<any>(`/payments`, {
          method: "POST",
          body: JSON.stringify({
            customer: customerId,
            billingType: "UNDEFINED",
            value: diff,
            dueDate: addDays(today, 1),
            description: `Upgrade para ${newPlan.name} (proporcional ${daysRemaining}d)`,
            externalReference: company_id,
          }),
        });
        await admin.from("company_invoices").insert({
          company_id,
          subscription_id: sub.id,
          asaas_charge_id: charge.id,
          amount: diff,
          status: "pending",
          billing_type: charge.billingType,
          due_date: charge.dueDate,
          invoice_url: charge.invoiceUrl,
          bank_slip_url: charge.bankSlipUrl,
          description: charge.description,
          metadata: charge,
        });
      }

      // Apply plan change immediately (we charged the diff)
      await admin
        .from("company_subscriptions")
        .update({
          plan_id: new_plan_id,
          billing_period: period,
          original_price: newValue,
          pending_plan_change: null,
        })
        .eq("id", sub.id);

      return json({ ok: true, action, proration: diff });
    } else {
      // Downgrade: schedule
      const effective = sub.next_billing_date || addDays(new Date(), 30);
      await admin
        .from("company_subscriptions")
        .update({
          pending_plan_change: {
            plan_id: new_plan_id,
            billing_period: period,
            value: newValue,
            effective_at: effective,
          },
        })
        .eq("id", sub.id);
      return json({ ok: true, action, effective_at: effective });
    }
  } catch (e: any) {
    console.error(e);
    return json({ error: e.message }, 500);
  }
});

async function getCustomerId(companyId: string): Promise<string | null> {
  const r = await asaas<{ data: any[] }>(
    `/customers?externalReference=${encodeURIComponent(companyId)}&limit=1`,
  );
  return r?.data?.[0]?.id || null;
}

function priceForPeriod(plan: any, period: string): number {
  if (period === "annual") return Number(plan.annual_price);
  if (period === "quarterly") return Number(plan.quarterly_price);
  return Number(plan.monthly_price);
}
function cycleFor(period: string) {
  return period === "annual" ? "YEARLY" : period === "quarterly" ? "QUARTERLY" : "MONTHLY";
}
function addDaysDate(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
