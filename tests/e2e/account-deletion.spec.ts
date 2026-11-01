import { test, expect, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { getProblem } from "../../server/problems";

const PASSWORD = "0426";
const uniqueUsername = (prefix: string) =>
  `${prefix}${randomBytes(5).toString("hex")}`;

async function register(page: Page, username: string) {
  await page.goto("/#account");
  await expect(page.locator(".account-guest")).toBeVisible();
  await page
    .locator(".account-guest")
    .getByRole("button", { name: "登録・ログイン", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/ログアウト[\s\S]*削除/);
  await dialog.getByLabel("ユーザーネーム").fill(username);
  await dialog.getByLabel("4桁の数字パスワード").fill(PASSWORD);
  await dialog.getByRole("button", { name: "登録する", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".account-profile")).toContainText(username);
  const session = await (await page.request.get("/api/session")).json();
  return session.user as { id: number; username: string };
}

async function earnDailyPoints(
  page: Page,
  level: "basic" | "applied" = "basic",
) {
  const { problems } = await (await page.request.get("/api/problems")).json();
  const selected = problems.find((p: { level: string }) => p.level === level);
  const problem = getProblem(selected.id)!;
  const response = await page.request.post(
    `/api/problems/${encodeURIComponent(problem.id)}/answer`,
    {
      data: { choiceIndex: problem.correctIndex },
    },
  );
  expect(response.ok()).toBe(true);
  expect((await response.json()).pointsEarned).toBe(level === "basic" ? 1 : 3);
  await page.reload();
  await expect(page.locator(".account-stats")).toContainText(
    level === "basic" ? "1pt" : "3pt",
  );
}

async function assertGuestData(page: Page) {
  expect(
    (await (await page.request.get("/api/session")).json()).user,
  ).toBeNull();
  const stats = await (await page.request.get("/api/stats")).json();
  expect(stats.totalPoints).toBe(0);
  expect(stats.solvedCount).toBe(0);
  expect(stats.activity).toEqual([]);
}

test("explicit account deletion can be cancelled, then removes scores and every device session; the name can start fresh", async ({
  page,
  browser,
  baseURL,
}) => {
  const username = uniqueUsername("削除");
  const original = await register(page, username);
  await earnDailyPoints(page);
  const otherDevice = await browser.newContext({ baseURL });
  try {
    const login = await otherDevice.request.post("/api/auth/login", {
      data: { username, password: PASSWORD },
    });
    expect(login.ok()).toBe(true);
    const otherPage = await otherDevice.newPage();
    await otherPage.goto("/#account");
    await expect(otherPage.locator(".account-profile")).toContainText(username);
    await expect(otherPage.locator(".account-stats")).toContainText("1pt");

    const openDelete = page
      .locator(".account-delete-section")
      .getByRole("button", { name: "アカウントを削除", exact: true });
    await openDelete.click();
    const confirmation = page.getByRole("alertdialog", {
      name: "アカウントを削除しますか？",
    });
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText("元に戻せません");
    await confirmation
      .getByRole("button", { name: "キャンセル", exact: true })
      .click();
    await expect(confirmation).toHaveCount(0);
    expect(
      (await (await page.request.get("/api/session")).json()).user.id,
    ).toBe(original.id);
    expect(
      (await (await page.request.get("/api/stats")).json()).totalPoints,
    ).toBe(1);
    expect(
      (await (await otherDevice.request.get("/api/session")).json()).user.id,
    ).toBe(original.id);

    await openDelete.click();
    const deleteRequest = page.waitForRequest(
      (request) =>
        request.method() === "DELETE" &&
        new URL(request.url()).pathname === "/api/account",
    );
    await confirmation
      .getByRole("button", { name: "アカウントを削除", exact: true })
      .click();
    expect((await deleteRequest).postDataJSON()).toEqual({
      confirmation: "DELETE",
    });
    await expect(confirmation).toHaveCount(0);
    await expect(page.locator(".account-guest")).toBeVisible();
    await assertGuestData(page);
    const rankings = await (
      await page.request.get("/api/rankings?period=all")
    ).json();
    expect(
      rankings.entries.some(
        (entry: { username: string }) => entry.username === username,
      ),
    ).toBe(false);
    expect(
      (await (await otherDevice.request.get("/api/session")).json()).user,
    ).toBeNull();
    expect(
      (await (await otherDevice.request.get("/api/stats")).json()).totalPoints,
    ).toBe(0);
    await otherPage.reload();
    await expect(otherPage.locator(".account-guest")).toBeVisible();
    const oldCredentials = await otherDevice.request.post("/api/auth/login", {
      data: { username, password: PASSWORD },
    });
    expect(oldCredentials.status()).toBe(401);

    const replacement = await register(page, username);
    expect(replacement.id).not.toBe(original.id);
    const freshStats = await (await page.request.get("/api/stats")).json();
    expect(freshStats.totalPoints).toBe(0);
    expect(freshStats.solvedCount).toBe(0);
    expect(freshStats.activity).toEqual([]);
    await expect(page.locator(".account-stats")).toContainText("0pt");
    // The old cookie must not become valid when the deleted username is reused.
    expect(
      (await (await otherDevice.request.get("/api/session")).json()).user,
    ).toBeNull();
  } finally {
    await otherDevice.close();
  }
});

test("mobile delete-and-logout warns before deleting and remains usable on a 320px screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const username = uniqueUsername("終了");
  await register(page, username);
  await earnDailyPoints(page, "applied");
  const logout = page.locator(".logout-button");
  await expect(logout).toHaveText("削除してログアウト");
  await logout.click();
  const confirmation = page.getByRole("alertdialog", {
    name: "削除してログアウトしますか？",
  });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText("元に戻せません");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
  const box = await confirmation.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.width).toBeLessThanOrEqual(320);
  await page.keyboard.press("Escape");
  await expect(confirmation).toHaveCount(0);
  await expect(page.locator(".account-profile")).toContainText(username);
  expect(
    (await (await page.request.get("/api/stats")).json()).totalPoints,
  ).toBe(3);

  await logout.click();
  const logoutRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/auth/logout",
  );
  await confirmation
    .getByRole("button", { name: "削除してログアウト", exact: true })
    .click();
  expect((await logoutRequest).postDataJSON()).toEqual({ deleteAccount: true });
  await expect(confirmation).toHaveCount(0);
  await expect(page.locator(".account-guest")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
  await assertGuestData(page);
  expect(
    (
      await page.request.post("/api/auth/login", {
        data: { username, password: PASSWORD },
      })
    ).status(),
  ).toBe(401);
});

