import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.js";
import { SqliteStore, SupabaseStore, type Store } from "../server/store.js";
import { getProblems } from "../server/problems.js";

async function harness(store: Store = new SqliteStore(":memory:")) {
  let clock = new Date("2026-11-01T05:00:00Z");
  const app = createApp(undefined, {
    store,
    now: () => clock,
    secureCookies: false,
  });
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
      method: options.method || (options.body !== undefined ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(options.cookie ? { Cookie: options.cookie } : {}),
        ...(options.origin ? { Origin: options.origin } : {}),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
      setCookie: response.headers.get("set-cookie"),
    };
  }
  async function register(username: string) {
    const response = await request("/api/auth/register", {
      body: { username, password: "0123" },
    });
    assert.equal(response.status, 201);
    return {
      id: response.body.user.id as number,
      username,
      cookie: response.cookie!,
    };
  }
  async function login(username: string) {
    const response = await request("/api/auth/login", {
      body: { username, password: "0123" },
    });
    assert.equal(response.status, 200);
    return response.cookie!;
  }
  async function solve(cookie: string, level: "basic" | "advanced") {
    const problem = getProblems("2026-11-01").find((p) => p.level === level)!;
    const response = await request(
      `/api/problems/${encodeURIComponent(problem.id)}/answer`,
      { body: { choiceIndex: problem.correctIndex }, cookie },
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.pointsEarned, level === "basic" ? 1 : 5);
  }
  return {
    app,
    store,
    request,
    register,
    login,
    solve,
    expireSessions: () => {
      clock = new Date("2026-12-03T05:00:00Z");
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          store.db?.close();
          error ? reject(error) : resolve();
        });
      }),
  };
}

for (const path of ["/api/auth/logout", "/api/account"]) {
  test(`${path} deletes only the authenticated account, cascading all sessions/scores and permitting fresh registration`, async (t) => {
    const h = await harness();
    t.after(() => h.close());
    const own = await h.register("delete_this_user");
    const other = await h.register("keep_this_user");
    const otherSession = await h.login(own.username);
    await h.solve(own.cookie, "advanced");
    await h.solve(other.cookie, "basic");
    const deletion = await h.request(path, {
      method: path === "/api/account" ? "DELETE" : "POST",
      cookie: own.cookie,
      body: {
        ...(path === "/api/account"
          ? { confirmation: "DELETE" }
          : { deleteAccount: true }),
        userId: other.id,
        username: other.username,
      },
    });
    assert.equal(deletion.status, 200);
    assert.deepEqual(deletion.body, { success: true, accountDeleted: true });
    assert.match(deletion.setCookie!, /Expires=Thu, 01 Jan 1970/);
    assert.equal(
      (await h.request("/api/session", { cookie: own.cookie })).body.user,
      null,
    );
    assert.equal(
      (await h.request("/api/session", { cookie: otherSession })).body.user,
      null,
    );
    assert.equal(await h.store.userByKey(own.username), null);
    assert.equal(
      Number(
        h.store
          .db!.prepare(
            "SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?",
          )
          .get(own.id)!.count,
      ),
      0,
    );
    assert.equal(
      Number(
        h.store
          .db!.prepare("SELECT COUNT(*) AS count FROM solves WHERE user_id = ?")
          .get(own.id)!.count,
      ),
      0,
    );
    assert.equal(
      (await h.request("/api/session", { cookie: other.cookie })).body.user.id,
      other.id,
    );
    assert.equal(
      (await h.request("/api/stats", { cookie: other.cookie })).body
        .totalPoints,
      1,
    );
    const ranking = (
      await h.request("/api/rankings?period=all", { cookie: other.cookie })
    ).body;
    assert.equal(ranking.totalUsers, 1);
    assert.deepEqual(
      ranking.entries.map((entry: { username: string; points: number }) => ({
        username: entry.username,
        points: entry.points,
      })),
      [{ username: other.username, points: 1 }],
    );
    assert.equal(
      (
        await h.request("/api/auth/login", {
          body: { username: own.username, password: "0123" },
        })
      ).status,
      401,
    );
    const fresh = await h.register(own.username);
    assert.notEqual(fresh.id, own.id);
    assert.equal(
      (await h.request("/api/stats", { cookie: fresh.cookie })).body
        .totalPoints,
      0,
    );
    assert.equal(
      (await h.request("/api/session", { cookie: otherSession })).body.user,
      null,
    );
  });
}

