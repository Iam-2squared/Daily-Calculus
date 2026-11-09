import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { expect, test, type Page } from "@playwright/test";
import { createApp } from "../../server/app";
import { getProblem } from "../../server/problems";
import { SqliteStore } from "../../server/store";
import type { AnswerResult, Problem, Stats } from "../../shared/types";

const FIRST_DAY = "2026-11-08";
const SECOND_DAY = "2026-11-09";
const BEFORE_MIDNIGHT = "2026-11-08T14:59:00.000Z";
const AFTER_MIDNIGHT = "2026-11-08T15:00:00.000Z";

async function answerDaily(page: Page, problem: Problem, correct: boolean) {
  const index = getProblem(problem.id)!.correctIndex;
  const dialog = page.getByRole("dialog");
  await dialog
    .locator(".answer-choice")
    .nth(correct ? index : (index + 1) % problem.choices.length)
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
  await expect(dialog.locator(".result-heading h3")).toHaveText(
    correct ? "正解" : "不正解",
  );
  return { dialog, result };
}

async function closeProblem(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "閉じる", exact: true })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
}

test("a wrong answer earns nothing that day while the same archived question can earn once on the next Japanese day on mobile", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  // Port zero and an in-memory store isolate this clock-controlled flow from
  // the shared E2E server, every other test account, and production data.
  const store = new SqliteStore(":memory:");
  let now = BEFORE_MIDNIGHT;
  const app = createApp(undefined, {
    store,
    secureCookies: false,
    now: () => new Date(now),
    integration: { identitySecret: "", targetSecret: "" },
  });
  const dist = fileURLToPath(new URL("../../dist", import.meta.url));
  app.use(express.static(dist));
  app.get("/{*path}", (_request, response) =>
    response.sendFile(resolve(dist, "index.html")),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const context = await browser.newContext({
    baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    viewport: { width: 320, height: 568 },
  });
  const page = await context.newPage();
  await page.clock.install({ time: new Date(BEFORE_MIDNIGHT) });
  await page.clock.setFixedTime(new Date(BEFORE_MIDNIGHT));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto("/");
    await page.locator(".topbar-user").click();
    const registration = page.getByRole("dialog");
    await registration.getByLabel("ユーザーネーム").fill("当日加点確認");
    await registration.getByLabel("4桁の数字パスワード").fill("1189");
    await registration
      .getByRole("button", { name: "登録する", exact: true })
      .click();
    await expect(registration).toHaveCount(0);
    const daily = (await (
      await context.request.get("/api/problems")
    ).json()) as { date: string; problems: Problem[] };
    expect(daily.date).toBe(FIRST_DAY);
    const basicIndex = daily.problems.findIndex(
      (problem) => problem.level === "basic",
    );
    const problem = daily.problems[basicIndex];
    const canonicalId = problem.rewardId ?? problem.id;
    const contentId = (problem as Problem & { contentId: string }).contentId;
    expect(contentId).toMatch(/^[0-9a-f]{64}$/);
    const card = page.locator(".problem-card.basic");
    await card.click();
    const wrong = await answerDaily(page, problem, false);
    expect(wrong.result).toMatchObject({
      correct: false,
      pointsEarned: 0,
      awardWrongDayBlocked: true,
      awardPending: false,
      awardAttemptedToday: true,
      awardDuplicate: false,
      scoring: { mistakes: 1, correctStreak: 0, locked: false },
    });
    await expect(wrong.dialog.locator(".scoring-wrong-day-message")).toHaveText(
      "この問題は今日は加点されません。",
    );
    await expect(wrong.dialog.locator(".scoring-next-day")).toContainText(
      "翌日",
    );
    await expect(wrong.dialog.locator(".solver-points")).toHaveText(
      "今日は加点なし",
    );
    await noOverflow(page);
    await closeProblem(page);
    await expect(card.locator(".points-badge")).toHaveText("今日は加点なし");
    await expect(card).not.toHaveClass(/solved/);

    await card.click();
    await expect(
      page.getByRole("dialog").locator(".solver-footnote"),
    ).toContainText("この問題は今日は加点されません");
    const corrected = await answerDaily(page, problem, true);
    expect(corrected.result).toMatchObject({
      correct: true,
      pointsEarned: 0,
      alreadySolved: false,
      awardWrongDayBlocked: true,
      awardPending: false,
      awardAttemptedToday: true,
      awardDuplicate: true,
    });
    await expect(
      corrected.dialog.locator(".scoring-wrong-day-message"),
    ).toHaveText(
      "正解です。この問題は今日すでに間違えたため、轟は加算されません。",
    );
    await expect(corrected.dialog.locator(".result-heading")).not.toContainText(
      /\+\s*[\d,]+\s*轟/,
    );
    await expect(corrected.dialog.locator(".answer-result")).not.toContainText(
      "この問題を解き直しても加点されません。",
    );
    await expect(corrected.dialog.locator(".scoring-duplicate")).toHaveText(
      "この問題は今日すでに回答したため、今回は加点されません。",
    );
    await closeProblem(page);
    await page.reload();
    await expect(card).toHaveClass(/solved/);
    await expect(card.locator(".points-badge")).toHaveText("今日は加点なし");
    const firstStats = (await (
      await context.request.get("/api/stats")
    ).json()) as Stats;
    expect(firstStats).toMatchObject({
      totalPoints: 0,
      solvedCount: 1,
      solvedIds: [canonicalId],
      wrongTodayIds: [canonicalId],
      pendingAwardIds: [],
      attemptedTodayContentIds: [contentId],
      activity: [{ date: FIRST_DAY, count: 1, points: 0 }],
    });
    await expect(page.locator(".calendar-day.today")).toHaveAttribute(
      "aria-label",
      /1問正解、0轟/,
    );

    // Learning remains recorded once; each Japanese day's first attempt has
    // its own eligibility. Yesterday's failed attempt cannot block today.
    now = AFTER_MIDNIGHT;
    await page.clock.setFixedTime(new Date(AFTER_MIDNIGHT));
    await page.goto("/#archive");
    // Hash navigation alone retains the prior day's loaded stats. A reopened
    // page must fetch both the new Japanese date and its current award locks.
    await page.reload();
    const archivedCard = page.locator(".archive-card").nth(basicIndex);
    await expect(archivedCard.getByRole("heading")).toHaveText(problem.title);
    await expect(archivedCard).toContainText("正解済み");
    await expect(archivedCard).toContainText("10,000");
    await expect(archivedCard).not.toContainText("今日は加点なし");
    await archivedCard.click();
    const recorded = page.getByRole("dialog");
    await expect(recorded.locator(".solver-points")).toContainText("10,000");
    await expect(recorded.locator(".scoring-pending")).toHaveCount(0);
    await expect(recorded.locator(".solver-footnote")).toHaveText(
      "学習記録では正解済みですが、今日の最初の回答は通常の加点条件で判定されます。",
    );
    await expect(recorded.locator(".scoring-wrong-day")).toHaveCount(0);
    const laterCorrect = await answerDaily(page, problem, true);
    expect(laterCorrect.result).toMatchObject({
      correct: true,
      pointsEarned: 1,
      alreadySolved: true,
      awardWrongDayBlocked: false,
      awardPending: false,
      awardAttemptedToday: true,
      awardDuplicate: false,
      scoring: { mistakes: 1, correctStreak: 0, locked: false },
    });
    await expect(laterCorrect.dialog.locator(".result-heading")).toContainText(
      "+10,000 轟",
    );
    await expect(laterCorrect.dialog.locator(".scoring-duplicate")).toHaveCount(
      0,
    );
    await noOverflow(page);
    await closeProblem(page);
    await expect(archivedCard).toContainText("正解済み");
    await expect(archivedCard).not.toContainText("加点対象（未獲得）");
    await expect(archivedCard).toContainText("本日回答済み");

    await archivedCard.click();
    const replay = await answerDaily(page, problem, true);
    expect(replay.result).toMatchObject({
      correct: true,
      pointsEarned: 0,
      alreadySolved: true,
      awardPending: false,
      awardAttemptedToday: true,
      awardDuplicate: true,
    });
    await expect(replay.dialog.locator(".result-heading")).not.toContainText(
      /\+\s*[\d,]+\s*轟/,
    );
    await expect(replay.dialog.locator(".scoring-duplicate")).toHaveText(
      "この問題は今日すでに回答したため、今回は加点されません。",
    );
    await expect(replay.dialog.locator(".answer-result")).toContainText(
      "翌日（日本時間0:00以降）は、通常の加点条件が適用されます。",
    );
    const finalStats = (await (
      await context.request.get("/api/stats")
    ).json()) as Stats;
    expect(finalStats).toMatchObject({
      totalPoints: 1,
      weeklyPoints: 1,
      solvedCount: 1,
      solvedIds: [canonicalId],
      wrongTodayIds: [],
      pendingAwardIds: [],
      attemptedTodayContentIds: [contentId],
      activity: [
        { date: FIRST_DAY, count: 1, points: 0 },
        { date: SECOND_DAY, count: 1, points: 1 },
      ],
    });
    expect(finalStats.activity.find((day) => day.date === SECOND_DAY)).toEqual({
      date: SECOND_DAY,
      count: 1,
      points: 1,
    });
    expect((await store.lifetimeTotals([1]))[0].totalPoints).toBe(1);
    expect(
      store.db.prepare("SELECT COUNT(*) AS count FROM daily_awards").get()
        ?.count,
    ).toBe(1);
    expect(
      store.db
        .prepare("SELECT COUNT(*) AS count,SUM(points) AS points FROM solves")
        .get(),
    ).toMatchObject({ count: 1, points: 0 });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
    store.db.close();
  }
});
