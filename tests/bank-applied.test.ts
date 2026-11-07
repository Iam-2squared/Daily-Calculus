import { test } from "node:test";
import assert from "node:assert/strict";
import katex from "katex";
import { appliedTemplates } from "../server/problem-bank/applied.js";
import { randomFromSeed } from "../server/problem-bank/core.js";

const minimum = (min: number, _max: number) => min;
const maximum = (_min: number, max: number) => max;
function build(id: string) {
  const template = appliedTemplates.find((candidate) => candidate.id === id);
  assert.ok(template, `Missing reference family: ${id}`);
  return template.build(minimum);
}
function derivative(f: (x: number) => number, x: number): number {
  const h = 1e-5;
  return (f(x + h) - f(x - h)) / (2 * h);
}
function secondDerivative(f: (x: number) => number, x: number): number {
  const h = 1e-3;
  return (f(x + h) - 2 * f(x) + f(x - h)) / (h * h);
}
function integrate(
  f: (x: number) => number,
  lower: number,
  upper: number,
): number {
  const steps = 20000,
    h = (upper - lower) / steps;
  let sum = f(lower) + f(upper);
  for (let i = 1; i < steps; i++) sum += (i % 2 ? 4 : 2) * f(lower + i * h);
  return (sum * h) / 3;
}
function maximumValue(
  f: (x: number) => number,
  lower: number,
  upper: number,
): number {
  for (let iteration = 0; iteration < 120; iteration++) {
    const a = lower + (upper - lower) / 3,
      b = upper - (upper - lower) / 3;
    if (f(a) < f(b)) lower = a;
    else upper = b;
  }
  return f((lower + upper) / 2);
}
function numericConstant(value: string): number {
  const multiplier = value.endsWith("\\pi") ? Math.PI : 1;
  const coefficient = value.replace(/\\pi$/, "");
  if (coefficient === "") return multiplier;
  if (coefficient === "-") return -multiplier;
  const fraction = coefficient.match(/^(-?)\\frac\{(\d+)\}\{(\d+)\}$/);
  if (fraction)
    return (
      (((fraction[1] ? -1 : 1) * Number(fraction[2])) / Number(fraction[3])) *
      multiplier
    );
  const parsed = Number(coefficient);
  assert.ok(
    Number.isFinite(parsed),
    `Expected numeric answer, received ${value}`,
  );
  return parsed * multiplier;
}
function near(
  actual: number,
  expected: number,
  label: string,
  tolerance = 3e-6,
) {
  assert.ok(
    Math.abs(actual - expected) < tolerance * Math.max(1, Math.abs(expected)),
    `${label}: ${actual} != reference ${expected}`,
  );
}

// Each fixture is calculated from the stated function/physical model, independently
// of the closed-form derivative or optimum used to construct the answer choices.
const differentialReferences: Record<string, () => number> = {
  "applied-d-chain-power": () => derivative((x) => (2 * x + 2) ** 3, 0),
  "applied-d-polynomial-exponential": () =>
    derivative((x) => (x * x + 2 * x + 2) * Math.exp(2 * x), 0),
  "applied-d-rational-quotient": () =>
    derivative((x) => (2 * x + 5) / (x + 2), 0),
  "applied-d-logarithmic-chain": () =>
    derivative((x) => Math.log(1 + 2 * x * x), 1),
  "applied-d-tangent-chain": () =>
    derivative((x) => Math.tan(2 * x + Math.PI / 4), 0),
  "applied-d-second-logarithm": () =>
    secondDerivative((x) => Math.log(x + 2), 0),
  "applied-d-implicit-ellipse": () =>
    derivative((x) => Math.sqrt((12 - x * x) / 2), 2),
  "applied-d-parametric-slope": () =>
    derivative((t) => t ** 3 + 2 * t, 1) / derivative((t) => t * t + 2 * t, 1),
  "applied-d-moving-integral-bounds": () =>
    derivative((x) => integrate((t) => t * t, x, 2 * x), 1),
  "applied-d-tangent-intercept": () => 6 - 2 * derivative((x) => x * x + 2, 2),
  "applied-d-normal-gradient": () => -1 / derivative((x) => 2 / x, 2),
  "applied-d-rectangle-optimization": () =>
    maximumValue((x) => x * (6 - x), 0, 6),
  "applied-d-open-box-volume": () =>
    maximumValue((x) => x * (12 - 2 * x) ** 2, 0, 6),
  "applied-d-expanding-sphere": () =>
    2 * derivative((r) => (4 / 3) * Math.PI * r ** 3, 2),
  "applied-d-sliding-ladder": () =>
    derivative((t) => Math.sqrt(100 - (6 + 2 * t) ** 2), 0),
  "applied-d-motion-acceleration": () =>
    secondDerivative((t) => 2 * t ** 3 - 2 * t ** 2, 2),
  "applied-d-average-cost": () =>
    -maximumValue((q) => -(2 * q * q + q + 18) / q, 0.1, 20),
  "applied-d-newton-step": () =>
    2 - (2 ** 2 - 5) / derivative((x) => x * x - 5, 2),
};

