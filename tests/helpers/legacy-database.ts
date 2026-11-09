import { DatabaseSync } from "node:sqlite";

/** Seed pre-ledger history before the current schema and financial guards install. */
export function createLegacyDatabase<T>(
  path: string,
  seed: (db: DatabaseSync) => T,
): T {
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,username_key TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,created_at TEXT NOT NULL
      );
      CREATE TABLE solves (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        problem_id TEXT NOT NULL,level TEXT NOT NULL CHECK(level IN ('basic','applied','advanced')),
        points INTEGER NOT NULL CHECK(points IN(0,1,3,5)),
        solved_at TEXT NOT NULL,solved_date TEXT NOT NULL,
        PRIMARY KEY(user_id,problem_id)
      );
      CREATE TABLE wrong_attempts (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        problem_id TEXT NOT NULL,wrong_date TEXT NOT NULL,
        PRIMARY KEY(user_id,problem_id,wrong_date)
      );
    `);
    return seed(db);
  } finally {
    db.close();
  }
}
