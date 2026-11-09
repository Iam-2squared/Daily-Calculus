import { createHash } from "node:crypto";
import type { Level, PrivateProblem, Problem } from "../shared/types.js";
import { getProblem } from "./problems.js";
import { generatePracticeProblem } from "./practice-problems.js";
import {
  generateBankProblem,
  generateBankProblemV3,
} from "./problem-bank/index.js";

function normalizedInstruction(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .replaceAll("選んでください", "求めてください");
}

function normalizedFormula(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\\(?:left|right|displaystyle|quad|qquad)\b/g, "")
    .replace(/\\[!,;:\s]/g, "")
    .replace(/\\(?:dfrac|tfrac)\b/g, "\\frac")
    .replace(/\s+/gu, "");
}

/**
 * Persistent scoring identity v1. Keep normalization stable: changing it needs
 * a migration of existing fingerprint mappings and first-attempt receipts.
 */
export function questionFingerprint(
  problem: Pick<Problem, "prompt" | "formula">,
): string {
  return createHash("sha256")
    .update("daily-calculus:math-content:v1\0")
    .update(
      JSON.stringify([
        normalizedInstruction(problem.prompt),
        normalizedFormula(problem.formula),
      ]),
    )
    .digest("hex");
}

/** Only for trusted stored IDs during migration; this does not authorize answers. */
export function regenerateHistoricalProblem(id: string): PrivateProblem | null {
  if (!/^c[123][pt]\./.test(id)) return getProblem(id);
  const parts = id.split(".");
  if (
    parts.length !== 7 ||
    !/^c[123][pt]$/.test(parts[0]) ||
    !/^[0-9a-z]{1,7}$/.test(parts[2]) ||
    !/^[0-9a-z]{1,7}$/.test(parts[3]) ||
    !/^[a-f0-9]{16}$/.test(parts[4]) ||
    !/^(?:-|[A-Za-z0-9_-]{11})$/.test(parts[5]) ||
    !/^[A-Za-z0-9_-]{22}$/.test(parts[6])
  )
    return null;
  const level = ({ b: "basic", a: "applied", h: "advanced" } as const)[
    parts[1] as "b" | "a" | "h"
  ] as Level | undefined;
  const day = Number.parseInt(parts[2], 36);
  if (!level || day > 2_900_000 || day.toString(36) !== parts[2]) return null;
  const date = new Date(day * 86_400_000).toISOString().slice(0, 10);
  return parts[0].startsWith("c3")
    ? generateBankProblemV3(level, parts[4], date, id)
    : parts[0].startsWith("c2")
      ? generateBankProblem(level, parts[4], date, id)
      : generatePracticeProblem(level, parts[4], date, id);
}
