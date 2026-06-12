import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  resolveToSteamId64,
  fetchAndCacheProfiles,
} from "@/lib/api-cache";
import type { ResolveRequest, ResolveResponse } from "@/lib/types";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as ResolveRequest;
  const { ids } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  if (ids.length > 25) {
    return NextResponse.json(
      { error: "Maximum 25 users per comparison" },
      { status: 400 }
    );
  }

  const cfCtx = await getCloudflareContext({ async: true }).catch((e) => {
    console.error("getCloudflareContext failed:", String(e));
    return null;
  });
  if (!cfCtx) {
    return NextResponse.json({ error: "Cloudflare context unavailable" }, { status: 500 });
  }

  const kv = cfCtx.env.STEAM_CACHE;
  const db = cfCtx.env.DB;

  const resolvedIds: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  for (const raw of ids) {
    const { steamId, error } = await resolveToSteamId64(raw, kv);
    if (steamId) {
      resolvedIds.push(steamId);
    } else {
      errors.push({ id: raw, error: error ?? "Unknown error" });
    }
  }

  try {
    const users = await fetchAndCacheProfiles(resolvedIds, kv, db);
    const response: ResolveResponse = { users, errors };
    return NextResponse.json(response);
  } catch (e) {
    console.error("fetchAndCacheProfiles failed:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
