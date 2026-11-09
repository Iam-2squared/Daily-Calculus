import { randomBytes } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { generateBankProblem } from "../../server/problem-bank/index";
import { generatePracticeProblem } from "../../server/practice-problems";
import { getProblem } from "../../server/problems";
import type {
  AnswerResult,
  ChallengeResponse,
  Problem,
  ScoringStatus,
  Stats,
} from "../../shared/types";

const scoring = (
  mistakes: number,
  correctStreak: number,
  locked: boolean,
): ScoringStatus => ({
  mistakes,
  correctStreak,
  requiredCorrectStreak: 3,
  locked,
});

async function assertState(page: Page, expected: ScoringStatus) {
  const response = await page.request.get("/api/stats");
  expect(response.ok()).toBe(true);
  const stats = (await response.json()) as Stats;
  expect(stats.scoring).toEqual(expected);
  return stats;
}

async function assertNotice(container: Locator, correctStreak: number) {
  const notice = container.locator(".scoring-notice:has(.scoring-progress)");
  await expect(notice).toHaveCount(1);
  await expect(notice).toHaveAttribute("role", "status");
  await expect(notice.locator("strong")).toHaveText(
    `加点再開まで、あと${3 - correctStreak}問連続正解`,
  );
  await expect(notice.locator(".scoring-progress")).toHaveText(
    `連続正解 ${correctStreak} / 3`,
  );
}

