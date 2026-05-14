import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { usePlanLimits } from "@/hooks/usePlanLimits";

interface Service {
  id: string;
  name: string;
}

interface AddEmployeeDialogProps {
  companyId: string;
  onEmployeeAdded: () => void;
}

export function AddEmployeeDialog({ companyId, onEmployeeAdded }: AddEmployeeDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const { toast } = useToast();
  const { guard } = usePlanLimits(companyId);
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "employee" as const,
    is_active: true,
    services: [] as string[]
  });

  useEffect(() => {
    if (open) {
      fetchServices();
    }
  }, [open, companyId]);

  const fetchServices = async () => {
    try {
      const { data } = await supabase
        .from('services')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('is_active', true);
      
      setServices(data || []);
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.is_active && !(await guard("employees"))) return;
    setLoading(true);

    try {
      // Criar conta no Auth do Supabase
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            name: formData.name,
            phone: formData.phone
          }
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        // Criar registro do funcionário com user_id
        const { data: employeeData, error: employeeError } = await supabase
          .from('employees')
          .insert([{
            company_id: companyId,
            user_id: authData.user.id,
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            role: formData.role,
            is_active: formData.is_active
          }])
          .select();

        if (employeeError) throw employeeError;

        // Vincular serviços ao funcionário
        if (employeeData && employeeData[0] && formData.services.length > 0) {
          const serviceInserts = formData.services.map(serviceId => ({
            employee_id: employeeData[0].id,
            service_id: serviceId
          }));

          const { error: servicesError } = await supabase
            .from('employee_services')
            .insert(serviceInserts);

          if (servicesError) throw servicesError;
        }
      }

      toast({
        title: "Colaborador adicionado",
        description: "O colaborador foi convidado com sucesso. Ele receberá um email para ativar a conta.",
      });

      // Resetar formulário
      setFormData({
        name: "",
        email: "",
        phone: "",
        password: "",
        role: "employee",
        is_active: true,
        services: []
      });

      setOpen(false);
      onEmployeeAdded();
    } catch (error: any) {
      console.error('Error creating employee:', error);
      
      // Verificar se é erro de email duplicado
      if (error?.code === '23505') {
        toast({
          title: "Email já cadastrado",
          description: "Este email já está cadastrado no sistema.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro",
          description: "Não foi possível adicionar o colaborador.",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild  className=''>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Convidar Colaborador
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[380px] sm:min-w-[425px] max-h-[600px] overflow-y-auto ">
        <DialogHeader>
          <DialogTitle>Convidar Colaborador</DialogTitle>
          <DialogDescription>
            Adicione um novo colaborador à sua equipe
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 ">
          <div className="space-y-2">
            <Label htmlFor="name">Nome Completo *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Ex: João Silva"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="joao@exemplo.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="(11) 99999-9999"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha *</Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Função *</Label>
            <Select value={formData.role} onValueChange={(value: any) => setFormData(prev => ({ ...prev, role: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a função" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Colaborador</SelectItem>
                <SelectItem value="receptionist">Recepcionista</SelectItem>
                <SelectItem value="supervisor">Encarregado</SelectItem>
                <SelectItem value="manager">Gerente</SelectItem>
              </SelectContent>
            </Select>
          </div>


          <div className="space-y-3">
            <Label>Serviços Vinculados</Label>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {services.map((service) => (
                <div key={service.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={service.id}
                    checked={formData.services.includes(service.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setFormData(prev => ({ 
                          ...prev, 
                          services: [...prev.services, service.id] 
                        }));
                      } else {
                        setFormData(prev => ({ 
                          ...prev, 
                          services: prev.services.filter(s => s !== service.id) 
                        }));
                      }
                    }}
                  />
                  <Label htmlFor={service.id} className="text-sm font-normal">
                    {service.name}
                  </Label>
                </div>
              ))}
              {services.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum serviço cadastrado</p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
            />
            <Label htmlFor="is_active">Colaborador ativo</Label>
          </div>

          <div className="flex gap-4 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1"
            >
              {loading ? "Enviando..." : "Enviar Convite"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}