"use client";

import { useState, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { SteamUser, ResolveResponse, FriendsResponse } from "@/lib/types";

const MAX_USERS = 25;

type Phase =
  | "input"
  | "loading-profile"
  | "loading-friends"
  | "select"
  | "manual";

export default function HomePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("input");
  const [inputValue, setInputValue] = useState("");
  const [selfUser, setSelfUser] = useState<SteamUser | null>(null);
  const [friends, setFriends] = useState<SteamUser[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [extraInput, setExtraInput] = useState("");
  const [manualInput, setManualInput] = useState("");
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLoadFriends = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim()) return;
      setError(null);
      setFriendsError(null);
      setPhase("loading-profile");

      try {
        const resolveRes = await fetch("/api/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [inputValue.trim()] }),
        });
        const resolveData = (await resolveRes.json()) as ResolveResponse;

        if (!resolveData.users || !resolveData.errors) {
          setError((resolveData as { error?: string }).error ?? "API error");
          setPhase("input");
          return;
        }
        if (resolveData.errors.length > 0 || resolveData.users.length === 0) {
          setError(
            resolveData.errors[0]?.error ?? "Could not resolve Steam ID"
          );
          setPhase("input");
          return;
        }

        const me = resolveData.users[0];
        setSelfUser(me);
        setSelectedIds(new Set([me.steamId]));
        setPhase("loading-friends");

        const friendsRes = await fetch(
          `/api/friends?steamId=${me.steamId}`
        );
        const friendsData = (await friendsRes.json()) as FriendsResponse;

        if (friendsData.error) {
          setFriendsError(friendsData.error);
        }
        setFriends(friendsData.friends);
        setPhase("select");
      } catch (e) {
        setError(String(e));
        setPhase("input");
      }
    },
    [inputValue]
  );

  const toggleFriend = useCallback(
    (steamId: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(steamId)) {
          next.delete(steamId);
        } else if (next.size < MAX_USERS) {
          next.add(steamId);
        }
        return next;
      });
    },
    []
  );

  const handleCompare = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const ids = Array.from(selectedIds);

      // Add any extra IDs entered manually
      const extras = extraInput
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (extras.length > 0) {
        ids.push(...extras);
      }

      const deduped = Array.from(new Set(ids)).slice(0, MAX_USERS);
      router.push(`/results?ids=${deduped.join(",")}`);
    },
    [selectedIds, extraInput, router]
  );

  const handleManualCompare = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const ids = manualInput
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MAX_USERS);
      if (ids.length === 0) return;
      router.push(`/results?ids=${Array.from(new Set(ids)).join(",")}`);
    },
    [manualInput, router]
  );

  const allUsers = selfUser
    ? [selfUser, ...friends.filter((f) => f.steamId !== selfUser.steamId)]
    : friends;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <h1 className="text-3xl font-bold text-white mb-1">
          Steam Game Finder
        </h1>
        <p className="text-slate-400 mb-8">
          Find games your friend group can play together.
        </p>

        {phase === "manual" ? (
          <form onSubmit={handleManualCompare} className="space-y-4">
            <label className="block">
              <span className="text-sm text-slate-400 mb-1 block">
                Steam IDs or profile URLs, one per line (max 25)
              </span>
              <textarea
                className="w-full h-40 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none font-mono text-sm"
                placeholder={`76561198000000000\nhttps://steamcommunity.com/id/example`}
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
              />
            </label>
            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
                disabled={!manualInput.trim()}
              >
                Compare
              </button>
              <button
                type="button"
                onClick={() => setPhase("input")}
                className="px-4 text-slate-400 hover:text-slate-200 transition-colors"
              >
                ← Back
              </button>
            </div>
          </form>
        ) : phase === "input" ? (
          <div className="space-y-4">
            <form onSubmit={handleLoadFriends} className="space-y-3">
              <label className="block">
                <span className="text-sm text-slate-400 mb-1 block">
                  Your Steam ID or profile URL
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    placeholder="steamcommunity.com/id/yourname"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                    disabled={!inputValue.trim()}
                  >
                    Load Friends
                  </button>
                </div>
              </label>
              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}
            </form>

            <div className="flex items-center gap-3 text-slate-600">
              <div className="flex-1 h-px bg-slate-700" />
              <span className="text-xs uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-slate-700" />
            </div>

            <button
              onClick={() => setPhase("manual")}
              className="w-full border border-slate-600 hover:border-slate-500 text-slate-400 hover:text-slate-200 py-2.5 rounded-lg transition-colors text-sm"
            >
              Enter IDs manually
            </button>
          </div>
        ) : phase === "loading-profile" ? (
          <div className="text-slate-400 flex items-center gap-3">
            <Spinner />
            Looking up your profile…
          </div>
        ) : phase === "loading-friends" ? (
          <div className="space-y-3">
            {selfUser && <UserCard user={selfUser} checked={true} onChange={() => {}} />}
            <div className="text-slate-400 flex items-center gap-3">
              <Spinner />
              Loading your friends list…
            </div>
          </div>
        ) : (
          // phase === "select"
          <form onSubmit={handleCompare} className="space-y-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-slate-200">
                Select players to compare
              </h2>
              <span className="text-sm text-slate-400">
                {selectedIds.size}/{MAX_USERS} selected
              </span>
            </div>

            {friendsError && (
              <p className="text-amber-400 text-sm bg-amber-950/30 border border-amber-800/40 rounded px-3 py-2">
                {friendsError}
              </p>
            )}

            <div className="max-h-80 overflow-y-auto space-y-1 rounded-lg border border-slate-700 bg-slate-800/50">
              {allUsers.length === 0 ? (
                <p className="text-slate-500 text-sm px-3 py-4 text-center">
                  No friends found
                </p>
              ) : (
                allUsers.map((user) => (
                  <UserCard
                    key={user.steamId}
                    user={user}
                    checked={selectedIds.has(user.steamId)}
                    onChange={() => toggleFriend(user.steamId)}
                    isSelf={user.steamId === selfUser?.steamId}
                    disabled={
                      !selectedIds.has(user.steamId) &&
                      selectedIds.size >= MAX_USERS
                    }
                  />
                ))
              )}
            </div>

            <div>
              <label className="text-sm text-slate-400 mb-1 block">
                Add more players (IDs or URLs, one per line)
              </label>
              <textarea
                className="w-full h-20 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none font-mono text-sm"
                placeholder="76561198000000000"
                value={extraInput}
                onChange={(e) => setExtraInput(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
              disabled={selectedIds.size === 0}
            >
              Compare {selectedIds.size > 0 ? `${selectedIds.size} player${selectedIds.size !== 1 ? "s" : ""}` : ""}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-blue-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v8H4z"
      />
    </svg>
  );
}

function UserCard({
  user,
  checked,
  onChange,
  isSelf,
  disabled,
}: {
  user: SteamUser;
  checked: boolean;
  onChange: () => void;
  isSelf?: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-700/50 transition-colors ${
        disabled ? "opacity-40 cursor-not-allowed" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="w-4 h-4 accent-blue-500"
      />
      {user.avatarUrl ? (
        <Image
          src={user.avatarUrl}
          alt=""
          width={32}
          height={32}
          className="rounded"
          unoptimized
        />
      ) : (
        <div className="w-8 h-8 rounded bg-slate-700" />
      )}
      <span className="flex-1 text-sm text-slate-200 truncate">
        {user.personaName || user.steamId}
        {isSelf && (
          <span className="ml-1.5 text-xs text-blue-400">(you)</span>
        )}
      </span>
      {user.isPrivate && (
        <span className="text-xs text-slate-500 shrink-0">private</span>
      )}
    </label>
  );
}
