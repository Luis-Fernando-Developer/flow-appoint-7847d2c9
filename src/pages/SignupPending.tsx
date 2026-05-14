import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookingLogo } from "@/components/BookingLogo";
import { CheckCircle2, Copy, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

interface CompanyInfo {
  id: string;
  name: string;
  slug: string;
  status: string;
}
interface Invoice {
  id: string;
  status: string;
  amount: number;
  billing_type: string | null;
  due_date: string | null;
  invoice_url: string | null;
  bank_slip_url: string | null;
  pix_qr_code: string | null;
  pix_payload: string | null;
}

export default function SignupPending() {
  const { companyId } = useParams<{ companyId: string }>();
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!companyId) return;
    let active = true;

    const load = async () => {
      const { data: c } = await supabase
        .from("companies")
        .select("id, name, slug, status")
        .eq("id", companyId)
        .maybeSingle();
      if (!active) return;
      if (c) setCompany(c as CompanyInfo);

      const { data: inv } = await supabase
        .from("company_invoices")
        .select("id, status, amount, billing_type, due_date, invoice_url, bank_slip_url, pix_qr_code, pix_payload")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active) return;
      if (inv) setInvoice(inv as Invoice);
      setLoading(false);
    };

    load();
    const id = setInterval(load, 8000);
    return () => { active = false; clearInterval(id); };
  }, [companyId]);

  const isPaid = company?.status === "active" || invoice?.status === "paid";

  const copyPix = async () => {
    if (!invoice?.pix_payload) return;
    await navigator.clipboard.writeText(invoice.pix_payload);
    toast({ title: "Copiado!", description: "Código PIX copiado para a área de transferência." });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4">
      <div className="absolute inset-0">
        <div className="absolute top-20 left-20 w-72 h-72 bg-neon-violet/10 rounded-full blur-3xl animate-pulse-glow" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-neon-pink/10 rounded-full blur-3xl animate-float" />
      </div>

      <Card className="w-full max-w-xl card-glow bg-card/60 backdrop-blur-sm border-primary/30 relative z-10">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4"><BookingLogo /></div>
          {isPaid ? (
            <>
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
              <CardTitle className="text-2xl text-gradient">Pagamento confirmado!</CardTitle>
              <CardDescription>Sua empresa {company?.name} já está ativa.</CardDescription>
            </>
          ) : (
            <>
              <CardTitle className="text-2xl text-gradient">Aguardando confirmação do pagamento</CardTitle>
              <CardDescription>
                {company?.name ? `Empresa ${company.name} — ` : ""}assim que confirmarmos, liberamos seu acesso.
              </CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {loading && !invoice ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : isPaid ? (
            <Button asChild variant="neon" size="lg" className="w-full">
              <Link to={`/${company?.slug}/admin/login`}>Entrar no painel</Link>
            </Button>
          ) : !invoice ? (
            <p className="text-sm text-muted-foreground text-center">Não encontramos sua cobrança ainda. Aguarde alguns segundos…</p>
          ) : (
            <>
              <div className="flex items-center justify-between p-3 rounded-md bg-background/40 border border-primary/10">
                <span className="text-sm">Valor</span>
                <span className="font-bold">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(invoice.amount || 0))}</span>
              </div>

              {invoice.billing_type === "PIX" && invoice.pix_qr_code && (
                <div className="text-center space-y-3">
                  <img
                    src={`data:image/png;base64,${invoice.pix_qr_code}`}
                    alt="QR Code PIX"
                    className="w-56 h-56 mx-auto rounded-md bg-white p-2"
                  />
                  <Button variant="outline" className="w-full" onClick={copyPix}>
                    <Copy className="w-4 h-4 mr-2" /> Copiar código PIX
                  </Button>
                  <p className="text-xs text-muted-foreground">A confirmação acontece em segundos após o pagamento.</p>
                </div>
              )}

              {invoice.billing_type === "BOLETO" && (
                <div className="space-y-2">
                  <Button asChild variant="neon" className="w-full">
                    <a href={invoice.bank_slip_url || invoice.invoice_url || "#"} target="_blank" rel="noreferrer">
                      <ExternalLink className="w-4 h-4 mr-2" /> Abrir boleto
                    </a>
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    A confirmação do boleto pode levar até 72 horas úteis após o pagamento.
                  </p>
                </div>
              )}

              {invoice.billing_type === "CREDIT_CARD" && (
                <p className="text-sm text-center text-muted-foreground">
                  Estamos processando seu cartão. Esta página atualiza automaticamente.
                </p>
              )}

              {invoice.invoice_url && invoice.billing_type !== "BOLETO" && (
                <a href={invoice.invoice_url} target="_blank" rel="noreferrer" className="block text-xs text-center text-primary hover:underline">
                  Ver fatura no Asaas
                </a>
              )}
            </>
          )}

          <p className="text-xs text-center text-muted-foreground pt-4 border-t border-primary/10">
            Esta página verifica o status a cada 8 segundos. Você pode fechar e voltar quando quiser.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