test("a failed deletion keeps the account and points until a successful retry", async ({
  page,
}) => {
  const username = uniqueUsername("再試行");
  await register(page, username);
  await earnDailyPoints(page);
  const failureMessage = "削除処理に失敗しました。もう一度お試しください。";
  let attempts = 0;
  await page.route("**/api/account", async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    attempts++;
    if (attempts === 1)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: failureMessage }),
      });
    return route.continue();
  });
  await page
    .locator(".account-delete-section")
    .getByRole("button", { name: "アカウントを削除", exact: true })
    .click();
  const confirmation = page.getByRole("alertdialog", {
    name: "アカウントを削除しますか？",
  });
  const confirmButton = confirmation.getByRole("button", {
    name: "アカウントを削除",
    exact: true,
  });
  await confirmButton.click();
  await expect(confirmation).toContainText(failureMessage);
  await expect(confirmButton).toBeEnabled();
  await expect(page.locator(".account-profile")).toContainText(username);
  expect(
    (await (await page.request.get("/api/session")).json()).user.username,
  ).toBe(username);
  expect(
    (await (await page.request.get("/api/stats")).json()).totalPoints,
  ).toBe(1);

  await confirmButton.click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.locator(".account-guest")).toBeVisible();
  await assertGuestData(page);
  expect(attempts).toBe(2);
});
