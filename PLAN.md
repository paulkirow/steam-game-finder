# Steam Game Finder — Plan

Given N Steam users, find the intersection and frequency distribution of their owned games — so a friend group can see what they can play together.

## MVP

**Maximum 25 users per comparison.** Enforced on the API route and in the UI.

### Input (home page)

1. User enters their own Steam ID / URL and clicks "Load Friends"
2. Friends load as a checkbox list (avatar + persona name; private profiles flagged)
3. An "Add more players" field below accepts additional IDs for people not on their friends list
4. User selects up to 25 people total (their own ID pre-checked) and clicks "Compare"

Fallback: if the user skips loading friends and just wants to paste IDs manually, a plain textarea is available as an alternative entry path.

### Output (results page — `/results?ids=id1,id2,...`)

| Game               | Owners | %   |
|--------------------|--------|-----|
| Terraria           | 8      | 80% |
| Valheim            | 7      | 70% |
| Deep Rock Galactic | 6      | 60% |

Tabs: Everyone owns it / At least 50% / Owned by exactly one person

Selected IDs are encoded in the URL so results pages are bookmarkable and shareable without needing a saved group link.

---

## Data Flow

The comparison is split into two sequential client-side API calls to stay within Cloudflare's 50 subrequests-per-invocation limit. See "Cloudflare Free Tier Constraints" for the reasoning.

### Call 1 — `POST /api/resolve`

1. Convert any profile URLs and vanity URLs to SteamID64 via `ISteamUser/ResolveVanityURL`. Raw SteamID64s pass through as-is.
2. Batch-call `ISteamUser/GetPlayerSummaries` for all resolved IDs — returns `communityvisibilitystate` (3 = public, else private), persona name, and avatar. Do this **before** `GetOwnedGames` — `GetOwnedGames` silently returns 0 games for private profiles with no error, making private indistinguishable from "owns nothing" without checking first.
3. Return resolved IDs + visibility + display names to the client.

### Call 2 — `POST /api/libraries`

4. For each public profile, check KV (`steam:library:{steamid}`) first. On a hit, return cached data. On a miss, call `IPlayerService/GetOwnedGames` and write to KV (24hr TTL).
5. Build a frequency map: `appid → owner count` across all fetched libraries.
6. Batch-query `steam_games` D1 table for all appids in the map (`WHERE appid IN (...)`). For any misses, fire a SteamSpy `appdetails` call and a Steam Store `appdetails` call **concurrently** — independent quotas. Write results to D1.
7. Return enriched, sorted game list to the client. Mark private profiles in the response so the UI can display them.

---

## Steam API

Canonical call format: `https://api.steampowered.com/{interface}/{method}/v{version}/?key={key}&{params}`

Response format defaults to JSON. All requests require `?key=STEAM_API_KEY`. All calls are server-side only — never expose the key to the client. This app reads public profile data only — no Steam login or OpenID required.

### User / library endpoints

| Endpoint | Purpose |
|----------|---------|
| `ISteamUser/ResolveVanityURL/v1/?vanityurl={url}` | Vanity URL → SteamID64 |
| `ISteamUser/GetPlayerSummaries/v2/?steamids={ids}` | Visibility state + persona name + avatar (batch, 100 IDs max) |
| `IPlayerService/GetOwnedGames/v1/?steamid={id}&include_appinfo=1` | Get a user's library (public profiles only) |
| `ISteamUser/GetFriendList/v1/?steamid={id}&relationship=friend` | Get friend SteamID64 list (requires public friend list) |

`GetPlayerSummaries` `communityvisibilitystate` values: `1` = private, `3` = public.

### Game enrichment — Steam Store API

Base URL: `https://store.steampowered.com/api/`

Rate limit: ~200 requests per 5 minutes (unofficial — stay well under it).

| Endpoint | Purpose |
|----------|---------|
| `appdetails?appids={id}` | Rich per-game metadata (one appid at a time) |

