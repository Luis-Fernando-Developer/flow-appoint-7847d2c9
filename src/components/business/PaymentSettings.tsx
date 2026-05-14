import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Wallet,
  CreditCard,
  QrCode,
  Receipt,
  Banknote,
  CheckCircle2,
  Copy,
  ExternalLink,
} from "lucide-react";

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

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asaas-webhook`;

export function PaymentSettings({ companyId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validatedAccount, setValidatedAccount] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [settings, setSettings] = useState<any>({
    payment_mode: "none",
    accepted_methods: { pix: true, credit_card: true, debit_card: true, boleto: false },
    own_gateway_provider: "asaas",
  });

  useEffect(() => { load(); }, [companyId]);

  async function load() {
    setLoading(true);
    const { data: s } = await (supabase as any)
      .from("company_payment_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
    if (s) {
      setSettings({
        payment_mode: s.payment_mode || "none",
        accepted_methods: s.accepted_methods || { pix: true, credit_card: true, debit_card: true, boleto: false },
        own_gateway_provider: s.own_gateway_provider || "asaas",
      });
      setHasStoredKey(!!s.own_gateway_api_key_encrypted);
    }
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    try {
      const payload: any = {
        company_id: companyId,
        payment_mode: settings.payment_mode,
        accepted_methods: settings.accepted_methods,
        own_gateway_provider: settings.own_gateway_provider,
      };

      // Se uma nova key foi digitada, criptografa via RPC
      if (apiKeyInput.trim()) {
        const { data: enc, error: encErr } = await (supabase as any).rpc("encrypt_chatbot_key", {
          p_plain: apiKeyInput.trim(),
          p_secret: "asaas-own-gateway",
        });
        if (encErr) throw encErr;
        payload.own_gateway_api_key_encrypted = enc;
      }

      const { error } = await (supabase as any)
        .from("company_payment_settings")
        .upsert(payload, { onConflict: "company_id" });
      if (error) throw error;
      toast({ title: "Configurações salvas" });
      setApiKeyInput("");
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function validateKey() {
    if (!apiKeyInput.trim()) {
      toast({ title: "Cole a API key primeiro", variant: "destructive" });
      return;
    }
    setValidating(true);
    setValidatedAccount(null);
    try {
      const { data, error } = await supabase.functions.invoke("validate-own-gateway-key", {
        body: { api_key: apiKeyInput.trim(), provider: settings.own_gateway_provider },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setValidatedAccount((data as any).account_name || "Conta validada");
      toast({ title: "Chave válida", description: (data as any).account_name });
    } catch (e: any) {
      toast({ title: "Falha ao validar", description: e.message, variant: "destructive" });
    } finally {
      setValidating(false);
    }
  }

  function toggleMethod(key: string, value: boolean) {
    setSettings({ ...settings, accepted_methods: { ...settings.accepted_methods, [key]: value } });
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!" });
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  const enabled = settings.payment_mode === "own_gateway";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wallet className="w-5 h-5" /> Pagamento online</CardTitle>
          <CardDescription>
            Decida se seus clientes podem pagar online ao agendar. Quando ativado, você usa sua própria conta de
            gateway — o pagamento cai 100% na sua conta, sem taxas adicionais da plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-start gap-3">
              <Banknote className="w-5 h-5 text-muted-foreground mt-1" />
              <div>
                <div className="font-medium">Aceitar pagamento online</div>
                <p className="text-sm text-muted-foreground">
                  Desligado: cliente apenas agenda e paga presencialmente.
                </p>
              </div>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={(v) => setSettings({ ...settings, payment_mode: v ? "own_gateway" : "none" })}
            />
          </div>
        </CardContent>
      </Card>

      {enabled && (
        <Card>
          <CardHeader>
            <CardTitle>Gateway de pagamento</CardTitle>
            <CardDescription>Conecte sua conta para gerar cobranças.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Provedor</Label>
              <select
                className="w-full h-10 px-3 border rounded-md bg-background"
                value={settings.own_gateway_provider}
                onChange={(e) => setSettings({ ...settings, own_gateway_provider: e.target.value })}
              >
                <option value="asaas">Asaas</option>
                <option value="mercadopago" disabled>Mercado Pago (em breve)</option>
                <option value="stripe" disabled>Stripe (em breve)</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>API Key {hasStoredKey && <Badge variant="secondary" className="ml-2">Salva</Badge>}</Label>
                {validatedAccount && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {validatedAccount}
                  </span>
                )}
              </div>
              <Input
                type="password"
                value={apiKeyInput}
                onChange={(e) => { setApiKeyInput(e.target.value); setValidatedAccount(null); }}
                placeholder={hasStoredKey ? "•••••••••• (cole uma nova chave para substituir)" : "$aact_..."}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Crie uma chave no painel Asaas em <strong>Integrações → Chave de API</strong>.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={validateKey}
                disabled={validating || !apiKeyInput.trim()}
              >
                {validating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Testar conexão
              </Button>
            </div>

            <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
              <div className="font-medium text-sm">Webhook (opcional, mas recomendado)</div>
              <p className="text-xs text-muted-foreground">
                Cadastre esta URL no painel Asaas em <strong>Integrações → Webhooks</strong> para que confirmações
                de pagamento atualizem o status do agendamento automaticamente.
              </p>
              <div className="flex items-center gap-2">
                <Input readOnly value={WEBHOOK_URL} className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={() => copy(WEBHOOK_URL)}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <a
                href="https://www.asaas.com/customerWebhook/list"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
              >
                Abrir painel Asaas <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {enabled && (
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
