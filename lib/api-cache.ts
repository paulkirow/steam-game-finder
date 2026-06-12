import {
  resolveVanityUrl,
  getPlayerSummaries,
  getOwnedGames,
  getFriendList,
  type OwnedGame,
  type PlayerSummary,
} from "./steam";
import { getStoreAppDetails } from "./steam-store";
import { getSteamSpyAppDetails } from "./steamspy";
import {
  getGamesByAppids,
  upsertGameSteamSpy,
  upsertGameStore,
  batchUpsertUsers,
  batchUpsertGameNames,
  getUsersByIds,
  getCacheEntry,
  setCacheEntry,
  type DBGame,
} from "./db";
import type { SteamUser } from "./types";

const getApiKey = () => process.env.STEAM_API_KEY ?? "";

const TTL_LIBRARY = 24 * 60 * 60;
const TTL_FRIENDS = 60 * 60;
const TTL_CALL_COUNTER = 25 * 60 * 60;
const TTL_VANITY = 7 * 24 * 60 * 60;
const MAX_DAILY_CALLS = 100_000;
const GAME_STALE_SECONDS = 7 * 24 * 60 * 60;
const USER_STALE_SECONDS = 24 * 60 * 60;
// Max new-game enrichments per /api/libraries call to stay within subrequest budget.
const MAX_ENRICHMENT_PER_REQUEST = 8;

export async function checkDailyLimit(
  kv: KVNamespace,
  calls = 1
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  const key = `steam:api:calls:${today}`;
  const current = await kv.get(key, "text");
  const count = current ? parseInt(current, 10) : 0;
  if (count + calls > MAX_DAILY_CALLS) {
    throw new Error(
      "Daily Steam API call limit reached. Please try again tomorrow."
    );
  }
  await kv.put(key, String(count + calls), {
    expirationTtl: TTL_CALL_COUNTER,
  });
}

export function isSteamId64(s: string): boolean {
  return /^\d{17}$/.test(s.trim());
}

