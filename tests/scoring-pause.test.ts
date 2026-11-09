import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.js";
import { SqliteStore, SupabaseStore } from "../server/store.js";
import { getProblems } from "../server/problems.js";
import { Challenges } from "../server/challenges.js";
import type { Level } from "../shared/types.js";

const FROZEN_AT = "2026-11-08T23:00:00.000Z";
const TODAY = "2026-11-09";
async function user(store: SqliteStore) {
  return (await store.createUser({
    username: "pause_user",
    key: "pause_user",
    hash: "a".repeat(128),
    salt: "b".repeat(32),
    createdAt: `${TODAY}T05:00:00Z`,
  }))!;
}
function answer(
  store: SqliteStore,
  userId: number,
  problemId: string,
  correct = true,
  level: Level = "basic",
) {
  return store.recordSolve({
    userId,
    problemId,
    correct,
    level,
    points: { basic: 1, applied: 3, advanced: 5 }[level],
    date: TODAY,
    solvedAt: `${TODAY}T05:00:00Z`,
  });
}
function pause(store: SqliteStore) {
  store.db
    .prepare(
      "UPDATE scoring_control SET paused=1,frozen_at=? WHERE singleton=1",
    )
    .run(FROZEN_AT);
}

test("global pause overrides every correct award including gate recovery, without retroactive awards after resume", async (t) => {
  const store = new SqliteStore(":memory:");
  t.after(() => store.db.close());
  const owner = await user(store);
  assert.deepEqual(await store.scoringControl(), {
    scoringPaused: false,
    scoringFrozenAt: null,
  });
  assert.equal((await answer(store, owner.id, "before-pause")).pointsEarned, 1);
  pause(store);
  const normal = await answer(
    store,
    owner.id,
    "paused-normal",
    true,
    "advanced",
  );
  assert.equal(normal.pointsEarned, 0);
  assert.equal(normal.awardPaused, true);
  assert.equal(normal.scoringFrozenAt, FROZEN_AT);
  await answer(store, owner.id, "wrong1", false);
  await answer(store, owner.id, "wrong2", false);
  for (let index = 1; index <= 3; index++) {
    const result = await answer(
      store,
      owner.id,
      `recovery-${index}`,
      true,
      "applied",
    );
    assert.equal(result.pointsEarned, 0);
    assert.equal(result.awardPaused, true);
    assert.equal(result.awardBlocked, index < 3);
    assert.equal(result.scoring.locked, index < 3);
  }
  const replay = await answer(
    store,
    owner.id,
    "paused-normal",
    true,
    "advanced",
  );
  assert.equal(replay.alreadySolved, true);
  assert.equal(replay.awardPaused, true);
  assert.equal(
    (await answer(store, owner.id, "before-pause", false)).awardPaused,
    false,
  );
  const paused = await store.stats(owner.id, TODAY, TODAY);
  assert.equal(paused.totalPoints, 1);
  assert.equal(paused.solvedCount, 5);
  assert.equal(paused.scoringPaused, true);
  assert.equal(paused.scoringFrozenAt, FROZEN_AT);
  assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 1);
  store.db.exec(
    "UPDATE scoring_control SET paused=0,frozen_at=NULL WHERE singleton=1",
  );
  const old = await answer(store, owner.id, "recovery-3", true, "applied");
  assert.equal(old.pointsEarned, 0);
  assert.equal(old.alreadySolved, true);
  assert.equal(old.awardPaused, false);
  const fresh = await answer(store, owner.id, "after-resume", true, "applied");
  assert.equal(fresh.pointsEarned, 3);
  assert.equal(fresh.awardPaused, false);
  assert.equal(fresh.scoringFrozenAt, null);
  assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 4);
  assert.equal(
    (await store.stats(owner.id, TODAY, TODAY)).scoringPaused,
    false,
  );
});

