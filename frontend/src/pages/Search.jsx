import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import VideoGrid from "@/components/VideoGrid";

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!q) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get("/search", { params: { q } });
        if (alive) setVideos(data.results || []);
      } catch (_e) {
        if (alive) setError("Impossible d'effectuer la recherche. Le service est momentanément indisponible.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [q]);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6">
        <div className="text-[11px] font-mono uppercase tracking-widest text-primary mb-1">
          Résultats
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight" data-testid="search-heading">
          {q ? `« ${q} »` : "Effectuez une recherche"}
        </h1>
      </div>
      {error && (
        <div className="mb-6 p-4 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <VideoGrid videos={videos} loading={loading} emptyMessage="Aucun résultat trouvé pour cette recherche." />
    </div>
  );
}
