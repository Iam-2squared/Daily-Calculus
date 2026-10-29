import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.js";
import { Challenges } from "../server/challenges.js";
import type { ChallengeResponse } from "../shared/types.js";

const SIGNING_KEY = "test_challenge_key_stable_across_app_instances_123456789";
async function harness(start = new Date("2026-10-28T05:00:00Z")) {
  let current = start;
  const app = createApp(":memory:", {
    now: () => current,
    secureCookies: false,
    challengeKey: SIGNING_KEY,
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const signer = new Challenges(SIGNING_KEY);
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
      retryAfter: response.headers.get("retry-after"),
    };
  }
  async function register(username = "challenge_user") {
    const result = await request("/api/auth/register", {
      username,
      password: "0123",
    });
    assert.equal(result.status, 201);
    return { cookie: result.cookie!, userId: result.body.user.id as number };
  }
  function choice(response: ChallengeResponse, userId: number) {
    return signer.resolve(
      response.problem.id,
      userId,
      current,
      response.run?.token,
    ).correctIndex;
  }
  return {
    app,
    request,
    register,
    choice,
    time: () => current.getTime(),
    setTime: (value: number) => {
      current = new Date(value);
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          app.locals.db.close();
          error ? reject(error) : resolve();
        });
      }),
  };
}
const answerPath = (id: string) =>
  `/api/problems/${encodeURIComponent(id)}/answer`;
const tamper = (value: string) =>
  value.slice(0, -1) + (value.endsWith("A") ? "B" : "A");

test("unlimited practice issues fresh questions beyond the three daily questions and persists difficulty points once each", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const { cookie, userId } = await h.register();
  const ids = new Set<string>();
  const levels = [
    "basic",
    "basic",
    "basic",
    "basic",
    "basic",
    "applied",
    "advanced",
  ];
  const awards = [];
  for (const level of levels) {
    const challenge = await h.request(
      "/api/challenges/next",
      { level, mode: "practice" },
      cookie,
    );
    assert.equal(challenge.status, 200);
    assert.equal(challenge.body.problem.level, level);
    assert.equal(challenge.body.run, undefined);
    assert.equal(challenge.body.serverNow, h.time());
    assert.equal("correctIndex" in challenge.body.problem, false);
    assert.equal("explanation" in challenge.body.problem, false);
    assert.ok(challenge.body.problem.id.length <= 80);
    ids.add(challenge.body.problem.id);
    const body = { choiceIndex: h.choice(challenge.body, userId) };
    const result = await h.request(
      answerPath(challenge.body.problem.id),
      body,
      cookie,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.correct, true);
    awards.push(result.body.pointsEarned);
    const duplicate = await h.request(
      answerPath(challenge.body.problem.id),
      body,
      cookie,
    );
    assert.equal(duplicate.body.pointsEarned, 0);
    assert.equal(duplicate.body.alreadySolved, true);
  }
  assert.equal(ids.size, levels.length);
  assert.deepEqual(awards, [1, 1, 1, 1, 1, 3, 5]);
  const stats = (await h.request("/api/stats", undefined, cookie)).body;
  assert.equal(stats.totalPoints, 13);
  assert.equal(stats.solvedCount, 7);
  assert.deepEqual(stats.levelCounts, { basic: 5, applied: 1, advanced: 1 });
  assert.equal(
    (await h.request("/api/rankings?period=week", undefined, cookie)).body.me
      .points,
    13,
  );
});

test("signed questions reject tampering and another account; guest practice gives explanations with zero points", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const first = await h.register("first_user");
  const second = await h.register("second_user");
  const challenge = await h.request(
    "/api/challenges/start",
    { level: "advanced", mode: "practice" },
    first.cookie,
  );
  const id = challenge.body.problem.id as string;
  const body = { choiceIndex: h.choice(challenge.body, first.userId) };
  assert.equal(
    (await h.request(answerPath(tamper(id)), body, first.cookie)).status,
    403,
  );
  assert.equal(
    (await h.request(answerPath(id.replace(".h.", ".b.")), body, first.cookie))
      .status,
    403,
  );
  assert.equal(
    (await h.request(answerPath(id), body, second.cookie)).status,
    403,
  );
  assert.equal((await h.request(answerPath(id), body)).status, 403);
  const guest = await h.request("/api/challenges/start", {
    level: "basic",
    mode: "practice",
  });
  const guestResult = await h.request(answerPath(guest.body.problem.id), {
    choiceIndex: h.choice(guest.body, 0),
  });
  assert.equal(guestResult.status, 200);
  assert.equal(guestResult.body.correct, true);
  assert.equal(guestResult.body.pointsEarned, 0);
  assert.ok(guestResult.body.explanation.length > 0);
  assert.equal(
    (
      await h.request(
        answerPath(guest.body.problem.id),
        { choiceIndex: 0 },
        first.cookie,
      )
    ).status,
    403,
  );
  for (const input of [
    { level: "missing", mode: "practice" },
    { level: "toString", mode: "practice" },
    { level: "basic", mode: "wrong" },
    {},
  ]) {
    assert.equal((await h.request("/api/challenges/start", input)).status, 400);
  }
});

