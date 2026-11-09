import { createHash } from "node:crypto";
import type { Problem } from "../shared/types.js";

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

/** Compatibility identity for trusted local/legacy payloads before guard activation. */
export function unmappedQuestionFingerprint(problemId: string): string {
  return createHash("sha256")
    .update(`daily-calculus:unmapped-id:v1:${problemId}`)
    .digest("hex");
}
