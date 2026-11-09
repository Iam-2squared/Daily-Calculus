import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildContentManifest } from "../scripts/build-content-manifest.js";
import { generateBankProblemV3 } from "../server/problem-bank/index.js";
import { getProblem, getProblems } from "../server/problems.js";
import {
  questionFingerprint,
  regenerateHistoricalProblem,
} from "../server/question-identity.js";
import { SqliteStore } from "../server/store.js";
import type { Level } from "../shared/types.js";

const TODAY = "2026-11-09";
const key = (formula: string) =>
  questionFingerprint({ prompt: "導関数を求めてください。", formula });
async function user(store: SqliteStore, username = "content_user") {
  return (await store.createUser({
    username,
    key: username,
    hash: "a".repeat(128),
    salt: "b".repeat(32),
    createdAt: `${TODAY}T05:00:00Z`,
  }))!;
}
function answer(
  store: SqliteStore,
  userId: number,
  problemId: string,
  contentFingerprint: string,
  correct = true,
  level: Level = "basic",
  date = TODAY,
) {
  return store.recordSolve({
    userId,
    problemId,
    contentFingerprint,
    correct,
    level,
    points: { basic: 1, applied: 3, advanced: 5 }[level],
    date,
    solvedAt: `${date}T05:00:00Z`,
  });
}

function historicalId(prefix: string, seed: string, nonce = "-") {
  const day = Math.floor(Date.parse(`${TODAY}T00:00:00Z`) / 86400000).toString(
    36,
  );
  return `${prefix}.b.${day}.1.${seed}.${nonce}.${"A".repeat(22)}`;
}

test("mathematical identity ignores IDs, dates, levels, choices and display-only LaTeX while preserving the requested task", () => {
  const original = generateBankProblemV3(
    "basic",
    "0123456789abcdef",
    TODAY,
    "c3p.fixture",
  );
  const revised = {
    ...original,
    id: "different-id",
    rewardId: "different-reward",
    date: "2026-11-10",
    level: "advanced" as const,
    subject: "integration" as const,
    title: "Different title",
    choices: original.choices.toReversed(),
  };
  assert.equal(questionFingerprint(original), questionFingerprint(revised));
  assert.equal(
    questionFingerprint({
      prompt: "導関数を選んでください。",
      formula: "f(x)=\\left( x + 2 \\right)^3",
    }),
    questionFingerprint({
      prompt: "導関数を求めてください。",
      formula: "f(x)=(x+2)^3",
    }),
  );
  assert.notEqual(
    questionFingerprint({ prompt: "x=1 の微分係数", formula: "f(x)=x^2" }),
    questionFingerprint({ prompt: "x=2 の微分係数", formula: "f(x)=x^2" }),
  );
  assert.notEqual(
    questionFingerprint({ prompt: "導関数", formula: "x^2" }),
    questionFingerprint({ prompt: "不定積分", formula: "x^2" }),
  );
  for (const revisedDaily of getProblems(TODAY))
    assert.equal(
      questionFingerprint(revisedDaily),
      questionFingerprint(getProblem(revisedDaily.rewardId!)!),
    );
});

test("trusted history reconstruction accepts real timed nonce shapes and builds conservative first-attempt claims without altering earnings", () => {
  const seed = "0123456789abcdef";
  const first = historicalId("c3p", seed);
  const second = historicalId("c3t", seed, "Ab_cd-Ef012");
  const third = historicalId("c3t", seed, "Hi_jk-Lm345");
  const firstMath = regenerateHistoricalProblem(first)!;
  assert.ok(firstMath);
  assert.equal(
    questionFingerprint(regenerateHistoricalProblem(second)!),
    questionFingerprint(firstMath),
  );
  const input = {
    hash: "private-snapshot-hash",
    solves: [
      {
        user_id: 1,
        problem_id: first,
        level: "basic",
        solved_date: TODAY,
        points: 1,
      },
      {
        user_id: 1,
        problem_id: second,
        level: "basic",
        solved_date: TODAY,
        points: 0,
      },
    ],
    wrongs: [{ user_id: 1, problem_id: third, wrong_date: "2026-11-08" }],
  };
  const before = JSON.stringify(input);
  const manifest = buildContentManifest(input);
  assert.equal(manifest.solveCount, 2);
  assert.equal(manifest.wrongCount, 1);
  assert.equal(manifest.problem_fingerprints.length, 3);
  assert.equal(manifest.content_receipts.length, 1);
  assert.equal(manifest.content_receipts[0].first_problem_id, third);
  assert.equal(manifest.content_receipts[0].first_seen_date, "2026-11-08");
  assert.equal(JSON.stringify(input), before);
  assert.throws(
    () =>
      buildContentManifest({
        solves: [
          { user_id: 1, problem_id: "unrecoverable", solved_date: TODAY },
        ],
        wrongs: [],
      }),
    /cannot be reconstructed/,
  );
});

