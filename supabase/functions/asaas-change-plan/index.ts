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

    // Lazy expiration de créditos
    await admin
      .from("company_credits")
      .update({ status: "expired" })
      .eq("company_id", company_id)
      .eq("status", "active")
      .lt("expires_at", new Date().toISOString());

    const { data: activeCredits } = await admin
      .from("company_credits")
      .select("*")
      .eq("company_id", company_id)
      .eq("status", "active")
      .order("expires_at", { ascending: true });
    const availableCredits = (activeCredits || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    const today = new Date();
    const cycleStart = sub.starts_at ? new Date(sub.starts_at) : today;
    const cycleEnd = sub.next_billing_date ? new Date(sub.next_billing_date) : addDaysDate(today, 30);

    const proration = calculateProration({
      currentPaidValue: Number(sub.original_price || currentValue),
      currentPeriod: (sub.billing_period as BillingPeriod) || "monthly",
      cycleStart,
      cycleEnd,
      newValue,
      newPeriod: period as BillingPeriod,
      availableCredits,
      now: today,
    });

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 12);

    if (proration.action === "upgrade") {
      // Atualiza assinatura no Asaas
      if (sub.asaas_subscription_id) {
        await asaas(`/subscriptions/${sub.asaas_subscription_id}`, {
          method: "POST",
          body: JSON.stringify({ value: newValue, cycle: cycleFor(period) }),
        });
      }

      // Consumir créditos (FIFO)
      let remaining = proration.creditsConsumed;
      for (const c of activeCredits || []) {
        if (remaining <= 0) break;
        const used = Math.min(Number(c.amount), remaining);
        const newAmount = toBRL(Number(c.amount) - used);
        await admin
          .from("company_credits")
          .update({
            amount: newAmount,
            status: newAmount <= 0.01 ? "used" : "active",
            used_at: newAmount <= 0.01 ? new Date().toISOString() : null,
          })
          .eq("id", c.id);
        remaining -= used;
      }

      // Cobrar diferença restante
      if (proration.chargeNow > 0) {
        const customerId = await getCustomerId(company_id);
        if (!customerId) return json({ error: "Cliente não encontrado no gateway" }, 400);
        const charge = await asaas<any>(`/payments`, {
          method: "POST",
          body: JSON.stringify({
            customer: customerId,
            billingType: "UNDEFINED",
            value: proration.chargeNow,
            dueDate: addDays(today, 1),
            description: `Upgrade para ${newPlan.name} (proporcional ${proration.details.daysRemaining}d)`,
            externalReference: company_id,
          }),
        });
        await admin.from("company_invoices").insert({
          company_id,
          subscription_id: sub.id,
          asaas_charge_id: charge.id,
          amount: proration.chargeNow,
          status: "pending",
          billing_type: charge.billingType,
          due_date: charge.dueDate,
          invoice_url: charge.invoiceUrl,
          bank_slip_url: charge.bankSlipUrl,
          description: charge.description,
          metadata: charge,
        });
      }

      await admin
        .from("company_subscriptions")
        .update({
          plan_id: new_plan_id,
          billing_period: period,
          original_price: newValue,
          pending_plan_change: null,
          starts_at: today.toISOString(),
          next_billing_date: proration.nextBillingDate.toISOString().slice(0, 10),
        })
        .eq("id", sub.id);

      return json({
        ok: true,
        action: "upgrade",
        chargeNow: proration.chargeNow,
        creditsConsumed: proration.creditsConsumed,
      });
    } else {
      // Downgrade: gera crédito imediatamente e agenda mudança no fim do ciclo
      // (mantém UX atual: cliente continua com plano maior até o fim do ciclo pago)
      if (proration.creditGenerated > 0) {
        await admin.from("company_credits").insert({
          company_id,
          amount: proration.creditGenerated,
          original_amount: proration.creditGenerated,
          reason: `Crédito proporcional gerado em downgrade para ${newPlan.name} (${proration.details.daysRemaining} dias restantes)`,
          source: "downgrade",
          status: "active",
          source_subscription_id: sub.id,
          expires_at: expiresAt.toISOString(),
        });
      }

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
      return json({
        ok: true,
        action: "downgrade",
        effective_at: effective,
        creditGenerated: proration.creditGenerated,
      });
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
