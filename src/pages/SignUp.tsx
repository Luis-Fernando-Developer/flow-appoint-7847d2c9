import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingLogo } from "@/components/BookingLogo";
import { Building2, User, Mail, FileText, Check, X, CreditCard, Zap, Crown, Rocket, Gem } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { syncBuilderPlan } from "@/lib/syncBuilderPlan";

// Mapeamento plano Flow-Appoint → plano builder-flow-api
const PLAN_TO_BUILDER: Record<string, string> = {
  Prata: "starter",
  Ouro: "pro",
  Diamante: "business",
};

interface Plan {
  id: string;
  name: string;
  monthly_price: number;
  quarterly_price: number;
  annual_price: number;
  features: string[];
  is_active: boolean;
}

const iconMap: Record<string, any> = {
  Prata: Zap,
  Ouro: Crown,
  Diamante: Rocket,
  Ruby: Gem,
};

export default function SignUp() {
  const [searchParams] = useSearchParams();
  const preselectedPlanId = searchParams.get("plan");
  const periodParam = searchParams.get("period") || "monthly";

  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(preselectedPlanId);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "quarterly" | "annual">(
    periodParam as any
  );
  const [billingType, setBillingType] = useState<"PIX" | "BOLETO" | "CREDIT_CARD">("PIX");
  const [formData, setFormData] = useState({
    companyName: "",
    customUrl: "",
    ownerName: "",
    ownerCpf: "",
    ownerMail: "",
    ownerPhone: "",
    ownerPass: "",
    ownerPassRepeat: "",
    companyCnpj: "",
    cardHolder: "",
    cardNumber: "",
    cardExpMonth: "",
    cardExpYear: "",
    cardCcv: "",
    cardZip: "",
    cardAddrNumber: "",
  });
  const [urlAvailable, setUrlAvailable] = useState<boolean | null>(null);
  const [isCheckingUrl, setIsCheckingUrl] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("monthly_price");
      if (error) throw error;
      const parsed = (data || []).map((p) => ({
        ...p,
        features: Array.isArray(p.features)
          ? p.features
          : JSON.parse((p.features as string) || "[]"),
      }));
      setPlans(parsed);
    } catch (err) {
      console.error("Erro ao buscar planos:", err);
    }
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || null;

  const getPrice = (plan: Plan) => {
    if (billingPeriod === "quarterly") return plan.quarterly_price;
    if (billingPeriod === "annual") return plan.annual_price;
    return plan.monthly_price;
  };

  const getPeriodLabel = () => {
    if (billingPeriod === "quarterly") return "/trimestre";
    if (billingPeriod === "annual") return "/ano";
    return "/mês";
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === "customUrl") setUrlAvailable(null);
  };

  const checkUrlAvailability = async () => {
    if (!formData.customUrl) return;
    setIsCheckingUrl(true);
    try {
      const { data } = await supabase
        .from("companies")
        .select("id")
        .eq("slug", formData.customUrl)
        .maybeSingle();
      setUrlAvailable(!data);
    } catch {
      setUrlAvailable(false);
    } finally {
      setIsCheckingUrl(false);
    }
  };

  const formatCpf = (value: string) =>
    value
      .replace(/\D/g, "")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})/, "$1-$2")
      .replace(/(-\d{2})\d+?$/, "$1");

  const formatCnpj = (value: string) =>
    value
      .replace(/\D/g, "")
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d{1,2})/, "$1-$2")
      .replace(/(-\d{2})\d+?$/, "$1");

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (!urlAvailable) {
        toast({ title: "URL indisponível", description: "Escolha uma URL disponível.", variant: "destructive" });
        setIsLoading(false);
        return;
      }
      if (formData.ownerPass !== formData.ownerPassRepeat) {
        toast({ title: "Senhas não conferem", description: "Verifique se as senhas são iguais.", variant: "destructive" });
        setIsLoading(false);
        return;
      }
      if (!selectedPlan) {
        toast({ title: "Selecione um plano", description: "Escolha um plano antes de continuar.", variant: "destructive" });
        setIsLoading(false);
        return;
      }
      if (selectedPlan.name === "Ruby") {
        toast({ title: "Plano Ruby", description: "Entre em contato para uma solução personalizada.", variant: "default" });
        setIsLoading(false);
        return;
      }
      if (!formData.ownerCpf || formData.ownerCpf.replace(/\D/g, "").length < 11) {
        toast({ title: "CPF obrigatório", description: "Informe o CPF do empresário.", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      const cpfCnpj = (formData.companyCnpj || formData.ownerCpf).replace(/\D/g, "");

      const payload: any = {
        company: {
          name: formData.companyName,
          slug: formData.customUrl,
          owner_name: formData.ownerName,
          owner_email: formData.ownerMail,
          owner_phone: formData.ownerPhone || null,
          cpf_cnpj: cpfCnpj,
          cnpj: formData.companyCnpj || null,
        },
        password: formData.ownerPass,
        plan_id: selectedPlan.id,
        billing_period: billingPeriod,
        billing_type: billingType,
      };

      if (billingType === "CREDIT_CARD") {
        if (!formData.cardNumber || !formData.cardCcv || !formData.cardExpMonth || !formData.cardExpYear) {
          toast({ title: "Cartão incompleto", description: "Preencha todos os dados do cartão.", variant: "destructive" });
          setIsLoading(false);
          return;
        }
        payload.credit_card = {
          holderName: formData.cardHolder || formData.ownerName,
          number: formData.cardNumber.replace(/\s/g, ""),
          expiryMonth: formData.cardExpMonth,
          expiryYear: formData.cardExpYear,
          ccv: formData.cardCcv,
        };
        payload.credit_card_holder_info = {
          name: formData.ownerName,
          email: formData.ownerMail,
          cpfCnpj,
          postalCode: formData.cardZip,
          addressNumber: formData.cardAddrNumber || "S/N",
          phone: (formData.ownerPhone || "").replace(/\D/g, ""),
        };
      }

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/signup-with-payment`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok || !result?.ok) {
        throw new Error(result?.error || "Falha no cadastro.");
      }

      toast({ title: "Cadastro criado!", description: "Conclua o pagamento para liberar o acesso." });
      // Redirect to pending payment page
      window.location.href = `/signup/aguardando/${result.company_id}`;
    } catch (error: any) {
      console.error("❌ Erro ao cadastrar:", error);
      toast({ title: "Erro ao cadastrar empresa", description: error?.message || "Tente novamente.", variant: "destructive" });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero p-4">
      <div className="absolute inset-0">
        <div className="absolute top-20 left-20 w-72 h-72 bg-neon-violet/10 rounded-full blur-3xl animate-pulse-glow"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-neon-pink/10 rounded-full blur-3xl animate-float"></div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <BookingLogo className="justify-center mb-6" />
          <h1 className="text-3xl font-bold text-gradient mb-2">Cadastre seu Estabelecimento</h1>
          <p className="text-muted-foreground">Comece sua transformação digital hoje mesmo</p>
        </div>

        {/* ── Plan Selection ── */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-center mb-2">Escolha seu Plano</h2>

          {/* Billing period toggle */}
          <div className="flex justify-center gap-2 mb-6">
            {(["monthly", "quarterly", "annual"] as const).map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={billingPeriod === p ? "neon" : "outline"}
                onClick={() => setBillingPeriod(p)}
              >
                {p === "monthly" ? "Mensal" : p === "quarterly" ? "Trimestral (-10%)" : "Anual (-20%)"}
              </Button>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan) => {
              const Icon = iconMap[plan.name] || Zap;
              const isSelected = selectedPlanId === plan.id;
              const isRuby = plan.name === "Ruby";
              const price = getPrice(plan);

              return (
                <Card
                  key={plan.id}
                  className={`cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? "border-primary ring-2 ring-primary/50 bg-primary/10"
                      : "border-primary/20 bg-card/50 hover:border-primary/50"
                  }`}
                  onClick={() => setSelectedPlanId(plan.id)}
                >
                  <CardHeader className="text-center pb-2">
                    <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center mx-auto mb-2">
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <div className="pt-1">
                      {isRuby ? (
                        <span className="text-sm text-muted-foreground">Sob consulta</span>
                      ) : (
                        <>
                          <span className="text-2xl font-bold text-gradient">{formatPrice(price)}</span>
                          <span className="text-xs text-muted-foreground">{getPeriodLabel()}</span>
                        </>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ul className="space-y-1">
                      {plan.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs">
                          <Check className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    {isSelected && (
                      <div className="mt-3 text-center">
                        <span className="text-xs font-medium text-primary">✓ Selecionado</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* ── Registration Form ── */}
        <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/30">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Dados do Estabelecimento</CardTitle>
            <CardDescription className="text-center">Preencha as informações para criar sua conta</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Company Name */}
              <div className="space-y-2">
                <Label htmlFor="companyName">Nome da Empresa *</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input id="companyName" placeholder="Ex: Viking Barbearia" value={formData.companyName} onChange={(e) => handleInputChange("companyName", e.target.value)} className="pl-10 bg-background/50 border-primary/30 focus:border-primary" required />
                </div>
              </div>

              {/* Custom URL */}
              <div className="space-y-2">
                <Label htmlFor="customUrl">URL Personalizada *</Label>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">bookingfy.com.br/</span>
                  <div className="relative flex-1">
                    <Input id="customUrl" placeholder="viking-barbearia" value={formData.customUrl} onChange={(e) => handleInputChange("customUrl", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} className="bg-background/50 border-primary/30 focus:border-primary" required />
                    {formData.customUrl && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {isCheckingUrl ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : urlAvailable === true ? <Check className="w-4 h-4 text-green-500" /> : urlAvailable === false ? <X className="w-4 h-4 text-red-500" /> : null}
                      </div>
                    )}
                  </div>
                  <Button type="button" variant="outline" onClick={checkUrlAvailability} disabled={!formData.customUrl || isCheckingUrl} size="sm">Verificar</Button>
                </div>
                {urlAvailable === false && <p className="text-sm text-red-500">URL não disponível.</p>}
                {urlAvailable === true && <p className="text-sm text-green-500">URL disponível! 🎉</p>}
              </div>

              {/* Owner Name */}
              <div className="space-y-2">
                <Label htmlFor="ownerName">Nome do Empresário *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input id="ownerName" placeholder="João Silva" value={formData.ownerName} onChange={(e) => handleInputChange("ownerName", e.target.value)} className="pl-10 bg-background/50 border-primary/30 focus:border-primary" required />
                </div>
              </div>

              {/* CPF */}
              <div className="space-y-2">
                <Label htmlFor="ownerCpf">CPF do Empresário *</Label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input id="ownerCpf" placeholder="000.000.000-00" value={formData.ownerCpf} onChange={(e) => handleInputChange("ownerCpf", formatCpf(e.target.value))} className="pl-10 bg-background/50 border-primary/30 focus:border-primary" maxLength={14} required />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="ownerMail">Email da Empresa *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input id="ownerMail" type="email" placeholder="empresa@exemplo.com" value={formData.ownerMail} onChange={(e) => handleInputChange("ownerMail", e.target.value)} className="pl-10 bg-background/50 border-primary/30 focus:border-primary" required />
                </div>
              </div>

              {/* Senha */}
              <div className="space-y-2">
                <Label htmlFor="ownerPass">Senha *</Label>
                <Input id="ownerPass" type="password" placeholder="Digite uma senha" value={formData.ownerPass} onChange={(e) => handleInputChange("ownerPass", e.target.value)} className="bg-background/50 border-primary/30 focus:border-primary" minLength={8} required />
              </div>

              {/* Confirmar Senha */}
              <div className="space-y-2">
                <Label htmlFor="ownerPassRepeat">Confirmar Senha *</Label>
                <Input id="ownerPassRepeat" type="password" placeholder="Digite a senha novamente" value={formData.ownerPassRepeat} onChange={(e) => handleInputChange("ownerPassRepeat", e.target.value)} className="bg-background/50 border-primary/30 focus:border-primary" minLength={8} required />
              </div>

              {/* CNPJ */}
              <div className="space-y-2">
                <Label htmlFor="companyCnpj">CNPJ da Empresa (opcional)</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input id="companyCnpj" placeholder="00.000.000/0000-00" value={formData.companyCnpj} onChange={(e) => handleInputChange("companyCnpj", formatCnpj(e.target.value))} className="pl-10 bg-background/50 border-primary/30 focus:border-primary" maxLength={18} />
                </div>
              </div>

              {/* Selected plan summary */}
              {selectedPlan && selectedPlan.name !== "Ruby" && (
                <Card className="bg-gradient-to-r from-primary/20 to-primary/5 border-primary/30">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CreditCard className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-semibold">Plano {selectedPlan.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {billingPeriod === "quarterly" ? "Trimestral" : billingPeriod === "annual" ? "Anual" : "Mensal"}
                          </p>
                        </div>
                      </div>
                      <p className="text-xl font-bold text-gradient">{formatPrice(getPrice(selectedPlan))}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Button type="submit" variant="neon" className="w-full" disabled={isLoading || !urlAvailable || !selectedPlanId} size="lg">
                {isLoading ? "Cadastrando..." : "Cadastrar Estabelecimento"}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-primary/20 text-center">
              <p className="text-sm text-muted-foreground">
                Já tem uma conta?{" "}
                <a href="/Login" className="text-primary hover:text-primary-glow transition-colors">Faça login aqui</a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
