import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { todayJST, addDays } from "../shared/date.js";
import {
  LEVELS,
  type ChallengeMode,
  type ChallengeResponse,
  type Level,
  type PrivateProblem,
  type TimeAttackRun,
} from "../shared/types.js";
import { generatePracticeProblem } from "./practice-problems.js";
import { publicProblem } from "./problems.js";

export const TIME_ATTACK_SECONDS = 180;
const DAY_MS = 86_400_000;
const LEVEL_CODE: Record<Level, string> = {
  basic: "b",
  applied: "a",
  advanced: "h",
};
const CODE_LEVEL: Record<string, Level> = {
  b: "basic",
  a: "applied",
  h: "advanced",
};

export class ChallengeError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const invalid = () =>
  new ChallengeError(
    403,
    "挑戦の情報を確認できませんでした。問題を選び直してください。",
  );
const expired = () =>
  new ChallengeError(
    410,
    "制限時間が終了しました。結果を確認して、もう一度挑戦できます。",
  );
export function isChallengeId(id: string): boolean {
  return id.startsWith("c1p.") || id.startsWith("c1t.");
}
export function validChallengeInput(
  level: unknown,
  mode: unknown,
): level is Level {
  return (
    typeof level === "string" &&
    Object.hasOwn(LEVELS, level) &&
    (mode === "practice" || mode === "time-attack")
  );
}
function fromBase36(value: string): number {
  if (!/^[0-9a-z]{1,11}$/.test(value)) throw invalid();
  const parsed = Number.parseInt(value, 36);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    parsed.toString(36) !== value
  )
    throw invalid();
  return parsed;
}
function encodeDate(date: string): string {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS).toString(36);
}
function decodeDate(value: string): string {
  const days = fromBase36(value);
  if (days > 2_900_000) throw invalid();
  return new Date(days * DAY_MS).toISOString().slice(0, 10);
}

/** Stateless signed questions survive Vercel cold starts without a new database table. */
export class Challenges {
  constructor(private signingKey: string) {
    if (signingKey.length < 32)
      throw new Error(
        "Challenge signing key must have at least 32 characters.",
      );
  }
  private sign(domain: "problem" | "run", payload: string): string {
    return createHmac("sha256", this.signingKey)
      .update(`daily-calculus:${domain}:${payload}`)
      .digest()
      .subarray(0, 16)
      .toString("base64url");
  }
  private check(domain: "problem" | "run", payload: string, signature: string) {
    if (!/^[A-Za-z0-9_-]{22}$/.test(signature)) throw invalid();
    const expected = Buffer.from(this.sign(domain, payload));
    const supplied = Buffer.from(signature);
    if (
      expected.length !== supplied.length ||
      !timingSafeEqual(expected, supplied)
    )
      throw invalid();
  }
  private run(
    token: unknown,
    userId: number,
    level: Level,
    nowMs: number,
  ): TimeAttackRun & { nonce: string } {
    if (typeof token !== "string" || token.length > 120) throw invalid();
    const parts = token.split(".");
    if (
      parts.length !== 6 ||
      parts[0] !== "r1" ||
      !/^[A-Za-z0-9_-]{11}$/.test(parts[4])
    )
      throw invalid();
    const payload = parts.slice(0, 5).join(".");
    this.check("run", payload, parts[5]);
    if (CODE_LEVEL[parts[1]] !== level || fromBase36(parts[2]) !== userId)
      throw invalid();
    const startedAt = fromBase36(parts[3]);
    if (startedAt > nowMs + 1000) throw invalid();
    const endsAt = startedAt + TIME_ATTACK_SECONDS * 1000;
    if (nowMs >= endsAt) throw expired();
    return {
      token,
      endsAt,
      durationSeconds: TIME_ATTACK_SECONDS,
      nonce: parts[4],
    };
  }
  issue(
    level: Level,
    mode: ChallengeMode,
    userId: number,
    now: Date,
    runToken?: unknown,
    start = false,
  ): ChallengeResponse {
    const timestamp = now.getTime();
    let run: (TimeAttackRun & { nonce: string }) | undefined;
    if (mode === "time-attack") {
      if (start) {
        const nonce = randomBytes(8).toString("base64url");
        const payload = [
          "r1",
          LEVEL_CODE[level],
          userId.toString(36),
          timestamp.toString(36),
          nonce,
        ].join(".");
        const token = `${payload}.${this.sign("run", payload)}`;
        run = {
          token,
          endsAt: timestamp + TIME_ATTACK_SECONDS * 1000,
          durationSeconds: TIME_ATTACK_SECONDS,
          nonce,
        };
      } else run = this.run(runToken, userId, level, timestamp);
    }
    const date = todayJST(now);
    const seed = randomBytes(8).toString("hex");
    const payload = [
      mode === "practice" ? "c1p" : "c1t",
      LEVEL_CODE[level],
      encodeDate(date),
      userId.toString(36),
      seed,
      run?.nonce || "-",
    ].join(".");
    const id = `${payload}.${this.sign("problem", payload)}`;
    const problem = generatePracticeProblem(level, seed, date, id);
    return {
      problem: publicProblem(problem),
      serverNow: timestamp,
      ...(run
        ? {
            run: {
              token: run.token,
              endsAt: run.endsAt,
              durationSeconds: run.durationSeconds,
            },
          }
        : {}),
    };
  }
  resolve(
    id: string,
    userId: number,
    now: Date,
    runToken?: unknown,
  ): PrivateProblem {
    if (id.length > 80) throw invalid();
    const parts = id.split(".");
    if (
      parts.length !== 7 ||
      !["c1p", "c1t"].includes(parts[0]) ||
      !/^[a-f0-9]{16}$/.test(parts[4])
    )
      throw invalid();
    const level = CODE_LEVEL[parts[1]];
    if (!level) throw invalid();
    this.check("problem", parts.slice(0, 6).join("."), parts[6]);
    if (fromBase36(parts[3]) !== userId) throw invalid();
    const date = decodeDate(parts[2]);
    const today = todayJST(now);
    if (date > today || date < addDays(today, -365)) throw invalid();
    if (parts[0] === "c1t") {
      const run = this.run(runToken, userId, level, now.getTime());
      if (run.nonce !== parts[5]) throw invalid();
    } else if (parts[5] !== "-") throw invalid();
    return generatePracticeProblem(level, parts[4], date, id);
  }
}
