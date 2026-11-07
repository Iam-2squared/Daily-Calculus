import { test } from "node:test";
import assert from "node:assert/strict";
import katex from "katex";
import { basicTemplates } from "../server/problem-bank/basic.js";
import { randomFromSeed, type Random } from "../server/problem-bank/core.js";

// Independently calculated examples, using the lower bound of every parameter.
// Values are literal references rather than results recomputed by bank helpers.
const referenceAnswers: Record<string, string> = {
  "basic-d-power": "4",
  "basic-d-polynomial": "4x+1",
  "basic-d-product": "5",
  "basic-d-reciprocal": "-\\frac{1}{2}",
  "basic-d-root": "\\frac{1}{2}",
  "basic-d-reciprocal-root": "-\\frac{1}{8}",
  "basic-d-exponential": "2",
  "basic-d-logarithm": "1",
  "basic-d-sine": "2\\cos x",
  "basic-d-cosine": "-2\\sin x",
  "basic-d-chain": "12",
  "basic-d-tangent-slope": "4",
  "basic-d-tangent-equation": "y=4x-1",
  "basic-d-normal": "-\\frac{1}{4}",
  "basic-d-velocity": "5",
  "basic-d-acceleration": "14",
  "basic-d-increasing": "x>1",
  "basic-d-definition": "4",
  "basic-i-constant": "2x+C",
  "basic-i-power": "\\frac{2}{3}x^{3}+C",
  "basic-i-polynomial": "\\frac{2}{3}x^3+\\frac{1}{2}x^2+x+C",
  "basic-i-reciprocal": "2\\log|x|+C",
  "basic-i-exponential": "2e^x+C",
  "basic-i-sine": "-2\\cos x+C",
  "basic-i-cosine": "2\\sin x+C",
  "basic-i-inverse-square": "-\\frac{2}x+C",
  "basic-i-root": "\\frac{4}{3}x^{3/2}+C",
  "basic-i-reciprocal-root": "4\\sqrt{x}+C",
  "basic-i-definite-power": "\\frac{2}{3}",
  "basic-i-reversed-bounds": "-2",
  "basic-i-odd-symmetry": "0",
  "basic-i-even-symmetry": "\\frac{4}{3}",
  "basic-i-area": "2",
  "basic-i-crossing-area": "2",
  "basic-i-distance": "2",
  "basic-i-average": "\\frac{5}{3}",
};

const minimum: Random = (min) => min;

test("all 36 basic families agree with independently calculated reference answers", () => {
  assert.equal(basicTemplates.length, 36);
  assert.equal(Object.keys(referenceAnswers).length, 36);
  for (const template of basicTemplates) {
    assert.ok(Object.hasOwn(referenceAnswers, template.id), template.id);
    const problem = template.build(minimum);
    assert.equal(
      problem.choices[0],
      referenceAnswers[template.id],
      template.id,
    );
  }
});

test("basic coverage includes both subjects and genuine applications", () => {
  assert.equal(new Set(basicTemplates.map((template) => template.id)).size, 36);
  for (const subject of ["differentiation", "integration"] as const) {
    const matching = basicTemplates.filter(
      (template) => template.subject === subject,
    );
    assert.equal(matching.length, 18);
    assert.ok(matching.filter((template) => template.application).length >= 4);
    assert.ok(matching.some((template) => !template.application));
  }
  const expectedApplications = [
    "basic-d-tangent-slope",
    "basic-d-tangent-equation",
    "basic-d-normal",
    "basic-d-velocity",
    "basic-d-acceleration",
    "basic-i-area",
    "basic-i-crossing-area",
    "basic-i-distance",
    "basic-i-average",
  ];
  assert.deepEqual(
    basicTemplates
      .filter((template) => template.application)
      .map((template) => template.id),
    expectedApplications,
  );
});

// Numeric-only choices can be compared exactly as reduced rational values.
function rationalValue(choice: string): number | null {
  if (/^-?\d+$/.test(choice)) return Number(choice);
  const match = choice.match(/^(-?)\\frac\{(\d+)\}\{(\d+)\}$/);
  return match
    ? ((match[1] ? -1 : 1) * Number(match[2])) / Number(match[3])
    : null;
}

test("parameter boundaries and varied seeds keep choices distinct and mathematics renderable", () => {
  const formulas = new Set<string>();
  const sources: Random[] = [
    minimum,
    (_, maximum) => maximum,
    (min, max) => Math.floor((min + max) / 2),
  ];
  for (let seed = 0; seed < 80; seed++)
    sources.push(randomFromSeed(seed.toString(16).padStart(16, "0")));
  for (const template of basicTemplates) {
    for (const random of sources) {
      const p = template.build(random);
      assert.equal(p.choices.length, 4, template.id);
      assert.equal(new Set(p.choices).size, 4, template.id);
      const numeric = p.choices.map(rationalValue);
      if (numeric.every((value) => value !== null)) {
        assert.equal(
          new Set(numeric).size,
          4,
          `${template.id}: equivalent numerical choices`,
        );
      }
      assert.ok(
        p.title &&
          p.topic &&
          p.prompt &&
          p.hint &&
          p.explanation.length &&
          p.explanationFormulas.length,
        template.id,
      );
      for (const formula of [
        p.formula,
        ...p.choices,
        ...p.explanationFormulas,
      ]) {
        assert.doesNotMatch(
          formula,
          /\+\s*-|--|NaN|Infinity/,
          `${template.id}: ${formula}`,
        );
        formulas.add(formula);
      }
    }
  }
  for (const formula of formulas) {
    assert.doesNotThrow(
      () =>
        katex.renderToString(formula, { throwOnError: true, strict: "error" }),
      formula,
    );
  }
});
