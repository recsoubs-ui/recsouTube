import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import VideoGrid from "@/components/VideoGrid";

export default function Trending() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get("/trending");
        if (alive) setVideos(data.results || []);
      } catch (_e) {
        if (alive) setError("Impossible de charger les tendances.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6">
        <div className="text-[11px] font-mono uppercase tracking-widest text-primary mb-1">Tendances</div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Ce que tout le monde regarde</h1>
      </div>
      {error && (
        <div className="mb-6 p-4 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-sm">{error}</div>
      )}
      <VideoGrid videos={videos} loading={loading} />
    </div>
  );
}
