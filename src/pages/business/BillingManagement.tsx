import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, CreditCard, FileText, Package, Loader2, Download, ExternalLink, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

type Plan = {
  id: string; name: string; monthly_price: number; quarterly_price: number; annual_price: number;
  builder_tier: string; features: any;
};
type Subscription = {
  id: string; company_id: string; plan_id: string; billing_period: string;
  status: string; original_price: number; next_billing_date: string | null;
  pending_plan_change: any; current_payment_method_id: string | null;
  asaas_subscription_id: string | null;
  subscription_plans: Plan;
};
type PaymentMethod = {
  id: string; type: string; brand: string | null; last_digits: string | null;
  display_label: string | null; is_default: boolean; is_active: boolean;
};
type Invoice = {
  id: string; amount: number; status: string; billing_type: string | null;
  due_date: string; paid_at: string | null; invoice_url: string | null;
  bank_slip_url: string | null; description: string | null;
};
type Limits = {
  max_employees: number | null; max_services: number | null;
  max_bookings_month: number | null; max_chatbots: number | null;
  max_chatbot_messages: number | null; max_integrations: number | null;
  features: any;
};

export default function BillingManagement() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [limits, setLimits] = useState<Limits | null>(null);

  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("monthly");
  const [busy, setBusy] = useState(false);

  const [addCardOpen, setAddCardOpen] = useState(false);
  const [card, setCard] = useState({
    holderName: "", number: "", expiryMonth: "", expiryYear: "", ccv: "",
    cpfCnpj: "", postalCode: "", addressNumber: "", phone: "", email: "",
  });

  useEffect(() => { fetchAll(); }, [slug]);

  async function fetchAll() {
    setLoading(true);
    try {
      const { data: comp } = await supabase
        .from("companies").select("*").eq("slug", slug).single();
      if (!comp) return;
      setCompany(comp);

      const [{ data: sub }, { data: plans }, { data: pm }, { data: inv }] = await Promise.all([
        supabase.from("company_subscriptions")
          .select("*, subscription_plans(*)")
          .eq("company_id", comp.id).maybeSingle(),
        supabase.from("subscription_plans").select("*").eq("is_active", true).order("monthly_price"),
        supabase.from("company_payment_methods").select("*").eq("company_id", comp.id).eq("is_active", true),
        supabase.from("company_invoices").select("*").eq("company_id", comp.id)
          .order("due_date", { ascending: false }).limit(50),
      ]);
      setSubscription(sub as any);
      setAllPlans(plans as any || []);
      setMethods(pm as any || []);
      setInvoices(inv as any || []);

      if (sub?.plan_id) {
        const { data: lim } = await supabase
          .from("plan_limits").select("*").eq("plan_id", sub.plan_id).maybeSingle();
        setLimits(lim as any);
        setSelectedPlan(sub.plan_id);
        setSelectedPeriod(sub.billing_period || "monthly");
      }
    } catch (e: any) {
      console.error(e);
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function callFn(name: string, body: any) {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) throw new Error(error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  }

  async function handleChangePlan() {
    if (!subscription || !selectedPlan) return;
    setBusy(true);
    try {
      const result: any = await callFn("asaas-change-plan", {
        company_id: subscription.company_id,
        new_plan_id: selectedPlan,
        billing_period: selectedPeriod,
      });
      toast({
        title: result.action === "upgrade" ? "Upgrade aplicado" : "Downgrade agendado",
        description: result.action === "upgrade"
          ? `Cobrança proporcional: R$ ${Number(result.proration || 0).toFixed(2)}`
          : `Efetivo em ${formatDate(result.effective_at)}`,
      });
      setChangePlanOpen(false);
      fetchAll();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function handleSetMethodPix() {
    if (!company) return;
    setBusy(true);
    try {
      await callFn("asaas-set-payment-method", { company_id: company.id, type: "pix" });
      toast({ title: "PIX definido como método padrão" });
      fetchAll();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function handleAddCard() {
    if (!company) return;
    setBusy(true);
    try {
      await callFn("asaas-set-payment-method", {
        company_id: company.id,
        type: "credit_card",
        credit_card: {
          holderName: card.holderName,
          number: card.number.replace(/\s/g, ""),
          expiryMonth: card.expiryMonth,
          expiryYear: card.expiryYear,
          ccv: card.ccv,
        },
        credit_card_holder_info: {
          name: card.holderName,
          email: card.email || company.owner_email,
          cpfCnpj: card.cpfCnpj,
          postalCode: card.postalCode,
          addressNumber: card.addressNumber,
          phone: card.phone || company.owner_phone,
        },
      });
      toast({ title: "Cartão adicionado" });
      setAddCardOpen(false);
      fetchAll();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  if (loading) {
    return (
      <BusinessLayout companySlug={slug || ""} companyName="Carregando..." companyId="" userRole="loading">
        <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>
      </BusinessLayout>
    );
  }

  const plan = subscription?.subscription_plans;
  const pending = subscription?.pending_plan_change as any;

  return (
    <BusinessLayout companySlug={company?.slug || ""} companyName={company?.name || ""} companyId={company?.id || ""} userRole="owner">
      <div className="p-6 space-y-6 px-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/${slug}/admin/configuracoes`)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gradient">Gerenciar Plano</h1>
            <p className="text-muted-foreground">Plano, métodos de pagamento e faturas</p>
          </div>
        </div>

        <Tabs defaultValue="plan">
          <TabsList>
            <TabsTrigger value="plan"><Package className="w-4 h-4 mr-1" /> Plano Atual</TabsTrigger>
            <TabsTrigger value="methods"><CreditCard className="w-4 h-4 mr-1" /> Métodos</TabsTrigger>
            <TabsTrigger value="invoices"><FileText className="w-4 h-4 mr-1" /> Faturas</TabsTrigger>
          </TabsList>

          {/* PLANO */}
          <TabsContent value="plan" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{plan?.name || "Sem plano ativo"}</CardTitle>
                    <CardDescription>
                      {subscription ? (
                        <>R$ {Number(subscription.original_price).toFixed(2)} / {labelPeriod(subscription.billing_period)}</>
                      ) : "Nenhuma assinatura encontrada"}
                    </CardDescription>
                  </div>
                  <Badge variant={subscription?.status === "active" ? "default" : "destructive"}>
                    {subscription?.status || "inativo"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Próxima cobrança:</span>
                    <div className="font-medium">{formatDate(subscription?.next_billing_date)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tier no builder:</span>
                    <div className="font-medium capitalize">{plan?.builder_tier || "—"}</div>
                  </div>
                </div>

                {pending && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                    Mudança agendada: novo plano em <strong>{formatDate(pending.effective_at)}</strong>.
                  </div>
                )}

                {limits && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                    <LimitItem label="Funcionários" value={limits.max_employees} />
                    <LimitItem label="Serviços" value={limits.max_services} />
                    <LimitItem label="Agend./mês" value={limits.max_bookings_month} />
                    <LimitItem label="Chatbots" value={limits.max_chatbots} />
                    <LimitItem label="Mensagens" value={limits.max_chatbot_messages} />
                    <LimitItem label="Integrações" value={limits.max_integrations} />
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button onClick={() => setChangePlanOpen(true)}>Mudar de plano</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* MÉTODOS */}
          <TabsContent value="methods" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Métodos de pagamento</CardTitle>
                <CardDescription>O último método utilizado vira padrão automaticamente.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {methods.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum método cadastrado. Adicione um cartão ou use PIX.</p>
                )}
                {methods.map(m => (
                  <div key={m.id} className="flex items-center justify-between border rounded-md p-3">
                    <div className="flex items-center gap-3">
                      <CreditCard className="w-5 h-5" />
                      <div>
                        <div className="font-medium">{m.display_label || m.type}</div>
                        <div className="text-xs text-muted-foreground capitalize">{m.type.replace("_", " ")}</div>
                      </div>
                    </div>
                    {m.is_default && <Badge><Check className="w-3 h-3 mr-1" /> Padrão</Badge>}
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <Button onClick={() => setAddCardOpen(true)}>Adicionar cartão</Button>
                  <Button variant="outline" onClick={handleSetMethodPix} disabled={busy}>Usar PIX</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* FATURAS */}
          <TabsContent value="invoices">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de faturas</CardTitle>
                <CardDescription>Faturas pagas, pendentes e vencidas.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma fatura</TableCell></TableRow>
                    )}
                    {invoices.map(i => (
                      <TableRow key={i.id}>
                        <TableCell>{formatDate(i.due_date)}</TableCell>
                        <TableCell>{i.description || "—"}</TableCell>
                        <TableCell>R$ {Number(i.amount).toFixed(2)}</TableCell>
                        <TableCell><Badge variant={statusVariant(i.status)}>{labelStatus(i.status)}</Badge></TableCell>
                        <TableCell className="text-right space-x-2">
                          {i.invoice_url && (
                            <Button size="sm" variant="outline" asChild>
                              <a href={i.invoice_url} target="_blank" rel="noreferrer">
                                {i.status === "paid" ? <Download className="w-3 h-3 mr-1" /> : <ExternalLink className="w-3 h-3 mr-1" />}
                                {i.status === "paid" ? "Recibo" : "Pagar"}
                              </a>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* DIALOGO MUDAR PLANO */}
      <Dialog open={changePlanOpen} onOpenChange={setChangePlanOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mudar de plano</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Plano</Label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allPlans.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — R$ {Number(p.monthly_price).toFixed(2)}/mês
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Periodicidade</Label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="quarterly">Trimestral</SelectItem>
                  <SelectItem value="annual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Upgrades aplicam cobrança proporcional imediata. Downgrades só entram em vigor no próximo ciclo.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePlanOpen(false)}>Cancelar</Button>
            <Button onClick={handleChangePlan} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOGO ADICIONAR CARTÃO */}
      <Dialog open={addCardOpen} onOpenChange={setAddCardOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Adicionar cartão</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Nome impresso</Label><Input value={card.holderName} onChange={e=>setCard({...card,holderName:e.target.value})} /></div>
            <div className="col-span-2"><Label>Número</Label><Input value={card.number} onChange={e=>setCard({...card,number:e.target.value})} /></div>
            <div><Label>Mês</Label><Input maxLength={2} value={card.expiryMonth} onChange={e=>setCard({...card,expiryMonth:e.target.value})} /></div>
            <div><Label>Ano</Label><Input maxLength={4} value={card.expiryYear} onChange={e=>setCard({...card,expiryYear:e.target.value})} /></div>
            <div><Label>CCV</Label><Input maxLength={4} value={card.ccv} onChange={e=>setCard({...card,ccv:e.target.value})} /></div>
            <div><Label>CPF/CNPJ</Label><Input value={card.cpfCnpj} onChange={e=>setCard({...card,cpfCnpj:e.target.value})} /></div>
            <div><Label>CEP</Label><Input value={card.postalCode} onChange={e=>setCard({...card,postalCode:e.target.value})} /></div>
            <div><Label>Número endereço</Label><Input value={card.addressNumber} onChange={e=>setCard({...card,addressNumber:e.target.value})} /></div>
            <div><Label>Telefone</Label><Input value={card.phone} onChange={e=>setCard({...card,phone:e.target.value})} /></div>
            <div className="col-span-2"><Label>Email</Label><Input value={card.email} onChange={e=>setCard({...card,email:e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCardOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddCard} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Salvar cartão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BusinessLayout>
  );
}

function LimitItem({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value === null || value === undefined ? "Ilimitado" : value}</div>
    </div>
  );
}
function formatDate(d?: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("pt-BR");
}
function labelPeriod(p: string) {
  return p === "annual" ? "ano" : p === "quarterly" ? "trimestre" : "mês";
}
function labelStatus(s: string) {
  return ({ paid: "Paga", pending: "Pendente", overdue: "Vencida", refunded: "Estornada", cancelled: "Cancelada", processing: "Processando" } as any)[s] || s;
}
function statusVariant(s: string): any {
  if (s === "paid") return "default";
  if (s === "overdue") return "destructive";
  return "secondary";
}