test("time attack preserves a server-signed 180 second deadline across next requests and enforces expiry on answers", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const owner = await h.register();
  const other = await h.register("other_user");
  const startedAt = h.time();
  const start = await h.request(
    "/api/challenges/start",
    { level: "applied", mode: "time-attack" },
    owner.cookie,
  );
  assert.equal(start.status, 200);
  assert.equal(start.body.run.durationSeconds, 180);
  assert.equal(start.body.run.endsAt, startedAt + 180000);
  const runToken = start.body.run.token;
  const originalId = start.body.problem.id;
  const answer = h.choice(start.body, owner.userId);
  h.setTime(startedAt + 30000);
  const next = await h.request(
    "/api/challenges/next",
    { level: "applied", mode: "time-attack", runToken },
    owner.cookie,
  );
  assert.equal(next.status, 200);
  assert.equal(next.body.run.endsAt, start.body.run.endsAt);
  assert.equal(next.body.run.token, runToken);
  assert.notEqual(next.body.problem.id, originalId);
  assert.equal(
    (
      await h.request(
        "/api/challenges/next",
        { level: "basic", mode: "time-attack", runToken },
        owner.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await h.request(
        "/api/challenges/next",
        { level: "applied", mode: "time-attack", runToken },
        other.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await h.request(
        "/api/challenges/next",
        { level: "applied", mode: "time-attack", runToken: tamper(runToken) },
        owner.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await h.request(
        answerPath(originalId),
        { choiceIndex: answer },
        owner.cookie,
      )
    ).status,
    403,
  );
  const separateRun = await h.request(
    "/api/challenges/start",
    { level: "applied", mode: "time-attack" },
    owner.cookie,
  );
  assert.equal(
    (
      await h.request(
        answerPath(originalId),
        { choiceIndex: answer, runToken: separateRun.body.run.token },
        owner.cookie,
      )
    ).status,
    403,
  );
  const correct = await h.request(
    answerPath(originalId),
    { choiceIndex: answer, runToken },
    owner.cookie,
  );
  assert.equal(correct.body.pointsEarned, 3);
  h.setTime(startedAt + 180000);
  const tooLate = await h.request(
    answerPath(next.body.problem.id),
    { choiceIndex: 0, runToken },
    owner.cookie,
  );
  assert.equal(tooLate.status, 410);
  assert.match(tooLate.body.error, /制限時間/);
  assert.equal(
    (
      await h.request(
        "/api/challenges/next",
        { level: "applied", mode: "time-attack", runToken },
        owner.cookie,
      )
    ).status,
    410,
  );
  assert.equal(
    (await h.request("/api/stats", undefined, owner.cookie)).body.totalPoints,
    3,
  );
});

test("a time attack can cross midnight and records points on the actual Japanese solve date", async (t) => {
  const h = await harness(new Date("2026-10-28T14:59:30Z"));
  t.after(() => h.close());
  const { cookie, userId } = await h.register();
  const start = await h.request(
    "/api/challenges/start",
    { level: "basic", mode: "time-attack" },
    cookie,
  );
  assert.equal(start.body.problem.date, "2026-10-28");
  const answer = h.choice(start.body, userId);
  h.setTime(h.time() + 40000);
  const next = await h.request(
    "/api/challenges/next",
    { level: "basic", mode: "time-attack", runToken: start.body.run.token },
    cookie,
  );
  assert.equal(next.body.problem.date, "2026-10-29");
  assert.equal(next.body.run.endsAt, start.body.run.endsAt);
  assert.equal(
    (
      await h.request(
        answerPath(start.body.problem.id),
        { choiceIndex: answer, runToken: start.body.run.token },
        cookie,
      )
    ).body.pointsEarned,
    1,
  );
  const activity = (await h.request("/api/stats", undefined, cookie)).body
    .activity;
  assert.deepEqual(activity, [{ date: "2026-10-29", count: 1, points: 1 }]);
});

test("signed practice and run tokens survive fresh service instances and remain under database ID limits", () => {
  const first = new Challenges(SIGNING_KEY);
  const second = new Challenges(SIGNING_KEY);
  const time = new Date("2026-10-28T05:00:00Z");
  for (const mode of ["practice", "time-attack"] as const) {
    const issued = first.issue(
      "advanced",
      mode,
      2147483647,
      time,
      undefined,
      true,
    );
    assert.ok(issued.problem.id.length <= 80);
    const privateProblem = second.resolve(
      issued.problem.id,
      2147483647,
      time,
      issued.run?.token,
    );
    assert.equal(privateProblem.id, issued.problem.id);
    assert.equal(privateProblem.level, "advanced");
  }
});

test("issuance throttling is a short request limit and never a daily question cap", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  for (let index = 0; index < 80; index++)
    assert.equal(
      (
        await h.request("/api/challenges/next", {
          level: "basic",
          mode: "practice",
        })
      ).status,
      200,
    );
  const limited = await h.request("/api/challenges/next", {
    level: "basic",
    mode: "practice",
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.retryAfter, "60");
  h.setTime(h.time() + 60000);
  assert.equal(
    (
      await h.request("/api/challenges/next", {
        level: "basic",
        mode: "practice",
      })
    ).status,
    200,
  );
});
