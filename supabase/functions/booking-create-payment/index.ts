// Cria cobrança no gateway próprio configurado pela empresa.
// Provedores suportados: asaas, mercadopago, stripe, pagarme.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createCharge, corsHeaders, PROVIDER_METHODS, type Method, type Provider } from "../_shared/gateways.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface Body {
  booking_id: string;
  method: Method;
  payer: { name: string; email?: string; phone?: string; cpf_cnpj?: string };
  return_url?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body.booking_id || !body.method) return json({ error: "campos obrigatórios" }, 400);

    const { data: booking, error: berr } = await supabase
      .from("bookings")
      .select("id, company_id, client_id, service_id, services(name, price), companies(name)")
      .eq("id", body.booking_id)
      .single();
    if (berr || !booking) return json({ error: "booking não encontrado" }, 404);

    const amount = Number((booking as any).services?.price || 0);
    if (amount <= 0) return json({ error: "serviço sem preço" }, 400);

    const { data: settings } = await supabase
      .from("company_payment_settings")
      .select("*")
      .eq("company_id", booking.company_id)
      .maybeSingle();

    if (settings?.payment_mode !== "own_gateway") return json({ error: "Empresa não aceita pagamento online" }, 400);

    const provider = (settings?.own_gateway_provider || "asaas").toLowerCase() as Provider;
    if (!PROVIDER_METHODS[provider]) return json({ error: "Provedor inválido" }, 400);
    if (!PROVIDER_METHODS[provider].includes(body.method)) {
      return json({ error: `Método ${body.method} não suportado por ${provider}` }, 400);
    }

    const accepted = (settings?.accepted_methods || {}) as Record<string, boolean>;
    const methodKey = body.method === "PIX" ? "pix"
      : body.method === "CREDIT_CARD" ? "credit_card"
      : body.method === "DEBIT_CARD" ? "debit_card" : "boleto";
    if (!accepted[methodKey]) return json({ error: "Método não aceito por esta empresa" }, 400);

    if (!settings?.own_gateway_api_key_encrypted) return json({ error: "Empresa sem gateway configurado" }, 400);

    const { data: decKey, error: decErr } = await supabase.rpc("decrypt_chatbot_key", {
      p_cipher: settings.own_gateway_api_key_encrypted,
      p_secret: "asaas-own-gateway",
    });
    if (decErr || !decKey) return json({ error: "Falha ao ler chave do gateway" }, 500);

    const { data: client } = await supabase
      .from("clients")
      .select("id, name, email, phone, cpf")
      .eq("id", booking.client_id)
      .maybeSingle();

    const charge = await createCharge(provider, decKey as string, {
      amount,
      description: `${(booking as any).services?.name || "Serviço"} — ${(booking as any).companies?.name || ""}`,
      externalReference: `booking:${booking.id}`,
      method: body.method,
      payer: {
        name: body.payer.name || client?.name || "Cliente",
        email: body.payer.email || client?.email || undefined,
        phone: body.payer.phone || client?.phone || undefined,
        cpf_cnpj: body.payer.cpf_cnpj || client?.cpf || undefined,
      },
      successUrl: body.return_url,
      cancelUrl: body.return_url,
    });

    const paymentRow = {
      booking_id: booking.id,
      company_id: booking.company_id,
      amount,
      status: "pending",
      method: methodKey,
      asaas_charge_id: charge.externalId,
      invoice_url: charge.invoice_url,
      bank_slip_url: charge.bank_slip_url,
      pix_qr_code: charge.pix_qr_code,
      pix_payload: charge.pix_payload,
      platform_fee_amount: 0,
      metadata: { provider, billingType: body.method },
    };

    await supabase.from("booking_payments").delete().eq("booking_id", booking.id);
    const { error: insErr } = await supabase.from("booking_payments").insert(paymentRow);
    if (insErr) console.error("[booking-create-payment] insert error", insErr);

    await supabase.from("bookings").update({ payment_status: "pending" }).eq("id", booking.id);

    return json({
      ok: true,
      payment: {
        id: charge.externalId,
        invoice_url: charge.invoice_url,
        bank_slip_url: charge.bank_slip_url,
        pix_qr_code: charge.pix_qr_code,
        pix_payload: charge.pix_payload,
        amount,
        method: body.method,
        provider,
      },
    });
  } catch (e: any) {
    console.error("[booking-create-payment]", e);
    return json({ error: e.message || "erro" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
