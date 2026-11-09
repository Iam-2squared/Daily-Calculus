import { test, expect, type Page } from "@playwright/test";
import type { KgsLinkStatus } from "../../shared/kgs-types";
import { getProblems, publicProblem } from "../../server/problems";

const unlinked: KgsLinkStatus = {
  linked: false, conversionRate: 10000, member: null,
  balance: null, totalIncome: null, calculusIncome: null, syncPending: false,
};
const linked: KgsLinkStatus = {
  linked: true, conversionRate: 10000,
  member: { id: "00000000-0000-4000-8000-000000000032", name: "連携先の生徒" },
  balance: 123400, totalIncome: 323400, calculusIncome: 90000, syncPending: false,
};

async function fixture(page: Page, initial: KgsLinkStatus | null = unlinked) {
  let current = initial;
  let user = { id: 101, username: "微積の生徒", createdAt: "2026-11-01T00:00:00Z" };
  const posts: { path: string; body: unknown }[] = [];
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (request.method() === "POST") posts.push({ path, body: request.postDataJSON() });
    if (path === "/api/session") return json({ user });
    if (path === "/api/problems") return json({ date, problems: getProblems(date).map(publicProblem) });
    if (path === "/api/stats") return json({ totalPoints: 9, weeklyPoints: 9, solvedCount: 3, streak: 1, activity: [{ date, points: 9, count: 3 }], solvedIds: [], levelCounts: { basic: 1, applied: 1, advanced: 1 } });
    if (path === "/api/rankings") return json({ period: "all", weekStart: date, totalUsers: 1, entries: [{ rank: 1, username: user.username, points: 9, isYou: true }], me: { rank: 1, username: user.username, points: 9, isYou: true } });
    if (path === "/api/auth/register") {
      user = { ...user, id: 202, username: "別の微積アカウント" };
      current = unlinked;
      return json({ user });
    }
    if (path === "/api/account" || path === "/api/auth/logout") return json({ success: true, accountDeleted: true });
    if (path === "/api/kgs-link/sync") {
      current = { ...linked, balance: 133400, totalIncome: 333400, calculusIncome: 100000 };
      return json(current);
    }
    if (path === "/api/kgs-link") {
      if (request.method() === "POST") {
        current = linked;
        return json(current);
      }
      if (current === null) return json({ error: "連携先に接続できません。時間をおいて更新してください。" }, 503);
      return json(current);
    }
    return json({ error: "Unknown mocked endpoint" }, 404);
  });
  return { posts, setStatus: (next: KgsLinkStatus | null) => { current = next; } };
}

test("earned source points convert once throughout the Daily UI", async ({ page }) => {
  await fixture(page);
  await page.goto("/");
  await expect(page.locator(".stat-item").first()).toContainText("90,000轟");
  await expect(page.locator(".points-badge")).toContainText(["轟", "轟", "轟"]);
  const badgeText = await page.locator(".points-badge").allTextContents();
  expect(badgeText.map((value) => value.replace(/\s/g, "")).sort()).toEqual(["+10,000轟", "+30,000轟", "+50,000轟"].sort());
  await expect(page.locator(".calendar-day.has-points")).toContainText("9万轟");
  await page.goto("/#ranking");
  await expect(page.locator(".ranking-table tbody")).toContainText("90,000轟");
  await page.goto("/#account");
  await expect(page.locator(".account-stats")).toContainText("90,000轟");
  await expect(page.locator(".account-stats")).toContainText("総取得（微積）");
});

test("link verifies credentials explicitly and displays already-converted combined wallet", async ({ page }) => {
  const mocked = await fixture(page);
  await page.goto("/#account");
  const panel = page.locator(".kgs-link-panel");
  await expect(panel).toContainText("連携後は別のアカウントに変更できません");
  await expect(panel.getByLabel("KGS11thの番号")).toHaveValue("");
  await panel.getByLabel("KGS11thの番号").fill("32");
  await panel.getByLabel("KGS11thのPIN（4桁）").fill("0000");
  await panel.getByRole("button", { name: "このアカウントを連携" }).click();
  await expect(panel).toContainText("連携先の生徒");
  await expect(panel).toContainText("123,400轟");
  await expect(panel).toContainText("323,400轟");
  await expect(panel).toContainText("90,000轟");
  await expect(panel.getByLabel("KGS11thのPIN（4桁）")).toHaveCount(0);
  expect(mocked.posts).toEqual([{ path: "/api/kgs-link", body: { attendanceNumber: "32", pin: "0000" } }]);
  const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(JSON.stringify(storage)).not.toContain("0000");
  await panel.getByRole("button", { name: "連携情報を更新" }).click();
  await expect(panel).toContainText("133,400轟");
  expect(mocked.posts.at(-1)).toEqual({ path: "/api/kgs-link/sync", body: {} });
});

test("source outage preserves posted wallet and retry repairs the visible totals", async ({ page }) => {
  await fixture(page, { ...linked, syncPending: true });
  await page.goto("/#account");
  const panel = page.locator(".kgs-link-panel");
  await expect(panel).toContainText("反映待ち");
  await expect(panel).toContainText("123,400轟");
  await panel.getByRole("button", { name: "連携情報を更新" }).click();
  await expect(panel).not.toContainText("反映待ち");
  await expect(panel).toContainText("133,400轟");
});

