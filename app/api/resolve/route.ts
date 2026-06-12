import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  resolveToSteamId64,
  fetchAndCacheProfiles,
} from "@/lib/api-cache";
import type { ResolveRequest, ResolveResponse } from "@/lib/types";

export const runtime = "edge";

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

  const { env } = await getCloudflareContext({ async: true });
  const kv = env.STEAM_CACHE;
  const db = env.DB;

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

  const users = await fetchAndCacheProfiles(resolvedIds, kv, db);

  const response: ResolveResponse = { users, errors };
  return NextResponse.json(response);
}
