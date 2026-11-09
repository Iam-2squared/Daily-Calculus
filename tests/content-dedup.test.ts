import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { createApp } from "../server/app.js";
import { Challenges } from "../server/challenges.js";
import { questionFingerprint } from "../server/question-identity.js";
import type { SqliteStore } from "../server/store.js";
import type {
  AnswerResult,
  Level,
  PrivateProblem,
  Stats,
} from "../shared/types.js";

const DAY = "2026-11-09";
type Account = { id: number; cookie: string };

// The exact mathematical question that received two awards under distinct c3
// IDs in the prior local reproduction. No random collision search is needed.
function acceleration(b = 1): Omit<PrivateProblem, "id" | "level" | "date"> {
  const value = 36 + 2 * b;
  return {
    title: "位置から加速度を求める",
    topic: "二階微分と運動",
    estimatedMinutes: 4,
    prompt:
      "直線上を動く物体の位置 s(t) が次の式で与えられます。t = 2 秒での加速度を求めてください。位置の単位は m、答えの単位は m/s² です。",
    formula: `s(t)=3t^3+${b === 1 ? "t^2" : `${b}t^2`}`,
    choices: [`${value}`, `${value + 2}`, `${value - 2}`, `${value / 2}`],
    correctIndex: 0,
    hint: "位置を2回微分します。",
    explanation: ["二階導関数を時刻2で評価します。"],
    explanationFormulas: [`s''(2)=${value}`],
  };
}

