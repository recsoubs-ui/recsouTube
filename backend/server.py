from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Query
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone
import os
import logging
import uuid

from services.invidious_service import (
    get_invidious_service,
    refresh_all_instances,
    InvidiousUnavailableError,
    ResourceUnavailableError,
)
from services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    decode_token,
)

logger = logging.getLogger("recsoutube")
logging.basicConfig(level=logging.INFO)

# ---- Mongo ----
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="RecsouTube API")
api = APIRouter(prefix="/api")


# ------------------ Models ------------------
class RegisterIn(BaseModel):
    username: str = Field(min_length=2, max_length=40)
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    username: str
    email: EmailStr
    avatar: Optional[str] = None
    createdAt: str


class TokenOut(BaseModel):
    token: str
    user: UserOut


class PlaylistIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = ""


class HistoryIn(BaseModel):
    videoId: str
    title: Optional[str] = ""
    author: Optional[str] = ""
    authorId: Optional[str] = ""
    lengthSeconds: Optional[int] = 0
    thumbnail: Optional[str] = ""
    progress: Optional[int] = 0


# ------------------ Auth dependency ------------------
async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = None
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Non authentifié")
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Token invalide")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")
    return user


def user_to_out(u: dict) -> UserOut:
    return UserOut(
        id=u["id"],
        username=u["username"],
        email=u["email"],
        avatar=u.get("avatar"),
        createdAt=u["createdAt"],
    )


# ------------------ Health ------------------
@api.get("/")
async def root():
    return {"service": "RecsouTube API", "status": "ok"}


# ------------------ Invidious ------------------
@api.get("/invidious/status")
async def invidious_status():
    svc = get_invidious_service()
    return {
        "instances": svc.get_health_snapshot(),
        "configured": svc.get_configured_instances(),
        "current": svc._public(svc._current),
    }


@api.post("/invidious/refresh")
async def invidious_refresh():
    results = await refresh_all_instances()
    svc = get_invidious_service()
    return {"results": results, "current": svc._public(svc._current)}


@api.get("/search")
async def search(
    q: str = Query(..., min_length=1),
    page: int = 1,
    type: str = "video",
):
    try:
        data = await get_invidious_service().search(q, page=page, type_=type)
        return {"results": data}
    except InvidiousUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))


@api.get("/videos/{video_id}")
async def get_video(video_id: str):
    try:
        return await get_invidious_service().video(video_id)
    except ResourceUnavailableError as e:
        raise HTTPException(status_code=424, detail=str(e))
    except InvidiousUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))


@api.get("/trending")
async def get_trending(region: str = "US"):
    try:
        data = await get_invidious_service().trending(region)
        return {"results": data}
    except InvidiousUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))


@api.get("/popular")
async def get_popular():
    try:
        data = await get_invidious_service().popular()
        return {"results": data}
    except InvidiousUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))


@api.get("/channels/{channel_id}")
async def get_channel(channel_id: str):
    try:
        return await get_invidious_service().channel(channel_id)
    except ResourceUnavailableError as e:
        raise HTTPException(status_code=424, detail=str(e))
    except InvidiousUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))


@api.get("/channels/{channel_id}/videos")
async def get_channel_videos(channel_id: str):
    try:
        data = await get_invidious_service().channel_videos(channel_id)
        return {"results": data}
    except ResourceUnavailableError as e:
        raise HTTPException(status_code=424, detail=str(e))
    except InvidiousUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))


@api.get("/comments/{video_id}")
async def get_comments(video_id: str, continuation: str = ""):
    try:
        return await get_invidious_service().comments(video_id, continuation)
    except ResourceUnavailableError as e:
        raise HTTPException(status_code=424, detail=str(e))
    except InvidiousUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))


# ------------------ Custom instance settings ------------------
class InstanceIn(BaseModel):
    url: str = Field(min_length=8, max_length=300)
    type: str = "invidious"
    authHeader: str = ""
    authValue: str = ""


def _validate_instance(payload: InstanceIn) -> tuple[str, str]:
    url = payload.url.strip().rstrip("/")
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="L'URL doit commencer par http:// ou https://")
    if payload.type not in ("invidious", "piped"):
        raise HTTPException(status_code=400, detail="Type d'instance invalide (invidious ou piped)")
    return url, payload.type


def _instance_headers(header: str, value: str) -> dict:
    header, value = header.strip(), value.strip()
    return {header: value} if header and value else {}


async def _saved_instance() -> Optional[dict]:
    return await db.settings.find_one({"key": "custom_instance"}, {"_id": 0})


