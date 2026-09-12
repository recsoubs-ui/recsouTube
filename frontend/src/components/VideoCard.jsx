import { Link } from "react-router-dom";
import { formatDuration, formatViews, pickThumbnail, pickAvatar } from "@/lib/format";

export default function VideoCard({ video }) {
  if (!video?.videoId) return null;
  const thumb = pickThumbnail(video);
  const avatar = pickAvatar(video);
  return (
    <Link
      to={`/watch/${video.videoId}`}
      data-testid={`video-card-${video.videoId}`}
      className="video-card-hover group flex flex-col gap-3"
    >
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-secondary">
        {thumb ? (
          <img
            src={thumb}
            alt={video.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            Pas d'aperçu
          </div>
        )}
        {video.lengthSeconds > 0 && (
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-black/80 text-white backdrop-blur-md border border-white/10">
            {formatDuration(video.lengthSeconds)}
          </span>
        )}
        {video.liveNow && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-primary text-primary-foreground uppercase tracking-widest">
            Live
          </span>
        )}
      </div>
      <div className="flex gap-3">
        {avatar && (
          <img
            src={avatar}
            alt={video.author}
            loading="lazy"
            className="w-9 h-9 rounded-full object-cover shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-sm sm:text-[15px] leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {video.title}
          </h3>
          <div className="mt-1 text-xs text-muted-foreground truncate">{video.author}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {video.viewCount > 0 && <span>{formatViews(video.viewCount)} vues</span>}
            {video.viewCount > 0 && video.publishedText && <span className="mx-1">•</span>}
            {video.publishedText && <span>{video.publishedText}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}
