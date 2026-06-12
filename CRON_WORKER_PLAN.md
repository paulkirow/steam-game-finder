# Cron Enrichment Worker — Plan

## Why

Per-request enrichment is capped at ~28 games per visit (8 in response + 20 via `waitUntil`), bound by response latency and the SteamSpy 1 req/sec rate limit. A cron Worker runs independently of user traffic, takes its full 30s wall-clock budget per invocation, and continuously fills in SteamSpy + Store data for games that are in `steam_games` but still unenriched — without affecting user-facing latency.

---

## New Files

```
cron-worker/
  index.ts              # Worker entry point — scheduled() handler + enrichment logic
wrangler.worker.jsonc   # Wrangler config for the Worker (separate from Pages config)
```

---

## `wrangler.worker.jsonc`

```jsonc
{
  "name": "steam-game-finder-cron",
  "main": "cron-worker/index.ts",
  "compatibility_date": "2025-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "triggers": {
    "crons": ["*/5 * * * *"]   // every 5 minutes
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "steam-game-finder",
      "database_id": "daa69389-ca1c-4676-9713-9928be47d6ce"
    }
  ],
  "kv_namespaces": [
    {
      "binding": "STEAM_CACHE",
      "id": "868c71c64b664772867785b410d861cd"
    }
  ]
}
```

`STEAM_API_KEY` is set as an encrypted secret via `wrangler secret put STEAM_API_KEY --config wrangler.worker.jsonc`.

---

## Worker Logic (`cron-worker/index.ts`)

```typescript
export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runBatch(env));
  },
};
```

### `runBatch(env)`

1. **Query D1** for the next batch of games needing enrichment:

   ```sql
   SELECT appid,
          steamspy_updated_at IS NULL OR steamspy_updated_at < (unixepoch() - 604800) AS needs_spy,
          store_updated_at    IS NULL OR store_updated_at    < (unixepoch() - 604800) AS needs_store
   FROM   steam_games
   WHERE  steamspy_updated_at IS NULL
       OR store_updated_at    IS NULL
       OR steamspy_updated_at < (unixepoch() - 604800)
       OR store_updated_at    < (unixepoch() - 604800)
   ORDER  BY rowid ASC
   LIMIT  25
   ```

   `ORDER BY rowid ASC` processes games in insertion order. Since `batchUpsertGameNames` inserts games from the most-visited group sessions first, the most popular games are enriched before obscure ones.

2. **Enrich each game** — same pattern as `enrichGames` in `lib/api-cache.ts`:
   - Call SteamSpy + Store API concurrently per game.
   - Enforce the module-level 1 req/sec SteamSpy rate limit.
   - Write results via `upsertGameSteamSpy` / `upsertGameStore` from `lib/db.ts`.

3. **Shared code** — import directly from `lib/db.ts`, `lib/steamspy.ts`, and `lib/steam-store.ts`. Do **not** import from `lib/api-cache.ts` (it pulls in Steam user/library logic not needed here).

---

## Throughput

| Constraint | Value |
|------------|-------|
| SteamSpy rate limit | 1 req/sec → max 25 games / 30s invocation |
| Subrequest budget (free plan) | 50 subrequests → 25 games × 2 calls each |
| Cron interval | every 5 min → 12 invocations/hour |
| **Net throughput** | **~300 games/hour** |

On the paid Workers plan the subrequest budget rises to 1000, but SteamSpy's 1 req/sec is still the ceiling at 25 games per 30s invocation.

---

## `package.json` Scripts to Add

```json
"worker:dev":    "wrangler dev --config wrangler.worker.jsonc --test-scheduled",
"worker:deploy": "wrangler deploy --config wrangler.worker.jsonc"
```

`--test-scheduled` exposes a `/__scheduled` endpoint locally so you can trigger a run with `curl "http://localhost:8787/__scheduled?cron=*%2F5+*+*+*+*"`.

---

## Deployment Steps

1. Create the file at `cron-worker/index.ts`.
2. Create `wrangler.worker.jsonc` with the config above.
3. Set the secret: `npx wrangler secret put STEAM_API_KEY --config wrangler.worker.jsonc`
4. Deploy: `npm run worker:deploy`
5. Verify in the Cloudflare dashboard → Workers & Pages → `steam-game-finder-cron` → Triggers → Cron.

---

## Open Questions

- **Stale threshold**: currently 7 days (604800s), same as `GAME_STALE_SECONDS` in `api-cache.ts`. Should be kept in sync — consider extracting to a shared constant.
- **Priority ordering**: `ORDER BY rowid ASC` is a proxy for popularity. If we later add an explicit `owner_count` column to `steam_games`, switch to `ORDER BY owner_count DESC`.
- **Rate limiting across invocations**: the module-level `lastCallAt` in `steamspy.ts` resets per Worker isolate. Invocations that overlap (rare at 5-min intervals) could briefly exceed 1 req/sec — acceptable given SteamSpy's informal limit.
