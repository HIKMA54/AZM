import { open, type DB } from '@op-engineering/op-sqlite';
import { SCHEMA_STATEMENTS, SCHEMA_VERSION } from './schema';

const DB_NAME = 'azm.db';

let db: DB | null = null;

export function getDb(): DB {
  if (!db) {
    db = open({ name: DB_NAME });
  }
  return db;
}

export function rowsOf<T = any>(result: any): T[] {
  return result?.rows ?? [];
}

export function query<T = any>(sql: string, params: any[] = []): T[] {
  return rowsOf<T>(getDb().executeSync(sql, params));
}

/** Returns rows affected. */
export function run(sql: string, params: any[] = []): number {
  const result = getDb().executeSync(sql, params);
  return result?.rowsAffected ?? 0;
}

export function transaction<T>(work: () => T): T {
  const database = getDb();
  database.executeSync('BEGIN');
  try {
    const out = work();
    database.executeSync('COMMIT');
    return out;
  } catch (e) {
    database.executeSync('ROLLBACK');
    throw e;
  }
}

/** Applies the schema when PRAGMA user_version is behind SCHEMA_VERSION. */
export function initDatabase(): void {
  const database = getDb();

  database.executeSync('PRAGMA journal_mode = WAL');
  database.executeSync('PRAGMA foreign_keys = ON');

  const current =
    (rowsOf<{ user_version: number }>(database.executeSync('PRAGMA user_version'))[0]
      ?.user_version) ?? 0;

  if (current < SCHEMA_VERSION) {
    transaction(() => {
      for (const stmt of SCHEMA_STATEMENTS) {
        database.executeSync(stmt);
      }
      // PRAGMA can't be parameterized; SCHEMA_VERSION is a trusted integer.
      database.executeSync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    });
  }
}