import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createApp } from "../../server/app";
import { generateBankProblem } from "../../server/problem-bank/index";
import { getProblem } from "../../server/problems";
import { SqliteStore } from "../../server/store";
import type {
  AnswerResult,
  ChallengeResponse,
  Problem,
  Stats,
} from "../../shared/types";

const FROZEN_AT = "2026-11-08T23:00:00.000Z";
const TODAY = "2026-11-09";

async function assertPaused(notice: Locator) {
  await expect(notice).toHaveCount(1);
  await expect(notice).toHaveAttribute("role", "status");
  await expect(notice.locator("strong")).toHaveText("加点を停止しています");
  await expect(notice).toContainText(
    "獲得額は11月9日8:00時点の値に固定しています。",
  );
}

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
}

async function startChallenge(
  page: Page,
  buttonName = "開始する",
  endpoint = "start",
) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/api/challenges/${endpoint}`,
  );
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const challenge = (await response.json()) as ChallengeResponse;
  await expect(page.locator(".challenge-problem h2")).toHaveText(
    challenge.problem.title,
  );
  await expect(page.locator(".challenge-answer-result")).toHaveCount(0);
  return challenge;
}

async function answerCorrectly(page: Page, problem: Problem, daily = false) {
  const privateProblem = daily
    ? getProblem(problem.id)!
    : generateBankProblem(
        problem.level,
        problem.id.split(".")[4],
        problem.date,
        problem.id,
      );
  const container = daily
    ? page.getByRole("dialog")
    : page.locator(".challenge-problem");
  await container
    .locator(".answer-choice")
    .nth(privateProblem.correctIndex)
    .click();
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        `/api/problems/${encodeURIComponent(problem.id)}/answer`,
  );
  await container
    .getByRole("button", {
      name: daily ? "答えを確かめる" : "回答する",
      exact: true,
    })
    .click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  expect((await response.json()) as AnswerResult).toMatchObject({
    correct: true,
    pointsEarned: 0,
    alreadySolved: false,
    awardPaused: true,
    scoringFrozenAt: FROZEN_AT,
  });
  const result = container.locator(
    daily ? ".answer-result" : ".challenge-answer-result",
  );
  await expect(
    result.locator(
      daily ? ".result-heading h3" : ".challenge-result-label strong",
    ),
  ).toHaveText("正解");
  await expect(
    result.locator(daily ? ".result-heading" : ".challenge-result-label"),
  ).not.toContainText(/\+\s*[\d,]+\s*轟/);
  await assertPaused(result.locator(".scoring-paused"));
  await expect(result.locator(".scoring-award-paused")).toHaveText(
    "正解です。現在は加点停止中のため、轟は加算されません。",
  );
  if (!daily)
    await expect(
      page.getByRole("button", { name: "次の問題", exact: true }),
    ).toBeEnabled();
  await assertNoOverflow(page);
  return container;
}

test("global pause keeps fresh daily, practice and timed answers at zero with a readable JST freeze notice on 320px", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  // This isolated app and in-memory store never change the shared E2E server or
  // a live database. Port zero lets the OS choose an unused local port.
  const store = new SqliteStore(":memory:");
  store.db
    .prepare(
      "UPDATE scoring_control SET paused=1,frozen_at=? WHERE singleton=1",
    )
    .run(FROZEN_AT);
  const app = createApp(undefined, {
    store,
    secureCookies: false,
    now: () => new Date("2026-11-09T05:00:00.000Z"),
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
  await page.clock.install({ time: new Date("2026-11-09T05:00:00.000Z") });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto("/");
    const dashboard = page.locator(".dashboard");
    await assertPaused(dashboard.locator(":scope > .scoring-paused"));
    await expect(page.locator(".points-badge")).toHaveText([
      "加点停止中",
      "加点停止中",
      "加点停止中",
    ]);
    await assertNoOverflow(page);
    await page.locator(".topbar-user").click();
    const registration = page.getByRole("dialog");
    await registration.getByLabel("ユーザーネーム").fill("停止確認");
    await registration.getByLabel("4桁の数字パスワード").fill("1138");
    await registration
      .getByRole("button", { name: "登録する", exact: true })
      .click();
    await expect(registration).toHaveCount(0);
    const daily = (await (
      await context.request.get("/api/problems")
    ).json()) as { problems: Problem[] };
    const basic = daily.problems.find((problem) => problem.level === "basic")!;
    await page.locator(".problem-card.basic").click();
    await expect(page.locator(".solver-points")).toHaveText("加点停止中");
    await assertPaused(
      page.getByRole("dialog").locator(".problem-modal-body > .scoring-paused"),
    );
    const solvedDaily = await answerCorrectly(page, basic, true);
    await solvedDaily
      .getByRole("button", { name: "閉じる", exact: true })
      .last()
      .click();
    await page.reload();
    await assertPaused(dashboard.locator(":scope > .scoring-paused"));
    await expect(page.locator(".problem-card.basic")).toHaveClass(/solved/);
    await expect(page.locator(".stat-item").first()).toContainText("0轟");
    await expect(page.locator(".calendar-day.today")).toHaveAttribute(
      "aria-label",
      /1問正解、0轟/,
    );

    const nav = page.locator(".mobile-bottom-nav");
    await nav.getByRole("button", { name: "挑戦", exact: true }).click();
    await assertPaused(page.locator(".challenge-setup > .scoring-paused"));
    await expect(
      page.locator(".challenge-level-options button span"),
    ).toHaveText(["加点停止中", "加点停止中", "加点停止中"]);
    await expect(page.locator(".challenge-setup")).not.toContainText(
      "獲得します",
    );
    await page
      .locator(".challenge-level-options")
      .getByRole("button", { name: /応用/ })
      .click();
    const practice = await startChallenge(page);
    await expect(page.locator(".challenge-run-heading")).toContainText(
      "加点停止中",
    );
    await expect(page.locator(".challenge-run-heading")).not.toContainText(
      "正解で",
    );
    await answerCorrectly(page, practice.problem);
    await page.getByRole("button", { name: "終了する", exact: true }).click();
    await expect(page.locator(".challenge-summary")).toContainText("0轟");
    await assertPaused(page.locator(".challenge-summary > .scoring-paused"));
    await page.getByRole("button", { name: "設定に戻る", exact: true }).click();

    await page
      .locator(".challenge-level-options")
      .getByRole("button", { name: /難関/ })
      .click();
    await page
      .locator(".challenge-mode-options")
      .getByRole("button", { name: /タイムアタック/ })
      .click();
    const timed = await startChallenge(page);
    await answerCorrectly(page, timed.problem);
    const next = await startChallenge(page, "次の問題", "next");
    expect(next.run?.token).toBe(timed.run!.token);
    expect(next.run?.endsAt).toBe(timed.run!.endsAt);
    await answerCorrectly(page, next.problem);
    await page.getByRole("button", { name: "終了する", exact: true }).click();
    await nav.getByRole("button", { name: "今日の学習", exact: true }).click();
    await page.reload();
    await assertPaused(dashboard.locator(":scope > .scoring-paused"));
    const stats = (await (
      await context.request.get("/api/stats")
    ).json()) as Stats;
    expect(stats).toMatchObject({
      totalPoints: 0,
      weeklyPoints: 0,
      solvedCount: 4,
      scoringPaused: true,
      scoringFrozenAt: FROZEN_AT,
      levelCounts: { basic: 1, applied: 1, advanced: 2 },
      activity: [{ date: TODAY, count: 4, points: 0 }],
    });
    await expect(page.locator(".stat-item").nth(2)).toContainText("4問");
    await expect(page.locator(".selected-day-detail")).toContainText(
      "4 問に正解",
    );
    await expect(page.locator(".calendar-day.has-points")).toHaveCount(0);
    await assertNoOverflow(page);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
    store.db.close();
  }
});
