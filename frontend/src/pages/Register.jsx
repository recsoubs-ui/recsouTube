import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function Register() {
  const nav = useNavigate();
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await register(username, email, password);
    setLoading(false);
    if (res.ok) { toast.success("Compte créé"); nav("/"); }
    else toast.error(res.error || "Impossible de créer le compte");
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="text-[11px] font-mono uppercase tracking-widest text-primary mb-1">Inscription</div>
      <h1 className="font-display text-3xl font-extrabold mb-6">Rejoignez RecsouTube.</h1>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="u">Nom d'utilisateur</Label>
          <Input data-testid="register-username" id="u" required minLength={2} value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e">Email</Label>
          <Input data-testid="register-email" id="e" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p">Mot de passe</Label>
          <Input data-testid="register-password" id="p" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button data-testid="register-submit" type="submit" disabled={loading} className="w-full rounded-full">
          {loading ? "Création..." : "Créer le compte"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        Déjà membre ? <Link to="/login" className="text-primary font-medium">Se connecter</Link>
      </p>
    </div>
  );
}
