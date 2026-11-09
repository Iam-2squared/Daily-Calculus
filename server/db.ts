import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

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
    CREATE TRIGGER IF NOT EXISTS lifetime_user_delete AFTER DELETE ON users
    BEGIN
      UPDATE lifetime_totals SET deleted=1 WHERE user_id=OLD.id;
    END;
    COMMIT;
  `);
  return db;
}
export type Database = ReturnType<typeof openDatabase>;