async function issueChallenge(
  page: Page,
  buttonName: "開始する" | "次の問題",
  endpoint: "start" | "next",
) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/api/challenges/${endpoint}`,
  );
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as ChallengeResponse;
  await expect(page.locator(".challenge-problem h2")).toHaveText(
    data.problem.title,
  );
  await expect(page.locator(".challenge-answer-result")).toHaveCount(0);
  return data;
}

function correctIndex(problem: Problem) {
  if (/^c[123][pt]\./.test(problem.id)) {
    const generate = /^c[23]/.test(problem.id)
      ? generateBankProblem
      : generatePracticeProblem;
    return generate(
      problem.level,
      problem.id.split(".")[4],
      problem.date,
      problem.id,
    ).correctIndex;
  }
  const privateProblem = getProblem(problem.id);
  expect(privateProblem).not.toBeNull();
  return privateProblem!.correctIndex;
}

async function answer(
  page: Page,
  problem: Problem,
  correct: boolean,
  daily = false,
) {
  if (daily) await page.locator(`.problem-card.${problem.level}`).click();
  const container = daily
    ? page.getByRole("dialog")
    : page.locator(".challenge-problem");
  const right = correctIndex(problem);
  await container
    .locator(".answer-choice")
    .nth(correct ? right : (right + 1) % problem.choices.length)
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
  const result = (await response.json()) as AnswerResult;
  expect(result.correct).toBe(correct);
  await expect(
    container.locator(
      daily ? ".result-heading h3" : ".challenge-result-label strong",
    ),
  ).toHaveText(correct ? "正解" : "不正解");
  if (!daily)
    await expect(
      container.getByRole("button", { name: "次の問題", exact: true }),
    ).toBeEnabled();
  return { result, container };
}

async function closeDaily(container: Locator) {
  await container
    .getByRole("button", { name: "閉じる", exact: true })
    .last()
    .click();
  await expect(container).toHaveCount(0);
}

test("two account-wide mistakes require three fresh consecutive correct answers across daily, practice and timed modes", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let registered = false;
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await page.goto("/");
    await page.locator(".topbar-user").click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("ユーザーネーム")
      .fill(`回復${randomBytes(5).toString("hex")}`);
    await dialog.getByLabel("4桁の数字パスワード").fill("0953");
    const registrationPromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/auth/register",
    );
    await dialog.getByRole("button", { name: "登録する", exact: true }).click();
    const registration = await registrationPromise;
    expect(registration.ok()).toBe(true);
    registered = true;
    await expect(dialog).toHaveCount(0);
    await assertState(page, scoring(0, 0, false));

    const daily = (await (await page.request.get("/api/problems")).json()) as {
      date: string;
      problems: Problem[];
    };
    const basic = daily.problems.find((problem) => problem.level === "basic")!;
    const applied = daily.problems.find(
      (problem) => problem.level === "applied",
    )!;
    const dashboard = page.locator(".dashboard");
    const challenge = page.locator(".challenge-view");
    const nav = page.locator(".mobile-bottom-nav");

    const firstMistake = await answer(page, basic, false, true);
    expect(firstMistake.result.pointsEarned).toBe(0);
    expect(firstMistake.result.scoring).toEqual(scoring(1, 0, false));
    await expect(firstMistake.container.locator(".scoring-notice")).toHaveCount(
      0,
    );
    await closeDaily(firstMistake.container);

    await nav.getByRole("button", { name: "挑戦", exact: true }).click();
    await page
      .locator(".challenge-level-options")
      .getByRole("button", { name: /応用/ })
      .click();
    const practice = await issueChallenge(page, "開始する", "start");
    const secondMistake = await answer(page, practice.problem, false);
    expect(secondMistake.result.scoring).toEqual(scoring(2, 0, true));
    await assertNotice(challenge, 0);
    await assertState(page, scoring(2, 0, true));

    await page.reload();
    await expect(page.locator(".challenge-setup")).toBeVisible();
    await assertNotice(challenge, 0);
    await page.setViewportSize({ width: 320, height: 568 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320);
    await page.setViewportSize({ width: 390, height: 844 });
    await nav.getByRole("button", { name: "今日の学習", exact: true }).click();
    await assertNotice(dashboard, 0);

    const firstCorrect = await answer(page, basic, true, true);
    expect(firstCorrect.result).toMatchObject({
      pointsEarned: 0,
      alreadySolved: false,
      awardBlocked: true,
      scoring: scoring(2, 1, true),
    });
    await assertNotice(firstCorrect.container, 1);
    await expect(
      firstCorrect.container.locator(".scoring-award-blocked"),
    ).toContainText("今回は加点されません");
    await closeDaily(firstCorrect.container);
    await page.reload();
    await assertNotice(dashboard, 1);
    await expect(page.locator(".stat-item").nth(2)).toContainText("1問");
    await expect(page.locator(".selected-day-detail")).toContainText(
      "1 問に正解",
    );
    await expect(page.locator(".calendar-day.today")).toHaveAttribute(
      "aria-label",
      /1問正解、0轟/,
    );

    // Completing the same saved question again cannot supply a recovery answer.
    // An incorrect replay of it must also leave the existing streak untouched.
    for (const correct of [true, false]) {
      const replay = await answer(page, basic, correct, true);
      expect(replay.result).toMatchObject({
        pointsEarned: 0,
        alreadySolved: true,
        scoring: scoring(2, 1, true),
      });
      await closeDaily(replay.container);
      await assertState(page, scoring(2, 1, true));
    }

    await nav.getByRole("button", { name: "挑戦", exact: true }).click();
    await assertNotice(challenge, 1);
    await page
      .locator(".challenge-level-options")
      .getByRole("button", { name: /難関/ })
      .click();
    await page
      .locator(".challenge-mode-options")
      .getByRole("button", { name: /タイムアタック/ })
      .click();
    let timed = await issueChallenge(page, "開始する", "start");
    const originalRun = timed.run!;
    expect(originalRun.durationSeconds).toBe(180);
    const secondCorrect = await answer(page, timed.problem, true);
    expect(secondCorrect.result).toMatchObject({
      pointsEarned: 0,
      awardBlocked: true,
      scoring: scoring(2, 2, true),
    });
    await assertNotice(challenge, 2);
    await expect(challenge.locator(".scoring-award-blocked")).toBeVisible();

    const nextTimed = async () => {
      const next = await issueChallenge(page, "次の問題", "next");
      expect(next.run?.token).toBe(originalRun.token);
      expect(next.run?.endsAt).toBe(originalRun.endsAt);
      expect(next.problem.id).not.toBe(timed.problem.id);
      timed = next;
      return next.problem;
    };
    const interrupted = await answer(page, await nextTimed(), false);
    expect(interrupted.result.scoring).toEqual(scoring(2, 0, true));
    await assertNotice(challenge, 0);

    for (let streak = 1; streak <= 3; streak++) {
      const recovery = await answer(page, await nextTimed(), true);
      const recovered = streak === 3;
      expect(recovery.result).toMatchObject({
        pointsEarned: recovered ? 5 : 0,
        alreadySolved: false,
        awardBlocked: !recovered,
        scoring: recovered ? scoring(0, 0, false) : scoring(2, streak, true),
      });
      if (recovered) {
        await expect(challenge.locator(".scoring-notice")).toHaveCount(0);
        await expect(page.locator(".challenge-result-label")).toContainText(
          "+50,000 轟",
        );
      } else {
        await assertNotice(challenge, streak);
        await expect(challenge.locator(".scoring-award-blocked")).toBeVisible();
      }
    }
    const recoveredStats = await assertState(page, scoring(0, 0, false));
    expect(recoveredStats.totalPoints).toBe(5);
    expect(recoveredStats.solvedCount).toBe(5);
    await page.getByRole("button", { name: "終了する", exact: true }).click();
    await expect(page.locator(".challenge-summary")).toContainText("50,000轟");
    await expect(challenge.locator(".scoring-notice")).toHaveCount(0);

    await nav.getByRole("button", { name: "今日の学習", exact: true }).click();
    const normalAward = await answer(page, applied, true, true);
    expect(normalAward.result).toMatchObject({
      pointsEarned: 3,
      awardBlocked: false,
      scoring: scoring(0, 0, false),
    });
    await expect(
      normalAward.container.locator(".result-heading"),
    ).toContainText("+30,000 轟");
    await closeDaily(normalAward.container);
    await page.reload();
    const finalStats = await assertState(page, scoring(0, 0, false));
    expect(finalStats.totalPoints).toBe(8);
    expect(finalStats.solvedCount).toBe(6);
    expect(finalStats.levelCounts).toEqual({
      basic: 1,
      applied: 1,
      advanced: 4,
    });
    expect(finalStats.activity).toEqual([
      { date: daily.date, count: 6, points: 8 },
    ]);
    await expect(dashboard.locator(".scoring-notice")).toHaveCount(0);
    await expect(page.locator(".stat-item").first()).toContainText("80,000轟");
    await expect(page.locator(".stat-item").nth(2)).toContainText("6問");
    await expect(page.locator(".selected-day-detail")).toContainText(
      "6 問に正解",
    );
    await expect(page.locator(".calendar-day.has-points")).toHaveCount(1);
    await expect(page.locator(".calendar-day.has-points")).toContainText(
      "8万轟",
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(390);
    expect(errors).toEqual([]);
  } finally {
    if (registered) {
      const cleanup = await page.request.delete("/api/account", {
        data: { confirmation: "DELETE" },
      });
      expect(cleanup.ok()).toBe(true);
    }
  }
});
