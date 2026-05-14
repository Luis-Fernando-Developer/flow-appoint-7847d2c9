// Shared Asaas API helper for all edge functions.
// Reads ASAAS_API_KEY and ASAAS_ENV from env.

const ENV = (Deno.env.get("ASAAS_ENV") || "sandbox").toLowerCase();
export const ASAAS_BASE =
  ENV === "production" || ENV === "prod"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";

const API_KEY = Deno.env.get("ASAAS_API_KEY") || "";

export async function asaas<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: API_KEY,
      "User-Agent": "FlowAppoint/1.0",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg =
      data?.errors?.[0]?.description ||
      data?.message ||
      `Asaas ${res.status}`;
    throw new Error(`[Asaas ${path}] ${msg}`);
  }
  return data as T;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, asaas-access-token",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

/**
 * Find or create an Asaas customer for a company.
 * Stores externalReference=company.id so we can re-find later.
 */
export async function findOrCreateCustomer(opts: {
  companyId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  cpfCnpj?: string | null;
}): Promise<string> {
  // Try to find by externalReference
  const search = await asaas<{ data: any[] }>(
    `/customers?externalReference=${encodeURIComponent(opts.companyId)}&limit=1`,
  );
  if (search?.data?.[0]?.id) return search.data[0].id;

  if (!opts.cpfCnpj) {
    throw new Error(
      "CPF/CNPJ obrigatório para criar cliente no gateway na primeira vez.",
    );
  }

  const created = await asaas<{ id: string }>(`/customers`, {
    method: "POST",
    body: JSON.stringify({
      name: opts.name,
      email: opts.email || undefined,
      mobilePhone: opts.phone || undefined,
      cpfCnpj: opts.cpfCnpj,
      externalReference: opts.companyId,
      notificationDisabled: false,
    }),
  });
  return created.id;
}

export function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function toBRL(n: number): number {
  return Math.round(n * 100) / 100;
}
