export interface StoreAppData {
  categories?: Array<{ id: number; description: string }>;
  metacritic?: { score: number; url: string };
  release_date?: { coming_soon: boolean; date: string };
}

export async function getStoreAppDetails(
  appid: number
): Promise<StoreAppData | null> {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as Record<
    string,
    { success: boolean; data?: StoreAppData }
  >;
  const entry = data[String(appid)];
  if (!entry?.success || !entry.data) return null;
  return entry.data;
}
