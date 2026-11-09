import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type TestContext } from "node:test";
import { createApp } from "../server/app.js";
import { Challenges } from "../server/challenges.js";
import { questionFingerprint } from "../server/question-identity.js";
import type { SqliteStore } from "../server/store.js";
import type {
  AnswerResult,
  Level,
  PrivateProblem,
  Stats,
} from "../shared/types.js";

const DAY = "2026-11-08";
type Account = { id: number; cookie: string };
type DailyAnswer = AnswerResult & { awardAttemptedToday: boolean };
type DailyStats = Stats & { attemptedTodayContentIds: string[] };

// The exact mathematical question that received two awards under distinct c3
// IDs in the prior local reproduction. No random collision search is needed.
function acceleration(b = 1): Omit<PrivateProblem, "id" | "level" | "date"> {
  const value = 36 + 2 * b;
  return {
    title: "位置から加速度を求める",
    topic: "二階微分と運動",
    estimatedMinutes: 4,
    prompt:
      "直線上を動く物体の位置 s(t) が次の式で与えられます。t = 2 秒での加速度を求めてください。位置の単位は m、答えの単位は m/s² です。",
    formula: `s(t)=3t^3+${b === 1 ? "t^2" : `${b}t^2`}`,
    choices: [`${value}`, `${value + 2}`, `${value - 2}`, `${value / 2}`],
    correctIndex: 0,
    hint: "位置を2回微分します。",
    explanation: ["二階導関数を時刻2で評価します。"],
    explanationFormulas: [`s''(2)=${value}`],
  };
}

