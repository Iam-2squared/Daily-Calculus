import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { SqliteStore } from "../server/store.js";
import { createApp } from "../server/app.js";
import { getProblems } from "../server/problems.js";
import { Challenges } from "../server/challenges.js";
import { questionFingerprint } from "../server/question-identity.js";
import type { Activity, Level, ScoringStatus } from "../shared/types.js";
import { createLegacyDatabase } from "./helpers/legacy-database.js";

const TODAY = "2026-11-09";
const state = (mistakes: number, correctStreak = 0): ScoringStatus => ({
  mistakes,
  correctStreak,
  requiredCorrectStreak: 3,
  locked: mistakes === 2,
});
async function user(store: SqliteStore, username = "scoring_user") {
  return (await store.createUser({
    username,
    key: username,
    hash: "a".repeat(128),
    salt: "b".repeat(32),
    createdAt: `${TODAY}T05:00:00Z`,
  }))!;
}
function record(
  store: SqliteStore,
  userId: number,
  problemId: string,
  correct = true,
  level: Level = "basic",
  date = TODAY,
) {
  return store.recordSolve({
    userId,
    problemId,
    correct,
    level,
    points: { basic: 1, applied: 3, advanced: 5 }[level],
    date,
    solvedAt: `${date}T05:00:00Z`,
  });
}

test("two account mistakes require three distinct consecutive correct answers, with only the third awarded", async (t) => {
  const store = new SqliteStore(":memory:");
  t.after(() => store.db.close());
  const owner = await user(store);
  assert.deepEqual(
    (await store.stats(owner.id, TODAY, TODAY)).scoring,
    state(0),
  );
  assert.deepEqual(
    (await record(store, owner.id, "wrong-one", false)).scoring,
    state(1),
  );
  const normal = await record(store, owner.id, "normal-before-lock");
  assert.equal(normal.pointsEarned, 1);
  assert.deepEqual(
    normal.scoring,
    state(1),
    "a correct answer before the second mistake does not erase the first",
  );
  assert.deepEqual(
    (await record(store, owner.id, "wrong-two", false)).scoring,
    state(2),
  );
  const first = await record(
    store,
    owner.id,
    "zero-before-reset",
    true,
    "applied",
  );
  assert.equal(first.pointsEarned, 0);
  assert.equal(first.awardBlocked, true);
  assert.deepEqual(first.scoring, state(2, 1));
  assert.deepEqual(
    (await record(store, owner.id, "wrong-during-recovery", false)).scoring,
    state(2),
  );
  const secondStart = await record(
    store,
    owner.id,
    "zero-one",
    true,
    "advanced",
  );
  assert.deepEqual(secondStart.scoring, state(2, 1));
  const replay = await record(store, owner.id, "zero-one", true, "advanced");
  assert.equal(replay.alreadySolved, true);
  assert.equal(replay.pointsEarned, 0);
  assert.deepEqual(replay.scoring, state(2, 1));
  assert.deepEqual(
    (await record(store, owner.id, "normal-before-lock", false)).scoring,
    state(2, 1),
    "even a wrong replay of a solved ID is ignored",
  );
  assert.deepEqual(
    (await record(store, owner.id, "zero-two")).scoring,
    state(2, 2),
  );
  const recovered = await record(
    store,
    owner.id,
    "third-recovery",
    true,
    "applied",
  );
  assert.equal(recovered.pointsEarned, 3);
  assert.equal(recovered.awardBlocked, false);
  assert.deepEqual(recovered.scoring, state(0));
  assert.equal(
    (await record(store, owner.id, "normal-after", true, "advanced"))
      .pointsEarned,
    5,
  );
  const oldZero = await record(
    store,
    owner.id,
    "zero-before-reset",
    true,
    "applied",
  );
  assert.equal(oldZero.alreadySolved, true);
  assert.equal(
    oldZero.pointsEarned,
    0,
    "recovery does not retroactively award blocked receipts",
  );
  const stats = await store.stats(owner.id, TODAY, TODAY);
  assert.equal(stats.totalPoints, 9);
  assert.equal(stats.solvedCount, 6);
  assert.deepEqual(stats.levelCounts, { basic: 2, applied: 2, advanced: 2 });
  assert.deepEqual(
    stats.activity.map((day: Activity) => ({ ...day })),
    [{ date: TODAY, count: 6, points: 9 }],
  );
  assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 9);
  assert.deepEqual(
    store.db
      .prepare(
        "SELECT points FROM solves WHERE problem_id LIKE 'zero-%' ORDER BY problem_id",
      )
      .all()
      .map((row) => row.points),
    [0, 0, 0],
  );
});

