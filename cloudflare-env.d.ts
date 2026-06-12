declare global {
  interface CloudflareEnv {
    DB: D1Database;
    STEAM_CACHE: KVNamespace;
    STEAM_API_KEY: string;
  }
}
export {};
