import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plug, CheckCircle2, AlertCircle, Loader2, Trash2, ExternalLink, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";

interface IntegrationStatus {
  connected: boolean;
  integration: {
    api_key_prefix: string | null;
    builder_workspace_slug: string | null;
    builder_base_url: string;
    connected_at: string;
    is_active: boolean;
    talkmap_provisioned?: boolean;
    talkmap_provisioned_at?: string | null;
  } | null;
}

export default function ChatbotIntegracao() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      if (!slug) return;
      const { data: company } = await supabase
        .from("companies")
        .select("id, name")
        .eq("slug", slug)
        .maybeSingle();
      if (!company) { setLoading(false); return; }
      setCompanyId(company.id);
      setCompanyName(company.name);
      await refreshStatus(company.id);
      setLoading(false);
    }
    load();
  }, [slug]);

  async function refreshStatus(cid: string) {
    const { data } = await supabase
      .from("chatbot_integration")
      .select("api_key_prefix, builder_workspace_slug, builder_base_url, connected_at, is_active, talkmap_provisioned, talkmap_provisioned_at")
      .eq("company_id", cid)
      .maybeSingle();
    setStatus({
      connected: !!data?.is_active && !!data?.api_key_prefix,
      integration: data
        ? {
            api_key_prefix: data.api_key_prefix,
            builder_workspace_slug: data.builder_workspace_slug,
            builder_base_url: data.builder_base_url ?? "https://talkbuilder.lovable.app",
            connected_at: data.connected_at,
            is_active: data.is_active,
            talkmap_provisioned: data.talkmap_provisioned ?? false,
            talkmap_provisioned_at: data.talkmap_provisioned_at,
          }
        : null,
    });
  }

  async function toggleProvisioned(value: boolean) {
    if (!companyId) return;
    setSaving(true);
    try {
      // Garante que existe um registro (caso conta antiga sem stub)
      const { data: existing } = await supabase
        .from("chatbot_integration")
        .select("id")
        .eq("company_id", companyId)
        .maybeSingle();
      if (existing) {
        await supabase
          .from("chatbot_integration")
          .update({
            talkmap_provisioned: value,
            talkmap_provisioned_at: value ? new Date().toISOString() : null,
          })
          .eq("company_id", companyId);
      } else {
        await supabase.from("chatbot_integration").insert({
          company_id: companyId,
          builder_base_url: "https://talkbuilder.lovable.app",
          is_active: false,
          talkmap_provisioned: value,
          talkmap_provisioned_at: value ? new Date().toISOString() : null,
        });
      }
      toast.success(value ? "Conta marcada como criada no TalkMap" : "Marcação removida");
      await refreshStatus(companyId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleConnect() {
    if (!companyId || !apiKey.trim()) return;
    setSaving(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chatbot-integration/save`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ company_id: companyId, api_key: apiKey.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao salvar");
      toast.success("Integração conectada!");
      setApiKey("");
      await refreshStatus(companyId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!companyId) return;
    if (!confirm("Deseja realmente desconectar a integração?")) return;
    setSaving(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chatbot-integration/disconnect?company_id=${companyId}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      });
      if (!res.ok) throw new Error("Erro ao desconectar");
      toast.success("Integração desconectada");
      await refreshStatus(companyId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <BusinessLayout companySlug={slug!} companyName={companyName} companyId={companyId!} userRole="owner" currentUser={user}>
        <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>
      </BusinessLayout>
    );
  }

  return (
    <BusinessLayout companySlug={slug!} companyName={companyName} companyId={companyId!} userRole="owner" currentUser={user}>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Plug className="h-6 w-6" /> Integração Chatbot</h1>
          <p className="text-muted-foreground mt-1">Conecte seu workspace do TalkMap para usar o construtor de chatbot dentro do Flow-Appoint.</p>
        </div>

        {/* Card 1 — Status do provisionamento da conta TalkMap */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                {status?.integration?.talkmap_provisioned ? (
                  <UserCheck className="h-5 w-5 text-green-600" />
                ) : (
                  <UserX className="h-5 w-5 text-amber-500" />
                )}
                Conta no TalkMap
              </span>
              {status?.integration?.talkmap_provisioned ? (
                <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Provisionada</Badge>
              ) : (
                <Badge variant="outline" className="border-amber-500 text-amber-600">
                  <AlertCircle className="h-3 w-3 mr-1" /> Pendente
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {status?.integration?.talkmap_provisioned
                ? "Sua conta no TalkMap já foi criada. Você pode conectar a chave de API abaixo."
                : "Você ainda precisa criar manualmente sua conta no TalkMap usando o mesmo e-mail e senha cadastrados aqui."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!status?.integration?.talkmap_provisioned && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 space-y-2 text-foreground/90">
                <p className="font-medium">📝 Passos para criar sua conta no TalkMap:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Acesse <a href="https://talkbuilder.lovable.app" target="_blank" rel="noopener" className="text-primary inline-flex items-center gap-1">talkbuilder.lovable.app <ExternalLink className="h-3 w-3" /></a></li>
                  <li>Clique em <strong>Cadastrar</strong></li>
                  <li>Use o <strong>mesmo e-mail e senha</strong> da sua conta Flow-Appoint</li>
                  <li>No campo <strong>URL personalizada</strong>, use: <code className="bg-muted px-1.5 py-0.5 rounded">{status?.integration?.builder_workspace_slug || slug}</code></li>
                  <li>Após concluir, volte aqui e marque como provisionada</li>
                </ol>
              </div>
            )}
            {status?.integration?.talkmap_provisioned && status.integration.talkmap_provisioned_at && (
              <p className="text-muted-foreground">
                Marcada em {new Date(status.integration.talkmap_provisioned_at).toLocaleString("pt-BR")}
              </p>
            )}
            <Button
              variant={status?.integration?.talkmap_provisioned ? "outline" : "default"}
              size="sm"
              onClick={() => toggleProvisioned(!status?.integration?.talkmap_provisioned)}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : status?.integration?.talkmap_provisioned ? (
                <UserX className="h-4 w-4 mr-2" />
              ) : (
                <UserCheck className="h-4 w-4 mr-2" />
              )}
              {status?.integration?.talkmap_provisioned ? "Desmarcar" : "Já criei minha conta no TalkMap"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Status da Conexão
              {status?.connected ? (
                <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Conectado</Badge>
              ) : (
                <Badge variant="outline"><AlertCircle className="h-3 w-3 mr-1" /> Não conectado</Badge>
              )}
            </CardTitle>
          </CardHeader>
          {status?.connected && status.integration && (
            <CardContent className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Chave:</span> <code className="bg-muted px-2 py-0.5 rounded">{status.integration.api_key_prefix}</code></div>
              <div><span className="text-muted-foreground">Builder:</span> {status.integration.builder_base_url}</div>
              <div><span className="text-muted-foreground">Conectado em:</span> {new Date(status.integration.connected_at).toLocaleString("pt-BR")}</div>
              <Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={saving} className="mt-3">
                <Trash2 className="h-4 w-4 mr-2" /> Desconectar
              </Button>
            </CardContent>
          )}
        </Card>

        {!status?.connected && (
          <Card>
            <CardHeader>
              <CardTitle>Conectar TalkMap</CardTitle>
              <CardDescription>Cole abaixo a chave de API gerada no seu workspace do TalkMap.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apikey">Chave de API</Label>
                <Input id="apikey" type="password" placeholder="tmk_..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
              </div>
              <Button onClick={handleConnect} disabled={saving || !apiKey.trim()}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
                Conectar
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Como obter sua chave</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Acesse <a href="https://talkbuilder.lovable.app" target="_blank" rel="noopener" className="text-primary inline-flex items-center gap-1">talkbuilder.lovable.app <ExternalLink className="h-3 w-3" /></a></p>
            <p>2. Faça login e abra <strong>Workspace → Configurações → API Keys</strong></p>
            <p>3. Clique em <strong>Gerar Nova Chave</strong> e copie o token (começa com <code>tmk_</code>)</p>
            <p>4. Cole acima e clique em Conectar</p>
          </CardContent>
        </Card>
      </div>
    </BusinessLayout>
  );
}
