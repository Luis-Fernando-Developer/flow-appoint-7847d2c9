import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { BookingLogo } from "@/components/BookingLogo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  ArrowLeft, 
  Plus, 
  Edit, 
  Trash2, 
  Star,
  DollarSign,
  Link as LinkIcon
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

interface Plan {
  id: string;
  name: string;
  features: string[];
  monthly_price: number;
  quarterly_price: number;
  annual_price: number;
  is_active: boolean;
}

export default function PlansManagement() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    features: "",
    monthly_price: 0,
    quarterly_price: 0,
    annual_price: 0,
    is_active: true
  });

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('monthly_price');

      if (error) throw error;
      
      const parsedPlans = (data || []).map(plan => ({
        ...plan,
        features: Array.isArray(plan.features) ? plan.features : JSON.parse(plan.features as string || '[]')
      }));
      
      setPlans(parsedPlans);
    } catch (error) {
      console.error('Error fetching plans:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar planos.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (plan?: Plan) => {
    if (plan) {
      setEditingPlan(plan);
      setFormData({
        name: plan.name,
        features: plan.features.join("\n"),
        monthly_price: plan.monthly_price,
        quarterly_price: plan.quarterly_price,
        annual_price: plan.annual_price,
        is_active: plan.is_active
      });
    } else {
      setEditingPlan(null);
      setFormData({
        name: "",
        features: "",
        monthly_price: 0,
        quarterly_price: 0,
        annual_price: 0,
        is_active: true
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const featuresArray = formData.features.split("\n").filter(f => f.trim());
      
      const planData = {
        name: formData.name,
        features: featuresArray,
        monthly_price: formData.monthly_price,
        quarterly_price: formData.quarterly_price,
        annual_price: formData.annual_price,
        is_active: formData.is_active
      };

      if (editingPlan) {
        const { error } = await supabase
          .from('subscription_plans')
          .update(planData)
          .eq('id', editingPlan.id);
        
        if (error) throw error;
        toast({ title: "Plano atualizado com sucesso!" });
      } else {
        const { error } = await supabase
          .from('subscription_plans')
          .insert([planData]);
        
        if (error) throw error;
        toast({ title: "Plano criado com sucesso!" });
      }

      setDialogOpen(false);
      fetchPlans();
    } catch (error) {
      console.error('Error saving plan:', error);
      toast({
        title: "Erro",
        description: "Erro ao salvar plano.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (planId: string) => {
    if (!confirm("Tem certeza que deseja excluir este plano?")) return;
    
    try {
      const { error } = await supabase
        .from('subscription_plans')
        .delete()
        .eq('id', planId);
      
      if (error) throw error;
      toast({ title: "Plano excluído com sucesso!" });
      fetchPlans();
    } catch (error) {
      console.error('Error deleting plan:', error);
      toast({
        title: "Erro",
        description: "Erro ao excluir plano.",
        variant: "destructive",
      });
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Header */}
      <header className="border-b border-primary/20 bg-card/30 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/super-admin")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
            <BookingLogo />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gradient mb-2">Configuração de Planos</h1>
            <p className="text-muted-foreground">Gerencie os planos de assinatura da plataforma</p>
          </div>
          <Button variant="neon" onClick={() => handleOpenDialog()}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Plano
          </Button>
        </div>

        <div className="grid gap-6">
          {plans.map((plan) => (
            <Card key={plan.id} className={`card-glow bg-card/50 backdrop-blur-sm border-primary/20`}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    {!plan.is_active && (
                      <span className="bg-destructive/20 text-destructive text-xs px-2 py-1 rounded-full">
                        Inativo
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(plan)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(plan.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <CardDescription>Plano {plan.name}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Mensal</p>
                    <p className="text-2xl font-bold text-gradient">{formatPrice(plan.monthly_price)}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Trimestral</p>
                    <p className="text-2xl font-bold text-gradient">{formatPrice(plan.quarterly_price)}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Anual</p>
                    <p className="text-2xl font-bold text-gradient">{formatPrice(plan.annual_price)}</p>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-primary/10">
                  <p className="text-sm text-muted-foreground mb-2">Funcionalidades:</p>
                  <ul className="grid md:grid-cols-2 gap-1">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground">• {feature}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Plan Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Editar Plano" : "Novo Plano"}</DialogTitle>
            <DialogDescription>
              Configure os detalhes do plano de assinatura
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Plano</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2 flex items-center gap-4 pt-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label>Ativo</Label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="features">Funcionalidades (uma por linha)</Label>
              <Textarea
                id="features"
                value={formData.features}
                onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                rows={5}
                placeholder="Agendamentos ilimitados&#10;Até 5 funcionários&#10;Relatórios avançados"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="monthly_price">Preço Mensal (R$)</Label>
                <Input
                  id="monthly_price"
                  type="number"
                  step="0.01"
                  value={formData.monthly_price}
                  onChange={(e) => setFormData({ ...formData, monthly_price: parseFloat(e.target.value) })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quarterly_price">Preço Trimestral (R$)</Label>
                <Input
                  id="quarterly_price"
                  type="number"
                  step="0.01"
                  value={formData.quarterly_price}
                  onChange={(e) => setFormData({ ...formData, quarterly_price: parseFloat(e.target.value) })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="annual_price">Preço Anual (R$)</Label>
                <Input
                  id="annual_price"
                  type="number"
                  step="0.01"
                  value={formData.annual_price}
                  onChange={(e) => setFormData({ ...formData, annual_price: parseFloat(e.target.value) })}
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="neon">
                {editingPlan ? "Salvar" : "Criar Plano"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}