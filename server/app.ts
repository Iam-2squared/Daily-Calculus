import express from "express";
import cookieParser from "cookie-parser";
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { openDatabase } from "./db.ts";
import { getProblems, getProblem, publicProblem } from "./problems.ts";
import { addDays, isDateKey, todayJST, weekStartJST } from "../shared/date.ts";
import {
  LEVELS,
  type Level,
  type User,
  type Stats,
  type RankingEntry,
} from "../shared/types.ts";

const scrypt = promisify(scryptCallback);
const COOKIE = "daily_calculus_session";
const SESSION_AGE = 30 * 24 * 60 * 60 * 1000;
interface UserRow {
  id: number;
  username: string;
  created_at: string;
  password_hash: string;
  password_salt: string;
}
interface Options {
  now?: () => Date;
  secureCookies?: boolean;
}
const userView = (
  row: Pick<UserRow, "id" | "username" | "created_at">,
): User => ({ id: row.id, username: row.username, createdAt: row.created_at });
const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function createApp(
  databasePath = process.env.DATABASE_PATH || "data/daily-calculus.sqlite",
  options: Options = {},
) {
  const db = openDatabase(databasePath);
  const app = express();
  const now = options.now || (() => new Date());
  const secureCookies =
    options.secureCookies ??
    (process.env.COOKIE_SECURE === "true" ||
      (process.env.NODE_ENV === "production" &&
        process.env.COOKIE_SECURE !== "false"));
  app.locals.db = db;
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use(express.json({ limit: "8kb" }));
  app.use(cookieParser());
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use("/api", (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("Origin");
    let wrongOrigin = req.get("Sec-Fetch-Site") === "cross-site";
    if (origin) {
      try {
        wrongOrigin ||= new URL(origin).host !== req.get("Host");
      } catch {
        wrongOrigin = true;
      }
    }
    if (wrongOrigin)
      return void res
        .status(403)
        .json({ error: "この操作はアプリの画面から行ってください。" });
    next();
  });
  app.use("/api", (req, res, next) => {
    const token = req.cookies[COOKIE];
    if (typeof token === "string" && /^[a-f0-9]{64}$/.test(token)) {
      const row = db
        .prepare(
          `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
        )
        .get(tokenHash(token), now().getTime()) as unknown as
        UserRow | undefined;
      if (row) res.locals.user = userView(row);
    }
    next();
  });
  function setSession(res: express.Response, userId: number) {
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(
      now().getTime(),
    );
    db.prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)",
    ).run(tokenHash(token), userId, now().getTime() + SESSION_AGE);
    res.cookie(COOKIE, token, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      maxAge: SESSION_AGE,
      path: "/",
    });
  }

  // Both IP and account limits are needed because a four-digit PIN has a small key space.
  const attempts = new Map<string, { count: number; expires: number }>();
  function consumeLimit(key: string, maximum: number): boolean {
    const time = now().getTime();
    if (attempts.size > 10_000)
      for (const [key, value] of attempts)
        if (value.expires <= time) attempts.delete(key);
    const current = attempts.get(key);
    if (!current || current.expires <= time) {
      attempts.set(key, { count: 1, expires: time + 15 * 60 * 1000 });
      return true;
    }
    if (current.count >= maximum) return false;
    current.count++;
    return true;
  }
  function credentials(
    req: express.Request,
  ): { username: string; key: string; password: string } | null {
    if (
      typeof req.body?.username !== "string" ||
      typeof req.body?.password !== "string"
    )
      return null;
    const username = req.body.username.normalize("NFKC").trim();
    if (
      Array.from(username).length < 2 ||
      Array.from(username).length > 20 ||
      !/^[\p{L}\p{N}_.-]+$/u.test(username) ||
      !/^\d{4}$/.test(req.body.password)
    )
      return null;
    return {
      username,
      key: username.toLowerCase(),
      password: req.body.password,
    };
  }
  app.get("/api/session", (_req, res) =>
    res.json({ user: res.locals.user || null }),
  );
  app.post("/api/auth/register", async (req, res) => {
    if (!consumeLimit(`register:${req.ip}`, 10))
      return void res
        .status(429)
        .json({
          error:
            "操作の回数が多くなっています。15分ほど待ってからお試しください。",
        });
    const input = credentials(req);
    if (!input)
      return void res
        .status(400)
        .json({
          error:
            "ユーザーネームは2〜20文字の文字・数字・「_ . -」、パスワードは数字4桁で入力してください。",
        });
    if (
      db.prepare("SELECT id FROM users WHERE username_key = ?").get(input.key)
    )
      return void res
        .status(409)
        .json({ error: "このユーザーネームはすでに使われています。" });
    const salt = randomBytes(16).toString("hex");
    const hash = ((await scrypt(input.password, salt, 64)) as Buffer).toString(
      "hex",
    );
    try {
      const createdAt = now().toISOString();
      const result = db
        .prepare(
          "INSERT INTO users(username,username_key,password_hash,password_salt,created_at) VALUES (?,?,?,?,?)",
        )
        .run(input.username, input.key, hash, salt, createdAt);
      const id = Number(result.lastInsertRowid);
      setSession(res, id);
      res
        .status(201)
        .json({
          user: { id, username: input.username, createdAt } satisfies User,
        });
    } catch (error) {
      if (
        db.prepare("SELECT id FROM users WHERE username_key = ?").get(input.key)
      )
        return void res
          .status(409)
          .json({ error: "このユーザーネームはすでに使われています。" });
      throw error;
    }
  });
  app.post("/api/auth/login", async (req, res) => {
    const input = credentials(req);
    if (
      !consumeLimit(`login-ip:${req.ip}`, 30) ||
      (input && !consumeLimit(`login-user:${input.key}`, 5))
    ) {
      res.set("Retry-After", "900");
      return void res
        .status(429)
        .json({
          error:
            "ログインの試行回数を超えました。15分ほど待ってからお試しください。",
        });
    }
    if (!input)
      return void res
        .status(400)
        .json({
          error: "ユーザーネームと数字4桁のパスワードを入力してください。",
        });
    const row = db
      .prepare("SELECT * FROM users WHERE username_key = ?")
      .get(input.key) as unknown as UserRow | undefined;
    const hash = (await scrypt(
      input.password,
      row?.password_salt || "nonexistent-account",
      64,
    )) as Buffer;
    if (!row || !timingSafeEqual(hash, Buffer.from(row.password_hash, "hex")))
      return void res
        .status(401)
        .json({ error: "ユーザーネームまたはパスワードが違います。" });
    attempts.delete(`login-user:${input.key}`);
    setSession(res, row.id);
    res.json({ user: userView(row) });
  });
  app.post("/api/auth/logout", (req, res) => {
    if (typeof req.cookies[COOKIE] === "string")
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(
        tokenHash(req.cookies[COOKIE]),
      );
    res.clearCookie(COOKIE, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      path: "/",
    });
    res.json({ success: true });
  });
  function allowedDate(date: string): boolean {
    const today = todayJST(now());
    return isDateKey(date) && date <= today && date >= addDays(today, -365);
  }
  app.get("/api/problems", (req, res) => {
    const date =
      typeof req.query.date === "string" ? req.query.date : todayJST(now());
    if (!allowedDate(date))
      return void res
        .status(400)
        .json({ error: "今日から過去365日以内の日付を指定してください。" });
    res.json({ date, problems: getProblems(date).map(publicProblem) });
  });
  app.get("/api/archive", (req, res) => {
    const level = typeof req.query.level === "string" ? req.query.level : null;
    if (level && !Object.hasOwn(LEVELS, level))
      return void res.status(400).json({ error: "難易度を確認してください。" });
    const date = typeof req.query.date === "string" ? req.query.date : null;
    if (date && !allowedDate(date))
      return void res
        .status(400)
        .json({ error: "今日から過去365日以内の日付を指定してください。" });
    const dates = date
      ? [date]
      : Array.from({ length: 30 }, (_, i) => addDays(todayJST(now()), -i - 1));
    const problems = dates
      .flatMap((date) => getProblems(date))
      .filter((p) => !level || p.level === level)
      .map(publicProblem);
    res.json({ problems });
  });
  app.post("/api/problems/:id/answer", (req, res) => {
    const problem = getProblem(String(req.params.id));
    if (!problem || !allowedDate(problem.date))
      return void res
        .status(404)
        .json({ error: "問題が見つかりませんでした。" });
    const choice = req.body?.choiceIndex;
    if (
      !Number.isInteger(choice) ||
      choice < 0 ||
      choice >= problem.choices.length
    )
      return void res.status(400).json({ error: "解答を1つ選んでください。" });
    const user: User | undefined = res.locals.user;
    const correct = choice === problem.correctIndex;
    const alreadySolved =
      !!user &&
      !!db
        .prepare("SELECT 1 FROM solves WHERE user_id = ? AND problem_id = ?")
        .get(user.id, problem.id);
    let pointsEarned = 0;
    if (correct && user && !alreadySolved) {
      const result = db
        .prepare(
          "INSERT OR IGNORE INTO solves(user_id,problem_id,level,points,solved_at,solved_date) VALUES (?,?,?,?,?,?)",
        )
        .run(
          user.id,
          problem.id,
          problem.level,
          LEVELS[problem.level].points,
          now().toISOString(),
          todayJST(now()),
        );
      if (result.changes) pointsEarned = LEVELS[problem.level].points;
    }
    res.json({
      correct,
      correctIndex: problem.correctIndex,
      explanation: problem.explanation,
      explanationFormulas: problem.explanationFormulas,
      pointsEarned,
      alreadySolved,
    });
  });
  app.get("/api/stats", (_req, res) => {
    const user: User | undefined = res.locals.user;
    const empty: Stats = {
      totalPoints: 0,
      weeklyPoints: 0,
      solvedCount: 0,
      streak: 0,
      activity: [],
      solvedIds: [],
      levelCounts: { basic: 0, applied: 0, advanced: 0 },
    };
    if (!user) return void res.json(empty);
    const week = weekStartJST(now());
    const aggregate = db
      .prepare(
        "SELECT COALESCE(SUM(points),0) AS totalPoints, COALESCE(SUM(CASE WHEN solved_date >= ? THEN points ELSE 0 END),0) AS weeklyPoints, COUNT(*) AS solvedCount FROM solves WHERE user_id = ?",
      )
      .get(week, user.id) as unknown as Pick<
      Stats,
      "totalPoints" | "weeklyPoints" | "solvedCount"
    >;
    const activity = db
      .prepare(
        "SELECT solved_date AS date, COUNT(*) AS count, SUM(points) AS points FROM solves WHERE user_id = ? GROUP BY solved_date ORDER BY solved_date",
      )
      .all(user.id) as unknown as Stats["activity"];
    const solvedIds = db
      .prepare(
        "SELECT problem_id FROM solves WHERE user_id = ? ORDER BY solved_at DESC",
      )
      .all(user.id)
      .map((row) => String(row.problem_id));
    const levelCounts = { basic: 0, applied: 0, advanced: 0 };
    for (const row of db
      .prepare(
        "SELECT level,COUNT(*) AS count FROM solves WHERE user_id = ? GROUP BY level",
      )
      .all(user.id))
      levelCounts[row.level as Level] = Number(row.count);
    const activityDates = new Set(activity.map((day) => day.date));
    let cursor = todayJST(now());
    if (!activityDates.has(cursor)) cursor = addDays(cursor, -1);
    let streak = 0;
    while (activityDates.has(cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
    }
    res.json({
      ...aggregate,
      activity,
      solvedIds,
      levelCounts,
      streak,
    } satisfies Stats);
  });
  app.get("/api/rankings", (req, res) => {
    const period = req.query.period === "week" ? "week" : "all";
    const weekStart = weekStartJST(now());
    const user: User | undefined = res.locals.user;
    const query = `WITH totals AS (
      SELECT u.id, u.username, u.username_key, COALESCE(SUM(s.points),0) AS points FROM users u
      LEFT JOIN solves s ON s.user_id = u.id ${period === "week" ? "AND s.solved_date >= ?" : ""}
      GROUP BY u.id
    ), ranked AS (SELECT *, RANK() OVER (ORDER BY points DESC) AS rank FROM totals)
    SELECT id, username, points, rank FROM ranked`;
    const parameters = period === "week" ? [weekStart] : [];
    const rows = db
      .prepare(
        `${query} ORDER BY points DESC, username COLLATE NOCASE, id LIMIT 25`,
      )
      .all(...parameters);
    const view = (row: Record<string, unknown>): RankingEntry => ({
      rank: Number(row.rank),
      username: String(row.username),
      points: Number(row.points),
      isYou: row.id === user?.id,
    });
    const entries = rows.map((row) => view(row));
    const own = user
      ? db.prepare(`${query} WHERE id = ?`).get(...parameters, user.id)
      : null;
    const totalUsers = Number(
      db.prepare("SELECT COUNT(*) AS count FROM users").get()?.count || 0,
    );
    res.json({
      entries,
      me: own ? view(own) : null,
      totalUsers,
      period,
      weekStart,
    });
  });
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "ページが見つかりませんでした。" });
  });
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.set("Cache-Control", "no-store");
      if (
        error instanceof URIError ||
        (error instanceof SyntaxError && "body" in error)
      )
        return void res
          .status(400)
          .json({ error: "送信内容を確認してください。" });
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === 413
      )
        return void res.status(413).json({ error: "送信内容が大きすぎます。" });
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === 415
      )
        return void res
          .status(415)
          .json({ error: "送信内容の文字コードを確認してください。" });
      console.error(
        "API error:",
        error instanceof Error ? error.message : "Unknown error",
      );
      res
        .status(500)
        .json({
          error: "処理に失敗しました。時間をおいてもう一度お試しください。",
        });
    },
  );
  return app;
}
