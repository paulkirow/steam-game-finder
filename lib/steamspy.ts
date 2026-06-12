export interface SteamSpyAppData {
  appid: number;
  name: string;
  score_rank: string;
  tags: Record<string, number>;
  genre: string;
  average_2weeks: number;
}

// Module-level rate limiter: 1 req/sec within a single Worker isolate.
let lastCallAt = 0;

export async function getSteamSpyAppDetails(
  appid: number
): Promise<SteamSpyAppData | null> {
  const now = Date.now();
  const elapsed = now - lastCallAt;
  if (lastCallAt > 0 && elapsed < 1000) {
    await new Promise<void>((r) => setTimeout(r, 1000 - elapsed));
  }
  lastCallAt = Date.now();

  const url = `https://steamspy.com/api.php?request=appdetails&appid=${appid}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as SteamSpyAppData;
  if (!data?.name) return null;
  return data;
}
