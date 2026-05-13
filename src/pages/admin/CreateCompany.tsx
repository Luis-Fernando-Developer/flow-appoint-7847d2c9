import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BookingLogo } from "@/components/BookingLogo";
import { ArrowLeft, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { syncBuilderPlan } from "@/lib/syncBuilderPlan";

interface CompanyForm {
  name: string;
  slug: string;
  owner_name: string;
  owner_email: string;
  owner_password: string;
  owner_phone: string;
  address: string;
}

export default function CreateCompany() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<CompanyForm>({
    name: "",
    slug: "",
    owner_name: "",
    owner_email: "",
    owner_password: "",
    owner_phone: "",
    address: ""
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Auto-generate slug from company name
    if (name === 'name') {
      const slug = value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
        .replace(/\s+/g, "-") // Replace spaces with hyphens
        .replace(/-+/g, "-") // Replace multiple hyphens with single
        .trim();
      
      setFormData(prev => ({
        ...prev,
        slug
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // 1. Verificar se o slug já existe
      const { data: existingCompany } = await supabase
        .from('companies')
        .select('id')
        .eq('slug', formData.slug)
        .maybeSingle();

      if (existingCompany) {
        toast({
          title: "URL já existe",
          description: "Esta URL personalizada já está em uso. Escolha outra.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // 2. Primeiro criar a empresa diretamente (only use fields that exist in schema)
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .insert([{
          name: formData.name,
          slug: formData.slug,
          owner_name: formData.owner_name,
          owner_email: formData.owner_email,
          owner_phone: formData.owner_phone,
          address: formData.address,
          status: 'active'
        }])
        .select()
        .single();

      if (companyError) throw companyError;

      // 3. Criar usuário no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.owner_email,
        password: formData.owner_password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            owner_name: formData.owner_name,
            company_id: companyData.id
          }
        }
      });

      if (authError) {
        console.error("Erro no Auth:", authError);
        throw new Error(`Erro ao criar usuário: ${authError.message}`);
      }
      if (!authData.user) throw new Error("Usuário não foi criado");

      // Aguardar um momento para garantir que o usuário esteja disponível no banco
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 4. Criar funcionário (proprietário) vinculado à empresa
      const { error: employeeError } = await supabase
        .from('employees')
        .insert([{
          company_id: companyData.id,
          user_id: authData.user.id,
          name: formData.owner_name,
          email: formData.owner_email,
          phone: formData.owner_phone,
          role: 'owner',
          is_active: true
        }]);

      if (employeeError) {
        console.error("Erro ao criar employee:", employeeError);
        throw new Error(`Erro ao criar funcionário: ${employeeError.message}`);
      }

      // Provisionar conta automaticamente no builder-flow-api (TalkMap)
      try {
        // Criar stub da integração
        await supabase
          .from('chatbot_integration')
          .insert([{
            company_id: companyData.id,
            builder_base_url: 'https://talkbuilder.lovable.app',
            builder_workspace_slug: formData.slug,
            is_active: false,
            talkmap_provisioned: false,
          }]);

        const provisionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provision-talkmap`;
        const provRes = await fetch(provisionUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.owner_email,
            password: formData.owner_password,
            slug: formData.slug,
            display_name: formData.owner_name,
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

      // Sincronizar tier do plano com o builder
      syncBuilderPlan(companyData.id);

      toast({
        title: "Empresa criada com sucesso!",
        description: "A empresa foi cadastrada e o proprietário pode fazer login.",
      });

      navigate("/super-admin/painel");
    } catch (error) {
      console.error("Erro ao criar empresa:", error);
      toast({
        title: "Erro ao criar empresa",
        description: "Ocorreu um erro ao cadastrar a empresa. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Header */}
      <header className="border-b border-primary/20 bg-card/30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <BookingLogo />
            <Button variant="outline" onClick={() => navigate("/super-admin/painel")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl text-gradient">Adicionar Nova Empresa</CardTitle>
                <CardDescription>
                  Cadastre uma nova empresa no sistema
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da Empresa *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Ex: Barbearia do João"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">URL Personalizada *</Label>
                  <Input
                    id="slug"
                    name="slug"
                    value={formData.slug}
                    onChange={handleInputChange}
                    placeholder="barbearia-do-joao"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="owner_name">Nome do Proprietário *</Label>
                  <Input
                    id="owner_name"
                    name="owner_name"
                    value={formData.owner_name}
                    onChange={handleInputChange}
                    placeholder="João Silva"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="owner_email">Email do Proprietário *</Label>
                  <Input
                    id="owner_email"
                    name="owner_email"
                    type="email"
                    value={formData.owner_email}
                    onChange={handleInputChange}
                    placeholder="joao@exemplo.com"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="owner_password">Senha do Proprietário *</Label>
                  <Input
                    id="owner_password"
                    name="owner_password"
                    type="password"
                    value={formData.owner_password}
                    onChange={handleInputChange}
                    placeholder="Digite uma senha segura"
                    minLength={6}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="owner_phone">Telefone do Proprietário</Label>
                  <Input
                    id="owner_phone"
                    name="owner_phone"
                    value={formData.owner_phone}
                    onChange={handleInputChange}
                    placeholder="(11) 99999-9999"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Endereço</Label>
                <Textarea
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  placeholder="Rua das Flores, 123 - Centro, São Paulo - SP"
                  rows={3}
                />
              </div>

              <div className="flex gap-4 pt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/super-admin/painel")}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="neon"
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? "Criando..." : "Criar Empresa"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
