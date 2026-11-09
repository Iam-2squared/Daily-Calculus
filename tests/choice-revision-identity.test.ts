import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import katex from "katex";
import { getProblem, getProblems } from "../server/problems.js";
import { createApp } from "../server/app.js";
import type { PrivateProblem } from "../shared/types.js";
import { choiceValue } from "./helpers/choice-value.js";

function mathContent(problem: PrivateProblem) {
  const {
    id: _id,
    rewardId: _rewardId,
    choices: _choices,
    correctIndex: _correctIndex,
    ...content
  } = problem;
  return content;
}
function assertChoiceRevision(revised: PrivateProblem) {
  assert.match(revised.id, /^d3:/);
  assert.ok(revised.rewardId);
  const original = getProblem(revised.rewardId!)!;
  assert.deepEqual(mathContent(revised), mathContent(original));
  assert.equal(
    revised.choices[revised.correctIndex],
    original.choices[original.correctIndex],
  );
  assert.equal(revised.choices.length, 4);
  assert.equal(new Set(revised.choices).size, 4);
  assert.deepEqual(getProblem(revised.id), revised);
}

function assertLegacyChoiceMath(problem: PrivateProblem) {
  const samples = [0.17, 0.29, 0.43, 0.61, 0.83, 1.17, 1.43, 1.79];
  const indefinite = problem.choices[problem.correctIndex].includes("C");
  const values = problem.choices.map((choice) => {
    const values = samples.map((x) => choiceValue(choice, x));
    assert.ok(values.every(Number.isFinite), `${problem.id}: ${choice}`);
    return indefinite ? values.map((value) => value - values[0]) : values;
  });
  const close = (left: number, right: number) =>
    Math.abs(left - right) <=
    Math.max(
      1e-12,
      4 * Number.EPSILON * Math.max(Math.abs(left), Math.abs(right)),
    );
  for (let left = 0; left < values.length; left++)
    for (let right = left + 1; right < values.length; right++) {
      const label = `${problem.id}: ${problem.choices[left]} / ${problem.choices[right]}`;
      assert.equal(
        values[left].every((value, index) =>
          close(value, values[right][index]),
        ),
        false,
        `${label}: mathematically equivalent answers`,
      );
      assert.equal(
        values[left].every((value, index) =>
          close(value, -values[right][index]),
        ),
        false,
        `${label}: opposite-sign answers`,
      );
    }
}

test("legacy archives display revised choices across every legacy parameter family while old answer IDs remain exact", () => {
  const formulas = new Set<string>();
  for (let day = 0; day < 1800; day++) {
    const date = new Date(Date.UTC(2019, 0, 1) + day * 86400000)
      .toISOString()
      .slice(0, 10);
    for (const revised of getProblems(date)) {
      assert.match(revised.id, /^d3:\d{4}-\d{2}-\d{2}:l:/);
      assert.equal(revised.rewardId, `${date}:${revised.level}`);
      assertChoiceRevision(revised);
      assertLegacyChoiceMath(revised);
      revised.choices.forEach((choice) => formulas.add(choice));
    }
  }
  for (const formula of formulas)
    assert.doesNotThrow(
      () =>
        katex.renderToString(formula, { throwOnError: true, strict: "error" }),
      formula,
    );
});

test("daily d3 choices preserve canonical d2 math and completion identities across rotating categories", () => {
  for (let day = 0; day < 100; day++) {
    const date = new Date(Date.UTC(2026, 10, 7) + day * 86400000)
      .toISOString()
      .slice(0, 10);
    for (const revised of getProblems(date)) {
      assertChoiceRevision(revised);
      assert.equal(revised.rewardId, revised.id.replace(/^d3:/, "d2:"));
    }
  }
  for (const id of [
    "d3:2026-11-07:l:basic",
    "d3:2026-11-06:d:basic",
    "d3:2026-11-09:l:basic:extra",
  ])
    assert.equal(getProblem(id), null);
});

test("old and revised daily/archive answers share one award receipt, and revision never changes the active scoring pause", async (t) => {
  const date = "2026-11-09",
    frozenAt = "2026-11-08T23:00:00.000Z";
  const app = createApp(":memory:", {
    now: () => new Date(`${date}T05:00:00Z`),
    secureCookies: false,
    integration: {
      targetSecret: "t".repeat(40),
      targetUrl: "https://wallet.example",
      request: async () =>
        new Response(
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
        ),
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          app.locals.db.close();
          error ? reject(error) : resolve();
        });
      }),
  );
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let cookie = "";
  async function request(path: string, body?: unknown) {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const session = response.headers.get("set-cookie")?.split(";")[0];
    if (session) cookie = session;
    return { status: response.status, body: await response.json() };
  }
  async function answer(problem: PrivateProblem) {
    return request(`/api/problems/${encodeURIComponent(problem.id)}/answer`, {
      choiceIndex: problem.correctIndex,
    });
  }
  const registered = await request("/api/auth/register", {
    username: "choice_revision_qa",
    password: "0123",
  });
  assert.equal(registered.status, 201);
  const revised = getProblems(date);
  const firstOld = getProblem(revised[0].rewardId!)!;
  let points = (await answer(firstOld)).body.pointsEarned;
  const oldThenNew = await answer(revised[0]);
  assert.equal(oldThenNew.body.pointsEarned, 0);
  assert.equal(oldThenNew.body.alreadySolved, true);
  points += (await answer(revised[1])).body.pointsEarned;
  const newThenOld = await answer(getProblem(revised[1].rewardId!)!);
  assert.equal(newThenOld.body.pointsEarned, 0);
  assert.equal(newThenOld.body.alreadySolved, true);
  const archive = getProblems("2026-10-28")[0];
  points += (await answer(archive)).body.pointsEarned;
  const oldArchive = await answer(getProblem(archive.rewardId!)!);
  assert.equal(oldArchive.body.pointsEarned, 0);
  assert.equal(oldArchive.body.alreadySolved, true);
  let stats = (await request("/api/stats")).body;
  assert.equal(stats.totalPoints, points);
  assert.equal(stats.solvedCount, 3);
  assert.deepEqual(
    [...stats.solvedIds].sort(),
    [revised[0].rewardId, revised[1].rewardId, archive.rewardId].sort(),
  );
  assert.ok(stats.solvedIds.every((id: string) => !id.startsWith("d3:")));
  assert.equal(
    (await app.locals.store.lifetimeTotals([registered.body.user.id]))[0]
      .totalPoints,
    points,
  );
  app.locals.db
    .prepare(
      "UPDATE scoring_control SET paused=1,frozen_at=? WHERE singleton=1",
    )
    .run(frozenAt);
  const paused = await answer(revised[2]);
  assert.equal(paused.body.pointsEarned, 0);
  assert.equal(paused.body.awardPaused, true);
  assert.equal(paused.body.scoringFrozenAt, frozenAt);
  const oldPaused = await answer(getProblem(revised[2].rewardId!)!);
  assert.equal(oldPaused.body.pointsEarned, 0);
  assert.equal(oldPaused.body.alreadySolved, true);
  stats = (await request("/api/stats")).body;
  assert.equal(stats.scoringPaused, true);
  assert.equal(stats.scoringFrozenAt, frozenAt);
  assert.equal(stats.totalPoints, points);
  assert.equal(stats.solvedCount, 4);
  assert.equal(
    (await app.locals.store.lifetimeTotals([registered.body.user.id]))[0]
      .totalPoints,
    points,
  );
});
