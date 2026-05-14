import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, X } from "lucide-react";
import { formatBRL } from "@/lib/proration";
import { useToast } from "@/hooks/use-toast";

interface Credit {
  id: string;
  amount: number;
  original_amount: number;
  reason: string;
  source: string;
  status: string;
  expires_at: string;
  created_at: string;
}

interface Props {
  companyId: string;
  refreshKey?: number;
}

export function CompanyCreditsPanel({ companyId, refreshKey }: Props) {
  const { toast } = useToast();
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCredits = async () => {
    setLoading(true);
    // Lazy expiration: mark expired ones first
    await supabase
      .from("company_credits")
      .update({ status: "expired" })
      .eq("company_id", companyId)
      .eq("status", "active")
      .lt("expires_at", new Date().toISOString());

    const { data } = await supabase
      .from("company_credits")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(20);
    setCredits((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (companyId) fetchCredits();
  }, [companyId, refreshKey]);

  const totalActive = credits
    .filter((c) => c.status === "active")
    .reduce((s, c) => s + Number(c.amount || 0), 0);

  const cancelCredit = async (id: string) => {
    const { error } = await supabase
      .from("company_credits")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao cancelar crédito", variant: "destructive" });
    } else {
      toast({ title: "Crédito cancelado" });
      fetchCredits();
    }
  };

  return (
    <Card className="border-primary/20 bg-card/50">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Créditos da empresa</span>
          </div>
          <Badge variant="secondary">Saldo ativo: {formatBRL(totalActive)}</Badge>
        </div>

        {loading && <p className="text-xs text-muted-foreground">Carregando…</p>}

        {!loading && credits.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum crédito registrado.</p>
        )}

        {!loading && credits.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {credits.map((c) => {
              const expired = new Date(c.expires_at) < new Date();
              const statusColor =
                c.status === "active" && !expired ? "default" :
                c.status === "used" ? "secondary" : "outline";
              return (
                <div key={c.id} className="flex items-start justify-between gap-2 text-xs border border-border/50 rounded-md p-2">
                  <div className="space-y-0.5">
                    <p className="font-medium">{formatBRL(Number(c.amount))} <span className="text-muted-foreground">de {formatBRL(Number(c.original_amount))}</span></p>
                    <p className="text-muted-foreground">{c.reason}</p>
                    <p className="text-muted-foreground">
                      Expira em {new Date(c.expires_at).toLocaleDateString("pt-BR")} · {c.source}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={statusColor as any} className="text-[10px]">
                      {c.status === "active" && expired ? "expirado" : c.status}
                    </Badge>
                    {c.status === "active" && !expired && (
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => cancelCredit(c.id)}>
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