test("all eighteen applied differentiation families match independent numerical models", () => {
  const families = appliedTemplates.filter(
    (template) => template.subject === "differentiation",
  );
  assert.equal(families.length, 18);
  assert.equal(Object.keys(differentialReferences).length, families.length);
  for (const family of families) {
    assert.ok(
      differentialReferences[family.id],
      `${family.id} has no independent reference`,
    );
    near(
      numericConstant(build(family.id).choices[0]),
      differentialReferences[family.id](),
      family.id,
    );
  }
});

// Fixed-parameter symbolic answers are paired with independently integrated models.
// This verifies the printed first option as well as the underlying physical integral.
const integralAnswers: Record<string, string> = {
  "applied-i-substitution-log": "\\log\\!\\left(\\frac{3}{2}\\right)",
  "applied-i-substitution-exponential": "\\left(e^{1}-1\\right)",
  "applied-i-parts-logarithm": "\\left(2\\log 2-1\\right)",
  "applied-i-parts-trigonometric": "2",
  "applied-i-parts-quadratic-exponential": "2\\left(e-2\\right)",
  "applied-i-partial-fractions": "\\log\\!\\left(\\frac{4}{3}\\right)",
  "applied-i-trigonometric-square": "\\frac{1}{2}\\pi",
  "applied-i-arctangent-substitution": "\\frac{1}{8}\\pi",
  "applied-i-root-substitution": "\\frac{16}{3}",
  "applied-i-absolute-value": "4",
  "applied-i-area-line-parabola": "\\frac{4}{3}",
  "applied-i-disk-volume": "\\pi",
  "applied-i-washer-volume": "\\frac{8}{15}\\pi",
  "applied-i-average-temperature": "\\frac{34}{3}",
  "applied-i-distance-reversal": "2",
  "applied-i-spring-work": "4",
  "applied-i-inflow-volume": "6",
  "applied-i-variable-wire-density": "2\\log\\!\\left(3\\right)",
};
const appliedIntegralReferences = [
  {
    id: "applied-i-substitution-log",
    lo: 0,
    hi: 1,
    f: (x: number) => (2 * x) / (x * x + 2),
    value: Math.log(3 / 2),
  },
  {
    id: "applied-i-substitution-exponential",
    lo: 0,
    hi: 1,
    f: (x: number) => 2 * x * Math.exp(x * x),
    value: Math.E - 1,
  },
  {
    id: "applied-i-parts-logarithm",
    lo: 1,
    hi: 2,
    f: (x: number) => Math.log(x),
    value: 2 * Math.log(2) - 1,
  },
  {
    id: "applied-i-parts-trigonometric",
    lo: 0,
    hi: Math.PI / 2,
    f: (x: number) => 2 * x * Math.sin(x),
    value: 2,
  },
  {
    id: "applied-i-parts-quadratic-exponential",
    lo: 0,
    hi: 1,
    f: (x: number) => 2 * x * x * Math.exp(x),
    value: 2 * (Math.E - 2),
  },
  {
    id: "applied-i-partial-fractions",
    lo: 0,
    hi: 1,
    f: (x: number) => 1 / ((x + 1) * (x + 2)),
    value: Math.log(4 / 3),
  },
  {
    id: "applied-i-trigonometric-square",
    lo: 0,
    hi: Math.PI / 2,
    f: (x: number) => 2 * Math.sin(x) ** 2,
    value: Math.PI / 2,
  },
  {
    id: "applied-i-arctangent-substitution",
    lo: 0,
    hi: 2,
    f: (x: number) => 1 / (4 + x * x),
    value: Math.PI / 8,
  },
  {
    id: "applied-i-root-substitution",
    lo: 0,
    hi: 4,
    f: (x: number) => Math.sqrt(4 - x),
    value: 16 / 3,
  },
  {
    id: "applied-i-absolute-value",
    lo: 0,
    hi: 4,
    f: (x: number) => Math.abs(x - 2),
    value: 4,
  },
  {
    id: "applied-i-area-line-parabola",
    lo: 0,
    hi: 2,
    f: (x: number) => 2 * x - x * x,
    value: 4 / 3,
  },
  {
    id: "applied-i-disk-volume",
    lo: 0,
    hi: 1,
    f: (x: number) => 2 * Math.PI * x,
    value: Math.PI,
  },
  {
    id: "applied-i-washer-volume",
    lo: 0,
    hi: 1,
    f: (x: number) => 4 * Math.PI * (x * x - x ** 4),
    value: (8 * Math.PI) / 15,
  },
  {
    id: "applied-i-average-temperature",
    lo: 0,
    hi: 2,
    f: (x: number) => (10 + x * x) / 2,
    value: 34 / 3,
  },
  {
    id: "applied-i-distance-reversal",
    lo: 0,
    hi: 2,
    f: (x: number) => Math.abs(2 * (x - 1)),
    value: 2,
  },
  {
    id: "applied-i-spring-work",
    lo: 0,
    hi: 2,
    f: (x: number) => 2 * x,
    value: 4,
  },
  {
    id: "applied-i-inflow-volume",
    lo: 0,
    hi: 2,
    f: (x: number) => 2 + x,
    value: 6,
  },
  {
    id: "applied-i-variable-wire-density",
    lo: 0,
    hi: 2,
    f: (x: number) => 2 / (x + 1),
    value: 2 * Math.log(3),
  },
];

