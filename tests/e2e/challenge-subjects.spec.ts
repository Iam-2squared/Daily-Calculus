import { test, expect, type Page } from "@playwright/test";
import type {
  ChallengeMode,
  ChallengeResponse,
  ChallengeSubject,
  Level,
  Problem,
} from "../../shared/types";
import { generatePracticeProblem } from "../../server/practice-problems";
import { generateBankProblem } from "../../server/problem-bank/index";

async function issue(
  page: Page,
  buttonName: string,
  endpoint: "start" | "next" = "start",
) {
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/challenges/${endpoint}` &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  return {
    data: (await response.json()) as ChallengeResponse,
    request: response.request().postDataJSON() as {
      level: Level;
      mode: ChallengeMode;
      subject: ChallengeSubject;
      runToken?: string;
    },
  };
}

async function correctAnswer(page: Page, problem: Problem) {
  const generate = /^c[23][pt]\./.test(problem.id)
    ? generateBankProblem
    : generatePracticeProblem;
  const privateProblem = generate(
    problem.level,
    problem.id.split(".")[4],
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

async function finishAndSettings(page: Page, label: string) {
  await page.getByRole("button", { name: "終了する", exact: true }).click();
  await expect(page.locator(".challenge-summary-subject")).toHaveText(
    `出題範囲：${label}`,
  );
  await page.getByRole("button", { name: "設定に戻る", exact: true }).click();
}

test("mobile subject choices default to all and preserve derivative/integral filters through next, retry, skip, restart and settings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/#challenge");
    const subjects = page.locator(".challenge-subject-options");
    await expect(subjects.getByRole("button")).toHaveText([
      "微分",
      "積分",
      "全て",
    ]);
    await expect(
      subjects.getByRole("button", { name: "全て", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      subjects.getByRole("button", { name: "微分", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      subjects.getByRole("button", { name: "積分", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    for (const button of await subjects.getByRole("button").all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }

  const subjects = page.locator(".challenge-subject-options");
  await subjects.getByRole("button", { name: "微分", exact: true }).click();
  await expect(
    subjects.getByRole("button", { name: "微分", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const started = await issue(page, "開始する");
  expect(started.request).toMatchObject({
    level: "basic",
    mode: "practice",
    subject: "differentiation",
  });
  expect(started.data.problem.subject).toBe("differentiation");
  await expect(page.locator(".challenge-run-subject")).toHaveText(
    "出題範囲：微分",
  );
  await correctAnswer(page, started.data.problem);

  // A retry must send the selected filter again, not fall back to all topics.
  let nextAttempts = 0;
  await page.route("**/api/challenges/next", async (route) => {
    expect(route.request().postDataJSON().subject).toBe("differentiation");
    nextAttempts++;
    if (nextAttempts === 1) {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "問題の取得に失敗しました。" }),
      });
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "次の問題", exact: true }).click();
  await expect(page.locator(".challenge-error")).toContainText(
    "問題の取得に失敗しました。",
  );
  const retried = await issue(page, "再試行", "next");
  expect(retried.request.subject).toBe("differentiation");
  expect(retried.data.problem.subject).toBe("differentiation");
  expect(retried.data.problem.id).not.toBe(started.data.problem.id);
  await page.unroute("**/api/challenges/next");
  expect(nextAttempts).toBe(2);

  const skipped = await issue(page, "スキップ", "next");
  expect(skipped.request.subject).toBe("differentiation");
  expect(skipped.data.problem.subject).toBe("differentiation");
  await page.getByRole("button", { name: "終了する", exact: true }).click();
  await expect(page.locator(".challenge-summary-subject")).toHaveText(
    "出題範囲：微分",
  );
  const restarted = await issue(page, "もう一度挑戦");
  expect(restarted.request.subject).toBe("differentiation");
  expect(restarted.data.problem.subject).toBe("differentiation");
  await finishAndSettings(page, "微分");
  await expect(
    subjects.getByRole("button", { name: "微分", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  await subjects.getByRole("button", { name: "積分", exact: true }).click();
  await page
    .locator(".challenge-level-options")
    .getByRole("button", { name: /応用/ })
    .click();
  const integral = await issue(page, "開始する");
  expect(integral.request).toMatchObject({
    level: "applied",
    mode: "practice",
    subject: "integration",
  });
  expect(integral.data.problem.subject).toBe("integration");
  await expect(page.locator(".challenge-run-subject")).toHaveText(
    "出題範囲：積分",
  );
  await correctAnswer(page, integral.data.problem);
  const nextIntegral = await issue(page, "次の問題", "next");
  expect(nextIntegral.request.subject).toBe("integration");
  expect(nextIntegral.data.problem.subject).toBe("integration");
  await finishAndSettings(page, "積分");
  await expect(
    subjects.getByRole("button", { name: "積分", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  await subjects.getByRole("button", { name: "全て", exact: true }).click();
  const all = await issue(page, "開始する");
  expect(all.request.subject).toBe("all");
  expect(["differentiation", "integration"]).toContain(
    all.data.problem.subject,
  );
  await expect(page.locator(".challenge-run-subject")).toHaveText(
    "出題範囲：全て",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  expect(errors).toEqual([]);
});

test("time attack retains its integral filter and deadline, including the results and a new run", async ({
  page,
}) => {
  await page.clock.install();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#challenge");
  await page
    .locator(".challenge-subject-options")
    .getByRole("button", { name: "積分", exact: true })
    .click();
  await page
    .locator(".challenge-level-options")
    .getByRole("button", { name: /難関/ })
    .click();
  await page
    .locator(".challenge-mode-options")
    .getByRole("button", { name: /タイムアタック/ })
    .click();
  const started = await issue(page, "開始する");
  expect(started.request).toMatchObject({
    level: "advanced",
    mode: "time-attack",
    subject: "integration",
  });
  expect(started.data.problem.subject).toBe("integration");
  expect(started.data.run?.durationSeconds).toBe(180);
  await expect(page.locator(".challenge-run-subject")).toHaveText(
    "出題範囲：積分",
  );
  await correctAnswer(page, started.data.problem);
  const next = await issue(page, "次の問題", "next");
  expect(next.request.subject).toBe("integration");
  expect(next.request.runToken).toBe(started.data.run!.token);
  expect(next.data.problem.subject).toBe("integration");
  expect(next.data.run?.token).toBe(started.data.run!.token);
  expect(next.data.run?.endsAt).toBe(started.data.run!.endsAt);
  // Wait for the second response to be applied before moving the browser clock.
  await expect(page.locator(".challenge-problem-meta")).toContainText(
    "第 2 問",
  );
  await page.clock.fastForward(181000);
  await expect(page.locator(".challenge-summary")).toContainText(
    "タイムアタック終了",
  );
  await expect(page.locator(".challenge-summary-subject")).toHaveText(
    "出題範囲：積分",
  );
  const restarted = await issue(page, "もう一度挑戦");
  expect(restarted.request.subject).toBe("integration");
  expect(restarted.data.problem.subject).toBe("integration");
  expect(restarted.data.run?.token).not.toBe(started.data.run!.token);
  expect(restarted.data.run!.endsAt).toBeGreaterThan(started.data.run!.endsAt);
  await expect(page.locator(".challenge-run-subject")).toHaveText(
    "出題範囲：積分",
  );
  await finishAndSettings(page, "積分");
  await expect(
    page
      .locator(".challenge-subject-options")
      .getByRole("button", { name: "積分", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .locator(".challenge-mode-options")
      .getByRole("button", { name: /タイムアタック/ }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
