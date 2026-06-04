import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Embeda o builder externo (TalkMap) como iframe.
 * - Captura qualquer subpath após /admin/chatbot/talkmap/* e repassa pro builder
 *   como rota interna (HashRouter): https://talkbuilder.lovable.app/#/<subpath>
 * - Recebe mensagens postMessage do builder do tipo { type: "talkmap:navigate", path }
 *   e reflete na URL do Flow-Appoint (sem reload).
 * - Quando o usuário navega no Flow-Appoint (back/forward), envia
 *   { type: "talkmap:set-path", path } pro iframe.
 */
export default function ChatbotTalkMap() {
  const { slug, "*": splat } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [builderBaseUrl, setBuilderBaseUrl] = useState<string>("https://talkbuilder.lovable.app");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // subpath atual depois de /admin/chatbot/talkmap/  (ex: "teste02/workspace/bot/123")
  const subpath = (splat ?? "").replace(/^\/+/, "");

  // Inicialização: busca empresa, gera token e monta src inicial do iframe
  useEffect(() => {
    async function init() {
      if (!slug || !user) return;
      try {
        const { data: company } = await supabase
          .from("companies")
          .select("id, name")
          .eq("slug", slug)
          .maybeSingle();
        if (!company) throw new Error("Empresa não encontrada");
        setCompanyId(company.id);
        setCompanyName(company.name);

        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chatbot-integration/sign-embed-token`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ company_id: company.id, user_id: user.id, plan: "pro" }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Falha ao gerar token de integração");

        const base = (json.builder_base_url || "https://talkbuilder.lovable.app").replace(/\/+$/, "");
        setBuilderBaseUrl(base);

        // Se não veio subpath, manda o usuário pro workspace dele por padrão
        const initialPath = subpath || `${slug}/workspace`;
        // Builder usa HashRouter -> tudo depois do "#/"
        setIframeSrc(`${base}/#/${initialPath}?embed_token=${encodeURIComponent(json.token)}&host=bookingfy`);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    init();
    // só roda na montagem inicial — mudanças de subpath são tratadas via postMessage abaixo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, user]);

  // Recebe mensagens do iframe (builder) avisando que a rota interna mudou
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      try {
        const allowed = builderBaseUrl;
        if (allowed && ev.origin && !allowed.startsWith(ev.origin)) return;
        const data = ev.data;
        if (!data || typeof data !== "object") return;
        if (data.type === "talkmap:navigate" && typeof data.path === "string") {
          const innerPath = data.path.replace(/^\/+/, "").replace(/^#\/?/, "");
          const target = `/${slug}/admin/chatbot/talkmap/${innerPath}`;
          if (target !== location.pathname) {
            navigate(target, { replace: false });
          }
        }
      } catch {
        // ignore
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [builderBaseUrl, slug, location.pathname, navigate]);

  // Quando o subpath muda (ex: back/forward do navegador), avisa o iframe
  useEffect(() => {
    if (!iframeRef.current || !iframeSrc) return;
    const target = subpath || `${slug}/workspace`;
    iframeRef.current.contentWindow?.postMessage(
      { type: "talkmap:set-path", path: `/${target}` },
      builderBaseUrl,
    );
  }, [subpath, iframeSrc, slug, builderBaseUrl]);

  if (loading) {
    return (
      <BusinessLayout companySlug={slug!} companyName={companyName} companyId={companyId!} userRole="owner" currentUser={user}>
        <div className="flex items-center justify-center h-[60vh]"><Loader2 className="animate-spin h-8 w-8" /></div>
      </BusinessLayout>
    );
  }

  if (error || !iframeSrc) {
    return (
      <BusinessLayout companySlug={slug!} companyName={companyName} companyId={companyId!} userRole="owner" currentUser={user}>
        <div className="p-6 max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" /> Integração não disponível
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-muted-foreground">{error || "É necessário conectar uma chave de API do TalkMap antes de usar o construtor."}</p>
              <Button onClick={() => navigate(`/${slug}/admin/chatbot/integracao`)}>Ir para Integração</Button>
            </CardContent>
          </Card>
        </div>
      </BusinessLayout>
    );
  }

  return (
    <BusinessLayout companySlug={slug!} companyName={companyName} companyId={companyId!} userRole="owner" currentUser={user}>
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title="TalkMap Builder"
        className="w-full border-0"
        style={{ height: "calc(100vh - 64px)" }}
        allow="clipboard-read; clipboard-write"
      />
    </BusinessLayout>
  );
}
