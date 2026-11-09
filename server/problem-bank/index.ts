import { createHash } from "node:crypto";
import type {
  ChallengeSubject,
  Level,
  PrivateProblem,
} from "../../shared/types.js";
import { basicTemplates } from "./basic.js";
import { appliedTemplates } from "./applied.js";
import { advancedTemplates } from "./advanced.js";
import { basicTemplates as basicTemplatesV3 } from "./basic-v3.js";
import { appliedTemplates as appliedTemplatesV3 } from "./applied-v3.js";
import { advancedTemplates as advancedTemplatesV3 } from "./advanced-v3.js";
import { randomFromSeed, type BankTemplate } from "./core.js";

// This registry is the immutable c2/d2 question bank. Existing signed questions
// depend on its order and generation rules; future revisions need a new version.
export const BANK_TEMPLATES: Readonly<Record<Level, readonly BankTemplate[]>> =
  {
    basic: basicTemplates,
    applied: appliedTemplates,
    advanced: advancedTemplates,
  };

// Choice revision 3 keeps v2 immutable for existing signed question IDs.
export const BANK_TEMPLATES_V3: Readonly<
  Record<Level, readonly BankTemplate[]>
> = {
  basic: basicTemplatesV3,
  applied: appliedTemplatesV3,
  advanced: advancedTemplatesV3,
};

export interface BankOptions {
  subject?: ChallengeSubject;
  application?: boolean;
}

export function generateBankProblem(
  level: Level,
  seed: string,
  date: string,
  id: string,
  options: BankOptions = {},
): PrivateProblem {
  if (/^(c3[pt]\.|d3:)/.test(id))
    return generateBankProblemV3(level, seed, date, id, options);
  if (!Object.hasOwn(BANK_TEMPLATES, level))
    throw new RangeError("Unknown problem level");
  const subject = options.subject ?? "all";
  if (!["all", "differentiation", "integration"].includes(subject))
    throw new RangeError("Unknown problem subject");
  const templates = BANK_TEMPLATES[level].filter(
    (template) =>
      (subject === "all" || template.subject === subject) &&
      (options.application === undefined ||
        template.application === options.application),
  );
  if (!templates.length) throw new RangeError("No matching problem templates");
  const random = randomFromSeed(seed);
  const template = templates[random(0, templates.length - 1)];
  const content = template.build(random);
  const choices = content.choices.map((text, index) => ({
    text,
    correct: index === 0,
  }));
  for (let index = choices.length - 1; index > 0; index--) {
    const other = random(0, index);
    [choices[index], choices[other]] = [choices[other], choices[index]];
  }
  return {
    ...content,
    choices: choices.map((choice) => choice.text),
    correctIndex: choices.findIndex((choice) => choice.correct),
    subject: template.subject,
    level,
    date,
    id,
  };
}

export function generateBankProblemV3(
  level: Level,
  seed: string,
  date: string,
  id: string,
  options: BankOptions = {},
): PrivateProblem {
  if (!Object.hasOwn(BANK_TEMPLATES_V3, level))
    throw new RangeError("Unknown problem level");
  const subject = options.subject ?? "all";
  if (!["all", "differentiation", "integration"].includes(subject))
    throw new RangeError("Unknown problem subject");
  const templates = BANK_TEMPLATES_V3[level].filter(
    (template) =>
      (subject === "all" || template.subject === subject) &&
      (options.application === undefined ||
        template.application === options.application),
  );
  if (!templates.length) throw new RangeError("No matching problem templates");
  const random = randomFromSeed(seed);
  const template = templates[random(0, templates.length - 1)];
  const content = template.build(random);
  // Sampling distractors may consume any number of random values. Position
  // shuffling uses an independent stream and cannot expose that draw count.
  const shuffleSeed = createHash("sha256")
    .update(`daily-calculus:v3-choice-shuffle:${seed}:${id}`)
    .digest("hex")
    .slice(0, 16);
  const shuffle = randomFromSeed(shuffleSeed);
  const choices = content.choices.map((text, index) => ({
    text,
    correct: index === 0,
  }));
  for (let index = choices.length - 1; index > 0; index--) {
    const other = shuffle(0, index);
    [choices[index], choices[other]] = [choices[other], choices[index]];
  }
  return {
    ...content,
    choices: choices.map((choice) => choice.text),
    correctIndex: choices.findIndex((choice) => choice.correct),
    subject: template.subject,
    level,
    date,
    id,
  };
}
