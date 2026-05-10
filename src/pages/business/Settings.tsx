import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Save, Building, Globe, Clock, Bell, Palette } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { LandingPageCustomizer } from "@/components/business/LandingPageCustomizer";

interface Company {
  id: string;
  name: string;
  slug: string;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  address: string | null;
  status: string | null;
}

interface Employee {
  id: string;
  role: string;
  company: Company;
}

export default function BusinessSettings() {
  const { slug } = useParams<{ slug: string }>();
  const [company, setCompany] = useState<Company | null>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const [companyData, setCompanyData] = useState({
    name: "",
    address: "",
  });

  const [businessSettings, setBusinessSettings] = useState({
    allowOnlineBooking: true,
    requireConfirmation: true,
    sendReminders: true,
    advanceBookingDays: 30,
    cancellationPolicy: "",
  });

  useEffect(() => {
    fetchData();
  }, [slug]);

  const fetchData = async () => {
    try {
      // Buscar dados da empresa com plano
      const { data: companyData } = await supabase
        .from('companies')
        .select(`
          *,
          company_subscriptions(
            *,
            subscription_plans(*)
          )
        `)
        .eq('slug', slug)
        .single();

      if (!companyData) return;

      setCompany(companyData);
      const activeSub = companyData.company_subscriptions?.[0];
      setSubscription(activeSub);
      
      setCompanyData({
        name: companyData.name || "",
        address: companyData.address || "",
      });

      // Buscar dados do funcionário
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: employeeData } = await supabase
        .from('employees')
        .select('*, company:companies(*)')
        .eq('user_id', user.id)
        .eq('company_id', companyData.id)
        .single();

      if (!employeeData) return;

      setEmployee(employeeData);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar dados",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCompanyInfo = async () => {
    if (!company) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('companies')
        .update(companyData)
        .eq('id', company.id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Informações da empresa atualizadas com sucesso",
      });
    } catch (error) {
      console.error('Error updating company:', error);
      toast({
        title: "Erro",
        description: "Erro ao atualizar informações da empresa",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <BusinessLayout
        companySlug={slug || ""}
        companyName="Carregando..."
        companyId=""
        userRole="loading"
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Carregando...</p>
          </div>
        </div>
      </BusinessLayout>
    );
  }

  if (!company || !employee) {
    return (
      <BusinessLayout
        companySlug={slug || ""}
        companyName="Acesso Negado"
        companyId=""
        userRole="unauthorized"
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-destructive">Acesso Negado</h2>
            <p className="text-muted-foreground">Você não tem permissão para acessar esta página.</p>
          </div>
        </div>
      </BusinessLayout>
    );
  }

  const canEditSettings = ['owner', 'admin'].includes(employee.role);

  return (
    <BusinessLayout
      companySlug={company.slug}
      companyName={company.name}
      companyId={company.id}
      userRole={employee.role}
    >
      <div className="p-6 space-y-6 w-full  px-10">
        <div className="w-full">
          <h1 className="text-3xl font-bold text-gradient">Configurações</h1>
          <p className="text-muted-foreground">Gerencie as configurações da sua empresa</p>
        </div>

        {/* Informações da Empresa */}
        <Card className=" flex w-full lg:w-full flex-col ">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="w-5 h-5" />
              Informações da Empresa
            </CardTitle>
            <CardDescription>
              Dados básicos da sua empresa
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Empresa</Label>
                <Input
                  id="name"
                  value={companyData.name}
                  onChange={(e) => setCompanyData(prev => ({...prev, name: e.target.value}))}
                  disabled={!canEditSettings}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Endereço</Label>
                <Input
                  id="address"
                  value={companyData.address}
                  onChange={(e) => setCompanyData(prev => ({...prev, address: e.target.value}))}
                  disabled={!canEditSettings}
                />
              </div>
            </div>

            {canEditSettings && (
              <Button onClick={handleSaveCompanyInfo} disabled={saving} className="gap-2">
                <Save className="w-4 h-4" />
                {saving ? "Salvando..." : "Salvar Informações"}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Configurações de Agendamento */}
        <Card className=" flex w-full flex-col ">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Configurações de Agendamento
            </CardTitle>
            <CardDescription>
              Configure como os agendamentos funcionam
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Permitir Agendamento Online</Label>
                <p className="text-sm text-muted-foreground">
                  Permite que clientes façam agendamentos através do site
                </p>
              </div>
              <Switch
                checked={businessSettings.allowOnlineBooking}
                onCheckedChange={(checked) => 
                  setBusinessSettings(prev => ({...prev, allowOnlineBooking: checked}))
                }
                disabled={!canEditSettings}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Requer Confirmação</Label>
                <p className="text-sm text-muted-foreground">
                  Agendamentos precisam ser confirmados antes de serem válidos
                </p>
              </div>
              <Switch
                checked={businessSettings.requireConfirmation}
                onCheckedChange={(checked) => 
                  setBusinessSettings(prev => ({...prev, requireConfirmation: checked}))
                }
                disabled={!canEditSettings}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enviar Lembretes</Label>
                <p className="text-sm text-muted-foreground">
                  Envia lembretes automáticos por email/SMS
                </p>
              </div>
              <Switch
                checked={businessSettings.sendReminders}
                onCheckedChange={(checked) => 
                  setBusinessSettings(prev => ({...prev, sendReminders: checked}))
                }
                disabled={!canEditSettings}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="advanceDays">Antecedência Máxima (dias)</Label>
              <Input
                id="advanceDays"
                type="number"
                value={businessSettings.advanceBookingDays}
                onChange={(e) => setBusinessSettings(prev => ({
                  ...prev, 
                  advanceBookingDays: parseInt(e.target.value) || 30
                }))}
                disabled={!canEditSettings}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cancellationPolicy">Política de Cancelamento</Label>
              <Textarea
                id="cancellationPolicy"
                value={businessSettings.cancellationPolicy}
                onChange={(e) => setBusinessSettings(prev => ({
                  ...prev, 
                  cancellationPolicy: e.target.value
                }))}
                placeholder="Descreva sua política de cancelamento..."
                disabled={!canEditSettings}
              />
            </div>
          </CardContent>
        </Card>

        {/* Personalização da Landing Page */}
        <LandingPageCustomizer 
          companyId={company.id}
          companyPlan={subscription?.subscription_plans?.name?.toLowerCase() || "starter"}
          canEdit={canEditSettings}
          className=" flex w-full flex-col "
          
        />

        {/* Plano Atual */}
        <Card className=" flex w-full flex-col ">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Plano Atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold capitalize">{subscription?.subscription_plans?.name || "Sem Plano"}</h3>
                <p className="text-sm text-muted-foreground">Status: {subscription?.status || 'Inativo'}</p>
              </div>
              <Button variant="outline">
                Gerenciar Plano
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </BusinessLayout>
  );
}