test("one content attempt prevents new IDs, modes, days and difficulty labels from awarding again, without changing other users", async (t) => {
  const store = new SqliteStore(":memory:");
  t.after(() => store.db.close());
  const owner = await user(store);
  const other = await user(store, "other_content_user");
  const fingerprint = key("f(x)=x^2");
  const first = await answer(store, owner.id, "first", fingerprint);
  assert.equal(first.pointsEarned, 1);
  assert.equal(first.awardDuplicate, false);
  const repeated = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      answer(
        store,
        owner.id,
        `new-token-${index}`,
        fingerprint,
        true,
        "advanced",
        "2026-11-10",
      ),
    ),
  );
  assert.ok(repeated.every((result) => result.pointsEarned === 0));
  assert.ok(repeated.every((result) => result.awardDuplicate));
  assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 1);
  assert.equal((await store.stats(owner.id, TODAY, TODAY)).totalPoints, 1);
  assert.equal(
    (
      await answer(
        store,
        other.id,
        "another-user",
        fingerprint,
        true,
        "advanced",
      )
    ).pointsEarned,
    5,
  );
});

test("a first wrong attempt reserves the content forever and duplicate variants neither award nor advance recovery", async (t) => {
  const store = new SqliteStore(":memory:");
  t.after(() => store.db.close());
  const owner = await user(store);
  const wrongKey = key("f(x)=x^2");
  assert.equal(
    (await answer(store, owner.id, "wrong-first", wrongKey, false)).scoring
      .mistakes,
    1,
  );
  const secondWrong = await answer(
    store,
    owner.id,
    "wrong-other-token",
    wrongKey,
    false,
  );
  assert.equal(secondWrong.awardDuplicate, true);
  assert.equal(secondWrong.scoring.mistakes, 1);
  const corrected = await answer(
    store,
    owner.id,
    "correct-new-token",
    wrongKey,
  );
  assert.equal(corrected.pointsEarned, 0);
  assert.equal(corrected.awardDuplicate, true);
  assert.equal(corrected.awardWrongDayBlocked, true);
  assert.equal(corrected.alreadySolved, false);
  assert.equal(
    (
      await answer(
        store,
        owner.id,
        "next-day-token",
        wrongKey,
        true,
        "basic",
        "2026-11-10",
      )
    ).pointsEarned,
    0,
  );
  await answer(store, owner.id, "second-new-wrong", key("f(x)=x^3"), false);
  assert.equal(
    (await answer(store, owner.id, "duplicate-recovery", wrongKey)).scoring
      .correctStreak,
    0,
  );
  const recoveryKey = key("f(x)=x^4");
  assert.equal(
    (await answer(store, owner.id, "recovery-one", recoveryKey)).scoring
      .correctStreak,
    1,
  );
  assert.equal(
    (await answer(store, owner.id, "same-recovery-new-token", recoveryKey))
      .scoring.correctStreak,
    1,
  );
  assert.equal(
    (await answer(store, owner.id, "recovery-two", key("f(x)=x^5"))).scoring
      .correctStreak,
    2,
  );
  assert.equal(
    (
      await answer(
        store,
        owner.id,
        "recovery-three",
        key("f(x)=x^6"),
        true,
        "advanced",
      )
    ).pointsEarned,
    5,
  );
  assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 5);
});

test("unranked legacy and paused attempts cannot later be repackaged as fresh ranked content", async (t) => {
  const store = new SqliteStore(":memory:");
  t.after(() => store.db.close());
  const owner = await user(store);
  const fingerprint = key("f(x)=x^2");
  const old = await answer(store, owner.id, "c3p.old-token", fingerprint);
  assert.equal(old.awardUnavailable, true);
  assert.equal(old.pointsEarned, 0);
  assert.equal(
    (await answer(store, owner.id, "c4p.new-token", fingerprint))
      .awardDuplicate,
    true,
  );
  store.db.exec("UPDATE scoring_control SET paused=1 WHERE singleton=1");
  const pausedKey = key("f(x)=x^3");
  assert.equal(
    (await answer(store, owner.id, "paused", pausedKey)).pointsEarned,
    0,
  );
  store.db.exec("UPDATE scoring_control SET paused=0 WHERE singleton=1");
  assert.equal(
    (await answer(store, owner.id, "after-resume-new-token", pausedKey))
      .pointsEarned,
    0,
  );
  assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 0);
});

