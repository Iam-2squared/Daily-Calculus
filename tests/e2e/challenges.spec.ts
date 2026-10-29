import { test, expect, type Page } from "@playwright/test";
import type { ChallengeResponse, Problem } from "../../shared/types";
import { generatePracticeProblem } from "../../server/practice-problems";

async function begin(page: Page): Promise<ChallengeResponse> {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/challenges/start") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "開始する", exact: true }).click();
  return (await response).json();
}
async function correctAnswer(page: Page, problem: Problem) {
  const seed = problem.id.split(".")[4];
  const privateProblem = generatePracticeProblem(
    problem.level,
    seed,
    problem.date,
    problem.id,
  );
  await page
    .locator(".challenge-problem .answer-choice")
    .nth(privateProblem.correctIndex)
    .click();
  await page.getByRole("button", { name: "回答する", exact: true }).click();
  await expect(page.locator(".challenge-result-label")).toContainText("正解");
  await expect(
    page.getByRole("button", { name: "次の問題", exact: true }),
  ).toBeEnabled();
}

test("mobile unlimited practice saves more than three questions and colors the calendar by points", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".topbar-user").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("ユーザーネーム").fill(`挑戦${Date.now()}`);
  await dialog.getByLabel("4桁の数字パスワード").fill("0246");
  await dialog.getByRole("button", { name: "登録する", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const nav = page.locator(".mobile-bottom-nav");
  await expect(nav.locator("button").nth(2)).toHaveText("挑戦");
  await nav.getByRole("button", { name: "挑戦", exact: true }).click();
  await expect(page.locator(".challenge-level-options button")).toHaveCount(3);
  await page
    .locator(".challenge-level-options")
    .getByRole("button", { name: /応用/ })
    .click();
  await expect(
    page
      .locator(".challenge-level-options")
      .getByRole("button", { name: /応用/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .locator(".challenge-level-options")
    .getByRole("button", { name: /難関/ })
    .click();
  await expect(
    page
      .locator(".challenge-level-options")
      .getByRole("button", { name: /難関/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .locator(".challenge-level-options")
    .getByRole("button", { name: /基礎/ })
    .click();
  let data = await begin(page);
  const ids = new Set<string>();
  for (let i = 0; i < 5; i++) {
    expect(ids.has(data.problem.id)).toBe(false);
    ids.add(data.problem.id);
    await correctAnswer(page, data.problem);
    if (i < 4) {
      const response = page.waitForResponse((r) =>
        r.url().endsWith("/api/challenges/next"),
      );
      await page.getByRole("button", { name: "次の問題", exact: true }).click();
      data = await (await response).json();
    }
  }
  await expect(page.locator(".challenge-totals")).toContainText("5pt");
  await page.getByRole("button", { name: "終了する", exact: true }).click();
  await expect(page.locator(".challenge-summary")).toContainText("5pt");
  await nav.getByRole("button", { name: "今日の学習", exact: true }).click();
  await expect(page.locator(".stat-item").first()).toContainText("5pt");
  await expect(page.locator(".calendar-day.has-points")).toHaveCount(1);
  await expect(page.locator(".calendar-day.has-points")).toContainText("5pt");
  await expect(page.locator(".calendar-day.has-points")).toHaveCSS(
    "background-color",
    "rgb(251, 146, 60)",
  );
  await expect(page.locator(".point-legend-chip")).toHaveCount(12);
  await page.reload();
  await expect(page.locator(".stat-item").first()).toContainText("5pt");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});

test("time attack keeps the run deadline between questions and finishes with its results", async ({
  page,
}) => {
  await page.clock.install();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#challenge");
  await page
    .locator(".challenge-mode-options")
    .getByRole("button", { name: /タイムアタック/ })
    .click();
  const started = await begin(page);
  expect(started.run?.durationSeconds).toBe(180);
  await expect(page.locator(".challenge-timer")).toBeVisible();
  await correctAnswer(page, started.problem);
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/api/challenges/next"),
  );
  await page.getByRole("button", { name: "次の問題", exact: true }).click();
  const next: ChallengeResponse = await (await response).json();
  expect(next.run?.endsAt).toBe(started.run?.endsAt);
  expect(next.run?.token).toBe(started.run?.token);
  await page.clock.fastForward(181000);
  await expect(page.locator(".challenge-summary")).toBeVisible();
  await expect(page.locator(".challenge-summary")).toContainText(
    "タイムアタック終了",
  );
  await expect(page.locator(".challenge-summary")).toContainText("回答数 1 問");
  await expect(
    page.getByRole("button", { name: "回答する", exact: true }),
  ).toHaveCount(0);
});
