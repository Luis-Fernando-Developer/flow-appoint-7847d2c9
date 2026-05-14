// Asaas webhook: validates token via 'asaas-access-token' header,
// then mirrors payment events into company_invoices and triggers
// downstream side effects (set default payment method, billing date sync,
// and overdue suspension).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/asaas.ts";

const WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN") || "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = req.headers.get("asaas-access-token");
  if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) {
    return json({ error: "invalid token" }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const event: string = body?.event || "";
  const payment = body?.payment;
  const subscription = body?.subscription;

  try {
    if (event.startsWith("PAYMENT_") && payment) {
      await handlePayment(event, payment);
    } else if (event.startsWith("SUBSCRIPTION_") && subscription) {
      await handleSubscription(event, subscription);
    }
    return json({ ok: true });
  } catch (e: any) {
    console.error("[asaas-webhook] error", e);
    return json({ error: e.message }, 500);
  }
});

async function handlePayment(event: string, p: any) {
  const status = mapPaymentStatus(event, p.status);
  // Find invoice via asaas_charge_id
  const { data: existing } = await supabase
    .from("company_invoices")
    .select("id, company_id, subscription_id")
    .eq("asaas_charge_id", p.id)
    .maybeSingle();

  let companyId = existing?.company_id;
  let subscriptionId = existing?.subscription_id;

  // If missing, try to derive company from subscription externalReference
  if (!companyId && p.subscription) {
    const { data: sub } = await supabase
      .from("company_subscriptions")
      .select("id, company_id")
      .eq("asaas_subscription_id", p.subscription)
      .maybeSingle();
    companyId = sub?.company_id;
    subscriptionId = sub?.id;
  }
  if (!companyId) {
    console.warn("[webhook] payment without company match", p.id);
    return;
  }

  const row = {
    company_id: companyId,
    subscription_id: subscriptionId,
    asaas_charge_id: p.id,
    amount: Number(p.value || 0),
    status,
    billing_type: p.billingType || null,
    due_date: p.dueDate,
    paid_at: p.paymentDate
      ? new Date(p.paymentDate).toISOString()
      : status === "paid"
        ? new Date().toISOString()
        : null,
    invoice_url: p.invoiceUrl || null,
    bank_slip_url: p.bankSlipUrl || null,
    description: p.description || null,
    metadata: p,
  };

  if (existing) {
    await supabase.from("company_invoices").update(row).eq("id", existing.id);
  } else {
    await supabase.from("company_invoices").insert(row);
  }

  // Side effects
  if (status === "paid") {
    // Activate company on first confirmed payment
    await supabase
      .from("companies")
      .update({ status: "active" })
      .eq("id", companyId)
      .eq("status", "pending_payment");

    // Activate the subscription if it was pending
    if (subscriptionId) {
      await supabase
        .from("company_subscriptions")
        .update({ status: "active" })
        .eq("id", subscriptionId)
        .in("status", ["pending_payment", "pending", "past_due"]);
    }

    // Mark payment method as default — by token (card) or by billing_type
    if (p.creditCard?.creditCardToken) {
      await markDefaultByToken(companyId, p.creditCard.creditCardToken);
    } else if (p.billingType === "PIX" || p.billingType === "BOLETO") {
      await markDefaultByType(companyId, p.billingType);
    }

    // Apply pending plan change
    if (subscriptionId) {
      const { data: sub } = await supabase
        .from("company_subscriptions")
        .select("pending_plan_change")
        .eq("id", subscriptionId)
        .maybeSingle();
      const pending = sub?.pending_plan_change as any;
      if (pending?.plan_id) {
        await supabase
          .from("company_subscriptions")
          .update({
            plan_id: pending.plan_id,
            pending_plan_change: null,
          })
          .eq("id", subscriptionId);
      }
    }
  }

  if (status === "overdue") {
    // Suspend after the first overdue
    if (subscriptionId) {
      await supabase
        .from("company_subscriptions")
        .update({ status: "past_due" })
        .eq("id", subscriptionId);
    }
  }
}

async function handleSubscription(event: string, s: any) {
  if (event === "SUBSCRIPTION_DELETED") {
    await supabase
      .from("company_subscriptions")
      .update({ status: "cancelled", asaas_subscription_id: null })
      .eq("asaas_subscription_id", s.id);
  } else if (s.nextDueDate) {
    await supabase
      .from("company_subscriptions")
      .update({ next_billing_date: s.nextDueDate })
      .eq("asaas_subscription_id", s.id);
  }
}

async function markDefaultByToken(companyId: string, token: string) {
  const { data } = await supabase
    .from("company_payment_methods")
    .select("id")
    .eq("company_id", companyId)
    .eq("asaas_token", token)
    .maybeSingle();
  if (data?.id) {
    await supabase
      .from("company_payment_methods")
      .update({ is_default: true })
      .eq("id", data.id);
  }
}

async function markDefaultByType(companyId: string, type: string) {
  // Clear other defaults
  await supabase
    .from("company_payment_methods")
    .update({ is_default: false })
    .eq("company_id", companyId);
  const { data } = await supabase
    .from("company_payment_methods")
    .select("id")
    .eq("company_id", companyId)
    .eq("type", type)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.id) {
    await supabase
      .from("company_payment_methods")
      .update({ is_default: true })
      .eq("id", data.id);
  } else {
    await supabase.from("company_payment_methods").insert([{
      company_id: companyId,
      type,
      display_label: type === "PIX" ? "PIX" : "Boleto bancário",
      is_default: true,
      is_active: true,
    }]);
  }
}

function mapPaymentStatus(event: string, status: string): string {
  if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") return "paid";
  if (event === "PAYMENT_OVERDUE") return "overdue";
  if (event === "PAYMENT_REFUNDED") return "refunded";
  if (event === "PAYMENT_DELETED") return "cancelled";
  switch (status) {
    case "RECEIVED":
    case "CONFIRMED":
      return "paid";
    case "OVERDUE":
      return "overdue";
    case "REFUNDED":
      return "refunded";
    case "DELETED":
      return "cancelled";
    default:
      return "pending";
  }
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
