import assert from "node:assert/strict";
import { test } from "node:test";
import katex from "katex";
import {
  BANK_TEMPLATES,
  generateBankProblem,
} from "../server/problem-bank/index.js";
import { randomFromSeed } from "../server/problem-bank/core.js";
import type { Level, ProblemSubject } from "../shared/types.js";
import { choiceValue } from "./helpers/choice-value.js";

const levels: Level[] = ["basic", "applied", "advanced"];
const subjects: ProblemSubject[] = ["differentiation", "integration"];
const seedFor = (n: number) => n.toString(16).padStart(16, "0");

test("the expanded bank contains 108 distinct families and balanced subjects at every difficulty", () => {
  for (const level of levels) {
    const templates = BANK_TEMPLATES[level];
    assert.equal(templates.length, 36, level);
    assert.equal(
      new Set(templates.map((template) => template.id)).size,
      36,
      level,
    );
    assert.equal(
      new Set(
        templates.map(
          (template) => template.build(randomFromSeed(seedFor(0))).title,
        ),
      ).size,
      36,
      `${level}: unique mathematical tasks`,
    );
    for (const subject of subjects) {
      assert.equal(
        templates.filter((template) => template.subject === subject).length,
        18,
      );
      for (const application of [false, true]) {
        assert.ok(
          templates.some(
            (template) =>
              template.subject === subject &&
              template.application === application,
          ),
          `${level}/${subject}/${application}: daily pool`,
        );
      }
    }
    assert.ok(templates.filter((template) => template.application).length >= 4);
  }
});

test("thousands of expanded-bank variants have four distinct choices and valid mathematical typesetting", () => {
  const formulas = new Set<string>();
  let numericChecks = 0;
  let checked = 0;
  const unsupported = new Set<string>();
  for (const level of levels) {
    for (const template of BANK_TEMPLATES[level]) {
      for (let seed = 0; seed < 96; seed++) {
        const p = template.build(randomFromSeed(seedFor(seed)));
        const label = `${level}/${template.id}/${seed}`;
        assert.equal(p.choices.length, 4, label);
        assert.equal(
          new Set(p.choices).size,
          4,
          `${label}: repeated choice text`,
        );
        assert.ok(
          p.title &&
            p.topic &&
            p.prompt &&
            p.hint &&
            p.explanation.length &&
            p.explanationFormulas.length,
          label,
        );
        assert.ok(p.estimatedMinutes > 0 && p.estimatedMinutes <= 30, label);
        formulas.add(p.formula);
        p.choices.forEach((formula) => formulas.add(formula));
        p.explanationFormulas.forEach((formula) => formulas.add(formula));
        checked++;
        let values: number[][];
        try {
          values = p.choices.map((choice) =>
            [0.31, 1.2, 2.1].map((x) => choiceValue(choice, x)),
          );
        } catch {
          unsupported.add(`${level}/${template.id}`);
          continue;
        }
        numericChecks++;
        for (let left = 0; left < 4; left++)
          for (let right = left + 1; right < 4; right++) {
            const equivalent = values[left].every((value, index) => {
              const other = values[right][index];
              const tolerance = Math.max(
                1e-10,
                4 * Number.EPSILON * Math.max(Math.abs(value), Math.abs(other)),
              );
              return Math.abs(value - other) <= tolerance;
            });
            assert.equal(
              equivalent,
              false,
              `${label}: equivalent choices ${p.choices[left]} / ${p.choices[right]}`,
            );
          }
      }
    }
  }
  assert.ok(
    numericChecks >= checked * 0.8,
    `Numerical equivalence coverage ${numericChecks}/${checked}; unsupported: ${[...unsupported].join(", ")}`,
  );
  for (const formula of formulas) {
    assert.doesNotThrow(
      () =>
        katex.renderToString(formula, { throwOnError: true, strict: "error" }),
      formula,
    );
  }
});

test("expanded generation is deterministic, covers every family and honors daily filters", () => {
  for (const level of levels) {
    const titles = new Set<string>();
    const variations = new Set<string>();
    const positions = new Set<number>();
    for (let n = 0; n < 1500; n++) {
      const p = generateBankProblem(level, seedFor(n), "2026-11-07", "bank-id");
      titles.add(p.title);
      variations.add(`${p.formula}|${p.prompt}`);
      positions.add(p.correctIndex);
      assert.equal(p.id, "bank-id");
      assert.equal(p.level, level);
      assert.ok(subjects.includes(p.subject!));
      assert.deepEqual(generateBankProblem(level, seedFor(n), p.date, p.id), p);
    }
    assert.equal(titles.size, 36, `${level}: every family reachable`);
    assert.ok(
      variations.size > 500,
      `${level}: parameter variety ${variations.size}`,
    );
    assert.equal(positions.size, 4);
    for (const subject of subjects)
      for (const application of [false, true]) {
        const allowedTitles = new Set(
          BANK_TEMPLATES[level]
            .filter(
              (template) =>
                template.subject === subject &&
                template.application === application,
            )
            .map(
              (template) => template.build(randomFromSeed(seedFor(0))).title,
            ),
        );
        for (let n = 0; n < 50; n++) {
          const p = generateBankProblem(
            level,
            seedFor(n),
            "2026-11-07",
            "filtered-id",
            { subject, application },
          );
          assert.equal(p.subject, subject);
          assert.ok(
            allowedTitles.has(p.title),
            `${level}/${subject}/${application}`,
          );
        }
      }
  }
});
