const STEAM_API_BASE = "https://api.steampowered.com";

export async function resolveVanityUrl(
  vanityUrl: string,
  apiKey: string
): Promise<string | null> {
  const url = `${STEAM_API_BASE}/ISteamUser/ResolveVanityURL/v1/?key=${apiKey}&vanityurl=${encodeURIComponent(vanityUrl)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    response: { success: number; steamid?: string };
  };
  return data.response.success === 1 ? (data.response.steamid ?? null) : null;
}

export interface PlayerSummary {
  steamid: string;
  personaname: string;
  avatarfull: string;
  communityvisibilitystate: number;
}

export async function getPlayerSummaries(
  steamIds: string[],
  apiKey: string
): Promise<PlayerSummary[]> {
  if (steamIds.length === 0) return [];
  const results: PlayerSummary[] = [];
  for (let i = 0; i < steamIds.length; i += 100) {
    const batch = steamIds.slice(i, i + 100);
    const url = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${batch.join(",")}`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const data = (await res.json()) as {
      response: { players: PlayerSummary[] };
    };
    results.push(...data.response.players);
  }
  return results;
}

export interface OwnedGame {
  appid: number;
  name: string;
}

export async function getOwnedGames(
  steamId: string,
  apiKey: string
): Promise<OwnedGame[]> {
  const url = `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}&include_appinfo=1`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    response: { games?: OwnedGame[]; game_count?: number };
  };
  return data.response.games ?? [];
}

export async function getFriendList(
  steamId: string,
  apiKey: string
): Promise<string[]> {
  const url = `${STEAM_API_BASE}/ISteamUser/GetFriendList/v1/?key=${apiKey}&steamid=${steamId}&relationship=friend`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    friendslist?: { friends: Array<{ steamid: string }> };
  };
  return data.friendslist?.friends.map((f) => f.steamid) ?? [];
}
