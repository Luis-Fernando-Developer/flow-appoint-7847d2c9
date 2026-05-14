import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingLogo } from "@/components/BookingLogo";
import { Lock, Mail } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

export default function BusinessLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast({
          title: "Erro no login",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      if (data.user) {
        // Verificar se o usuário é funcionário de alguma empresa
        const { data: employee } = await supabase
          .from('employees')
          .select(`
            *,
            company:companies(*)
          `)
          .eq('user_id', data.user.id)
          .single();

        if (employee) {
          if (employee.company?.status === "pending_payment") {
            toast({
              title: "Pagamento pendente",
              description: "Conclua o pagamento para liberar o acesso.",
            });
            await supabase.auth.signOut();
            navigate(`/signup/aguardando/${employee.company.id}`);
            return;
          }

          toast({
            title: "Login realizado com sucesso!",
            description: `Bem-vindo ao painel de ${employee.company.name}`,
          });
          navigate(`/${employee.company.slug}/admin/dashboard`);
        } else {
          toast({
            title: "Acesso negado",
            description: "Usuário não está vinculado a nenhuma empresa.",
            variant: "destructive",
          });
          await supabase.auth.signOut();
        }
      }
    } catch (error) {
      console.error('Error signing in:', error);
      toast({
        title: "Erro no login",
        description: "Ocorreu um erro inesperado. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4">
      {/* Background Effects */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-20 w-72 h-72 bg-neon-violet/10 rounded-full blur-3xl animate-pulse-glow"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-neon-pink/10 rounded-full blur-3xl animate-float"></div>
      </div>

      <Card className="w-full max-w-md card-glow bg-card/50 backdrop-blur-sm border-primary/30 relative z-10">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-6">
            <BookingLogo />
          </div>
          <CardTitle className="text-2xl text-gradient">Login Empresarial</CardTitle>
          <CardDescription>
            Acesse o painel administrativo da sua empresa
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 bg-background/50 border-primary/30 focus:border-primary"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 bg-background/50 border-primary/30 focus:border-primary"
                  required
                />
              </div>
            </div>

            <Button 
              type="submit" 
              variant="neon" 
              className="w-full" 
              disabled={isLoading}
              size="lg"
            >
              {isLoading ? "Entrando..." : "Entrar no Painel"}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-primary/20 text-center">
            <p className="text-sm text-muted-foreground">
              Não tem uma conta?{" "}
              <a href="/signup" className="text-primary hover:text-primary-glow transition-colors">
                Cadastre sua empresa
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}