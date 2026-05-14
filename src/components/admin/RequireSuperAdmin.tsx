import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"checking" | "ok" | "denied">("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        if (!cancelled) setStatus("denied");
        return;
      }
      const { data: isAdmin } = await supabase.rpc("is_super_admin", { _uid: session.user.id });
      if (!cancelled) setStatus(isAdmin ? "ok" : "denied");
    })();
    return () => { cancelled = true; };
  }, []);

  if (status === "checking") {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Verificando acesso…</div>;
  }
  if (status === "denied") return <Navigate to="/super-admin/login" replace />;
  return <>{children}</>;
}