test("global pause persists across fresh stores and is observed by existing connections without a restart", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "calculus-global-pause-"));
  const path = join(directory, "scores.sqlite");
  const first = new SqliteStore(path);
  const owner = await user(first);
  pause(first);
  const second = new SqliteStore(path);
  t.after(() => {
    first.db.close();
    second.db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  assert.deepEqual(await second.scoringControl(), {
    scoringPaused: true,
    scoringFrozenAt: FROZEN_AT,
  });
  assert.equal((await answer(second, owner.id, "paused")).pointsEarned, 0);
  second.db.exec(
    "UPDATE scoring_control SET paused=0,frozen_at=NULL WHERE singleton=1",
  );
  assert.equal(
    (await answer(first, owner.id, "fresh", true, "advanced")).pointsEarned,
    5,
  );
  assert.equal((await answer(first, owner.id, "paused")).pointsEarned, 0);
});

test("daily, practice, timed and archive API awards stay zero during pause, with visible global metadata and no wallet sync", async (t) => {
  const key = "paused-api-key-for-tests-1234567890123456";
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
  const store = app.locals.store as SqliteStore;
  pause(store);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          store.db.close();
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
  const guestStats = (await request("/api/stats")).body;
  assert.equal(guestStats.scoringPaused, true);
  assert.equal(guestStats.scoringFrozenAt, FROZEN_AT);
  const registered = await request("/api/auth/register", {
    username: "pause_api",
    password: "0123",
  });
  const owner = registered.body.user.id;
  const cookie = registered.cookie!;
  const path = (id: string) => `/api/problems/${encodeURIComponent(id)}/answer`;
  const daily = getProblems(TODAY)[0];
  const archive = getProblems("2026-11-08")[0];
  for (const problem of [daily, archive]) {
    const response = await request(
      path(problem.id),
      { choiceIndex: problem.correctIndex },
      cookie,
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.pointsEarned, 0);
    assert.equal(response.body.awardPaused, true);
    assert.equal(response.body.scoringFrozenAt, FROZEN_AT);
  }
  const signer = new Challenges(key);
  for (const mode of ["practice", "time-attack"] as const) {
    const challenge = (
      await request(
        "/api/challenges/start",
        { level: "advanced", mode },
        cookie,
      )
    ).body;
    const problem = signer.resolve(
      challenge.problem.id,
      owner,
      new Date(`${TODAY}T05:00:00Z`),
      challenge.run?.token,
    );
    const response = await request(
      path(problem.id),
      { choiceIndex: problem.correctIndex, runToken: challenge.run?.token },
      cookie,
    );
    assert.equal(response.body.pointsEarned, 0);
    assert.equal(response.body.awardPaused, true);
  }
  assert.equal(syncCalls, 0);
  const stats = (await request("/api/stats", undefined, cookie)).body;
  assert.equal(stats.totalPoints, 0);
  assert.equal(stats.solvedCount, 4);
  assert.equal(stats.scoringPaused, true);
  assert.equal(stats.scoringFrozenAt, FROZEN_AT);
  assert.equal((await store.lifetimeTotals([owner]))[0].totalPoints, 0);
  const guest = (
    await request(path(daily.id), { choiceIndex: daily.correctIndex })
  ).body;
  assert.equal(guest.pointsEarned, 0);
  assert.equal(guest.awardPaused, false);
  assert.equal(guest.scoringFrozenAt, FROZEN_AT);
  assert.equal(syncCalls, 0);
});

test("the cloud control adapter reads only the whitelisted secret-gated metadata operation", async () => {
  const config = {
    url: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    storeKey: "a".repeat(64),
  };
  const store = new SupabaseStore(config, async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.p_operation, "scoring_control");
    assert.deepEqual(body.p_payload, {});
    assert.equal(body.p_key, config.storeKey);
    return new Response(
      JSON.stringify({ scoringPaused: true, scoringFrozenAt: FROZEN_AT }),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  assert.deepEqual(await store.scoringControl(), {
    scoringPaused: true,
    scoringFrozenAt: FROZEN_AT,
  });
});
