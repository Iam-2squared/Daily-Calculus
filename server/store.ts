import { createHash } from "node:crypto";
import { openDatabase, type Database } from "./db.js";
import { unmappedQuestionFingerprint } from "./content-fingerprint.js";
import { addDays, todayJST } from "../shared/date.js";
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
  contentFingerprint?: string;
  awardEligible?: boolean;
}
export interface SolveRecord {
  pointsEarned: number;
  alreadySolved: boolean;
  scoring: ScoringStatus;
  awardBlocked: boolean;
  awardPaused: boolean;
  awardWrongDayBlocked: boolean;
  awardPending: boolean;
  awardDuplicate: boolean;
  awardUnavailable: boolean;
  awardAttemptedToday: boolean;
  scoringFrozenAt: string | null;
}
export interface ScoringControl {
  scoringPaused: boolean;
  scoringFrozenAt: string | null;
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
  scoringControl(): Promise<ScoringControl>;
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
  const dates = new Set(
    stats.activity.filter((day) => day.count > 0).map((day) => day.date),
  );
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
    wrongTodayIds: [],
    pendingAwardIds: [],
    attemptedTodayContentIds: [],
    levelCounts: { basic: 0, applied: 0, advanced: 0 },
    streak: 0,
    scoring: scoringStatus(),
    scoringPaused: false,
    scoringFrozenAt: null,
  };
}

