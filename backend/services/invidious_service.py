"""MediaService: manages a pool of Invidious AND Piped instances with automatic
health checks, fallback and lightweight in-memory caching.

Public interface (kept as InvidiousService for backward compat) returns
Invidious-shaped payloads. Piped responses are normalized to look like Invidious.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
import time
from datetime import datetime
from html import unescape
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

USER_AGENT = "Mozilla/5.0 (compatible; RecsouTubeBot/1.0)"
INVIDIOUS_LOCALE = os.environ.get("INVIDIOUS_LOCALE", "fr")


def _extract_video_id(url_or_id: str) -> str:
    if not url_or_id:
        return ""
    if "watch?v=" in url_or_id:
        return url_or_id.split("watch?v=", 1)[1].split("&")[0]
    return url_or_id.lstrip("/")


def _extract_channel_id(url: str) -> str:
    if not url:
        return ""
    if "/channel/" in url:
        return url.split("/channel/", 1)[1].split("/")[0].split("?")[0]
    return url


class InvidiousUnavailableError(Exception):
    pass


class ResourceUnavailableError(Exception):
    """The instances are alive but the requested resource (video/channel) failed upstream."""

    pass


class InvidiousService:
    HEALTHY_TTL = 60 * 10
    UNHEALTHY_TTL = 60 * 2
    REQUEST_TIMEOUT = 10.0
    MAX_ATTEMPTS = 5
    CACHE_TTL_SECONDS = 60 * 5

    def __init__(self) -> None:
        self.instances: list[dict[str, str]] = []

        primary = (os.environ.get("INVIDIOUS_BASE_URL") or "").strip()
        if primary:
            self.instances.append({"url": primary.rstrip("/"), "type": "invidious"})

        for u in (os.environ.get("INVIDIOUS_FALLBACK_URLS") or "").split(","):
            u = u.strip().rstrip("/")
            if u and not self._has(u):
                self.instances.append({"url": u, "type": "invidious"})

        for u in (os.environ.get("PIPED_FALLBACK_URLS") or "").split(","):
            u = u.strip().rstrip("/")
            if u and not self._has(u):
                self.instances.append({"url": u, "type": "piped"})

        self.probe_video_id: str = os.environ.get(
            "INVIDIOUS_PROBE_VIDEO_ID", "dQw4w9WgXcQ"
        )
        self._health: dict[str, dict[str, Any]] = {}
        self._current: Optional[dict[str, str]] = None
        self._cache: dict[str, tuple[float, Any]] = {}

    def _has(self, url: str) -> bool:
        return any(i["url"] == url for i in self.instances)

    def get_configured_instances(self) -> list[dict[str, Any]]:
        return [self._public(i) for i in self.instances]

    @staticmethod
    def _public(inst: Optional[dict]) -> Optional[dict]:
        if not inst:
            return None
        return {"url": inst["url"], "type": inst["type"], "custom": bool(inst.get("custom"))}

    def set_custom_instance(self, url: str, itype: str, headers: Optional[dict] = None) -> dict:
        url = url.strip().rstrip("/")
        self.clear_custom_instance()
        self.instances = [i for i in self.instances if i["url"] != url]
        inst = {"url": url, "type": itype, "custom": True, "headers": dict(headers or {})}
        self.instances.insert(0, inst)
        self._health.pop(url, None)
        self._current = None
        self._cache.clear()
        return self._public(inst)

    def clear_custom_instance(self) -> None:
        for i in list(self.instances):
            if i.get("custom"):
                self.instances.remove(i)
                self._health.pop(i["url"], None)
                if self._current and self._current["url"] == i["url"]:
                    self._current = None
        self._cache.clear()

    def get_custom_instance(self) -> Optional[dict]:
        return next((i for i in self.instances if i.get("custom")), None)

    def get_health_snapshot(self) -> list[dict[str, Any]]:
        out = []
        for i in self.instances:
            h = self._health.get(i["url"], {})
            out.append(
                {
                    "url": i["url"],
                    "type": i["type"],
                    "healthy": h.get("healthy"),
                    "checked_at": h.get("checked_at"),
                    "note": h.get("note"),
                    "custom": bool(i.get("custom")),
                    "is_current": bool(self._current and i["url"] == self._current["url"]),
                }
            )
        return out

    async def _http_get(
        self, url: str, params: Optional[dict] = None, headers: Optional[dict] = None
    ) -> httpx.Response:
        hdrs = {"User-Agent": USER_AGENT, "Accept": "application/json"}
        hdrs.update(headers or {})
        async with httpx.AsyncClient(
            timeout=self.REQUEST_TIMEOUT, follow_redirects=True, headers=hdrs
        ) as client:
            return await client.get(url, params=params or {})

    async def probe_instance(self, instance: dict[str, Any]) -> dict[str, Any]:
        url = instance["url"].rstrip("/")
        itype = instance["type"]
        hdrs = instance.get("headers") or {}
        result: dict[str, Any] = {
            "url": url,
            "type": itype,
            "healthy": False,
            "note": "",
            "endpoints": {},
        }
        try:
            if itype == "invidious":
                search_path = "/api/v1/search"
                search_params = {"q": "music", "type": "video"}
                video_path = f"/api/v1/videos/{self.probe_video_id}"
            else:  # piped
                search_path = "/search"
                search_params = {"q": "music", "filter": "videos"}
                video_path = f"/streams/{self.probe_video_id}"

            try:
                r = await self._http_get(f"{url}{search_path}", search_params, hdrs)
                ok, count, err = False, 0, ""
                if r.status_code == 200:
                    try:
                        j = r.json()
                        items = j if isinstance(j, list) else (j.get("items") if isinstance(j, dict) else None)
                        ok = isinstance(items, list)
                        count = len(items) if ok else 0
                    except Exception:
                        err = "réponse non JSON (page HTML / anti-bot ?)"
                else:
                    err = _short_body(r)
                result["endpoints"]["search"] = {"status": r.status_code, "ok": ok, "count": count, "error": err}
            except Exception as e:
                result["endpoints"]["search"] = {"status": None, "ok": False, "count": 0, "error": str(e)}

            try:
                r = await self._http_get(f"{url}{video_path}", None, hdrs)
                ok, streams, err = False, 0, ""
                if r.status_code == 200:
                    try:
                        j = r.json()
                        ok = bool(j.get("title") or j.get("videoId"))
                        streams = len([f for f in (j.get("formatStreams") or []) if _is_playable_stream(f)]) + len(
                            [v for v in (j.get("videoStreams") or []) if not v.get("videoOnly") and _is_playable_stream(v)]
                        )
                    except Exception:
                        err = "réponse non JSON (page HTML / anti-bot ?)"
                else:
                    err = _short_body(r)
                result["endpoints"]["videos"] = {"status": r.status_code, "ok": ok, "streams": streams, "error": err}
            except Exception as e:
                result["endpoints"]["videos"] = {"status": None, "ok": False, "streams": 0, "error": str(e)}

            s_ok = result["endpoints"].get("search", {}).get("ok")
            v_ok = result["endpoints"].get("videos", {}).get("ok")
            result["healthy"] = bool(s_ok and v_ok)
            if not result["healthy"]:
                result["note"] = (
                    "search endpoint failed" if not s_ok else "videos endpoint failed"
                )
        except Exception as e:
            result["note"] = f"probe exception: {e}"
        return result

    async def get_working_instance(
        self, force_refresh: bool = False, exclude: Optional[set[str]] = None
    ) -> Optional[dict[str, str]]:
        now = time.time()
        exclude = exclude or set()
        if not force_refresh and self._current and self._current["url"] not in exclude:
            h = self._health.get(self._current["url"], {})
            if h.get("healthy") and (now - h.get("checked_at", 0)) < self.HEALTHY_TTL:
                return self._current

        for inst in self.instances:
            if inst["url"] in exclude:
                continue
            h = self._health.get(inst["url"])
            fresh = h and (now - h.get("checked_at", 0)) < (
                self.HEALTHY_TTL if h.get("healthy") else self.UNHEALTHY_TTL
            )
            if fresh and not h.get("healthy") and not force_refresh:
                continue
            if fresh and h.get("healthy"):
                if not self._current or self._current["url"] in exclude:
                    self._current = inst
                return inst
            probe = await self.probe_instance(inst)
            self._health[inst["url"]] = {
                "healthy": probe["healthy"],
                "checked_at": time.time(),
                "note": probe.get("note", ""),
            }
            if probe["healthy"]:
                if not self._current or self._current["url"] in exclude:
                    self._current = inst
                return inst
        return None

    def _mark_bad(self, url: str, note: str) -> None:
        self._health[url] = {"healthy": False, "checked_at": time.time(), "note": note}
        if self._current and self._current["url"] == url:
            self._current = None

    async def _do_request(
        self,
        endpoint: str,  # "search" | "video" | "trending" | "popular" | "channel" | "channel_videos" | "comments"
        *,
        params: Optional[dict] = None,
        video_id: str = "",
        channel_id: str = "",
        cache_key: Optional[str] = None,
        cache_ttl: Optional[int] = None,
    ) -> Any:
        if cache_key:
            entry = self._cache.get(cache_key)
            if entry and entry[0] > time.time():
                return entry[1]

        attempts = 0
        last_error: Optional[str] = None
        resource_error: Optional[str] = None
        tried: set[str] = set()

        while attempts < self.MAX_ATTEMPTS:
            attempts += 1
            inst = await self.get_working_instance(exclude=tried)
            if not inst:
                if resource_error:
                    raise ResourceUnavailableError(resource_error)
                raise InvidiousUnavailableError(
                    last_error
                    or "Aucune instance Invidious/Piped compatible n'est actuellement configurée."
                )
            tried.add(inst["url"])

            path, req_params = self._resolve_path(
                inst["type"], endpoint, params, video_id, channel_id
            )
            if path is None:
                last_error = f"{endpoint} unsupported on {inst['type']}"
                continue

            try:
                r = await self._http_get(f"{inst['url']}{path}", req_params, inst.get("headers"))
            except (httpx.TimeoutException, httpx.RequestError) as e:
                last_error = f"network error on {inst['url']}: {e}"
                self._mark_bad(inst["url"], last_error)
                continue

            if r.status_code != 200:
                upstream_msg = _upstream_error_message(r)
                if upstream_msg and endpoint in ("video", "channel", "channel_videos", "comments"):
                    # instance is alive; YouTube refused this specific resource -> try next instance
                    resource_error = upstream_msg
                    logger.warning("resource error on %s for %s: %s", inst["url"], endpoint, upstream_msg[:120])
                    continue
                last_error = f"HTTP {r.status_code} from {inst['url']}"
                self._mark_bad(inst["url"], last_error)
                continue

            try:
                data = r.json()
            except Exception as e:
                last_error = f"invalid json from {inst['url']}: {e}"
                self._mark_bad(inst["url"], last_error)
                continue

            # normalize
            normalized = self._normalize(inst, endpoint, data)
            if endpoint == "video" and isinstance(normalized, dict):
                normalized["source"] = {
                    "url": inst["url"],
                    "host": inst["url"].split("://", 1)[-1],
                    "type": inst["type"],
                    "custom": bool(inst.get("custom")),
                }
            if cache_key:
                ttl = cache_ttl if cache_ttl is not None else self.CACHE_TTL_SECONDS
                self._cache[cache_key] = (time.time() + ttl, normalized)
            return normalized

        if resource_error:
            raise ResourceUnavailableError(resource_error)
        raise InvidiousUnavailableError(
            last_error or "Toutes les instances configurées ont échoué."
        )

    def _resolve_path(
        self,
        itype: str,
        endpoint: str,
        params: Optional[dict],
        video_id: str,
        channel_id: str,
    ) -> tuple[Optional[str], dict]:
        params = dict(params or {})
        if itype == "invidious":
            hl = {"hl": INVIDIOUS_LOCALE}
            if endpoint == "search":
                return "/api/v1/search", {**params, **hl}
            if endpoint == "video":
                # local=true -> stream URLs proxied by the instance (playable from any IP)
                return f"/api/v1/videos/{video_id}", {"local": "true", **hl}
            if endpoint == "trending":
                return "/api/v1/trending", {**params, **hl}
            if endpoint == "popular":
                return "/api/v1/popular", hl
            if endpoint == "channel":
                return f"/api/v1/channels/{channel_id}", hl
            if endpoint == "channel_videos":
                return f"/api/v1/channels/{channel_id}/videos", hl
            if endpoint == "comments":
                cont = params.get("continuation")
                return f"/api/v1/comments/{video_id}", ({"continuation": cont, **hl} if cont else hl)
        else:  # piped
            if endpoint == "search":
                q = params.pop("q", "")
                params["q"] = q
                params.setdefault("filter", "videos")
                params.pop("type", None)
                params.pop("page", None)
                return "/search", params
            if endpoint == "video":
                return f"/streams/{video_id}", {}
            if endpoint == "trending":
                region = params.get("region", "US")
                return "/trending", {"region": region}
            if endpoint == "popular":
                return None, {}
            if endpoint == "channel":
                return f"/channel/{channel_id}", {}
            if endpoint == "channel_videos":
                return f"/channel/{channel_id}", {}
            if endpoint == "comments":
                cont = params.get("continuation")
                if cont:
                    return f"/nextpage/comments/{video_id}", {"nextpage": cont}
                return f"/comments/{video_id}", {}
        return None, {}

    # ---------- normalization ----------
    def _normalize(self, inst: dict, endpoint: str, data: Any) -> Any:
        if inst["type"] == "invidious":
            if endpoint == "video" and isinstance(data, dict):
                dash = data.get("dashUrl") or ""
                if dash and "local=" not in dash:
                    data["dashUrl"] = dash + ("&" if "?" in dash else "?") + "local=true"
                if data.get("liveNow") and not data.get("hlsUrl"):
                    data["dashUrl"] = ""  # live DASH manifests are empty on Invidious
            return data
        # piped -> invidious
        if endpoint == "search":
            items = data.get("items", []) if isinstance(data, dict) else []
            return [self._piped_stream_to_inv(x) for x in items]
        if endpoint == "trending":
            items = data if isinstance(data, list) else []
            return [self._piped_stream_to_inv(x) for x in items]
        if endpoint == "video":
            return self._piped_video_to_inv(data)
        if endpoint == "channel":
            return self._piped_channel_to_inv(data)
        if endpoint == "channel_videos":
            related = data.get("relatedStreams", []) if isinstance(data, dict) else []
            return [self._piped_stream_to_inv(x) for x in related]
        if endpoint == "comments":
            return self._piped_comments_to_inv(data)
        return data

    def _piped_stream_to_inv(self, x: dict) -> dict:
        if not isinstance(x, dict):
            return {}
        vid = _extract_video_id(x.get("url") or "")
        cid = _extract_channel_id(x.get("uploaderUrl") or "")
        thumb = x.get("thumbnail") or ""
        duration = int(x.get("duration") or 0)
        uploaded_text = x.get("uploadedDate") or x.get("uploadedText") or ""
        # Piped: live streams have duration -1 AND no upload date
        is_live = duration == -1 and not uploaded_text
        return {
            "type": "video",
            "videoId": vid,
            "title": x.get("title") or "",
            "author": x.get("uploaderName") or "",
            "authorId": cid,
            "authorUrl": x.get("uploaderUrl") or "",
            "authorVerified": bool(x.get("uploaderVerified")),
            "authorThumbnails": (
                [{"url": x.get("uploaderAvatar"), "width": 68, "height": 68}]
                if x.get("uploaderAvatar")
                else []
            ),
            "videoThumbnails": [
                {"quality": "maxres", "url": thumb, "width": 1280, "height": 720},
                {"quality": "medium", "url": thumb, "width": 320, "height": 180},
            ]
            if thumb
            else [],
            "description": x.get("shortDescription") or "",
            "descriptionHtml": "",
            "viewCount": int(x.get("views") or 0),
            "viewCountText": _views_text(x.get("views") or 0),
            "lengthSeconds": max(duration, 0),
            "published": int((x.get("uploaded") or 0) / 1000),
            "publishedText": uploaded_text,
            "liveNow": is_live,
            "paid": False,
            "premium": False,
        }

    def _piped_video_to_inv(self, d: dict) -> dict:
        if not isinstance(d, dict):
            return {}
        cid = _extract_channel_id(d.get("uploaderUrl") or "")
        thumb = d.get("thumbnailUrl") or ""
        related = d.get("relatedStreams") or []
        description_html = d.get("description") or ""
        video_streams = [
            s for s in (d.get("videoStreams") or []) if _is_playable_stream(s)
        ]
        progressive = sorted(
            [s for s in video_streams if not s.get("videoOnly")],
            key=lambda s: int(s.get("height") or 0),
            reverse=True,
        )
        return {
            "videoId": d.get("videoId") or "",
            "title": d.get("title") or "",
            "description": _strip_html(description_html),
            "descriptionHtml": description_html,
            "published": int((d.get("uploaded") or 0) / 1000),
            "publishedText": _format_date(d.get("uploadDate") or ""),
            "keywords": d.get("tags") or [],
            "viewCount": int(d.get("views") or 0),
            "viewCountText": _views_text(d.get("views") or 0),
            "likeCount": int(d.get("likes") or 0),
            "dislikeCount": int(d.get("dislikes") or 0),
            "author": d.get("uploader") or "",
            "authorId": cid,
            "authorUrl": d.get("uploaderUrl") or "",
            "authorVerified": bool(d.get("uploaderVerified")),
            "authorThumbnails": (
                [{"url": d.get("uploaderAvatar"), "width": 176, "height": 176}]
                if d.get("uploaderAvatar")
                else []
            ),
            "subCountText": _compact_number(d.get("uploaderSubscriberCount") or 0),
            "lengthSeconds": max(int(d.get("duration") or 0), 0),
            "liveNow": bool(d.get("livestream")),
            "videoThumbnails": [
                {"quality": "maxres", "url": thumb, "width": 1280, "height": 720},
                {"quality": "medium", "url": thumb, "width": 320, "height": 180},
            ]
            if thumb
            else [],
            "hlsUrl": d.get("hls") or "",
            "dashUrl": d.get("dash") or "",
            "formatStreams": [
                {
                    "url": s.get("url"),
                    "itag": str(s.get("itag") or ""),
                    "type": s.get("mimeType") or "",
                    "quality": s.get("quality") or "",
                    "container": (s.get("format") or "").lower(),
                    "resolution": f"{s.get('height', 0)}p" if s.get("height") else "",
                    "qualityLabel": s.get("quality") or "",
                }
                for s in progressive
            ],
            "adaptiveFormats": [
                {
                    "url": s.get("url"),
                    "itag": str(s.get("itag") or ""),
                    "type": s.get("mimeType") or "",
                    "quality": s.get("quality") or "",
                    "container": (s.get("format") or "").lower(),
                    "resolution": f"{s.get('height', 0)}p" if s.get("height") else "",
                    "qualityLabel": s.get("quality") or "",
                    "bitrate": s.get("bitrate"),
                }
                for s in video_streams
                if s.get("videoOnly")
            ]
            + [
                {
                    "url": s.get("url"),
                    "itag": str(s.get("itag") or ""),
                    "type": s.get("mimeType") or "",
                    "container": (s.get("format") or "").lower(),
                    "audioQuality": s.get("quality"),
                    "bitrate": s.get("bitrate"),
                }
                for s in (d.get("audioStreams") or [])
            ],
            "recommendedVideos": [self._piped_stream_to_inv(r) for r in related],
            "genre": d.get("category") or "",
            "isFamilyFriendly": True,
        }

    def _piped_channel_to_inv(self, d: dict) -> dict:
        if not isinstance(d, dict):
            return {}
        return {
            "authorId": d.get("id") or "",
            "author": d.get("name") or "",
            "authorThumbnails": (
                [{"url": d.get("avatarUrl"), "width": 176, "height": 176}]
                if d.get("avatarUrl")
                else []
            ),
            "authorBanners": (
                [{"url": d.get("bannerUrl"), "width": 1280, "height": 175}]
                if d.get("bannerUrl")
                else []
            ),
            "subCount": int(d.get("subscriberCount") or 0),
            "description": d.get("description") or "",
            "isVerified": bool(d.get("verified")),
            "latestVideos": [
                self._piped_stream_to_inv(v) for v in (d.get("relatedStreams") or [])
            ],
        }

    def _piped_comments_to_inv(self, d: dict) -> dict:
        if not isinstance(d, dict):
            return {"commentCount": 0, "comments": []}
        return {
            "commentCount": int(d.get("commentCount") or 0),
            "continuation": d.get("nextpage") or "",
            "comments": [
                {
                    "author": c.get("author") or "",
                    "authorThumbnails": (
                        [{"url": c.get("thumbnail"), "width": 76, "height": 76}]
                        if c.get("thumbnail")
                        else []
                    ),
                    "authorId": _extract_channel_id(c.get("commentorUrl") or ""),
                    "content": _strip_html(c.get("commentText") or ""),
                    "contentHtml": c.get("commentText") or "",
                    "publishedText": c.get("commentedTime") or "",
                    "likeCount": int(c.get("likeCount") or 0),
                    "replyCount": int(c.get("replyCount") or 0),
                    "repliesContinuation": c.get("repliesPage") or "",
                    "commentId": c.get("commentId") or "",
                    "isPinned": bool(c.get("pinned")),
                    "creatorHeart": bool(c.get("hearted")),
                    "verified": bool(c.get("verified")),
                    "authorIsChannelOwner": bool(c.get("channelOwner")),
                }
                for c in (d.get("comments") or [])
            ],
        }

    # ---------- public convenience ----------
    async def search(self, q: str, page: int = 1, type_: str = "video"):
        params = {"q": q, "type": type_, "page": page}
        data = await self._do_request(
            "search",
            params=params,
            cache_key=f"search:{type_}:{page}:{q}",
            cache_ttl=120,
        )
        return data if isinstance(data, list) else []

    async def video(self, video_id: str):
        data = await self._do_request(
            "video", video_id=video_id, cache_key=f"video:{video_id}", cache_ttl=600
        )
        if isinstance(data, dict) and not data.get("videoId"):
            data["videoId"] = video_id  # Piped /streams omits the id
        return data

    async def trending(self, region: str = "US"):
        data = await self._do_request(
            "trending",
            params={"region": region},
            cache_key=f"trending:{region}",
            cache_ttl=600,
        )
        return data if isinstance(data, list) else []

    async def popular(self):
        try:
            data = await self._do_request(
                "popular", cache_key="popular", cache_ttl=600
            )
            return data if isinstance(data, list) else []
        except InvidiousUnavailableError:
            # fallback to trending
            return await self.trending()

    async def channel(self, channel_id: str):
        return await self._do_request(
            "channel", channel_id=channel_id, cache_key=f"channel:{channel_id}", cache_ttl=600
        )

    async def channel_videos(self, channel_id: str):
        data = await self._do_request(
            "channel_videos",
            channel_id=channel_id,
            cache_key=f"channel_videos:{channel_id}",
            cache_ttl=300,
        )
        return data if isinstance(data, list) else []

    async def comments(self, video_id: str, continuation: str = ""):
        return await self._do_request(
            "comments",
            video_id=video_id,
            params={"continuation": continuation} if continuation else {},
            cache_key=f"comments:{video_id}:{hashlib.sha1(continuation.encode()).hexdigest() if continuation else ''}",
            cache_ttl=300,
        )


def _compact_number(n: Any) -> str:
    try:
        n = int(n)
    except Exception:
        return ""
    if n >= 1_000_000_000:
        return f"{n/1_000_000_000:.1f} Md"
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f} M"
    if n >= 1_000:
        return f"{n/1_000:.1f} k"
    return str(n)


def _views_text(n: int) -> str:
    c = _compact_number(n)
    return f"{c} vues" if c else ""


def _strip_html(html: str) -> str:
    if not html:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return unescape(text).strip()


def _format_date(iso: str) -> str:
    if not iso:
        return ""
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%d/%m/%Y")
    except Exception:
        return iso


def _short_body(r: httpx.Response) -> str:
    try:
        j = r.json()
        if isinstance(j, dict) and j.get("error"):
            return str(j["error"]).split("\n", 1)[0][:160]
    except Exception:
        pass
    return f"HTTP {r.status_code}"


def _upstream_error_message(r: httpx.Response) -> str:
    """Return a human message if the response is a JSON error emitted by a live instance."""
    if r.status_code not in (400, 404, 500):
        return ""
    try:
        j = r.json()
    except Exception:
        return ""
    if not isinstance(j, dict) or not j.get("error"):
        return ""
    err = str(j.get("error"))
    if "SignInConfirmNotBot" in err or "LOGIN_REQUIRED" in err or "not a bot" in err:
        return "YouTube bloque temporairement l'accès à cette vidéo depuis les instances publiques Invidious/Piped (vérification anti-bot)."
    return err.split("\n", 1)[0][:200]


def _is_playable_stream(s: dict) -> bool:
    # LBRY/Odysee mirrors (itag -1) require auth and return 401 in browsers
    url = s.get("url") or ""
    if not url or str(s.get("itag")) == "-1" or "odycdn.com" in url:
        return False
    return True


_service_instance: Optional[InvidiousService] = None


def get_invidious_service() -> InvidiousService:
    global _service_instance
    if _service_instance is None:
        _service_instance = InvidiousService()
    return _service_instance


async def refresh_all_instances() -> list[dict[str, Any]]:
    svc = get_invidious_service()
    results = await asyncio.gather(*[svc.probe_instance(i) for i in svc.instances])
    for r in results:
        svc._health[r["url"]] = {
            "healthy": r["healthy"],
            "checked_at": time.time(),
            "note": r.get("note", ""),
        }
        if r["healthy"] and svc._current is None:
            for inst in svc.instances:
                if inst["url"] == r["url"]:
                    svc._current = inst
                    break
    return results
