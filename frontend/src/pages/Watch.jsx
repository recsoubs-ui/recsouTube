import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import VideoPlayer from "@/components/VideoPlayer";
import VideoCard from "@/components/VideoCard";
import CommentsSection from "@/components/CommentsSection";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThumbsUp, ThumbsDown, Share2, ListPlus, Users, Loader2 } from "lucide-react";
import { formatViews, pickAvatar } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function Watch() {
  const { videoId } = useParams();
  const { user } = useAuth();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [liked, setLiked] = useState(false);

  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        setVideo(null);
        const { data } = await api.get(`/videos/${videoId}`);
        if (!alive) return;
        if (!data?.videoId && !data?.title) throw new Error("empty");
        setVideo(data);
      } catch (e) {
        if (alive) {
          const status = e?.response?.status;
          const detail = e?.response?.data?.detail;
          if (status === 424 && typeof detail === "string") setError(detail);
          else if (status === 503)
            setError("Les services Invidious/Piped sont momentanément indisponibles. Réessayez dans quelques instants.");
          else setError("Cette vidéo est indisponible pour le moment.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [videoId, retry]);

  useEffect(() => {
    if (!user || !video?.videoId) return;
    api.post("/history", {
      videoId: video.videoId,
      title: video.title,
      author: video.author,
      authorId: video.authorId,
      lengthSeconds: video.lengthSeconds,
      thumbnail: video?.videoThumbnails?.[0]?.url || "",
    }).catch(() => {});
    Promise.all([api.get("/likes"), api.get("/subscriptions")])
      .then(([l, s]) => {
        setLiked((l.data.results || []).some((x) => x.videoId === video.videoId));
        setSubscribed((s.data.results || []).some((x) => x.channelId === video.authorId));
      })
      .catch(() => {});
  }, [user, video]);

  const requireAuth = () => {
    if (!user) {
      toast.error("Connectez-vous pour utiliser cette fonctionnalité.");
      return false;
    }
    return true;
  };

  const toggleLike = async () => {
    if (!requireAuth()) return;
    try {
      if (liked) {
        await api.delete(`/likes/${videoId}`);
        setLiked(false);
      } else {
        await api.post("/likes", {
          videoId,
          title: video?.title || "",
          thumbnail: video?.videoThumbnails?.[0]?.url || "",
        });
        setLiked(true);
        toast.success("Ajouté à vos favoris");
      }
    } catch (_e) { /* noop */ }
  };

  const toggleSub = async () => {
    if (!requireAuth()) return;
    try {
      if (subscribed) {
        await api.delete(`/subscriptions/${video.authorId}`);
        setSubscribed(false);
      } else {
        await api.post("/subscriptions", {
          channelId: video.authorId,
          channelName: video.author,
          channelThumbnail: video?.authorThumbnails?.[0]?.url || "",
        });
        setSubscribed(true);
        toast.success("Abonnement enregistré");
      }
    } catch (_e) { /* noop */ }
  };

  const share = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié");
    } catch (_e) {
      toast.error("Impossible de copier le lien");
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 min-w-0">
          {loading ? (
            <Skeleton className="w-full aspect-video rounded-3xl" />
          ) : error ? (
            <div className="w-full aspect-video rounded-3xl border bg-secondary flex flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted-foreground" data-testid="watch-error">
              <p className="max-w-md">{error}</p>
              <Button data-testid="watch-retry-button" onClick={() => setRetry((r) => r + 1)} className="rounded-full">
                Réessayer
              </Button>
            </div>
          ) : (
            <VideoPlayer video={video} onRetry={() => setRetry((r) => r + 1)} />
          )}

          {loading ? (
            <div className="mt-5 space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : video ? (
            <>
              <h1 data-testid="watch-title" className="mt-5 font-display text-xl sm:text-2xl font-bold leading-tight">
                {video.title}
              </h1>
              <div className="mt-3 flex flex-wrap gap-3 items-center justify-between">
                <Link
                  to={`/channel/${video.authorId}`}
                  data-testid="watch-channel-link"
                  className="flex items-center gap-3"
                >
                  {pickAvatar(video) && (
                    <img
                      src={pickAvatar(video)}
                      alt={video.author}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  )}
                  <div>
                    <div className="font-semibold text-sm">{video.author}</div>
                    {video.subCountText && (
                      <div className="text-xs text-muted-foreground">{video.subCountText} abonnés</div>
                    )}
                  </div>
                  <Button
                    data-testid="watch-subscribe-button"
                    onClick={(e) => { e.preventDefault(); toggleSub(); }}
                    className="ml-3 rounded-full"
                    variant={subscribed ? "secondary" : "default"}
                  >
                    <Users className="w-4 h-4 mr-2" />
                    {subscribed ? "Abonné" : "S'abonner"}
                  </Button>
                </Link>
                <div className="flex items-center gap-2">
                  <Button
                    data-testid="watch-like-button"
                    onClick={toggleLike}
                    variant={liked ? "default" : "secondary"}
                    className="rounded-full"
                  >
                    <ThumbsUp className="w-4 h-4 mr-2" />
                    {video.likeCount > 0 ? formatViews(video.likeCount) : "J'aime"}
                  </Button>
                  <Button variant="secondary" className="rounded-full" data-testid="watch-dislike-button">
                    <ThumbsDown className="w-4 h-4" />
                  </Button>
                  <Button variant="secondary" className="rounded-full" onClick={share} data-testid="watch-share-button">
                    <Share2 className="w-4 h-4 mr-2" />
                    Partager
                  </Button>
                  <Button variant="secondary" className="rounded-full" data-testid="watch-playlist-button">
                    <ListPlus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 p-4 rounded-2xl surface-elevated border text-sm">
                <div className="flex gap-3 text-muted-foreground mb-2 text-xs font-mono uppercase tracking-wider">
                  <span>{formatViews(video.viewCount)} vues</span>
                  {video.publishedText && <span>• {video.publishedText}</span>}
                </div>
                {video.description && (
                  <p className="whitespace-pre-wrap line-clamp-3 hover:line-clamp-none transition-all">
                    {video.description}
                  </p>
                )}
              </div>

              <CommentsSection videoId={video.videoId || videoId} />
            </>
          ) : null}
        </div>

        <aside className="lg:col-span-4 min-w-0 space-y-4">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Recommandations
          </div>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-40 aspect-video rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))
          ) : (
            (video?.recommendedVideos || []).slice(0, 10).map((v) => (
              <div key={v.videoId}>
                <VideoCard video={v} />
              </div>
            ))
          )}
          {!loading && !video?.recommendedVideos?.length && (
            <div className="text-xs text-muted-foreground py-4 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Aucune recommandation
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
