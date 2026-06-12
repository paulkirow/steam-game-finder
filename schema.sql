CREATE TABLE IF NOT EXISTS steam_games (
  appid              INTEGER PRIMARY KEY,
  name               TEXT NOT NULL,
  tags               TEXT,
  score_rank         TEXT,
  genre              TEXT,
  average_2weeks     INTEGER,
  steamspy_updated_at INTEGER,
  categories         TEXT,
  metacritic         INTEGER,
  release_date       TEXT,
  store_updated_at   INTEGER
);

CREATE TABLE IF NOT EXISTS steam_users (
  steam_id     TEXT PRIMARY KEY,
  persona_name TEXT,
  avatar_url   TEXT,
  is_private   INTEGER DEFAULT 0,
  updated_at   INTEGER
);

CREATE TABLE IF NOT EXISTS api_cache (
  key        TEXT PRIMARY KEY,
  response   TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT UNIQUE NOT NULL,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS saved_group_members (
  group_id INTEGER REFERENCES saved_groups(id),
  steam_id TEXT NOT NULL,
  PRIMARY KEY (group_id, steam_id)
);