test("concurrent replays cannot advance recovery or mint a blocked receipt twice", async (t) => {
  const store = new SqliteStore(":memory:");
  t.after(() => store.db.close());
  const owner = await user(store);
  await record(store, owner.id, "w1", false);
  await record(store, owner.id, "w2", false);
  const concurrent = await Promise.all(
    Array.from({ length: 10 }, () =>
      record(store, owner.id, "same-correct", true, "advanced"),
    ),
  );
  assert.equal(concurrent.filter((answer) => !answer.alreadySolved).length, 1);
  assert.equal(
    concurrent.reduce((sum, answer) => sum + answer.pointsEarned, 0),
    0,
  );
  assert.deepEqual(
    (await store.stats(owner.id, TODAY, TODAY)).scoring,
    state(2, 1),
  );
  await record(store, owner.id, "next-correct");
  const recovered = await Promise.all(
    Array.from({ length: 5 }, () =>
      record(store, owner.id, "same-third", true, "advanced"),
    ),
  );
  assert.equal(
    recovered.reduce((sum, answer) => sum + answer.pointsEarned, 0),
    5,
  );
  assert.deepEqual(
    (await store.stats(owner.id, TODAY, TODAY)).scoring,
    state(0),
  );
  assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 5);
});

test("a failed recovery transaction rolls back the solve, lifetime income and scoring state together", async (t) => {
  const store = new SqliteStore(":memory:");
  t.after(() => store.db.close());
  const owner = await user(store);
  await record(store, owner.id, "w1", false);
  await record(store, owner.id, "w2", false);
  await record(store, owner.id, "z1");
  await record(store, owner.id, "z2");
  store.db.exec(
    "CREATE TRIGGER fail_recovery BEFORE UPDATE ON scoring_state WHEN OLD.mistakes=2 AND NEW.mistakes=0 BEGIN SELECT RAISE(ABORT,'Test recovery failure'); END",
  );
  await assert.rejects(
    record(store, owner.id, "recovery", true, "advanced"),
    /Test recovery failure/,
  );
  assert.equal(
    store.db.prepare("SELECT 1 FROM solves WHERE problem_id='recovery'").get(),
    undefined,
  );
  assert.deepEqual(
    (await store.stats(owner.id, TODAY, TODAY)).scoring,
    state(2, 2),
  );
  assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 0);
  store.db.exec("DROP TRIGGER fail_recovery");
  assert.equal(
    (await record(store, owner.id, "recovery", true, "advanced")).pointsEarned,
    5,
  );
  assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 5);
});

