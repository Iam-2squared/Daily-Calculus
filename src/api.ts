import type {
  AnswerResult,
  ChallengeMode,
  ChallengeResponse,
  Level,
  Leaderboard,
  Problem,
  Stats,
  User,
} from "../shared/types";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      data.error || "通信に失敗しました。時間をおいてお試しください。",
      response.status,
    );
  return data as T;
}
export const api = {
  session: () => request<{ user: User | null }>("/api/session"),
  auth: (mode: "register" | "login", username: string, password: string) =>
    request<{ user: User }>(`/api/auth/${mode}`, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () =>
    request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  problems: (date?: string) =>
    request<{ date: string; problems: Problem[] }>(
      `/api/problems${date ? `?date=${date}` : ""}`,
    ),
  archive: (level?: string) =>
    request<{ problems: Problem[] }>(
      `/api/archive${level ? `?level=${level}` : ""}`,
    ),
  startChallenge: (level: Level, mode: ChallengeMode) =>
    request<ChallengeResponse>("/api/challenges/start", {
      method: "POST",
      body: JSON.stringify({ level, mode }),
    }),
  nextChallenge: (level: Level, mode: ChallengeMode, runToken?: string) =>
    request<ChallengeResponse>("/api/challenges/next", {
      method: "POST",
      body: JSON.stringify({ level, mode, runToken }),
    }),
  answer: (id: string, choiceIndex: number, runToken?: string) =>
    request<AnswerResult>(`/api/problems/${encodeURIComponent(id)}/answer`, {
      method: "POST",
      body: JSON.stringify({ choiceIndex, runToken }),
    }),
  stats: () => request<Stats>("/api/stats"),
  rankings: (period: "all" | "week") =>
    request<Leaderboard>(`/api/rankings?period=${period}`),
};
export const EMPTY_STATS: Stats = {
  totalPoints: 0,
  weeklyPoints: 0,
  solvedCount: 0,
  streak: 0,
  activity: [],
  solvedIds: [],
  levelCounts: { basic: 0, applied: 0, advanced: 0 },
};