test("legacy logout without an explicit deletion flag preserves the account, progress and other sessions", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const own = await h.register("legacy_client");
  const secondSession = await h.login(own.username);
  await h.solve(own.cookie, "advanced");
  const logout = await h.request("/api/auth/logout", {
    method: "POST",
    cookie: own.cookie,
  });
  assert.equal(logout.status, 200);
  assert.deepEqual(logout.body, { success: true });
  assert.ok(await h.store.userByKey(own.username));
  assert.equal(
    (await h.request("/api/session", { cookie: own.cookie })).body.user,
    null,
  );
  assert.equal(
    (await h.request("/api/session", { cookie: secondSession })).body.user.id,
    own.id,
  );
  assert.equal(
    (await h.request("/api/stats", { cookie: secondSession })).body.totalPoints,
    5,
  );
  const thirdSession = await h.login(own.username);
  const explicitKeep = await h.request("/api/auth/logout", {
    body: { deleteAccount: false },
    cookie: thirdSession,
  });
  assert.equal(explicitKeep.status, 200);
  assert.ok(await h.store.userByKey(own.username));
  assert.equal(
    (await h.request("/api/auth/logout", { method: "POST" })).status,
    200,
  );
});

test("deletion rejects anonymous/expired sessions, missing or inexact confirmation, and cross-origin writes", async (t) => {
  const h = await harness();
  t.after(() => h.close());
  const own = await h.register("protected_account");
  for (const body of [
    {},
    { confirmation: "delete" },
    { confirmation: " DELETE" },
    { confirmation: "DELETE " },
    { confirmation: true },
  ]) {
    const response = await h.request("/api/account", {
      method: "DELETE",
      body,
      cookie: own.cookie,
    });
    assert.equal(response.status, 400);
    assert.equal(response.setCookie, null);
  }
  const wrongFlag = await h.request("/api/auth/logout", {
    body: { deleteAccount: "true" },
    cookie: own.cookie,
  });
  assert.equal(wrongFlag.status, 400);
  assert.equal(wrongFlag.setCookie, null);
  for (const path of ["/api/account", "/api/auth/logout"]) {
    const method = path === "/api/account" ? "DELETE" : "POST";
    const body =
      path === "/api/account"
        ? { confirmation: "DELETE", userId: own.id }
        : { deleteAccount: true, userId: own.id };
    const blocked = await h.request(path, {
      method,
      body,
      cookie: own.cookie,
      origin: "https://untrusted.example",
    });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.setCookie, null);
    const anonymous = await h.request(path, { method, body });
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.setCookie, null);
  }
  assert.ok(await h.store.userByKey(own.username));
  assert.equal(
    (await h.request("/api/session", { cookie: own.cookie })).body.user.id,
    own.id,
  );
  h.expireSessions();
  const expired = await h.request("/api/auth/logout", {
    body: { deleteAccount: true },
    cookie: own.cookie,
  });
  assert.equal(expired.status, 401);
  assert.equal(expired.setCookie, null);
  assert.ok(await h.store.userByKey(own.username));
});

test("storage deletion failure returns an error without clearing the cookie or claiming success", async (t) => {
  class FailingDeleteStore extends SqliteStore {
    override async deleteUser(_userId: number): Promise<void> {
      throw new Error("Simulated storage failure");
    }
  }
  t.mock.method(console, "error", () => {});
  const h = await harness(new FailingDeleteStore(":memory:"));
  t.after(() => h.close());
  const own = await h.register("keep_on_failure");
  const secondSession = await h.login(own.username);
  await h.solve(own.cookie, "advanced");
  for (const path of ["/api/account", "/api/auth/logout"]) {
    const response = await h.request(path, {
      method: path === "/api/account" ? "DELETE" : "POST",
      body:
        path === "/api/account"
          ? { confirmation: "DELETE" }
          : { deleteAccount: true },
      cookie: own.cookie,
    });
    assert.equal(response.status, 500);
    assert.equal(response.body.success, undefined);
    assert.equal(response.setCookie, null);
    assert.doesNotMatch(response.body.error, /Simulated/);
  }
  assert.equal(
    (await h.request("/api/session", { cookie: own.cookie })).body.user.id,
    own.id,
  );
  assert.equal(
    (await h.request("/api/session", { cookie: secondSession })).body.user.id,
    own.id,
  );
  assert.equal(
    (await h.request("/api/stats", { cookie: own.cookie })).body.totalPoints,
    5,
  );
});

test("cloud deletion uses the narrow guarded RPC and propagates a rejected database request", async () => {
  const config = {
    url: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    storeKey: "a".repeat(64),
  };
  const store = new SupabaseStore(config, async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.p_operation, "user_delete");
    assert.deepEqual(body.p_payload, { userId: 42 });
    assert.equal(body.p_key, config.storeKey);
    return new Response("null", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  await store.deleteUser(42);
  const failed = new SupabaseStore(
    config,
    async () => new Response("database details stay private", { status: 503 }),
  );
  await assert.rejects(
    failed.deleteUser(42),
    /Cloud storage request failed \(503\)/,
  );
});
