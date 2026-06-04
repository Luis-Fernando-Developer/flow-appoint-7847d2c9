import { useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

export type PlanResource =
  | "employees"
  | "services"
  | "combos"
  | "bookings_month"
  | "chatbots"
  | "chatbot_messages"
  | "integrations";

export interface PlanLimitCheck {
  resource: PlanResource;
  current: number;
  limit: number | null;
  plan_name: string | null;
  unlimited: boolean;
  in_grace: boolean;
  grace_until: string | null;
  allowed: boolean;
}

const RESOURCE_LABEL: Record<PlanResource, string> = {
  employees: "profissionais ativos",
  services: "serviços ativos",
  combos: "combos ativos",
  bookings_month: "agendamentos confirmados no mês",
  chatbots: "bots",
  chatbot_messages: "mensagens",
  integrations: "integrações",
};

export function usePlanLimits(companyId?: string) {
  const { toast } = useToast();

  const check = useCallback(
    async (resource: PlanResource): Promise<PlanLimitCheck | null> => {
      if (!companyId) return null;
      const { data, error } = await supabase.rpc("check_plan_limit", {
        _company_id: companyId,
        _resource: resource,
      }).select().maybeSingle();
      if (error) {
        console.error("[usePlanLimits] erro:", error);
        return null;
      }
      return data as unknown as PlanLimitCheck;
    },
    [companyId]
  );

  /** Returns true if allowed; otherwise shows a toast and returns false. */
  const guard = useCallback(
    async (resource: PlanResource): Promise<boolean> => {
      const r = await check(resource);
      if (!r) return true; // fail-open if check itself errors
      if (r.allowed) return true;
      toast({
        title: "Limite do plano atingido",
        description: `Seu plano ${r.plan_name ?? ""} permite ${r.limit} ${RESOURCE_LABEL[resource]} (uso atual: ${r.current}). Faça upgrade ou desative algum item para continuar.`,
        variant: "destructive",
      });
      return false;
    },
    [check, toast]
  );

  return { check, guard };
}
