import { test } from "node:test";
import assert from "node:assert/strict";
import katex from "katex";
import { generatePracticeProblem } from "../server/practice-problems.js";
import { publicProblem } from "../server/problems.js";
import type { Level } from "../shared/types.js";

const levels: Level[] = ["basic", "applied", "advanced"];
const seedFor = (value: number) => value.toString(16).padStart(16, "0");
const generate = (level: Level, value: number) =>
  generatePracticeProblem(
    level,
    seedFor(value),
    "2026-10-29",
    `practice-${value}`,
  );

// These are independently calculated examples: each seed exercises a different family.
const referenceSeeds = [0, 1, 3, 4, 6, 11];
const referenceAnswers: Record<Level, string[]> = {
  basic: [
    "12+\\pi",
    "\\frac{5}{2}",
    "47",
    "11\\cos x-4\\sin x",
    "2x^{3}+C",
    "10374",
  ],
  applied: ["999", "-61", "432", "\\frac{20}{3}", "15", "\\frac{5e^{6}+1}{9}"],
  advanced: [
    "\\frac{5}{4}",
    "\\frac{7}{6}\\pi",
    "18",
    "48-16\\arctan 3",
    "-\\frac{1}{4}",
    "\\frac{8}{27}",
  ],
};

test("every practice family matches independent mathematical reference answers", () => {
  for (const level of levels) {
    const families = new Set<string>();
    referenceSeeds.forEach((seed, index) => {
      const p = generate(level, seed);
      families.add(p.title);
      assert.equal(
        p.choices[p.correctIndex],
        referenceAnswers[level][index],
        `${level} seed ${seed}`,
      );
    });
    assert.equal(families.size, 6);
  }
});

/** A small test-only expression parser; no eval and no production math implementation. */
function choiceValue(latex: string, x: number): number {
  function expandFractions(input: string): string {
    let result = "",
      index = 0;
    function group(): string {
      assert.equal(input[index++], "{");
      const start = index;
      let depth = 1;
      while (index < input.length && depth) {
        if (input[index] === "{") depth++;
        if (input[index] === "}") depth--;
        index++;
      }
      assert.equal(depth, 0);
      return expandFractions(input.slice(start, index - 1));
    }
    while (index < input.length) {
      if (input.startsWith("\\frac", index)) {
        index += 5;
        const numerator = group(),
          denominator = group();
        result += `((${numerator})/(${denominator}))`;
      } else result += input[index++];
    }
    return result;
  }
  const expression = expandFractions(latex)
    .replaceAll("\\arctan", "atan")
    .replaceAll("\\sin", "sin")
    .replaceAll("\\cos", "cos")
    .replaceAll("\\pi", "pi")
    .replaceAll("{", "(")
    .replaceAll("}", ")")
    .replaceAll("C", "0")
    .replace(/\s/g, "");
  const tokens =
    expression.match(/\d+(?:\.\d+)?|atan|sin|cos|pi|e|x|[+\-*/^()]/g) ?? [];
  assert.equal(tokens.join(""), expression, `Unsupported formula: ${latex}`);
  let at = 0;
  function sum(): number {
    let result = product();
    while (tokens[at] === "+" || tokens[at] === "-") {
      const operator = tokens[at++],
        next = product();
      result = operator === "+" ? result + next : result - next;
    }
    return result;
  }
  function product(): number {
    let result = unary();
    while (
      at < tokens.length &&
      tokens[at] !== ")" &&
      tokens[at] !== "+" &&
      tokens[at] !== "-"
    ) {
      const operator = tokens[at];
      if (operator === "*" || operator === "/") at++;
      const next = unary();
      result = operator === "/" ? result / next : result * next;
    }
    return result;
  }
  function unary(): number {
    if (tokens[at] === "-") {
      at++;
      return -unary();
    }
    if (tokens[at] === "+") {
      at++;
      return unary();
    }
    let result = atom();
    if (tokens[at] === "^") {
      at++;
      result **= unary();
    }
    return result;
  }
  function atom(): number {
    const token = tokens[at++];
    if (token === "(") {
      const result = sum();
      assert.equal(tokens[at++], ")");
      return result;
    }
    if (token === "x") return x;
    if (token === "e") return Math.E;
    if (token === "pi") return Math.PI;
    if (token === "sin") return Math.sin(unary());
    if (token === "cos") return Math.cos(unary());
    if (token === "atan") return Math.atan(unary());
    assert.match(token ?? "", /^\d+(\.\d+)?$/);
    return Number(token);
  }
  const value = sum();
  assert.equal(at, tokens.length);
  assert.ok(Number.isFinite(value));
  return value;
}