async function harness(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "calculus-content-api-"));
  const path = join(directory, "content.sqlite");
  let instant = new Date(`${DAY}T05:00:00Z`);
  let app: ReturnType<typeof createApp>;
  let server: Server | undefined;
  let base = "";
  let sequence = 0;
  const syncCalls: number[] = [];
  const issued = new Map<string, { owner: number; problem: PrivateProblem }>();
  // Issuance/signature secrecy is covered by secure-issuance.test.ts. Here the
  // trusted resolver supplies authored mathematics, so the real answer API,
  // fingerprint calculation, transactions and wallet eligibility are isolated.
  t.mock.method(
    Challenges.prototype,
    "resolve",
    (id: string, userId: number) => {
      const binding = issued.get(id);
      assert.ok(binding, "only authored server fixtures may be resolved");
      assert.equal(binding.owner, userId);
      return structuredClone(binding.problem);
    },
  );
  async function start() {
    app = createApp(path, {
      now: () => instant,
      secureCookies: false,
      integration: {
        targetSecret: "content-api-wallet-" + "t".repeat(40),
        targetUrl: "https://wallet.example",
        request: async (input, init) => {
          assert.equal(
            new URL(String(input)).pathname,
            "/api/integrations/calculus/sync",
          );
          syncCalls.push(JSON.parse(String(init?.body)).userId);
          return new Response(
            JSON.stringify({
              linked: false,
              conversionRate: 10000,
              member: null,
              balance: null,
              totalIncome: null,
              calculusIncome: null,
              syncPending: false,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        },
      },
    });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  async function stop() {
    if (!server) return;
    const active = server;
    server = undefined;
    await new Promise<void>((done, reject) =>
      active.close((error) => (error ? reject(error) : done())),
    );
    app.locals.db.close();
  }
  t.after(async () => {
    try {
      await stop();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  await start();
  async function request(endpoint: string, body?: unknown, owner?: Account) {
    const response = await fetch(base + endpoint, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/json",
        ...(owner ? { Cookie: owner.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.ok(response.ok, `${response.status}: ${endpoint}`);
    return {
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  return {
    syncCalls,
    get store() {
      return app.locals.store as SqliteStore;
    },
    setDate(date: string) {
      instant = new Date(`${date}T05:00:00Z`);
    },
    restart: async () => {
      await stop();
      await start();
    },
    async register(username: string): Promise<Account> {
      const result = await request("/api/auth/register", {
        username,
        password: "4916",
      });
      assert.ok(result.cookie);
      return { id: result.body.user.id, cookie: result.cookie };
    },
    bind(
      owner: Account,
      options: {
        b?: number;
        level?: Level;
        date?: string;
        prefix?: string;
        reverse?: boolean;
      } = {},
    ) {
      const level = options.level ?? "basic",
        date = options.date ?? DAY;
      const code = { basic: "b", applied: "a", advanced: "h" }[level];
      const day = Math.floor(
        Date.parse(`${date}T00:00:00Z`) / 86400000,
      ).toString(36);
      const nonce = (++sequence).toString(16).padStart(16, "0");
      const id = `${options.prefix ?? "c4p"}.${code}.${day}.${owner.id.toString(36)}.${nonce}.-.${"A".repeat(22)}`;
      const math = acceleration(options.b);
      const problem: PrivateProblem = {
        ...math,
        id,
        level,
        date,
        choices: options.reverse ? math.choices.toReversed() : math.choices,
        correctIndex: options.reverse ? 3 : 0,
      };
      issued.set(id, { owner: owner.id, problem });
      return problem;
    },
    async answer(
      owner: Account,
      problem: PrivateProblem,
      correct = true,
      extra: Record<string, unknown> = {},
    ): Promise<AnswerResult> {
      return (
        await request(
          `/api/problems/${encodeURIComponent(problem.id)}/answer`,
          {
            choiceIndex: correct
              ? problem.correctIndex
              : (problem.correctIndex + 1) % 4,
            ...extra,
          },
          owner,
        )
      ).body;
    },
    async stats(owner: Account): Promise<Stats> {
      return (await request("/api/stats", undefined, owner)).body;
    },
    async lifetime(owner: Account) {
      return (
        await (app.locals.store as SqliteStore).lifetimeTotals([owner.id])
      )[0].totalPoints;
    },
  };
}

test("the reproduced acceleration question awards once despite new C4 IDs, modes, dates, choices, levels and forged browser fingerprints", async (t) => {
  const h = await harness(t);
  const owner = await h.register("content_repro");
  const first = h.bind(owner);
  assert.equal(first.formula, "s(t)=3t^3+t^2");
  assert.equal(first.choices[first.correctIndex], "38");
  assert.equal((await h.answer(owner, first)).pointsEarned, 1);
  h.setDate("2026-11-10");
  const second = h.bind(owner, {
    prefix: "c4t",
    date: "2026-11-10",
    level: "advanced",
    reverse: true,
  });
  const repeated = await h.answer(owner, second, true, {
    contentFingerprint: "f".repeat(64),
    fingerprint: "e".repeat(64),
    rewardId: "forged-new-credit",
    awardEligible: true,
  });
  assert.equal(repeated.pointsEarned, 0);
  assert.equal(repeated.awardDuplicate, true);
  assert.equal(
    repeated.alreadySolved,
    false,
    "duplicate mathematics may still create a zero-point learning receipt",
  );
  assert.equal(repeated.awardUnavailable, false);
  assert.deepEqual(repeated.scoring, {
    mistakes: 0,
    correctStreak: 0,
    requiredCorrectStreak: 3,
    locked: false,
  });
  assert.equal(
    h.store.db
      .prepare(
        "SELECT fingerprint FROM problem_fingerprints WHERE problem_id=?",
      )
      .get(second.id)!.fingerprint,
    questionFingerprint(first),
  );
  assert.equal((await h.answer(owner, first)).pointsEarned, 0);
  assert.equal(await h.lifetime(owner), 1);
  assert.deepEqual(h.syncCalls, [owner.id]);
  const stats = await h.stats(owner);
  assert.equal(stats.totalPoints, 1);
  assert.equal(stats.solvedCount, 2);
  assert.deepEqual(stats.activity, [
    { date: DAY, count: 1, points: 1 },
    { date: "2026-11-10", count: 1, points: 0 },
  ]);
});

test("a first wrong attempt consumes the content forever and fresh duplicate IDs cannot advance account recovery", async (t) => {
  const h = await harness(t);
  const owner = await h.register("content_wrong");
  assert.equal(
    (await h.answer(owner, h.bind(owner), false)).scoring!.mistakes,
    1,
  );
  assert.equal(
    (await h.answer(owner, h.bind(owner, { b: 2 }), false)).scoring!.locked,
    true,
  );
  for (const date of [DAY, "2026-11-10"]) {
    h.setDate(date);
    const result = await h.answer(
      owner,
      h.bind(owner, { date, level: "advanced", reverse: true }),
    );
    assert.equal(result.pointsEarned, 0);
    assert.equal(result.awardDuplicate, true);
    assert.equal(result.scoring!.correctStreak, 0);
    assert.equal(result.scoring!.locked, true);
  }
  const firstRecovery = await h.answer(owner, h.bind(owner, { b: 3 }));
  assert.equal(firstRecovery.scoring!.correctStreak, 1);
  const replayedRecovery = await h.answer(
    owner,
    h.bind(owner, { b: 3, prefix: "c4t" }),
  );
  assert.equal(replayedRecovery.awardDuplicate, true);
  assert.equal(replayedRecovery.scoring!.correctStreak, 1);
  assert.equal(
    (await h.answer(owner, h.bind(owner, { b: 4 }))).scoring!.correctStreak,
    2,
  );
  assert.equal(
    (await h.answer(owner, h.bind(owner, { b: 5, level: "advanced" })))
      .pointsEarned,
    5,
  );
  assert.equal(await h.lifetime(owner), 5);
  assert.deepEqual(h.syncCalls, [owner.id]);
  assert.deepEqual((await h.stats(owner)).pendingAwardIds, []);
});

test("concurrent content variants award at most once per account while two different accounts each retain their own first credit", async (t) => {
  const h = await harness(t);
  const first = await h.register("concurrent_content_a");
  const second = await h.register("concurrent_content_b");
  const batches = await Promise.all(
    [first, second].map(async (owner, accountIndex) => {
      const variants = Array.from({ length: 12 }, (_, index) =>
        h.bind(owner, {
          level: accountIndex ? "advanced" : "basic",
          prefix: index % 2 ? "c4t" : "c4p",
          date: index % 2 ? "2026-11-08" : DAY,
          reverse: Boolean(index % 2),
        }),
      );
      return Promise.all(variants.map((variant) => h.answer(owner, variant)));
    }),
  );
  for (const [index, results] of batches.entries()) {
    const owner = index ? second : first,
      expected = index ? 5 : 1;
    assert.equal(
      results.reduce((sum, answer) => sum + answer.pointsEarned, 0),
      expected,
    );
    assert.equal(results.filter((answer) => answer.pointsEarned > 0).length, 1);
    assert.equal(results.filter((answer) => answer.awardDuplicate).length, 11);
    assert.equal(await h.lifetime(owner), expected);
    assert.equal((await h.stats(owner)).totalPoints, expected);
    assert.equal(h.syncCalls.filter((id) => id === owner.id).length, 1);
  }
});

test("unranked legacy content cannot change global recovery or become ranked again through a forged eligibility flag", async (t) => {
  const h = await harness(t);
  const owner = await h.register("legacy_content_api");
  const legacy = h.bind(owner, { prefix: "c3p" });
  const wrong = await h.answer(owner, legacy, false, { awardEligible: true });
  assert.equal(wrong.awardUnavailable, true);
  assert.equal(wrong.scoring!.mistakes, 0);
  const attemptedUpgrade = await h.answer(owner, h.bind(owner), true, {
    awardEligible: true,
    contentFingerprint: "f".repeat(64),
  });
  assert.equal(attemptedUpgrade.awardDuplicate, true);
  assert.equal(attemptedUpgrade.pointsEarned, 0);
  assert.equal(attemptedUpgrade.scoring!.correctStreak, 0);
  assert.equal(await h.lifetime(owner), 0);
  assert.deepEqual(h.syncCalls, []);
});

test("backfilling the exact two historically paid duplicate c3 receipts preserves their money and fields while blocking another content award", async (t) => {
  const h = await harness(t);
  const owner = await h.register("history_content_api");
  const historical = [
    "c3p.b.g0u.1.3ee635f8f9fd0090.-.xiNFdqAis6p6HL6wVCFIkA",
    "c3p.b.g0u.1.e4d28004fb9b75a3.-.TmWyZwFsEnv9QXK7OVXAFA",
  ];
  const insert = h.store.db.prepare("INSERT INTO solves VALUES(?,?,?,?,?,?)");
  historical.forEach((id, index) =>
    insert.run(owner.id, id, "basic", 1, `${DAY}T05:00:0${index}Z`, DAY),
  );
  const before = h.store.db
    .prepare("SELECT * FROM solves ORDER BY problem_id")
    .all();
  assert.equal(await h.lifetime(owner), 2);
  await h.restart();
  assert.deepEqual(
    h.store.db.prepare("SELECT * FROM solves ORDER BY problem_id").all(),
    before,
  );
  assert.equal((await h.stats(owner)).totalPoints, 2);
  assert.equal(await h.lifetime(owner), 2);
  h.store.db.exec("UPDATE content_guard SET enabled=1 WHERE singleton=1");
  const next = await h.answer(
    owner,
    h.bind(owner, { level: "advanced", reverse: true }),
  );
  assert.equal(next.awardDuplicate, true);
  assert.equal(next.pointsEarned, 0);
  assert.equal((await h.stats(owner)).totalPoints, 2);
  assert.equal(await h.lifetime(owner), 2);
  assert.deepEqual(h.syncCalls, []);
});
