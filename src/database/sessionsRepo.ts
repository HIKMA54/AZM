import { AppSession } from '../services/usageTypes';
import { toLocalDate, hourOfDay } from '../utils/datetime';
import { query, run, transaction } from './db';
import { SessionRow } from './schema';

/**
 * Persists reconstructed sessions. Uses INSERT OR IGNORE against the unique
 * (package_name, start_time) index so re-querying an overlapping time window
 * never creates duplicate rows — the same open is only ever stored once.
 * Returns how many rows were newly inserted.
 */
export function saveSessions(sessions: AppSession[]): number {
  if (sessions.length === 0) return 0;

  const now = Date.now();
  return transaction(() => {
    let inserted = 0;
    for (const s of sessions) {
      inserted += run(
        `INSERT OR IGNORE INTO sessions
           (package_name, start_time, end_time, duration_ms, was_open, local_date, hour_of_day, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          s.packageName,
          s.start,
          s.end,
          s.durationMs,
          s.open ? 1 : 0,
          toLocalDate(s.start),
          hourOfDay(s.start),
          now,
        ],
      );
    }
    return inserted;
  });
}

/** Total number of sessions stored. */
export function getSessionCount(): number {
  const rows = query<{ n: number }>('SELECT COUNT(*) AS n FROM sessions');
  return rows[0]?.n ?? 0;
}

/** All sessions for a given local date, earliest first. */
export function getSessionsForDate(localDate: string): SessionRow[] {
  return query<SessionRow>(
    'SELECT * FROM sessions WHERE local_date = ? ORDER BY start_time ASC',
    [localDate],
  );
}

/** Number of opens (sessions) for one app on one local date. */
export function getOpensForApp(packageName: string, localDate: string): number {
  const rows = query<{ n: number }>(
    'SELECT COUNT(*) AS n FROM sessions WHERE package_name = ? AND local_date = ?',
    [packageName, localDate],
  );
  return rows[0]?.n ?? 0;
}