// Unified gateway adapter for own-gateway flows.
// Supports: asaas, mercadopago, stripe, pagarme
//
// Two operations exposed:
//   validateKey(provider, apiKey) -> { account_name, account_email? }
//   createCharge(provider, apiKey, params) -> { externalId, invoice_url, bank_slip_url?, pix_qr_code?, pix_payload? }

export type Provider = "asaas" | "mercadopago" | "stripe" | "pagarme";
export type Method = "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "BOLETO";

export const PROVIDER_METHODS: Record<Provider, Method[]> = {
  asaas: ["PIX", "CREDIT_CARD", "DEBIT_CARD", "BOLETO"],
  mercadopago: ["PIX", "CREDIT_CARD", "DEBIT_CARD", "BOLETO"],
  stripe: ["CREDIT_CARD", "BOLETO"],
  pagarme: ["PIX", "CREDIT_CARD", "DEBIT_CARD", "BOLETO"],
};

export interface ChargeParams {
  amount: number; // in BRL (decimal)
  description: string;
  externalReference: string; // booking:<id>
  method: Method;
  payer: { name: string; email?: string; phone?: string; cpf_cnpj?: string };
  successUrl?: string;
  cancelUrl?: string;
}

export interface ChargeResult {
  externalId: string;
  invoice_url: string | null;
  bank_slip_url: string | null;
  pix_qr_code: string | null;
  pix_payload: string | null;
}

// ---------------- ASAAS ----------------
const ASAAS_BASE = (Deno.env.get("ASAAS_ENV") || "sandbox").toLowerCase().startsWith("prod")
  ? "https://api.asaas.com/v3"
  : "https://api-sandbox.asaas.com/v3";

