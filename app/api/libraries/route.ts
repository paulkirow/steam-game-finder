import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCachedLibrary, enrichGames } from "@/lib/api-cache";
import type { DBGame } from "@/lib/db";
import type { LibrariesRequest, LibrariesResponse, SteamGame } from "@/lib/types";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as LibrariesRequest;
  const { steamIds } = body;

  if (!Array.isArray(steamIds) || steamIds.length === 0) {
    return NextResponse.json({ error: "steamIds required" }, { status: 400 });
  }

  const cfCtx = await getCloudflareContext({ async: true }).catch((e) => {
    console.error("getCloudflareContext failed:", e);
    return null;
  });
  if (!cfCtx) {
    return NextResponse.json({ error: "Cloudflare context unavailable" }, { status: 500 });
  }

  const kv = cfCtx.env.STEAM_CACHE;
  const db = cfCtx.env.DB;

  const privateUsers: string[] = [];
  const freqMap = new Map<number, { count: number; name: string; ownerIds: string[] }>();

  for (const steamId of steamIds) {
    const profileEntry = await kv.get(`steam:profile:${steamId}`, "text");
    if (profileEntry) {
      const profile = JSON.parse(profileEntry) as { isPrivate?: boolean };
      if (profile.isPrivate) {
        privateUsers.push(steamId);
        continue;
      }
    }

    try {
      const games = await getCachedLibrary(steamId, kv);
      for (const game of games) {
        const existing = freqMap.get(game.appid);
        if (existing) {
          existing.count++;
          existing.ownerIds.push(steamId);
        } else {
          freqMap.set(game.appid, { count: 1, name: game.name, ownerIds: [steamId] });
        }
      }
    } catch {
      privateUsers.push(steamId);
    }
  }

  const publicCount = steamIds.length - privateUsers.length;

  const sortedAppids = Array.from(freqMap.keys()).sort(
    (a, b) => freqMap.get(b)!.count - freqMap.get(a)!.count
  );

  let gameDataMap: Map<number, DBGame>;
  try {
    gameDataMap = await enrichGames(sortedAppids, db);
  } catch (e) {
    console.error("enrichGames failed:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  const games: SteamGame[] = sortedAppids.map((appid) => {
    const freq = freqMap.get(appid)!;
    const dbGame = gameDataMap.get(appid);
    const ownerPercent =
      publicCount > 0 ? Math.round((freq.count / publicCount) * 100) : 0;

    return {
      appid,
      name: dbGame?.name || freq.name,
      ownerCount: freq.count,
      ownerPercent,
      ownerIds: freq.ownerIds,
      tags: dbGame?.tags ? (JSON.parse(dbGame.tags) as Record<string, number>) : null,
      scoreRank: dbGame?.score_rank ?? "",
      genre: dbGame?.genre ?? null,
      average2weeks: dbGame?.average_2weeks ?? null,
      categories: dbGame?.categories
        ? (JSON.parse(dbGame.categories) as Array<{ id: number; description: string }>)
        : null,
      metacritic: dbGame?.metacritic ?? null,
      releaseDate: dbGame?.release_date ?? null,
      headerImage: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
    };
  });

  const response: LibrariesResponse = {
    games,
    privateUsers,
    totalUsers: steamIds.length,
  };
  return NextResponse.json(response);
}
