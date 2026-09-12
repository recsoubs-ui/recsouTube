import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function Login() {
  const nav = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await login(email, password);
    setLoading(false);
    if (res.ok) { toast.success("Bienvenue sur RecsouTube"); nav("/"); }
    else toast.error(res.error || "Identifiants invalides");
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="text-[11px] font-mono uppercase tracking-widest text-primary mb-1">Connexion</div>
      <h1 className="font-display text-3xl font-extrabold mb-6">Reprenez là où vous en étiez.</h1>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input data-testid="login-email" id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw">Mot de passe</Label>
          <Input data-testid="login-password" id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button data-testid="login-submit" type="submit" disabled={loading} className="w-full rounded-full">
          {loading ? "Connexion..." : "Se connecter"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        Pas de compte ? <Link to="/register" className="text-primary font-medium">Créer un compte</Link>
      </p>
    </div>
  );
}
