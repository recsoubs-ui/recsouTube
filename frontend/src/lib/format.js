export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return "";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function formatViews(n) {
  if (!n && n !== 0) return "";
  n = Number(n);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} Md`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} k`;
  return String(n);
}

export function absUrl(u) {
  if (!u) return "";
  return u.startsWith("//") ? `https:${u}` : u;
}

export function pickThumbnail(video) {
  const arr = video?.videoThumbnails || [];
  if (!arr.length) return "";
  const pref = arr.find((t) => t.quality === "medium") || arr.find((t) => t.quality === "high") || arr[0];
  return absUrl(pref.url);
}

export function pickAvatar(video) {
  const arr = video?.authorThumbnails || [];
  return absUrl(arr[arr.length - 1]?.url || "");
}
