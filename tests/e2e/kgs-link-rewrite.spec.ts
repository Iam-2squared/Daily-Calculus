import { test, expect } from "@playwright/test";
import express from "express";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { createApp } from "../../server/app";
import { SqliteStore } from "../../server/store";

const identitySecret = "rewrite-identity-" + "a".repeat(40);
const targetSecret = "rewrite-wallet-" + "b".repeat(40);
const proofToken = "r".repeat(43);
const member = { id: "00000000-0000-4000-8000-000000000012", name: "経路確認" };

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}

test("Vercel rewrite metadata reaches the real account API before showing and submitting the link form", async ({ page }) => {
  const store = new SqliteStore(":memory:");
  const upstreamCalls: { action: string; body: Record<string, unknown> }[] = [];
  const rewritten: { method: string; path: string; metadata: string }[] = [];
  let linkedUserId: number | null = null;
  const upstream = express();
  upstream.use(express.json());
  upstream.post("/api/integrations/calculus/:action", (req, res) => {
    const action = req.params.action;
    upstreamCalls.push({ action, body: req.body });
    const identity = action === "login" || action === "logout";
    if (req.get("authorization") !== `Bearer ${identity ? identitySecret : targetSecret}`)
      return void res.sendStatus(404);
    if (action === "login") {
      if (req.body.attendanceNumber !== "12" || req.body.pin !== "0426")
        return void res.sendStatus(401);
      return void res.json({ member, token: proofToken });
    }
    if (action === "logout") return void res.json({ ok: true });
    if (action === "link") {
      if (req.body.proofToken !== proofToken || !Number.isInteger(req.body.userId))
        return void res.sendStatus(401);
      linkedUserId = req.body.userId;
    }
    const linked = linkedUserId !== null && linkedUserId === req.body.userId;
    res.json({
      linked, conversionRate: 10000, member: linked ? member : null,
      balance: linked ? 90000 : null, totalIncome: linked ? 190000 : null,
      calculusIncome: linked ? 90000 : null, syncPending: false,
    });
  });
  const upstreamServer = createServer(upstream);
  const upstreamOrigin = await listen(upstreamServer);
  const app = createApp(undefined, {
    store, secureCookies: false,
    integration: {
      identitySecret, targetSecret,
      identityUrl: "https://identity.example", targetUrl: "https://wallet.example",
      // The browser never intercepts an API response. Only external services
      // are replaced with a real local HTTP fixture for this routing test.
      request: (input, init) => {
        const url = new URL(String(input));
        if (!["identity.example", "wallet.example"].includes(url.hostname))
          throw new Error("Unexpected integration host.");
        return fetch(upstreamOrigin + url.pathname, init);
      },
    },
  });
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://rewrite.test");
    if (url.pathname.startsWith("/api/")) {
      // /api/:path* -> /api/index adds its matched capture to the query on
      // Vercel. Keep it through Express parsing, as in the deployed adapter.
      const metadata = url.pathname.slice("/api/".length);
      url.searchParams.append("path", metadata);
      rewritten.push({ method: req.method || "GET", path: url.pathname, metadata });
      req.url = url.pathname + url.search;
    }
    app(req, res);
  });
  const origin = await listen(server);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + "/#account");
    await page.locator(".account-guest").getByRole("button", { name: "登録・ログイン" }).click();
    const registration = page.getByRole("dialog");
    await registration.getByLabel("ユーザーネーム").fill("経路確認生徒");
    await registration.getByLabel("4桁の数字パスワード").fill("1234");
    const initialStatus = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/kgs-link" && response.request().method() === "GET");
    await registration.getByRole("button", { name: "登録する", exact: true }).click();
    expect((await initialStatus).status()).toBe(200);
    const panel = page.locator(".kgs-link-panel");
    await expect(panel.getByLabel("KGS11thの番号")).toBeVisible();
    await expect(panel.getByLabel("KGS11thのPIN（4桁）")).toBeVisible();
    await expect(panel.getByRole("alert")).toHaveCount(0);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(panel.locator("form")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
    await panel.getByLabel("KGS11thの番号").fill("12");
    await panel.getByLabel("KGS11thのPIN（4桁）").fill("0426");
    const submitted = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/kgs-link" && response.request().method() === "POST");
    await panel.getByRole("button", { name: "このアカウントを連携" }).click();
    const response = await submitted;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toEqual({ attendanceNumber: "12", pin: "0426" });
    await expect(panel).toContainText("経路確認 と連携済み");
    await expect(panel).toContainText("90,000轟");
    await expect(panel).toContainText("190,000轟");
    const synced = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/kgs-link/sync");
    await panel.getByRole("button", { name: "連携情報を更新" }).click();
    expect((await synced).status()).toBe(200);
    const initialCall = upstreamCalls.find((call) => call.action === "status");
    expect(initialCall?.body).toEqual({ userId: linkedUserId });
    expect(upstreamCalls.map((call) => call.action)).toEqual(["status", "login", "link", "logout", "sync"]);
    expect(rewritten).toContainEqual({ method: "GET", path: "/api/kgs-link", metadata: "kgs-link" });
    expect(rewritten).toContainEqual({ method: "POST", path: "/api/kgs-link", metadata: "kgs-link" });
    expect(rewritten).toContainEqual({ method: "POST", path: "/api/kgs-link/sync", metadata: "kgs-link/sync" });
    const callsBeforeTampering = upstreamCalls.length;
    for (const query of ["userId=999", "path=kgs-link", "path=wrong", "points=99999"]) {
      expect((await page.request.get(origin + "/api/kgs-link?" + query)).status()).toBe(400);
    }
    expect(upstreamCalls.length).toBe(callsBeforeTampering);
  } finally {
    await close(server);
    await close(upstreamServer);
    store.db.close();
  }
});
