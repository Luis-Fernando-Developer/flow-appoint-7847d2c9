import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Wallet, Building2, CreditCard, QrCode, Receipt, Banknote } from "lucide-react";

interface Props {
  companyId: string;
  companyName: string;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
}

const METHOD_META: Record<string, { label: string; icon: any; help?: string }> = {
  pix: { label: "PIX", icon: QrCode, help: "Confirmação instantânea, taxa baixa." },
  credit_card: { label: "Cartão de Crédito", icon: CreditCard, help: "Permite parcelamento (1x no MVP)." },
  debit_card: { label: "Cartão de Débito", icon: CreditCard },
  boleto: { label: "Boleto bancário", icon: Receipt, help: "Confirmação em 1-3 dias úteis. Desligado por padrão." },
};

export function PaymentSettings({ companyId, companyName, ownerEmail, ownerPhone }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [account, setAccount] = useState<any>(null);
  const [settings, setSettings] = useState<any>({
    payment_mode: "none",
    accepted_methods: { pix: true, credit_card: true, debit_card: true, boleto: false },
    platform_fee_percentage: 0,
    own_gateway_provider: "asaas",
    own_gateway_api_key_encrypted: "",
  });

  // Onboarding form
  const [obForm, setObForm] = useState({
    cpf_cnpj: "",
    email: ownerEmail || "",
    name: companyName,
    birth_date: "",
    mobile_phone: ownerPhone || "",
    postal_code: "",
    address: "",
    address_number: "",
    province: "",
    company_type: "MEI",
    income_value: 5000,
  });

  const cpfCnpjDigits = obForm.cpf_cnpj.replace(/\D/g, "");
  const isCnpj = cpfCnpjDigits.length === 14;
  const isCpf = cpfCnpjDigits.length === 11;

  useEffect(() => { load(); }, [companyId]);

  async function load() {
    setLoading(true);
    const [{ data: s }, { data: a }] = await Promise.all([
      supabase.from("company_payment_settings").select("*").eq("company_id", companyId).maybeSingle(),
      supabase.from("company_payment_accounts").select("*").eq("company_id", companyId).maybeSingle(),
    ]);
    if (s) setSettings({ ...settings, ...s });
    setAccount(a || null);
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.from("company_payment_settings").upsert({
        company_id: companyId,
        payment_mode: settings.payment_mode,
        accepted_methods: settings.accepted_methods,
        platform_fee_percentage: settings.platform_fee_percentage,
        own_gateway_provider: settings.own_gateway_provider,
        own_gateway_api_key_encrypted: settings.own_gateway_api_key_encrypted || null,
      }, { onConflict: "company_id" });
      if (error) throw error;
      toast({ title: "Configurações salvas" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function onboard() {
    setOnboarding(true);
    try {
      const { data, error } = await supabase.functions.invoke("asaas-onboard-subaccount", {
        body: { company_id: companyId, ...obForm },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Subconta criada com sucesso" });
      await load();
    } catch (e: any) {
      toast({ title: "Erro no onboarding", description: e.message, variant: "destructive" });
    } finally {
      setOnboarding(false);
    }
  }

  function toggleMethod(key: string, value: boolean) {
    setSettings({ ...settings, accepted_methods: { ...settings.accepted_methods, [key]: value } });
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  const isManaged = settings.payment_mode === "asaas_managed";
  const isOwn = settings.payment_mode === "own_gateway";
  const subaccountActive = account?.status === "active" && account?.asaas_wallet_id;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wallet className="w-5 h-5" /> Modo de recebimento</CardTitle>
          <CardDescription>Como sua empresa recebe pagamentos online dos clientes finais.</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={settings.payment_mode}
            onValueChange={(v) => setSettings({ ...settings, payment_mode: v })}
            className="space-y-3"
          >
            <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:border-primary">
              <RadioGroupItem value="none" id="m-none" className="mt-1" />
              <div>
                <div className="font-medium flex items-center gap-2"><Banknote className="w-4 h-4" /> Sem pagamento online</div>
                <p className="text-sm text-muted-foreground">Cliente apenas agenda; pagamento é presencial.</p>
              </div>
            </label>
            <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:border-primary">
              <RadioGroupItem value="asaas_managed" id="m-managed" className="mt-1" />
              <div className="flex-1">
                <div className="font-medium flex items-center gap-2">
                  <Building2 className="w-4 h-4" /> Asaas Gerenciado
                  {subaccountActive && <Badge variant="secondary">Ativo</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">Plataforma cuida de tudo. Requer onboarding rápido com CNPJ/CPF.</p>
              </div>
            </label>
            <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:border-primary">
              <RadioGroupItem value="own_gateway" id="m-own" className="mt-1" />
              <div>
                <div className="font-medium">Gateway próprio (Asaas)</div>
                <p className="text-sm text-muted-foreground">Use sua própria API key. Pagamento cai 100% na sua conta.</p>
              </div>
            </label>
          </RadioGroup>
        </CardContent>
      </Card>

      {isManaged && !subaccountActive && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle>Onboarding da subconta Asaas</CardTitle>
            <CardDescription>Preencha os dados para abrir sua subconta de recebimento.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>CPF ou CNPJ *</Label><Input value={obForm.cpf_cnpj} onChange={(e) => setObForm({ ...obForm, cpf_cnpj: e.target.value })} /></div>
              <div><Label>E-mail *</Label><Input type="email" value={obForm.email} onChange={(e) => setObForm({ ...obForm, email: e.target.value })} /></div>
              <div><Label>Nome / Razão social *</Label><Input value={obForm.name} onChange={(e) => setObForm({ ...obForm, name: e.target.value })} /></div>
              <div><Label>Telefone</Label><Input value={obForm.mobile_phone} onChange={(e) => setObForm({ ...obForm, mobile_phone: e.target.value })} /></div>
              {!isCnpj && (
                <div><Label>Data de nascimento {isCpf && "*"}</Label><Input type="date" value={obForm.birth_date} onChange={(e) => setObForm({ ...obForm, birth_date: e.target.value })} /></div>
              )}
              {isCnpj && (
                <div>
                  <Label>Tipo de empresa</Label>
                  <select className="w-full h-10 px-3 border rounded-md bg-background" value={obForm.company_type} onChange={(e) => setObForm({ ...obForm, company_type: e.target.value })}>
                    <option value="MEI">MEI</option>
                    <option value="LIMITED">LTDA</option>
                    <option value="INDIVIDUAL">Empresário individual</option>
                    <option value="ASSOCIATION">Associação</option>
                  </select>
                </div>
              )}
              <div><Label>CEP</Label><Input value={obForm.postal_code} onChange={(e) => setObForm({ ...obForm, postal_code: e.target.value })} /></div>
              <div className="col-span-2"><Label>Endereço</Label><Input value={obForm.address} onChange={(e) => setObForm({ ...obForm, address: e.target.value })} /></div>
              <div><Label>Número</Label><Input value={obForm.address_number} onChange={(e) => setObForm({ ...obForm, address_number: e.target.value })} /></div>
              <div><Label>Bairro</Label><Input value={obForm.province} onChange={(e) => setObForm({ ...obForm, province: e.target.value })} /></div>
              <div className="col-span-2"><Label>Faturamento mensal estimado (R$) *</Label><Input type="number" min={0} value={obForm.income_value} onChange={(e) => setObForm({ ...obForm, income_value: Number(e.target.value) })} /></div>
            </div>
            <p className="text-xs text-muted-foreground">
              {isCpf ? "Pessoa Física: data de nascimento obrigatória." : isCnpj ? "Pessoa Jurídica: tipo de empresa obrigatório." : "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)."}
            </p>
            <Button onClick={onboard} disabled={onboarding || !obForm.cpf_cnpj || !obForm.email || !obForm.income_value || (isCpf && !obForm.birth_date) || (!isCpf && !isCnpj)}>
              {onboarding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Criar subconta
            </Button>
          </CardContent>
        </Card>
      )}

      {isOwn && (
        <Card>
          <CardHeader>
            <CardTitle>Sua API key Asaas</CardTitle>
            <CardDescription>Cole sua chave de API. Recomendamos criar uma chave dedicada.</CardDescription>
          </CardHeader>
          <CardContent>
            <Label>API Key</Label>
            <Input
              type="password"
              value={settings.own_gateway_api_key_encrypted || ""}
              onChange={(e) => setSettings({ ...settings, own_gateway_api_key_encrypted: e.target.value })}
              placeholder="$aact_..."
            />
          </CardContent>
        </Card>
      )}

      {settings.payment_mode !== "none" && (
        <Card>
          <CardHeader>
            <CardTitle>Métodos aceitos</CardTitle>
            <CardDescription>Habilite as formas de pagamento que seus clientes podem usar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(METHOD_META).map(([key, meta]) => {
              const Icon = meta.icon;
              return (
                <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{meta.label}</div>
                      {meta.help && <p className="text-xs text-muted-foreground">{meta.help}</p>}
                    </div>
                  </div>
                  <Switch
                    checked={!!settings.accepted_methods?.[key]}
                    onCheckedChange={(v) => toggleMethod(key, v)}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Salvar configurações
        </Button>
      </div>
    </div>
  );
}
