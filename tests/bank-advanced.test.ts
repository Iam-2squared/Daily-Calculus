import assert from "node:assert/strict";
import { test } from "node:test";
import { advancedTemplates } from "../server/problem-bank/advanced.js";

// Hand-calculated answers with every integer parameter set to its lower bound.
// These fixtures exercise the mathematical task of every family independently
// of the answer-building formulas and the later answer-choice shuffling.
const referenceAnswers: Record<string, string> = {
  "advanced-d-exponential-nth": "8",
  "advanced-d-polynomial-nth": "60",
  "advanced-d-trigonometric-nth": "32",
  "advanced-d-product-second": "14e^{2}",
  "advanced-d-logarithm-second": "\\frac{2}{9}",
  "advanced-d-implicit-second": "-\\frac{2}{3}",
  "advanced-d-parametric-second": "-\\frac{1}{4}",
  "advanced-d-inverse-second": "-\\frac{3}{32}",
  "advanced-d-taylor-product": "\\frac{1}{3}",
  "advanced-d-variable-exponent": "6",
  "advanced-d-inverse-sine-third": "8",
  "advanced-d-arctangent-second": "-\\frac{16}{25}",
  "advanced-d-exponential-maximum": "4e^{-2}",
  "advanced-d-closed-cylinder": "2",
  "advanced-d-conical-rate": "4\\pi",
  "advanced-d-curvature-radius": "\\frac{1}{4}",
  "advanced-d-tangent-triangle": "\\frac{32}{3}",
  "advanced-d-composite-fourth": "48",
  "advanced-i-gamma-moment": "\\frac{1}{4}",
  "advanced-i-logarithm-moment": "-\\frac{1}{4}",
  "advanced-i-squared-logarithm": "\\frac{1}{4}",
  "advanced-i-sine-even-reduction": "\\frac{3}{16}\\pi",
  "advanced-i-quadratic-denominator": "\\frac{1}{4}\\pi",
  "advanced-i-quadratic-square": "\\frac{1}{8}",
  "advanced-i-semicircle-area": "\\pi",
  "advanced-i-tangent-square": "2-\\frac{1}{2}\\pi",
  "advanced-i-exponential-sine": "\\frac{e^{\\pi}+1}{2}",
  "advanced-i-logarithm-infinity": "\\frac{1}{4}",
  "advanced-i-partial-fraction-infinity": "\\frac{1}{2}\\log 2",
  "advanced-i-beta-polynomial": "\\frac{1}{30}",
  "advanced-i-washer-volume": "\\frac{64}{15}\\pi",
  "advanced-i-shell-volume": "8\\pi",
  "advanced-i-log-cosine-arc": "\\frac{1}{2}\\log(2+\\sqrt3)",
  "advanced-i-gaussian-normalization": "\\frac{2}{\\sqrt\\pi}",
  "advanced-i-sphere-surface": "16\\pi",
  "advanced-i-infinite-horn-volume": "2\\pi",
};

test("every advanced family matches an independently calculated answer", () => {
  assert.equal(advancedTemplates.length, 36);
  assert.deepEqual(
    new Set(advancedTemplates.map((template) => template.id)),
    new Set(Object.keys(referenceAnswers)),
  );
  for (const template of advancedTemplates) {
    const problem = template.build((minimum) => minimum);
    assert.equal(
      problem.choices[0],
      referenceAnswers[template.id],
      template.id,
    );
  }
});

test("advanced questions balance both subjects and include applications of both", () => {
  for (const subject of ["differentiation", "integration"] as const) {
    const templates = advancedTemplates.filter(
      (template) => template.subject === subject,
    );
    assert.equal(templates.length, 18);
    assert.ok(templates.filter((template) => template.application).length >= 6);
    assert.ok(templates.some((template) => !template.application));
  }
});

// Independent numerical integration checks the geometric/analytic meaning of
// several fixtures, rather than repeating the closed forms used by the bank.
function simpson(fn: (x: number) => number, lower: number, upper: number) {
  const intervals = 8192;
  const width = (upper - lower) / intervals;
  let sum = fn(lower) + fn(upper);
  for (let index = 1; index < intervals; index++)
    sum += (index % 2 ? 4 : 2) * fn(lower + index * width);
  return (width * sum) / 3;
}
function close(actual: number, expected: number, tolerance = 1e-8) {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} differs from ${expected}`,
  );
}

test("advanced integral reference values agree with independent numerical quadrature", () => {
  close(
    simpson((x) => x * x * Math.exp(-2 * x), 0, 40),
    1 / 4,
  );
  close(
    simpson((x) => Math.sin(x) ** 4, 0, Math.PI / 2),
    (3 * Math.PI) / 16,
  );
  close(
    simpson((x) => Math.tan(x) ** 2 * 2, 0, Math.PI / 4),
    2 - Math.PI / 2,
  );
  close(
    simpson((x) => Math.exp(x) * Math.sin(x), 0, Math.PI),
    (Math.exp(Math.PI) + 1) / 2,
  );
  close(
    simpson((x) => x * x * (1 - x) ** 2, 0, 1),
    1 / 30,
  );
  close(
    simpson((x) => Math.PI * (4 * x * x - x ** 4), 0, 2),
    (64 * Math.PI) / 15,
  );
  close(
    simpson((x) => 2 * Math.PI * x * (4 - x * x), 0, 2),
    8 * Math.PI,
  );
  close(
    simpson((x) => 1 / Math.cos(2 * x), 0, Math.PI / 6),
    Math.log(2 + Math.sqrt(3)) / 2,
  );
  close(
    simpson((x) => Math.exp(-4 * x * x), -8, 8),
    Math.sqrt(Math.PI) / 2,
  );
});
