import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { usePlanLimits, type PlanResource, type PlanLimitCheck } from "@/hooks/usePlanLimits";

const RESOURCES: PlanResource[] = ["employees", "services", "combos", "bookings_month", "chatbots", "integrations"];
const LABEL: Record<PlanResource, string> = {
  employees: "profissionais",
  services: "serviços",
  combos: "combos",
  bookings_month: "agendamentos/mês",
  chatbots: "bots",
  chatbot_messages: "mensagens",
  integrations: "integrações",
};

export function PlanOverageBanner({ companyId }: { companyId?: string }) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { check } = usePlanLimits(companyId);
  const [overages, setOverages] = useState<PlanLimitCheck[]>([]);
  const [graceUntil, setGraceUntil] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      const results = await Promise.all(RESOURCES.map((r) => check(r)));
      const over = results.filter(
        (r): r is PlanLimitCheck => !!r && !r.unlimited && r.limit !== null && r.current > r.limit
      );
      setOverages(over);
      const g = over.find((o) => o.grace_until)?.grace_until ?? null;
      setGraceUntil(g);
    })();
  }, [companyId, check]);

  if (overages.length === 0) return null;

  const daysLeft = graceUntil
    ? Math.max(0, Math.ceil((new Date(graceUntil).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 mb-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-destructive">
            Você está acima do limite do seu plano
          </p>
          <ul className="text-sm text-muted-foreground mt-1 space-y-0.5">
            {overages.map((o) => (
              <li key={o.resource}>
                • <strong>{LABEL[o.resource]}</strong>: {o.current} usados / {o.limit} permitidos
              </li>
            ))}
          </ul>
          {daysLeft !== null ? (
            <p className="text-sm mt-2">
              Período de carência: <strong>{daysLeft} dia(s) restantes</strong>. Após esse prazo, os itens excedentes mais recentes serão desativados automaticamente.
            </p>
          ) : (
            <p className="text-sm mt-2">
              Novas criações estão bloqueadas até voltar dentro do limite.
            </p>
          )}
          <Button
            size="sm"
            className="mt-3"
            onClick={() => navigate(`/${slug}/business/billing`)}
          >
            Fazer upgrade
          </Button>
        </div>
      </div>
    </div>
  );
}
