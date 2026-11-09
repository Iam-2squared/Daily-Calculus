import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BANK_TEMPLATES,
  BANK_TEMPLATES_V3,
  generateBankProblemV3,
} from "../server/problem-bank/index.js";
import {
  randomFromSeed,
  type BankContent,
  type BankTemplate,
  type Random,
} from "../server/problem-bank/core.js";
import type { Level } from "../shared/types.js";
import { pickDistractors } from "../server/problem-bank/choice-options.js";
import { choiceValue } from "./helpers/choice-value.js";

const levels: Level[] = ["basic", "applied", "advanced"];
const seedFor = (value: number) => value.toString(16).padStart(16, "0");
const functionSamples = [0.17, 0.29, 0.43, 0.61, 0.83, 1.17, 1.43, 1.79];

function close(left: number, right: number): boolean {
  return (
    Math.abs(left - right) <=
    Math.max(
      1e-12,
      4 * Number.EPSILON * Math.max(Math.abs(left), Math.abs(right)),
    )
  );
}

function sameValues(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => close(value, right[index]))
  );
}

function intervalValue(latex: string, x: number): number {
  const expression = latex.replace(/\s/g, "");
  if (expression === "\\varnothing") return 0;
  if (expression === "x\\in\\mathbb{R}") return 1;
  const match = expression.match(/^x(>|<|\\ge|\\le)(-?\d+)$/);
  assert.ok(match, `Unsupported interval option: ${latex}`);
  const boundary = Number(match[2]);
  switch (match[1]) {
    case ">":
      return Number(x > boundary);
    case "<":
      return Number(x < boundary);
    case "\\ge":
      return Number(x >= boundary);
    default:
      return Number(x <= boundary);
  }
}

// Values come from the independent test-only LaTeX reader, rather than from
// any answer coefficients or distractor-selection helpers in production.
function optionValues(problem: BankContent): {
  values: number[][];
  intervals: boolean;
} {
  const intervals = problem.choices[0].startsWith("x>");
  if (intervals) {
    const probes = Array.from({ length: 1025 }, (_, index) => index / 2 - 256);
    return {
      intervals: true,
      values: problem.choices.map((choice) =>
        probes.map((x) => intervalValue(choice, x)),
      ),
    };
  }
  const rows: number[][] = [];
  for (const x of functionSamples) {
    try {
      rows.push(problem.choices.map((choice) => choiceValue(choice, x)));
    } catch {
      // A common point can fall outside the domain of an inverse trig/root
      // option. Other common points must still evaluate every option.
    }
  }
  assert.ok(
    rows.length >= 4,
    `Insufficient common evaluation points: ${problem.choices.join(" / ")}`,
  );
  const indefinite = problem.choices[0].includes("C");
  return {
    intervals: false,
    values: problem.choices.map((_, choice) => {
      const values = rows.map((row) => row[choice]);
      // Antiderivatives that differ only by an additive constant are the same
      // answer. Subtracting an anchor also ignores the arbitrary +C.
      return indefinite ? values.map((value) => value - values[0]) : values;
    }),
  };
}

