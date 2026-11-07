import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.js";
import { Challenges } from "../server/challenges.js";
import type { ChallengeResponse } from "../shared/types.js";
import { generatePracticeProblem } from "../server/practice-problems.js";
import { generateBankProblem } from "../server/problem-bank/index.js";

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
    const resolved = signer.resolve(
      response.problem.id,
      userId,
      current,
      response.run?.token,
    );
    assert.equal(resolved.formula, response.problem.formula);
    assert.deepEqual(resolved.choices, response.problem.choices);
    assert.equal(resolved.subject, response.problem.subject);
    return resolved.correctIndex;
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
    assert.match(challenge.body.problem.id, /^c2p\./);
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

test("subject selection stays fixed across next questions in every difficulty and both modes, with unchanged points", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const owner = await h.register();
  let expectedPoints = 0;
  for (const level of ["basic", "applied", "advanced"] as const) {
    for (const mode of ["practice", "time-attack"] as const) {
      for (const subject of ["differentiation", "integration"] as const) {
        let runToken: string | undefined;
        let deadline: number | undefined;
        for (let index = 0; index < 3; index++) {
          const challenge = await h.request(
            `/api/challenges/${index === 0 ? "start" : "next"}`,
            { level, mode, subject, runToken },
            owner.cookie,
          );
          assert.equal(challenge.status, 200);
          assert.equal(challenge.body.problem.subject, subject);
          assert.equal(challenge.body.problem.level, level);
          if (mode === "time-attack") {
            if (index === 0) {
              runToken = challenge.body.run.token;
              deadline = challenge.body.run.endsAt;
            }
            assert.equal(challenge.body.run.token, runToken);
            assert.equal(challenge.body.run.endsAt, deadline);
          }
          const result = await h.request(
            answerPath(challenge.body.problem.id),
            { choiceIndex: h.choice(challenge.body, owner.userId), runToken },
            owner.cookie,
          );
          const award = { basic: 1, applied: 3, advanced: 5 }[level];
          assert.equal(result.status, 200);
          assert.equal(result.body.pointsEarned, award);
          expectedPoints += award;
          const duplicate = await h.request(
            answerPath(challenge.body.problem.id),
            { choiceIndex: h.choice(challenge.body, owner.userId), runToken },
            owner.cookie,
          );
          assert.equal(duplicate.body.pointsEarned, 0);
        }
      }
    }
  }
  assert.equal(expectedPoints, 108);
  const stats = (await h.request("/api/stats", undefined, owner.cookie)).body;
  assert.equal(stats.totalPoints, expectedPoints);
  assert.equal(stats.solvedCount, 36);
});

function fixtureSign(domain: "problem" | "run", payload: string): string {
  return createHmac("sha256", SIGNING_KEY)
    .update(`daily-calculus:${domain}:${payload}`)
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}

