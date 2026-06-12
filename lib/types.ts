export interface SteamUser {
  steamId: string;
  personaName: string;
  avatarUrl: string;
  isPrivate: boolean;
}

export interface SteamGame {
  appid: number;
  name: string;
  ownerCount: number;
  ownerPercent: number;
  ownerIds: string[];
  tags: Record<string, number> | null;
  scoreRank: string;
  genre: string | null;
  average2weeks: number | null;
  categories: Array<{ id: number; description: string }> | null;
  metacritic: number | null;
  releaseDate: string | null;
  headerImage: string;
}

export interface ResolveRequest {
  ids: string[];
}

export interface ResolveResponse {
  users: SteamUser[];
  errors: Array<{ id: string; error: string }>;
}

export interface LibrariesRequest {
  steamIds: string[];
}

export interface LibrariesResponse {
  games: SteamGame[];
  privateUsers: string[];
  totalUsers: number;
}

export interface FriendsResponse {
  friends: SteamUser[];
  error?: string;
}
