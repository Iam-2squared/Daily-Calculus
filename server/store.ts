import { createHash } from "node:crypto";
import { openDatabase, type Database } from "./db.js";
import { addDays } from "../shared/date.js";
import type {
  Stats,
  User,
  Level,
  Leaderboard,
  RankingEntry,
  ScoringStatus,
} from "../shared/types.js";

export interface UserRow {
  id: number;
  username: string;
  created_at: string;
  password_hash: string;
  password_salt: string;
}
export interface NewUser {
  username: string;
  key: string;
  hash: string;
  salt: string;
  createdAt: string;
}
export interface SolveInput {
  userId: number;
  problemId: string;
  level: Level;
  points: number;
  solvedAt: string;
  date: string;
  correct: boolean;
}
export interface SolveRecord {
  pointsEarned: number;
  alreadySolved: boolean;
  scoring: ScoringStatus;
  awardBlocked: boolean;
}
export interface LifetimeTotal {
  userId: number;
  totalPoints: number;
  known: boolean;
  deleted: boolean;
}
export const MAX_SOURCE_POINTS = 1_000_000_000;
export function validLifetimeIds(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 100 &&
    value.every((id) => Number.isInteger(id) && id >= 1 && id <= 2147483647) &&
    new Set(value).size === value.length
  );
}
export interface Store {
  db?: Database;
  userByKey(key: string): Promise<UserRow | null>;
  createUser(input: NewUser): Promise<UserRow | null>;
  sessionUser(tokenHash: string, nowMs: number): Promise<User | null>;
  createSession(
    tokenHash: string,
    userId: number,
    expiresAt: number,
    nowMs: number,
  ): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteUser(userId: number): Promise<void>;
  consumeLimit(key: string, maximum: number, nowMs: number): Promise<boolean>;
  clearLimit(key: string): Promise<void>;
  recordSolve(input: SolveInput): Promise<SolveRecord>;
  lifetimeTotals(userIds: number[]): Promise<LifetimeTotal[]>;
  stats(userId: number, weekStart: string, today: string): Promise<Stats>;
  rankings(
    userId: number | null,
    period: "all" | "week",
    weekStart: string,
  ): Promise<Leaderboard>;
}
export const publicUser = (
  row: Pick<UserRow, "id" | "username" | "created_at">,
): User => ({
  id: Number(row.id),
  username: row.username,
  createdAt: row.created_at,
});
const limitKey = (key: string) =>
  createHash("sha256").update(key).digest("hex");