function leadingNegative(choice: string): boolean {
  const expression = choice.replace(/\s/g, "").replace(/^y=/, "");
  return /^(?:-|\\(?:d?frac)\{-)/.test(expression);
}

function notationFeatures(choice: string): string {
  const commands = new Set(
    [...choice.matchAll(/\\([A-Za-z]+)/g)].map((match) => match[1]),
  );
  const features: string[] = [];
  if (commands.has("frac") || commands.has("dfrac")) features.push("fraction");
  if (commands.has("pi")) features.push("pi");
  if (commands.has("log") || commands.has("ln")) features.push("logarithm");
  if (commands.has("exp") || /e/.test(choice.replace(/\\[A-Za-z]+/g, "")))
    features.push("exponential");
  if (commands.has("sqrt")) features.push("root");
  if (
    [...commands].some((command) =>
      /^(?:(?:arc)?(?:sin|cos|tan)|sec|sinh|cosh|tanh)$/.test(command),
    )
  )
    features.push("trigonometric");
  return features.join(",");
}

function auditChoices(problem: BankContent, label: string): number[][] {
  assert.equal(problem.choices.length, 4, label);
  assert.equal(new Set(problem.choices).size, 4, `${label}: repeated text`);
  const notation = notationFeatures(problem.choices[0]);
  assert.ok(
    problem.choices
      .slice(1)
      .some((choice) => notationFeatures(choice) === notation),
    `${label}: the correct answer has the only notation pattern (${notation || "plain"})`,
  );
  const { values, intervals } = optionValues(problem);
  for (let left = 0; left < 4; left++) {
    for (let right = left + 1; right < 4; right++) {
      const pair = `${problem.choices[left]} / ${problem.choices[right]}`;
      assert.equal(
        sameValues(values[left], values[right]),
        false,
        `${label}: mathematically equivalent options: ${pair}`,
      );
      if (!intervals) {
        assert.equal(
          sameValues(
            values[left],
            values[right].map((value) => -value),
          ),
          false,
          `${label}: opposite answers expose a sign shortcut: ${pair}`,
        );
      }
    }
  }
  const zero = values[0].every((value) => close(value, 0));
  if (!zero && !intervals) {
    const sign = leadingNegative(problem.choices[0]);
    assert.ok(
      problem.choices
        .slice(1)
        .some((choice) => leadingNegative(choice) === sign),
      `${label}: the correct answer has the only leading sign`,
    );
  }
  return values;
}

function contentWithoutChoices({ choices: _choices, ...content }: BankContent) {
  return content;
}

function tracedParameters(template: BankTemplate, source: Random) {
  const draws: { minimum: number; maximum: number; value: number }[] = [];
  const original = template.build((minimum, maximum) => {
    const value = source(minimum, maximum);
    draws.push({ minimum, maximum, value });
    return value;
  });
  return {
    original,
    random(choiceSeed: number): Random {
      let cursor = 0;
      const choices = randomFromSeed(seedFor(choiceSeed));
      return (minimum, maximum) => {
        if (cursor >= draws.length) return choices(minimum, maximum);
        const draw = draws[cursor++];
        assert.deepEqual(
          [minimum, maximum],
          [draw.minimum, draw.maximum],
          `${template.id}: parameter stream changed before option selection`,
        );
        return draw.value;
      };
    },
  };
}

test("the sampler rejects additive-constant equivalents and opposite answers independently of their spelling", () => {
  const examples = [
    {
      correct: "x+C",
      pool: [
        "x+1+C",
        "x-4+C",
        "-x+3+C",
        "-x+C",
        "2x+C",
        "2x+9+C",
        "-2x+1+C",
        "3x+C",
        "4x+C",
        "5x+C",
        "6x+C",
        "7x+C",
      ],
    },
    {
      correct: "2x^{3}+C",
      pool: [
        "-2x^{3}+C",
        "-2x^{3}+7+C",
        "2x^{3}+5+C",
        "6x^{3}+C",
        "2x^{2}+C",
        "x^{3}+C",
        "3x^{3}+C",
        "4x^{3}+C",
        "5x^{3}+C",
        "7x^{3}+C",
      ],
    },
    {
      correct: "\\frac{169}{4}\\pi",
      pool: [
        "-\\frac{169}{4}\\pi",
        "\\frac{-169}{4}\\pi",
        "169\\pi",
        "\\frac{169}{2}\\pi",
        "\\frac{169}{3}\\pi",
        "\\frac{169}{5}\\pi",
        "\\frac{169}{6}\\pi",
        "\\frac{169}{8}\\pi",
        "-169\\pi",
      ],
    },
    {
      correct: "2",
      pool: [
        "\\pi",
        "2\\pi",
        "3\\pi",
        "4\\pi",
        "5\\pi",
        "6\\pi",
        "1",
        "3",
        "4",
        "5",
        "6",
        "7",
      ],
    },
  ];
  for (const example of examples)
    for (let seed = 0; seed < 128; seed++) {
      const choices = pickDistractors(
        example.correct,
        example.pool,
        randomFromSeed(seedFor(seed)),
      );
      assert.equal(choices[0], example.correct);
      auditChoices(
        {
          title: "Choice sampler regression",
          topic: "Choice equivalence",
          prompt: "Check the independently authored option pool.",
          formula: "f(x)",
          choices,
          hint: "",
          explanation: [],
          explanationFormulas: [],
          estimatedMinutes: 1,
        },
        `${example.correct}/sampler/${seed}`,
      );
    }
});

for (const level of levels)
  test(`v3 ${level} preserves every family's true mathematical content and rejects sign shortcuts`, () => {
    const oldTemplates = BANK_TEMPLATES[level];
    const templates = BANK_TEMPLATES_V3[level];
    assert.deepEqual(
      templates.map(({ id, subject, application }) => ({
        id,
        subject,
        application,
      })),
      oldTemplates.map(({ id, subject, application }) => ({
        id,
        subject,
        application,
      })),
      level,
    );
    assert.equal(templates.length, 36);
    for (let index = 0; index < templates.length; index++) {
      const old = oldTemplates[index];
      const current = templates[index];
      const sources: (() => Random)[] = [
        () => (minimum) => minimum,
        () => (_, maximum) => maximum,
        () => (minimum, maximum) => Math.floor((minimum + maximum) / 2),
        ...Array.from(
          { length: 64 },
          (_, seed) => () => randomFromSeed(seedFor(seed)),
        ),
      ];
      for (let seed = 0; seed < sources.length; seed++) {
        const before = old.build(sources[seed]());
        const after = current.build(sources[seed]());
        const label = `${level}/${current.id}/${seed}`;
        assert.equal(
          after.choices[0],
          before.choices[0],
          `${label}: true answer`,
        );
        assert.deepEqual(
          contentWithoutChoices(after),
          contentWithoutChoices(before),
          `${label}: prompt, formula, hint and explanation`,
        );
        auditChoices(after, label);
      }
    }
  });

for (const level of levels)
  test(`every v3 ${level} family offers at least six viable distractors for a fixed question`, () => {
    for (let index = 0; index < BANK_TEMPLATES_V3[level].length; index++) {
      const current = BANK_TEMPLATES_V3[level][index];
      const fixed = tracedParameters(
        BANK_TEMPLATES[level][index],
        randomFromSeed(seedFor(43)),
      );
      const observed: number[][] = [];
      for (let variant = 0; variant < 128; variant++) {
        const problem = current.build(fixed.random(variant));
        assert.equal(problem.choices[0], fixed.original.choices[0], current.id);
        assert.deepEqual(
          contentWithoutChoices(problem),
          contentWithoutChoices(fixed.original),
          current.id,
        );
        const values = auditChoices(problem, `${current.id}/fixed/${variant}`);
        for (const wrong of values.slice(1))
          if (!observed.some((previous) => sameValues(previous, wrong)))
            observed.push(wrong);
      }
      assert.ok(
        observed.length >= 6,
        `${current.id}: only ${observed.length} distinct viable distractors observed`,
      );
    }
  });

test("power-integral and quarter-circle regressions cannot be solved by spotting an opposite-sign option", () => {
  const examples: {
    level: Level;
    id: string;
    parameters: number[];
    answer: string;
  }[] = [
    {
      level: "basic",
      id: "basic-i-power",
      parameters: [6, 2],
      answer: "2x^{3}+C",
    },
    {
      level: "advanced",
      id: "advanced-i-semicircle-area",
      parameters: [13],
      answer: "\\frac{169}{4}\\pi",
    },
  ];
  for (const example of examples) {
    const template = BANK_TEMPLATES_V3[example.level].find(
      ({ id }) => id === example.id,
    );
    assert.ok(template, example.id);
    const ranks = new Set<number>();
    for (let variant = 0; variant < 128; variant++) {
      let cursor = 0;
      const random = randomFromSeed(seedFor(variant));
      const problem: BankContent = template.build((minimum, maximum) =>
        cursor < example.parameters.length
          ? example.parameters[cursor++]
          : random(minimum, maximum),
      );
      assert.equal(problem.choices[0], example.answer, example.id);
      const values = auditChoices(
        problem,
        `${example.id}/regression/${variant}`,
      );
      if (example.level === "advanced")
        ranks.add(
          values.slice(1).filter((wrong) => wrong[0] < values[0][0]).length,
        );
    }
    if (example.level === "advanced")
      assert.deepEqual(
        [...ranks].sort(),
        [0, 1, 2, 3],
        `${example.id}: magnitude-rank variety`,
      );
  }
});

test("v3 shuffles answers evenly and independently of the number of distractor RNG draws", () => {
  for (const level of levels) {
    const counts = [0, 0, 0, 0];
    for (let seed = 0; seed < 4096; seed++) {
      const problem = generateBankProblemV3(
        level,
        seedFor(seed),
        "2026-11-09",
        "quality",
      );
      assert.ok(
        Number.isInteger(problem.correctIndex) &&
          problem.correctIndex >= 0 &&
          problem.correctIndex < 4,
        `${level}/${seed}: invalid correct index`,
      );
      counts[problem.correctIndex]++;
    }
    for (let index = 0; index < counts.length; index++)
      assert.ok(
        counts[index] >= 4096 * 0.21 && counts[index] <= 4096 * 0.29,
        `${level}: biased correct-position counts ${counts.join(",")}`,
      );
  }
  const baseline = levels.flatMap((level) =>
    Array.from({ length: 64 }, (_, seed) => ({
      level,
      seed: seedFor(seed),
      result: generateBankProblemV3(
        level,
        seedFor(seed),
        "2026-11-09",
        "independent",
      ),
    })),
  );
  const originals = levels.flatMap((level) =>
    BANK_TEMPLATES_V3[level].map((template) => ({
      template,
      build: template.build,
    })),
  );
  try {
    for (const { template, build } of originals)
      template.build = (random) => {
        const content = build(random);
        for (let count = 0; count < 97; count++) random(0, 1000000);
        return content;
      };
    for (const { level, seed, result } of baseline) {
      const extraDraws = generateBankProblemV3(
        level,
        seed,
        "2026-11-09",
        "independent",
      );
      assert.deepEqual(
        extraDraws,
        result,
        `${level}/${seed}: option RNG leaks into shuffle`,
      );
    }
  } finally {
    for (const { template, build } of originals) template.build = build;
  }
});
