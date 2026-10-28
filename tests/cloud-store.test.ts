import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import {
  SupabaseStore,
  SqliteStore,
  configuredStore,
  type NewUser,
  type SolveInput,
} from "../server/store.ts";
import { createApp } from "../server/app.ts";
import { getProblems } from "../server/problems.ts";

const config = {
  url: "https://example.supabase.co",
  publishableKey: "sb_publishable_test",
  storeKey: "a".repeat(64),
};
function rpcFixture() {
  const local = new SqliteStore(":memory:");
  const calls: { operation: string; payload: Record<string, unknown> }[] = [];
  const request: typeof fetch = async (input, init) => {
    assert.equal(
      String(input),
      "https://example.supabase.co/rest/v1/rpc/dc_store",
    );
    assert.equal(init?.method, "POST");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("apikey"), config.publishableKey);
    assert.equal(
      headers.has("Authorization"),
      false,
      "publishable API keys are not JWT bearer tokens",
    );
    const body = JSON.parse(String(init?.body));
    assert.equal(body.p_key, config.storeKey);
    const p = body.p_payload;
    calls.push({ operation: body.p_operation, payload: p });
    let result: unknown;
    switch (body.p_operation) {
      case "user_by_key":
        result = await local.userByKey(p.key);
        break;
      case "user_create":
        result = await local.createUser(p as NewUser);
        break;
      case "session_get":
        result = await local.sessionUser(p.tokenHash, p.nowMs);
        break;
      case "session_create":
        await local.createSession(p.tokenHash, p.userId, p.expiresAt, p.nowMs);
        result = null;
        break;
      case "session_delete":
        await local.deleteSession(p.tokenHash);
        result = null;
        break;
      case "rate_consume":
        result = await local.consumeLimit(p.key, p.maximum, p.nowMs);
        break;
      case "rate_clear":
        await local.clearLimit(p.key);
        result = null;
        break;
      case "solve_record":
        result = await local.recordSolve(p as SolveInput);
        break;
      case "stats":
        result = await local.stats(p.userId, p.weekStart, p.today);
        break;
      case "rankings":
        result = await local.rankings(p.userId, p.period, p.weekStart);
        break;
      default:
        throw new Error("Unexpected RPC operation");
    }
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { local, calls, request, cloud: new SupabaseStore(config, request) };
}

test("cloud RPC adapter preserves full account, scoring and session flows through asynchronous storage", async (t) => {
  const fixture = rpcFixture();
  const app = createApp(undefined, {
    store: fixture.cloud,
    now: () => new Date("2026-10-28T05:00:00Z"),
    secureCookies: false,
  });
  assert.equal(app.locals.db, undefined);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          fixture.local.db.close();
          error ? reject(error) : resolve();
        });
      }),
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
    return { status: response.status, body: await response.json() };
  }
  const created = await request("/api/auth/register", {
    username: "Cloud学習",
    password: "0123",
  });
  assert.equal(created.status, 201);
  assert.equal((await request("/api/session")).body.user.username, "Cloud学習");
  const problem = getProblems("2026-10-28").find(
    (p) => p.level === "advanced",
  )!;
  const first = await request(
    `/api/problems/${encodeURIComponent(problem.id)}/answer`,
    { choiceIndex: problem.correctIndex },
  );
  assert.equal(first.body.pointsEarned, 5);
  assert.equal(
    (
      await request(`/api/problems/${encodeURIComponent(problem.id)}/answer`, {
        choiceIndex: problem.correctIndex,
      })
    ).body.alreadySolved,
    true,
  );
  const stats = (await request("/api/stats")).body;
  assert.equal(stats.totalPoints, 5);
  assert.equal(stats.streak, 1);
  assert.equal((await request("/api/rankings?period=week")).body.me.points, 5);
  await request("/api/auth/logout", {});
  assert.equal((await request("/api/session")).body.user, null);
  assert.equal(
    (
      await request("/api/auth/login", {
        username: "cloud学習",
        password: "0123",
      })
    ).status,
    200,
  );
  assert.equal((await request("/api/stats")).body.totalPoints, 5);
  const createPayload = fixture.calls.find(
    (call) => call.operation === "user_create",
  )!.payload;
  assert.equal("password" in createPayload, false);
  assert.match(String(createPayload.hash), /^[a-f0-9]{128}$/);
});

test("cloud PIN attempts are shared by fresh adapter instances and cleared on success", async (t) => {
  const fixture = rpcFixture();
  t.after(() => fixture.local.db.close());
  for (let i = 0; i < 5; i++) {
    const fresh = new SupabaseStore(config, fixture.request);
    assert.equal(await fresh.consumeLimit("login-user:student", 5, 1000), true);
  }
  assert.equal(
    await new SupabaseStore(config, fixture.request).consumeLimit(
      "login-user:student",
      5,
      1000,
    ),
    false,
  );
  assert.equal(
    fixture.calls.some((call) => call.payload.key === "login-user:student"),
    false,
  );
  await fixture.cloud.clearLimit("login-user:student");
  assert.equal(
    await fixture.cloud.consumeLimit("login-user:student", 5, 1000),
    true,
  );
});

test("cloud configuration fails closed on Vercel and does not disclose error response bodies", async () => {
  const old = {
    VERCEL: process.env.VERCEL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
    CALCULUS_STORE_KEY: process.env.CALCULUS_STORE_KEY,
  };
  try {
    process.env.VERCEL = "1";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.CALCULUS_STORE_KEY;
    assert.throws(
      () => configuredStore(),
      /Cloud storage is required on Vercel/,
    );
    const local = configuredStore(":memory:");
    local.db!.close();
    process.env.SUPABASE_URL = config.url;
    process.env.SUPABASE_PUBLISHABLE_KEY = config.publishableKey;
    process.env.CALCULUS_STORE_KEY = config.storeKey;
    assert.ok(configuredStore() instanceof SupabaseStore);
  } finally {
    for (const [key, value] of Object.entries(old))
      value === undefined
        ? delete process.env[key]
        : (process.env[key] = value);
  }
  const failing = new SupabaseStore(
    config,
    async () => new Response("sensitive database error", { status: 500 }),
  );
  await assert.rejects(
    failing.userByKey("student"),
    (error) =>
      error instanceof Error &&
      error.message === "Cloud storage request failed (500).",
  );
  assert.throws(
    () => new SupabaseStore({ ...config, url: "http://example.supabase.co" }),
    /HTTPS/,
  );
});

test("PIN rate limits survive a local process/store restart and reset only after their window", async () => {
  const directory = mkdtempSync(join(tmpdir(), "daily-calculus-rate-"));
  const path = join(directory, "attempts.sqlite");
  let store = new SqliteStore(path);
  try {
    for (let i = 0; i < 5; i++)
      assert.equal(
        await store.consumeLimit("login-user:student", 5, 1000),
        true,
      );
    store.db.close();
    store = new SqliteStore(path);
    assert.equal(
      await store.consumeLimit("login-user:student", 5, 1001),
      false,
    );
    assert.equal(
      await store.consumeLimit("login-user:student", 5, 901001),
      true,
    );
  } finally {
    store.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
