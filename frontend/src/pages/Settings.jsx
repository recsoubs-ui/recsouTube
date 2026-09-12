import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import CustomInstanceCard from "@/components/CustomInstanceCard";

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const [instances, setInstances] = useState([]);
  const [current, setCurrent] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const { data } = await api.get("/invidious/status");
    setInstances(data.instances || []);
    setCurrent(data.current || null);
  };

  useEffect(() => { load(); }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await api.post("/invidious/refresh");
      await load();
      toast.success("Instances testées");
    } catch (_e) {
      toast.error("Impossible de tester les instances");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      <h1 className="font-display text-3xl font-extrabold">Paramètres</h1>

      <Card>
        <CardHeader><CardTitle>Apparence</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          {["dark", "light", "system"].map((t) => (
            <Button
              key={t}
              data-testid={`theme-${t}`}
              variant={theme === t ? "default" : "secondary"}
              onClick={() => setTheme(t)}
              className="rounded-full capitalize"
            >
              {t === "dark" ? "Sombre" : t === "light" ? "Clair" : "Système"}
            </Button>
          ))}
        </CardContent>
      </Card>

      {user && (
        <Card>
          <CardHeader><CardTitle>Compte</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm"><span className="text-muted-foreground">Nom :</span> {user.username}</div>
            <div className="text-sm"><span className="text-muted-foreground">Email :</span> {user.email}</div>
            <Button variant="destructive" onClick={logout} className="mt-3">Se déconnecter</Button>
          </CardContent>
        </Card>
      )}

      <CustomInstanceCard user={user} onSaved={load} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Instances Invidious / Piped</CardTitle>
          <Button size="sm" onClick={refresh} disabled={refreshing} data-testid="refresh-instances">
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Tester
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {current ? (
            <div className="text-xs text-muted-foreground">
              Instance active : <span className="font-mono text-foreground">{current.url}</span>{" "}
              <Badge variant="secondary" className="ml-1 text-[10px]">{current.type}</Badge>
            </div>
          ) : (
            <div className="text-xs text-destructive">Aucune instance active.</div>
          )}
          <ul className="space-y-1 mt-3">
            {instances.map((i) => (
              <li key={i.url} className="flex items-center gap-2 text-xs font-mono">
                {i.healthy ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-destructive" />
                )}
                <span className="truncate flex-1">{i.url}</span>
                <Badge variant="secondary" className="text-[10px]">{i.type}</Badge>
                {i.custom && <Badge className="text-[10px]">perso</Badge>}
                {i.note && <span className="text-muted-foreground truncate max-w-[40%]">{i.note}</span>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
