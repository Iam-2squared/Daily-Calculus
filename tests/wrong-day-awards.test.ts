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
import { getProblem, getProblems } from "../server/problems.js";
import type { SolveInput } from "../server/store.js";
import type {
  AnswerResult,
  Level,
  PrivateProblem,
  Stats,
} from "../shared/types.js";

const BEFORE_MIDNIGHT = "2026-11-08T14:59:59.999Z";
const AFTER_MIDNIGHT = "2026-11-08T15:00:00.000Z";
const PASSWORD = "4916";
type Account = { id: number; cookie: string };
const question = (date: string, level: Level) =>
  getProblems(date).find((problem) => problem.level === level)!;
const canonical = (problem: PrivateProblem) => problem.rewardId ?? problem.id;
const oldVersion = (problem: PrivateProblem) => getProblem(canonical(problem))!;

async function harness(t: TestContext, setup?: (path: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), "calculus-wrong-day-api-"));
  const path = join(directory, "study.sqlite");
  let instant = new Date(BEFORE_MIDNIGHT);
  let app: ReturnType<typeof createApp>;
  let server: Server | undefined;
  let base = "";
  const syncCalls: number[] = [];
  async function start() {
    app = createApp(path, {
      now: () => instant,
      secureCookies: false,
      integration: {
        targetSecret: "wrong-day-wallet-test-" + "t".repeat(40),
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
  async function request(pathname: string, body?: unknown, account?: Account) {
    const response = await fetch(base + pathname, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/json",
        ...(account ? { Cookie: account.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.ok(response.ok, `${response.status}: ${pathname}`);
    return {
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  async function authenticate(
    username: string,
    login = false,
  ): Promise<Account> {
    const response = await request(
      `/api/auth/${login ? "login" : "register"}`,
      { username, password: PASSWORD },
    );
    assert.ok(response.cookie);
    return { id: response.body.user.id, cookie: response.cookie };
  }
  return {
    request,
    authenticate,
    syncCalls,
    setTime: (value: string) => {
      instant = new Date(value);
    },
    restart: async () => {
      await stop();
      await start();
    },
    answer: async (
      account: Account,
      problem: PrivateProblem,
      correct = true,
    ): Promise<AnswerResult> =>
      (
        await request(
          `/api/problems/${encodeURIComponent(problem.id)}/answer`,
          {
            choiceIndex: correct
              ? problem.correctIndex
              : (problem.correctIndex + 1) % 4,
          },
          account,
        )
      ).body,
    stats: async (account: Account): Promise<Stats> =>
      (await request("/api/stats", undefined, account)).body,
    lifetime: async (account: Account) =>
      (await app.locals.store.lifetimeTotals([account.id]))[0]
        .totalPoints as number,
    pause: (paused: boolean) =>
      app.locals.db
        .prepare(
          "UPDATE scoring_control SET paused=?,frozen_at=? WHERE singleton=1",
        )
        .run(Number(paused), paused ? "2026-11-08T23:00:00.000Z" : null),
    record: (input: SolveInput) => app.locals.store.recordSolve(input),
  };
}

test("a wrong-then-correct receipt stays zero today but earns once per later JST day across restarts and concurrent aliases", async (t) => {
  const h = await harness(t);
  const owner = await h.authenticate("midnight_award");
  const revised = question("2026-11-08", "advanced");
  const original = oldVersion(revised);
  await h.answer(owner, original, false);
  assert.deepEqual((await h.stats(owner)).wrongTodayIds, [canonical(revised)]);
  const learned = await h.answer(owner, revised);
  assert.equal(learned.pointsEarned, 0);
  assert.equal(learned.alreadySolved, false);
  assert.equal(learned.awardWrongDayBlocked, true);
  assert.equal(learned.awardPending, false);
  assert.equal(h.syncCalls.length, 0);
  assert.equal(await h.lifetime(owner), 0);
  await h.restart();
  assert.equal(
    (await h.request("/api/session", undefined, owner)).body.user.id,
    owner.id,
  );
  const persisted = await h.stats(owner);
  assert.equal(persisted.solvedCount, 1);
  assert.deepEqual(persisted.pendingAwardIds, []);
  assert.deepEqual(persisted.wrongTodayIds, [canonical(revised)]);
  const sameDay = await h.answer(owner, original);
  assert.equal(sameDay.pointsEarned, 0);
  assert.equal(sameDay.awardPending, false);
  assert.deepEqual(sameDay.scoring, learned.scoring);

  h.setTime(AFTER_MIDNIGHT);
  const newDay = await h.stats(owner);
  assert.deepEqual(newDay.wrongTodayIds, []);
  assert.deepEqual(newDay.pendingAwardIds, []);
  const simultaneous = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      h.answer(owner, index % 2 ? revised : original),
    ),
  );
  assert.equal(
    simultaneous.filter((answer) => answer.pointsEarned > 0).length,
    1,
  );
  assert.equal(
    simultaneous.reduce((sum, answer) => sum + answer.pointsEarned, 0),
    5,
  );
  assert.ok(simultaneous.every((answer) => answer.alreadySolved));
  assert.ok(simultaneous.every((answer) => !answer.awardPending));
  assert.ok(simultaneous.every((answer) => !answer.awardWrongDayBlocked));
  assert.ok(
    simultaneous.every(
      (answer) =>
        JSON.stringify(answer.scoring) === JSON.stringify(learned.scoring),
    ),
  );
  assert.deepEqual(h.syncCalls, [owner.id]);
  assert.equal(await h.lifetime(owner), 5);
  const awarded = await h.stats(owner);
  assert.equal(awarded.totalPoints, 5);
  assert.equal(
    awarded.weeklyPoints,
    5,
    "the new Monday credit belongs to its actual award week",
  );
  assert.equal(awarded.solvedCount, 1);
  assert.deepEqual(awarded.levelCounts, { basic: 0, applied: 0, advanced: 1 });
  assert.deepEqual(awarded.solvedIds, [canonical(revised)]);
  assert.deepEqual(awarded.pendingAwardIds, []);
  assert.deepEqual(awarded.activity, [
    { date: "2026-11-08", count: 1, points: 0 },
    { date: "2026-11-09", count: 1, points: 5 },
  ]);
  assert.equal(awarded.streak, 2);
  assert.equal(
    (await h.request("/api/rankings?period=week", undefined, owner)).body.me
      .points,
    5,
  );
  await h.restart();
  h.setTime("2026-11-09T15:00:00.000Z");
  assert.equal((await h.answer(owner, revised)).pointsEarned, 5);
  assert.equal((await h.answer(owner, original)).pointsEarned, 0);
  assert.equal((await h.stats(owner)).solvedCount, 1);
  assert.equal(await h.lifetime(owner), 10);
  assert.deepEqual(h.syncCalls, [owner.id, owner.id]);
});

test("a wrong replay consumes only that day's credit while other accounts and different questions remain independent", async (t) => {
  const h = await harness(t);
  const first = await h.authenticate("isolated_first");
  const second = await h.authenticate("isolated_second");
  const target = question("2026-11-08", "basic");
  const unrelated = question("2026-11-08", "applied");
  assert.equal((await h.answer(first, target)).pointsEarned, 1);
  assert.equal((await h.answer(second, target)).pointsEarned, 1);
  assert.deepEqual((await h.stats(second)).wrongTodayIds, []);
  assert.deepEqual((await h.stats(second)).pendingAwardIds, []);
  assert.equal((await h.answer(first, unrelated)).pointsEarned, 3);
  h.setTime(AFTER_MIDNIGHT);
  const wrongReplay = await h.answer(first, oldVersion(target), false);
  assert.equal(wrongReplay.alreadySolved, true);
  assert.equal(wrongReplay.scoring!.mistakes, 1);
  assert.equal(wrongReplay.scoring!.locked, false);
  const blockedAgain = await h.answer(first, target);
  assert.equal(blockedAgain.pointsEarned, 0);
  assert.equal(blockedAgain.awardWrongDayBlocked, true);
  assert.equal(blockedAgain.awardPending, false);
  assert.deepEqual((await h.stats(first)).wrongTodayIds, [canonical(target)]);
  assert.equal((await h.answer(second, oldVersion(target))).pointsEarned, 1);
  assert.deepEqual((await h.stats(second)).wrongTodayIds, []);
  const fresh = question("2026-11-09", "advanced");
  assert.equal((await h.answer(first, fresh)).pointsEarned, 5);
  h.setTime("2026-11-09T15:00:00.000Z");
  assert.equal((await h.answer(first, oldVersion(target))).pointsEarned, 1);
  const stats = await h.stats(first);
  assert.equal(stats.totalPoints, 10);
  assert.equal(stats.solvedCount, 3);
  assert.deepEqual(stats.pendingAwardIds, []);
  assert.deepEqual(stats.wrongTodayIds, []);
  assert.equal(await h.lifetime(first), 10);
  assert.equal(await h.lifetime(second), 2);
  assert.equal(h.syncCalls.filter((id) => id === first.id).length, 4);
  assert.equal(h.syncCalls.filter((id) => id === second.id).length, 2);
});

test("wrong-day, recovery and pause consume today's credit while fresh next-day attempts can earn normally", async (t) => {
  const h = await harness(t);
  const owner = await h.authenticate("gate_pause_award");
  const target = question("2026-11-08", "basic");
  const secondWrong = question("2026-11-08", "applied");
  const gateOnly = question("2026-11-08", "advanced");
  const secondRecovery = question("2026-11-06", "applied");
  const pausedOnly = question("2026-11-07", "basic");
  const pausedWrong = question("2026-11-07", "applied");
  await h.answer(owner, target, false);
  await h.answer(owner, secondWrong, false);
  const bothBlocked = await h.answer(owner, target);
  assert.equal(bothBlocked.pointsEarned, 0);
  assert.equal(bothBlocked.awardBlocked, false);
  assert.equal(bothBlocked.awardDuplicate, true);
  assert.equal(bothBlocked.scoring!.correctStreak, 0);
  assert.equal(bothBlocked.awardWrongDayBlocked, true);
  assert.equal(
    bothBlocked.awardPending,
    false,
    "the first wrong consumes the current day's attempt",
  );
  const permanentGate = await h.answer(owner, gateOnly);
  assert.equal(permanentGate.awardBlocked, true);
  assert.equal(permanentGate.awardPending, false);
  assert.equal(permanentGate.scoring!.correctStreak, 1);
  const freshSecond = await h.answer(owner, secondRecovery);
  assert.equal(freshSecond.pointsEarned, 0);
  assert.equal(freshSecond.awardBlocked, true);
  assert.equal(freshSecond.scoring!.correctStreak, 2);
  h.setTime(AFTER_MIDNIGHT);
  const replayAtThird = await h.answer(owner, target);
  assert.equal(replayAtThird.pointsEarned, 1);
  assert.equal(replayAtThird.awardPending, false);
  assert.equal(replayAtThird.scoring!.locked, false);
  assert.equal(replayAtThird.scoring!.correctStreak, 0);
  h.pause(true);
  const recoveryDuringPause = await h.answer(owner, pausedOnly);
  assert.equal(recoveryDuringPause.pointsEarned, 0);
  assert.equal(recoveryDuringPause.awardPaused, true);
  assert.equal(recoveryDuringPause.awardPending, false);
  assert.equal(recoveryDuringPause.scoring!.locked, false);
  await h.answer(owner, pausedWrong, false);
  const wrongDuringPause = await h.answer(owner, pausedWrong);
  assert.equal(wrongDuringPause.pointsEarned, 0);
  assert.equal(wrongDuringPause.awardPending, false);
  const pausedReplay = await h.answer(owner, target);
  assert.equal(pausedReplay.pointsEarned, 0);
  assert.equal(pausedReplay.awardPending, false);
  assert.equal(h.syncCalls.length, 1);
  h.pause(false);
  const unpausedReplay = await h.answer(owner, target);
  assert.equal(unpausedReplay.pointsEarned, 0);
  assert.equal(unpausedReplay.alreadySolved, true);
  h.setTime("2026-11-09T15:00:00.000Z");
  for (const permanent of [gateOnly, secondRecovery, pausedOnly, pausedWrong]) {
    const replay = await h.answer(owner, permanent);
    assert.equal(
      replay.pointsEarned,
      { basic: 1, applied: 3, advanced: 5 }[permanent.level],
    );
    assert.equal(replay.alreadySolved, true);
    assert.equal(replay.awardPending, false);
  }
  assert.deepEqual(h.syncCalls, Array(5).fill(owner.id));
  assert.equal(await h.lifetime(owner), 13);
  assert.equal((await h.stats(owner)).solvedCount, 5);
});

test("pre-feature zero and paid receipt rows retain their dates and money while later daily credits use the new ledger", async (t) => {
  const zero = question("2026-11-07", "basic");
  const paid = question("2026-11-07", "applied");
  const h = await harness(t, (path) => {
    // Published pre-feature tables: no wrong_attempts or solve_awards metadata.
    const legacy = new DatabaseSync(path);
    try {
      legacy.exec(`
        CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL,
          username_key TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE solves(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          problem_id TEXT NOT NULL,level TEXT NOT NULL,points INTEGER NOT NULL CHECK(points IN(0,1,3,5)),
          solved_at TEXT NOT NULL,solved_date TEXT NOT NULL,PRIMARY KEY(user_id,problem_id));
      `);
      const salt = "e".repeat(32);
      legacy
        .prepare("INSERT INTO users VALUES(17,?,?,?,?,?)")
        .run(
          "legacy_award",
          "legacy_award",
          scryptSync(PASSWORD, salt, 64).toString("hex"),
          salt,
          "2026-11-07T00:00:00Z",
        );
      const insert = legacy.prepare("INSERT INTO solves VALUES(?,?,?,?,?,?)");
      insert.run(
        17,
        canonical(zero),
        zero.level,
        0,
        "2026-11-07T05:00:00Z",
        "2026-11-07",
      );
      insert.run(
        17,
        canonical(paid),
        paid.level,
        3,
        "2026-11-07T06:00:00Z",
        "2026-11-07",
      );
    } finally {
      legacy.close();
    }
  });
  const owner = await h.authenticate("legacy_award", true);
  assert.equal(owner.id, 17);
  assert.deepEqual((await h.stats(owner)).pendingAwardIds, []);
  assert.equal(await h.lifetime(owner), 3);
  await h.answer(owner, zero, false);
  await h.restart();
  h.setTime(AFTER_MIDNIGHT);
  for (const [index, problem] of [
    zero,
    paid,
    oldVersion(zero),
    oldVersion(paid),
  ].entries()) {
    const replay = await h.answer(owner, problem);
    assert.equal(replay.pointsEarned, index === 0 ? 1 : index === 1 ? 3 : 0);
    assert.equal(replay.alreadySolved, true);
    assert.equal(replay.awardPending, false);
  }
  const stats = await h.stats(owner);
  assert.equal(stats.totalPoints, 7);
  assert.equal(stats.solvedCount, 2);
  assert.deepEqual(stats.activity, [
    { date: "2026-11-07", count: 2, points: 3 },
    { date: "2026-11-09", count: 2, points: 4 },
  ]);
  assert.deepEqual(stats.pendingAwardIds, []);
  assert.equal(await h.lifetime(owner), 7);
  assert.equal(h.syncCalls.length, 2);
});

test("mismatched UTC/JST solve dates are rejected without creating wrong locks, receipts or lifetime credit", async (t) => {
  const h = await harness(t);
  const owner = await h.authenticate("invalid_award_date");
  const valid = {
    userId: owner.id,
    problemId: "invalid-date",
    level: "basic" as const,
    points: 1,
    correct: false,
    date: "2026-11-08",
    solvedAt: AFTER_MIDNIGHT,
  };
  await assert.rejects(h.record(valid), /Invalid problem points/);
  await assert.rejects(
    h.record({ ...valid, solvedAt: "not-an-instant" }),
    /Invalid problem points/,
  );
  const stats = await h.stats(owner);
  assert.equal(stats.solvedCount, 0);
  assert.deepEqual(stats.wrongTodayIds, []);
  assert.deepEqual(stats.pendingAwardIds, []);
  assert.equal(stats.scoring!.mistakes, 0);
  assert.equal(await h.lifetime(owner), 0);
});