test("enabled identity guards reject unknown old payloads without adding history, while a trusted stored mapping supports old daily payloads", async (t) => {
  const store = new SqliteStore(":memory:");
  t.after(() => store.db.close());
  const owner = await user(store);
  const other = await user(store, "known_mapping_owner");
  const fingerprint = key("f(x)=x^2");
  await answer(store, other.id, "known-daily", fingerprint);
  store.db.exec("UPDATE content_guard SET enabled=1 WHERE singleton=1");
  const missing = {
    userId: owner.id,
    problemId: "unknown-old-server",
    correct: true,
    level: "basic" as const,
    points: 1,
    solvedAt: `${TODAY}T05:00:00Z`,
    date: TODAY,
  };
  const blocked = await store.recordSolve(missing);
  assert.equal(blocked.awardUnavailable, true);
  assert.equal(blocked.pointsEarned, 0);
  assert.equal((await store.stats(owner.id, TODAY, TODAY)).solvedCount, 0);
  assert.equal(
    store.db
      .prepare("SELECT COUNT(*) AS count FROM wrong_attempts WHERE user_id=?")
      .get(owner.id)!.count,
    0,
  );
  assert.equal(
    store.db
      .prepare("SELECT COUNT(*) AS count FROM content_receipts WHERE user_id=?")
      .get(owner.id)!.count,
    0,
  );
  const known = await store.recordSolve({
    ...missing,
    problemId: "known-daily",
  });
  assert.equal(known.awardUnavailable, false);
  assert.equal(known.pointsEarned, 1);
  await assert.rejects(
    answer(store, owner.id, "known-daily", key("f(x)=x^9")),
    /identity changed/,
  );
});

test("a failed first correct transaction cannot consume a mathematical identity or mint lifetime income", async (t) => {
  const store = new SqliteStore(":memory:");
  t.after(() => store.db.close());
  const owner = await user(store);
  const fingerprint = key("f(x)=x^2");
  store.db.exec(
    "CREATE TRIGGER fail_content_solve AFTER INSERT ON solves BEGIN SELECT RAISE(ABORT,'Test content rollback'); END",
  );
  await assert.rejects(
    answer(store, owner.id, "failed-new-token", fingerprint),
    /Test content rollback/,
  );
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS count FROM content_receipts").get()!
      .count,
    0,
  );
  assert.equal(
    store.db
      .prepare("SELECT COUNT(*) AS count FROM problem_fingerprints")
      .get()!.count,
    0,
  );
  assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 0);
  store.db.exec("DROP TRIGGER fail_content_solve");
  assert.equal(
    (await answer(store, owner.id, "retry-new-token", fingerprint))
      .pointsEarned,
    1,
  );
});

test("reopening a local database backfills old solves and wrong attempts without changing raw earnings or old receipt fields", async () => {
  const directory = mkdtempSync(join(tmpdir(), "calculus-content-history-"));
  const path = join(directory, "history.sqlite");
  let store: SqliteStore | undefined;
  try {
    store = new SqliteStore(path);
    const owner = await user(store);
    const oldId = historicalId("c2p", "0123456789abcdef");
    const wrongId = historicalId("c1t", "fedcba9876543210", "Ab_cd-Ef012");
    store.db
      .prepare("INSERT INTO solves VALUES(?,?,?,?,?,?)")
      .run(owner.id, oldId, "basic", 1, `${TODAY}T05:00:00Z`, TODAY);
    store.db
      .prepare("INSERT INTO wrong_attempts VALUES(?,?,?)")
      .run(owner.id, wrongId, TODAY);
    const receipt = store.db
      .prepare("SELECT * FROM solves WHERE user_id=?")
      .get(owner.id);
    store.db.close();
    store = new SqliteStore(path);
    assert.deepEqual(
      store.db.prepare("SELECT * FROM solves WHERE user_id=?").get(owner.id),
      receipt,
    );
    assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 1);
    for (const [index, id] of [oldId, wrongId].entries()) {
      const fingerprint = questionFingerprint(regenerateHistoricalProblem(id)!);
      const result = await answer(
        store,
        owner.id,
        `new-after-migration-${index}`,
        fingerprint,
      );
      assert.equal(result.awardDuplicate, true);
      assert.equal(result.pointsEarned, 0);
    }
    assert.equal((await store.lifetimeTotals([owner.id]))[0].totalPoints, 1);
  } finally {
    store?.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
