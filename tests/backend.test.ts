import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.ts";
import { getProblems } from "../server/problems.ts";
import { todayJST, weekStartJST, isDateKey, addDays } from "../shared/date.ts";
import type { Database } from "../server/db.ts";

async function harness(
  clock = new Date("2026-10-28T05:00:00Z"),
  path = ":memory:",
) {
  let current = clock;
  const app = createApp(path, { now: () => current, secureCookies: false });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function request(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      cookie?: string;
      origin?: string;
    } = {},
  ) {
    const response = await fetch(`${base}${path}`, {
      method: options.method || "GET",
      headers: {
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(options.cookie ? { Cookie: options.cookie } : {}),
        ...(options.origin ? { Origin: options.origin } : {}),
      },
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const body = await response.json();
    return {
      status: response.status,
      body,
      cookie: response.headers.get("set-cookie")?.split(";")[0],
      headers: response.headers,
    };
  }
  return {
    app,
    request,
    db: app.locals.db as Database,
    setTime: (date: Date) => {
      current = date;
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

async function register(
  h: Awaited<ReturnType<typeof harness>>,
  username = "微積さん",
) {
  const result = await h.request("/api/auth/register", {
    method: "POST",
    body: { username, password: "0123" },
  });
  assert.equal(result.status, 201);
  assert.ok(result.cookie);
  return result;
}

test("Japanese date and week boundaries are independent of server timezone", () => {
  assert.equal(todayJST(new Date("2026-10-25T14:59:59Z")), "2026-10-25");
  assert.equal(todayJST(new Date("2026-10-25T15:00:00Z")), "2026-10-26");
  assert.equal(weekStartJST(new Date("2026-10-25T14:59:59Z")), "2026-10-19");
  assert.equal(weekStartJST(new Date("2026-10-25T15:00:00Z")), "2026-10-26");
  assert.equal(addDays("2028-03-01", -1), "2028-02-29");
  assert.ok(isDateKey("2028-02-29"));
  assert.equal(isDateKey("2026-02-29"), false);
});

test("username and four-digit PIN registration, normalization, hashed secrets and logout", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const invalid = await h.request("/api/auth/register", {
    method: "POST",
    body: { username: "a", password: "12345" },
  });
  assert.equal(invalid.status, 400);
  const created = await register(h, "Ｃalculus");
  assert.equal(created.body.user.username, "Calculus");
  assert.match(created.headers.get("set-cookie")!, /HttpOnly/);
  assert.match(created.headers.get("set-cookie")!, /SameSite=Lax/);
  const stored = h.db.prepare("SELECT * FROM users").get()!;
  assert.notEqual(stored.password_hash, "0123");
  assert.equal(String(stored.password_hash).length, 128);
  assert.equal(
    (await h.request("/api/session", { cookie: created.cookie })).body.user
      .username,
    "Calculus",
  );
  const duplicate = await h.request("/api/auth/register", {
    method: "POST",
    body: { username: "calculus", password: "9999" },
  });
  assert.equal(duplicate.status, 409);
  assert.equal(
    (
      await h.request("/api/auth/login", {
        method: "POST",
        body: { username: "CALCULUS", password: "1234" },
      })
    ).status,
    401,
  );
  const login = await h.request("/api/auth/login", {
    method: "POST",
    body: { username: "CALCULUS", password: "0123" },
  });
  assert.equal(login.status, 200);
  await h.request("/api/auth/logout", { method: "POST", cookie: login.cookie });
  assert.equal(
    (await h.request("/api/session", { cookie: login.cookie })).body.user,
    null,
  );
  h.setTime(new Date("2026-12-01T00:00:00Z"));
  assert.equal(
    (await h.request("/api/session", { cookie: created.cookie })).body.user,
    null,
  );
});

test("public problems omit answers, guests can practice, malformed and future problems are rejected", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const daily = await h.request("/api/problems");
  assert.equal(daily.body.date, "2026-10-28");
  assert.equal(daily.body.problems.length, 3);
  assert.equal("correctIndex" in daily.body.problems[0], false);
  assert.equal("explanation" in daily.body.problems[0], false);
  const basic = getProblems("2026-10-28")[0];
  const answer = await h.request(
    `/api/problems/${encodeURIComponent(basic.id)}/answer`,
    { method: "POST", body: { choiceIndex: basic.correctIndex } },
  );
  assert.equal(answer.body.correct, true);
  assert.equal(answer.body.pointsEarned, 0);
  assert.equal((await h.request("/api/stats")).body.solvedCount, 0);
  assert.equal((await h.request("/api/problems?date=2026-10-29")).status, 400);
  assert.equal((await h.request("/api/problems?date=2026-02-30")).status, 400);
  assert.equal(
    (
      await h.request(`/api/problems/${encodeURIComponent(basic.id)}/answer`, {
        method: "POST",
        body: { choiceIndex: 9 },
      })
    ).status,
    400,
  );
  assert.equal(
    (await h.request("/api/archive?level=basic")).body.problems.length,
    30,
  );
  assert.equal((await h.request("/api/archive?level=unknown")).status, 400);
  assert.equal((await h.request("/api/archive?level=toString")).status, 400);
  assert.equal(
    (
      await h.request("/api/problems/%ZZ/answer", {
        method: "POST",
        body: { choiceIndex: 0 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await h.request("/api/auth/register", {
        method: "POST",
        body: { username: "x".repeat(9000), password: "0123" },
      })
    ).status,
    413,
  );
});

test("only correct answers award difficulty points, duplicate and simultaneous submissions never award twice", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const { cookie } = await register(h);
  const problems = getProblems("2026-10-28");
  const [basic] = problems;
  const wrong = await h.request(
    `/api/problems/${encodeURIComponent(basic.id)}/answer`,
    {
      method: "POST",
      cookie,
      body: { choiceIndex: (basic.correctIndex + 1) % basic.choices.length },
    },
  );
  assert.equal(wrong.body.correct, false);
  assert.equal(wrong.body.pointsEarned, 0);
  for (const problem of problems) {
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        h.request(`/api/problems/${encodeURIComponent(problem.id)}/answer`, {
          method: "POST",
          cookie,
          body: { choiceIndex: problem.correctIndex },
        }),
      ),
    );
    assert.equal(
      results.reduce((sum, row) => sum + row.body.pointsEarned, 0),
      { basic: 1, applied: 3, advanced: 5 }[problem.level],
    );
    assert.equal(results.filter((row) => row.body.alreadySolved).length, 2);
  }
  const stats = (await h.request("/api/stats", { cookie })).body;
  assert.equal(stats.totalPoints, 9);
  assert.equal(stats.weeklyPoints, 9);
  assert.equal(stats.solvedCount, 3);
  assert.equal(stats.streak, 1);
  assert.deepEqual(stats.levelCounts, { basic: 1, applied: 1, advanced: 1 });
  assert.deepEqual(stats.activity, [
    { date: "2026-10-28", count: 3, points: 9 },
  ]);
});

test("leaderboard caps display at 25, returns own rank beyond the cap and separates weekly points", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const own = await register(h, "zz_me");
  for (let i = 1; i <= 30; i++) {
    const result = h.db
      .prepare(
        "INSERT INTO users(username,username_key,password_hash,password_salt,created_at) VALUES (?,?,?,?,?)",
      )
      .run(
        `user_${String(i).padStart(2, "0")}`,
        `user_${i}`,
        "seed",
        "seed",
        "2026-10-01T00:00:00Z",
      );
    const id = Number(result.lastInsertRowid);
    for (let j = 0; j < i; j++)
      h.db
        .prepare("INSERT INTO solves VALUES (?,?,?,?,?,?)")
        .run(id, `old-${j}`, "basic", 1, "2026-10-25T14:00:00Z", "2026-10-25");
  }
  let result = (
    await h.request("/api/rankings?period=all", { cookie: own.cookie })
  ).body;
  assert.equal(result.entries.length, 25);
  assert.equal(result.totalUsers, 31);
  assert.equal(result.me.rank, 31);
  assert.equal(result.me.username, "zz_me");
  assert.equal(result.entries[0].points, 30);
  const advanced = getProblems("2026-10-28").find(
    (p) => p.level === "advanced",
  )!;
  await h.request(`/api/problems/${encodeURIComponent(advanced.id)}/answer`, {
    method: "POST",
    cookie: own.cookie,
    body: { choiceIndex: advanced.correctIndex },
  });
  result = (
    await h.request("/api/rankings?period=week", { cookie: own.cookie })
  ).body;
  assert.equal(result.weekStart, "2026-10-26");
  assert.equal(result.me.rank, 1);
  assert.equal(result.me.points, 5);
  assert.equal(result.entries[0].isYou, true);
  assert.equal(result.entries[1].points, 0);
  const stats = (await h.request("/api/stats", { cookie: own.cookie })).body;
  assert.equal(stats.weeklyPoints, 5);
});

test("cross-origin writes and repeated PIN guesses are blocked", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const blocked = await h.request("/api/auth/register", {
    method: "POST",
    body: { username: "bad_origin", password: "0123" },
    origin: "https://other.example",
  });
  assert.equal(blocked.status, 403);
  await register(h, "protected");
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await h.request("/api/auth/login", {
          method: "POST",
          body: { username: "protected", password: "9999" },
        })
      ).status,
      401,
    );
  const limited = await h.request("/api/auth/login", {
    method: "POST",
    body: { username: "protected", password: "0123" },
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "900");
  h.setTime(new Date("2026-10-28T05:16:00Z"));
  assert.equal(
    (
      await h.request("/api/auth/login", {
        method: "POST",
        body: { username: "protected", password: "0123" },
      })
    ).status,
    200,
  );
});