function withStreak(stats: Stats, today: string): Stats {
  const dates = new Set(stats.activity.map((day) => day.date));
  let cursor = dates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (dates.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return { ...stats, streak };
}
function scoringStatus(mistakes = 0, correctStreak = 0): ScoringStatus {
  return {
    mistakes,
    correctStreak,
    requiredCorrectStreak: 3,
    locked: mistakes === 2,
  };
}
export function emptyStats(): Stats {
  return {
    totalPoints: 0,
    weeklyPoints: 0,
    solvedCount: 0,
    activity: [],
    solvedIds: [],
    levelCounts: { basic: 0, applied: 0, advanced: 0 },
    streak: 0,
    scoring: scoringStatus(),
  };
}

export class SqliteStore implements Store {
  readonly db: Database;
  constructor(path: string) {
    this.db = openDatabase(path);
  }
  async userByKey(key: string): Promise<UserRow | null> {
    return (
      (this.db
        .prepare("SELECT * FROM users WHERE username_key = ?")
        .get(key) as unknown as UserRow) || null
    );
  }
  async createUser(input: NewUser): Promise<UserRow | null> {
    const row = this.db
      .prepare(
        "INSERT INTO users(username,username_key,password_hash,password_salt,created_at) VALUES (?,?,?,?,?) ON CONFLICT(username_key) DO NOTHING RETURNING *",
      )
      .get(input.username, input.key, input.hash, input.salt, input.createdAt);
    return (row as unknown as UserRow) || null;
  }
  async sessionUser(tokenHash: string, nowMs: number): Promise<User | null> {
    const row = this.db
      .prepare(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
      )
      .get(tokenHash, nowMs) as unknown as UserRow | undefined;
    return row ? publicUser(row) : null;
  }
  async createSession(
    tokenHash: string,
    userId: number,
    expiresAt: number,
    nowMs: number,
  ) {
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowMs);
    this.db
      .prepare(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)",
      )
      .run(tokenHash, userId, expiresAt);
  }
  async deleteSession(tokenHash: string) {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }
  async deleteUser(userId: number) {
    // Foreign keys remove every session and solve in the same atomic statement.
    this.db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  }
  async consumeLimit(
    key: string,
    maximum: number,
    nowMs: number,
  ): Promise<boolean> {
    this.db
      .prepare("DELETE FROM auth_attempts WHERE expires_at <= ?")
      .run(nowMs);
    const row = this.db
      .prepare(
        `INSERT INTO auth_attempts(key,count,expires_at) VALUES (?,1,?)
      ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count`,
      )
      .get(limitKey(key), nowMs + 15 * 60 * 1000, maximum);
    return !!row;
  }
  async clearLimit(key: string) {
    this.db
      .prepare("DELETE FROM auth_attempts WHERE key = ?")
      .run(limitKey(key));
  }
  async recordSolve(input: SolveInput): Promise<SolveRecord> {
    const expectedPoints = { basic: 1, applied: 3, advanced: 5 }[input.level];
    if (
      !expectedPoints ||
      input.points !== expectedPoints ||
      typeof input.correct !== "boolean"
    )
      throw new Error("Invalid problem points.");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (!this.db.prepare("SELECT 1 FROM users WHERE id=?").get(input.userId))
        throw new Error("Account not found.");
      this.db
        .prepare(
          "INSERT INTO scoring_state(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING",
        )
        .run(input.userId);
      const state = this.db
        .prepare(
          "SELECT mistakes,correct_streak FROM scoring_state WHERE user_id=?",
        )
        .get(input.userId)!;
      let mistakes = Number(state.mistakes);
      let correctStreak = Number(state.correct_streak);
      const alreadySolved = !!this.db
        .prepare("SELECT 1 FROM solves WHERE user_id=? AND problem_id=?")
        .get(input.userId, input.problemId);
      let pointsEarned = 0;
      let awardBlocked = false;
      if (!alreadySolved) {
        if (!input.correct) {
          mistakes = Math.min(2, mistakes + 1);
          correctStreak = 0;
        } else {
          if (mistakes === 2 && correctStreak < 2) {
            correctStreak++;
            awardBlocked = true;
          } else {
            pointsEarned = expectedPoints;
            if (mistakes === 2) {
              mistakes = 0;
              correctStreak = 0;
            }
          }
          // A zero-point correct answer is still a permanent learning receipt;
          // replaying it cannot advance recovery or claim a later award.
          this.db
            .prepare(
              "INSERT INTO solves(user_id,problem_id,level,points,solved_at,solved_date) VALUES(?,?,?,?,?,?)",
            )
            .run(
              input.userId,
              input.problemId,
              input.level,
              pointsEarned,
              input.solvedAt,
              input.date,
            );
        }
        this.db
          .prepare(
            "UPDATE scoring_state SET mistakes=?,correct_streak=? WHERE user_id=?",
          )
          .run(mistakes, correctStreak, input.userId);
      }
      const result = {
        pointsEarned,
        alreadySolved,
        scoring: scoringStatus(mistakes, correctStreak),
        awardBlocked,
      };
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* Preserve the original write error. */
      }
      throw error;
    }
  }
  async lifetimeTotals(userIds: number[]): Promise<LifetimeTotal[]> {
    if (!validLifetimeIds(userIds))
      throw new Error("Invalid lifetime source IDs.");
    const get = this.db.prepare(
      "SELECT total_points,deleted FROM lifetime_totals WHERE user_id=?",
    );
    return userIds.map((userId) => {
      const row = get.get(userId);
      return {
        userId,
        totalPoints: row ? Number(row.total_points) : 0,
        known: !!row,
        deleted: row ? row.deleted === 1 : true,
      };
    });
  }
  async stats(
    userId: number,
    weekStart: string,
    today: string,
  ): Promise<Stats> {
    const aggregate = this.db
      .prepare(
        "SELECT COALESCE(SUM(CASE WHEN v.user_id IS NULL THEN s.points ELSE 0 END),0) AS totalPoints, COALESCE(SUM(CASE WHEN s.solved_date >= ? AND v.user_id IS NULL THEN s.points ELSE 0 END),0) AS weeklyPoints, COUNT(*) AS solvedCount FROM solves s LEFT JOIN scoring_voids v ON v.user_id=s.user_id AND v.problem_id=s.problem_id WHERE s.user_id = ?",
      )
      .get(weekStart, userId) as unknown as Pick<
      Stats,
      "totalPoints" | "weeklyPoints" | "solvedCount"
    >;
    const activity = this.db
      .prepare(
        "SELECT s.solved_date AS date, COUNT(*) AS count, SUM(CASE WHEN v.user_id IS NULL THEN s.points ELSE 0 END) AS points FROM solves s LEFT JOIN scoring_voids v ON v.user_id=s.user_id AND v.problem_id=s.problem_id WHERE s.user_id = ? GROUP BY s.solved_date ORDER BY s.solved_date",
      )
      .all(userId) as unknown as Stats["activity"];
    const solvedIds = this.db
      .prepare(
        "SELECT problem_id FROM solves WHERE user_id = ? ORDER BY solved_at DESC",
      )
      .all(userId)
      .map((row) => String(row.problem_id));
    const levelCounts = { basic: 0, applied: 0, advanced: 0 };
    for (const row of this.db
      .prepare(
        "SELECT level,COUNT(*) AS count FROM solves WHERE user_id = ? GROUP BY level",
      )
      .all(userId))
      levelCounts[row.level as Level] = Number(row.count);
    const state = this.db
      .prepare(
        "SELECT mistakes,correct_streak FROM scoring_state WHERE user_id=?",
      )
      .get(userId);
    return withStreak(
      {
        ...aggregate,
        activity,
        solvedIds,
        levelCounts,
        streak: 0,
        scoring: scoringStatus(
          Number(state?.mistakes || 0),
          Number(state?.correct_streak || 0),
        ),
      },
      today,
    );
  }
  async rankings(
    userId: number | null,
    period: "all" | "week",
    weekStart: string,
  ): Promise<Leaderboard> {
    const query = `WITH totals AS (
      SELECT u.id, u.username, COALESCE(SUM(CASE WHEN v.user_id IS NULL THEN s.points ELSE 0 END),0) AS points FROM users u
      LEFT JOIN solves s ON s.user_id = u.id ${period === "week" ? "AND s.solved_date >= ?" : ""}
      LEFT JOIN scoring_voids v ON v.user_id=s.user_id AND v.problem_id=s.problem_id GROUP BY u.id
    ), ranked AS (SELECT *, RANK() OVER (ORDER BY points DESC) AS rank FROM totals)
    SELECT id, username, points, rank FROM ranked`;
    const parameters = period === "week" ? [weekStart] : [];
    const rows = this.db
      .prepare(
        `${query} ORDER BY points DESC, username COLLATE NOCASE, id LIMIT 25`,
      )
      .all(...parameters);
    const view = (row: Record<string, unknown>): RankingEntry => ({
      rank: Number(row.rank),
      username: String(row.username),
      points: Number(row.points),
      isYou: row.id === userId,
    });
    const own = userId
      ? this.db.prepare(`${query} WHERE id = ?`).get(...parameters, userId)
      : null;
    const totalUsers = Number(
      this.db.prepare("SELECT COUNT(*) AS count FROM users").get()?.count || 0,
    );
    return {
      entries: rows.map(view),
      me: own ? view(own) : null,
      totalUsers,
      period,
      weekStart,
    };
  }
}

