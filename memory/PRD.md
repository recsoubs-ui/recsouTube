# RecsouTube — Product Requirements Document (living)

## Problem statement (résumé)
Full-stack video platform "RecsouTube" utilisant Invidious (avec fallback Piped) pour la recherche et la lecture vidéo. Interface propre, moderne, responsive, non copiée de YouTube.

## Architecture
- Backend: FastAPI + MongoDB
- Frontend: React (JS) + Tailwind + shadcn/ui + framer-motion + sonner
- Providers vidéo: Invidious (primary) + Piped (fallback) via un service unifié `InvidiousService`
- Auth: JWT custom (bcrypt) — token en localStorage

## Implémenté (2026-02)
- InvidiousService avec probe automatique, fallback multi-instances, cache in-memory
- Endpoints backend: /api/search, /api/videos/:id, /api/trending, /api/popular, /api/channels/:id, /api/comments/:id
- Endpoints Invidious status/refresh
- Auth complète: register, login, me, logout
- Historique, playlists, abonnements, likes (Mongo)
- Frontend: Home (trending), Search, Watch (custom player + embed fallback), Trending, Channel, History, Playlists, Subscriptions, Settings (theme + instances health), Login/Register, 404
- Custom video player HTML5 + iframe fallback Invidious embed
- Thème sombre/clair, sidebar responsive, glass header

## Implémenté (2026-09-12) — correctifs lecture/recherche
- Piped: flux LBRY/odycdn (itag -1, 401) exclus; formatStreams triés par qualité; videoId injecté (Piped /streams ne le renvoie pas)
- Service: erreur ressource (YouTube anti-bot "SignInConfirmNotBot") ≠ erreur instance → l'instance n'est plus marquée morte; essai sur toutes les instances; HTTP 424 + message FR (502 est réécrit en HTML par l'ingress)
- Instance ajoutée: pipedapi.ducks.party (seules private.coffee + ducks.party répondent en 09/2026)
- Normalisation: description sans HTML, date JJ/MM/AAAA, subCountText compact, badge LIVE corrigé (duration -1 + pas de date)
- VideoPlayer: liste de candidats (progressive mp4/webm puis HLS via hls.js), bascule auto sur erreur, gros bouton play, data-stream-kind/label; embed Invidious seulement sur clic
- Watch: message d'erreur backend affiché + bouton Réessayer; historique auto + préchargement liked/abonné
- POST /history et /subscriptions renvoient {ok, item}; subscriptions $setOnInsert (id stable)
- Lecture réelle vérifiée avec Google Chrome (/app/tests/play_check.py). NB: le Chromium headless du screenshot tool n'a pas H.264.

## BLOQUEUR EXTERNE (09/2026)
- YouTube bloque l'extraction de flux sur les instances Piped publiques pour la quasi-totalité des vidéos (0/12 résultats de recherche lisibles, dQw4w9WgXcQ OK). Invidious publiques: API derrière anti-bot (Anubis) → 403/HTML.
- yt-dlp depuis le pod: URLs obtenues mais téléchargement 403 (PO token) → non viable.
- Pistes: auto-héberger Piped/Invidious (INVIDIOUS_BASE_URL/PIPED_FALLBACK_URLS via .env), ajouter des instances quand elles reviennent.

## Backlog (P1)
- Playlist add-to-playlist depuis la page Watch
- Filtres de recherche (durée, date, tri) et pagination
- Comments section sur Watch
- Persistance abonné/liké côté UI depuis /likes /subscriptions

## Backlog (P2)
- Progression de lecture reprise
- PWA / installation
- Traduction i18n (site principalement en français)

## Instances configurées (2026-02)
- Piped: api.piped.private.coffee (OK)
- Invidious: nadeko, nerdvpn, tiekoetter, yewtu, f5 (KO — API désactivée)
