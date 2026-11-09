import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  questionFingerprint,
  regenerateHistoricalProblem,
} from "./question-identity.js";

function allowZeroPointSolves(db: DatabaseSync) {
  const table = db
    .prepare(
      "SELECT sql FROM sqlite_schema WHERE type='table' AND name='solves'",
    )
    .get();
  if (
    !table ||
    !/CHECK\s*\(\s*points\s+IN\s*\(\s*1\s*,\s*3\s*,\s*5\s*\)\s*\)/i.test(
      String(table.sql),
    )
  )
    return;
  // SQLite cannot alter a CHECK in place. Keep all receipts, dependent voids,
  // indexes and existing INSERT triggers; copying must not mint lifetime income.
  const dependent = db
    .prepare(
      "SELECT sql FROM sqlite_schema WHERE tbl_name='solves' AND type IN ('index','trigger') AND sql IS NOT NULL ORDER BY type,name",
    )
    .all()
    .map((row) => String(row.sql));
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE solves_gate_upgrade (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        problem_id TEXT NOT NULL,
        level TEXT NOT NULL CHECK(level IN ('basic','applied','advanced')),
        points INTEGER NOT NULL CHECK(points IN (0,1,3,5)),
        solved_at TEXT NOT NULL,
        solved_date TEXT NOT NULL,
        PRIMARY KEY (user_id, problem_id)
      );
      INSERT INTO solves_gate_upgrade SELECT user_id,problem_id,level,points,solved_at,solved_date FROM solves;
      DROP TABLE solves;
      ALTER TABLE solves_gate_upgrade RENAME TO solves;
    `);
    for (const sql of dependent) db.exec(sql);
    if (db.prepare("PRAGMA foreign_key_check").all().length)
      throw new Error("Solve migration foreign key check failed.");
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* Preserve the original migration error. */
    }
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

export function openDatabase(path: string) {
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      username_key TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS auth_attempts (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auth_attempts_expiry ON auth_attempts(expires_at);
    CREATE TABLE IF NOT EXISTS solves (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      problem_id TEXT NOT NULL,
      level TEXT NOT NULL CHECK(level IN ('basic','applied','advanced')),
      points INTEGER NOT NULL CHECK(points IN (0,1,3,5)),
      solved_at TEXT NOT NULL,
      solved_date TEXT NOT NULL,
      PRIMARY KEY (user_id, problem_id)
    );
    CREATE INDEX IF NOT EXISTS solves_date ON solves(solved_date, user_id);
  `);
  const awardGuard = db
    .prepare(
      "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name='solve_award_upgrade_guard'",
    )
    .get();
  const replaceAwardGuard =
    awardGuard &&
    !String(awardGuard.sql).includes("Solve award receipts are final");
  allowZeroPointSolves(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS scoring_voids (
      user_id INTEGER NOT NULL,
      problem_id TEXT NOT NULL,
      original_points INTEGER NOT NULL CHECK(original_points IN (1,3,5)),
      reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 200),
      voided_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY(user_id,problem_id),
      FOREIGN KEY(user_id,problem_id) REFERENCES solves(user_id,problem_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS scoring_state (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      mistakes INTEGER NOT NULL DEFAULT 0 CHECK(mistakes BETWEEN 0 AND 2),
      correct_streak INTEGER NOT NULL DEFAULT 0 CHECK(correct_streak BETWEEN 0 AND 2),
      CHECK(mistakes=2 OR correct_streak=0)
    );
    CREATE TABLE IF NOT EXISTS scoring_control (
      singleton INTEGER PRIMARY KEY CHECK(singleton=1),
      paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0,1)),
      frozen_at TEXT
    );
    INSERT INTO scoring_control(singleton,paused,frozen_at) VALUES(1,0,NULL)
      ON CONFLICT(singleton) DO NOTHING;
    CREATE TABLE IF NOT EXISTS wrong_attempts (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      problem_id TEXT NOT NULL,
      wrong_date TEXT NOT NULL,
      PRIMARY KEY(user_id,problem_id,wrong_date)
    );
    CREATE INDEX IF NOT EXISTS wrong_attempts_date ON wrong_attempts(wrong_date,user_id);
    CREATE TABLE IF NOT EXISTS solve_awards (
      user_id INTEGER NOT NULL,
      problem_id TEXT NOT NULL,
      pending INTEGER NOT NULL DEFAULT 0 CHECK(pending IN (0,1)),
      award_date TEXT,
      awarded_at TEXT,
      PRIMARY KEY(user_id,problem_id),
      FOREIGN KEY(user_id,problem_id) REFERENCES solves(user_id,problem_id) ON DELETE CASCADE,
      CHECK((award_date IS NULL)=(awarded_at IS NULL)),
      CHECK(pending=0 OR award_date IS NULL)
    );
    CREATE INDEX IF NOT EXISTS solve_awards_date ON solve_awards(award_date,user_id);
    CREATE TABLE IF NOT EXISTS problem_fingerprints (
      problem_id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64 AND fingerprint NOT GLOB '*[^0-9a-f]*')
    );
    CREATE TABLE IF NOT EXISTS content_receipts (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64 AND fingerprint NOT GLOB '*[^0-9a-f]*'),
      first_problem_id TEXT NOT NULL REFERENCES problem_fingerprints(problem_id),
      first_seen_date TEXT NOT NULL,
      PRIMARY KEY(user_id,fingerprint)
    );
    CREATE TABLE IF NOT EXISTS content_guard (
      singleton INTEGER PRIMARY KEY CHECK(singleton=1),
      enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1))
    );
    INSERT INTO content_guard(singleton,enabled) VALUES(1,0) ON CONFLICT(singleton) DO NOTHING;
  `);
  // The source watermark is independent of account/solve deletion. Only the
  // opaque, never-reused numeric ID and earned total survive account deletion.
  // Serialize installation/backfill with writers so an in-flight solve cannot
  // be counted both by the backfill and the new INSERT trigger.
  db.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS lifetime_totals (
      user_id INTEGER PRIMARY KEY CHECK(user_id BETWEEN 1 AND 2147483647),
      total_points INTEGER NOT NULL DEFAULT 0
        CHECK(total_points BETWEEN 0 AND 1000000000),
      deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1))
    );
    INSERT INTO lifetime_totals(user_id,total_points,deleted)
      SELECT u.id,COALESCE(SUM(s.points),0),0
      FROM users u LEFT JOIN solves s ON s.user_id=u.id GROUP BY u.id
      ON CONFLICT(user_id) DO NOTHING;
    INSERT INTO solve_awards(user_id,problem_id,pending,award_date,awarded_at)
      SELECT user_id,problem_id,0,solved_date,solved_at FROM solves WHERE points>0
      ON CONFLICT(user_id,problem_id) DO NOTHING;
    CREATE TRIGGER IF NOT EXISTS lifetime_user_insert AFTER INSERT ON users
    BEGIN
      INSERT INTO lifetime_totals(user_id,total_points,deleted)
        VALUES(NEW.id,0,0);
    END;
    CREATE TRIGGER IF NOT EXISTS lifetime_solve_insert AFTER INSERT ON solves
    BEGIN
      UPDATE lifetime_totals SET total_points=total_points+NEW.points
        WHERE user_id=NEW.user_id AND deleted=0;
      SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'Missing lifetime source') END;
    END;
    DROP TRIGGER IF EXISTS lifetime_solve_upgrade;
    ${replaceAwardGuard ? "DROP TRIGGER solve_award_upgrade_guard;" : ""}
    CREATE TRIGGER IF NOT EXISTS solve_award_upgrade_guard BEFORE UPDATE OF points ON solves
    WHEN NEW.points<>OLD.points
    BEGIN
      SELECT RAISE(ABORT,'Solve award receipts are final');
    END;
    CREATE TRIGGER IF NOT EXISTS lifetime_user_delete AFTER DELETE ON users
    BEGIN
      UPDATE lifetime_totals SET deleted=1 WHERE user_id=OLD.id;
    END;
    COMMIT;
  `);
  // Existing correct and wrong attempts reserve their mathematical identity.
  // Reconstruct trusted legacy IDs directly, without expired timed-run tokens.
  db.exec("BEGIN IMMEDIATE");
  try {
    const known = db.prepare(
      "SELECT fingerprint FROM problem_fingerprints WHERE problem_id=?",
    );
    const insertMapping = db.prepare(
      "INSERT INTO problem_fingerprints(problem_id,fingerprint) VALUES(?,?) ON CONFLICT(problem_id) DO NOTHING",
    );
    const insertClaim = db.prepare(`
      INSERT INTO content_receipts(user_id,fingerprint,first_problem_id,first_seen_date) VALUES(?,?,?,?)
      ON CONFLICT(user_id,fingerprint) DO UPDATE SET first_problem_id=excluded.first_problem_id,first_seen_date=excluded.first_seen_date
      WHERE excluded.first_seen_date<content_receipts.first_seen_date
        OR (excluded.first_seen_date=content_receipts.first_seen_date AND excluded.first_problem_id<content_receipts.first_problem_id)
    `);
    for (const row of db
      .prepare(
        `
      SELECT user_id,problem_id,solved_date AS first_date FROM solves
      UNION ALL SELECT user_id,problem_id,wrong_date AS first_date FROM wrong_attempts
      ORDER BY first_date,problem_id
    `,
      )
      .all()) {
      const id = String(row.problem_id);
      let fingerprint = known.get(id)?.fingerprint as string | undefined;
      if (!fingerprint) {
        const problem = regenerateHistoricalProblem(id);
        // Hand-entered, non-question IDs from older local fixtures have no
        // recoverable mathematics. They retain their original final receipt.
        if (!problem) continue;
        fingerprint = questionFingerprint(problem);
        insertMapping.run(id, fingerprint);
      }
      insertClaim.run(row.user_id, fingerprint, id, row.first_date);
    }
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* Preserve the original identity migration error. */
    }
    db.close();
    throw error;
  }
  return db;
}
export type Database = ReturnType<typeof openDatabase>;
