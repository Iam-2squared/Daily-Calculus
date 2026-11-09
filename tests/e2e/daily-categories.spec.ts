import { randomBytes } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { getProblem, getProblems, publicProblem } from "../../server/problems";
import type {
  AnswerResult,
  DailyCategory,
  Level,
  Problem,
} from "../../shared/types";

const CATEGORY_LABELS: Record<DailyCategory, string> = {
  differentiation: "微分",
  integration: "積分",
  application: "応用",
};
const DIFFICULTIES: Record<Level, { label: string; points: number }> = {
  basic: { label: "基礎", points: 1 },
  applied: { label: "応用", points: 3 },
  advanced: { label: "難関", points: 5 },
};

async function assertDailyCards(page: Page, problems: Problem[]) {
  const cards = page.locator(".problem-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.locator(".daily-category")).toHaveText([
    "微分",
    "積分",
    "応用",
  ]);
  for (const [index, problem] of problems.entries()) {
    const card = cards.nth(index);
    const difficulty = DIFFICULTIES[problem.level];
    await expect(card).toHaveClass(new RegExp(`\\b${problem.level}\\b`));
    await expect(card.locator(".problem-level")).toHaveText(
      `難易度：${difficulty.label}`,
    );
    await expect(card.locator(".points-badge")).toHaveText(
      `+${(difficulty.points * 10_000).toLocaleString("ja-JP")} 轟`,
    );
  }
}

async function answerDailyCard(page: Page, problem: Problem, index: number) {
  const privateProblem = getProblem(problem.id);
  expect(privateProblem).not.toBeNull();
  await page.locator(".problem-card").nth(index).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".solver-category")).toHaveText(
    CATEGORY_LABELS[problem.dailyCategory!],
  );
  await expect(dialog.locator(".solver-level")).toHaveText(
    `難易度：${DIFFICULTIES[problem.level].label}`,
  );
  await dialog
    .locator(".answer-choice")
    .nth(privateProblem!.correctIndex)
    .click();
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        `/api/problems/${encodeURIComponent(problem.id)}/answer`,
  );
  await dialog
    .getByRole("button", { name: "答えを確かめる", exact: true })
    .click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const result = (await response.json()) as AnswerResult;
  await expect(dialog.locator(".answer-result")).toContainText("正解");
  expect(result.correct).toBe(true);
  return { dialog, result };
}

test("daily category order and difficulty labels fit every rotation at 320px and 390px", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let date = "2026-11-07";
  await page.route("**/api/problems", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        date,
        problems: getProblems(date).map(publicProblem),
      }),
    }),
  );

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (let offset = 0; offset < 6; offset++) {
      date = `2026-11-${String(7 + offset).padStart(2, "0")}`;
      await page.goto("/");
      await assertDailyCards(page, getProblems(date));
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
    }
  }
  expect(errors).toEqual([]);
});

test("solving the three daily categories earns nine points once and persists after reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".topbar-user").click();
  const registration = page.getByRole("dialog");
  await registration
    .getByLabel("ユーザーネーム")
    .fill(`日替${randomBytes(5).toString("hex")}`);
  await registration.getByLabel("4桁の数字パスワード").fill("0731");
  await registration
    .getByRole("button", { name: "登録する", exact: true })
    .click();
  await expect(registration).toHaveCount(0);

  const dailyResponse = await page.request.get("/api/problems");
  expect(dailyResponse.ok()).toBe(true);
  const daily = (await dailyResponse.json()) as {
    date: string;
    problems: Problem[];
  };
  expect(daily.problems.map((problem) => problem.dailyCategory)).toEqual([
    "differentiation",
    "integration",
    "application",
  ]);
  expect(daily.problems.map((problem) => problem.level).sort()).toEqual([
    "advanced",
    "applied",
    "basic",
  ]);
  await assertDailyCards(page, daily.problems);

  let points = 0;
  for (const [index, problem] of daily.problems.entries()) {
    const { dialog, result } = await answerDailyCard(page, problem, index);
    const earned = DIFFICULTIES[problem.level].points;
    expect(result.pointsEarned).toBe(earned);
    expect(result.alreadySolved).toBe(false);
    await expect(dialog.locator(".result-heading")).toContainText(
      `+${(earned * 10_000).toLocaleString("ja-JP")} 轟`,
    );
    await dialog
      .getByRole("button", { name: "閉じる", exact: true })
      .last()
      .click();
    points += earned;
    await expect(page.locator(".stat-item").first()).toContainText(
      `${(points * 10_000).toLocaleString("ja-JP")}轟`,
    );
  }
  expect(points).toBe(9);
  await expect(page.locator(".problem-card.solved")).toHaveCount(3);
  await expect(page.locator(".daily-caption")).toContainText(
    "今日の正解 3 / 3 問",
  );

  const duplicate = await answerDailyCard(page, daily.problems[0], 0);
  expect(duplicate.result.pointsEarned).toBe(0);
  expect(duplicate.result.alreadySolved).toBe(true);
  await expect(duplicate.dialog.locator(".answer-result")).toContainText(
    "今回の加点はありません",
  );
  await duplicate.dialog
    .getByRole("button", { name: "閉じる", exact: true })
    .last()
    .click();
  const stats = await (await page.request.get("/api/stats")).json();
  expect(stats.totalPoints).toBe(9);
  expect(stats.solvedCount).toBe(3);
  expect(stats.levelCounts).toEqual({ basic: 1, applied: 1, advanced: 1 });
  expect([...stats.solvedIds].sort()).toEqual(
    daily.problems.map((problem) => problem.id).sort(),
  );
  expect(stats.activity).toEqual([{ date: daily.date, count: 3, points: 9 }]);

  await page.reload();
  await expect(page.locator(".stat-item").first()).toContainText("90,000轟");
  await expect(page.locator(".problem-card.solved")).toHaveCount(3);
  await expect(page.locator(".calendar-day.has-points")).toHaveCount(1);
  await expect(page.locator(".calendar-day.has-points")).toContainText("9万轟");
  await assertDailyCards(page, daily.problems);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  }
  expect(errors).toEqual([]);
});
