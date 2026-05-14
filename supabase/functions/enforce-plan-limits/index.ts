// enforce-plan-limits — Daily cron.
// For each subscription whose overage_grace_until expired, deactivate the
// most-recently-created excedent items (LIFO) until the company fits inside its plan.
// Resources processed: employees, services, service_combos.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Limits = {
  max_employees: number | null;
  max_services: number | null;
};

async function deactivateExcess(
  table: "employees" | "services" | "service_combos",
  companyId: string,
  limit: number | null,
) {
  if (limit == null) return 0;
  const { data: items } = await admin
    .from(table)
    .select("id, created_at")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("created_at", { ascending: false }); // newest first
  const list = items || [];
  const excess = list.length - limit;
  if (excess <= 0) return 0;
  const toDisable = list.slice(0, excess).map((r: any) => r.id);
  await admin.from(table).update({ is_active: false }).in("id", toDisable);
  return toDisable.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const now = new Date().toISOString();
    const { data: subs } = await admin
      .from("company_subscriptions")
      .select("id, company_id, plan_id, overage_grace_until")
      .lte("overage_grace_until", now)
      .not("overage_grace_until", "is", null);

    const report: any[] = [];
    for (const sub of subs || []) {
      try {
        const { data: limits } = await admin
          .from("plan_limits")
          .select("max_employees, max_services")
          .eq("plan_id", sub.plan_id)
          .maybeSingle<Limits>();

        const disabledEmployees = await deactivateExcess(
          "employees",
          sub.company_id,
          limits?.max_employees ?? null,
        );
        const disabledServices = await deactivateExcess(
          "services",
          sub.company_id,
          limits?.max_services ?? null,
        );
        const disabledCombos = await deactivateExcess(
          "service_combos",
          sub.company_id,
          limits?.max_services ?? null, // combos share the services bucket for now
        );

        // Clear grace flag once enforced
        await admin
          .from("company_subscriptions")
          .update({ overage_grace_until: null })
          .eq("id", sub.id);

        report.push({
          company_id: sub.company_id,
          disabledEmployees,
          disabledServices,
          disabledCombos,
        });
      } catch (e: any) {
        console.error("[enforce-plan-limits] sub", sub.id, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: report.length, report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[enforce-plan-limits]", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
