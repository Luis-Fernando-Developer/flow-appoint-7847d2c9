// Cria subconta Asaas para uma empresa (Modo Gerenciado).
// Recebe dados de KYC + dados bancários e devolve o status da subconta.
import { createClient } from "npm:@supabase/supabase-js@2";
import { asaas, corsHeaders } from "../_shared/asaas.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface OnboardBody {
  company_id: string;
  cpf_cnpj: string;
  email: string;
  name: string;
  birth_date?: string;
  mobile_phone?: string;
  address?: string;
  address_number?: string;
  province?: string;
  postal_code?: string;
  company_type?: string;
  income_value?: number;
  person_type?: "FISICA" | "JURIDICA";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as OnboardBody;
    if (!body.company_id || !body.cpf_cnpj || !body.email || !body.name) {
      return json({ error: "Campos obrigatórios faltando" }, 400);
    }

    // Already onboarded?
    const { data: existing } = await supabase
      .from("company_payment_accounts")
      .select("*")
      .eq("company_id", body.company_id)
      .maybeSingle();

    if (existing?.asaas_subaccount_id && existing.status === "active") {
      return json({ ok: true, account: existing, already: true });
    }

    // Create subaccount via Asaas /accounts endpoint
    const created = await asaas<any>(`/accounts`, {
      method: "POST",
      body: JSON.stringify({
        name: body.name,
        email: body.email,
        cpfCnpj: body.cpf_cnpj.replace(/\D/g, ""),
        birthDate: body.birth_date,
        companyType: body.company_type,
        mobilePhone: body.mobile_phone,
        address: body.address,
        addressNumber: body.address_number,
        province: body.province,
        postalCode: body.postal_code?.replace(/\D/g, ""),
      }),
    });

    const payload = {
      company_id: body.company_id,
      asaas_subaccount_id: created.id || created.accountNumber || null,
      asaas_wallet_id: created.walletId || null,
      asaas_api_key_encrypted: created.apiKey || null, // encrypt at rest later
      status: "active",
      cpf_cnpj: body.cpf_cnpj,
      onboarding_data: created,
    };

    if (existing) {
      await supabase
        .from("company_payment_accounts")
        .update(payload)
        .eq("company_id", body.company_id);
    } else {
      await supabase.from("company_payment_accounts").insert(payload);
    }

    // Ensure settings row + flip mode to managed
    await supabase
      .from("company_payment_settings")
      .upsert(
        { company_id: body.company_id, payment_mode: "asaas_managed" },
        { onConflict: "company_id" },
      );

    return json({ ok: true, account: payload });
  } catch (e: any) {
    console.error("[asaas-onboard-subaccount]", e);
    return json({ error: e.message || "erro" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
