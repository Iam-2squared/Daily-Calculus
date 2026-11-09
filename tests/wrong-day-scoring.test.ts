import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createApp } from "../server/app.js";
import { getProblem, getProblems } from "../server/problems.js";
import { questionFingerprint } from "../server/content-fingerprint.js";
import { SqliteStore } from "../server/store.js";
import type { Level, PrivateProblem } from "../shared/types.js";

const FIRST_DAY = "2026-11-08";
const SECOND_DAY = "2026-11-09";
async function user(store: SqliteStore, username = "wrong_day_user") {
  return (await store.createUser({
    username,
    key: username,
    hash: "a".repeat(128),
    salt: "b".repeat(32),
    createdAt: `${FIRST_DAY}T05:00:00Z`,
  }))!;
}
function answer(
  store: SqliteStore,
  userId: number,
  problemId: string,
  correct = true,
  date = FIRST_DAY,
  level: Level = "basic",
) {
  return store.recordSolve({
    userId,
    problemId,
    contentFingerprint: questionFingerprint({
      prompt: "Test problem",
      formula: problemId,
    }),
    correct,
    level,
    points: { basic: 1, applied: 3, advanced: 5 }[level],
    date,
    solvedAt: `${date}T05:00:00Z`,
  });
}

test("a wrong-day correct answer earns zero today and one fresh award tomorrow while its first learning receipt stays unchanged", async (t) => {
  const store = new SqliteStore(":memory:");
  t.after(() => store.db.close());
  const owner = await user(store),
    other = await user(store, "other_wrong_day_user");
  const wrong = await answer(store, owner.id, "question", false);
  assert.equal(wrong.awardWrongDayBlocked, true);
  assert.equal(wrong.awardAttemptedToday, true);
  assert.equal((await answer(store, other.id, "question")).pointsEarned, 1);
  const corrected = await answer(store, owner.id, "question");
  assert.equal(corrected.pointsEarned, 0);
  assert.equal(corrected.awardDuplicate, true);
  assert.equal(corrected.awardPending, false);
  const before = store.db
    .prepare("SELECT * FROM solves WHERE user_id=?")
    .get(owner.id);
  const concurrent = await Promise.all(
    Array.from({ length: 8 }, () =>
      answer(store, owner.id, "question", true, SECOND_DAY),
    ),
  );
  assert.equal(
    concurrent.reduce((sum, result) => sum + result.pointsEarned, 0),
    1,
  );
  assert.ok(concurrent.every((result) => result.alreadySolved));
  assert.equal(concurrent.filter((result) => !result.awardDuplicate).length, 1);
  assert.deepEqual(
    store.db.prepare("SELECT * FROM solves WHERE user_id=?").get(owner.id),
    before,
  );
  const stats = await store.stats(owner.id, SECOND_DAY, SECOND_DAY);
  assert.equal(stats.totalPoints, 1);
  assert.equal(stats.weeklyPoints, 1);
  assert.equal(stats.solvedCount, 1);
  assert.equal(stats.streak, 2);
  assert.deepEqual(stats.pendingAwardIds, []);
  assert.deepEqual(stats.wrongTodayIds, []);
  assert.deepEqual(
    stats.activity.map((day) => ({ ...day })),
    [
      { date: FIRST_DAY, count: 1, points: 0 },
      { date: SECOND_DAY, count: 1, points: 1 },
    ],
  );
  assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 1);
  assert.equal(
    (await store.rankings(owner.id, "week", SECOND_DAY)).me!.points,
    1,
  );
});

test("wrong-day and recovery blocks expire by day without retroactively changing zero receipts", async (t) => {
  const store = new SqliteStore(":memory:");
  t.after(() => store.db.close());
  const owner = await user(store);
  await answer(store, owner.id, "missed", false, FIRST_DAY, "applied");
  await answer(store, owner.id, "different-miss", false);
  const sameDay = await answer(
    store,
    owner.id,
    "missed",
    true,
    FIRST_DAY,
    "applied",
  );
  assert.equal(sameDay.pointsEarned, 0);
  assert.equal(sameDay.scoring.correctStreak, 0);
  for (const id of ["recovery-one", "recovery-two", "recovery-three"])
    await answer(store, owner.id, id);
  const next = await answer(
    store,
    owner.id,
    "missed",
    true,
    SECOND_DAY,
    "applied",
  );
  assert.equal(next.pointsEarned, 3);
  assert.equal(next.alreadySolved, true);
  assert.equal(
    store.db
      .prepare("SELECT points FROM solves WHERE problem_id='missed'")
      .get()!.points,
    0,
  );
  assert.equal(
    (await answer(store, owner.id, "recovery-one", true, SECOND_DAY))
      .pointsEarned,
    1,
  );
  assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 5);
});

test("the first wrong answer of each new day affects account recovery once, even for an existing learning ID", async (t) => {
  const store = new SqliteStore(":memory:");
  t.after(() => store.db.close());
  const owner = await user(store);
  await answer(store, owner.id, "question", false);
  await answer(store, owner.id, "question");
  const wrong = await answer(store, owner.id, "question", false, SECOND_DAY);
  assert.equal(wrong.scoring.mistakes, 2);
  assert.equal(wrong.awardDuplicate, false);
  assert.equal(
    (await answer(store, owner.id, "question", false, SECOND_DAY)).scoring
      .mistakes,
    2,
  );
  const corrected = await answer(store, owner.id, "question", true, SECOND_DAY);
  assert.equal(corrected.pointsEarned, 0);
  assert.equal(corrected.scoring.correctStreak, 0);
  const fresh = await answer(store, owner.id, "question", true, "2026-11-10");
  assert.equal(fresh.pointsEarned, 0);
  assert.equal(fresh.scoring.correctStreak, 1);
  const stats = await store.stats(owner.id, SECOND_DAY, "2026-11-10");
  assert.equal(stats.solvedCount, 1);
  assert.equal(stats.streak, 3);
});

