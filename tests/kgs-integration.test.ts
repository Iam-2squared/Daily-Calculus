import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.js";
import { SqliteStore, SupabaseStore } from "../server/store.js";
import { getProblems } from "../server/problems.js";
import type { KgsIntegrationOptions } from "../server/kgs-integration.js";

const identitySecret = "identity-test-" + "a".repeat(40);
const targetSecret = "target-test-" + "b".repeat(40);
const proof = "p".repeat(43);
const member = { id: "00000000-0000-4000-8000-000000000001", name: "連携さん" };
const unlinked = { linked: false, conversionRate: 10000, member: null, balance: null, totalIncome: null, calculusIncome: null, syncPending: false };
const linked = { linked: true, conversionRate: 10000, member, balance: 90000, totalIncome: 190000, calculusIncome: 90000, syncPending: false };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

async function harness(request: typeof fetch = async () => json(unlinked), extra: KgsIntegrationOptions = {}) {
  const store = new SqliteStore(":memory:");
  const app = createApp(undefined, {
    store, now: () => new Date("2026-11-09T02:00:00Z"), secureCookies: false,
    integration: { identitySecret, targetSecret, identityUrl: "https://identity.example", targetUrl: "https://wallet.example", request, ...extra },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function call(path: string, opts: { body?: unknown; cookie?: string; origin?: string | null; method?: string; headers?: Record<string, string>; rawBody?: string } = {}) {
    const response = await fetch(base + path, {
      method: opts.method || (opts.body !== undefined || opts.rawBody !== undefined ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", ...(opts.cookie ? { Cookie: opts.cookie } : {}),
        ...(opts.origin === null ? {} : { Origin: opts.origin || base }), ...opts.headers },
      body: opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
    });
    return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  const account = await call("/api/auth/register", { body: { username: "微積連携", password: "0000" } });
  assert.equal(account.status, 201);
  return { app, store, base, call, cookie: account.cookie!, userId: account.body.user.id,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => { store.db.close(); error ? reject(error) : resolve(); })) };
}

test("source lifetime counts actual unique1/3/5 solves once and survives hard deletion/restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "calculus-lifetime-"));
  const path = join(dir, "source.sqlite");
  let store = new SqliteStore(path);
  try {
    const user = (await store.createUser({ username: "source", key: "source", hash: "h", salt: "s", createdAt: "2026-11-09T00:00:00Z" }))!;
    for (const [level, points] of [["basic", 1], ["applied", 3], ["advanced", 5]] as const) {
      const solve = { userId: user.id, problemId: level, level, points, solvedAt: "2026-11-09T00:00:00Z", date: "2026-11-09", correct: true };
      assert.equal((await store.recordSolve(solve)).pointsEarned, points);
      assert.equal((await store.recordSolve(solve)).pointsEarned, 0);
    }
    assert.deepEqual(await store.lifetimeTotals([user.id, 999]), [
      { userId: user.id, totalPoints: 9, known: true, deleted: false },
      { userId: 999, totalPoints: 0, known: false, deleted: true },
    ]);
    await store.deleteUser(user.id);
    assert.equal(store.db.prepare("SELECT count(*) n FROM solves").get()!.n, 0);
    store.db.close();
    store = new SqliteStore(path);
    assert.deepEqual(await store.lifetimeTotals([user.id]), [{ userId: user.id, totalPoints: 9, known: true, deleted: true }]);
    const next = (await store.createUser({ username: "source", key: "source", hash: "h", salt: "s", createdAt: "2026-11-09T00:00:00Z" }))!;
    assert.ok(next.id > user.id);
    assert.deepEqual(await store.lifetimeTotals([next.id]), [{ userId: next.id, totalPoints: 0, known: true, deleted: false }]);
    await assert.rejects(store.lifetimeTotals([user.id, user.id]), /Invalid lifetime/);
    await assert.rejects(store.lifetimeTotals([0]), /Invalid lifetime/);
  } finally { store.db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("existing SQLite solve totals backfill once on upgrade, without changing raw point semantics", async () => {
  const dir = mkdtempSync(join(tmpdir(), "calculus-upgrade-"));
  const path = join(dir, "old.sqlite");
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL,username_key TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE solves(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,problem_id TEXT NOT NULL,level TEXT NOT NULL,points INTEGER NOT NULL,solved_at TEXT NOT NULL,solved_date TEXT NOT NULL,PRIMARY KEY(user_id,problem_id));
    INSERT INTO users VALUES(1,'old','old','h','s','2026-11-09');
    INSERT INTO solves VALUES(1,'old','advanced',5,'2026-11-09','2026-11-09');`);
  old.close();
  let store = new SqliteStore(path);
  try {
    assert.equal((await store.lifetimeTotals([1]))[0].totalPoints, 5);
    await store.recordSolve({ userId: 1, problemId: "new", level: "applied", points: 3, solvedAt: "2026-11-09", date: "2026-11-09", correct: true });
    store.db.close(); store = new SqliteStore(path);
    assert.equal((await store.lifetimeTotals([1]))[0].totalPoints, 8);
    assert.equal((await store.stats(1, "2026-11-09", "2026-11-09")).totalPoints, 8);
  } finally { store.db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("private source authenticates before JSON/session/Origin processing and returns bounded opaque totals", async (t) => {
  let outgoing = 0;
  const h = await harness(async () => { outgoing++; throw new Error("must not call Target"); });
  t.after(h.close);
  const privatePath = "/api/integrations/target/totals";
  assert.equal((await h.call(privatePath, { rawBody: "{invalid", headers: { Authorization: "Bearer wrong" } })).status, 404);
  assert.equal((await h.call(privatePath, { body: { userIds: [h.userId] } })).status, 404);
  const headers = { Authorization: "Bearer " + targetSecret, "Sec-Fetch-Site": "cross-site" };
  const snapshot = await h.call(privatePath, { body: { userIds: [999, h.userId] }, origin: "https://wallet.example", headers });
  assert.equal(snapshot.status, 200);
  assert.deepEqual(snapshot.body, { totals: [
    { userId: 999, totalPoints: 0, known: false, deleted: true },
    { userId: h.userId, totalPoints: 0, known: true, deleted: false },
  ] });
  for (const body of [{ userIds: [] }, { userIds: [1, 1] }, { userIds: ["1"] }, { userIds: [1], points: 999 }, { userIds: Array.from({ length: 101 }, (_, i) => i + 1) }]) {
    assert.equal((await h.call(privatePath, { body, headers })).status, 400);
  }
  assert.equal(outgoing, 0);
});

test("link requires both browser session and strict Origin, sends only current identity, revokes proof before response", async (t) => {
  const calls: { host: string; action: string; body: Record<string, unknown> }[] = [];
  const h = await harness(async (input, init) => {
    const url = new URL(String(input)), body = JSON.parse(String(init?.body));
    const action = url.pathname.split("/").at(-1)!;
    calls.push({ host: url.host, action, body });
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer " + (url.host === "identity.example" ? identitySecret : targetSecret));
    if (action === "login") return json({ token: proof, member });
    if (action === "logout") return json({ ok: true });
    return json(linked);
  });
  t.after(h.close);
  const body = { attendanceNumber: "32", pin: "0000" };
  assert.equal((await h.call("/api/kgs-link", { body })).status, 401);
  assert.equal((await h.call("/api/kgs-link", { body, cookie: h.cookie, origin: null })).status, 403);
  assert.equal((await h.call("/api/kgs-link", { body, cookie: h.cookie, origin: "https://evil.example" })).status, 403);
  assert.equal((await h.call("/api/kgs-link", { body: { ...body, userId: 999 }, cookie: h.cookie })).status, 400);
  assert.equal(calls.length, 0);
  const result = await h.call("/api/kgs-link", { body, cookie: h.cookie });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, linked);
  assert.deepEqual(calls, [
    { host: "identity.example", action: "login", body },
    { host: "wallet.example", action: "link", body: { userId: h.userId, proofToken: proof } },
    { host: "identity.example", action: "logout", body: { token: proof } },
  ]);
  assert.ok(!JSON.stringify(result.body).includes(proof));
  assert.equal((await h.call("/api/kgs-link/sync", { body: {}, cookie: h.cookie })).status, 200);
  assert.deepEqual(calls.at(-1), { host: "wallet.example", action: "sync", body: { userId: h.userId } });
});

test("Vercel matched-path metadata works on status, link and sync while forged or repeated queries fail", async (t) => {
  const calls: { action: string; body: Record<string, unknown> }[] = [];
  const h = await harness(async (input, init) => {
    const action = new URL(String(input)).pathname.split("/").at(-1)!;
    calls.push({ action, body: JSON.parse(String(init?.body)) });
    if (action === "login") return json({ token: proof, member });
    if (action === "logout") return json({ ok: true });
    return json(linked);
  });
  t.after(h.close);
  const credentials = { attendanceNumber: "32", pin: "0000" };
  assert.equal((await h.call("/api/kgs-link?path=kgs-link", { cookie: h.cookie })).status, 200);
  assert.equal((await h.call("/api/kgs-link?path=kgs-link", { cookie: h.cookie, body: credentials })).status, 200);
  assert.equal((await h.call("/api/kgs-link/sync?path=kgs-link%2Fsync", { cookie: h.cookie, body: {} })).status, 200);
  assert.deepEqual(calls, [
    { action: "status", body: { userId: h.userId } },
    { action: "login", body: credentials },
    { action: "link", body: { userId: h.userId, proofToken: proof } },
    { action: "logout", body: { token: proof } },
    { action: "sync", body: { userId: h.userId } },
  ]);
  const before = calls.length;
  for (const [path, body, expected] of [
    ["/api/kgs-link", undefined, "kgs-link"],
    ["/api/kgs-link", credentials, "kgs-link"],
    ["/api/kgs-link/sync", {}, "kgs-link/sync"],
  ] as const) {
    const encoded = encodeURIComponent(expected);
    for (const query of [
      "path=other", "path=", `path=${encoded}&path=${encoded}`,
      `path=${encoded}&path=other`, `path=${encoded}&userId=999`,
      `path=${encoded}&totalPoints=999999`, `path=${encoded}&proofToken=${proof}`,
      "userId=999", `path[]=${encoded}`, "route=" + encoded,
    ]) {
      const result = await h.call(path + "?" + query, { cookie: h.cookie, body });
      assert.equal(result.status, 400, `${path}?${query}`);
    }
  }
  assert.equal((await h.call("/api/kgs-link?path=kgs-link", { cookie: h.cookie, body: { ...credentials, userId: 999 } })).status, 400);
  assert.equal((await h.call("/api/kgs-link/sync?path=kgs-link%2Fsync", { cookie: h.cookie, body: { totalPoints: 999999 } })).status, 400);
  assert.equal((await h.call("/api/kgs-link?path=kgs-link", { cookie: h.cookie, body: credentials, origin: null })).status, 403);
  assert.equal((await h.call("/api/kgs-link/sync?path=kgs-link%2Fsync", { cookie: h.cookie, body: {}, origin: "https://evil.example" })).status, 403);
  assert.equal(calls.length, before, "invalid queries/bodies/Origins never reach the remote identity or wallet");
});

test("parsed rewrite metadata cannot hide raw duplicates, conflicts or forged query authority", async (t) => {
  let outgoing = 0;
  const h = await harness(async () => { outgoing++; return json(unlinked); });
  t.after(h.close);
  // Model an adapter that supplies parsed metadata separately from the URL.
  h.app.set("query parser", () => ({ path: "kgs-link" }));
  assert.equal((await h.call("/api/kgs-link", { cookie: h.cookie })).status, 200);
  assert.equal((await h.call("/api/kgs-link?path=kgs-link", { cookie: h.cookie })).status, 200);
  for (const query of ["path=wrong", "path=kgs-link&path=kgs-link", "userId=999", "path=kgs-link&balance=999999"]) {
    assert.equal((await h.call("/api/kgs-link?" + query, { cookie: h.cookie })).status, 400);
  }
  for (const metadata of [{ path: ["kgs-link"] }, { path: "wrong" }, { path: "kgs-link", userId: "999" }]) {
    h.app.set("query parser", () => metadata);
    assert.equal((await h.call("/api/kgs-link?path=kgs-link", { cookie: h.cookie })).status, 400);
  }
  assert.equal(outgoing, 2);
});

test("logout during remote PIN verification prevents linking the stale Daily session and still revokes proof", async (t) => {
  let release!: () => void, started!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const reached = new Promise<void>((resolve) => { started = resolve; });
  const actions: string[] = [];
  const h = await harness(async (input) => {
    const action = new URL(String(input)).pathname.split("/").at(-1)!;
    actions.push(action);
    if (action === "login") { started(); await pending; return json({ token: proof, member }); }
    return json({ ok: true });
  });
  t.after(h.close);
  const attempt = h.call("/api/kgs-link", { cookie: h.cookie, body: { attendanceNumber: "32", pin: "0000" } });
  await reached;
  assert.equal((await h.call("/api/auth/logout", { cookie: h.cookie, body: {} })).status, 200);
  release();
  assert.equal((await attempt).status, 401);
  assert.deepEqual(actions, ["login", "logout"]);
});

test("conflict and malformed wallet responses revoke proof without exposing upstream secrets", async (t) => {
  const actions: string[] = [];
  let mode: "conflict" | "malformed" = "conflict";
  const h = await harness(async (input) => {
    const action = new URL(String(input)).pathname.split("/").at(-1)!;
    actions.push(action);
    if (action === "login") return json({ token: proof, member });
    if (action === "logout") return json({ ok: true });
    return mode === "conflict" ? new Response("SECRET-UPSTREAM-DETAIL", { status: 409 }) : json({ ...linked, balance: 1_000_000 });
  });
  t.after(h.close);
  const first = await h.call("/api/kgs-link", { cookie: h.cookie, body: { attendanceNumber: "32", pin: "0000" } });
  assert.equal(first.status, 409);
  assert.ok(!JSON.stringify(first.body).includes("SECRET"));
  assert.deepEqual(actions, ["login", "link", "logout"]);
  mode = "malformed";
  assert.equal((await h.call("/api/kgs-link", { cookie: h.cookie, body: { attendanceNumber: "32", pin: "0000" } })).status, 502);
  assert.equal(actions.at(-1), "logout");
});

test("accepted solve remains authoritative when Target is offline; duplicates never push a second credit", async (t) => {
  const calls: Record<string, unknown>[] = [];
  const h = await harness(async (_input, init) => { calls.push(JSON.parse(String(init?.body))); throw new Error("offline"); });
  t.after(h.close);
  const problem = getProblems("2026-11-09").find((p) => p.level === "advanced")!;
  const answer = () => h.call(`/api/problems/${encodeURIComponent(problem.id)}/answer`, { cookie: h.cookie, body: { choiceIndex: problem.correctIndex } });
  const result = await answer();
  assert.equal(result.status, 200); assert.equal(result.body.pointsEarned, 5); assert.equal(result.body.creditSyncPending, true);
  assert.equal((await answer()).body.pointsEarned, 0);
  assert.deepEqual(calls, [{ userId: h.userId }]);
  assert.equal((await h.store.lifetimeTotals([h.userId]))[0].totalPoints, 5);
  assert.equal((await h.call("/api/account", { method: "DELETE", cookie: h.cookie, body: { confirmation: "DELETE" } })).status, 200);
  assert.deepEqual(await h.store.lifetimeTotals([h.userId]), [{ userId: h.userId, totalPoints: 5, known: true, deleted: true }]);
  assert.equal(calls.length, 1, "account deletion works without contacting Target");
});

test("cloud lifetime adapter uses separate secret-gated read RPC and rejects malformed snapshots", async () => {
  const config = { url: "https://source.supabase.co", publishableKey: "public-test", storeKey: "a".repeat(64) };
  const response = [{ userId: 2, totalPoints: 9, known: true, deleted: true }, { userId: 3, totalPoints: 0, known: false, deleted: true }];
  const store = new SupabaseStore(config, async (input, init) => {
    assert.equal(String(input), config.url + "/rest/v1/rpc/dc_lifetime_totals");
    assert.deepEqual(JSON.parse(String(init?.body)), { p_key: config.storeKey, p_user_ids: [2, 3] });
    return json(response);
  });
  assert.deepEqual(await store.lifetimeTotals([2, 3]), response);
  const bad = new SupabaseStore(config, async () => json([{ userId: 2, totalPoints: -1, known: true, deleted: false }]));
  await assert.rejects(bad.lifetimeTotals([2]), /Invalid cloud lifetime/);
});
