import assert from "node:assert/strict";
import { test } from "node:test";
import { advancedTemplates as previous } from "../server/problem-bank/advanced.js";
import { advancedTemplates as updated } from "../server/problem-bank/advanced-v3.js";
import { randomFromSeed } from "../server/problem-bank/core.js";
import { choiceValue } from "./helpers/choice-value.js";

const seeded = (seed: number) =>
  randomFromSeed(seed.toString(16).padStart(16, "0"));
const close = (a: number, b: number) =>
  Math.abs(a - b) <=
  Math.max(1e-10, 16 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b)));

test("advanced v3 changes only distractors while retaining all v2 question mathematics", () => {
  assert.deepEqual(
    updated.map((family) => family.id),
    previous.map((family) => family.id),
  );
  for (let family = 0; family < updated.length; family++) {
    for (let seed = 0; seed < 96; seed++) {
      const old = previous[family].build(seeded(seed));
      const next = updated[family].build(seeded(seed));
      const { choices: oldChoices, ...oldQuestion } = old;
      const { choices: nextChoices, ...nextQuestion } = next;
      assert.deepEqual(
        nextQuestion,
        oldQuestion,
        `${updated[family].id}/${seed}`,
      );
      assert.equal(nextChoices[0], oldChoices[0]);
      assert.equal(nextChoices.length, 4);
      assert.equal(new Set(nextChoices).size, 4);
      const values = nextChoices.map((choice) => choiceValue(choice, 1.23));
      assert.ok(values.every(Number.isFinite));
      assert.ok(
        values.every((value) => Math.sign(value) === Math.sign(values[0])),
        `${updated[family].id}: sign cue`,
      );
      assert.equal(
        new Set(nextChoices.map((choice) => choice.includes("\\frac"))).size,
        1,
      );
      for (let left = 0; left < values.length; left++) {
        for (let right = left + 1; right < values.length; right++) {
          assert.equal(
            close(values[left], values[right]),
            false,
            `${updated[family].id}/${seed}: equivalent ${nextChoices[left]} / ${nextChoices[right]}`,
          );
          assert.equal(
            close(values[left], -values[right]),
            false,
            `${updated[family].id}/${seed}: opposite pair`,
          );
        }
      }
    }
  }
});

test("advanced v3 samples varied error pools rather than three fixed distractors", () => {
  for (let family = 0; family < updated.length; family++) {
    const parameters: number[] = [];
    previous[family].build((minimum) => {
      parameters.push(minimum);
      return minimum;
    });
    const seen = new Set<string>();
    for (let seed = 0; seed < 72; seed++) {
      let draw = 0;
      const choices = seeded(seed);
      const problem = updated[family].build((minimum, maximum) => {
        if (draw < parameters.length) return parameters[draw++];
        return choices(minimum, maximum);
      });
      problem.choices.slice(1).forEach((choice) => seen.add(choice));
    }
    assert.ok(
      seen.size >= 6,
      `${updated[family].id}: only ${seen.size} distractors for fixed parameters`,
    );
  }
});
