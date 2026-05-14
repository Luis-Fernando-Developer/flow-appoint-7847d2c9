// Public signup endpoint. Creates company in pending_payment, auth user,
// employee, and the first Asaas subscription + charge with a server-validated
// price (read from subscription_plans). Returns first charge details so the
// frontend can show PIX QR / boleto / card status.
//
// Body: {
//   company: { name, slug, owner_name, owner_email, owner_phone?, cpf_cnpj, cnpj? },
//   password: string,
//   plan_id: string,
//   billing_period: "monthly" | "quarterly" | "annual",
//   billing_type: "PIX" | "BOLETO" | "CREDIT_CARD",
//   credit_card?: { holderName, number, expiryMonth, expiryYear, ccv },
//   credit_card_holder_info?: { name, email, cpfCnpj, postalCode, addressNumber, phone }
// }
import { createClient } from "npm:@supabase/supabase-js@2";
import { asaas, corsHeaders, findOrCreateCustomer, addDays } from "../_shared/asaas.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json();
    const {
      company,
      password,
      plan_id,
      billing_period = "monthly",
      billing_type = "PIX",
      credit_card,
      credit_card_holder_info,
    } = body || {};

    // ── Validate input
    if (!company?.name || !company?.slug || !company?.owner_email || !company?.owner_name) {
      return json({ error: "Dados da empresa incompletos." }, 400);
    }
    if (!password || password.length < 8) {
      return json({ error: "Senha inválida (mínimo 8 caracteres)." }, 400);
    }
    if (!company.cpf_cnpj) {
      return json({ error: "CPF/CNPJ obrigatório para gerar cobrança." }, 400);
    }
    if (!plan_id) return json({ error: "Plano obrigatório." }, 400);
    if (!["monthly", "quarterly", "annual"].includes(billing_period)) {
      return json({ error: "Periodicidade inválida." }, 400);
    }
    if (!["PIX", "BOLETO", "CREDIT_CARD"].includes(billing_type)) {
      return json({ error: "Forma de pagamento inválida." }, 400);
    }
    if (billing_type === "CREDIT_CARD" && (!credit_card || !credit_card_holder_info)) {
      return json({ error: "Dados do cartão obrigatórios." }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Slug must be unique
    const { data: slugTaken } = await admin
      .from("companies")
      .select("id")
      .eq("slug", company.slug)
      .maybeSingle();
    if (slugTaken) return json({ error: "URL personalizada já está em uso." }, 409);

    // ── Server-side price from DB (source of truth)
    const { data: plan, error: planErr } = await admin
      .from("subscription_plans")
      .select("*")
      .eq("id", plan_id)
      .eq("is_active", true)
      .maybeSingle();
    if (planErr || !plan) return json({ error: "Plano não encontrado." }, 404);

    const value =
      billing_period === "annual" ? Number(plan.annual_price) :
      billing_period === "quarterly" ? Number(plan.quarterly_price) :
      Number(plan.monthly_price);
    if (!value || value <= 0) return json({ error: "Plano sem valor configurado." }, 400);

    const cycle = billing_period === "annual" ? "YEARLY" : billing_period === "quarterly" ? "QUARTERLY" : "MONTHLY";

    // ── Create auth user (admin) — confirmed, but access is gated by company.status
    const { data: createdUser, error: userErr } = await admin.auth.admin.createUser({
      email: company.owner_email,
      password,
      email_confirm: true,
      user_metadata: { owner_name: company.owner_name, slug: company.slug },
    });
    if (userErr || !createdUser?.user?.id) {
      return json({ error: userErr?.message || "Não foi possível criar usuário." }, 400);
    }
    const userId = createdUser.user.id;

    // ── Create company in pending_payment
    const { data: companyRow, error: cErr } = await admin
      .from("companies")
      .insert([{
        name: company.name,
        slug: company.slug,
        owner_name: company.owner_name,
        owner_email: company.owner_email,
        owner_phone: company.owner_phone || null,
        status: "pending_payment",
      }])
      .select()
      .single();
    if (cErr || !companyRow) {
      // rollback auth
      await admin.auth.admin.deleteUser(userId);
      return json({ error: cErr?.message || "Falha ao criar empresa." }, 500);
    }

    // ── Employee (owner)
    await admin.from("employees").insert([{
      company_id: companyRow.id,
      user_id: userId,
      name: company.owner_name,
      email: company.owner_email,
      role: "owner",
      is_active: true,
    }]);

    // ── Chatbot stub (non-blocking)
    await admin.from("chatbot_integration").insert([{
      company_id: companyRow.id,
      builder_base_url: "https://talkbuilder.lovable.app",
      builder_workspace_slug: company.slug,
      is_active: false,
      talkmap_provisioned: false,
    }]);

    // ── Asaas customer + subscription
    let customerId: string;
    try {
      customerId = await findOrCreateCustomer({
        companyId: companyRow.id,
        name: company.owner_name,
        email: company.owner_email,
        phone: company.owner_phone,
        cpfCnpj: company.cpf_cnpj,
      });
    } catch (e: any) {
      return json({ error: `Gateway: ${e.message}` }, 400);
    }

    const nextDueDate = addDays(new Date(), 1);

    const subPayload: any = {
      customer: customerId,
      billingType: billing_type,
      value,
      nextDueDate,
      cycle,
      description: `${plan.name} - ${billing_period}`,
      externalReference: companyRow.id,
    };
    if (billing_type === "CREDIT_CARD") {
      subPayload.creditCard = credit_card;
      subPayload.creditCardHolderInfo = credit_card_holder_info;
    }

    let sub: any;
    try {
      sub = await asaas<any>("/subscriptions", {
        method: "POST",
        body: JSON.stringify(subPayload),
      });
    } catch (e: any) {
      return json({ error: `Gateway: ${e.message}` }, 400);
    }

    // ── Fetch first charge generated by the subscription
    let firstCharge: any = null;
    try {
      const list = await asaas<{ data: any[] }>(`/payments?subscription=${sub.id}&limit=1`);
      firstCharge = list?.data?.[0] || null;
    } catch { /* ignore */ }

    // ── PIX QR (if PIX and we have charge id)
    let pix: { encodedImage?: string; payload?: string; expirationDate?: string } | null = null;
    if (firstCharge?.id && billing_type === "PIX") {
      try {
        pix = await asaas(`/payments/${firstCharge.id}/pixQrCode`);
      } catch { /* ignore */ }
    }

    // ── Create company_subscriptions row in pending_payment
    await admin.from("company_subscriptions").insert([{
      company_id: companyRow.id,
      plan_id: plan.id,
      billing_period,
      original_price: value,
      status: "pending_payment",
      asaas_subscription_id: sub.id,
      next_billing_date: sub.nextDueDate,
      starts_at: new Date().toISOString(),
    }]);

    // ── Pre-store payment method record (will be marked default by webhook on confirm)
    if (billing_type !== "CREDIT_CARD") {
      await admin.from("company_payment_methods").insert([{
        company_id: companyRow.id,
        type: billing_type, // "PIX" | "BOLETO"
        asaas_customer_id: customerId,
        display_label: billing_type === "PIX" ? "PIX" : "Boleto bancário",
        is_default: false,
        is_active: true,
      }]);
    }

    // ── Mirror first invoice immediately (so the pending page can read it)
    if (firstCharge?.id) {
      await admin.from("company_invoices").insert([{
        company_id: companyRow.id,
        asaas_charge_id: firstCharge.id,
        amount: Number(firstCharge.value || value),
        status: "pending",
        billing_type: firstCharge.billingType || billing_type,
        due_date: firstCharge.dueDate,
        invoice_url: firstCharge.invoiceUrl || null,
        bank_slip_url: firstCharge.bankSlipUrl || null,
        pix_payload: pix?.payload || null,
        pix_qr_code: pix?.encodedImage || null,
        description: firstCharge.description || null,
        metadata: firstCharge,
      }]);
    }

    return json({
      ok: true,
      company_id: companyRow.id,
      slug: companyRow.slug,
      charge: firstCharge ? {
        id: firstCharge.id,
        billingType: firstCharge.billingType,
        value: firstCharge.value,
        dueDate: firstCharge.dueDate,
        invoiceUrl: firstCharge.invoiceUrl,
        bankSlipUrl: firstCharge.bankSlipUrl,
        pixEncodedImage: pix?.encodedImage || null,
        pixPayload: pix?.payload || null,
      } : null,
    });
  } catch (e: any) {
    console.error("[signup-with-payment]", e);
    return json({ error: e.message || "Erro inesperado." }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
