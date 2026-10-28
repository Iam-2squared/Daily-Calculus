import type {
  AnswerResult,
  Leaderboard,
  Problem,
  Stats,
  User,
} from "../shared/types";
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
    throw new Error(
      data.error || "通信に失敗しました。時間をおいてお試しください。",
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
  answer: (id: string, choiceIndex: number) =>
    request<AnswerResult>(`/api/problems/${encodeURIComponent(id)}/answer`, {
      method: "POST",
      body: JSON.stringify({ choiceIndex }),
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
