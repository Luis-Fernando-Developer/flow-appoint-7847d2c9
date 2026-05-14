// Cria cobrança no Asaas para um agendamento usando a API key da própria empresa.
// Modos suportados:
// - own_gateway: usa key própria descriptografada da empresa
// - none: erro (não permite gerar pagamento)
import { createClient } from "npm:@supabase/supabase-js@2";
import { asaas, corsHeaders, findOrCreateClientCustomer, addDays } from "../_shared/asaas.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface Body {
  booking_id: string;
  method: "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "BOLETO";
  payer: {
    name: string;
    email?: string;
    phone?: string;
    cpf_cnpj?: string;
  };
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

    const mode = settings?.payment_mode || "none";
    if (mode !== "own_gateway") {
      return json({ error: "Empresa não aceita pagamento online" }, 400);
    }

    const accepted = (settings?.accepted_methods || {}) as Record<string, boolean>;
    const methodKey = body.method === "PIX" ? "pix"
      : body.method === "CREDIT_CARD" ? "credit_card"
      : body.method === "DEBIT_CARD" ? "debit_card" : "boleto";
    if (!accepted[methodKey]) return json({ error: "Método não aceito por esta empresa" }, 400);

    if (!settings?.own_gateway_api_key_encrypted) {
      return json({ error: "Empresa sem gateway configurado" }, 400);
    }

    // Decrypt API key via RPC
    const { data: decKey, error: decErr } = await supabase.rpc("decrypt_chatbot_key", {
      p_cipher: settings.own_gateway_api_key_encrypted,
      p_secret: "asaas-own-gateway",
    });
    if (decErr || !decKey) return json({ error: "Falha ao ler chave do gateway" }, 500);
    const overrideKey = decKey as string;

    const { data: client } = await supabase
      .from("clients")
      .select("id, name, email, phone, cpf")
      .eq("id", booking.client_id)
      .maybeSingle();

    const customerId = await findOrCreateClientCustomer({
      clientId: client?.id || booking.client_id || "anon",
      name: body.payer.name || client?.name || "Cliente",
      email: body.payer.email || client?.email,
      phone: body.payer.phone || client?.phone,
      cpfCnpj: body.payer.cpf_cnpj || client?.cpf,
    }, overrideKey);

    const dueDate = addDays(new Date(), body.method === "BOLETO" ? 3 : 1);
    const charge = await asaas<any>(`/payments`, {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType: body.method,
        value: amount,
        dueDate,
        description: `${(booking as any).services?.name || "Serviço"} — ${(booking as any).companies?.name || ""}`,
        externalReference: `booking:${booking.id}`,
      }),
    }, overrideKey);

    let pixQr: string | null = null;
    let pixPayload: string | null = null;
    if (body.method === "PIX") {
      try {
        const qr = await asaas<any>(`/payments/${charge.id}/pixQrCode`, {}, overrideKey);
        pixQr = qr.encodedImage ? `data:image/png;base64,${qr.encodedImage}` : null;
        pixPayload = qr.payload || null;
      } catch (_) { /* ignore */ }
    }

    const paymentRow = {
      booking_id: booking.id,
      company_id: booking.company_id,
      amount,
      status: "pending",
      method: methodKey,
      asaas_charge_id: charge.id,
      invoice_url: charge.invoiceUrl || null,
      bank_slip_url: charge.bankSlipUrl || null,
      pix_qr_code: pixQr,
      pix_payload: pixPayload,
      platform_fee_amount: 0,
      metadata: { mode, billingType: body.method },
    };

    await supabase.from("booking_payments").delete().eq("booking_id", booking.id);
    const { error: insErr } = await supabase.from("booking_payments").insert(paymentRow);
    if (insErr) console.error("[booking-create-payment] insert error", insErr);

    await supabase
      .from("bookings")
      .update({ payment_status: "pending" })
      .eq("id", booking.id);

    return json({
      ok: true,
      payment: {
        id: charge.id,
        invoice_url: charge.invoiceUrl,
        bank_slip_url: charge.bankSlipUrl,
        pix_qr_code: pixQr,
        pix_payload: pixPayload,
        amount,
        method: body.method,
      },
    });
  } catch (e: any) {
    console.error("[booking-create-payment]", e);
    return json({ error: e.message || "erro" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