Key fields from `appdetails`:

| Field | Use |
|-------|-----|
| `categories` | Structured array of official Steam categories — use these for co-op/multiplayer filtering (more reliable than SteamSpy tags) |
| `metacritic.score` | Metacritic score — supplement or fallback to `score_rank` |
| `release_date.date` | Release date |

**Useful category IDs for filtering:**

| ID | Label |
|----|-------|
| 1 | Multi-player |
| 9 | Co-op |
| 27 | Cross-Platform Multiplayer |
| 38 | Online Co-op |
| 39 | Local Co-op |

## SteamSpy API

Base URL: `https://steamspy.com/api.php`

Rate limit: **1 request/second** (enforced via a queue in `lib/steamspy.ts`). The `all` endpoint is limited to 1 request/60 seconds — do not use it in the enrichment path.

| Request | Purpose |
|---------|---------|
| `?request=appdetails&appid={id}` | Full metadata for one game |

Key fields:

| Field | Type | Use |
|-------|------|-----|
| `name` | string | Game name |
| `score_rank` | string | Review score rank (empty string if unranked — treat as 0 in ranking) |
| `tags` | object | Tag name → vote count e.g. `{"Co-op": 5821}` — sort by votes, filter out low-vote tags |
| `genre` | string | Comma-separated genre list |
| `average_2weeks` | number | Avg playtime last 2 weeks in minutes — fallback signal when `score_rank` is empty |

---

## Database Schema (D1)

```sql
-- Game metadata — sourced from SteamSpy + Steam Store API, grows permanently
-- header_image is never stored: constructed as cdn.akamai.steamstatic.com/steam/apps/{appid}/header.jpg
CREATE TABLE steam_games (
  appid              INTEGER PRIMARY KEY,
  name               TEXT NOT NULL,
  -- from SteamSpy
  tags               TEXT,    -- JSON object: tag → vote count
  score_rank         TEXT,    -- empty string if unranked
  genre              TEXT,    -- comma-separated
  average_2weeks     INTEGER, -- avg playtime last 2 weeks, minutes
  steamspy_updated_at INTEGER,
  -- from Steam Store API
  categories         TEXT,    -- JSON array of {id, description}
  metacritic         INTEGER, -- null if none
  release_date       TEXT,
  store_updated_at   INTEGER
);

-- Resolved user profile cache
CREATE TABLE steam_users (
  steam_id     TEXT PRIMARY KEY,
  persona_name TEXT,
  avatar_url   TEXT,
  is_private   INTEGER DEFAULT 0,
  updated_at   INTEGER
);

-- Catch-all API response cache (for calls without a dedicated table)
CREATE TABLE api_cache (
  key        TEXT PRIMARY KEY,  -- e.g. "steam:ResolveVanityURL:paul"
  response   TEXT NOT NULL,     -- raw JSON response
  expires_at INTEGER NOT NULL   -- Unix timestamp
);

-- Shareable group links
CREATE TABLE saved_groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT UNIQUE NOT NULL,
  created_at INTEGER
);

CREATE TABLE saved_group_members (
  group_id INTEGER REFERENCES saved_groups(id),
  steam_id TEXT NOT NULL,
  PRIMARY KEY (group_id, steam_id)
);
```

---

## Cloudflare Free Tier Constraints

Three limits directly affect architecture. Know them before writing API route code.

### 1. Subrequests: 50 per Worker invocation — most critical

Every `fetch()`, KV read/write, and D1 query counts toward a limit of 50 per request. A fully cold 25-user comparison would consume:

| Operation | Count |
|-----------|-------|
| `ResolveVanityURL` (worst case, all vanity URLs) | up to 25 |
| `GetPlayerSummaries` (batched) | 1 |
| `GetOwnedGames` × 25 | 25 |
| KV reads (profile cache checks) | 25 |
| **Total** | **76** — exceeds limit |