async function asaasFetch(key: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`${ASAAS_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", access_token: key, ...(init.headers || {}) },
  });
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!r.ok) throw new Error(`[asaas ${path}] ${data?.errors?.[0]?.description || data?.message || r.status}`);
  return data;
}

async function asaasValidate(key: string) {
  const acc = await asaasFetch(key, `/myAccount`);
  return { account_name: acc?.name || acc?.email || "Conta Asaas", account_email: acc?.email || null };
}

async function asaasCreate(key: string, p: ChargeParams): Promise<ChargeResult> {
  // find/create customer
  const ref = `booking-payer:${(p.payer.cpf_cnpj || p.payer.email || p.payer.name || "anon").replace(/\s+/g, "_")}`;
  let customerId: string;
  const search = await asaasFetch(key, `/customers?externalReference=${encodeURIComponent(ref)}&limit=1`);
  if (search?.data?.[0]?.id) customerId = search.data[0].id;
  else {
    const created = await asaasFetch(key, `/customers`, {
      method: "POST",
      body: JSON.stringify({
        name: p.payer.name,
        email: p.payer.email,
        mobilePhone: p.payer.phone,
        cpfCnpj: p.payer.cpf_cnpj,
        externalReference: ref,
      }),
    });
    customerId = created.id;
  }
  const due = new Date(); due.setDate(due.getDate() + (p.method === "BOLETO" ? 3 : 1));
  const charge = await asaasFetch(key, `/payments`, {
    method: "POST",
    body: JSON.stringify({
      customer: customerId,
      billingType: p.method,
      value: p.amount,
      dueDate: due.toISOString().slice(0, 10),
      description: p.description,
      externalReference: p.externalReference,
    }),
  });
  let pixQr: string | null = null, pixPayload: string | null = null;
  if (p.method === "PIX") {
    try {
      const qr = await asaasFetch(key, `/payments/${charge.id}/pixQrCode`);
      pixQr = qr.encodedImage ? `data:image/png;base64,${qr.encodedImage}` : null;
      pixPayload = qr.payload || null;
    } catch (_) {}
  }
  return {
    externalId: charge.id,
    invoice_url: charge.invoiceUrl || null,
    bank_slip_url: charge.bankSlipUrl || null,
    pix_qr_code: pixQr,
    pix_payload: pixPayload,
  };
}

// ---------------- MERCADO PAGO ----------------
async function mpValidate(key: string) {
  const r = await fetch("https://api.mercadopago.com/users/me", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!r.ok) throw new Error(`[mercadopago] chave inválida (${r.status})`);
  const u = await r.json();
  return { account_name: u?.nickname || u?.first_name || u?.email || "Conta Mercado Pago", account_email: u?.email || null };
}

async function mpCreate(key: string, p: ChargeParams): Promise<ChargeResult> {
  // Use Checkout Pro Preference — funciona para todos os métodos via página hospedada do MP.
  const methodMap: Record<Method, string[]> = {
    PIX: ["pix"],
    CREDIT_CARD: ["credit_card"],
    DEBIT_CARD: ["debit_card"],
    BOLETO: ["ticket"],
  };
  const exclude = (["credit_card", "debit_card", "ticket", "atm", "bank_transfer"] as string[])
    .filter((t) => !methodMap[p.method].includes(t))
    .map((id) => ({ id }));

  const body: any = {
    items: [{ title: p.description.slice(0, 250), quantity: 1, unit_price: Number(p.amount.toFixed(2)), currency_id: "BRL" }],
    payer: {
      name: p.payer.name,
      email: p.payer.email,
      identification: p.payer.cpf_cnpj
        ? { type: p.payer.cpf_cnpj.replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF", number: p.payer.cpf_cnpj.replace(/\D/g, "") }
        : undefined,
    },
    external_reference: p.externalReference,
    payment_methods: { excluded_payment_types: exclude, installments: 1 },
    back_urls: { success: p.successUrl, failure: p.cancelUrl, pending: p.successUrl },
    auto_return: "approved",
  };
  const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`[mercadopago] ${data?.message || r.status}`);
  const url = data.init_point || data.sandbox_init_point;
  return { externalId: data.id, invoice_url: url, bank_slip_url: p.method === "BOLETO" ? url : null, pix_qr_code: null, pix_payload: null };
}

// ---------------- STRIPE ----------------
async function stripeFetch(key: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", ...(init.headers || {}) },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`[stripe ${path}] ${data?.error?.message || r.status}`);
  return data;
}

function form(obj: Record<string, any>, prefix = ""): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => parts.push(typeof item === "object" ? form(item, `${key}[${i}]`) : `${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(item)}`));
    } else if (typeof v === "object") {
      parts.push(form(v, key));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
    }
  }
  return parts.join("&");
}

async function stripeValidate(key: string) {
  const acc = await stripeFetch(key, "/account");
  return { account_name: acc?.business_profile?.name || acc?.settings?.dashboard?.display_name || acc?.email || "Conta Stripe", account_email: acc?.email || null };
}

async function stripeCreate(key: string, p: ChargeParams): Promise<ChargeResult> {
  const pmTypes = p.method === "BOLETO" ? ["boleto"] : ["card"];
  const body: Record<string, any> = {
    mode: "payment",
    "payment_method_types[0]": pmTypes[0],
    "line_items[0][price_data][currency]": "brl",
    "line_items[0][price_data][product_data][name]": p.description.slice(0, 250),
    "line_items[0][price_data][unit_amount]": Math.round(p.amount * 100),
    "line_items[0][quantity]": 1,
    client_reference_id: p.externalReference,
    customer_email: p.payer.email,
    success_url: p.successUrl || "https://example.com/success",
    cancel_url: p.cancelUrl || "https://example.com/cancel",
    "metadata[external_reference]": p.externalReference,
  };
  const params = Object.entries(body).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`[stripe] ${data?.error?.message || r.status}`);
  return { externalId: data.id, invoice_url: data.url, bank_slip_url: null, pix_qr_code: null, pix_payload: null };
}

// ---------------- PAGAR.ME ----------------
function pagarmeAuth(key: string) {
  return `Basic ${btoa(`${key}:`)}`;
}

async function pagarmeValidate(key: string) {
  // Pagar.me v5 não tem /me público; tentamos listar 1 cliente como ping.
  const r = await fetch("https://api.pagar.me/core/v5/customers?size=1", {
    headers: { Authorization: pagarmeAuth(key) },
  });
  if (r.status === 401 || r.status === 403) throw new Error(`[pagarme] chave inválida`);
  if (!r.ok) throw new Error(`[pagarme] ${r.status}`);
  return { account_name: "Conta Pagar.me", account_email: null };
}

async function pagarmeCreate(key: string, p: ChargeParams): Promise<ChargeResult> {
  // Usa Checkout (link de pagamento) para uniformizar UX.
  const paymentMethods: Record<Method, string> = {
    PIX: "pix",
    CREDIT_CARD: "credit_card",
    DEBIT_CARD: "debit_card",
    BOLETO: "boleto",
  };
  const acceptedMethod = paymentMethods[p.method];
  const body: any = {
    items: [{ amount: Math.round(p.amount * 100), description: p.description.slice(0, 256), quantity: 1, code: p.externalReference }],
    customer: {
      name: p.payer.name,
      email: p.payer.email,
      type: (p.payer.cpf_cnpj || "").replace(/\D/g, "").length > 11 ? "company" : "individual",
      document: p.payer.cpf_cnpj?.replace(/\D/g, ""),
      phones: p.payer.phone ? { mobile_phone: { country_code: "55", area_code: p.payer.phone.replace(/\D/g, "").slice(0, 2), number: p.payer.phone.replace(/\D/g, "").slice(2) } } : undefined,
    },
    payments: [{
      payment_method: "checkout",
      checkout: {
        accepted_payment_methods: [acceptedMethod],
        success_url: p.successUrl || "https://example.com/success",
        expires_in: 3600,
        skip_checkout_success_page: false,
        customer_editable: false,
        ...(acceptedMethod === "pix" ? { pix: { expires_in: 3600 } } : {}),
        ...(acceptedMethod === "boleto" ? { boleto: { due_at: new Date(Date.now() + 3 * 86400_000).toISOString() } } : {}),
        ...(acceptedMethod === "credit_card" ? { credit_card: { installments: [{ number: 1, total: Math.round(p.amount * 100) }] } } : {}),
      },
    }],
    code: p.externalReference,
  };
  const r = await fetch("https://api.pagar.me/core/v5/orders", {
    method: "POST",
    headers: { Authorization: pagarmeAuth(key), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`[pagarme] ${data?.message || data?.errors?.[0]?.message || r.status}`);
  const checkoutUrl = data?.checkouts?.[0]?.payment_url || data?.checkouts?.[0]?.url || null;
  return { externalId: data.id, invoice_url: checkoutUrl, bank_slip_url: p.method === "BOLETO" ? checkoutUrl : null, pix_qr_code: null, pix_payload: null };
}

// ---------------- PUBLIC API ----------------
export async function validateKey(provider: Provider, key: string) {
  switch (provider) {
    case "asaas": return await asaasValidate(key);
    case "mercadopago": return await mpValidate(key);
    case "stripe": return await stripeValidate(key);
    case "pagarme": return await pagarmeValidate(key);
  }
}

export async function createCharge(provider: Provider, key: string, p: ChargeParams): Promise<ChargeResult> {
  switch (provider) {
    case "asaas": return await asaasCreate(key, p);
    case "mercadopago": return await mpCreate(key, p);
    case "stripe": return await stripeCreate(key, p);
    case "pagarme": return await pagarmeCreate(key, p);
  }
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};