test("same-day replays cannot advance recovery or reclaim paused awards, while a later day can earn normally", async (t) => {
  const store = new SqliteStore(":memory:");
  t.after(() => store.db.close());
  const owner = await user(store);
  await answer(store, owner.id, "wrong-a", false);
  await answer(store, owner.id, "wrong-b", false);
  const first = await answer(store, owner.id, "recovery-a");
  assert.equal(first.scoring.correctStreak, 1);
  assert.equal(
    (await answer(store, owner.id, "recovery-a")).scoring.correctStreak,
    1,
  );
  await answer(store, owner.id, "recovery-b");
  assert.equal((await answer(store, owner.id, "recovery-c")).pointsEarned, 1);
  assert.equal(
    (await answer(store, owner.id, "recovery-a", true, SECOND_DAY))
      .pointsEarned,
    1,
  );
  store.db.exec("UPDATE scoring_control SET paused=1 WHERE singleton=1");
  await answer(store, owner.id, "paused", true, SECOND_DAY);
  store.db.exec("UPDATE scoring_control SET paused=0 WHERE singleton=1");
  assert.equal(
    (await answer(store, owner.id, "paused", true, SECOND_DAY)).pointsEarned,
    0,
  );
  assert.equal(
    (await answer(store, owner.id, "paused", true, "2026-11-10")).pointsEarned,
    1,
  );
  assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 3);
});

test("historical pending metadata never mutates a solve; a later-day credit is a separate immutable ledger row", async (t) => {
  const store = new SqliteStore(":memory:");
  t.after(() => store.db.close());
  const owner = await user(store);
  await answer(store, owner.id, "old-pending", false);
  await answer(store, owner.id, "old-pending");
  store.db
    .prepare(
      "UPDATE solve_awards SET pending=1 WHERE user_id=? AND problem_id='old-pending'",
    )
    .run(owner.id);
  const before = store.db
    .prepare("SELECT * FROM solves WHERE user_id=?")
    .get(owner.id);
  assert.equal(
    (await answer(store, owner.id, "old-pending", true, SECOND_DAY))
      .pointsEarned,
    1,
  );
  assert.deepEqual(
    store.db.prepare("SELECT * FROM solves WHERE user_id=?").get(owner.id),
    before,
  );
  assert.throws(
    () =>
      store.db
        .prepare("UPDATE solves SET points=1 WHERE user_id=?")
        .run(owner.id),
    /Solve award receipts are final/,
  );
  assert.throws(
    () =>
      store.db
        .prepare("UPDATE daily_awards SET points=3 WHERE user_id=?")
        .run(owner.id),
    /Daily awards are final/,
  );
  assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 1);
  assert.deepEqual(
    (await store.stats(owner.id, SECOND_DAY, SECOND_DAY)).pendingAwardIds,
    [],
  );
});

test("daily choice revisions allow exactly one new award after Japanese midnight", async (t) => {
  let instant = new Date("2026-11-08T14:59:30Z");
  const app = createApp(":memory:", {
    now: () => instant,
    secureCookies: false,
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => {
          app.locals.db.close();
          error ? reject(error) : resolve();
        }),
      ),
  );
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let cookie = "";
  async function request(path: string, body?: unknown) {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const session = response.headers.get("set-cookie")?.split(";")[0];
    if (session) cookie = session;
    assert.ok(response.ok, `${response.status}: ${path}`);
    return response.json();
  }
  const revised = getProblems(FIRST_DAY)[0];
  const original = getProblem(revised.rewardId!)!;
  async function submit(problem: PrivateProblem, correct: boolean) {
    return request(`/api/problems/${encodeURIComponent(problem.id)}/answer`, {
      choiceIndex: correct
        ? problem.correctIndex
        : (problem.correctIndex + 1) % 4,
    });
  }
  await submit(revised, false);
  await request("/api/auth/register", {
    username: "日付境界",
    password: "8046",
  });
  assert.equal((await submit(original, false)).pointsEarned, 0);
  assert.equal((await submit(revised, true)).pointsEarned, 0);
  assert.equal((await request("/api/stats")).totalPoints, 0);
  instant = new Date("2026-11-08T15:00:01Z");
  const retried = await submit(original, true);
  const expected = { basic: 1, applied: 3, advanced: 5 }[revised.level];
  assert.equal(retried.pointsEarned, expected);
  assert.equal(retried.alreadySolved, true);
  assert.equal((await submit(revised, true)).pointsEarned, 0);
  const stats = await request("/api/stats");
  assert.equal(stats.totalPoints, expected);
  assert.equal(stats.weeklyPoints, expected);
  assert.equal(stats.solvedCount, 1);
  assert.deepEqual(stats.solvedIds, [revised.rewardId]);
  assert.equal(
    (await request("/api/rankings?period=week")).me.points,
    expected,
  );
});
