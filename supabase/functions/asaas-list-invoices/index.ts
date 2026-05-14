import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/asaas.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims } = await supabase.auth.getClaims(auth.replace("Bearer ", ""));
    if (!claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);

    const url = new URL(req.url);
    const companyId = url.searchParams.get("company_id");
    if (!companyId) return json({ error: "company_id required" }, 400);

    const { data, error } = await supabase
      .from("company_invoices")
      .select("*")
      .eq("company_id", companyId)
      .order("due_date", { ascending: false })
      .limit(100);
    if (error) throw error;

    return json({ invoices: data || [] });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