async function harness(t: TestContext, setup?: (path: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), "calculus-content-api-"));
  const path = join(directory, "content.sqlite");
  let instant = new Date(`${DAY}T05:00:00Z`);
  let app: ReturnType<typeof createApp>;
  let server: Server | undefined;
  let base = "";
  let sequence = 0;
  const syncCalls: number[] = [];
  const issued = new Map<string, { owner: number; problem: PrivateProblem }>();
  // Issuance/signature secrecy is covered by secure-issuance.test.ts. Here the
  // trusted resolver supplies authored mathematics, so the real answer API,
  // fingerprint calculation, transactions and wallet eligibility are isolated.
  t.mock.method(
    Challenges.prototype,
    "resolve",
    (id: string, userId: number) => {
      const binding = issued.get(id);
      assert.ok(binding, "only authored server fixtures may be resolved");
      assert.equal(binding.owner, userId);
      return structuredClone(binding.problem);
    },
  );
  async function start() {
    app = createApp(path, {
      now: () => instant,
      secureCookies: false,
      integration: {
        targetSecret: "content-api-wallet-" + "t".repeat(40),
        targetUrl: "https://wallet.example",
        request: async (input, init) => {
          assert.equal(
            new URL(String(input)).pathname,
            "/api/integrations/calculus/sync",
          );
          syncCalls.push(JSON.parse(String(init?.body)).userId);
          return new Response(
            JSON.stringify({
              linked: false,
              conversionRate: 10000,
              member: null,
              balance: null,
              totalIncome: null,
              calculusIncome: null,
              syncPending: false,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        },
      },
    });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  async function stop() {
    if (!server) return;
    const active = server;
    server = undefined;
    await new Promise<void>((done, reject) =>
      active.close((error) => (error ? reject(error) : done())),
    );
    app.locals.db.close();
  }
  t.after(async () => {
    try {
      await stop();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  setup?.(path);
  await start();
  async function request(endpoint: string, body?: unknown, owner?: Account) {
    const response = await fetch(base + endpoint, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/json",
        ...(owner ? { Cookie: owner.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.ok(response.ok, `${response.status}: ${endpoint}`);
    return {
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  return {
    syncCalls,
    request,
    setInstant(value: string) {
      instant = new Date(value);
    },
    pause(paused: boolean) {
      app.locals.db
        .prepare("UPDATE scoring_control SET paused=? WHERE singleton=1")
        .run(Number(paused));
    },
    get store() {
      return app.locals.store as SqliteStore;
    },
    setDate(date: string) {
      instant = new Date(`${date}T05:00:00Z`);
    },
    restart: async () => {
      await stop();
      await start();
    },
    async register(username: string, login = false): Promise<Account> {
      const result = await request(
        `/api/auth/${login ? "login" : "register"}`,
        {
          username,
          password: "4916",
        },
      );
      assert.ok(result.cookie);
      return { id: result.body.user.id, cookie: result.cookie };
    },
    bind(
      owner: Account,
      options: {
        b?: number;
        level?: Level;
        date?: string;
        prefix?: string;
        reverse?: boolean;
        id?: string;
      } = {},
    ) {
      const level = options.level ?? "basic",
        date = options.date ?? DAY;
      const code = { basic: "b", applied: "a", advanced: "h" }[level];
      const day = Math.floor(
        Date.parse(`${date}T00:00:00Z`) / 86400000,
      ).toString(36);
      const nonce = (++sequence).toString(16).padStart(16, "0");
      const id =
        options.id ??
        `${options.prefix ?? "c4p"}.${code}.${day}.${owner.id.toString(36)}.${nonce}.-.${"A".repeat(22)}`;
      const math = acceleration(options.b);
      const problem: PrivateProblem = {
        ...math,
        id,
        level,
        date,
        choices: options.reverse ? math.choices.toReversed() : math.choices,
        correctIndex: options.reverse ? 3 : 0,
      };
      issued.set(id, { owner: owner.id, problem });
      return problem;
    },
    async answer(
      owner: Account,
      problem: PrivateProblem,
      correct = true,
      extra: Record<string, unknown> = {},
    ): Promise<DailyAnswer> {
      return (
        await request(
          `/api/problems/${encodeURIComponent(problem.id)}/answer`,
          {
            choiceIndex: correct
              ? problem.correctIndex
              : (problem.correctIndex + 1) % 4,
            ...extra,
          },
          owner,
        )
      ).body;
    },
    async stats(owner: Account): Promise<DailyStats> {
      return (await request("/api/stats", undefined, owner)).body;
    },
    async lifetime(owner: Account) {
      return (
        await (app.locals.store as SqliteStore).lifetimeTotals([owner.id])
      )[0].totalPoints;
    },
  };
}

test("one JST millisecond opens exactly one new same-ID daily award without changing first learning or replaying wallet credit", async (t) => {
  const h = await harness(t);
  const owner = await h.register("daily_midnight");
  const problem = h.bind(owner);
  const fingerprint = questionFingerprint(problem);
  h.setInstant("2026-11-08T14:59:59.999Z");
  const first = await h.answer(owner, problem);
  assert.equal(first.pointsEarned, 1);
  assert.equal(first.alreadySolved, false);
  assert.equal(first.awardAttemptedToday, true);
  assert.equal((await h.answer(owner, problem)).pointsEarned, 0);
  assert.deepEqual((await h.stats(owner)).attemptedTodayContentIds, [
    fingerprint,
  ]);
  const firstLearning = h.store.db
    .prepare("SELECT * FROM solves WHERE user_id=?")
    .get(owner.id);
  assert.equal(
    firstLearning!.points,
    0,
    "all new money belongs in the daily award ledger",
  );
  const originalAward = h.store.db
    .prepare("SELECT * FROM daily_awards WHERE user_id=?")
    .get(owner.id);
  await h.restart();
  assert.deepEqual((await h.stats(owner)).attemptedTodayContentIds, [
    fingerprint,
  ]);
  h.setInstant("2026-11-08T15:00:00.000Z");
  assert.deepEqual((await h.stats(owner)).attemptedTodayContentIds, []);
  const concurrent = await Promise.all(
    Array.from({ length: 12 }, () => h.answer(owner, problem)),
  );
  assert.equal(
    concurrent.reduce((sum, answer) => sum + answer.pointsEarned, 0),
    1,
  );
  assert.ok(concurrent.every((answer) => answer.alreadySolved));
  assert.ok(concurrent.every((answer) => answer.awardAttemptedToday));
  assert.equal(concurrent.filter((answer) => !answer.awardDuplicate).length, 1);
  assert.deepEqual(h.syncCalls, [owner.id, owner.id]);
  assert.equal(await h.lifetime(owner), 2);
  assert.deepEqual(
    h.store.db.prepare("SELECT * FROM solves WHERE user_id=?").get(owner.id),
    firstLearning,
  );
  const stats = await h.stats(owner);
  assert.equal(stats.totalPoints, 2);
  assert.equal(stats.weeklyPoints, 1);
  assert.equal(stats.solvedCount, 1);
  assert.deepEqual(stats.levelCounts, { basic: 1, applied: 0, advanced: 0 });
  assert.deepEqual(stats.activity, [
    { date: "2026-11-08", count: 1, points: 1 },
    { date: "2026-11-09", count: 1, points: 1 },
  ]);
  assert.equal(stats.streak, 2);
  await h.restart();
  assert.equal((await h.answer(owner, problem)).pointsEarned, 0);
  h.setDate("2026-11-10");
  assert.equal((await h.answer(owner, problem)).pointsEarned, 1);
  assert.equal(await h.lifetime(owner), 3);
  assert.equal(h.syncCalls.length, 3);
  const awards = h.store.db
    .prepare("SELECT * FROM daily_awards WHERE user_id=?")
    .all(owner.id);
  assert.equal(awards.length, 3);
  assert.ok(
    awards.some(
      (award) => JSON.stringify(award) === JSON.stringify(originalAward),
    ),
    "the first daily award stays unchanged",
  );
  assert.deepEqual(
    h.store.db.prepare("SELECT * FROM solves WHERE user_id=?").get(owner.id),
    firstLearning,
  );
});

test("a first wrong attempt consumes only today's content claim across aliases, choices and levels, while tomorrow and another user remain eligible", async (t) => {
  const h = await harness(t);
  const owner = await h.register("daily_wrong_first");
  const other = await h.register("daily_other_user");
  const first = h.bind(owner);
  const fingerprint = questionFingerprint(first);
  const wrong = await h.answer(owner, first, false);
  assert.equal(wrong.awardAttemptedToday, true);
  assert.equal(wrong.scoring!.mistakes, 1);
  const alias = h.bind(owner, {
    level: "advanced",
    reverse: true,
    prefix: "c4t",
  });
  for (const problem of [first, alias]) {
    const corrected = await h.answer(owner, problem);
    assert.equal(corrected.pointsEarned, 0);
    assert.equal(corrected.awardDuplicate, true);
    assert.equal(corrected.awardAttemptedToday, true);
    assert.equal(corrected.scoring!.correctStreak, 0);
  }
  assert.equal(
    (await h.answer(other, h.bind(other, { level: "advanced" }))).pointsEarned,
    5,
  );
  assert.deepEqual((await h.stats(owner)).attemptedTodayContentIds, [
    fingerprint,
  ]);
  await h.restart();
  h.setDate("2026-11-09");
  const nextDay = await h.answer(owner, first);
  assert.equal(nextDay.pointsEarned, 1);
  assert.equal(nextDay.alreadySolved, true);
  assert.equal(nextDay.awardDuplicate, false);
  assert.equal(nextDay.awardAttemptedToday, true);
  assert.equal((await h.answer(owner, alias)).pointsEarned, 0);
  assert.equal(await h.lifetime(owner), 1);
  assert.equal(await h.lifetime(other), 5);
  assert.equal(h.syncCalls.filter((id) => id === owner.id).length, 1);
  assert.deepEqual((await h.stats(owner)).activity, [
    { date: DAY, count: 2, points: 0 },
    { date: "2026-11-09", count: 1, points: 1 },
  ]);
});

test("fresh content counts for recovery once per day and a paused first attempt can earn again on a later day", async (t) => {
  const h = await harness(t);
  const owner = await h.register("daily_gate_pause");
  await h.answer(owner, h.bind(owner), false);
  await h.answer(owner, h.bind(owner, { b: 2 }), false);
  const recovery = h.bind(owner, { b: 3 });
  const first = await h.answer(owner, recovery);
  assert.equal(first.scoring!.correctStreak, 1);
  assert.equal(first.pointsEarned, 0);
  assert.equal(
    (await h.answer(owner, h.bind(owner, { b: 3 }))).scoring!.correctStreak,
    1,
  );
  h.setDate("2026-11-09");
  const second = await h.answer(owner, recovery);
  assert.equal(second.alreadySolved, true);
  assert.equal(second.awardDuplicate, false);
  assert.equal(second.scoring!.correctStreak, 2);
  assert.equal(second.pointsEarned, 0);
  assert.equal((await h.answer(owner, recovery)).scoring!.correctStreak, 2);
  const third = await h.answer(
    owner,
    h.bind(owner, { b: 4, level: "advanced" }),
  );
  assert.equal(third.pointsEarned, 5);
  assert.equal(third.scoring!.locked, false);
  h.pause(true);
  const pausedQuestion = h.bind(owner, { b: 5 });
  const paused = await h.answer(owner, pausedQuestion);
  assert.equal(paused.pointsEarned, 0);
  assert.equal(paused.awardPaused, true);
  assert.equal(paused.awardAttemptedToday, true);
  h.pause(false);
  assert.equal((await h.answer(owner, pausedQuestion)).pointsEarned, 0);
  h.setDate("2026-11-10");
  const afterPause = await h.answer(owner, pausedQuestion);
  assert.equal(afterPause.pointsEarned, 1);
  assert.equal(afterPause.alreadySolved, true);
  assert.equal(await h.lifetime(owner), 6);
  assert.equal(h.syncCalls.length, 2);
});

test("all known historical dates become day claims without retrocredit, while a new-day credit never resurrects a voided legacy receipt", async (t) => {
  const historicalId = "c4p.b.g0o.h.0000000000000001.-." + "A".repeat(22);
  const fingerprint = questionFingerprint(acceleration());
  let original!: { receipt: unknown; voided: unknown; oldAward: unknown };
  const h = await harness(t, (path) => {
    // Install actual pre-ledger data before the new positive-solve INSERT guard
    // exists. The test never removes or bypasses the new database protection.
    const legacy = new DatabaseSync(path);
    try {
      legacy.exec(`
        CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL,username_key TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE solves(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,problem_id TEXT NOT NULL,
          level TEXT NOT NULL,points INTEGER NOT NULL CHECK(points IN(0,1,3,5)),solved_at TEXT NOT NULL,solved_date TEXT NOT NULL,
          PRIMARY KEY(user_id,problem_id));
        CREATE TABLE problem_fingerprints(problem_id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL);
        CREATE TABLE solve_awards(user_id INTEGER NOT NULL,problem_id TEXT NOT NULL,pending INTEGER NOT NULL,
          award_date TEXT,awarded_at TEXT,PRIMARY KEY(user_id,problem_id));
        CREATE TABLE wrong_attempts(user_id INTEGER NOT NULL,problem_id TEXT NOT NULL,wrong_date TEXT NOT NULL,
          PRIMARY KEY(user_id,problem_id,wrong_date));
        CREATE TABLE content_receipts(user_id INTEGER NOT NULL,fingerprint TEXT NOT NULL,first_problem_id TEXT NOT NULL,
          first_seen_date TEXT NOT NULL,PRIMARY KEY(user_id,fingerprint));
        CREATE TABLE scoring_voids(user_id INTEGER NOT NULL,problem_id TEXT NOT NULL,original_points INTEGER NOT NULL,
          reason TEXT NOT NULL,voided_at TEXT NOT NULL,PRIMARY KEY(user_id,problem_id));
      `);
      const salt = "a".repeat(32);
      legacy
        .prepare("INSERT INTO users VALUES(17,?,?,?,?,?)")
        .run(
          "daily_history",
          "daily_history",
          scryptSync("4916", salt, 64).toString("hex"),
          salt,
          "2026-11-03T00:00:00Z",
        );
      legacy
        .prepare("INSERT INTO problem_fingerprints VALUES(?,?)")
        .run(historicalId, fingerprint);
      legacy
        .prepare("INSERT INTO solves VALUES(?,?,?,?,?,?)")
        .run(
          17,
          historicalId,
          "basic",
          1,
          "2026-11-04T05:00:00Z",
          "2026-11-04",
        );
      legacy
        .prepare("INSERT INTO solve_awards VALUES(?,?,?,?,?)")
        .run(17, historicalId, 0, "2026-11-05", "2026-11-05T05:00:00Z");
      legacy
        .prepare("INSERT INTO wrong_attempts VALUES(?,?,?)")
        .run(17, historicalId, "2026-11-06");
      legacy
        .prepare("INSERT INTO content_receipts VALUES(?,?,?,?)")
        .run(17, fingerprint, historicalId, "2026-11-03");
      legacy
        .prepare("INSERT INTO scoring_voids VALUES(?,?,?,?,?)")
        .run(
          17,
          historicalId,
          1,
          "existing authorized correction",
          "2026-11-07T05:00:00Z",
        );
      original = {
        receipt: legacy.prepare("SELECT * FROM solves").get(),
        voided: legacy.prepare("SELECT * FROM scoring_voids").get(),
        oldAward: legacy.prepare("SELECT * FROM solve_awards").get(),
      };
    } finally {
      legacy.close();
    }
  });
  const owner = await h.register("daily_history", true);
  const old = h.bind(owner, { date: "2026-11-03", id: historicalId });
  const { receipt, voided, oldAward } = original;
  assert.equal(await h.lifetime(owner), 1);
  await h.restart();
  assert.equal((await h.stats(owner)).totalPoints, 0);
  assert.equal(
    h.store.db
      .prepare("SELECT COUNT(*) n FROM daily_awards WHERE user_id=?")
      .get(owner.id)!.n,
    0,
  );
  for (const date of ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]) {
    h.setDate(date);
    assert.deepEqual(
      (await h.stats(owner)).attemptedTodayContentIds,
      [fingerprint],
      date,
    );
    const replay = await h.answer(owner, old);
    assert.equal(replay.pointsEarned, 0, date);
    assert.equal(replay.awardDuplicate, true, date);
  }
  assert.equal(await h.lifetime(owner), 1);
  assert.equal(h.syncCalls.length, 0);
  h.setDate("2026-11-07");
  assert.deepEqual((await h.stats(owner)).attemptedTodayContentIds, []);
  const newAward = await h.answer(owner, old);
  assert.equal(newAward.pointsEarned, 1);
  assert.equal(newAward.alreadySolved, true);
  assert.equal((await h.stats(owner)).totalPoints, 1);
  assert.equal(await h.lifetime(owner), 2);
  assert.deepEqual(h.syncCalls, [owner.id]);
  assert.deepEqual(
    h.store.db.prepare("SELECT * FROM solves WHERE user_id=?").get(owner.id),
    receipt,
  );
  assert.deepEqual(
    h.store.db
      .prepare("SELECT * FROM scoring_voids WHERE user_id=?")
      .get(owner.id),
    voided,
  );
  assert.deepEqual(
    h.store.db
      .prepare("SELECT * FROM solve_awards WHERE user_id=?")
      .get(owner.id),
    oldAward,
  );
  await h.restart();
  assert.equal((await h.answer(owner, old)).pointsEarned, 0);
  assert.equal(await h.lifetime(owner), 2);
  assert.equal(h.syncCalls.length, 1);
});

test("public content IDs, strict unknown-payload guards and unranked legacy attempts preserve the daily first-attempt rule", async (t) => {
  const h = await harness(t);
  const owner = await h.register("daily_guard");
  const daily = (await h.request("/api/problems", undefined, owner)).body
    .problems;
  for (const problem of daily)
    assert.equal(problem.contentId, questionFingerprint(problem));
  h.store.db.exec("UPDATE content_guard SET enabled=1 WHERE singleton=1");
  const unknown = await h.store.recordSolve({
    userId: owner.id,
    problemId: "unknown-old-server",
    level: "basic",
    points: 1,
    correct: true,
    date: DAY,
    solvedAt: `${DAY}T05:00:00Z`,
  });
  assert.equal(unknown.pointsEarned, 0);
  assert.equal(unknown.awardUnavailable, true);
  assert.equal((unknown as DailyAnswer).awardAttemptedToday, false);
  assert.equal((await h.stats(owner)).solvedCount, 0);
  assert.deepEqual((await h.stats(owner)).attemptedTodayContentIds, []);
  assert.equal(
    h.store.db.prepare("SELECT COUNT(*) n FROM daily_content_receipts").get()!
      .n,
    0,
  );
  const legacy = h.bind(owner, { prefix: "c3p" });
  const oldAttempt = await h.answer(owner, legacy, false);
  assert.equal(oldAttempt.awardUnavailable, true);
  assert.equal(oldAttempt.awardAttemptedToday, true);
  assert.equal(oldAttempt.scoring!.mistakes, 0);
  h.setDate("2026-11-09");
  assert.equal((await h.answer(owner, legacy)).pointsEarned, 0);
  assert.equal((await h.answer(owner, h.bind(owner))).pointsEarned, 0);
  h.setDate("2026-11-10");
  const ranked = await h.answer(owner, h.bind(owner), true, {
    contentFingerprint: "f".repeat(64),
    awardEligible: true,
  });
  assert.equal(ranked.pointsEarned, 1);
  assert.equal(ranked.awardAttemptedToday, true);
  assert.equal(await h.lifetime(owner), 1);
  assert.deepEqual(h.syncCalls, [owner.id]);
});
