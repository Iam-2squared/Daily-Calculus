import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createApp } from "../server/app.js";
import { getProblem, getProblems } from "../server/problems.js";
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
    correct,
    level,
    points: { basic: 1, applied: 3, advanced: 5 }[level],
    date,
    solvedAt: `${date}T05:00:00Z`,
  });
}

test("one wrong answer suppresses that question only for the Japanese day, and a later correct answer earns once on its actual award date", async (t) => {
  const store = new SqliteStore(":memory:");
  t.after(() => store.db.close());
  const owner = await user(store);
  const other = await user(store, "other_wrong_day_user");
  const wrong = await answer(store, owner.id, "question", false);
  assert.equal(wrong.awardWrongDayBlocked, true);
  assert.equal(wrong.awardPending, false);
  assert.equal((await answer(store, other.id, "question")).pointsEarned, 1);
  const corrected = await answer(store, owner.id, "question");
  assert.equal(corrected.pointsEarned, 0);
  assert.equal(corrected.alreadySolved, false);
  assert.equal(corrected.awardWrongDayBlocked, true);
  assert.equal(corrected.awardPending, true);
  assert.equal(corrected.scoring.mistakes, 1);
  assert.equal((await answer(store, owner.id, "question")).pointsEarned, 0);
  const learned = await store.stats(owner.id, FIRST_DAY, FIRST_DAY);
  assert.equal(learned.totalPoints, 0);
  assert.equal(learned.solvedCount, 1);
  assert.deepEqual(learned.solvedIds, ["question"]);
  assert.deepEqual(learned.wrongTodayIds, ["question"]);
  assert.deepEqual(learned.pendingAwardIds, ["question"]);
  assert.deepEqual(
    learned.activity.map((day) => ({ ...day })),
    [{ date: FIRST_DAY, count: 1, points: 0 }],
  );
  assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 0);

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
  assert.ok(concurrent.every((result) => result.scoring.mistakes === 1));
  assert.ok(concurrent.every((result) => !result.awardWrongDayBlocked));
  assert.ok(concurrent.every((result) => !result.awardPending));
  const awarded = await store.stats(owner.id, SECOND_DAY, SECOND_DAY);
  assert.equal(awarded.totalPoints, 1);
  assert.equal(awarded.weeklyPoints, 1);
  assert.equal(awarded.solvedCount, 1);
  assert.deepEqual(awarded.wrongTodayIds, []);
  assert.deepEqual(awarded.pendingAwardIds, []);
  assert.deepEqual(
    awarded.activity.map((day) => ({ ...day })),
    [
      { date: FIRST_DAY, count: 1, points: 0 },
      { date: SECOND_DAY, count: 1, points: 1 },
    ],
  );
  assert.equal(
    awarded.streak,
    2,
    "a later eligible correct answer counts as learning on its award day",
  );
  assert.equal(
    (await store.rankings(owner.id, "week", SECOND_DAY)).me!.points,
    1,
  );
  assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 1);
  assert.equal(
    (await answer(store, owner.id, "question", true, "2026-11-10"))
      .pointsEarned,
    0,
  );
});

test("wrong-day pending status survives a simultaneous recovery block, while an initial global pause makes the zero receipt final", async (t) => {
  const store = new SqliteStore(":memory:");
  t.after(() => store.db.close());
  const owner = await user(store);
  await answer(store, owner.id, "both-blocks", false, FIRST_DAY, "applied");
  await answer(store, owner.id, "both-blocks", false, FIRST_DAY, "applied");
  const bothBlocked = await answer(
    store,
    owner.id,
    "both-blocks",
    true,
    FIRST_DAY,
    "applied",
  );
  assert.equal(bothBlocked.pointsEarned, 0);
  assert.equal(bothBlocked.awardBlocked, true);
  assert.equal(bothBlocked.awardPending, true);
  assert.equal(bothBlocked.scoring.correctStreak, 1);
  await answer(store, owner.id, "recovery-second");
  await answer(store, owner.id, "recovery-third");
  assert.equal(
    (await answer(store, owner.id, "both-blocks", true, SECOND_DAY, "applied"))
      .pointsEarned,
    3,
  );
  assert.equal(
    (await answer(store, owner.id, "recovery-second", true, SECOND_DAY))
      .pointsEarned,
    0,
  );

  store.db.exec("UPDATE scoring_control SET paused=1 WHERE singleton=1");
  await answer(store, owner.id, "paused-wrong", false);
  const paused = await answer(store, owner.id, "paused-wrong");
  assert.equal(paused.awardWrongDayBlocked, true);
  assert.equal(paused.awardPaused, true);
  assert.equal(paused.awardPending, false);
  store.db.exec("UPDATE scoring_control SET paused=0 WHERE singleton=1");
  assert.equal(
    (await answer(store, owner.id, "paused-wrong", true, SECOND_DAY))
      .pointsEarned,
    0,
  );
});