**Solution: client-side orchestration.** The results page makes two sequential API calls rather than one:

1. `POST /api/resolve` — takes raw IDs/URLs, returns resolved SteamID64s + visibility. Cost: up to 26 subrequests (resolves + one summaries batch).
2. `POST /api/libraries` — takes SteamID64s, returns cached or freshly-fetched libraries. Cost: up to 25 GetOwnedGames + KV reads, but KV hits don't make external calls so warm cache is cheap.

Each call gets its own 50-subrequest budget. Split there and the limit is never hit in practice.

### 2. KV writes: 1,000 per day

Each unique user's library, profile, or friend list written to KV for the first time costs a write. A cold 25-person comparison costs ~52 writes. That allows only ~19 fully cold comparisons per day before the limit is hit.

The organic cache growth strategy mitigates this — returning users cost 0 writes. But on day one it's the tightest limit. If the app sees real traffic, this is the first thing to upgrade ($5/month Workers Paid removes it as a concern).

### 3. Workers requests: 100,000 per day

Each page load and API call counts. Fine for a personal/small-group tool. Worth knowing if it ever gets shared widely.

### Free tier summary

| Limit | Free | This app's exposure |
|-------|------|---------------------|
| Subrequests per invocation | 50 | Fixed by two-call architecture above |
| KV writes | 1,000/day | Mitigated by cache growth; upgrade if traffic grows |
| Workers requests | 100,000/day | Fine for personal use |
| D1 storage | 500 MB/db | Fine — all Steam game data ≈ 100–200 MB |
| D1 queries per invocation | 50 | Fine if enrichment uses `WHERE appid IN (...)` batch queries |
| CPU time | 10ms/request | Fine — computation is minimal, I/O is not counted |

## Storage Philosophy

The `steam_games` table is a **permanent, growing knowledge base** — not a temporary cache. Every game enriched by any user is stored forever and shared across all future lookups. The first person to look up Terraria pays the API cost; everyone after gets it from D1 instantly.

Over time the database warms organically: popular games get cached first because more groups share them. Cold-cache latency is a first-run problem that solves itself.

**Rules:**
- Never delete rows from `steam_games`. Only update stale ones.
- A game is stale when both `steamspy_updated_at` and `store_updated_at` are older than 7 days.
- Refresh stale games lazily on lookup (update in background, return existing data immediately) rather than blocking the response.
- Each source has its own `_updated_at` timestamp — a game can have fresh SteamSpy data and stale Store data independently.

## API Caching Layer

**Be a good API citizen.** Steam allows 100,000 calls/day. SteamSpy allows 1 call/second. Every redundant call wastes quota and slows the app — never make a call if we already have a valid cached answer.

All external API calls go through `lib/api-cache.ts`. This module checks the appropriate store before every call and writes the result on a miss. Nothing in the codebase calls Steam or SteamSpy directly — always via the cache layer.

### Two-tier storage

**KV** — user-specific, short-lived, high-frequency reads:

| Key | TTL | Contents |
|-----|-----|----------|
| `steam:library:{steamid}` | 24 hours | `GetOwnedGames` response |
| `steam:profile:{steamid}` | 24 hours | `GetPlayerSummaries` entry |
| `steam:friends:{steamid}` | 1 hour | `GetFriendList` response |
| `steam:api:calls:{YYYY-MM-DD}` | 25 hours | Daily call counter |

**D1** — shared across all users, longer-lived, structured:

- `steam_games` — SteamSpy `appdetails` responses (weekly refresh). Shared because every user looking up Terraria gets the same data.
- `steam_users` — resolved profiles from `GetPlayerSummaries` (24hr, refreshed on lookup).
- `api_cache` — catch-all for any API response that doesn't have a dedicated table (see schema below).

### Cache-first rule

```
check cache → hit: return cached value
            → miss: call API → write to cache → return value
```

