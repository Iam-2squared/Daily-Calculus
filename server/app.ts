import express from "express";
import cookieParser from "cookie-parser";
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import {
  configuredStore,
  publicUser,
  emptyStats,
  type Store,
} from "./store.ts";
import { getProblems, getProblem, publicProblem } from "./problems.ts";
import { addDays, isDateKey, todayJST, weekStartJST } from "../shared/date.ts";
import { LEVELS, type User } from "../shared/types.ts";

const scrypt = promisify(scryptCallback);
const COOKIE = "daily_calculus_session";
const SESSION_AGE = 30 * 24 * 60 * 60 * 1000;
interface Options {
  now?: () => Date;
  secureCookies?: boolean;
  store?: Store;
}
const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function createApp(databasePath?: string, options: Options = {}) {
  const store = options.store || configuredStore(databasePath);
  const app = express();
  const now = options.now || (() => new Date());
  const secureCookies =
    options.secureCookies ??
    (process.env.COOKIE_SECURE === "true" ||
      (process.env.NODE_ENV === "production" &&
        process.env.COOKIE_SECURE !== "false"));
  app.locals.db = store.db;
  app.locals.store = store;
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  // Vercel replaces this header at its edge; never trust it on a standalone server.
  const clientIp = (req: express.Request) =>
    process.env.VERCEL === "1"
      ? req.get("x-vercel-forwarded-for")?.split(",")[0].trim() ||
        req.ip ||
        "unknown"
      : req.ip || "unknown";
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
  app.use("/api", async (req, res, next) => {
    const token = req.cookies[COOKIE];
    if (typeof token === "string" && /^[a-f0-9]{64}$/.test(token)) {
      const user = await store.sessionUser(tokenHash(token), now().getTime());
      if (user) res.locals.user = user;
    }
    next();
  });
  async function setSession(res: express.Response, userId: number) {
    const token = randomBytes(32).toString("hex");
    await store.createSession(
      tokenHash(token),
      userId,
      now().getTime() + SESSION_AGE,
      now().getTime(),
    );
    res.cookie(COOKIE, token, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      maxAge: SESSION_AGE,
      path: "/",
    });
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
    if (
      !(await store.consumeLimit(
        `register:${clientIp(req)}`,
        10,
        now().getTime(),
      ))
    )
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
    if (await store.userByKey(input.key))
      return void res
        .status(409)
        .json({ error: "このユーザーネームはすでに使われています。" });
    const salt = randomBytes(16).toString("hex");
    const hash = ((await scrypt(input.password, salt, 64)) as Buffer).toString(
      "hex",
    );
    const user = await store.createUser({
      username: input.username,
      key: input.key,
      hash,
      salt,
      createdAt: now().toISOString(),
    });
    if (!user)
      return void res
        .status(409)
        .json({ error: "このユーザーネームはすでに使われています。" });
    await setSession(res, user.id);
    res.status(201).json({ user: publicUser(user) });
  });
  app.post("/api/auth/login", async (req, res) => {
    const input = credentials(req);
    if (
      !(await store.consumeLimit(
        `login-ip:${clientIp(req)}`,
        30,
        now().getTime(),
      )) ||
      (input &&
        !(await store.consumeLimit(
          `login-user:${input.key}`,
          5,
          now().getTime(),
        )))
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
    const row = await store.userByKey(input.key);
    const hash = (await scrypt(
      input.password,
      row?.password_salt || "nonexistent-account",
      64,
    )) as Buffer;
    if (!row || !timingSafeEqual(hash, Buffer.from(row.password_hash, "hex")))
      return void res
        .status(401)
        .json({ error: "ユーザーネームまたはパスワードが違います。" });
    await store.clearLimit(`login-user:${input.key}`);
    await setSession(res, row.id);
    res.json({ user: publicUser(row) });
  });
  app.post("/api/auth/logout", async (req, res) => {
    if (typeof req.cookies[COOKIE] === "string")
      await store.deleteSession(tokenHash(req.cookies[COOKIE]));
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
    res.json({
      problems: dates
        .flatMap((date) => getProblems(date))
        .filter((p) => !level || p.level === level)
        .map(publicProblem),
    });
  });
  app.post("/api/problems/:id/answer", async (req, res) => {
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
    const result = user
      ? await store.recordSolve({
          userId: user.id,
          problemId: problem.id,
          level: problem.level,
          points: LEVELS[problem.level].points,
          solvedAt: now().toISOString(),
          date: todayJST(now()),
          correct,
        })
      : { pointsEarned: 0, alreadySolved: false };
    res.json({
      correct,
      correctIndex: problem.correctIndex,
      explanation: problem.explanation,
      explanationFormulas: problem.explanationFormulas,
      ...result,
    });
  });
  app.get("/api/stats", async (_req, res) => {
    const user: User | undefined = res.locals.user;
    res.json(
      user
        ? await store.stats(user.id, weekStartJST(now()), todayJST(now()))
        : emptyStats(),
    );
  });
  app.get("/api/rankings", async (req, res) => {
    const period = req.query.period === "week" ? "week" : "all";
    const user: User | undefined = res.locals.user;
    res.json(
      await store.rankings(user?.id || null, period, weekStartJST(now())),
    );
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
