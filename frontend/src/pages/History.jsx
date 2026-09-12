import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDuration } from "@/lib/format";

export default function History() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get("/history");
      setItems(data.results || []);
    } catch (_e) { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { if (user) load(); else setLoading(false); }, [user]);

  const clearAll = async () => {
    await api.delete("/history");
    setItems([]);
    toast.success("Historique effacé");
  };

  const removeOne = async (videoId) => {
    await api.delete(`/history/${videoId}`);
    setItems((prev) => prev.filter((i) => i.videoId !== videoId));
  };

  if (!user) return (
    <div className="max-w-md mx-auto py-20 text-center">
      <h1 className="font-display text-2xl font-bold">Connectez-vous pour voir votre historique.</h1>
      <Link to="/login" className="mt-4 inline-block text-primary font-medium">Se connecter</Link>
    </div>
  );

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl font-extrabold">Historique</h1>
        {items.length > 0 && (
          <Button variant="secondary" onClick={clearAll} data-testid="history-clear-all">
            Tout effacer
          </Button>
        )}
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground">Chargement...</div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          Aucune vidéo regardée pour le moment.
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((it) => (
            <li key={it.videoId} className="flex gap-4 items-center">
              <Link to={`/watch/${it.videoId}`} className="relative w-40 sm:w-56 aspect-video rounded-xl overflow-hidden bg-secondary shrink-0">
                {it.thumbnail && <img src={it.thumbnail} alt="" className="w-full h-full object-cover" />}
                {it.lengthSeconds > 0 && (
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/80 text-white">
                    {formatDuration(it.lengthSeconds)}
                  </span>
                )}
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={`/watch/${it.videoId}`} className="font-semibold text-sm sm:text-base line-clamp-2 hover:text-primary">
                  {it.title}
                </Link>
                <div className="text-xs text-muted-foreground mt-1">{it.author}</div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeOne(it.videoId)} data-testid={`history-remove-${it.videoId}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