TTL is per-source: Steam user/library responses expire in 24 hours, SteamSpy and Steam Store game metadata expires in 7 days (tracked per-row in D1 via `_updated_at` columns, not KV TTL). If a cache entry exists and is not expired, **never** call the upstream API regardless of whether the data "feels" stale.

For game enrichment misses, call SteamSpy and Steam Store **concurrently** — they have independent rate limits and quotas.

---

## Planned Features

### Co-op / Multiplayer Tag Filtering

Tags come from SteamSpy's `tags` field (already stored in `steam_games`). Let users filter the results table to only show games matching selected tags — Co-op, Multiplayer, PvP, Free to Play, etc. This is the most useful feature — it directly answers "what can we actually play together tonight?"

Show only tags with meaningful vote counts to avoid surfacing obscure or disputed tags.

### "What Can We Play Tonight?" Ranking

Rank by `owners × score_rank` instead of raw owner count. `score_rank` comes from SteamSpy and is already stored in `steam_games`. Higher score + more owners = ranked first.

| Game               | Owners | Score | Rank |
|--------------------|--------|-------|------|
| Deep Rock Galactic | 7      | 97    | 679  |
| Terraria           | 8      | 96    | 768  |

### Shareable Group Links

Generate a short URL (`/group/abc123`) that saves the group's Steam IDs in D1. Useful when the ID list is too long to fit cleanly in a URL, or for recurring groups (e.g. a standing work gaming night).

---

## Steam API Terms of Service Compliance

These are the actionable requirements extracted from the [Steam Web API Terms of Use](https://steamcommunity.com/dev/apiterms). Not legal advice — read the full terms yourself.

### Must build / ship

| Requirement | What to implement |
|-------------|-------------------|
| **Privacy policy** | A `/privacy` page disclosing: what Steam data is fetched, that it is stored in Cloudflare D1/KV in the US, and that it is only retrieved at the user's explicit request |
| **User-initiated only** | Only call `GetOwnedGames` when a user actively submits IDs — no background prefetching or speculative lookups |
| **Inform users of stored data** | Show a notice (in the UI or privacy policy) that game libraries are cached for up to 24 hours and profile info is stored to power shareable links |
| **"As is" disclaimer** | Footer or results page disclaimer: game data is sourced from Steam and provided as-is; this app is not affiliated with or endorsed by Valve |
| **Valve branding** | Every page that displays Steam data must include a visible link back to Valve (e.g. "Powered by the Steam Web API" linking to `https://store.steampowered.com`). Do not add `rel="nofollow"` to this link |
| **Rate limiting** | Hard cap at 100,000 Steam API calls/day. Track daily call count in KV (`steam:api:calls:{YYYY-MM-DD}`) and return a 429 with a clear error message if the cap is hit |

### Must not do (enforce in code/review)

- Never send `STEAM_API_KEY` to the client — server-side route handlers only (already in CLAUDE.md)
- Never intercept or store Steam passwords — this app uses only public API endpoints, no Steam login
- Never present Steam data as if this app is affiliated with or endorsed by Valve
- Never use the API for unsolicited marketing (e.g. emailing users game suggestions)
- Never share or expose the API key to third parties

### Stored data disclosure (for privacy policy)

| Data | Where stored | TTL |
|------|-------------|-----|
| Game library (appids + names) | Cloudflare KV | 24 hours |
| User profile (persona name, avatar, visibility) | Cloudflare KV | 24 hours |
| Friend list (SteamID64s only) | Cloudflare KV | 1 hour |
| Resolved SteamID64 + persona name + avatar | Cloudflare D1 (`steam_users`) | Until manually purged |
| Game metadata (name, image, tags, score) | Cloudflare D1 (`steam_games`) | Refreshed weekly |
| Saved group members (SteamID64 only) | Cloudflare D1 (`saved_group_members`) | Until manually purged |

Cloudflare infrastructure is US-based. State this in the privacy policy.
