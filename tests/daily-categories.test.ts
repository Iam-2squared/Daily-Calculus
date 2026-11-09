import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.js";
import { getProblem, getProblems, publicProblem } from "../server/problems.js";
import { questionFingerprint } from "../server/content-fingerprint.js";
import type { Level, PrivateProblem } from "../shared/types.js";

const CUTOVER = "2026-11-07";
const LEVELS: readonly Level[] = ["basic", "applied", "advanced"];
const CATEGORIES = ["differentiation", "integration", "application"] as const;
const SLOT_CODES = ["d", "i", "a"] as const;
const dayAfter = (date: string, offset: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);

// Captured from the old generator before the daily-bank cutover was implemented.
// Keep exact answer order: an already-issued ID must never acquire a new answer.
const LEGACY_FIXTURES = [
  {
    id: "2026-11-06:basic",
    formula: "f(x) = \\log x \\quad (\\log = \\ln)",
    choices: ["-\\frac{1}{2}", "\\frac{1}{2}", "2", "4"],
    correctIndex: 1,
  },
  {
    id: "2026-11-06:applied",
    formula: "f(x) = (3x + 1)^{4}",
    choices: ["768", "256", "772", "3072"],
    correctIndex: 0,
  },
  {
    id: "2026-11-06:advanced",
    formula: "\\int_{-1}^1\\frac{x^5+2x^2}{1+x^2}\\,dx",
    choices: ["2-\\pi", "4+\\pi", "0", "4-\\pi"],
    correctIndex: 3,
  },
  {
    id: "2026-11-07:basic",
    formula: "\\int 3x^{2}\\,dx",
    choices: ["1x^{3} + C", "3x^{3} + C", "6x + C", "1x^{2} + C"],
    correctIndex: 0,
  },
  {
    id: "2026-11-07:applied",
    formula: "\\int_0^1 x e^{3x}\\,dx",
    choices: [
      "\\frac{2e^{3}-1}{9}",
      "\\frac{e^{3}-1}{3}",
      "\\frac{4e^{3}+1}{9}",
      "\\frac{2e^{3}+1}{9}",
    ],
    correctIndex: 3,
  },
  {
    id: "2026-11-07:advanced",
    formula: "\\int_0^{\\infty}\\frac{1}{x^2+25}\\,dx",
    choices: [
      "\\frac{\\pi}{20}",
      "\\frac{1}{5}",
      "\\frac{\\pi}{10}",
      "\\frac{\\pi}{5}",
    ],
    correctIndex: 2,
  },
  {
    id: "2026-11-11:advanced",
    formula: "\\int_{-1}^1\\frac{x^5+3x^2}{1+x^2}\\,dx",
    choices: [
      "6+\\frac{3}{2}\\pi",
      "0",
      "6-\\frac{3}{2}\\pi",
      "3-\\frac{3}{2}\\pi",
    ],
    correctIndex: 2,
  },
] as const;

function assertLegacyFixture(fixture: (typeof LEGACY_FIXTURES)[number]) {
  const problem = getProblem(fixture.id);
  assert.ok(problem, `${fixture.id} must remain resolvable`);
  assert.deepEqual(
    {
      id: problem.id,
      formula: problem.formula,
      choices: problem.choices,
      correctIndex: problem.correctIndex,
    },
    fixture,
  );
}

test("the daily category cutover begins on November 7 and preserves every legacy problem ID", () => {
  const previous = getProblems("2026-11-06");
  assert.deepEqual(
    previous.map((problem) => problem.level),
    LEVELS,
  );
  assert.deepEqual(
    previous.map((problem) => problem.id),
    [
      "d3:2026-11-06:l:basic",
      "d3:2026-11-06:l:applied",
      "d3:2026-11-06:l:advanced",
    ],
  );
  for (const fixture of LEGACY_FIXTURES) assertLegacyFixture(fixture);

  const current = getProblems(CUTOVER);
  assert.equal(current.length, 3);
  assert.deepEqual(
    current.map((problem) => problem.dailyCategory),
    CATEGORIES,
  );
  assert.ok(
    current.every((problem) => problem.id.startsWith(`d3:${CUTOVER}:`)),
  );
  for (const problem of previous)
    assert.deepEqual(getProblem(problem.id), problem);
});

test("daily slots remain differentiation, integration and application while all six difficulty assignments rotate", () => {
  const permutations = new Set<string>();
  const levelCounts = CATEGORIES.map(() => ({
    basic: 0,
    applied: 0,
    advanced: 0,
  }));
  for (let offset = 0; offset < 6; offset++) {
    const date = dayAfter(CUTOVER, offset);
    const problems = getProblems(date);
    assert.equal(problems.length, 3);
    assert.deepEqual(
      problems.map((problem) => problem.dailyCategory),
      CATEGORIES,
    );
    assert.deepEqual(
      [...problems.map((problem) => problem.level)].sort(),
      [...LEVELS].sort(),
    );
    assert.equal(
      problems[0].subject,
      "differentiation",
      `${date}: derivative slot`,
    );
    assert.equal(problems[1].subject, "integration", `${date}: integral slot`);
    permutations.add(problems.map((problem) => problem.level).join(","));
    problems.forEach((problem, index) => {
      assert.equal(
        problem.id,
        `d3:${date}:${SLOT_CODES[index]}:${problem.level}`,
      );
      levelCounts[index][problem.level]++;
      // Some bank implementations retain this private metadata; assert it when
      // present without requiring an extra field in the public problem contract.
      if (Object.hasOwn(problem, "application")) {
        assert.equal(
          (problem as PrivateProblem & { application: boolean }).application,
          index === 2,
        );
      }
    });
  }
  assert.equal(
    permutations.size,
    6,
    "one complete six-day cycle must cover every level permutation",
  );
  for (const counts of levelCounts)
    assert.deepEqual(counts, { basic: 2, applied: 2, advanced: 2 });
});

