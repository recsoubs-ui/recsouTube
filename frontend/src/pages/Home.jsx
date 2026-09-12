import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import VideoGrid from "@/components/VideoGrid";

export default function Home() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get("/trending");
        if (alive) setVideos(data.results || []);
      } catch (e) {
        if (alive) setError("Le service vidéo est temporairement indisponible. Réessayez dans un instant.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6">
        <div className="text-[11px] font-mono uppercase tracking-widest text-primary mb-1">
          À la une
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
          Le meilleur de la vidéo, en un seul endroit.
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          RecsouTube utilise les APIs Invidious et Piped pour vous offrir une expérience de visionnage indépendante, rapide et sans distraction.
        </p>
      </div>
      {error && (
        <div className="mb-6 p-4 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <VideoGrid videos={videos} loading={loading} emptyMessage="Aucune vidéo tendance pour le moment." />
    </div>
  );
}