test("invalid subjects, mid-run subject changes, tampered subject codes and mismatched generated subjects are rejected", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const owner = await h.register();
  for (const subject of [
    "",
    "derivative",
    "ALL",
    "toString",
    null,
    1,
    {},
    [],
  ]) {
    for (const path of ["start", "next"]) {
      const result = await h.request(
        `/api/challenges/${path}`,
        { level: "basic", mode: "practice", subject },
        owner.cookie,
      );
      assert.equal(result.status, 400);
    }
  }
  const challenge = await h.request(
    "/api/challenges/start",
    { level: "basic", mode: "time-attack", subject: "integration" },
    owner.cookie,
  );
  assert.equal(challenge.status, 200);
  const runToken = challenge.body.run.token;
  for (const subject of ["all", "differentiation", undefined]) {
    assert.equal(
      (
        await h.request(
          "/api/challenges/next",
          { level: "basic", mode: "time-attack", subject, runToken },
          owner.cookie,
        )
      ).status,
      403,
    );
  }
  const changed = runToken.split(".");
  assert.equal(changed[0], "r2");
  changed[5] = "d";
  const tampered = changed.join(".");
  assert.equal(
    (
      await h.request(
        "/api/challenges/next",
        {
          level: "basic",
          mode: "time-attack",
          subject: "differentiation",
          runToken: tampered,
        },
        owner.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await h.request(
        answerPath(challenge.body.problem.id),
        { choiceIndex: 0, runToken: tampered },
        owner.cookie,
      )
    ).status,
    403,
  );
  // A valid signed question still must match its run's selected subject.
  // Construct a server-signed differentiation fixture with the same run nonce.
  let seed = "";
  for (let candidate = 0; candidate < 100; candidate++) {
    const value = candidate.toString(16).padStart(16, "0");
    if (
      generateBankProblem(
        "basic",
        value,
        challenge.body.problem.date,
        "fixture",
      ).subject === "differentiation"
    ) {
      seed = value;
      break;
    }
  }
  assert.ok(seed);
  const parts = challenge.body.problem.id.split(".");
  parts[4] = seed;
  const payload = parts.slice(0, 6).join(".");
  const mismatchedId = `${payload}.${fixtureSign("problem", payload)}`;
  assert.equal(
    (
      await h.request(
        answerPath(mismatchedId),
        { choiceIndex: 0, runToken },
        owner.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (await h.request("/api/stats", undefined, owner.cookie)).body.totalPoints,
    0,
  );
});

test("legacy signed question IDs and r1 runs resolve unchanged and continue as mixed-subject challenges", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const owner = await h.register();
  const date = "2026-10-28";
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000).toString(
    36,
  );
  const seed = "0123456789abcdef";
  const nonce = Buffer.alloc(8, 7).toString("base64url");
  const runPayload = [
    "r1",
    "b",
    owner.userId.toString(36),
    h.time().toString(36),
    nonce,
  ].join(".");
  const runToken = `${runPayload}.${fixtureSign("run", runPayload)}`;
  const signer = new Challenges(SIGNING_KEY);
  for (const prefix of ["c1p", "c1t"]) {
    const payload = [
      prefix,
      "b",
      day,
      owner.userId.toString(36),
      seed,
      prefix === "c1t" ? nonce : "-",
    ].join(".");
    const id = `${payload}.${fixtureSign("problem", payload)}`;
    const expected = generatePracticeProblem("basic", seed, date, id);
    assert.deepEqual(
      signer.resolve(
        id,
        owner.userId,
        new Date(h.time()),
        prefix === "c1t" ? runToken : undefined,
      ),
      expected,
    );
    const answer = await h.request(
      answerPath(id),
      {
        choiceIndex: expected.correctIndex,
        ...(prefix === "c1t" ? { runToken } : {}),
      },
      owner.cookie,
    );
    assert.equal(answer.status, 200);
    assert.equal(answer.body.pointsEarned, 1);
  }
  const next = await h.request(
    "/api/challenges/next",
    { level: "basic", mode: "time-attack", runToken },
    owner.cookie,
  );
  assert.equal(next.status, 200);
  assert.equal(next.body.run.token, runToken);
  assert.equal(next.body.run.endsAt, h.time() + 180000);
  assert.ok(
    ["differentiation", "integration"].includes(next.body.problem.subject),
  );
  assert.equal(
    (
      await h.request(
        "/api/challenges/next",
        {
          level: "basic",
          mode: "time-attack",
          subject: "integration",
          runToken,
        },
        owner.cookie,
      )
    ).status,
    403,
  );
});

test("legacy c1 signed seeds retain exact math and answer order under filtered r2 runs", () => {
  const signer = new Challenges(SIGNING_KEY);
  const date = "2026-11-07";
  const time = new Date(`${date}T05:00:00Z`);
  const uid = 17;
  const seed = "0123456789abcdef";
  const nonce = Buffer.alloc(8, 9).toString("base64url");
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000).toString(
    36,
  );
  const snapshots = [
    {
      level: "basic",
      code: "b",
      formula: "f(x)=11x^{2}+x",
      choices: ["-89", "88", "90", "89"],
      correctIndex: 3,
    },
    {
      level: "applied",
      code: "a",
      formula: "f(x)=(5x+1)^{2}",
      choices: ["-110", "22", "220", "110"],
      correctIndex: 3,
    },
    {
      level: "advanced",
      code: "h",
      formula: "\\lim_{x\\to0}\\frac{4(e^{7x}-1-7x)}{x^2}",
      choices: ["-98", "196", "14", "98"],
      correctIndex: 3,
    },
  ] as const;
  for (const snapshot of snapshots) {
    const runPayload = [
      "r2",
      snapshot.code,
      uid.toString(36),
      time.getTime().toString(36),
      nonce,
      "d",
    ].join(".");
    const runToken = `${runPayload}.${fixtureSign("run", runPayload)}`;
    for (const prefix of ["c1p", "c1t"]) {
      const payload = [
        prefix,
        snapshot.code,
        day,
        uid.toString(36),
        seed,
        prefix === "c1t" ? nonce : "-",
      ].join(".");
      const id = `${payload}.${fixtureSign("problem", payload)}`;
      const problem = signer.resolve(
        id,
        uid,
        time,
        prefix === "c1t" ? runToken : undefined,
      );
      assert.deepEqual(
        {
          formula: problem.formula,
          choices: problem.choices,
          correctIndex: problem.correctIndex,
        },
        {
          formula: snapshot.formula,
          choices: [...snapshot.choices],
          correctIndex: snapshot.correctIndex,
        },
      );
      assert.equal(problem.subject, "differentiation");
      assert.throws(
        () =>
          signer.resolve(
            id.replace("c1", "c2"),
            uid,
            time,
            prefix === "c1t" ? runToken : undefined,
          ),
        (error: unknown) =>
          error instanceof Error && "status" in error && error.status === 403,
      );
    }
  }
});