test("all eighteen applied integration families match independent numerical models", () => {
  const families = appliedTemplates.filter(
    (template) => template.subject === "integration",
  );
  assert.equal(families.length, 18);
  assert.equal(appliedIntegralReferences.length, families.length);
  for (const family of families) {
    const reference = appliedIntegralReferences.find(
      (candidate) => candidate.id === family.id,
    );
    assert.ok(reference, `${family.id} has no independent reference`);
    assert.equal(
      build(family.id).choices[0],
      integralAnswers[family.id],
      family.id,
    );
    near(
      integrate(reference.f, reference.lo, reference.hi),
      reference.value,
      family.id,
    );
  }
});

test("applied bank has balanced subjects, genuine applications, and calculation families", () => {
  assert.equal(appliedTemplates.length, 36);
  assert.equal(
    new Set(appliedTemplates.map((template) => template.id)).size,
    36,
  );
  for (const subject of ["differentiation", "integration"] as const) {
    const families = appliedTemplates.filter(
      (template) => template.subject === subject,
    );
    assert.equal(families.length, 18);
    assert.ok(
      families.filter((template) => template.application).length >= 6,
      `${subject} needs application problems`,
    );
    assert.ok(
      families.some((template) => !template.application),
      `${subject} needs nonapplication problems`,
    );
  }
});

test("randomized applied content has four distinct choices and valid display mathematics", () => {
  for (const template of appliedTemplates) {
    const samples = [template.build(minimum), template.build(maximum)];
    for (let seed = 0; seed < 48; seed++)
      samples.push(
        template.build(randomFromSeed(seed.toString(16).padStart(16, "0"))),
      );
    for (const problem of samples) {
      assert.equal(problem.choices.length, 4, template.id);
      assert.equal(
        new Set(problem.choices).size,
        4,
        `${template.id}: ${problem.choices.join(" / ")}`,
      );
      for (const field of [
        problem.title,
        problem.topic,
        problem.prompt,
        problem.hint,
      ])
        assert.ok(field.length > 0, template.id);
      assert.ok(problem.explanation.length > 0, template.id);
      assert.ok(
        problem.estimatedMinutes >= 3 && problem.estimatedMinutes <= 15,
        template.id,
      );
      for (const formula of [
        problem.formula,
        ...problem.choices,
        ...problem.explanationFormulas,
      ]) {
        assert.doesNotMatch(formula, /NaN|Infinity|undefined/, template.id);
        assert.doesNotThrow(
          () =>
            katex.renderToString(formula, {
              throwOnError: true,
              strict: "error",
            }),
          `${template.id}: ${formula}`,
        );
      }
    }
  }
});
