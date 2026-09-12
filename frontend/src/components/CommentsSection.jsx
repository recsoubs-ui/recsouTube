import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatViews, absUrl } from "@/lib/format";
import {
  ThumbsUp, Pin, Heart, BadgeCheck, Loader2, MessageSquare, ChevronDown, ChevronUp, CornerDownRight,
} from "lucide-react";

function CommentBody({ c, small = false }) {
  const avatar = absUrl(c.authorThumbnails?.[0]?.url || c.authorThumbnail || "");
  const size = small ? "w-7 h-7" : "w-9 h-9";
  return (
    <div className="flex gap-3">
      <Link to={c.authorId ? `/channel/${c.authorId}` : "#"} className="shrink-0">
        {avatar ? (
          <img src={avatar} alt={c.author} loading="lazy" className={`${size} rounded-full object-cover`} />
        ) : (
          <div className={`${size} rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center`}>
            {(c.author || "?").replace("@", "")[0]?.toUpperCase()}
          </div>
        )}
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {c.isPinned && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Pin className="w-3 h-3" /> Épinglé
            </span>
          )}
          <span className={`font-semibold ${c.authorIsChannelOwner ? "px-1.5 py-0.5 rounded-full bg-secondary" : ""}`}>
            {c.author}
          </span>
          {c.verified && <BadgeCheck className="w-3.5 h-3.5 text-muted-foreground" />}
          <span className="text-muted-foreground">{c.publishedText}</span>
        </div>
        <p className="mt-1 text-sm whitespace-pre-wrap break-words">{c.content}</p>
        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ThumbsUp className="w-3.5 h-3.5" /> {c.likeCount > 0 ? formatViews(c.likeCount) : ""}
          </span>
          {c.creatorHeart && <Heart className="w-3.5 h-3.5 text-primary fill-primary" />}
        </div>
      </div>
    </div>
  );
}

function Replies({ videoId, commentId, continuation: initial }) {
  const [items, setItems] = useState([]);
  const [continuation, setContinuation] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (cont) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/comments/${videoId}`, { params: { continuation: cont } });
      setItems((prev) => {
        const seen = new Set(prev.map((r) => r.commentId));
        return [...prev, ...(data.comments || []).filter((r) => !seen.has(r.commentId))];
      });
      setContinuation(data.continuation || "");
    } catch (_e) {
      setError("Impossible de charger les réponses.");
      setContinuation("");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(initial); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ul data-testid={`replies-${commentId}`} className="mt-3 space-y-4 pl-3 border-l-2 border-border/60">
      {items.map((r) => (
        <li key={r.commentId} data-testid={`reply-${r.commentId}`}>
          <CommentBody c={r} small />
        </li>
      ))}
      {error && <li className="text-xs text-muted-foreground">{error}</li>}
      {loading && (
        <li className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> Chargement des réponses…
        </li>
      )}
      {!loading && continuation && (
        <li>
          <button
            type="button"
            data-testid={`replies-more-${commentId}`}
            onClick={() => load(continuation)}
            className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
          >
            <CornerDownRight className="w-3 h-3" /> Plus de réponses
          </button>
        </li>
      )}
    </ul>
  );
}

function Comment({ c, videoId }) {
  const [open, setOpen] = useState(false);
  const repliesCont = c.repliesContinuation || c.replies?.continuation || "";
  const replyCount = c.replyCount || c.replies?.replyCount || 0;
  return (
    <li data-testid={`comment-${c.commentId}`}>
      <CommentBody c={c} />
      <div className="pl-12">
        {replyCount > 0 && repliesCont ? (
          <button
            type="button"
            data-testid={`replies-toggle-${c.commentId}`}
            onClick={() => setOpen((o) => !o)}
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:bg-primary/10 rounded-full px-2.5 py-1 -ml-2.5 transition-colors"
          >
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {open ? "Masquer les réponses" : `Voir les réponses (${formatViews(replyCount)})`}
          </button>
        ) : replyCount > 0 ? (
          <div className="mt-1 text-xs text-muted-foreground">{replyCount} réponse{replyCount > 1 ? "s" : ""}</div>
        ) : null}
        {open && <Replies videoId={videoId} commentId={c.commentId} continuation={repliesCont} />}
      </div>
    </li>
  );
}

export default function CommentsSection({ videoId }) {
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [continuation, setContinuation] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const fetchPage = async (cont) => {
    const { data } = await api.get(`/comments/${videoId}`, { params: cont ? { continuation: cont } : {} });
    return data;
  };

  useEffect(() => {
    let alive = true;
    setItems([]); setContinuation(""); setError(""); setLoading(true);
    fetchPage("")
      .then((d) => {
        if (!alive) return;
        setItems(d.comments || []);
        setCount(d.commentCount || 0);
        setContinuation(d.continuation || "");
      })
      .catch(() => alive && setError("Les commentaires ne sont pas disponibles pour cette vidéo."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const d = await fetchPage(continuation);
      const seen = new Set(items.map((c) => c.commentId));
      setItems((prev) => [...prev, ...(d.comments || []).filter((c) => !seen.has(c.commentId))]);
      setContinuation(d.continuation || "");
    } catch (_e) {
      setContinuation("");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section data-testid="comments-section" className="mt-6">
      <h2 className="font-display font-bold text-base md:text-lg flex items-center gap-2 mb-4">
        <MessageSquare className="w-4 h-4 text-primary" />
        Commentaires
        {count > 0 && <span className="text-muted-foreground text-sm font-normal" data-testid="comments-count">{formatViews(count)}</span>}
      </h2>
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="w-9 h-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div data-testid="comments-error" className="text-sm text-muted-foreground py-4">{error}</div>
      ) : items.length === 0 ? (
        <div data-testid="comments-empty" className="text-sm text-muted-foreground py-4">Aucun commentaire.</div>
      ) : (
        <>
          <ul className="space-y-5" data-testid="comments-list">
            {items.map((c) => <Comment key={c.commentId} c={c} videoId={videoId} />)}
          </ul>
          {continuation && (
            <div className="mt-5">
              <Button data-testid="comments-load-more" variant="secondary" className="rounded-full" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Charger plus de commentaires
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
