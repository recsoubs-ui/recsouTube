import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import VideoGrid from "@/components/VideoGrid";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatViews } from "@/lib/format";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function Channel() {
  const { channelId } = useParams();
  const { user } = useAuth();
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subbed, setSubbed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/channels/${channelId}`);
        if (alive) setChannel(data);
      } catch (_e) { /* ignore */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [channelId]);

  const sub = async () => {
    if (!user) { toast.error("Connectez-vous pour vous abonner."); return; }
    if (subbed) {
      await api.delete(`/subscriptions/${channelId}`);
      setSubbed(false);
    } else {
      await api.post("/subscriptions", {
        channelId,
        channelName: channel?.author || "",
        channelThumbnail: channel?.authorThumbnails?.[0]?.url || "",
      });
      setSubbed(true);
      toast.success("Abonnement enregistré");
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {loading ? (
        <>
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="mt-6 h-10 w-1/3" />
        </>
      ) : channel ? (
        <>
          {channel.authorBanners?.[0]?.url && (
            <div className="h-40 sm:h-56 rounded-2xl overflow-hidden mb-6 border">
              <img src={channel.authorBanners[0].url} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex flex-wrap gap-4 items-center mb-8">
            {channel.authorThumbnails?.[0]?.url && (
              <img src={channel.authorThumbnails[0].url} alt="" className="w-20 h-20 rounded-full object-cover" />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-2xl sm:text-3xl font-bold" data-testid="channel-name">{channel.author}</h1>
              <div className="text-xs text-muted-foreground mt-1">
                {formatViews(channel.subCount)} abonnés
              </div>
              {channel.description && (
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2 max-w-2xl">{channel.description}</p>
              )}
            </div>
            <Button onClick={sub} className="rounded-full" data-testid="channel-subscribe-button">
              {subbed ? "Abonné" : "S'abonner"}
            </Button>
          </div>
          <h2 className="font-display text-xl font-bold mb-4">Vidéos</h2>
          <VideoGrid videos={channel.latestVideos || []} />
        </>
      ) : (
        <div className="py-16 text-center text-muted-foreground">Chaîne introuvable.</div>
      )}
    </div>
  );
}