def _instance_public(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return None
    return {
        "url": doc["url"],
        "type": doc["type"],
        "authHeader": doc.get("authHeader") or "",
        "hasAuth": bool(doc.get("authValue")),
        "updatedAt": doc.get("updatedAt"),
    }


@api.get("/settings/instance")
async def get_custom_instance():
    return {"instance": _instance_public(await _saved_instance())}


@api.post("/settings/instance/test")
async def test_custom_instance(payload: InstanceIn, user=Depends(get_current_user)):
    url, itype = _validate_instance(payload)
    auth_value = payload.authValue
    if payload.authHeader and not auth_value:
        saved = await _saved_instance()
        if saved and saved.get("authHeader") == payload.authHeader.strip():
            auth_value = saved.get("authValue") or ""
    headers = _instance_headers(payload.authHeader, auth_value)
    probe = await get_invidious_service().probe_instance(
        {"url": url, "type": itype, "headers": headers}
    )
    return probe


@api.put("/settings/instance")
async def save_custom_instance(payload: InstanceIn, user=Depends(get_current_user)):
    url, itype = _validate_instance(payload)
    auth_value = payload.authValue.strip()
    saved = await _saved_instance()
    if payload.authHeader and not auth_value and saved and saved.get("authHeader") == payload.authHeader.strip():
        auth_value = saved.get("authValue") or ""
    doc = {
        "key": "custom_instance",
        "url": url,
        "type": itype,
        "authHeader": payload.authHeader.strip(),
        "authValue": auth_value,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "updatedBy": user["id"],
    }
    await db.settings.update_one({"key": "custom_instance"}, {"$set": doc}, upsert=True)
    get_invidious_service().set_custom_instance(url, itype, _instance_headers(doc["authHeader"], auth_value))
    return {"ok": True, "instance": _instance_public(doc)}


@api.delete("/settings/instance")
async def delete_custom_instance(user=Depends(get_current_user)):
    await db.settings.delete_one({"key": "custom_instance"})
    get_invidious_service().clear_custom_instance()
    return {"ok": True}


# ------------------ Auth ------------------
@api.post("/auth/register", response_model=TokenOut)
async def register(payload: RegisterIn):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email déjà utilisé")
    if await db.users.find_one({"username": payload.username}):
        raise HTTPException(status_code=400, detail="Nom d'utilisateur déjà pris")
    user_doc = {
        "id": str(uuid.uuid4()),
        "username": payload.username,
        "email": email,
        "password_hash": hash_password(payload.password),
        "avatar": None,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(user_doc["id"], email)
    return TokenOut(token=token, user=user_to_out(user_doc))


@api.post("/auth/login", response_model=TokenOut)
async def login(payload: LoginIn):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Identifiants incorrects")
    token = create_access_token(user["id"], email)
    return TokenOut(token=token, user=user_to_out(user))


@api.post("/auth/logout")
async def logout(user=Depends(get_current_user)):
    return {"ok": True}


@api.get("/auth/me", response_model=UserOut)
async def me(user=Depends(get_current_user)):
    return user_to_out(user)


# ------------------ History ------------------
@api.get("/history")
async def get_history(user=Depends(get_current_user)):
    items = (
        await db.history.find({"userId": user["id"]}, {"_id": 0})
        .sort("watchedAt", -1)
        .to_list(200)
    )
    return {"results": items}


@api.post("/history")
async def add_history(payload: HistoryIn, user=Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "userId": user["id"],
        "videoId": payload.videoId,
        "title": payload.title,
        "author": payload.author,
        "authorId": payload.authorId,
        "lengthSeconds": payload.lengthSeconds or 0,
        "thumbnail": payload.thumbnail,
        "progress": payload.progress or 0,
        "watchedAt": datetime.now(timezone.utc).isoformat(),
    }
    # upsert: replace existing entry for this video
    await db.history.update_one(
        {"userId": user["id"], "videoId": payload.videoId},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True, "item": doc}


@api.delete("/history/{video_id}")
async def delete_history_item(video_id: str, user=Depends(get_current_user)):
    await db.history.delete_one({"userId": user["id"], "videoId": video_id})
    return {"ok": True}


@api.delete("/history")
async def clear_history(user=Depends(get_current_user)):
    await db.history.delete_many({"userId": user["id"]})
    return {"ok": True}


# ------------------ Playlists ------------------
@api.get("/playlists")
async def list_playlists(user=Depends(get_current_user)):
    items = await db.playlists.find({"userId": user["id"]}, {"_id": 0}).to_list(500)
    return {"results": items}


@api.post("/playlists")
async def create_playlist(payload: PlaylistIn, user=Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "userId": user["id"],
        "name": payload.name,
        "description": payload.description or "",
        "videos": [],
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.playlists.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/playlists/{playlist_id}")
async def delete_playlist(playlist_id: str, user=Depends(get_current_user)):
    await db.playlists.delete_one({"id": playlist_id, "userId": user["id"]})
    return {"ok": True}


class AddToPlaylistIn(BaseModel):
    videoId: str
    title: Optional[str] = ""
    author: Optional[str] = ""
    thumbnail: Optional[str] = ""
    lengthSeconds: Optional[int] = 0


@api.post("/playlists/{playlist_id}/videos")
async def add_video_to_playlist(
    playlist_id: str, payload: AddToPlaylistIn, user=Depends(get_current_user)
):
    playlist = await db.playlists.find_one({"id": playlist_id, "userId": user["id"]})
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist introuvable")
    video_entry = {
        "videoId": payload.videoId,
        "title": payload.title or "",
        "author": payload.author or "",
        "thumbnail": payload.thumbnail or "",
        "lengthSeconds": payload.lengthSeconds or 0,
        "addedAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.playlists.update_one(
        {"id": playlist_id},
        {"$pull": {"videos": {"videoId": payload.videoId}}},
    )
    await db.playlists.update_one(
        {"id": playlist_id}, {"$push": {"videos": video_entry}}
    )
    return {"ok": True}


@api.delete("/playlists/{playlist_id}/videos/{video_id}")
async def remove_video_from_playlist(
    playlist_id: str, video_id: str, user=Depends(get_current_user)
):
    await db.playlists.update_one(
        {"id": playlist_id, "userId": user["id"]},
        {"$pull": {"videos": {"videoId": video_id}}},
    )
    return {"ok": True}


@api.get("/playlists/{playlist_id}")
async def get_playlist(playlist_id: str, user=Depends(get_current_user)):
    p = await db.playlists.find_one({"id": playlist_id, "userId": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Playlist introuvable")
    return p


# ------------------ Subscriptions ------------------
class SubscriptionIn(BaseModel):
    channelId: str
    channelName: str = ""
    channelThumbnail: str = ""


@api.get("/subscriptions")
async def list_subscriptions(user=Depends(get_current_user)):
    items = await db.subscriptions.find({"userId": user["id"]}, {"_id": 0}).to_list(1000)
    return {"results": items}


@api.post("/subscriptions")
async def subscribe(payload: SubscriptionIn, user=Depends(get_current_user)):
    doc = {
        "userId": user["id"],
        "channelId": payload.channelId,
        "channelName": payload.channelName,
        "channelThumbnail": payload.channelThumbnail,
    }
    await db.subscriptions.update_one(
        {"userId": user["id"], "channelId": payload.channelId},
        {
            "$set": doc,
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "createdAt": datetime.now(timezone.utc).isoformat(),
            },
        },
        upsert=True,
    )
    item = await db.subscriptions.find_one(
        {"userId": user["id"], "channelId": payload.channelId}, {"_id": 0}
    )
    return {"ok": True, "item": item}


@api.delete("/subscriptions/{channel_id}")
async def unsubscribe(channel_id: str, user=Depends(get_current_user)):
    await db.subscriptions.delete_one({"userId": user["id"], "channelId": channel_id})
    return {"ok": True}


# ------------------ Likes ------------------
class LikeIn(BaseModel):
    videoId: str
    title: str = ""
    thumbnail: str = ""


@api.get("/likes")
async def list_likes(user=Depends(get_current_user)):
    items = await db.likes.find({"userId": user["id"]}, {"_id": 0}).to_list(1000)
    return {"results": items}


@api.post("/likes")
async def like_video(payload: LikeIn, user=Depends(get_current_user)):
    await db.likes.update_one(
        {"userId": user["id"], "videoId": payload.videoId},
        {
            "$set": {
                "id": str(uuid.uuid4()),
                "userId": user["id"],
                "videoId": payload.videoId,
                "title": payload.title,
                "thumbnail": payload.thumbnail,
                "createdAt": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )
    return {"ok": True}


@api.delete("/likes/{video_id}")
async def unlike_video(video_id: str, user=Depends(get_current_user)):
    await db.likes.delete_one({"userId": user["id"], "videoId": video_id})
    return {"ok": True}


# ------------------ App wiring ------------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("username", unique=True)
    await db.history.create_index([("userId", 1), ("videoId", 1)])
    await db.playlists.create_index("userId")
    await db.subscriptions.create_index([("userId", 1), ("channelId", 1)], unique=True)
    await db.likes.create_index([("userId", 1), ("videoId", 1)], unique=True)
    await db.settings.create_index("key", unique=True)
    saved = await _saved_instance()
    if saved:
        get_invidious_service().set_custom_instance(
            saved["url"], saved["type"], _instance_headers(saved.get("authHeader") or "", saved.get("authValue") or "")
        )
        logger.info("Custom instance loaded: %s", saved["url"])
    logger.info("RecsouTube backend started.")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
