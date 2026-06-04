/**
 * Dispara sync do plano da empresa com o builder-flow-api.
 * Fire-and-forget: nunca bloqueia a UI; apenas loga falhas.
 */
import { getEdgeFunctionUrl } from "./supabaseHelpers";

export async function syncBuilderPlan(companyId: string): Promise<void> {
  if (!companyId) return;
  try {
    const res = await fetch(getEdgeFunctionUrl("sync-builder-plan"), {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ company_id: companyId }),
    });
    const result = await res.json().catch(() => null);
    if (!res.ok || !result?.ok) {
      console.warn("[syncBuilderPlan] falha:", res.status, result);
    } else {
      console.log("[syncBuilderPlan] ok:", result);
    }
  } catch (err) {
    console.warn("[syncBuilderPlan] erro:", err);
  }
}
