import { test } from "node:test";
import assert from "node:assert/strict";
import katex from "katex";
import { getProblem, getProblems, publicProblem } from "../server/problems.js";
import { lessons } from "../src/lessons.js";

// Independently calculated reference answers for every family of daily questions.
const references = [
  ["2026-10-24", ["256", "\\frac{1}{2}", "-\\frac{1}{9}"]],
  ["2026-10-25", ["\\frac{1}{2}", "-16", "2"]],
  ["2026-10-26", ["-\\sin x", "6", "\\frac{1}{4}"]],
  ["2026-10-27", ["\\frac{1}{4}", "24", "4-\\pi"]],
  [
    "2026-10-28",
    ["\\frac{2}{5}x^{5} + C", "\\frac{2e^{3}+1}{9}", "\\frac{\\pi}{6}"],
  ],
] as const;

test("daily calculus answers agree with independent reference calculations", () => {
  for (const [date, answers] of references) {
    getProblems(date).forEach((p, index) =>
      assert.equal(
        p.choices[p.correctIndex],
        answers[index],
        `${date} ${p.level}`,
      ),
    );
  }
});

test("a complete question cycle has valid answer choices and renderable mathematics", () => {
  const formulas = new Set<string>();
  for (let day = 0; day < 1800; day++) {
    const date = new Date(Date.UTC(2022, 0, 1) + day * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const questions = getProblems(date);
    assert.equal(questions.length, 3);
    for (const p of questions) {
      assert.equal(new Set(p.choices).size, 4, `${p.id} has duplicate choices`);
      assert.ok(p.correctIndex >= 0 && p.correctIndex <= 3);
      assert.deepEqual(getProblem(p.id), p);
      formulas.add(p.formula);
      p.choices.forEach((x) => formulas.add(x));
      p.explanationFormulas.forEach((x) => formulas.add(x));
    }
  }
  for (const formula of formulas) {
    assert.doesNotThrow(
      () =>
        katex.renderToString(formula, { throwOnError: true, strict: "error" }),
      formula,
    );
  }
  for (const lesson of lessons) {
    assert.doesNotThrow(() =>
      katex.renderToString(lesson.formula, { throwOnError: true }),
    );
    for (const section of lesson.content) {
      if (section.formula)
        assert.doesNotThrow(() =>
          katex.renderToString(section.formula!, { throwOnError: true }),
        );
    }
  }
});

test("public questions contain no answer or explanation and malformed ids are rejected", () => {
  const p = getProblems("2026-10-28")[0];
  const safe = publicProblem(p);
  assert.equal("correctIndex" in safe, false);
  assert.equal("explanation" in safe, false);
  assert.equal("explanationFormulas" in safe, false);
  for (const id of [
    "2026-02-30:basic",
    "2026-1-02:basic",
    "2026-10-28:unknown",
    "2026-10-28:basic:extra",
    "__proto__",
    "",
  ]) {
    assert.equal(getProblem(id), null);
  }
});
