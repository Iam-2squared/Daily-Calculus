import assert from "node:assert/strict";
import { test } from "node:test";
import { linkStatus } from "../server/kgs-integration.js";
import { api } from "../src/api.js";

const afterLoss = {
  linked: true, conversionRate: 10000,
  member: { id: "00000000-0000-4000-8000-000000000032", name: "連携先" },
  balance: 1000, totalIncome: 11000, calculusIncome: 90000, syncPending: false,
};

test("historical calculus earnings can exceed the shared net total after G losses", async () => {
  const original = globalThis.fetch;
  try {
    for (const value of [afterLoss, { ...afterLoss, balance: 0, totalIncome: 0 },
      { ...afterLoss, balance: 150, totalIncome: 10150 },
      { ...afterLoss, balance: 50, totalIncome: 50 }]) {
      assert.deepEqual(linkStatus(value), value);
      globalThis.fetch = async () => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
      assert.deepEqual(await api.kgsLink(), value);
      assert.deepEqual(await api.syncKgs(), value);
    }
  } finally { globalThis.fetch = original; }
});

test("shared net compatibility keeps balance and individual money bounds intact", async () => {
  const original = globalThis.fetch;
  try {
    for (const value of [
      { ...afterLoss, balance: 12000 },
      { ...afterLoss, totalIncome: -100 },
      { ...afterLoss, calculusIncome: -10000 },
      { ...afterLoss, calculusIncome: 10_000_000_010_000 },
      { ...afterLoss, balance: Number.NaN },
      { ...afterLoss, totalIncome: 10_000_000_000_001 },
      { ...afterLoss, balance: 125, totalIncome: 10125 },
      { ...afterLoss, balance: 100, totalIncome: 10150 },
      { ...afterLoss, calculusIncome: 90050 },
    ]) {
      assert.throws(() => linkStatus(value));
      globalThis.fetch = async () => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
      await assert.rejects(api.kgsLink());
    }
  } finally { globalThis.fetch = original; }
});
