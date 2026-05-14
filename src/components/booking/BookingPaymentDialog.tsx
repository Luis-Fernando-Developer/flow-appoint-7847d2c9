import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, QrCode, CreditCard, Receipt, CheckCircle2, Copy } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  companyId: string;
  amount: number;
  payerInitial: { name: string; email?: string; phone?: string; cpf_cnpj?: string };
  onPaid: () => void;
  allowPayLater?: boolean;
  onPayLater?: () => void;
}

const ICON: Record<string, any> = { PIX: QrCode, CREDIT_CARD: CreditCard, DEBIT_CARD: CreditCard, BOLETO: Receipt };
const LABEL: Record<string, string> = { PIX: "PIX", CREDIT_CARD: "Cartão de Crédito", DEBIT_CARD: "Cartão de Débito", BOLETO: "Boleto" };
const KEY_TO_METHOD: Record<string, string> = { pix: "PIX", credit_card: "CREDIT_CARD", debit_card: "DEBIT_CARD", boleto: "BOLETO" };

export function BookingPaymentDialog({ open, onClose, bookingId, companyId, amount, payerInitial, onPaid, allowPayLater, onPayLater }: Props) {
  const { toast } = useToast();
  const [methods, setMethods] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("PIX");
  const [payer, setPayer] = useState(payerInitial);
  const [loading, setLoading] = useState(false);
  const [payment, setPayment] = useState<any>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("company_payment_settings")
        .select("accepted_methods,payment_mode")
        .eq("company_id", companyId)
        .maybeSingle();
      if (!data || data.payment_mode === "none") { setMethods([]); return; }
      const acc = (data.accepted_methods || {}) as Record<string, boolean>;
      const list = Object.entries(acc).filter(([, v]) => v).map(([k]) => KEY_TO_METHOD[k]).filter(Boolean);
      setMethods(list);
      if (list.length) setSelected(list[0]);
    })();
  }, [open, companyId]);

  // Polling for paid status
  useEffect(() => {
    if (!payment?.id || polling) return;
    setPolling(true);
    const t = setInterval(async () => {
      const { data } = await supabase.from("booking_payments").select("status").eq("booking_id", bookingId).maybeSingle();
      if (data?.status === "paid") { clearInterval(t); toast({ title: "Pagamento confirmado!" }); onPaid(); }
    }, 5000);
    return () => { clearInterval(t); setPolling(false); };
  }, [payment, bookingId]);

  async function generate() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("booking-create-payment", {
        body: { booking_id: bookingId, method: selected, payer },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setPayment((data as any).payment);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pagamento do agendamento</DialogTitle>
          <DialogDescription>Valor: <strong>R$ {amount.toFixed(2)}</strong></DialogDescription>
        </DialogHeader>

        {!methods.length && (
          <p className="text-sm text-muted-foreground">Esta empresa não aceita pagamento online.</p>
        )}

        {!payment && methods.length > 0 && (
          <div className="space-y-4">
            <div>
              <Label>Escolha o método</Label>
              <RadioGroup value={selected} onValueChange={setSelected} className="grid grid-cols-2 gap-2 mt-2">
                {methods.map((m) => {
                  const Icon = ICON[m];
                  return (
                    <label key={m} className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer ${selected === m ? "border-primary bg-primary/5" : ""}`}>
                      <RadioGroupItem value={m} className="sr-only" />
                      <Icon className="w-4 h-4" /> <span className="text-sm">{LABEL[m]}</span>
                    </label>
                  );
                })}
              </RadioGroup>
            </div>

            {(selected === "BOLETO" || selected.includes("CARD")) && (
              <div className="space-y-2">
                <div><Label>CPF/CNPJ do pagador</Label><Input value={payer.cpf_cnpj || ""} onChange={(e) => setPayer({ ...payer, cpf_cnpj: e.target.value })} /></div>
              </div>
            )}

            <Button onClick={generate} disabled={loading} className="w-full">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Gerar pagamento
            </Button>
          </div>
        )}

        {payment && payment.method === "PIX" && payment.pix_qr_code && (
          <div className="space-y-3 text-center">
            <img src={payment.pix_qr_code} alt="QR PIX" className="mx-auto w-56 h-56" />
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(payment.pix_payload || ""); toast({ title: "Copiado!" }); }}>
              <Copy className="w-3 h-3 mr-1" /> Copiar código PIX
            </Button>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Aguardando confirmação...
            </p>
          </div>
        )}

        {payment && payment.method === "PIX" && !payment.pix_qr_code && payment.invoice_url && (
          <div className="space-y-3 text-center">
            <QrCode className="w-12 h-12 mx-auto text-primary" />
            <p className="text-sm">Você será redirecionado para gerar o QR PIX no checkout do gateway.</p>
            <Button asChild><a href={payment.invoice_url} target="_blank" rel="noreferrer">Abrir pagamento PIX</a></Button>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Aguardando confirmação...
            </p>
          </div>
        )}

        {payment && payment.method === "BOLETO" && (
          <div className="space-y-3 text-center">
            <Receipt className="w-12 h-12 mx-auto text-primary" />
            <p className="text-sm">Seu boleto foi gerado.</p>
            <Button asChild><a href={payment.bank_slip_url || payment.invoice_url} target="_blank" rel="noreferrer">Abrir boleto</a></Button>
            <p className="text-xs text-muted-foreground">Compensação em 1-3 dias úteis.</p>
          </div>
        )}

        {payment && (payment.method === "CREDIT_CARD" || payment.method === "DEBIT_CARD") && (
          <div className="space-y-3 text-center">
            <CreditCard className="w-12 h-12 mx-auto text-primary" />
            <Button asChild><a href={payment.invoice_url} target="_blank" rel="noreferrer">Pagar com cartão</a></Button>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Aguardando confirmação...
            </p>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {allowPayLater && !payment && (
            <Button variant="outline" onClick={onPayLater} className="w-full">Pagar no local</Button>
          )}
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
