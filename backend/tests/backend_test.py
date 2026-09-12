"""RecsouTube backend regression tests (iteration 3).

Focus: verify the primary Invidious instance (schenkel.eti.br) returns
playable, proxified streams for the reference videos, plus DASH manifests.
"""
import os
import uuid
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
            break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"
LONG = 90

PRIMARY_STREAM_HOST = "https://invidious.schenkel.eti.br/videoplayback"


# ---------- session/auth ----------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers["Content-Type"] = "application/json"
    return s


@pytest.fixture(scope="session")
def auth(session):
    rand = uuid.uuid4().hex[:8]
    payload = {
        "username": f"qa_{rand}",
        "email": f"qa_{rand}@example.com",
        "password": "qatester123",
    }
    r = session.post(f"{API}/auth/register", json=payload, timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"], payload


@pytest.fixture(scope="session")
def auth_headers(auth):
    return {"Authorization": f"Bearer {auth[0]}"}


# ---------- search / trending ----------
def test_search_music_min5(session):
    r = session.get(f"{API}/search", params={"q": "music"}, timeout=LONG)
    assert r.status_code == 200
    results = r.json().get("results") or []
    assert len(results) >= 5, f"got {len(results)}"
    for v in results[:5]:
        assert v.get("videoId") and v.get("title")


def test_trending(session):
    r = session.get(f"{API}/trending", timeout=LONG)
    assert r.status_code == 200
    results = r.json().get("results") or []
    assert len(results) >= 1


# ---------- Reference videos (primary invidious) ----------
REF_VIDEOS = ["kJQP7kiw5Fk", "GqrKj5lD5y4", "9bZkp7q19f0"]


@pytest.mark.parametrize("vid", REF_VIDEOS)
def test_video_primary_instance(session, vid):
    r = session.get(f"{API}/videos/{vid}", timeout=LONG)
    assert r.status_code == 200, f"{vid} -> {r.status_code} {r.text[:200]}"
    data = r.json()
    assert data.get("title"), f"{vid}: no title"
    assert data.get("liveNow") is False

    # source must be invidious
    src = data.get("source") or {}
    assert src.get("type") == "invidious", f"{vid}: source={src}"

    # formatStreams present with proxified URL
    streams = data.get("formatStreams") or []
    assert len(streams) >= 1, f"{vid}: no formatStreams"
    first_url = streams[0].get("url") or ""
    assert first_url.startswith(PRIMARY_STREAM_HOST), (
        f"{vid}: formatStreams[0].url does not start with {PRIMARY_STREAM_HOST}: {first_url[:200]}"
    )

    # dashUrl with local=true
    dash = data.get("dashUrl") or ""
    assert dash, f"{vid}: no dashUrl"
    assert "local=true" in dash, f"{vid}: dashUrl missing local=true: {dash[:200]}"

    # publishedText present (French format e.g. 'il y a ...' or JJ/MM/AAAA)
    pub = data.get("publishedText") or ""
    assert pub, f"{vid}: no publishedText"


@pytest.mark.parametrize("vid", REF_VIDEOS)
def test_video_stream_range_206(session, vid):
    r = session.get(f"{API}/videos/{vid}", timeout=LONG)
    assert r.status_code == 200
    streams = r.json().get("formatStreams") or []
    assert streams, f"{vid}: no streams"
    url = streams[0]["url"]
    rr = requests.get(
        url,
        headers={"Range": "bytes=0-100000", "User-Agent": "Mozilla/5.0"},
        timeout=30,
        stream=True,
    )
    try:
        assert rr.status_code == 206, f"{vid}: Range status {rr.status_code}"
        ct = rr.headers.get("Content-Type", "")
        assert "video/mp4" in ct or "video/" in ct, f"{vid}: Content-Type={ct}"
    finally:
        rr.close()


@pytest.mark.parametrize("vid", REF_VIDEOS)
def test_video_dash_manifest(session, vid):
    r = session.get(f"{API}/videos/{vid}", timeout=LONG)
    assert r.status_code == 200
    dash = r.json().get("dashUrl") or ""
    assert dash
    rr = requests.get(
        dash, headers={"User-Agent": "Mozilla/5.0"}, timeout=30, allow_redirects=True
    )
    assert rr.status_code == 200, f"{vid}: dash status {rr.status_code}"
    ct = rr.headers.get("Content-Type", "")
    assert "dash+xml" in ct or "application/xml" in ct or "text/xml" in ct, (
        f"{vid}: dash content-type={ct}"
    )


# ---------- Bulk playability from search ----------
def test_search_results_bulk_playable(session):
    """At least 8 non-live videos from /search?q=music must resolve with formatStreams>=1."""
    r = session.get(f"{API}/search", params={"q": "music"}, timeout=LONG)
    assert r.status_code == 200
    results = [v for v in (r.json().get("results") or []) if not v.get("liveNow")]
    assert len(results) >= 10, f"only {len(results)} non-live results"

    ok = 0
    tried = 0
    failures = []
    for v in results:
        if ok >= 8:
            break
        vid = v.get("videoId")
        if not vid:
            continue
        tried += 1
        try:
            rr = session.get(f"{API}/videos/{vid}", timeout=LONG)
        except requests.RequestException as e:
            failures.append((vid, f"exc {e}"))
            continue
        if rr.status_code != 200:
            failures.append((vid, f"HTTP {rr.status_code}"))
            continue
        streams = rr.json().get("formatStreams") or []
        if len(streams) >= 1:
            ok += 1
        else:
            failures.append((vid, "no streams"))
    assert ok >= 8, f"only {ok}/{tried} playable; failures={failures[:10]}"


# ---------- Auth / History / Playlists / Subscriptions (regression) ----------
def test_auth_me(session, auth, auth_headers):
    r = session.get(f"{API}/auth/me", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    assert r.json()["email"] == auth[2]["email"]


def test_history_flow(session, auth_headers):
    payload = {
        "videoId": "kJQP7kiw5Fk",
        "title": "Despacito",
        "author": "Luis Fonsi",
        "authorId": "UCLp8RBhQHu9wSsq62j_Md6A",
        "lengthSeconds": 281,
        "thumbnail": "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg",
    }
    r = session.post(f"{API}/history", json=payload, headers=auth_headers, timeout=30)
    assert r.status_code == 200
    r = session.get(f"{API}/history", headers=auth_headers, timeout=30)
    assert any(i.get("videoId") == "kJQP7kiw5Fk" for i in r.json().get("results", []))
    session.delete(f"{API}/history/kJQP7kiw5Fk", headers=auth_headers, timeout=30)


def test_subscriptions_idempotent(session, auth_headers):
    payload = {
        "channelId": "UCLp8RBhQHu9wSsq62j_Md6A",
        "channelName": "LuisFonsiVEVO",
        "channelThumbnail": "https://example.com/a.jpg",
    }
    for _ in range(2):
        r = session.post(f"{API}/subscriptions", json=payload, headers=auth_headers, timeout=30)
        assert r.status_code == 200
    r = session.get(f"{API}/subscriptions", headers=auth_headers, timeout=30)
    items = [s for s in r.json().get("results", []) if s["channelId"] == payload["channelId"]]
    assert len(items) == 1
    session.delete(
        f"{API}/subscriptions/{payload['channelId']}", headers=auth_headers, timeout=30
    )
