import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Plug, Save, Trash2 } from "lucide-react";

function StatusRow({ label, data, detail, testId }) {
  if (!data) return null;
  return (
    <div data-testid={testId} className="flex items-center gap-3 text-sm">
      {data.ok ? (
        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-destructive shrink-0" />
      )}
      <span className="w-24 font-medium">{label}</span>
      <Badge variant={data.ok ? "default" : "destructive"} className="text-[10px]">
        {data.ok ? "OK" : "KO"}
      </Badge>
      <span className="font-mono text-xs text-muted-foreground">
        HTTP {data.status ?? "—"}
      </span>
      <span className="text-xs text-muted-foreground truncate">
        {data.ok ? detail : data.error || "échec"}
      </span>
    </div>
  );
}

export default function CustomInstanceCard({ user, onSaved }) {
  const [saved, setSaved] = useState(null);
  const [url, setUrl] = useState("");
  const [type, setType] = useState("invidious");
  const [authHeader, setAuthHeader] = useState("");
  const [authValue, setAuthValue] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get("/settings/instance").then(({ data }) => {
      const inst = data.instance;
      setSaved(inst);
      if (inst) {
        setUrl(inst.url);
        setType(inst.type);
        setAuthHeader(inst.authHeader || "");
      }
    }).catch(() => {});
  }, []);

  const body = () => ({ url: url.trim(), type, authHeader: authHeader.trim(), authValue });

  const test = async () => {
    if (!url.trim()) return toast.error("Renseignez l'URL de l'instance.");
    setTesting(true);
    setResult(null);
    try {
      const { data } = await api.post("/settings/instance/test", body());
      setResult(data);
      data.healthy ? toast.success("Instance opérationnelle") : toast.error("L'instance ne répond pas correctement");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!url.trim()) return toast.error("Renseignez l'URL de l'instance.");
    setSaving(true);
    try {
      const { data } = await api.put("/settings/instance", body());
      setSaved(data.instance);
      setAuthValue("");
      toast.success("Instance enregistrée et utilisée en priorité");
      onSaved?.();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    await api.delete("/settings/instance");
    setSaved(null);
    setUrl(""); setAuthHeader(""); setAuthValue(""); setResult(null);
    toast.success("Instance personnalisée retirée");
    onSaved?.();
  };

  return (
    <Card data-testid="custom-instance-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="w-4 h-4 text-primary" /> Instance personnalisée (prioritaire)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {saved && (
          <div className="text-xs text-muted-foreground" data-testid="custom-instance-saved">
            Active : <span className="font-mono text-foreground">{saved.url}</span>{" "}
            <Badge variant="secondary" className="text-[10px]">{saved.type}</Badge>
            {saved.hasAuth && <Badge variant="outline" className="ml-1 text-[10px]">auth {saved.authHeader}</Badge>}
          </div>
        )}
        {!user ? (
          <div className="text-sm text-muted-foreground">
            <Link to="/login" className="text-primary font-medium">Connectez-vous</Link> pour configurer une instance.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
              <Input
                data-testid="custom-instance-url"
                placeholder="https://invidious.mondomaine.fr"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <Select value={type} onValueChange={setType}>
                <SelectTrigger data-testid="custom-instance-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="invidious">Invidious</SelectItem>
                  <SelectItem value="piped">Piped (API)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input
                data-testid="custom-instance-auth-header"
                placeholder="Header d'auth (ex : Authorization)"
                value={authHeader}
                onChange={(e) => setAuthHeader(e.target.value)}
              />
              <Input
                data-testid="custom-instance-auth-value"
                type="password"
                placeholder={saved?.hasAuth ? "Valeur enregistrée (laisser vide pour conserver)" : "Valeur (ex : Bearer xxxx)"}
                value={authValue}
                onChange={(e) => setAuthValue(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button data-testid="custom-instance-test" variant="secondary" onClick={test} disabled={testing} className="rounded-full">
                {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plug className="w-4 h-4 mr-2" />}
                Tester la connexion
              </Button>
              <Button data-testid="custom-instance-save" onClick={save} disabled={saving} className="rounded-full">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Enregistrer
              </Button>
              {saved && (
                <Button data-testid="custom-instance-remove" variant="ghost" onClick={remove} className="rounded-full">
                  <Trash2 className="w-4 h-4 mr-2" /> Retirer
                </Button>
              )}
            </div>
            {result && (
              <div data-testid="custom-instance-result" className="rounded-xl border surface-elevated p-3 space-y-2">
                <StatusRow
                  testId="custom-instance-search-status"
                  label="Recherche"
                  data={result.endpoints?.search}
                  detail={`${result.endpoints?.search?.count ?? 0} résultats`}
                />
                <StatusRow
                  testId="custom-instance-video-status"
                  label="Vidéo"
                  data={result.endpoints?.videos}
                  detail={`${result.endpoints?.videos?.streams ?? 0} flux lisibles`}
                />
                <div className="text-xs text-muted-foreground pt-1">
                  {result.healthy
                    ? "Cette instance sera utilisée en premier pour la recherche et la lecture."
                    : "Corrigez l'URL, le type ou l'authentification avant d'enregistrer."}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
