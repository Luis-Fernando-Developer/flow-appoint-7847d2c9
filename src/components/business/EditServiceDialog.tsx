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
import { Switch } from "@/components/ui/switch";
import { Edit } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
  image_url?: string;
  payment_required?: "always" | "optional" | "never";
}

interface EditServiceDialogProps {
  service: Service;
  onServiceUpdated: () => void;
}

export function EditServiceDialog({ service, onServiceUpdated }: EditServiceDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: 0,
    duration_minutes: 60,
    is_active: true,
    payment_required: "optional" as "always" | "optional" | "never",
  });

  useEffect(() => {
    if (open) {
      setFormData({
        name: service.name,
        description: service.description || "",
        price: service.price,
        duration_minutes: service.duration_minutes,
        is_active: service.is_active,
        payment_required: (service.payment_required as any) || "optional",
      });
    }
  }, [open, service]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from("services")
        .update({
          name: formData.name,
          description: formData.description || null,
          price: formData.price,
          duration_minutes: formData.duration_minutes,
          is_active: formData.is_active,
          payment_required: formData.payment_required,
        })
        .eq("id", service.id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Serviço atualizado com sucesso!",
      });

      setOpen(false);
      onServiceUpdated();
    } catch (error) {
      console.error("Error updating service:", error);
      toast({
        title: "Erro",
        description: "Erro ao atualizar serviço",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Edit className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Serviço</DialogTitle>
          <DialogDescription>
            Atualize as informações do serviço.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Nome do Serviço *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Descrição</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-price">Preço (R$) *</Label>
                <Input
                  id="edit-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-duration">Duração (min) *</Label>
                <Input
                  id="edit-duration"
                  type="number"
                  min="5"
                  step="5"
                  value={formData.duration_minutes}
                  onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 60 })}
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Pagamento online</Label>
              <select
                className="w-full border rounded-md h-9 px-2 bg-background"
                value={formData.payment_required}
                onChange={(e) => setFormData({ ...formData, payment_required: e.target.value as any })}
              >
                <option value="never">Nunca exigir (só presencial)</option>
                <option value="optional">Opcional (cliente escolhe)</option>
                <option value="always">Obrigatório antes de confirmar</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-active">Serviço Ativo</Label>
              <Switch
                id="edit-active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
