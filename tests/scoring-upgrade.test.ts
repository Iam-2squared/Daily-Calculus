import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, type SolveInput } from "../server/store.js";

test("upgrading the old SQLite points CHECK preserves void receipts, triggers and gross lifetime before recovery awards", async () => {
  const directory = mkdtempSync(join(tmpdir(), "calculus-scoring-upgrade-"));
  const path = join(directory, "old.sqlite");
  let store: SqliteStore | undefined;
  try {
    const old = new DatabaseSync(path);
    let dependentSql: { name: string; sql: string }[];
    let oldSolve: Record<string, unknown>[];
    let oldVoid: Record<string, unknown>[];
    try {
      old.exec(`
        PRAGMA foreign_keys=ON;
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE solves (
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          problem_id TEXT NOT NULL,
          level TEXT NOT NULL CHECK(level IN ('basic','applied','advanced')),
          points INTEGER NOT NULL CHECK(points IN (1,3,5)),
          solved_at TEXT NOT NULL, solved_date TEXT NOT NULL,
          PRIMARY KEY(user_id,problem_id)
        );
        CREATE INDEX solves_date ON solves(solved_date,user_id);
        CREATE INDEX original_paid_receipts ON solves(user_id,solved_date) WHERE points>0;
        CREATE TABLE lifetime_totals (
          user_id INTEGER PRIMARY KEY CHECK(user_id BETWEEN 1 AND 2147483647),
          total_points INTEGER NOT NULL DEFAULT 0 CHECK(total_points BETWEEN 0 AND 1000000000),
          deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1))
        );
        CREATE TABLE scoring_voids (
          user_id INTEGER NOT NULL, problem_id TEXT NOT NULL,
          original_points INTEGER NOT NULL CHECK(original_points IN (1,3,5)),
          reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 200),
          voided_at TEXT NOT NULL,
          PRIMARY KEY(user_id,problem_id),
          FOREIGN KEY(user_id,problem_id) REFERENCES solves(user_id,problem_id) ON DELETE CASCADE
        );
        CREATE TABLE scoring_state (
          user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          mistakes INTEGER NOT NULL DEFAULT 0 CHECK(mistakes BETWEEN 0 AND 2),
          correct_streak INTEGER NOT NULL DEFAULT 0 CHECK(correct_streak BETWEEN 0 AND 2),
          CHECK(mistakes=2 OR correct_streak=0)
        );
        CREATE TABLE insertion_audit (
          id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL,
          problem_id TEXT NOT NULL, points INTEGER NOT NULL
        );
        CREATE TRIGGER lifetime_solve_insert AFTER INSERT ON solves
        BEGIN
          UPDATE lifetime_totals SET total_points=total_points+NEW.points
            WHERE user_id=NEW.user_id AND deleted=0;
          SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'Missing lifetime source') END;
        END;
        CREATE TRIGGER original_insert_audit AFTER INSERT ON solves
        BEGIN
          INSERT INTO insertion_audit(user_id,problem_id,points)
            VALUES(NEW.user_id,NEW.problem_id,NEW.points);
        END;
        INSERT INTO users VALUES(1,'upgrade_user','upgrade_user','hash','salt','2026-11-09T00:00:00Z');
        INSERT INTO lifetime_totals VALUES(1,0,0);
        INSERT INTO solves VALUES(1,'old_paid_receipt','basic',1,'2026-11-09T01:00:00Z','2026-11-09');
        INSERT INTO scoring_voids VALUES(1,'old_paid_receipt',1,'approved correction','2026-11-09T02:00:00Z');
        INSERT INTO scoring_state VALUES(1,2,1);
      `);
      dependentSql = old.prepare(
        "SELECT name,sql FROM sqlite_schema WHERE tbl_name='solves' AND type IN ('index','trigger') AND sql IS NOT NULL ORDER BY name",
      ).all() as unknown as { name: string; sql: string }[];
      oldSolve = old.prepare("SELECT * FROM solves").all();
      oldVoid = old.prepare("SELECT * FROM scoring_voids").all();
      assert.equal(old.prepare("SELECT total_points FROM lifetime_totals WHERE user_id=1").get()!.total_points, 1);
      assert.throws(() => old.prepare("INSERT INTO solves VALUES(1,'not_yet_allowed','basic',0,'2026-11-09','2026-11-09')").run(), /CHECK constraint failed/);
    } finally {
      old.close();
    }

    store = new SqliteStore(path);
    assert.deepEqual(store.db.prepare("SELECT * FROM solves").all(), oldSolve);
    assert.deepEqual(store.db.prepare("SELECT * FROM scoring_voids").all(), oldVoid);
    assert.deepEqual({ ...store.db.prepare("SELECT mistakes,correct_streak FROM scoring_state WHERE user_id=1").get() }, { mistakes: 2, correct_streak: 1 });
    for (const object of dependentSql) {
      assert.equal(store.db.prepare("SELECT sql FROM sqlite_schema WHERE name=?").get(object.name)!.sql, object.sql, `${object.name} must retain its original SQL`);
    }
    assert.equal(store.db.prepare("SELECT count(*) n FROM insertion_audit").get()!.n, 1, "copying existing solves must not fire their INSERT triggers");
    assert.deepEqual(await store.lifetimeTotals([1]), [{ userId: 1, totalPoints: 1, known: true, deleted: false }]);
    const stats = await store.stats(1, "2026-11-09", "2026-11-09");
    assert.equal(stats.totalPoints, 0);
    assert.equal(stats.solvedCount, 1);
    assert.deepEqual(stats.solvedIds, ["old_paid_receipt"]);
    assert.deepEqual(stats.scoring, { mistakes: 2, correctStreak: 1, requiredCorrectStreak: 3, locked: true });
    assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(store.db.prepare("PRAGMA foreign_keys").get()!.foreign_keys, 1);

    const input: SolveInput = {
      userId: 1, problemId: "old_paid_receipt", level: "basic", points: 1,
      solvedAt: "2026-11-09T03:00:00Z", date: "2026-11-09", correct: true,
    };
    const replay = await store.recordSolve(input);
    assert.equal(replay.alreadySolved, true);
    assert.equal(replay.pointsEarned, 0);
    assert.equal(replay.scoring.correctStreak, 1, "voided solved IDs cannot advance recovery");

    const blocked = await store.recordSolve({ ...input, problemId: "second_recovery_correct", level: "advanced", points: 5 });
    assert.equal(blocked.awardBlocked, true);
    assert.equal(blocked.pointsEarned, 0);
    assert.deepEqual(blocked.scoring, { mistakes: 2, correctStreak: 2, requiredCorrectStreak: 3, locked: true });
    assert.equal(store.db.prepare("SELECT points FROM solves WHERE problem_id='second_recovery_correct'").get()!.points, 0);
    assert.equal((await store.lifetimeTotals([1]))[0].totalPoints, 1, "a blocked correct answer must not mint gross lifetime income");

    const recovered = await store.recordSolve({ ...input, problemId: "third_recovery_correct", level: "advanced", points: 5 });
    assert.equal(recovered.awardBlocked, false);
    assert.equal(recovered.pointsEarned, 5);
    assert.deepEqual(recovered.scoring, { mistakes: 0, correctStreak: 0, requiredCorrectStreak: 3, locked: false });
    assert.equal((await store.lifetimeTotals([1]))[0].totalPoints, 6);
    assert.equal((await store.stats(1, "2026-11-09", "2026-11-09")).totalPoints, 5);
    assert.equal(store.db.prepare("SELECT count(*) n FROM insertion_audit").get()!.n, 3, "restored triggers must still observe future inserts exactly once");
    assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(), []);

    const beforeReopen = {
      schemaVersion: store.db.prepare("PRAGMA schema_version").get()!.schema_version,
      solves: store.db.prepare("SELECT * FROM solves ORDER BY problem_id").all(),
      voids: store.db.prepare("SELECT * FROM scoring_voids").all(),
      audit: store.db.prepare("SELECT * FROM insertion_audit ORDER BY id").all(),
      lifetime: await store.lifetimeTotals([1]),
    };
    store.db.close();
    store = undefined;
    store = new SqliteStore(path);
    assert.equal(store.db.prepare("PRAGMA schema_version").get()!.schema_version, beforeReopen.schemaVersion, "reopening an upgraded schema must not repeat the rebuild");
    assert.deepEqual(store.db.prepare("SELECT * FROM solves ORDER BY problem_id").all(), beforeReopen.solves);
    assert.deepEqual(store.db.prepare("SELECT * FROM scoring_voids").all(), beforeReopen.voids);
    assert.deepEqual(store.db.prepare("SELECT * FROM insertion_audit ORDER BY id").all(), beforeReopen.audit);
    assert.deepEqual(await store.lifetimeTotals([1]), beforeReopen.lifetime);
    assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(store.db.prepare("PRAGMA foreign_keys").get()!.foreign_keys, 1);
  } finally {
    store?.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