test("G losses lower the common total while the calculus lifetime amount remains visible", async ({ page }) => {
  await fixture(page, { ...linked, balance: 1050, totalIncome: 11050, calculusIncome: 90000 });
  await page.goto("/#account");
  const panel = page.locator(".kgs-link-panel");
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(panel.locator(".kgs-wallet-summary > div").nth(0)).toHaveText("保有額（共通）1,050轟");
  await expect(panel.locator(".kgs-wallet-summary > div").nth(1)).toHaveText("総取得（Gの損益込み）11,050轟");
  await expect(panel.locator(".kgs-wallet-summary > div").nth(2)).toHaveText("微積で獲得した累計90,000轟");
  await expect(panel).toContainText("暗記・微積・誕生日プレゼントとGの損益");
});

test("unavailable or malformed link status never presents an unlinked form or zero wallet", async ({ page }) => {
  const mocked = await fixture(page, null);
  await page.goto("/#account");
  const panel = page.locator(".kgs-link-panel");
  await expect(panel.getByRole("alert")).toContainText("接続できません");
  await expect(panel.locator("form")).toHaveCount(0);
  await expect(panel.locator(".kgs-wallet-summary")).toHaveCount(0);
  mocked.setStatus({ ...linked, balance: null });
  await panel.getByRole("button", { name: "連携情報を更新" }).click();
  await expect(panel.getByRole("alert")).toContainText("確認できません");
  await expect(panel.locator("form")).toHaveCount(0);
  mocked.setStatus(unlinked);
  await panel.getByRole("button", { name: "連携情報を更新" }).click();
  await expect(panel.locator("form")).toBeVisible();
});

test("changing Daily accounts clears the old member, balances, and credentials", async ({ page }) => {
  await fixture(page, linked);
  await page.goto("/#account");
  await expect(page.locator(".kgs-link-panel")).toContainText("連携先の生徒");
  await page.locator(".account-delete-section").getByRole("button", { name: "アカウントを削除", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("連携済みの轟と連携履歴はKGS11thに残ります");
  await confirmation.getByRole("button", { name: "アカウントを削除", exact: true }).click();
  await expect(page.locator(".kgs-link-panel")).toHaveCount(0);
  await page.locator(".account-guest").getByRole("button", { name: "登録・ログイン" }).click();
  const register = page.getByRole("dialog");
  await register.getByLabel("ユーザーネーム").fill("別の微積アカウント");
  await register.getByLabel("4桁の数字パスワード").fill("1234");
  await register.getByRole("button", { name: "登録する", exact: true }).click();
  const panel = page.locator(".kgs-link-panel");
  await expect(panel.locator("form")).toBeVisible();
  await expect(panel).not.toContainText("連携先の生徒");
  await expect(panel).not.toContainText("123,400轟");
  await expect(panel.getByLabel("KGS11thの番号")).toHaveValue("");
  await expect(panel.getByLabel("KGS11thのPIN（4桁）")).toHaveValue("");
});

test("combined wallet and link form fit small iPhone widths", async ({ page }) => {
  const mocked = await fixture(page);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    mocked.setStatus(unlinked);
    await page.goto("/#account");
    await page.reload();
    await expect(page.locator(".kgs-link-form")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    mocked.setStatus({ ...linked, member: { ...linked.member!, name: "🌟".repeat(20) }, balance: 10_000_000_000_000, totalIncome: 10_000_000_000_000 });
    await page.reload();
    await expect(page.locator(".kgs-wallet-summary")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});

test("a failed link clears the PIN immediately and waits for another explicit attempt", async ({ page }) => {
  await fixture(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let attempts = 0;
  await page.route("**/api/kgs-link", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    attempts++;
    await pending;
    return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "このKGSアカウントは連携済みです。" }) });
  });
  await page.goto("/#account");
  const panel = page.locator(".kgs-link-panel");
  await panel.getByLabel("KGS11thの番号").fill("32");
  await panel.getByLabel("KGS11thのPIN（4桁）").fill("0000");
  await panel.getByRole("button", { name: "このアカウントを連携" }).click();
  await expect(panel.getByLabel("KGS11thのPIN（4桁）")).toHaveValue("");
  await expect(panel.getByRole("button", { name: "このアカウントを連携" })).toBeDisabled();
  release();
  await expect(panel.getByRole("alert")).toContainText("連携済みです");
  await expect(panel.getByLabel("KGS11thのPIN（4桁）")).toHaveValue("");
  expect(attempts).toBe(1);
});

test("an old delayed status cannot expose another account's member after logout and login", async ({ page }) => {
  await fixture(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let delayed = false;
  await page.route("**/api/kgs-link", async (route) => {
    if (route.request().method() !== "GET" || delayed) return route.fallback();
    delayed = true;
    await pending;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(linked) });
  });
  await page.goto("/#account");
  await expect(page.locator(".kgs-link-loading")).toBeVisible();
  await page.locator(".logout-button").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "削除してログアウト", exact: true }).click();
  await expect(page.locator(".account-guest")).toBeVisible();
  await page.locator(".account-guest").getByRole("button", { name: "登録・ログイン" }).click();
  const register = page.getByRole("dialog");
  await register.getByLabel("ユーザーネーム").fill("別の微積アカウント");
  await register.getByLabel("4桁の数字パスワード").fill("1234");
  await register.getByRole("button", { name: "登録する", exact: true }).click();
  await expect(page.locator(".kgs-link-form")).toBeVisible();
  const oldResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/kgs-link" && response.request().method() === "GET");
  release();
  await oldResponse;
  await expect(page.locator(".kgs-link-form")).toBeVisible();
  await expect(page.locator(".kgs-link-panel")).not.toContainText("連携先の生徒");
  await expect(page.locator(".kgs-wallet-summary")).toHaveCount(0);
});
