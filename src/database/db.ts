import { open, type DB } from '@op-engineering/op-sqlite';
import { SCHEMA_STATEMENTS, SCHEMA_VERSION } from './schema';

const DB_NAME = 'azm.db';

let db: DB | null = null;

/** Opens (once) and returns the singleton database connection. */
export function getDb(): DB {
  if (!db) {
    db = open({ name: DB_NAME });
  }
  return db;
}

/**
 * Normalizes an op-sqlite result into a plain array of row objects.
 * Different op-sqlite versions have returned `rows` either as a plain array or
 * as `{ _array }`; this handles both so the rest of the code never cares.
 */
export function rowsOf<T = any>(result: any): T[] {
  const r = result?.rows;
  if (!r) return [];
  if (Array.isArray(r)) return r as T[];
  if (Array.isArray(r._array)) return r._array as T[];
  return [];
}

/** Runs a query and returns typed rows. */
export function query<T = any>(sql: string, params: any[] = []): T[] {
  return rowsOf<T>(getDb().execute(sql, params));
}

/** Runs a write statement and returns the number of rows affected. */
export function run(sql: string, params: any[] = []): number {
  const result: any = getDb().execute(sql, params);
  return result?.rowsAffected ?? 0;
}

/**
 * Runs `work` inside a single transaction. Any throw rolls the whole thing
 * back, so a partially-ingested batch never lands in the database.
 */
export function transaction<T>(work: () => T): T {
  const database = getDb();
  database.execute('BEGIN');
  try {
    const out = work();
    database.execute('COMMIT');
    return out;
  } catch (e) {
    database.execute('ROLLBACK');
    throw e;
  }
}

/**
 * Creates the schema if needed and applies migrations. Uses SQLite's
 * PRAGMA user_version as the migration marker: if the stored version is behind
 * SCHEMA_VERSION, the DDL runs and the version is bumped. Safe to call on every
 * app start — it's a no-op once the database is current.
 */
export function initDatabase(): void {
  const database = getDb();

  database.execute('PRAGMA journal_mode = WAL'); // better concurrent read/write
  database.execute('PRAGMA foreign_keys = ON');

  const current =
    (rowsOf<{ user_version: number }>(database.execute('PRAGMA user_version'))[0]
      ?.user_version) ?? 0;

  if (current < SCHEMA_VERSION) {
    transaction(() => {
      for (const stmt of SCHEMA_STATEMENTS) {
        database.execute(stmt);
      }
      // PRAGMA can't be parameterized; SCHEMA_VERSION is a trusted integer.
      database.execute(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    });
  }
}