test("today-only voids retain all learning receipts and gross lifetime totals while removing only today's visible scores", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "calculus-old-voids-")),
    path = join(directory, "history.sqlite");
  createLegacyDatabase(path, (legacy) => {
    const insertUser = legacy.prepare("INSERT INTO users VALUES(?,?,?,?,?,?)");
    for (const [id, name] of [
      [1, "first"],
      [2, "other"],
    ] as const)
      insertUser.run(id, name, name, "hash", "salt", `${TODAY}T05:00:00Z`);
    const insert = legacy.prepare("INSERT INTO solves VALUES(?,?,?,?,?,?)");
    insert.run(1, "past", "basic", 1, "2026-11-08T05:00:00Z", "2026-11-08");
    insert.run(1, "today-applied", "applied", 3, `${TODAY}T05:00:00Z`, TODAY);
    insert.run(1, "today-advanced", "advanced", 5, `${TODAY}T05:00:00Z`, TODAY);
    insert.run(2, "other-today", "basic", 1, `${TODAY}T05:00:00Z`, TODAY);
  });
  const store = new SqliteStore(path);
  t.after(() => {
    store.db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const first = { id: 1 },
    other = { id: 2 };
  const gross = await store.lifetimeTotals([first.id, other.id]);
  const voidToday = store.db.prepare(
    "INSERT INTO scoring_voids(user_id,problem_id,original_points,reason) SELECT user_id,problem_id,points,'Nov9 authorized reset' FROM solves WHERE solved_date=? AND points>0 ON CONFLICT(user_id,problem_id) DO NOTHING",
  );
  assert.equal(voidToday.run(TODAY).changes, 3);
  assert.equal(voidToday.run(TODAY).changes, 0);
  const stats = await store.stats(first.id, TODAY, TODAY);
  assert.equal(stats.totalPoints, 1);
  assert.equal(stats.weeklyPoints, 0);
  assert.equal(stats.solvedCount, 3);
  assert.equal(stats.streak, 2);
  assert.deepEqual(
    stats.activity.map((day: Activity) => ({ ...day })),
    [
      { date: "2026-11-08", count: 1, points: 1 },
      { date: TODAY, count: 2, points: 0 },
    ],
  );
  assert.equal(stats.solvedIds.length, 3);
  assert.deepEqual(stats.levelCounts, { basic: 1, applied: 1, advanced: 1 });
  assert.equal((await store.stats(other.id, TODAY, TODAY)).totalPoints, 0);
  const board = await store.rankings(first.id, "all", TODAY);
  assert.equal(board.me!.points, 1);
  assert.equal(board.totalUsers, 2);
  assert.deepEqual(
    await store.lifetimeTotals([first.id, other.id]),
    gross,
    "voids never lower the external synchronization source watermark",
  );
  const replay = await record(
    store,
    first.id,
    "today-advanced",
    true,
    "advanced",
  );
  assert.equal(replay.alreadySolved, true);
  assert.equal(replay.pointsEarned, 0);
  assert.deepEqual(
    (await record(store, first.id, "today-advanced", false, "advanced"))
      .scoring,
    state(0),
  );
  await record(store, first.id, "future", true, "applied", "2026-11-10");
  assert.equal(
    (await store.stats(first.id, TODAY, "2026-11-10")).totalPoints,
    4,
  );
  assert.equal((await store.lifetimeTotals([first.id]))[0].totalPoints, 12);
  await store.deleteUser(first.id);
  assert.equal(
    store.db
      .prepare("SELECT COUNT(*) AS count FROM scoring_voids WHERE user_id=?")
      .get(first.id)!.count,
    0,
  );
  assert.equal(
    store.db
      .prepare("SELECT COUNT(*) AS count FROM scoring_state WHERE user_id=?")
      .get(first.id)!.count,
    0,
  );
  assert.deepEqual((await store.lifetimeTotals([first.id]))[0], {
    userId: first.id,
    totalPoints: 12,
    known: true,
    deleted: true,
  });
  assert.equal((await store.stats(other.id, TODAY, TODAY)).solvedCount, 1);
});

