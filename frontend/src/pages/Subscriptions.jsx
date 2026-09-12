import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Subscriptions() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await api.get("/subscriptions");
      setItems(data.results || []);
    })();
  }, [user]);

  const unsub = async (channelId) => {
    await api.delete(`/subscriptions/${channelId}`);
    setItems((prev) => prev.filter((s) => s.channelId !== channelId));
    toast.success("Désabonné");
  };

  if (!user) return (
    <div className="max-w-md mx-auto py-20 text-center">
      <h1 className="font-display text-2xl font-bold">Connectez-vous pour voir vos abonnements.</h1>
      <Link to="/login" className="mt-4 inline-block text-primary font-medium">Se connecter</Link>
    </div>
  );

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="font-display text-3xl font-extrabold mb-6">Abonnements</h1>
      {items.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">Vous n'êtes abonné à aucune chaîne.</div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((s) => (
            <li key={s.channelId} className="p-4 rounded-2xl border surface-elevated flex gap-3 items-center">
              {s.channelThumbnail && (
                <img src={s.channelThumbnail} alt="" className="w-12 h-12 rounded-full object-cover" />
              )}
              <div className="flex-1 min-w-0">
                <Link to={`/channel/${s.channelId}`} className="font-semibold hover:text-primary block truncate">
                  {s.channelName || s.channelId}
                </Link>
              </div>
              <Button size="sm" variant="secondary" onClick={() => unsub(s.channelId)} data-testid={`unsub-${s.channelId}`}>
                Désabonner
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
