import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export default function Playlists() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");

  const load = async () => {
    const { data } = await api.get("/playlists");
    setItems(data.results || []);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const { data } = await api.post("/playlists", { name });
    setName("");
    setItems((prev) => [...prev.filter((p) => p.id !== data.id), data]);
    toast.success("Playlist créée");
  };

  const del = async (id) => {
    await api.delete(`/playlists/${id}`);
    setItems((prev) => prev.filter((p) => p.id !== id));
  };

  if (!user) return (
    <div className="max-w-md mx-auto py-20 text-center">
      <h1 className="font-display text-2xl font-bold">Connectez-vous pour créer des playlists.</h1>
      <Link to="/login" className="mt-4 inline-block text-primary font-medium">Se connecter</Link>
    </div>
  );

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="font-display text-3xl font-extrabold mb-6">Playlists</h1>
      <form onSubmit={create} className="flex gap-2 mb-8 max-w-md">
        <Input data-testid="playlist-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la playlist" />
        <Button data-testid="playlist-create-button" type="submit" className="rounded-full">
          <Plus className="w-4 h-4 mr-1" /> Créer
        </Button>
      </form>
      {items.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">Aucune playlist. Créez-en une !</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p) => (
            <div key={p.id} className="p-4 rounded-2xl border surface-elevated">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display font-bold">{p.name}</h3>
                  <div className="text-xs text-muted-foreground mt-1">{(p.videos || []).length} vidéos</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => del(p.id)} data-testid={`playlist-delete-${p.id}`}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