export function extractIdentifier(raw: string): string {
  const trimmed = raw.trim();
  const profilesMatch = trimmed.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  if (profilesMatch) return profilesMatch[1];
  const idMatch = trimmed.match(/steamcommunity\.com\/id\/([^/?#]+)/);
  if (idMatch) return idMatch[1];
  return trimmed;
}

export async function resolveToSteamId64(
  raw: string,
  kv: KVNamespace,
  db: D1Database
): Promise<{ steamId: string | null; error: string | null }> {
  const identifier = extractIdentifier(raw);
  if (isSteamId64(identifier)) {
    return { steamId: identifier, error: null };
  }
  const cacheKey = `vanity:${identifier}`;
  const cached = await getCacheEntry(db, cacheKey);
  if (cached) {
    return { steamId: cached, error: null };
  }
  try {
    await checkDailyLimit(kv, 1);
    const steamId = await resolveVanityUrl(identifier, getApiKey());
    if (!steamId) {
      return { steamId: null, error: `Could not resolve: ${raw}` };
    }
    await setCacheEntry(db, cacheKey, steamId, TTL_VANITY);
    return { steamId, error: null };
  } catch (e) {
    return { steamId: null, error: String(e) };
  }
}

export async function fetchAndCacheProfiles(
  steamIds: string[],
  kv: KVNamespace,
  db: D1Database
): Promise<SteamUser[]> {
  if (steamIds.length === 0) return [];

  const now = Math.floor(Date.now() / 1000);

  // Serve fresh users from D1, only hit Steam API for stale/missing ones.
  const existing = await getUsersByIds(db, steamIds);
  const existingMap = new Map(existing.map((u) => [u.steam_id, u]));

  const fromCache: SteamUser[] = [];
  const needsFetch: string[] = [];

  for (const steamId of steamIds) {
    const row = existingMap.get(steamId);
    if (row && now - row.updated_at <= USER_STALE_SECONDS) {
      fromCache.push({
        steamId: row.steam_id,
        personaName: row.persona_name ?? "",
        avatarUrl: row.avatar_url ?? "",
        isPrivate: row.is_private === 1,
      });
    } else {
      needsFetch.push(steamId);
    }
  }

  const fetched: SteamUser[] = [];
  if (needsFetch.length > 0) {
    await checkDailyLimit(kv, Math.ceil(needsFetch.length / 100));
    const summaries = await getPlayerSummaries(needsFetch, getApiKey());
    for (const s of summaries) {
      fetched.push({
        steamId: s.steamid,
        personaName: s.personaname,
        avatarUrl: s.avatarfull,
        isPrivate: s.communityvisibilitystate !== 3,
      });
    }
    await batchUpsertUsers(
      db,
      fetched.map((u) => ({
        steam_id: u.steamId,
        persona_name: u.personaName,
        avatar_url: u.avatarUrl,
        is_private: u.isPrivate ? 1 : 0,
        updated_at: now,
      }))
    );
  }

  const allUsers = [...fromCache, ...fetched];

  // Write private flag to KV so /api/libraries can skip GetOwnedGames without D1 lookup.
  await Promise.all(
    allUsers.map((u) =>
      kv.put(
        `steam:profile:${u.steamId}`,
        JSON.stringify({ isPrivate: u.isPrivate }),
        { expirationTtl: TTL_LIBRARY }
      )
    )
  );

  return allUsers;
}

export async function getCachedLibrary(
  steamId: string,
  kv: KVNamespace,
  db: D1Database
): Promise<OwnedGame[]> {
  const kvKey = `steam:library:${steamId}`;
  const dbKey = `library:${steamId}`;

  const kvCached = await kv.get(kvKey, "text");
  if (kvCached) {
    return JSON.parse(kvCached) as OwnedGame[];
  }

  const d1Cached = await getCacheEntry(db, dbKey);
  if (d1Cached) {
    await kv.put(kvKey, d1Cached, { expirationTtl: TTL_LIBRARY });
    return JSON.parse(d1Cached) as OwnedGame[];
  }

  await checkDailyLimit(kv, 1);
  const games = await getOwnedGames(steamId, getApiKey());
  const json = JSON.stringify(games);

  await Promise.all([
    kv.put(kvKey, json, { expirationTtl: TTL_LIBRARY }),
    setCacheEntry(db, dbKey, json, TTL_LIBRARY),
    batchUpsertGameNames(db, games),
  ]);

  return games;
}

export async function getCachedFriendIds(
  steamId: string,
  kv: KVNamespace
): Promise<string[]> {
  const cached = await kv.get(`steam:friends:${steamId}`, "text");
  if (cached) {
    return JSON.parse(cached) as string[];
  }
  await checkDailyLimit(kv, 1);
  const ids = await getFriendList(steamId, getApiKey());
  if (ids.length > 0) {
    await kv.put(`steam:friends:${steamId}`, JSON.stringify(ids), {
      expirationTtl: TTL_FRIENDS,
    });
  }
  return ids;
}

function isStale(updatedAt: number | null): boolean {
  if (!updatedAt) return true;
  return Math.floor(Date.now() / 1000) - updatedAt > GAME_STALE_SECONDS;
}

export async function enrichGames(
  appids: number[],
  db: D1Database,
  limit = MAX_ENRICHMENT_PER_REQUEST
): Promise<Map<number, DBGame>> {
  if (appids.length === 0) return new Map();

  const existing = await getGamesByAppids(db, appids);
  const gameMap = new Map<number, DBGame>(existing.map((g) => [g.appid, g]));

  const needsEnrichment: Array<{
    appid: number;
    needsSpy: boolean;
    needsStore: boolean;
  }> = [];

  for (const appid of appids) {
    const g = gameMap.get(appid);
    const needsSpy = !g || isStale(g.steamspy_updated_at);
    const needsStore = !g || isStale(g.store_updated_at);
    if (needsSpy || needsStore) {
      needsEnrichment.push({ appid, needsSpy, needsStore });
    }
  }

  // Process most-important first (appids are already sorted by ownerCount desc by caller).
  const toEnrich = needsEnrichment.slice(0, limit);

  for (const { appid, needsSpy, needsStore } of toEnrich) {
    const now = Math.floor(Date.now() / 1000);

    const [spy, store] = await Promise.all([
      needsSpy ? getSteamSpyAppDetails(appid) : Promise.resolve(null),
      needsStore ? getStoreAppDetails(appid) : Promise.resolve(null),
    ]);

    if (spy) {
      await upsertGameSteamSpy(
        db,
        appid,
        spy.name,
        JSON.stringify(spy.tags),
        spy.score_rank,
        spy.genre || null,
        spy.average_2weeks ?? null,
        now
      );
    }

    if (store) {
      await upsertGameStore(
        db,
        appid,
        store.categories ? JSON.stringify(store.categories) : null,
        store.metacritic?.score ?? null,
        store.release_date?.date ?? null,
        now
      );
    }

    const updated: DBGame = {
      ...(gameMap.get(appid) ?? {
        appid,
        name: "",
        tags: null,
        score_rank: null,
        genre: null,
        average_2weeks: null,
        steamspy_updated_at: null,
        categories: null,
        metacritic: null,
        release_date: null,
        store_updated_at: null,
      }),
      ...(spy
        ? {
            name: spy.name,
            tags: JSON.stringify(spy.tags),
            score_rank: spy.score_rank,
            genre: spy.genre || null,
            average_2weeks: spy.average_2weeks ?? null,
            steamspy_updated_at: now,
          }
        : {}),
      ...(store
        ? {
            categories: store.categories
              ? JSON.stringify(store.categories)
              : null,
            metacritic: store.metacritic?.score ?? null,
            release_date: store.release_date?.date ?? null,
            store_updated_at: now,
          }
        : {}),
    };
    gameMap.set(appid, updated);
  }

  return gameMap;
}
