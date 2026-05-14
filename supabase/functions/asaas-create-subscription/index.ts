// Creates an Asaas subscription for a company on a paid plan.
// Body: { company_id, plan_id, billing_period, billing_type, cpf_cnpj?, credit_card?, credit_card_holder_info? }
import { createClient } from "npm:@supabase/supabase-js@2";
import { asaas, corsHeaders, findOrCreateCustomer, addDays } from "../_shared/asaas.ts";

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

    const body = await req.json();
    const {
      company_id,
      plan_id,
      billing_period = "monthly",
      billing_type = "PIX", // PIX | CREDIT_CARD | DEBIT_CARD
      cpf_cnpj,
      credit_card,
      credit_card_holder_info,
    } = body || {};
    if (!company_id || !plan_id) return json({ error: "company_id e plan_id obrigatórios" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: company } = await admin.from("companies").select("*").eq("id", company_id).single();
    if (!company) return json({ error: "Empresa não encontrada" }, 404);

    const { data: plan } = await admin.from("subscription_plans").select("*").eq("id", plan_id).single();
    if (!plan) return json({ error: "Plano não encontrado" }, 404);

    const value =
      billing_period === "annual" ? Number(plan.annual_price) :
      billing_period === "quarterly" ? Number(plan.quarterly_price) :
      Number(plan.monthly_price);

    const cycle = billing_period === "annual" ? "YEARLY" : billing_period === "quarterly" ? "QUARTERLY" : "MONTHLY";

    const customerId = await findOrCreateCustomer({
      companyId: company.id,
      name: company.name,
      email: company.owner_email,
      phone: company.owner_phone,
      cpfCnpj: cpf_cnpj,
    });

    const nextDueDate = addDays(new Date(), 1);

    const subPayload: any = {
      customer: customerId,
      billingType: billing_type,
      value,
      nextDueDate,
      cycle,
      description: `${plan.name} - ${billing_period}`,
      externalReference: company.id,
    };
    if (billing_type === "CREDIT_CARD" && credit_card) {
      subPayload.creditCard = credit_card;
      subPayload.creditCardHolderInfo = credit_card_holder_info;
    }

    const sub = await asaas<any>("/subscriptions", {
      method: "POST",
      body: JSON.stringify(subPayload),
    });

    // Upsert company_subscriptions
    const { data: existing } = await admin
      .from("company_subscriptions")
      .select("id")
      .eq("company_id", company.id)
      .maybeSingle();

    const subRow = {
      company_id: company.id,
      plan_id: plan.id,
      billing_period,
      original_price: value,
      status: "active",
      asaas_subscription_id: sub.id,
      next_billing_date: sub.nextDueDate,
      starts_at: new Date().toISOString(),
    };

    if (existing) {
      await admin.from("company_subscriptions").update(subRow).eq("id", existing.id);
    } else {
      await admin.from("company_subscriptions").insert(subRow);
    }

    return json({ ok: true, subscription: sub });
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