test("new daily problems are deterministic, preserve category metadata and resolve only their scheduled IDs", () => {
  for (const date of [
    CUTOVER,
    dayAfter(CUTOVER, 1),
    dayAfter(CUTOVER, 5),
    "2028-02-29",
  ]) {
    const first = getProblems(date);
    assert.deepEqual(
      getProblems(date),
      first,
      `${date}: repeated generation must be stable`,
    );
    assert.equal(new Set(first.map((problem) => problem.id)).size, 3);
    for (const [index, problem] of first.entries()) {
      assert.deepEqual(getProblem(problem.id), problem, problem.id);
      assert.ok(problem.id.length <= 80);
      assert.ok(Number.isInteger(problem.correctIndex));
      assert.ok(
        problem.correctIndex >= 0 &&
          problem.correctIndex < problem.choices.length,
      );
      assert.equal(problem.choices.length, 4);
      for (const forgedLevel of LEVELS.filter(
        (level) => level !== problem.level,
      )) {
        assert.equal(
          getProblem(`d3:${date}:${SLOT_CODES[index]}:${forgedLevel}`),
          null,
        );
      }
      const safe = publicProblem(problem);
      assert.equal(safe.dailyCategory, CATEGORIES[index]);
      assert.equal(safe.subject, problem.subject);
      assert.equal("correctIndex" in safe, false);
      assert.equal("explanation" in safe, false);
      assert.equal("explanationFormulas" in safe, false);
      const {
        correctIndex: _answer,
        explanation: _explanation,
        explanationFormulas: _formulas,
        ...expectedPublic
      } = problem;
      assert.deepEqual(safe, {
        ...expectedPublic,
        contentId: questionFingerprint(problem),
      });
    }
  }
});

test("new daily ID parsing rejects dates before cutover, invalid Gregorian dates, unknown slots and extra fields", () => {
  for (const id of [
    "d2:2026-11-06:d:basic",
    "d2:2027-02-29:d:basic",
    "d2:2027-02-30:i:applied",
    "d2:2026-13-01:a:advanced",
    "d2:2026-11-31:d:basic",
    "d2:2026-1-07:d:basic",
    "d2:2026-11-07:x:basic",
    "d2:2026-11-07:D:basic",
    "d2:2026-11-07:differentiation:basic",
    "d2:2026-11-07:toString:basic",
    "d2:2026-11-07:__proto__:basic",
    "d2:2026-11-07:d:unknown",
    "d2:2026-11-07:d:toString",
    "d2:2026-11-07:d:basic:extra",
    "d2:2026-11-07:d",
    "d2:2026-11-07::basic",
    "d2:2026-11-07:d:basic ",
    "d2:2026-11-07:d:basic\n",
    "d3:2026-11-07:l:basic",
    "d3:2026-11-06:d:basic",
    "d3:2026-11-07:x:basic",
    "d4:2026-11-07:d:basic",
    "2026-11-07:d:basic",
    "d2",
  ])
    assert.equal(getProblem(id), null, id);
  for (const date of [
    "2027-02-29",
    "2027-02-30",
    "2026-13-01",
    "2026-11-31",
    "2026-1-07",
  ]) {
    assert.throws(() => getProblems(date), /Invalid problem date/, date);
  }
});

test("new daily category IDs award all three difficulty scores once through the API and persist calendar and ranking totals", async (t) => {
  const app = createApp(":memory:", {
    now: () => new Date("2026-11-07T05:00:00Z"),
    secureCookies: false,
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          app.locals.db.close();
          error ? reject(error) : resolve();
        });
      }),
  );
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let cookie = "";
  async function request(path: string, body?: unknown) {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const session = response.headers.get("set-cookie")?.split(";")[0];
    if (session) cookie = session;
    return { status: response.status, body: await response.json() };
  }
  assert.equal(
    (
      await request("/api/auth/register", {
        username: "daily_category_qa",
        password: "0123",
      })
    ).status,
    201,
  );
  const daily = await request("/api/problems");
  assert.equal(daily.status, 200);
  assert.equal(daily.body.date, CUTOVER);
  assert.deepEqual(
    daily.body.problems.map(
      (problem: { dailyCategory: string }) => problem.dailyCategory,
    ),
    CATEGORIES,
  );
  let points = 0;
  for (const problem of daily.body.problems) {
    const privateProblem = getProblem(problem.id)!;
    const path = `/api/problems/${encodeURIComponent(problem.id)}/answer`;
    const body = { choiceIndex: privateProblem.correctIndex };
    const scored = await request(path, body);
    assert.equal(scored.status, 200);
    assert.equal(
      scored.body.pointsEarned,
      { basic: 1, applied: 3, advanced: 5 }[privateProblem.level],
    );
    points += scored.body.pointsEarned;
    const duplicate = await request(path, body);
    assert.equal(duplicate.body.pointsEarned, 0);
    assert.equal(duplicate.body.alreadySolved, true);
  }
  assert.equal(points, 9);
  const stats = (await request("/api/stats")).body;
  assert.equal(stats.totalPoints, 9);
  assert.equal(stats.solvedCount, 3);
  assert.deepEqual(stats.levelCounts, { basic: 1, applied: 1, advanced: 1 });
  assert.deepEqual(stats.activity, [{ date: CUTOVER, count: 3, points: 9 }]);
  assert.equal((await request("/api/rankings?period=week")).body.me.points, 9);
});
