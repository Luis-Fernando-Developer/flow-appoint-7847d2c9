import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingLogo } from "@/components/BookingLogo";
import { Building2, User, Mail, FileText, Check, X, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";

interface SelectedPlan {
  id: string;
  name: string;
  price: number;
  period: string;
  checkoutUrl: string | null;
}

export default function SignUp() {
  const [searchParams] = useSearchParams();
  const planId = searchParams.get('plan');
  const period = searchParams.get('period') || 'monthly';

  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan | null>(null);
  const [formData, setFormData] = useState({
    companyName: "",
    customUrl: "",
    ownerName: "",
    ownerCpf: "",
    ownerMail: "",
    ownerPass: "",
    ownerPassRepeat:"",
    companyCnpj: ""
  });
  const [urlAvailable, setUrlAvailable] = useState<boolean | null>(null);
  const [isCheckingUrl, setIsCheckingUrl] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Fetch selected plan details
  useEffect(() => {
    if (planId) {
      fetchPlanDetails();
    }
  }, [planId, period]);

  const fetchPlanDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', planId)
        .single();

      if (error || !data) return;

      let price = data.monthly_price;
      let periodLabel = 'mensal';

      if (period === 'quarterly') {
        price = data.quarterly_price;
        periodLabel = 'trimestral';
      } else if (period === 'annual') {
        price = data.annual_price;
        periodLabel = 'anual';
      }

      setSelectedPlan({
        id: data.id,
        name: data.name,
        price,
        period: periodLabel,
        checkoutUrl: null // Checkout URLs not in current schema
      });
    } catch (error) {
      console.error('Error fetching plan:', error);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    if (field === 'customUrl') {
      setUrlAvailable(null);
    }
  };

  const checkUrlAvailability = async () => {
    if (!formData.customUrl) return;
    
    setIsCheckingUrl(true);
    
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id')
        .eq('slug', formData.customUrl)
        .maybeSingle();
      
      if (error) {
        console.error('Erro ao verificar URL:', error);
        setUrlAvailable(false);
      } else if (data) {
        setUrlAvailable(false);
      } else {
        setUrlAvailable(true);
      }
    } catch (error) {
      console.error('Erro ao verificar URL:', error);
      setUrlAvailable(false);
    } finally {
      setIsCheckingUrl(false);
    }
  };

  const formatCpf = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const formatCnpj = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      console.log('🔄 Iniciando cadastro da empresa...');
      
      if (!urlAvailable) {
        toast({
          title: "URL indisponível",
          description: "Por favor, escolha uma URL personalizada disponível.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      if (formData.ownerPass !== formData.ownerPassRepeat) {
        toast({
          title: "Senhas não conferem",
          description: "Por favor, verifique se as senhas são iguais.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // 1. Criar a empresa (usando apenas campos que existem no schema)
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .insert([{
          name: formData.companyName,
          slug: formData.customUrl,
          owner_name: formData.ownerName,
          owner_email: formData.ownerMail,
          status: 'active'
        }])
        .select()
        .single();

      if (companyError) {
        console.error('Erro ao criar empresa:', companyError);
        throw companyError;
      }

      // 2. Criar o usuário no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.ownerMail,
        password: formData.ownerPass,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            owner_name: formData.ownerName,
            company_id: companyData.id
          }
        }
      });

      if (authError) throw authError;

      // 3. Criar funcionário (proprietário)
      const { error: employeeError } = await supabase
        .from('employees')
        .insert([{
          company_id: companyData.id,
          user_id: authData.user?.id,
          name: formData.ownerName,
          email: formData.ownerMail,
          role: 'owner',
          is_active: true
        }]);

      if (employeeError) throw employeeError;

      // 4. Registrar stub da integração TalkMap (não provisionada ainda)
      await supabase
        .from('chatbot_integration')
        .insert([{
          company_id: companyData.id,
          builder_base_url: 'https://talkbuilder.lovable.app',
          builder_workspace_slug: formData.customUrl,
          is_active: false,
          talkmap_provisioned: false,
        }]);

      // 4.1 Provisionar conta automaticamente no builder-flow-api (TalkMap)
      try {
        const provisionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provision-talkmap`;
        const provRes = await fetch(provisionUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.ownerMail,
            password: formData.ownerPass,
            slug: formData.customUrl,
            display_name: formData.ownerName,
            plan: 'starter',
            company_id: companyData.id,
          }),
        });
        const provResult = await provRes.json();
        if (provResult.ok) {
          console.log('✅ Conta TalkMap provisionada:', provResult);
        } else {
          console.warn('⚠️ Falha ao provisionar TalkMap:', provResult.error);
        }
      } catch (provErr) {
        console.warn('⚠️ Erro ao provisionar TalkMap (não bloqueante):', provErr);
      }

      // 5. Criar subscription se tiver plano selecionado
      if (selectedPlan) {
        await supabase
          .from('company_subscriptions')
          .insert([{
            company_id: companyData.id,
            plan_id: selectedPlan.id,
            billing_period: period,
            original_price: selectedPlan.price,
            status: 'pending'
          }]);
      }

      toast({
        title: "Cadastro realizado com sucesso!",
        description: `Sua empresa ${formData.companyName} foi cadastrada!`,
      });

      // 5. Redirecionar para checkout ou login
      if (selectedPlan?.checkoutUrl) {
        window.location.href = selectedPlan.checkoutUrl;
      } else {
        window.location.href = `/${formData.customUrl}/admin/login`;
      }
      
    } catch (error) {
      console.error("❌ Erro geral ao cadastrar empresa:", error);
      toast({
        title: "Erro ao cadastrar empresa",
        description: "Ocorreu um erro ao cadastrar a empresa. Tente novamente.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero p-4">
      <div className="absolute inset-0">
        <div className="absolute top-20 left-20 w-72 h-72 bg-neon-violet/10 rounded-full blur-3xl animate-pulse-glow"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-neon-pink/10 rounded-full blur-3xl animate-float"></div>
      </div>

      <div className="relative z-10 max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <BookingLogo className="justify-center mb-6" />
          <h1 className="text-3xl font-bold text-gradient mb-2">Cadastre seu Estabelecimento</h1>
          <p className="text-muted-foreground">
            Comece sua transformação digital hoje mesmo
          </p>
        </div>

        {/* Plan Summary Banner */}
        {selectedPlan && (
          <Card className="mb-6 bg-gradient-to-r from-primary/20 to-primary/5 border-primary/30">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-primary rounded-lg flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold">Plano {selectedPlan.name}</p>
                    <p className="text-sm text-muted-foreground">Cobrança {selectedPlan.period}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gradient">{formatPrice(selectedPlan.price)}</p>
                  <p className="text-xs text-muted-foreground">Total a pagar</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/30">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Dados do Estabelecimento</CardTitle>
            <CardDescription className="text-center">
              Preencha as informações para criar sua conta
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Company Name */}
              <div className="space-y-2">
                <Label htmlFor="companyName">Nome da Empresa *</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    id="companyName"
                    placeholder="Ex: Viking Barbearia"
                    value={formData.companyName}
                    onChange={(e) => handleInputChange('companyName', e.target.value)}
                    className="pl-10 bg-background/50 border-primary/30 focus:border-primary"
                    required
                  />
                </div>
              </div>

              {/* Custom URL */}
              <div className="space-y-2">
                <Label htmlFor="customUrl">URL Personalizada *</Label>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    bookingfy.com.br/
                  </span>
                  <div className="relative flex-1">
                    <Input
                      id="customUrl"
                      placeholder="viking-barbearia"
                      value={formData.customUrl}
                      onChange={(e) => handleInputChange('customUrl', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      className="bg-background/50 border-primary/30 focus:border-primary"
                      required
                    />
                    {formData.customUrl && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        {isCheckingUrl ? (
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                        ) : urlAvailable === true ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : urlAvailable === false ? (
                          <X className="w-4 h-4 text-red-500" />
                        ) : null}
                      </div>
                    )}
                  </div>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={checkUrlAvailability}
                    disabled={!formData.customUrl || isCheckingUrl}
                    size="sm"
                  >
                    Verificar
                  </Button>
                </div>
                {urlAvailable === false && (
                  <p className="text-sm text-red-500">URL não disponível. Tente outra opção.</p>
                )}
                {urlAvailable === true && (
                  <p className="text-sm text-green-500">URL disponível! 🎉</p>
                )}
              </div>

              {/* Owner Name */}
              <div className="space-y-2">
                <Label htmlFor="ownerName">Nome do Empresário *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    id="ownerName"
                    placeholder="João Silva"
                    value={formData.ownerName}
                    onChange={(e) => handleInputChange('ownerName', e.target.value)}
                    className="pl-10 bg-background/50 border-primary/30 focus:border-primary"
                    required
                  />
                </div>
              </div>

              {/* CPF */}
              <div className="space-y-2">
                <Label htmlFor="ownerCpf">CPF do Empresário *</Label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    id="ownerCpf"
                    placeholder="000.000.000-00"
                    value={formData.ownerCpf}
                    onChange={(e) => handleInputChange('ownerCpf', formatCpf(e.target.value))}
                    className="pl-10 bg-background/50 border-primary/30 focus:border-primary"
                    maxLength={14}
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="ownerMail">Email da Empresa *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    id="ownerMail"
                    type="email"
                    placeholder="empresa@exemplo.com"
                    value={formData.ownerMail}
                    onChange={(e) => handleInputChange("ownerMail", e.target.value)}
                    className="pl-10 bg-background/50 border-primary/30 focus:border-primary"
                    required
                  />
                </div>
              </div>

              {/* Senha */}
              <div className="space-y-2">
                <Label htmlFor="ownerPass">Senha *</Label>
                <Input
                  id="ownerPass"
                  type="password"
                  placeholder="Digite uma senha"
                  value={formData.ownerPass}
                  onChange={(e) => handleInputChange('ownerPass', e.target.value)}
                  className="bg-background/50 border-primary/30 focus:border-primary"
                  minLength={6}
                  required
                />
              </div>

              {/* Repetir Senha */}
              <div className="space-y-2">
                <Label htmlFor="ownerPassRepeat">Confirmar Senha *</Label>
                <Input
                  id="ownerPassRepeat"
                  type="password"
                  placeholder="Digite a senha novamente"
                  value={formData.ownerPassRepeat}
                  onChange={(e) => handleInputChange('ownerPassRepeat', e.target.value)}
                  className="bg-background/50 border-primary/30 focus:border-primary"
                  minLength={6}
                  required
                />
              </div>

              {/* CNPJ */}
              <div className="space-y-2">
                <Label htmlFor="companyCnpj">CNPJ da Empresa (opcional)</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    id="companyCnpj"
                    placeholder="00.000.000/0000-00"
                    value={formData.companyCnpj}
                    onChange={(e) => handleInputChange('companyCnpj', formatCnpj(e.target.value))}
                    className="pl-10 bg-background/50 border-primary/30 focus:border-primary"
                    maxLength={18}
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                variant="neon" 
                className="w-full" 
                disabled={isLoading || !urlAvailable}
                size="lg"
              >
                {isLoading ? "Cadastrando..." : selectedPlan ? "Cadastrar e Ir para Pagamento" : "Cadastrar Estabelecimento"}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-primary/20 text-center">
              <p className="text-sm text-muted-foreground">
                Já tem uma conta?{" "}
                <a href="/Login" className="text-primary hover:text-primary-glow transition-colors">
                  Faça login aqui
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}