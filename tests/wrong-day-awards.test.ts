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

test("pending daily awards survive API restarts and one JST millisecond boundary, with one wallet sync and one lifetime increment under concurrent old/new retries", async (t) => {
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
  assert.equal(learned.awardPending, true);
  assert.equal(h.syncCalls.length, 0);
  assert.equal(await h.lifetime(owner), 0);
  await h.restart();
  assert.equal(
    (await h.request("/api/session", undefined, owner)).body.user.id,
    owner.id,
  );
  const persisted = await h.stats(owner);
  assert.equal(persisted.solvedCount, 1);
  assert.deepEqual(persisted.pendingAwardIds, [canonical(revised)]);
  assert.deepEqual(persisted.wrongTodayIds, [canonical(revised)]);
  const sameDay = await h.answer(owner, original);
  assert.equal(sameDay.pointsEarned, 0);
  assert.equal(sameDay.awardPending, true);
  assert.deepEqual(sameDay.scoring, learned.scoring);

  h.setTime(AFTER_MIDNIGHT);
  const newDay = await h.stats(owner);
  assert.deepEqual(newDay.wrongTodayIds, []);
  assert.deepEqual(newDay.pendingAwardIds, [canonical(revised)]);
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
    "Sunday's learning receives its award in the new Monday week",
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
  assert.equal((await h.answer(owner, revised)).pointsEarned, 0);
  assert.equal((await h.answer(owner, original)).pointsEarned, 0);
  assert.equal((await h.stats(owner)).solvedCount, 1);
  assert.equal(await h.lifetime(owner), 5);
  assert.deepEqual(h.syncCalls, [owner.id]);
});

test("a wrong retry reblocks only that account's pending canonical question on the new day", async (t) => {
  const h = await harness(t);
  const first = await h.authenticate("isolated_first");
  const second = await h.authenticate("isolated_second");
  const target = question("2026-11-08", "basic");
  const unrelated = question("2026-11-08", "applied");
  await h.answer(first, target, false);
  await h.answer(first, oldVersion(target));
  assert.equal((await h.answer(second, target)).pointsEarned, 1);
  assert.deepEqual((await h.stats(second)).wrongTodayIds, []);
  assert.deepEqual((await h.stats(second)).pendingAwardIds, []);
  assert.equal((await h.answer(first, unrelated)).pointsEarned, 3);
  const before = (await h.stats(first)).scoring;
  h.setTime(AFTER_MIDNIGHT);
  const wrongReplay = await h.answer(first, oldVersion(target), false);
  assert.equal(wrongReplay.alreadySolved, true);
  assert.deepEqual(
    wrongReplay.scoring,
    before,
    "completed pending replays never alter global recovery",
  );
  const blockedAgain = await h.answer(first, target);
  assert.equal(blockedAgain.pointsEarned, 0);
  assert.equal(blockedAgain.awardWrongDayBlocked, true);
  assert.equal(blockedAgain.awardPending, true);
  assert.deepEqual((await h.stats(first)).wrongTodayIds, [canonical(target)]);
  assert.equal((await h.answer(second, oldVersion(target))).pointsEarned, 0);
  assert.deepEqual((await h.stats(second)).wrongTodayIds, []);
  const fresh = question("2026-11-09", "advanced");
  assert.equal((await h.answer(first, fresh)).pointsEarned, 5);
  h.setTime("2026-11-09T15:00:00.000Z");
  assert.equal((await h.answer(first, oldVersion(target))).pointsEarned, 1);
  const stats = await h.stats(first);
  assert.equal(stats.totalPoints, 9);
  assert.equal(stats.solvedCount, 3);
  assert.deepEqual(stats.pendingAwardIds, []);
  assert.deepEqual(stats.wrongTodayIds, []);
  assert.equal(await h.lifetime(first), 9);
  assert.equal(await h.lifetime(second), 1);
  assert.equal(h.syncCalls.filter((id) => id === first.id).length, 3);
  assert.equal(h.syncCalls.filter((id) => id === second.id).length, 1);
});

test("global recovery and pause cannot be bypassed by pending replays, while gate-only and pause-only zero receipts stay final", async (t) => {
  const h = await harness(t);
  const owner = await h.authenticate("gate_pause_award");
  const target = question("2026-11-08", "basic");
  const secondWrong = question("2026-11-08", "applied");
  const gateOnly = question("2026-11-08", "advanced");
  const pausedOnly = question("2026-11-07", "basic");
  const pausedWrong = question("2026-11-07", "applied");
  await h.answer(owner, target, false);
  await h.answer(owner, secondWrong, false);
  const bothBlocked = await h.answer(owner, target);
  assert.equal(bothBlocked.pointsEarned, 0);
  assert.equal(bothBlocked.awardBlocked, true);
  assert.equal(bothBlocked.awardWrongDayBlocked, true);
  assert.equal(
    bothBlocked.awardPending,
    true,
    "wrong-day eligibility survives a simultaneous global gate",
  );
  const permanentGate = await h.answer(owner, gateOnly);
  assert.equal(permanentGate.awardBlocked, true);
  assert.equal(permanentGate.awardPending, false);
  assert.equal(permanentGate.scoring!.correctStreak, 2);
  h.setTime(AFTER_MIDNIGHT);
  const replayAtThird = await h.answer(owner, target);
  assert.equal(replayAtThird.pointsEarned, 0);
  assert.equal(replayAtThird.awardPending, true);
  assert.deepEqual(replayAtThird.scoring, permanentGate.scoring);
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
  const pausedPending = await h.answer(owner, target);
  assert.equal(pausedPending.pointsEarned, 0);
  assert.equal(pausedPending.awardPending, true);
  assert.equal(h.syncCalls.length, 0);
  h.pause(false);
  const upgraded = await h.answer(owner, target);
  assert.equal(upgraded.pointsEarned, 1);
  assert.equal(upgraded.alreadySolved, true);
  h.setTime("2026-11-09T15:00:00.000Z");
  for (const permanent of [gateOnly, pausedOnly, pausedWrong]) {
    const replay = await h.answer(owner, permanent);
    assert.equal(replay.pointsEarned, 0);
    assert.equal(replay.alreadySolved, true);
    assert.equal(replay.awardPending, false);
  }
  assert.deepEqual(h.syncCalls, [owner.id]);
  assert.equal(await h.lifetime(owner), 1);
  assert.equal((await h.stats(owner)).solvedCount, 4);
});

test("pre-feature zero and paid receipts remain final after schema upgrade and a later API restart", async (t) => {
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
  for (const problem of [zero, paid, oldVersion(zero), oldVersion(paid)]) {
    const replay = await h.answer(owner, problem);
    assert.equal(replay.pointsEarned, 0);
    assert.equal(replay.alreadySolved, true);
    assert.equal(replay.awardPending, false);
  }
  const stats = await h.stats(owner);
  assert.equal(stats.totalPoints, 3);
  assert.equal(stats.solvedCount, 2);
  assert.deepEqual(stats.pendingAwardIds, []);
  assert.equal(await h.lifetime(owner), 3);
  assert.equal(h.syncCalls.length, 0);
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
