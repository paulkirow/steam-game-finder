"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type {
  SteamUser,
  SteamGame,
  ResolveResponse,
  LibrariesResponse,
  FriendsResponse,
} from "@/lib/types";

type Tab = "all" | "everyone" | "majority" | "unique";

const CO_OP_CATEGORY_IDS = new Set([1, 9, 24, 27, 36, 37, 38, 39, 49]);

// SteamSpy tag fallback for games not yet enriched with Store category data.
const MULTIPLAYER_TAGS = new Set([
  "Multiplayer",
  "Co-op",
  "Online Co-Op",
  "Local Co-Op",
  "Local Multiplayer",
  "Massively Multiplayer",
  "PvP",
  "Online PvP",
  "Competitive",
  "Battle Royale",
]);

function isMultiplayer(game: SteamGame): boolean {
  if (game.categories?.some((c) => CO_OP_CATEGORY_IDS.has(c.id))) return true;
  if (game.tags) {
    return Object.keys(game.tags).some((t) => MULTIPLAYER_TAGS.has(t));
  }
  return false;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All games" },
  { id: "everyone", label: "Everyone owns it" },
  { id: "majority", label: "At least 50%" },
  { id: "unique", label: "Unique to one" },
];

export default function ResultsLoader() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const idsParam = searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 25);

  // Comparison data
  const [step, setStep] = useState<"resolving" | "loading" | "done" | "error">(
    "resolving"
  );
  const [users, setUsers] = useState<SteamUser[]>([]);
  const [games, setGames] = useState<SteamGame[]>([]);
  const [privateUsers, setPrivateUsers] = useState<string[]>([]);
  const [publicCount, setPublicCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter state
  const [activeTab, setActiveTab] = useState<Tab>("everyone");
  const [coopOnly, setCoopOnly] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Add-player modal state
  const [showModal, setShowModal] = useState(false);
  const [modalIdInput, setModalIdInput] = useState("");
  const [isModalAdding, setIsModalAdding] = useState(false);
  const [modalAddError, setModalAddError] = useState<string | null>(null);
  const [friendSource, setFriendSource] = useState("");
  const [friendsList, setFriendsList] = useState<SteamUser[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [friendSearch, setFriendSearch] = useState("");

  // Re-fetch comparison data whenever ids URL param changes.
  useEffect(() => {
    if (ids.length === 0) return;
    let cancelled = false;

    async function load() {
      setStep("resolving");
      setErrorMsg(null);
      try {
        const resolveRes = await fetch("/api/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        if (!resolveRes.ok)
          throw new Error(`Resolve failed: ${resolveRes.status}`);
        const resolveData = (await resolveRes.json()) as ResolveResponse;
        if (cancelled) return;
        setUsers(resolveData.users);
        setStep("loading");

        const libRes = await fetch("/api/libraries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            steamIds: resolveData.users.map((u) => u.steamId),
          }),
        });
        if (!libRes.ok)
          throw new Error(`Libraries failed: ${libRes.status}`);
        const libData = (await libRes.json()) as LibrariesResponse;
        if (cancelled) return;

        setGames(libData.games);
        setPrivateUsers(libData.privateUsers);
        setPublicCount(libData.totalUsers - libData.privateUsers.length);
        setStep("done");
      } catch (e) {
        if (!cancelled) {
          setErrorMsg(String(e));
          setStep("error");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsParam]);

  // Load friends whenever the selected source user changes.
  useEffect(() => {
    if (!friendSource) return;
    let cancelled = false;

    async function load() {
      setFriendsLoading(true);
      setFriendsError(null);
      setFriendsList([]);
      try {
        const res = await fetch(`/api/friends?steamId=${friendSource}`);
        const data = (await res.json()) as FriendsResponse;
        if (cancelled) return;
        if (data.error) setFriendsError(data.error);
        setFriendsList(data.friends);
      } catch (e) {
        if (!cancelled) setFriendsError(String(e));
      } finally {
        if (!cancelled) setFriendsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [friendSource]);

  const openModal = useCallback(() => {
    setShowModal(true);
    setModalIdInput("");
    setModalAddError(null);
    setFriendSearch("");
    // Seed the friend source with the first current user on first open.
    setFriendSource((prev) => prev || ids[0] || "");
  }, [ids]);

  const closeModal = useCallback(() => setShowModal(false), []);

  const addById = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const input = modalIdInput.trim();
      if (!input) return;
      setIsModalAdding(true);
      setModalAddError(null);
      try {
        const res = await fetch("/api/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [input] }),
        });
        const data = (await res.json()) as ResolveResponse;
        if (data.errors.length > 0 || data.users.length === 0) {
          setModalAddError(
            data.errors[0]?.error ?? "Could not resolve Steam ID"
          );
          return;
        }
        const newId = data.users[0].steamId;
        if (ids.includes(newId)) {
          setModalAddError("That player is already in the comparison");
          return;
        }
        if (ids.length >= 25) {
          setModalAddError("Maximum 25 players");
          return;
        }
        closeModal();
        router.replace(`/results?ids=${[...ids, newId].join(",")}`);
      } catch (e) {
        setModalAddError(String(e));
      } finally {
        setIsModalAdding(false);
      }
    },
    [modalIdInput, ids, router, closeModal]
  );

  const addFriend = useCallback(
    (steamId: string) => {
      if (ids.includes(steamId) || ids.length >= 25) return;
      closeModal();
      router.replace(`/results?ids=${[...ids, steamId].join(",")}`);
    },
    [ids, router, closeModal]
  );

  const removeUser = useCallback(
    (steamId: string) => {
      router.replace(
        `/results?ids=${ids.filter((id) => id !== steamId).join(",")}`
      );
    },
    [ids, router]
  );

  const filteredGames = useCallback((): SteamGame[] => {
    let result = games;
    if (activeTab === "everyone") {
      result = result.filter((g) => g.ownerCount === publicCount);
    } else if (activeTab === "majority") {
      result = result.filter(
        (g) => publicCount > 0 && g.ownerCount / publicCount >= 0.5
      );
    } else if (activeTab === "unique") {
      result = result.filter((g) => g.ownerCount === 1);
    }
    if (coopOnly) {
      result = result.filter(isMultiplayer);
    }
    if (tagFilter) {
      result = result.filter(
        (g) => g.tags && Object.keys(g.tags).includes(tagFilter)
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((g) => g.name.toLowerCase().includes(q));
    }
    return result;
  }, [games, activeTab, publicCount, coopOnly, tagFilter, searchQuery]);

  const topTags = useCallback((): string[] => {
    const counts = new Map<string, number>();
    for (const game of games) {
      if (!game.tags) continue;
      for (const tag of Object.keys(game.tags)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([tag]) => tag);
  }, [games]);

  // Friends visible in the modal: exclude already-added users, apply search.
  const visibleFriends = friendsList
    .filter((f) => !ids.includes(f.steamId))
    .filter(
      (f) =>
        !friendSearch.trim() ||
        f.personaName.toLowerCase().includes(friendSearch.toLowerCase())
    );

  if (ids.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 mb-4">No Steam IDs provided.</p>
          <Link href="/" className="text-blue-400 hover:underline">
            ← Go back
          </Link>
        </div>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 mb-4">{errorMsg}</p>
        <Link href="/" className="text-blue-400 hover:underline">
          ← Try again
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-white">Shared Games</h1>
          <Link
            href="/"
            className="text-sm text-slate-400 hover:text-slate-200 transition-colors shrink-0"
          >
            ← New comparison
          </Link>
        </div>

        {/* Player chips */}
        <div className="mb-6 space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            {users.map((u) => (
              <span
                key={u.steamId}
                className="flex items-center gap-1.5 text-xs bg-slate-800 rounded-full pl-2 pr-1 py-1"
              >
                {u.avatarUrl && (
                  <Image
                    src={u.avatarUrl}
                    alt=""
                    width={16}
                    height={16}
                    className="rounded-full"
                    unoptimized
                  />
                )}
                <span
                  className={
                    u.isPrivate ? "text-slate-500" : "text-slate-300"
                  }
                >
                  {u.personaName || u.steamId}
                  {u.isPrivate && " 🔒"}
                </span>
                <button
                  onClick={() => removeUser(u.steamId)}
                  disabled={ids.length <= 1}
                  aria-label={`Remove ${u.personaName}`}
                  className="ml-0.5 px-1 text-slate-500 hover:text-red-400 disabled:opacity-30 transition-colors rounded-full"
                >
                  ×
                </button>
              </span>
            ))}
            {/* Placeholder chips while resolving */}
            {step !== "done" &&
              ids
                .filter((id) => !users.find((u) => u.steamId === id))
                .map((id) => (
                  <span
                    key={id}
                    className="text-xs bg-slate-800 rounded-full px-2.5 py-1 text-slate-500 animate-pulse"
                  >
                    {id.slice(0, 8)}…
                  </span>
                ))}
            {ids.length < 25 && (
              <button
                onClick={openModal}
                className="text-xs text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded-full px-3 py-1 transition-colors"
              >
                + Add player
              </button>
            )}
          </div>
          {privateUsers.length > 0 && (
            <p className="text-amber-400/80 text-xs">
              {privateUsers.length} private profile
              {privateUsers.length !== 1 ? "s" : ""} excluded from game
              comparison.
            </p>
          )}
        </div>

        {/* Loading states */}
        {(step === "resolving" || step === "loading") && (
          <StatusMessage>
            {step === "resolving"
              ? "Looking up Steam profiles…"
              : "Fetching game libraries… (this may take a moment on first run)"}
          </StatusMessage>
        )}

        {step === "done" && (
          <>
            {/* Tabs */}
            <div className="flex gap-1 mb-4 border-b border-slate-700">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activeTab === id
                      ? "border-blue-500 text-blue-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Search + tag filters */}
            <div className="mb-4 space-y-2">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search games…"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setCoopOnly((v) => !v)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    coopOnly
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-slate-600 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  Co-op / Multiplayer only
                </button>
                {topTags().map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      setTagFilter((prev) => (prev === tag ? null : tag));
                      setActiveTab("all");
                    }}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      tagFilter === tag
                        ? "bg-slate-600 border-slate-500 text-white"
                        : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-400"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <GameTable games={filteredGames()} publicCount={publicCount} users={users} />
          </>
        )}
      </div>

      {/* Add player modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="bg-slate-800 rounded-xl w-full max-w-md shadow-2xl border border-slate-700 flex flex-col max-h-[90vh]">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
              <h2 className="font-semibold text-white">Add player</h2>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-white text-xl leading-none transition-colors"
              >
                ×
              </button>
            </div>

            {/* Add by ID */}
            <div className="px-5 py-4 border-b border-slate-700 shrink-0">
              <form onSubmit={addById} className="flex gap-2">
                <input
                  type="text"
                  value={modalIdInput}
                  onChange={(e) => {
                    setModalIdInput(e.target.value);
                    setModalAddError(null);
                  }}
                  placeholder="Steam ID or profile URL"
                  autoFocus
                  className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={!modalIdInput.trim() || isModalAdding}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
                >
                  {isModalAdding ? "Adding…" : "Add"}
                </button>
              </form>
              {modalAddError && (
                <p className="text-red-400 text-xs mt-2">{modalAddError}</p>
              )}
            </div>

            {/* Friends list */}
            <div className="flex flex-col min-h-0 flex-1">
              <div className="px-5 pt-4 pb-2 shrink-0 space-y-3">
                {/* Source selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 shrink-0">
                    Browse friends of
                  </span>
                  <select
                    value={friendSource}
                    onChange={(e) => setFriendSource(e.target.value)}
                    className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    {users.map((u) => (
                      <option key={u.steamId} value={u.steamId}>
                        {u.personaName || u.steamId}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Friend search */}
                <input
                  type="search"
                  value={friendSearch}
                  onChange={(e) => setFriendSearch(e.target.value)}
                  placeholder="Search friends…"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="overflow-y-auto flex-1 px-2 pb-2">
                {friendsLoading && (
                  <div className="flex justify-center py-8">
                    <Spinner />
                  </div>
                )}
                {friendsError && !friendsLoading && (
                  <p className="text-amber-400/80 text-xs text-center py-6 px-4">
                    {friendsError}
                  </p>
                )}
                {!friendsLoading && !friendsError && visibleFriends.length === 0 && (
                  <p className="text-slate-500 text-xs text-center py-6">
                    {friendSearch ? "No friends match your search." : "No friends to add."}
                  </p>
                )}
                {!friendsLoading &&
                  visibleFriends.map((friend) => (
                    <button
                      key={friend.steamId}
                      onClick={() => addFriend(friend.steamId)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700 transition-colors text-left"
                    >
                      {friend.avatarUrl ? (
                        <Image
                          src={friend.avatarUrl}
                          alt=""
                          width={32}
                          height={32}
                          className="rounded shrink-0"
                          unoptimized
                        />
                      ) : (
                        <div className="w-8 h-8 rounded bg-slate-600 shrink-0" />
                      )}
                      <span
                        className={`flex-1 text-sm truncate ${
                          friend.isPrivate
                            ? "text-slate-500"
                            : "text-slate-200"
                        }`}
                      >
                        {friend.personaName || friend.steamId}
                      </span>
                      {friend.isPrivate && (
                        <span className="text-xs text-slate-600 shrink-0">
                          private
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-5 w-5 text-blue-400"
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

function StatusMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-slate-400 py-12 justify-center">
      <Spinner />
      {children}
    </div>
  );
}

function GameTable({
  games,
  publicCount,
  users,
}: {
  games: SteamGame[];
  publicCount: number;
  users: SteamUser[];
}) {
  if (games.length === 0) {
    return (
      <p className="text-slate-500 text-center py-12">
        No games match the current filter.
      </p>
    );
  }

  const publicUsers = users.filter((u) => !u.isPrivate);

  return (
    <div className="rounded-lg border border-slate-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-slate-400 text-left">
            <th className="px-4 py-3 font-medium w-10" />
            <th className="px-4 py-3 font-medium">Game</th>
            <th className="px-4 py-3 font-medium text-right">Owners</th>
            <th className="px-4 py-3 font-medium text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {games.map((game) => {
            const missingUsers = publicUsers.filter(
              (u) => !game.ownerIds.includes(u.steamId)
            );
            return (
              <tr
                key={game.appid}
                className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
              >
                <td className="pl-3 pr-1 py-2">
                  <Image
                    src={game.headerImage}
                    alt=""
                    width={60}
                    height={28}
                    className="rounded object-cover"
                    unoptimized
                    onError={() => {}}
                  />
                </td>
                <td className="px-4 py-2">
                  <a
                    href={`https://store.steampowered.com/app/${game.appid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-200 hover:text-blue-400 transition-colors font-medium"
                  >
                    {game.name}
                  </a>
                  {game.tags && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(game.tags)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([tag]) => (
                          <span
                            key={tag}
                            className="text-xs text-slate-500 bg-slate-800 rounded px-1.5 py-0.5"
                          >
                            {tag}
                          </span>
                        ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {missingUsers.length > 0 ? (
                    <div className="relative inline-block group">
                      <span className="text-slate-300 cursor-default underline decoration-dotted decoration-slate-500">
                        {game.ownerCount}/{publicCount}
                      </span>
                      <div className="absolute bottom-full right-0 mb-2 z-20 hidden group-hover:block pointer-events-none">
                        <div className="bg-slate-700 border border-slate-600 rounded-lg shadow-xl p-3 min-w-max">
                          <p className="text-xs text-slate-400 font-medium mb-2">
                            Missing:
                          </p>
                          <div className="space-y-1.5">
                            {missingUsers.map((u) => (
                              <div
                                key={u.steamId}
                                className="flex items-center gap-2 text-xs text-slate-200"
                              >
                                {u.avatarUrl && (
                                  <Image
                                    src={u.avatarUrl}
                                    alt=""
                                    width={16}
                                    height={16}
                                    className="rounded-sm shrink-0"
                                    unoptimized
                                  />
                                )}
                                {u.personaName || u.steamId}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-300">
                      {game.ownerCount}/{publicCount}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  <PercentBar percent={game.ownerPercent} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PercentBar({ percent }: { percent: number }) {
  const color =
    percent === 100
      ? "bg-green-500"
      : percent >= 75
      ? "bg-blue-500"
      : percent >= 50
      ? "bg-blue-600"
      : "bg-slate-600";

  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-slate-300 w-10 text-right">{percent}%</span>
    </div>
  );
}
