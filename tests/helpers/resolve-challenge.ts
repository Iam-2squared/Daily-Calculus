import { createHmac } from "node:crypto";
import type { Problem, PrivateProblem } from "../../shared/types.js";
import type { ChallengeResponse } from "../../shared/types.js";
import type { Page } from "@playwright/test";
import { questionFingerprint } from "../../server/question-identity.js";
import {
  generateBankProblem,
  generateBankProblemV3,
} from "../../server/problem-bank/index.js";
import { generatePracticeProblem } from "../../server/practice-problems.js";
import { getProblem } from "../../server/problems.js";

// A fixture for local tests only. The E2E server passes it through createApp's
// explicit options; it is never a production default or browser-visible key.
export const E2E_CHALLENGE_KEY =
  "local_e2e_challenge_fixture_not_a_production_secret_20261109";

const attempted = new WeakMap<Page, Set<string>>();
export function markQuestionAttempted(page: Page, problem: Problem): void {
  const keys = attempted.get(page) ?? new Set<string>();
  keys.add(questionFingerprint(problem));
  attempted.set(page, keys);
}

// Assertions about a specific number of new earned questions should not become
// flaky when random issuance happens to repeat mathematics already attempted.
// Skipping is an ordinary UI action and does not mark another attempt.
export async function freshTestChallenge(
  page: Page,
  challenge: ChallengeResponse,
): Promise<ChallengeResponse> {
  let next = challenge;
  for (let count = 0; count < 20; count++) {
    if (!attempted.get(page)?.has(questionFingerprint(next.problem)))
      return next;
    const response = page.waitForResponse(
      (value) =>
        value.request().method() === "POST" &&
        new URL(value.url()).pathname === "/api/challenges/next",
    );
    await page.getByRole("button", { name: "スキップ", exact: true }).click();
    const issued = await response;
    if (!issued.ok())
      throw new Error(
        `Local fresh fixture issuance failed (${issued.status()})`,
      );
    next = (await issued.json()) as ChallengeResponse;
  }
  throw new Error("Unable to choose a fresh local test question");
}

export function resolveTestQuestion(
  problem: Problem,
  key = E2E_CHALLENGE_KEY,
): PrivateProblem {
  if (!/^c[1234][pt]\./.test(problem.id)) {
    const daily = getProblem(problem.id);
    if (!daily) throw new Error("Unknown dated fixture question");
    return daily;
  }
  const parts = problem.id.split(".");
  if (parts[0].startsWith("c4")) {
    const payload = parts.slice(0, 6).join(".");
    const derive = (domain: "content" | "shuffle") =>
      createHmac("sha256", key)
        .update(`daily-calculus:c4:${domain}:${payload}`)
        .digest("hex")
        .slice(0, 16);
    return generateBankProblemV3(
      problem.level,
      derive("content"),
      problem.date,
      problem.id,
      {},
      derive("shuffle"),
    );
  }
  const generate = parts[0].startsWith("c1")
    ? generatePracticeProblem
    : generateBankProblem;
  return generate(problem.level, parts[4], problem.date, problem.id);
}