test("accounts, sessions and progress survive reopening the database; streak tolerates an unfinished today", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "daily-calculus-"));
  const path = join(directory, "progress.sqlite");
  const clock = new Date("2026-10-28T05:00:00Z");
  const first = await harness(clock, path);
  const account = await register(first, "persistent");
  const id = account.body.user.id;
  for (const date of ["2026-10-25", "2026-10-26", "2026-10-27"]) {
    first.db
      .prepare("INSERT INTO solves VALUES (?,?,?,?,?,?)")
      .run(id, `${date}:basic`, "basic", 1, `${date}T05:00:00Z`, date);
  }
  await first.close();
  const second = await harness(clock, path);
  t.after(async () => {
    await second.close();
    rmSync(directory, { recursive: true, force: true });
  });
  assert.equal(
    (await second.request("/api/session", { cookie: account.cookie })).body.user
      .username,
    "persistent",
  );
  const stats = (await second.request("/api/stats", { cookie: account.cookie }))
    .body;
  assert.equal(stats.totalPoints, 3);
  assert.equal(stats.weeklyPoints, 2);
  assert.equal(stats.streak, 3);
  second.setTime(new Date("2026-10-29T05:00:00Z"));
  assert.equal(
    (await second.request("/api/stats", { cookie: account.cookie })).body
      .streak,
    0,
  );
});
