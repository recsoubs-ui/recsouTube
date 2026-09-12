import VideoCard from "./VideoCard";
import { Skeleton } from "@/components/ui/skeleton";

export function VideoSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="aspect-video w-full rounded-2xl" />
      <div className="flex gap-3">
        <Skeleton className="w-9 h-9 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}

export default function VideoGrid({ videos, loading, emptyMessage = "Aucune vidéo à afficher." }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5 lg:gap-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <VideoSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (!videos?.length) {
    return (
      <div
        data-testid="empty-video-grid"
        className="py-16 text-center text-muted-foreground"
      >
        {emptyMessage}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5 lg:gap-6">
      {videos.map((v) => (
        <VideoCard key={v.videoId} video={v} />
      ))}
    </div>
  );
}