test("the API shares recovery across daily, practice, archive and timed answers, with no blocked or guest wallet credits", async (t) => {
  const key = "scoring-api-signing-key-for-test-1234567890";
  let syncCalls = 0;
  const app = createApp(":memory:", {
    now: () => new Date(`${TODAY}T05:00:00Z`),
    secureCookies: false,
    challengeKey: key,
    integration: {
      targetSecret: "t".repeat(40),
      targetUrl: "https://wallet.example",
      request: async () => {
        syncCalls++;
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
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          app.locals.db.close();
          error ? reject(error) : resolve();
        });
      }),
  );
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function request(path: string, body?: unknown, cookie?: string) {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  const registered = await request("/api/auth/register", {
    username: "scoring_api",
    password: "0123",
  });
  assert.equal(registered.status, 201);
  const cookie = registered.cookie!;
  const userId = registered.body.user.id;
  const path = (id: string) => `/api/problems/${encodeURIComponent(id)}/answer`;
  const daily = getProblems(TODAY)[0];
  const wrongDaily = await request(
    path(daily.id),
    { choiceIndex: (daily.correctIndex + 1) % 4 },
    cookie,
  );
  assert.deepEqual(wrongDaily.body.scoring, state(1));
  const practice = await request(
    "/api/challenges/start",
    { level: "basic", mode: "practice" },
    cookie,
  );
  const signer = new Challenges(key);
  const privatePractice = signer.resolve(
    practice.body.problem.id,
    userId,
    new Date(`${TODAY}T05:00:00Z`),
  );
  assert.deepEqual(
    (
      await request(
        path(privatePractice.id),
        { choiceIndex: (privatePractice.correctIndex + 1) % 4 },
        cookie,
      )
    ).body.scoring,
    state(2),
  );
  const seen = new Set([
    questionFingerprint(daily),
    questionFingerprint(privatePractice),
  ]);
  const archive = getProblems("2026-11-08").find(
    (problem) => !seen.has(questionFingerprint(problem)),
  )!;
  const first = await request(
    path(archive.id),
    { choiceIndex: archive.correctIndex },
    cookie,
  );
  assert.equal(first.body.awardBlocked, true);
  assert.deepEqual(first.body.scoring, state(2, 1));
  seen.add(questionFingerprint(archive));
  const duplicate = await request(
    path(daily.id),
    { choiceIndex: daily.correctIndex },
    cookie,
  );
  assert.equal(duplicate.body.awardDuplicate, true);
  assert.equal(duplicate.body.pointsEarned, 0);
  assert.deepEqual(duplicate.body.scoring, state(2, 1));
  const freshDaily = getProblems(TODAY).find(
    (problem) => !seen.has(questionFingerprint(problem)),
  )!;
  const second = await request(
    path(freshDaily.id),
    { choiceIndex: freshDaily.correctIndex },
    cookie,
  );
  assert.equal(second.body.awardBlocked, true);
  assert.deepEqual(second.body.scoring, state(2, 2));
  seen.add(questionFingerprint(freshDaily));
  assert.equal(syncCalls, 0);
  async function freshTimedQuestion() {
    for (let attempt = 0; attempt < 20; attempt++) {
      const issued = await request(
        "/api/challenges/start",
        { level: "applied", mode: "time-attack" },
        cookie,
      );
      const problem = signer.resolve(
        issued.body.problem.id,
        userId,
        new Date(`${TODAY}T05:00:00Z`),
        issued.body.run.token,
      );
      if (!seen.has(questionFingerprint(problem)))
        return { timed: issued, privateTimed: problem };
    }
    throw new Error("No unseen timed question was issued.");
  }
  const { timed, privateTimed } = await freshTimedQuestion();
  const third = await request(
    path(privateTimed.id),
    { choiceIndex: privateTimed.correctIndex, runToken: timed.body.run.token },
    cookie,
  );
  assert.equal(third.status, 200);
  assert.equal(third.body.pointsEarned, 3);
  assert.equal(third.body.awardBlocked, false);
  assert.deepEqual(third.body.scoring, state(0));
  assert.equal(syncCalls, 1);
  const replay = await request(
    path(privateTimed.id),
    { choiceIndex: privateTimed.correctIndex, runToken: timed.body.run.token },
    cookie,
  );
  assert.equal(replay.body.alreadySolved, true);
  assert.equal(syncCalls, 1);
  assert.deepEqual(
    (
      await request(
        path(daily.id),
        { choiceIndex: (daily.correctIndex + 1) % 4 },
        cookie,
      )
    ).body.scoring,
    state(0),
  );
  const guest = await request(path(daily.id), {
    choiceIndex: daily.correctIndex,
  });
  assert.equal(guest.body.pointsEarned, 0);
  assert.equal(syncCalls, 1);
  const stats = (await request("/api/stats", undefined, cookie)).body;
  assert.deepEqual(stats.scoring, state(0));
  assert.equal(stats.totalPoints, 3);
  assert.equal(stats.solvedCount, 4);
  assert.deepEqual(
    stats.activity.map((day: Activity) => ({ ...day })),
    [{ date: TODAY, count: 4, points: 3 }],
  );
  assert.equal(
    (await app.locals.store.lifetimeTotals([userId]))[0].totalPoints,
    3,
  );
});
