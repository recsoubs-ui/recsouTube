import { useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import dashjs from "dashjs";
import { Play, Pause, Volume2, VolumeX, Maximize, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDuration } from "@/lib/format";

export default function VideoPlayer({ video, onRetry }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const dashRef = useRef(null);
  const watchdogRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video?.lengthSeconds || 0);
  const [buffering, setBuffering] = useState(true);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  const candidates = useMemo(() => buildCandidates(video), [video]);
  const selected = candidates[index];

  useEffect(() => {
    setIndex(0);
    setFailed(candidates.length === 0);
    setPlaying(false);
    setCurrentTime(0);
    setBuffering(candidates.length > 0);
  }, [video?.videoId, candidates.length]);

  const teardown = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (dashRef.current) {
      try { dashRef.current.reset(); } catch (_e) { /* noop */ }
      dashRef.current = null;
    }
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !selected) return;
    const resumeAt = v.currentTime || 0;
    teardown();
    setBuffering(true);
    // if an adaptive source never becomes playable, move on to the next candidate
    watchdogRef.current = setTimeout(() => {
      if (videoRef.current && videoRef.current.readyState < 2) advance();
    }, 15000);
    if (selected.kind === "dash") {
      if (!dashjs.supportsMediaSource()) {
        advance();
        return;
      }
      const player = dashjs.MediaPlayer().create();
      dashRef.current = player;
      player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: true, audio: true } } } });
      player.on(dashjs.MediaPlayer.events.ERROR, () => advance());
      player.initialize(v, selected.url, false);
    } else if (selected.kind === "hls") {
      if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = selected.url;
      } else if (Hls.isSupported()) {
        const hls = new Hls();
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data?.fatal) advance();
        });
        hls.loadSource(selected.url);
        hls.attachMedia(v);
      } else {
        advance();
        return;
      }
    } else {
      v.src = selected.url;
      v.load();
    }
    if (resumeAt) v.currentTime = resumeAt;
    if (playing) v.play().catch(() => {});
    return teardown;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.url]);

  const advance = () => {
    setIndex((i) => {
      if (i + 1 < candidates.length) return i + 1;
      setFailed(true);
      setBuffering(false);
      return i;
    });
  };

  const onLoaded = () => {
    setBuffering(false);
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
    const v = videoRef.current;
    if (v && Number.isFinite(v.duration)) setDuration(v.duration);
  };
  const onTime = () => setCurrentTime(videoRef.current?.currentTime || 0);
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().then(() => setPlaying(true)).catch(() => {});
    else {
      v.pause();
      setPlaying(false);
    }
  };
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };
  const onSeek = (e) => {
    const v = videoRef.current;
    if (!v) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    v.currentTime = pct * (v.duration || 0);
  };
  const goFullscreen = () => {
    const el = videoRef.current?.parentElement;
    if (el?.requestFullscreen) el.requestFullscreen();
  };

  return (
    <div
      data-testid="player-container"
      data-stream-kind={selected?.kind || "none"}
      data-stream-label={selected?.label || ""}
      className="relative w-full aspect-video rounded-3xl overflow-hidden border shadow-2xl bg-black group"
    >
      <video
        ref={videoRef}
        data-testid="player-video-element"
        className="w-full h-full"
        onWaiting={() => setBuffering(true)}
        onCanPlay={() => setBuffering(false)}
        onPlaying={() => { setBuffering(false); setPlaying(true); }}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={onLoaded}
        onTimeUpdate={onTime}
        onError={() => { if (!hlsRef.current && !dashRef.current) advance(); }}
        onClick={togglePlay}
        playsInline
        controls={false}
        poster={video?.videoThumbnails?.[0]?.url}
      />

      {buffering && !failed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {!buffering && !playing && !failed && (
        <button
          type="button"
          data-testid="player-big-play-button"
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center"
          aria-label="Lire"
        >
          <span className="w-16 h-16 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center shadow-xl hover:scale-105 transition-transform">
            <Play className="w-7 h-7 ml-1" />
          </span>
        </button>
      )}

      {failed && (
        <div
          data-testid="player-stream-error"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center"
        >
          <p className="text-sm text-white/90 max-w-md">
            {video?.liveNow && candidates.length === 0
              ? "Les diffusions en direct ne sont pas disponibles via les instances Invidious/Piped actuelles."
              : "Aucun flux vidéo lisible n'a été fourni par les instances Invidious/Piped pour cette vidéo."}
            {candidates.length > 0 && " Votre navigateur ne prend en charge aucun des formats proposés."}
          </p>
          {onRetry && (
            <Button data-testid="player-retry-button" onClick={onRetry} className="rounded-full">
              Réessayer
            </Button>
          )}
        </div>
      )}

      {video?.source?.host && (
        <div
          data-testid="player-source-badge"
          title={`Vidéo servie par ${video.source.url}`}
          className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono uppercase tracking-widest text-white/90 opacity-80 group-hover:opacity-100 transition-opacity"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${video.source.custom ? "bg-primary" : "bg-emerald-400"}`} />
          {video.source.type}
          <span className="text-white/60 normal-case tracking-normal">· {video.source.host}</span>
        </div>
      )}

      {!failed && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col gap-2 backdrop-blur-sm">
          <div
            className="w-full h-1.5 hover:h-2 bg-white/20 rounded-full cursor-pointer relative transition-all"
            onClick={onSeek}
            data-testid="player-progress-bar"
          >
            <div
              className="absolute inset-y-0 left-0 bg-primary rounded-full"
              style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
          <div className="flex items-center gap-2 text-white">
            <Button
              data-testid="player-play-pause-button"
              variant="ghost"
              size="icon"
              onClick={togglePlay}
              className="text-white hover:bg-white/10"
            >
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </Button>
            <Button
              data-testid="player-mute-button"
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              className="text-white hover:bg-white/10"
            >
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </Button>
            <div className="text-xs font-mono tabular-nums" data-testid="player-time">
              {formatDuration(currentTime) || "0:00"} / {formatDuration(duration) || "0:00"}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {candidates.length > 1 && (
                <Select value={String(index)} onValueChange={(v) => setIndex(Number(v))}>
                  <SelectTrigger
                    data-testid="player-quality-select"
                    className="w-28 h-8 bg-white/10 border-white/20 text-white text-xs"
                  >
                    <SelectValue placeholder="Qualité" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((s, i) => (
                      <SelectItem key={s.url} value={String(i)}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                data-testid="player-fullscreen-button"
                variant="ghost"
                size="icon"
                onClick={goFullscreen}
                className="text-white hover:bg-white/10"
              >
                <Maximize className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Ordered list of playable sources: DASH (adaptive HD) first, then progressive mp4/webm, then HLS.
function buildCandidates(video) {
  if (!video) return [];
  const list = [];
  const seen = new Set();
  const push = (c) => {
    if (!c.url || seen.has(c.url)) return;
    seen.add(c.url);
    list.push(c);
  };
  const isBrokenMirror = (s) => String(s.itag) === "-1" || /odycdn\.com/i.test(s.url || "");
  const progressive = (video.formatStreams || [])
    .filter((s) => s.url && !isBrokenMirror(s))
    .filter((s) => /mp4|webm/i.test(`${s.type || ""} ${s.container || ""}`))
    .sort((a, b) => parseInt(b.qualityLabel || b.resolution || 0) - parseInt(a.qualityLabel || a.resolution || 0));
  for (const s of progressive) {
    push({
      kind: "progressive",
      url: s.url,
      label: s.qualityLabel || s.quality || s.resolution || "auto",
    });
  }
  if (video.hlsUrl) push({ kind: "hls", url: video.hlsUrl, label: video.liveNow ? "Live (HLS)" : "Auto (HLS)" });
  if (video.dashUrl && !video.liveNow) {
    const maxH = Math.max(0, ...(video.adaptiveFormats || []).map((f) => parseInt(f.qualityLabel || f.resolution || 0) || 0));
    list.unshift({ kind: "dash", url: video.dashUrl, label: maxH ? `Auto (jusqu'à ${maxH}p)` : "Auto (HD)" });
  }
  return list;
}
