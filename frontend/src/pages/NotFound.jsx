import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-6">
      <div className="text-[11px] font-mono uppercase tracking-widest text-primary">Erreur 404</div>
      <h1 className="font-display text-4xl sm:text-5xl font-extrabold">Page introuvable</h1>
      <p className="text-muted-foreground max-w-md">
        La page demandée n'existe pas ou a été déplacée. Retournez à l'accueil pour continuer à explorer.
      </p>
      <Link to="/" className="text-primary font-medium">← Retour à l'accueil</Link>
    </div>
  );
}
