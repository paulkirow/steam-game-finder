export interface DBGame {
  appid: number;
  name: string;
  tags: string | null;
  score_rank: string | null;
  genre: string | null;
  average_2weeks: number | null;
  steamspy_updated_at: number | null;
  categories: string | null;
  metacritic: number | null;
  release_date: string | null;
  store_updated_at: number | null;
}

export interface DBUser {
  steam_id: string;
  persona_name: string | null;
  avatar_url: string | null;
  is_private: number;
  updated_at: number;
}

// D1 caps bound variables per query at 100.
const D1_VARIABLE_LIMIT = 100;

export async function getGamesByAppids(
  db: D1Database,
  appids: number[]
): Promise<DBGame[]> {
  if (appids.length === 0) return [];
  const results: DBGame[] = [];
  for (let i = 0; i < appids.length; i += D1_VARIABLE_LIMIT) {
    const chunk = appids.slice(i, i + D1_VARIABLE_LIMIT);
    const placeholders = chunk.map(() => "?").join(",");
    const result = await db
      .prepare(`SELECT * FROM steam_games WHERE appid IN (${placeholders})`)
      .bind(...chunk)
      .all<DBGame>();
    results.push(...result.results);
  }
  return results;
}

export async function upsertGameSteamSpy(
  db: D1Database,
  appid: number,
  name: string,
  tags: string | null,
  scoreRank: string,
  genre: string | null,
  average2weeks: number | null,
  updatedAt: number
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO steam_games (appid, name, tags, score_rank, genre, average_2weeks, steamspy_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(appid) DO UPDATE SET
         name = excluded.name,
         tags = excluded.tags,
         score_rank = excluded.score_rank,
         genre = excluded.genre,
         average_2weeks = excluded.average_2weeks,
         steamspy_updated_at = excluded.steamspy_updated_at`
    )
    .bind(appid, name, tags, scoreRank, genre, average2weeks, updatedAt)
    .run();
}

export async function upsertGameStore(
  db: D1Database,
  appid: number,
  categories: string | null,
  metacritic: number | null,
  releaseDate: string | null,
  updatedAt: number
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO steam_games (appid, name, categories, metacritic, release_date, store_updated_at)
       VALUES (?, '', ?, ?, ?, ?)
       ON CONFLICT(appid) DO UPDATE SET
         categories = excluded.categories,
         metacritic = excluded.metacritic,
         release_date = excluded.release_date,
         store_updated_at = excluded.store_updated_at`
    )
    .bind(appid, categories, metacritic, releaseDate, updatedAt)
    .run();
}

export async function batchUpsertUsers(
  db: D1Database,
  users: DBUser[]
): Promise<void> {
  if (users.length === 0) return;
  // D1 batch() is capped at 100 statements per call.
  for (let i = 0; i < users.length; i += D1_VARIABLE_LIMIT) {
    const chunk = users.slice(i, i + D1_VARIABLE_LIMIT);
    const stmts = chunk.map((u) =>
      db
        .prepare(
          `INSERT INTO steam_users (steam_id, persona_name, avatar_url, is_private, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(steam_id) DO UPDATE SET
             persona_name = excluded.persona_name,
             avatar_url = excluded.avatar_url,
             is_private = excluded.is_private,
             updated_at = excluded.updated_at`
        )
        .bind(u.steam_id, u.persona_name, u.avatar_url, u.is_private, u.updated_at)
    );
    await db.batch(stmts);
  }
}

export async function getUsersByIds(
  db: D1Database,
  steamIds: string[]
): Promise<DBUser[]> {
  if (steamIds.length === 0) return [];
  const results: DBUser[] = [];
  for (let i = 0; i < steamIds.length; i += D1_VARIABLE_LIMIT) {
    const chunk = steamIds.slice(i, i + D1_VARIABLE_LIMIT);
    const placeholders = chunk.map(() => "?").join(",");
    const result = await db
      .prepare(`SELECT * FROM steam_users WHERE steam_id IN (${placeholders})`)
      .bind(...chunk)
      .all<DBUser>();
    results.push(...result.results);
  }
  return results;
}

export async function getCacheEntry(
  db: D1Database,
  key: string
): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare("SELECT response FROM api_cache WHERE key = ? AND expires_at > ?")
    .bind(key, now)
    .first<{ response: string }>();
  return row?.response ?? null;
}

export async function setCacheEntry(
  db: D1Database,
  key: string,
  response: string,
  ttlSeconds: number
): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  await db
    .prepare(
      `INSERT INTO api_cache (key, response, expires_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         response = excluded.response,
         expires_at = excluded.expires_at`
    )
    .bind(key, response, expiresAt)
    .run();
}
