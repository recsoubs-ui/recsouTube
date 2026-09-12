"""RecsouTube backend regression tests (iteration 2)."""
import os
import re
import uuid
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get(
    "REACT_APP_BACKEND_URL"
) else None
if not BASE_URL:
    # Load from frontend .env directly
    from pathlib import Path
    env = Path("/app/frontend/.env").read_text()
    for line in env.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break

API = f"{BASE_URL}/api"
LONG = 90  # generous timeout for video endpoint (multi-instance fallback)


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers["Content-Type"] = "application/json"
    return s


@pytest.fixture(scope="session")
def auth(session):
    """Register a fresh test user and return (token, user)."""
    rand = uuid.uuid4().hex[:8]
    payload = {
        "username": f"qa_{rand}",
        "email": f"qa_{rand}@example.com",
        "password": "qatester123",
    }
    r = session.post(f"{API}/auth/register", json=payload, timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    return data["token"], data["user"], payload


@pytest.fixture(scope="session")
def auth_headers(auth):
    return {"Authorization": f"Bearer {auth[0]}"}


# ---------- Search ----------
def test_search_music(session):
    r = session.get(f"{API}/search", params={"q": "music"}, timeout=LONG)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "results" in body
    results = body["results"]
    assert isinstance(results, list) and len(results) >= 5, f"got {len(results)}"
    for v in results[:5]:
        assert v.get("videoId")
        assert v.get("title")
        assert "author" in v
        assert isinstance(v.get("videoThumbnails", []), list)
        assert "lengthSeconds" in v


# ---------- Video OK ----------
def test_video_dqw(session):
    r = session.get(f"{API}/videos/dQw4w9WgXcQ", timeout=LONG)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("title")
    streams = data.get("formatStreams") or []
    mp4s = [
        s for s in streams
        if "mp4" in (s.get("type") or "").lower()
        and str(s.get("url", "")).startswith("http")
        and str(s.get("itag", "")) != "-1"
        and "odycdn" not in str(s.get("url", "")).lower()
    ]
    assert len(mp4s) >= 1, f"no playable mp4 stream: {streams}"
    assert "subCountText" in data
    pub = data.get("publishedText", "")
    assert re.match(r"^\d{2}/\d{2}/\d{4}$", pub), f"publishedText not JJ/MM/AAAA: {pub}"
    desc = data.get("description", "")
    assert "<" not in desc and ">" not in desc, "description contains HTML tags"
    recs = data.get("recommendedVideos") or []
    assert len(recs) > 0
    for rec in recs:
        assert rec.get("liveNow", False) is False


# ---------- Video blocked (424) ----------
def test_video_blocked_424_and_search_still_works(session):
    r = session.get(f"{API}/videos/GqrKj5lD5y4", timeout=LONG)
    assert r.status_code == 424, f"expected 424 got {r.status_code}: {r.text}"
    detail = r.json().get("detail", "")
    assert "YouTube bloque" in detail or "bloque temporairement" in detail.lower(), detail

    # Search should still work
    r2 = session.get(f"{API}/search", params={"q": "music"}, timeout=LONG)
    assert r2.status_code == 200
    assert len(r2.json().get("results", [])) >= 1


# ---------- Auth ----------
def test_auth_me(session, auth, auth_headers):
    r = session.get(f"{API}/auth/me", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    assert r.json()["email"] == auth[2]["email"]


# ---------- History ----------
def test_history_flow(session, auth_headers):
    payload = {
        "videoId": "dQw4w9WgXcQ",
        "title": "Rick Astley - Never Gonna Give You Up",
        "author": "Rick Astley",
        "authorId": "UCuAXFkgsw1L7xaCfnd5JJOw",
        "lengthSeconds": 213,
        "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    }
    r = session.post(f"{API}/history", json=payload, headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True and body.get("item", {}).get("videoId") == "dQw4w9WgXcQ"

    r = session.get(f"{API}/history", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    items = r.json().get("results", [])
    assert any(i.get("videoId") == "dQw4w9WgXcQ" for i in items)

    r = session.delete(f"{API}/history/dQw4w9WgXcQ", headers=auth_headers, timeout=30)
    assert r.status_code == 200

    r = session.get(f"{API}/history", headers=auth_headers, timeout=30)
    assert not any(i.get("videoId") == "dQw4w9WgXcQ" for i in r.json().get("results", []))


# ---------- Playlists ----------
def test_playlists_flow(session, auth_headers):
    r = session.post(
        f"{API}/playlists", json={"name": "TEST_Playlist"}, headers=auth_headers, timeout=30
    )
    assert r.status_code == 200, r.text
    pl = r.json()
    assert pl.get("id") and pl["name"] == "TEST_Playlist" and pl["videos"] == []
    pid = pl["id"]

    r = session.get(f"{API}/playlists", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    ids = [p["id"] for p in r.json().get("results", [])]
    assert pid in ids

    r = session.post(
        f"{API}/playlists/{pid}/videos",
        json={"videoId": "dQw4w9WgXcQ", "title": "Rick", "author": "Rick Astley"},
        headers=auth_headers,
        timeout=30,
    )
    assert r.status_code == 200 and r.json().get("ok") is True

    r = session.get(f"{API}/playlists/{pid}", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    vids = [v["videoId"] for v in r.json().get("videos", [])]
    assert "dQw4w9WgXcQ" in vids

    r = session.delete(f"{API}/playlists/{pid}", headers=auth_headers, timeout=30)
    assert r.status_code == 200


# ---------- Subscriptions ----------
def test_subscriptions_flow(session, auth_headers):
    payload = {
        "channelId": "UCuAXFkgsw1L7xaCfnd5JJOw",
        "channelName": "Rick Astley",
        "channelThumbnail": "https://example.com/a.jpg",
    }
    r = session.post(f"{API}/subscriptions", json=payload, headers=auth_headers, timeout=30)
    assert r.status_code == 200 and r.json().get("ok") is True

    r = session.get(f"{API}/subscriptions", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    items = r.json().get("results", [])
    assert any(s["channelId"] == payload["channelId"] for s in items)
    count_before = len([s for s in items if s["channelId"] == payload["channelId"]])

    # idempotent
    r = session.post(f"{API}/subscriptions", json=payload, headers=auth_headers, timeout=30)
    assert r.status_code == 200
    r = session.get(f"{API}/subscriptions", headers=auth_headers, timeout=30)
    items = r.json().get("results", [])
    count_after = len([s for s in items if s["channelId"] == payload["channelId"]])
    assert count_after == count_before == 1

    r = session.delete(
        f"{API}/subscriptions/{payload['channelId']}", headers=auth_headers, timeout=30
    )
    assert r.status_code == 200
