import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { isDateKey } from "../shared/date.js";
import {
  questionFingerprint,
  regenerateHistoricalProblem,
} from "../server/question-identity.js";

interface HistoricalRow {
  user_id: number;
  problem_id: string;
  solved_date?: string;
  wrong_date?: string;
  level?: string;
}
interface HistoricalExport {
  hash?: string;
  solves: HistoricalRow[];
  wrongs: HistoricalRow[];
}
export interface ContentManifest {
  version: 1;
  sourceHash: string | null;
  solveCount: number;
  wrongCount: number;
  problem_fingerprints: { problem_id: string; fingerprint: string }[];
  content_receipts: {
    user_id: number;
    fingerprint: string;
    first_problem_id: string;
    first_seen_date: string;
  }[];
}

/** Build a private, deterministic import artifact without contacting a database. */
export function buildContentManifest(input: HistoricalExport): ContentManifest {
  if (!Array.isArray(input.solves) || !Array.isArray(input.wrongs))
    throw new Error("The historical export must include solves and wrongs.");
  const mappings = new Map<string, string>();
  const claims = new Map<string, ContentManifest["content_receipts"][number]>();
  for (const row of [...input.solves, ...input.wrongs]) {
    const date = row.solved_date ?? row.wrong_date;
    if (
      !Number.isInteger(row.user_id) ||
      row.user_id < 1 ||
      row.user_id > 2147483647 ||
      typeof row.problem_id !== "string" ||
      !date ||
      !isDateKey(date)
    )
      throw new Error(
        "The historical export contains an invalid identity/date.",
      );
    let fingerprint = mappings.get(row.problem_id);
    if (!fingerprint) {
      const problem = regenerateHistoricalProblem(row.problem_id);
      if (!problem)
        throw new Error(
          "A historical problem cannot be reconstructed; import must stop.",
        );
      if (row.level && row.level !== problem.level)
        throw new Error(
          "A historical difficulty differs from its reconstructed problem.",
        );
      fingerprint = questionFingerprint(problem);
      mappings.set(row.problem_id, fingerprint);
    }
    const key = `${row.user_id}:${fingerprint}`;
    const previous = claims.get(key);
    if (
      !previous ||
      date < previous.first_seen_date ||
      (date === previous.first_seen_date &&
        row.problem_id < previous.first_problem_id)
    )
      claims.set(key, {
        user_id: row.user_id,
        fingerprint,
        first_problem_id: row.problem_id,
        first_seen_date: date,
      });
  }
  return {
    version: 1,
    sourceHash: typeof input.hash === "string" ? input.hash : null,
    solveCount: input.solves.length,
    wrongCount: input.wrongs.length,
    problem_fingerprints: [...mappings]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([problem_id, fingerprint]) => ({ problem_id, fingerprint })),
    content_receipts: [...claims.values()].sort(
      (left, right) =>
        left.user_id - right.user_id ||
        left.fingerprint.localeCompare(right.fingerprint),
    ),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath)
    throw new Error(
      "Usage: tsx scripts/build-content-manifest.ts INPUT.json OUTPUT.json",
    );
  const manifest = buildContentManifest(
    JSON.parse(readFileSync(inputPath, "utf8")) as HistoricalExport,
  );
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  });
  process.stdout.write(
    `${manifest.solveCount} solves + ${manifest.wrongCount} wrong attempts reconstructed; ${manifest.problem_fingerprints.length} question IDs, ${manifest.content_receipts.length} user/content claims.\n`,
  );
}