export interface CloudConfig {
  url: string;
  publishableKey: string;
  storeKey: string;
}
/** Server-only RPC client. The publishable key alone cannot access any stored data. */
export class SupabaseStore implements Store {
  private endpoint: string;
  constructor(
    private config: CloudConfig,
    private request: typeof fetch = fetch,
  ) {
    const url = new URL(config.url);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("SUPABASE_URL must be an HTTPS project URL.");
    if (!config.publishableKey || !/^[a-f0-9]{64}$/.test(config.storeKey))
      throw new Error("Supabase server storage configuration is incomplete.");
    this.endpoint = `${config.url.replace(/\/$/, "")}/rest/v1/rpc/dc_store`;
  }
  private async rpc<T>(
    operation: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const response = await this.request(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        apikey: this.config.publishableKey,
      },
      body: JSON.stringify({
        p_key: this.config.storeKey,
        p_operation: operation,
        p_payload: payload,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new Error(`Cloud storage request failed (${response.status}).`);
    return (await response.json()) as T;
  }
  userByKey(key: string) {
    return this.rpc<UserRow | null>("user_by_key", { key });
  }
  createUser(input: NewUser) {
    return this.rpc<UserRow | null>("user_create", { ...input });
  }
  sessionUser(tokenHash: string, nowMs: number) {
    return this.rpc<User | null>("session_get", { tokenHash, nowMs });
  }
  async createSession(
    tokenHash: string,
    userId: number,
    expiresAt: number,
    nowMs: number,
  ) {
    await this.rpc("session_create", { tokenHash, userId, expiresAt, nowMs });
  }
  async deleteSession(tokenHash: string) {
    await this.rpc("session_delete", { tokenHash });
  }
  async deleteUser(userId: number) {
    await this.rpc("user_delete", { userId });
  }
  consumeLimit(key: string, maximum: number, nowMs: number) {
    return this.rpc<boolean>("rate_consume", {
      key: limitKey(key),
      maximum,
      nowMs,
    });
  }
  async clearLimit(key: string) {
    await this.rpc("rate_clear", { key: limitKey(key) });
  }
  recordSolve(input: SolveInput) {
    return this.rpc<SolveRecord>("solve_record", { ...input });
  }
  async lifetimeTotals(userIds: number[]): Promise<LifetimeTotal[]> {
    if (!validLifetimeIds(userIds))
      throw new Error("Invalid lifetime source IDs.");
    const response = await this.request(
      this.endpoint.replace(/dc_store$/, "dc_lifetime_totals"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          apikey: this.config.publishableKey,
        },
        body: JSON.stringify({
          p_key: this.config.storeKey,
          p_user_ids: userIds,
        }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok)
      throw new Error(`Cloud lifetime request failed (${response.status}).`);
    const result: unknown = await response.json();
    if (
      !Array.isArray(result) ||
      result.length !== userIds.length ||
      result.some(
        (item, index) =>
          !item ||
          typeof item !== "object" ||
          item.userId !== userIds[index] ||
          !Number.isInteger(item.totalPoints) ||
          item.totalPoints < 0 ||
          item.totalPoints > MAX_SOURCE_POINTS ||
          typeof item.known !== "boolean" ||
          typeof item.deleted !== "boolean" ||
          (!item.known && (item.totalPoints !== 0 || !item.deleted)),
      )
    ) {
      throw new Error("Invalid cloud lifetime response.");
    }
    return result as LifetimeTotal[];
  }
  async stats(userId: number, weekStart: string, today: string) {
    return withStreak(
      await this.rpc<Stats>("stats", { userId, weekStart, today }),
      today,
    );
  }
  rankings(userId: number | null, period: "all" | "week", weekStart: string) {
    return this.rpc<Leaderboard>("rankings", { userId, period, weekStart });
  }
}

export function configuredStore(databasePath?: string): Store {
  // An explicit database path is used by local tests, even if cloud variables exist.
  if (databasePath !== undefined) return new SqliteStore(databasePath);
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const storeKey = process.env.CALCULUS_STORE_KEY;
  if (url && publishableKey && storeKey)
    return new SupabaseStore({ url, publishableKey, storeKey });
  if (process.env.VERCEL || url || publishableKey || storeKey)
    throw new Error(
      "Configure SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and CALCULUS_STORE_KEY. Cloud storage is required on Vercel.",
    );
  return new SqliteStore(
    process.env.DATABASE_PATH || "data/daily-calculus.sqlite",
  );
}
