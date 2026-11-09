import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  Challenges,
  isChallengeId,
  isRankedChallengeId,
} from "../server/challenges.js";
import {
  generateBankProblem,
  generateBankProblemV3,
} from "../server/problem-bank/index.js";
import { generatePracticeProblem } from "../server/practice-problems.js";
import type { Level } from "../shared/types.js";

const KEY = "secure_issuance_fixture_key_not_a_production_secret_123456";
const OTHER_KEY = "another_secure_fixture_key_not_a_production_secret_654321";
const DATE = "2026-11-09";
const NOW = new Date(`${DATE}T05:00:00Z`);
const UID = 41;
const DAY = Math.floor(Date.parse(`${DATE}T00:00:00Z`) / 86_400_000).toString(
  36,
);
const code: Record<Level, string> = { basic: "b", applied: "a", advanced: "h" };
function signature(payload: string, domain = "problem", key = KEY) {
  return createHmac("sha256", key)
    .update(`daily-calculus:${domain}:${payload}`)
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}
function derive(payload: string, domain: "content" | "shuffle") {
  return createHmac("sha256", KEY)
    .update(`daily-calculus:c4:${domain}:${payload}`)
    .digest("hex")
    .slice(0, 16);
}

test("c4 carries an opaque nonce and reproducibly derives both content and order from independent secret domains", () => {
  const issuer = new Challenges(KEY);
  const cold = new Challenges(KEY);
  for (const level of ["basic", "applied", "advanced"] as const) {
    for (const mode of ["practice", "time-attack"] as const) {
      for (const subject of [
        "all",
        "differentiation",
        "integration",
      ] as const) {
        const issued = issuer.issue(
          level,
          mode,
          UID,
          NOW,
          undefined,
          true,
          subject,
        );
        const id = issued.problem.id;
        assert.match(id, mode === "practice" ? /^c4p\./ : /^c4t\./);
        assert.ok(id.length <= 80);
        assert.equal(isChallengeId(id), true);
        assert.equal(isRankedChallengeId(id), true);
        const parts = id.split(".");
        assert.match(parts[4], /^[a-f0-9]{16}$/);
        const payload = parts.slice(0, 6).join(".");
        const content = derive(payload, "content");
        const shuffle = derive(payload, "shuffle");
        assert.notEqual(content, parts[4]);
        assert.notEqual(shuffle, parts[4]);
        assert.notEqual(content, shuffle);
        const expected = generateBankProblemV3(
          level,
          content,
          DATE,
          id,
          {},
          shuffle,
        );
        const resolved = issuer.resolve(id, UID, NOW, issued.run?.token);
        assert.deepEqual(resolved, expected);
        assert.deepEqual(
          cold.resolve(id, UID, NOW, issued.run?.token),
          expected,
        );
        assert.equal(issued.problem.formula, expected.formula);
        assert.deepEqual(issued.problem.choices, expected.choices);
        if (subject !== "all") assert.equal(issued.problem.subject, subject);
        for (const field of [
          "correctIndex",
          "explanation",
          "explanationFormulas",
          "seed",
          "contentSeed",
          "shuffleSeed",
          "signingKey",
        ])
          assert.equal(Object.hasOwn(issued.problem, field), false, field);
        assert.equal(JSON.stringify(issued).includes(content), false);
        assert.equal(JSON.stringify(issued).includes(shuffle), false);
      }
    }
  }
});

test("the formerly exposed-seed reconstruction no longer reproduces c4 content or predicts its answer position", () => {
  const issuer = new Challenges(KEY);
  let differentQuestions = 0,
    samePosition = 0;
  for (let index = 0; index < 256; index++) {
    const nonce = index.toString(16).padStart(16, "0");
    const level = (["basic", "applied", "advanced"] as const)[index % 3];
    const payload = [
      "c4p",
      code[level],
      DAY,
      UID.toString(36),
      nonce,
      "-",
    ].join(".");
    const id = `${payload}.${signature(payload)}`;
    const real = issuer.resolve(id, UID, NOW);
    const publicGuess = generateBankProblemV3(level, nonce, DATE, id);
    if (
      real.formula !== publicGuess.formula ||
      real.prompt !== publicGuess.prompt
    )
      differentQuestions++;
    if (real.correctIndex === publicGuess.correctIndex) samePosition++;
  }
  assert.ok(
    differentQuestions >= 248,
    `${differentQuestions}/256 question contents differed`,
  );
  assert.ok(
    samePosition >= 35 && samePosition <= 95,
    `${samePosition}/256 answer positions guessed`,
  );
});

test("c4 signatures, user identity, run identity and deadlines remain authoritative", () => {
  const issuer = new Challenges(KEY);
  const practice = issuer.issue("advanced", "practice", UID, NOW);
  const id = practice.problem.id;
  const parts = id.split(".");
  const tamper = (at: number, value: string) =>
    parts.map((part, index) => (index === at ? value : part)).join(".");
  for (const changed of [
    tamper(0, "c3p"),
    tamper(1, "b"),
    tamper(4, "fedcba9876543210"),
    tamper(5, "abcdefghijk"),
  ])
    assert.throws(() => issuer.resolve(changed, UID, NOW), /挑戦/);
  assert.throws(() => issuer.resolve(id, UID + 1, NOW), /挑戦/);
  assert.throws(() => new Challenges(OTHER_KEY).resolve(id, UID, NOW), /挑戦/);
  const timed = issuer.issue(
    "basic",
    "time-attack",
    UID,
    NOW,
    undefined,
    true,
    "integration",
  );
  assert.throws(() => issuer.resolve(timed.problem.id, UID, NOW), /挑戦/);
  const otherRun = issuer.issue(
    "basic",
    "time-attack",
    UID,
    NOW,
    undefined,
    true,
    "integration",
  );
  assert.throws(
    () => issuer.resolve(timed.problem.id, UID, NOW, otherRun.run!.token),
    /挑戦/,
  );
  assert.throws(
    () =>
      issuer.resolve(
        timed.problem.id,
        UID,
        new Date(timed.run!.endsAt),
        timed.run!.token,
      ),
    /制限時間/,
  );
  const next = issuer.issue(
    "basic",
    "time-attack",
    UID,
    new Date(NOW.getTime() + 1000),
    timed.run!.token,
    false,
    "integration",
  );
  assert.equal(next.run!.endsAt, timed.run!.endsAt);
  assert.equal(next.problem.subject, "integration");
  assert.equal(
    issuer.resolve(
      next.problem.id,
      UID,
      new Date(NOW.getTime() + 1000),
      next.run!.token,
    ).subject,
    "integration",
  );
});

test("old c1, c2 and c3 signed questions retain exact grading while being identifiable as unranked", () => {
  const issuer = new Challenges(KEY);
  const seed = "0123456789abcdef";
  for (const version of [1, 2, 3]) {
    for (const level of ["basic", "applied", "advanced"] as const) {
      const payload = [
        `c${version}p`,
        code[level],
        DAY,
        UID.toString(36),
        seed,
        "-",
      ].join(".");
      const id = `${payload}.${signature(payload)}`;
      const expected =
        version === 1
          ? generatePracticeProblem(level, seed, DATE, id)
          : version === 2
            ? generateBankProblem(level, seed, DATE, id)
            : generateBankProblemV3(level, seed, DATE, id);
      assert.deepEqual(issuer.resolve(id, UID, NOW), expected);
      assert.equal(isChallengeId(id), true);
      assert.equal(isRankedChallengeId(id), false);
    }
  }
});
