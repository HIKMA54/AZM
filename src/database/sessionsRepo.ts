import { AppSession } from '../services/usageTypes';
import { toLocalDate, hourOfDay } from '../utils/datetime';
import { query, run, transaction } from './db';
import { getSystemExclusions } from './trackedAppsRepo';

/**
 * Returns the number of new rows. Duplicates are ignored via the unique
 * (package_name, start_time) index. System exclusions are dropped, but other
 * untracked apps are kept so tracking one later has history to draw on.
 */
export function saveSessions(sessions: AppSession[]): number {
  if (sessions.length === 0) return 0;

  const excluded = getSystemExclusions();
  const countable = sessions.filter(s => !excluded.has(s.packageName));
  if (countable.length === 0) return 0;

  const now = Date.now();
  return transaction(() => {
    let inserted = 0;
    for (const s of countable) {
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

export function getOpensForApp(packageName: string, localDate: string): number {
  const rows = query<{ n: number }>(
    'SELECT COUNT(*) AS n FROM sessions WHERE package_name = ? AND local_date = ?',
    [packageName, localDate],
  );
  return rows[0]?.n ?? 0;
}