test("thousands of seeds produce mathematically distinct choices, valid LaTeX, and varied questions", () => {
  const formulas = new Set<string>();
  for (const level of levels) {
    const families = new Set<string>(),
      signatures = new Set<string>(),
      positions = new Set<number>();
    for (let seed = 0; seed < 1200; seed++) {
      const p = generate(level, seed);
      families.add(p.title);
      positions.add(p.correctIndex);
      signatures.add(`${p.formula}|${p.prompt}`);
      assert.equal(new Set(p.choices).size, 4, `${p.id}: duplicate text`);
      assert.ok(p.correctIndex >= 0 && p.correctIndex < 4);
      const values = p.choices.map((choice) =>
        [0.31, 1.2, 2.1].map((x) => choiceValue(choice, x)),
      );
      for (let left = 0; left < 4; left++)
        for (let right = left + 1; right < 4; right++) {
          const equivalent = values[left].every(
            (value, index) =>
              Math.abs(value - values[right][index]) <=
              1e-10 *
                Math.max(1, Math.abs(value), Math.abs(values[right][index])),
          );
          assert.equal(
            equivalent,
            false,
            `${level} seed ${seed}: equivalent choices ${p.choices[left]} / ${p.choices[right]}`,
          );
        }
      formulas.add(p.formula);
      p.choices.forEach((formula) => formulas.add(formula));
      p.explanationFormulas.forEach((formula) => formulas.add(formula));
    }
    assert.equal(families.size, 6);
    assert.equal(positions.size, 4);
    assert.ok(
      signatures.size > 400,
      `${level}: insufficient parameter variety (${signatures.size})`,
    );
  }
  for (const formula of formulas) {
    assert.doesNotThrow(
      () =>
        katex.renderToString(formula, { throwOnError: true, strict: "error" }),
      formula,
    );
  }
});

test("seeded generation is stable and uses the full seed; caller identity is preserved", () => {
  for (const level of levels) {
    const first = generatePracticeProblem(
      level,
      "0123456789abcdef",
      "2026-10-29",
      "signed-id",
    );
    assert.deepEqual(
      generatePracticeProblem(
        level,
        "0123456789abcdef",
        "2026-10-29",
        "signed-id",
      ),
      first,
    );
    assert.deepEqual(
      generatePracticeProblem(
        level,
        "0123456789ABCDEF",
        "2026-10-29",
        "signed-id",
      ),
      first,
    );
    assert.equal(first.date, "2026-10-29");
    assert.equal(first.id, "signed-id");
    const changedMetadata = generatePracticeProblem(
      level,
      "0123456789abcdef",
      "2026-10-30",
      "different-id",
    );
    assert.equal(changedMetadata.formula, first.formula);
    assert.deepEqual(changedMetadata.choices, first.choices);
    assert.equal(changedMetadata.correctIndex, first.correctIndex);
    assert.notEqual(
      generatePracticeProblem(
        level,
        "1123456789abcdef",
        "2026-10-29",
        "signed-id",
      ).formula,
      first.formula,
    );
    const publicVersion = publicProblem(first);
    assert.equal("correctIndex" in publicVersion, false);
    assert.equal("explanation" in publicVersion, false);
    assert.equal("explanationFormulas" in publicVersion, false);
  }
  for (const seed of [
    "",
    "abc",
    "0123456789abcdeg",
    "0123456789abcdef0",
    "-123456789abcdef",
  ]) {
    assert.throws(
      () => generatePracticeProblem("basic", seed, "2026-10-29", "id"),
      RangeError,
    );
  }
  assert.throws(
    () =>
      generatePracticeProblem(
        "unknown" as Level,
        "0123456789abcdef",
        "2026-10-29",
        "id",
      ),
    RangeError,
  );
});
