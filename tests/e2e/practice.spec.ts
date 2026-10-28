import { test, expect } from "@playwright/test";
import { getProblem } from "../../server/problems";

test("registration, correct answer, saved points, calendar, ranking and relogin form a complete learning flow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const username = `学習${Date.now()}`;
  await page.goto("/");
  await expect(page.locator(".problem-card")).toHaveCount(3);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("ユーザーネーム").fill(username);
  await dialog.getByLabel("4桁の数字パスワード").fill("0123");
  await dialog.getByRole("button", { name: "登録する" }).click();
  await expect(dialog).toHaveCount(0);
  const { problems } = await (await page.request.get("/api/problems")).json();
  const problem = getProblem(problems[0].id)!;
  await page.locator(".problem-card").first().click();
  await page.locator(".answer-choice").nth(problem.correctIndex).click();
  await page.getByRole("button", { name: "答えを確かめる" }).click();
  await expect(page.locator(".answer-result")).toContainText("正解");
  await expect(page.locator(".result-heading")).toContainText("+1 pt");
  await page
    .getByRole("button", { name: "閉じる", exact: true })
    .last()
    .click();
  await expect(page.locator(".stat-item").first()).toContainText("1pt");
  await page.reload();
  await expect(page.locator(".stat-item").first()).toContainText("1pt");
  await page.locator(".problem-card").first().click();
  await page.locator(".answer-choice").nth(problem.correctIndex).click();
  await page.getByRole("button", { name: "答えを確かめる" }).click();
  await expect(page.locator(".answer-result")).toContainText(
    "今回の加点はありません",
  );
  await page
    .getByRole("button", { name: "閉じる", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "学習カレンダー", exact: true })
    .click();
  await expect(page.locator(".calendar-day.has-activity")).toHaveCount(1);
  await expect(page.locator(".selected-day-detail")).toContainText(
    "1 問に正解",
  );
  await page.getByRole("button", { name: "ランキング", exact: true }).click();
  await expect(page.locator(".ranking-surface")).toContainText(username);
  await page
    .getByRole("button", { name: "週間ランキング", exact: true })
    .click();
  await expect(page.locator(".ranking-surface")).toContainText(username);
  await page.getByRole("button", { name: "アカウント", exact: true }).click();
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(page.locator(".account-guest")).toBeVisible();
  await page.getByRole("button", { name: "登録・ログイン", exact: true }).click();
  await dialog.getByRole("button", { name: "ログイン", exact: true }).click();
  await dialog.getByLabel("ユーザーネーム").fill(username);
  await dialog.getByLabel("4桁の数字パスワード").fill("0123");
  await dialog.getByRole("button", { name: "ログインする" }).click();
  await expect(page.locator(".account-profile")).toContainText(username);
  await expect(page.locator(".account-stats")).toContainText("1pt");
  expect(errors).toEqual([]);
});

test("mobile guest can navigate and practice without page overflow or points", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".problem-card")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page
    .locator(".mobile-bottom-nav")
    .getByRole("button", { name: "ノート", exact: true })
    .click();
  await expect(page.locator(".lesson-card")).toHaveCount(8);
  await page
    .locator(".mobile-bottom-nav")
    .getByRole("button", { name: "今日の微積", exact: true })
    .click();
  await page.locator(".problem-card").first().click();
  await page.getByRole("button", { name: "ヒントを見る" }).click();
  await expect(page.locator(".hint-box")).toBeVisible();
  await page.locator(".answer-choice").first().click();
  await page.getByRole("button", { name: "答えを確かめる" }).click();
  await expect(page.locator(".explanation")).toBeVisible();
  const stats = await (await page.request.get("/api/stats")).json();
  expect(stats.totalPoints).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
