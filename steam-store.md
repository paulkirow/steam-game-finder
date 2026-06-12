This is the Steam Store API — a separate, unofficial (but stable) API served from store.steampowered.com. No API key required.

## Base URL

https://store.steampowered.com/api/

## Rate limit

Approximately 200 requests per 5 minutes. No official documentation — stay well under the limit. Never call in a tight parallel loop.

## Endpoints

### appdetails

Returns rich metadata for a single app.

```
GET https://store.steampowered.com/api/appdetails?appids={appid}
```

One appid at a time. The response is wrapped in an object keyed by appid:

```json
{
  "730": {
    "success": true,
    "data": { ... }
  }
}
```

Check `success` before reading `data` — some appids return `{"success": false}`.

### Key fields in `data`

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Game name |
| `categories` | array | Array of `{id, description}` — use for co-op/multiplayer filtering |
| `metacritic` | object | `{score, url}` — null if no Metacritic entry |
| `release_date` | object | `{coming_soon, date}` |
| `header_image` | string | CDN URL — do not store, construct as `cdn.akamai.steamstatic.com/steam/apps/{appid}/header.jpg` instead |

### Category IDs relevant to this app

| ID | Description |
|----|-------------|
| 1  | Multi-player |
| 9  | Co-op |
| 27 | Cross-Platform Multiplayer |
| 38 | Online Co-op |
| 39 | Local Co-op |
| 24 | Shared/Split Screen |

## Usage in this app

Used exclusively for game enrichment — fetching per-game metadata on a D1 cache miss. Always called concurrently with a SteamSpy `appdetails` call since they have independent rate limits. Results are written to the `steam_games` D1 table (`store_updated_at` column tracks freshness).
