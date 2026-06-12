import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCachedFriendIds, fetchAndCacheProfiles } from "@/lib/api-cache";
import type { FriendsResponse } from "@/lib/types";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const steamId = request.nextUrl.searchParams.get("steamId");
  if (!steamId) {
    return NextResponse.json(
      { friends: [], error: "steamId required" },
      { status: 400 }
    );
  }

  const cfCtx = await getCloudflareContext({ async: true }).catch((e) => {
    console.error("getCloudflareContext failed:", e);
    return null;
  });
  if (!cfCtx) {
    return NextResponse.json(
      { friends: [], error: "Cloudflare context unavailable" },
      { status: 500 }
    );
  }

  const kv = cfCtx.env.STEAM_CACHE;
  const db = cfCtx.env.DB;

  try {
    const friendIds = await getCachedFriendIds(steamId, kv);
    if (friendIds.length === 0) {
      const response: FriendsResponse = {
        friends: [],
        error: "No friends found or friends list is private",
      };
      return NextResponse.json(response);
    }

    const limited = friendIds.slice(0, 200);
    const friends = await fetchAndCacheProfiles(limited, kv, db);

    const response: FriendsResponse = { friends };
    return NextResponse.json(response);
  } catch (e) {
    const response: FriendsResponse = {
      friends: [],
      error: String(e),
    };
    return NextResponse.json(response);
  }
}
