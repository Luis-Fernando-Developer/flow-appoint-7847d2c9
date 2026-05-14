import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { Package, Plus, Clock, DollarSign } from "lucide-react";

interface Service {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
}

interface ServiceComboDialogProps {
  companyId: string;
  onComboAdded: () => void;
}

export function ServiceComboDialog({ companyId, onComboAdded }: ServiceComboDialogProps) {
  const { toast } = useToast();
  const { guard } = usePlanLimits(companyId);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: 0
  });

  useEffect(() => {
    if (open) {
      fetchServices();
    }
  }, [open]);

  const fetchServices = async () => {
    const { data, error } = await supabase
      .from('services')
      .select('id, name, price, duration_minutes')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name');

    if (data) setServices(data);
  };

  const toggleService = (serviceId: string) => {
    setSelectedServices(prev => 
      prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const calculateTotals = () => {
    const selected = services.filter(s => selectedServices.includes(s.id));
    const totalPrice = selected.reduce((sum, s) => sum + s.price, 0);
    const totalDuration = selected.reduce((sum, s) => sum + s.duration_minutes, 0);
    return { totalPrice, totalDuration };
  };

  const { totalPrice, totalDuration } = calculateTotals();
  const savings = totalPrice - formData.price;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price);
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h${mins > 0 ? ` ${mins}min` : ''}`;
    }
    return `${mins}min`;
  };

  // const handleSubmit = async (e: React.FormEvent) => {
  //   e.preventDefault();

  //   if (selectedServices.length < 2) {
  //     toast({
  //       title: "Erro",
  //       description: "Selecione pelo menos 2 serviços para criar um combo.",
  //       variant: "destructive",
  //     });
  //     return;
  //   }

  //   setLoading(true);

  //   try {
  //     // Create combo
  //     const { data: comboData, error: comboError } = await supabase
  //       .from('service_combos')
  //       .insert([{
  //         company_id: companyId,
  //         name: formData.name,
  //         description: formData.description,
  //         combo_price: formData.combo_price,
  //         original_total_price: totalPrice,
  //         total_duration_minutes: totalDuration,
  //         is_active: true
  //       }])
  //       .select()
  //       .single();

  //     if (comboError) throw comboError;

  //     // Create combo items
  //     const comboItems = selectedServices.map(serviceId => ({
  //       combo_id: comboData.id,
  //       service_id: serviceId
  //     }));

  //     const { error: itemsError } = await supabase
  //       .from('service_combo_items')
  //       .insert(comboItems);

  //     if (itemsError) throw itemsError;

  //     toast({
  //       title: "Combo criado!",
  //       description: `O combo "${formData.name}" foi criado com sucesso.`,
  //     });

  //     setOpen(false);
  //     setFormData({ name: "", description: "", combo_price: 0 });
  //     setSelectedServices([]);
  //     onComboAdded();
  //   } catch (error) {
  //     console.error('Error creating combo:', error);
  //     toast({
  //       title: "Erro",
  //       description: "Erro ao criar combo.",
  //       variant: "destructive",
  //     });
  //   } finally {
  //     setLoading(false);
  //   }
  // };


  // ...existing code...
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedServices.length < 2) {
      toast({
        title: "Erro",
        description: "Selecione pelo menos 2 serviços para criar um combo.",
        variant: "destructive",
      });
      return;
    }

    if (!(await guard("combos"))) return;

    setLoading(true);

    try {
      // Create combo and return the inserted row
      const { data: comboData, error: comboError } = await supabase
        .from('service_combos')
        .insert([{
          company_id: companyId,
          name: formData.name,
          description: formData.description,
          price: formData.price,
          is_active: true
        }])
        .select()
        .single();

      if (comboError) {
        console.error('comboError:', comboError);
        throw comboError;
      }

      console.log('combo created:', comboData);

      // Create combo items
      const comboItems = selectedServices.map(serviceId => ({
        combo_id: comboData.id,
        service_id: serviceId
      }));

      const { data: itemsData, error: itemsError } = await supabase
        .from('service_combo_items')
        .insert(comboItems)
        .select();

      if (itemsError) {
        console.error('itemsError:', itemsError);
        // opcional: cleanup se falhar inserir items
        await supabase.from('service_combos').delete().eq('id', comboData.id);
        throw itemsError;
      }

      console.log('combo items created:', itemsData);

      toast({
        title: "Combo criado!",
        description: `O combo "${formData.name}" foi criado com sucesso.`,
      });

      setOpen(false);
      setFormData({ name: "", description: "", price: 0 });
      setSelectedServices([]);
      onComboAdded?.();
    } catch (error) {
      console.error('Error creating combo:', error);
      toast({
        title: "Erro",
        description: (error as any) ?.message || "Erro ao criar combo.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Package className="w-4 h-4 mr-2" />
          Criar Combo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card">
        <DialogHeader>
          <DialogTitle>Criar Combo de Serviços</DialogTitle>
          <DialogDescription>
            Combine serviços para oferecer um preço especial
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Combo</Label>
            <Input
              id="name"
              placeholder="Ex: Barba + Corte Degradê"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Textarea
              id="description"
              placeholder="Descrição do combo..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>

          {/* Service Selection */}
          <div className="space-y-2">
            <Label>Selecione os Serviços</Label>
            <div className="grid gap-2 max-h-48 overflow-y-auto p-2 border border-primary/20 rounded-lg">
              {services.map((service) => (
                <div
                  key={service.id}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedServices.includes(service.id)
                      ? 'bg-primary/10 border border-primary/30'
                      : 'bg-background/50 border border-transparent hover:border-primary/20'
                  }`}
                  onClick={() => toggleService(service.id)}
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedServices.includes(service.id)}
                      onCheckedChange={() => toggleService(service.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div>
                      <p className="font-medium">{service.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDuration(service.duration_minutes)}
                      </p>
                    </div>
                  </div>
                  <span className="font-semibold">{formatPrice(service.price)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          {selectedServices.length > 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Valor Original</p>
                      <p className="font-semibold">{formatPrice(totalPrice)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Duração Total</p>
                      <p className="font-semibold">{formatDuration(totalDuration)}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="price">Preço do Combo (R$)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="5"
                    min='50'
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                    required
                  />
                </div>

                {formData.price > 0 && formData.price < totalPrice && (
                  <div className="mt-3 p-2 bg-green-500/10 rounded-lg text-center">
                    <p className="text-sm text-green-600 font-medium">
                      🎉 Cliente economiza {formatPrice(savings)} ({Math.round((savings / totalPrice) * 100)}% OFF)
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              variant="neon" 
              disabled={loading || selectedServices.length < 2}
            >
              {loading ? "Criando..." : "Criar Combo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}