test("a wrong retry of a pending receipt locks its new day without advancing the account-wide recovery counter", async (t) => {
  const store = new SqliteStore(":memory:");
  t.after(() => store.db.close());
  const owner = await user(store);
  await answer(store, owner.id, "pending", false);
  await answer(store, owner.id, "pending");
  const retryWrong = await answer(
    store,
    owner.id,
    "pending",
    false,
    SECOND_DAY,
  );
  assert.equal(retryWrong.alreadySolved, true);
  assert.equal(retryWrong.scoring.mistakes, 1);
  assert.equal(
    (await answer(store, owner.id, "pending", true, SECOND_DAY)).pointsEarned,
    0,
  );
  assert.equal(
    (await answer(store, owner.id, "pending", true, "2026-11-10")).pointsEarned,
    1,
  );
  assert.equal(
    (await store.stats(owner.id, SECOND_DAY, "2026-11-10")).solvedCount,
    1,
  );
});

test("pending replays cannot bypass global recovery, and pause or gate-only zero receipts never gain retrospective points", async (t) => {
  const store = new SqliteStore(":memory:");
  t.after(() => store.db.close());
  const owner = await user(store);
  await answer(store, owner.id, "pending", false);
  await answer(store, owner.id, "pending");
  await answer(store, owner.id, "second-mistake", false);
  const blockedReplay = await answer(
    store,
    owner.id,
    "pending",
    true,
    SECOND_DAY,
  );
  assert.equal(blockedReplay.pointsEarned, 0);
  assert.equal(blockedReplay.scoring.correctStreak, 0);
  await answer(store, owner.id, "gate-zero-1");
  await answer(store, owner.id, "gate-zero-2");
  const recovered = await answer(store, owner.id, "gate-third");
  assert.equal(recovered.pointsEarned, 1);
  assert.equal(recovered.scoring.locked, false);
  assert.equal(
    (await answer(store, owner.id, "gate-zero-1", true, SECOND_DAY))
      .pointsEarned,
    0,
  );
  assert.equal(
    (await answer(store, owner.id, "pending", true, SECOND_DAY)).pointsEarned,
    1,
  );

  store.db.exec("UPDATE scoring_control SET paused=1 WHERE singleton=1");
  assert.equal((await answer(store, owner.id, "pause-zero")).pointsEarned, 0);
  store.db.exec("UPDATE scoring_control SET paused=0 WHERE singleton=1");
  assert.equal(
    (await answer(store, owner.id, "pause-zero", true, SECOND_DAY))
      .pointsEarned,
    0,
  );
  assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 2);
});

test("a failed delayed award rolls back the pending receipt and gross lifetime together", async (t) => {
  const store = new SqliteStore(":memory:");
  t.after(() => store.db.close());
  const owner = await user(store);
  await answer(store, owner.id, "pending", false);
  await answer(store, owner.id, "pending");
  store.db.exec(
    "CREATE TRIGGER fail_delayed_award AFTER UPDATE OF points ON solves WHEN NEW.points>OLD.points BEGIN SELECT RAISE(ABORT,'Test delayed award failure'); END",
  );
  await assert.rejects(
    answer(store, owner.id, "pending", true, SECOND_DAY),
    /Test delayed award failure/,
  );
  assert.equal(
    (await store.stats(owner.id, SECOND_DAY, SECOND_DAY)).totalPoints,
    0,
  );
  assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 0);
  store.db.exec("DROP TRIGGER fail_delayed_award");
  assert.equal(
    (await answer(store, owner.id, "pending", true, SECOND_DAY)).pointsEarned,
    1,
  );
  assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 1);
});

test("daily choice revisions share the wrong-day lock across JST midnight while another account and guests remain independent", async (t) => {
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
