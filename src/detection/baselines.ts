import { query, run } from '../database/db';
import { AppBaselineRow } from '../database/schema';
import { getSystemExclusions } from '../database/trackedAppsRepo';
import { toLocalDate } from '../utils/datetime';
import { BASELINE_WINDOW_DAYS, LEARNING_PHASE_DAYS } from './detectionConfig';

function dateNDaysAgo(now: number, n: number): string {
  return toLocalDate(now - n * 24 * 60 * 60 * 1000);
}

/**
 * Recomputes baselines from daily_rollups over the trailing window. Today is
 * left out because it's a partial day.
 *
 *   avg_opens_day  = mean daily opens
 *   avg_session_ms = total time / total opens
 *   avg_daily_ms   = mean daily total time
 *   sample_days    = days contributing
 */
export function refreshBaselines(now: number = Date.now()): void {
  const windowStart = dateNDaysAgo(now, BASELINE_WINDOW_DAYS);
  const todayStr = toLocalDate(now);

  // The upsert below never touches excluded packages, so clear them first.
  const excluded = [...getSystemExclusions()];
  if (excluded.length > 0) {
    run(
      `DELETE FROM app_baselines WHERE package_name IN (${excluded.map(() => '?').join(',')})`,
      excluded,
    );
  }

  const rows = query<{
    package_name: string;
    avg_opens_day: number | null;
    avg_session_ms: number | null;
    avg_daily_ms: number | null;
    sample_days: number | null;
  }>(
    `SELECT
       package_name,
       AVG(opens_count) AS avg_opens_day,
       CASE WHEN SUM(opens_count) > 0
            THEN CAST(SUM(total_ms) AS REAL) / SUM(opens_count)
            ELSE 0 END AS avg_session_ms,
       AVG(total_ms) AS avg_daily_ms,
       COUNT(DISTINCT local_date) AS sample_days
     FROM daily_rollups
     WHERE local_date >= ? AND local_date < ?
     GROUP BY package_name`,
    [windowStart, todayStr],
  );

  const ts = Date.now();
  for (const r of rows) {
    run(
      `INSERT INTO app_baselines
         (package_name, avg_opens_day, avg_session_ms, avg_daily_ms, sample_days, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(package_name) DO UPDATE SET
         avg_opens_day  = excluded.avg_opens_day,
         avg_session_ms = excluded.avg_session_ms,
         avg_daily_ms   = excluded.avg_daily_ms,
         sample_days    = excluded.sample_days,
         updated_at     = excluded.updated_at`,
      [
        r.package_name,
        r.avg_opens_day ?? 0,
        r.avg_session_ms ?? 0,
        r.avg_daily_ms ?? 0,
        r.sample_days ?? 0,
        ts,
      ],
    );
  }
}

export function getBaseline(packageName: string): AppBaselineRow | null {
  const rows = query<AppBaselineRow>(
    'SELECT * FROM app_baselines WHERE package_name = ?',
    [packageName],
  );
  return rows[0] ?? null;
}

/** Days counted are distinct dates with any session data. */
export function getLearningPhase(): { active: boolean; day: number; of: number } {
  const days =
    query<{ n: number }>(
      'SELECT COUNT(DISTINCT local_date) AS n FROM sessions',
    )[0]?.n ?? 0;

  return {
    active: days < LEARNING_PHASE_DAYS,
    day: Math.min(days, LEARNING_PHASE_DAYS),
    of: LEARNING_PHASE_DAYS,
  };
}