export class SqliteStore implements Store {
  readonly db: Database;
  constructor(path: string) {
    this.db = openDatabase(path);
  }
  private currentControl(): ScoringControl {
    const row = this.db
      .prepare("SELECT paused,frozen_at FROM scoring_control WHERE singleton=1")
      .get();
    return {
      scoringPaused: Number(row?.paused || 0) === 1,
      scoringFrozenAt: row?.frozen_at == null ? null : String(row.frozen_at),
    };
  }
  async scoringControl(): Promise<ScoringControl> {
    return this.currentControl();
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
    const answeredAt = new Date(input.solvedAt);
    if (
      !expectedPoints ||
      input.points !== expectedPoints ||
      typeof input.correct !== "boolean" ||
      !Number.isFinite(answeredAt.getTime()) ||
      todayJST(answeredAt) !== input.date
    )
      throw new Error("Invalid problem points.");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const control = this.currentControl();
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
      let mistakes = Number(state.mistakes),
        correctStreak = Number(state.correct_streak);
      const receipt = this.db
        .prepare(
          "SELECT level,points,solved_date FROM solves WHERE user_id=? AND problem_id=?",
        )
        .get(input.userId, input.problemId);
      const alreadySolved = !!receipt;
      if (receipt && receipt.level !== input.level)
        throw new Error("Invalid problem level.");
      const mapped = this.db
        .prepare(
          "SELECT fingerprint FROM problem_fingerprints WHERE problem_id=?",
        )
        .get(input.problemId);
      const providedFingerprint =
        typeof input.contentFingerprint === "string" &&
        /^[0-9a-f]{64}$/.test(input.contentFingerprint)
          ? input.contentFingerprint
          : null;
      if (
        mapped &&
        providedFingerprint &&
        mapped.fingerprint !== providedFingerprint
      )
        throw new Error("Question identity changed.");
      const knownFingerprint =
        providedFingerprint || mapped?.fingerprint || null;
      const guardEnabled =
        this.db
          .prepare("SELECT enabled FROM content_guard WHERE singleton=1")
          .get()?.enabled === 1;
      if (guardEnabled && !knownFingerprint) {
        this.db.exec("ROLLBACK");
        return {
          pointsEarned: 0,
          alreadySolved,
          scoring: scoringStatus(mistakes, correctStreak),
          awardBlocked: false,
          awardPaused: false,
          awardWrongDayBlocked: false,
          awardPending: false,
          awardDuplicate: false,
          awardUnavailable: true,
          awardAttemptedToday: false,
          scoringFrozenAt: control.scoringFrozenAt,
        };
      }
      if (providedFingerprint && !mapped)
        this.db
          .prepare(
            "INSERT INTO problem_fingerprints(problem_id,fingerprint) VALUES(?,?)",
          )
          .run(input.problemId, providedFingerprint);
      // Missing keys are supported only before guard activation. They never
      // create a trusted global mapping that could conflict with real content.
      const fingerprint =
        knownFingerprint || unmappedQuestionFingerprint(input.problemId);
      const dayClaim = this.db
        .prepare(
          "SELECT first_correct_at FROM daily_content_receipts WHERE user_id=? AND fingerprint=? AND attempt_date=?",
        )
        .get(input.userId, fingerprint, input.date);
      const awardDuplicate = !!dayClaim;
      if (!dayClaim)
        this.db
          .prepare(
            "INSERT INTO daily_content_receipts(user_id,fingerprint,attempt_date,first_problem_id) VALUES(?,?,?,?)",
          )
          .run(input.userId, fingerprint, input.date, input.problemId);
      if (knownFingerprint)
        this.db
          .prepare(
            "INSERT INTO content_receipts(user_id,fingerprint,first_problem_id,first_seen_date) VALUES(?,?,?,?) ON CONFLICT(user_id,fingerprint) DO NOTHING",
          )
          .run(input.userId, fingerprint, input.problemId, input.date);
      const awardUnavailable =
        input.awardEligible === false || /^c[123][pt]\./.test(input.problemId);
      const gateEligible = !awardDuplicate && !awardUnavailable;
      if (!input.correct && !awardDuplicate)
        this.db
          .prepare(
            "INSERT INTO wrong_attempts(user_id,problem_id,wrong_date) VALUES(?,?,?) ON CONFLICT(user_id,problem_id,wrong_date) DO NOTHING",
          )
          .run(input.userId, input.problemId, input.date);
      const wrongToday = !!this.db
        .prepare(
          "SELECT 1 FROM wrong_attempts w LEFT JOIN problem_fingerprints f ON f.problem_id=w.problem_id WHERE w.user_id=? AND w.wrong_date=? AND (w.problem_id=? OR f.fingerprint=?)",
        )
        .get(input.userId, input.date, input.problemId, fingerprint);
      let pointsEarned = 0,
        awardBlocked = false,
        awardPaused = false;
      if (!input.correct) {
        if (gateEligible) {
          mistakes = Math.min(2, mistakes + 1);
          correctStreak = 0;
        }
      } else {
        if (gateEligible) {
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
        }
        if (control.scoringPaused) {
          pointsEarned = 0;
          awardPaused = true;
        }
        if (wrongToday) pointsEarned = 0;
        if (!receipt) {
          // New solves are learning receipts only. Every new financial credit
          // belongs to the append-only day ledger; legacy points stay final.
          this.db
            .prepare(
              "INSERT INTO solves(user_id,problem_id,level,points,solved_at,solved_date) VALUES(?,?,?,0,?,?)",
            )
            .run(
              input.userId,
              input.problemId,
              input.level,
              input.solvedAt,
              input.date,
            );
          this.db
            .prepare(
              "INSERT INTO solve_awards(user_id,problem_id,pending,award_date,awarded_at) VALUES(?,?,0,NULL,NULL)",
            )
            .run(input.userId, input.problemId);
        }
        if (!dayClaim?.first_correct_at)
          this.db
            .prepare(
              "UPDATE daily_content_receipts SET first_correct_at=?,correct_problem_id=? WHERE user_id=? AND fingerprint=? AND attempt_date=? AND first_correct_at IS NULL",
            )
            .run(
              input.solvedAt,
              input.problemId,
              input.userId,
              fingerprint,
              input.date,
            );
        if (pointsEarned > 0)
          this.db
            .prepare(
              "INSERT INTO daily_awards(user_id,fingerprint,award_date,problem_id,level,points,awarded_at) VALUES(?,?,?,?,?,?,?)",
            )
            .run(
              input.userId,
              fingerprint,
              input.date,
              input.problemId,
              input.level,
              pointsEarned,
              input.solvedAt,
            );
      }
      if (gateEligible)
        this.db
          .prepare(
            "UPDATE scoring_state SET mistakes=?,correct_streak=? WHERE user_id=?",
          )
          .run(mistakes, correctStreak, input.userId);
      const result = {
        pointsEarned,
        alreadySolved,
        scoring: scoringStatus(mistakes, correctStreak),
        awardBlocked,
        awardPaused,
        awardWrongDayBlocked: wrongToday,
        awardPending: false,
        awardDuplicate,
        awardUnavailable,
        awardAttemptedToday: true,
        scoringFrozenAt: control.scoringFrozenAt,
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
        "SELECT COALESCE(SUM(CASE WHEN v.user_id IS NULL THEN s.points ELSE 0 END),0) AS totalPoints, COALESCE(SUM(CASE WHEN COALESCE(a.award_date,s.solved_date) >= ? AND v.user_id IS NULL THEN s.points ELSE 0 END),0) AS weeklyPoints, COUNT(*) AS solvedCount FROM solves s LEFT JOIN solve_awards a ON a.user_id=s.user_id AND a.problem_id=s.problem_id LEFT JOIN scoring_voids v ON v.user_id=s.user_id AND v.problem_id=s.problem_id WHERE s.user_id = ?",
      )
      .get(weekStart, userId) as unknown as Pick<
      Stats,
      "totalPoints" | "weeklyPoints" | "solvedCount"
    >;
    const dailyPoints = this.db
      .prepare(
        "SELECT COALESCE(SUM(points),0) AS totalPoints,COALESCE(SUM(CASE WHEN award_date>=? THEN points ELSE 0 END),0) AS weeklyPoints FROM daily_awards WHERE user_id=?",
      )
      .get(weekStart, userId)!;
    const activity = this.db
      .prepare(
        `WITH activity_rows AS (
          SELECT solved_date AS date,COUNT(*) AS count,0 AS points FROM solves WHERE user_id=? GROUP BY solved_date
          UNION ALL
          SELECT a.award_date AS date,COUNT(*) AS count,0 AS points FROM solves s
          JOIN solve_awards a ON a.user_id=s.user_id AND a.problem_id=s.problem_id
          WHERE s.user_id=? AND a.award_date<>s.solved_date GROUP BY a.award_date
          UNION ALL
          SELECT d.attempt_date AS date,COUNT(*) AS count,0 AS points FROM daily_content_receipts d
          WHERE d.user_id=? AND d.first_correct_at IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM solves s
            LEFT JOIN problem_fingerprints f ON f.problem_id=s.problem_id
            LEFT JOIN solve_awards a ON a.user_id=s.user_id AND a.problem_id=s.problem_id
            WHERE s.user_id=d.user_id AND (f.fingerprint=d.fingerprint OR s.problem_id=d.correct_problem_id)
              AND (s.solved_date=d.attempt_date OR a.award_date=d.attempt_date)
          ) GROUP BY d.attempt_date
          UNION ALL
          SELECT COALESCE(a.award_date,s.solved_date) AS date,0 AS count,SUM(s.points) AS points FROM solves s
          LEFT JOIN solve_awards a ON a.user_id=s.user_id AND a.problem_id=s.problem_id
          LEFT JOIN scoring_voids v ON v.user_id=s.user_id AND v.problem_id=s.problem_id
          WHERE s.user_id=? AND s.points>0 AND v.user_id IS NULL GROUP BY COALESCE(a.award_date,s.solved_date)
          UNION ALL
          SELECT award_date AS date,0 AS count,SUM(points) AS points FROM daily_awards WHERE user_id=? GROUP BY award_date
        ) SELECT date,SUM(count) AS count,SUM(points) AS points FROM activity_rows GROUP BY date ORDER BY date`,
      )
      .all(
        userId,
        userId,
        userId,
        userId,
        userId,
      ) as unknown as Stats["activity"];
    const solvedIds = this.db
      .prepare(
        "SELECT problem_id FROM solves WHERE user_id = ? ORDER BY solved_at DESC",
      )
      .all(userId)
      .map((row) => String(row.problem_id));
    const wrongTodayIds = this.db
      .prepare(
        `WITH own_ids AS (
          SELECT problem_id FROM solves WHERE user_id=? UNION SELECT problem_id FROM wrong_attempts WHERE user_id=?
        ), today_wrong AS (
          SELECT w.problem_id,f.fingerprint FROM wrong_attempts w
          LEFT JOIN problem_fingerprints f ON f.problem_id=w.problem_id WHERE w.user_id=? AND w.wrong_date=?
        ) SELECT problem_id FROM today_wrong UNION SELECT o.problem_id FROM own_ids o
          JOIN problem_fingerprints f ON f.problem_id=o.problem_id
          WHERE f.fingerprint IN (SELECT fingerprint FROM today_wrong) ORDER BY problem_id`,
      )
      .all(userId, userId, userId, today)
      .map((row) => String(row.problem_id));
    const pendingAwardIds: string[] = [];
    const attemptedTodayContentIds = this.db
      .prepare(
        "SELECT fingerprint FROM daily_content_receipts WHERE user_id=? AND attempt_date=? ORDER BY fingerprint",
      )
      .all(userId, today)
      .map((row) => String(row.fingerprint));
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
        totalPoints:
          Number(aggregate.totalPoints) + Number(dailyPoints.totalPoints),
        weeklyPoints:
          Number(aggregate.weeklyPoints) + Number(dailyPoints.weeklyPoints),
        activity,
        solvedIds,
        wrongTodayIds,
        pendingAwardIds,
        attemptedTodayContentIds,
        levelCounts,
        streak: 0,
        scoring: scoringStatus(
          Number(state?.mistakes || 0),
          Number(state?.correct_streak || 0),
        ),
        ...this.currentControl(),
      },
      today,
    );
  }
  async rankings(
    userId: number | null,
    period: "all" | "week",
    weekStart: string,
  ): Promise<Leaderboard> {
    const query = `WITH legacy AS (
      SELECT s.user_id,COALESCE(SUM(CASE WHEN v.user_id IS NULL ${period === "week" ? "AND COALESCE(a.award_date,s.solved_date) >= ?" : ""} THEN s.points ELSE 0 END),0) AS points FROM solves s
      LEFT JOIN solve_awards a ON a.user_id=s.user_id AND a.problem_id=s.problem_id
      LEFT JOIN scoring_voids v ON v.user_id=s.user_id AND v.problem_id=s.problem_id GROUP BY s.user_id
    ), earned AS (
      SELECT user_id,SUM(points) AS points FROM daily_awards ${period === "week" ? "WHERE award_date>=?" : ""} GROUP BY user_id
    ), totals AS (
      SELECT u.id,u.username,COALESCE(l.points,0)+COALESCE(e.points,0) AS points FROM users u
      LEFT JOIN legacy l ON l.user_id=u.id LEFT JOIN earned e ON e.user_id=u.id
    ), ranked AS (SELECT *, RANK() OVER (ORDER BY points DESC) AS rank FROM totals)
    SELECT id, username, points, rank FROM ranked`;
    const parameters = period === "week" ? [weekStart, weekStart] : [];
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
  scoringControl() {
    return this.rpc<ScoringControl>("scoring_control", {});
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
