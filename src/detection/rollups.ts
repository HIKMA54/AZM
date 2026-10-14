import { run } from '../database/db';
import { getSettingNumber } from '../database/settingsRepo';
import { getSystemExclusions } from '../database/trackedAppsRepo';
import { DEFAULT_LATE_NIGHT_HOUR } from './detectionConfig';

/**
 * Rebuilds daily_rollups from sessions. A session counts entirely as
 * late-night if it starts at or after the late-night hour.
 *
 * @param dates  Only rebuild these local dates. Omit to rebuild everything.
 */
export function refreshRollups(dates?: string[]): void {
  const lateHour =
    getSettingNumber('late_night_start_hour') ?? DEFAULT_LATE_NIGHT_HOUR;
  const excluded = [...getSystemExclusions()];

  // Older builds rolled up the launcher; the upsert below would never remove
  // those rows on its own.
  if (excluded.length > 0) {
    run(
      `DELETE FROM daily_rollups WHERE package_name IN (${excluded.map(() => '?').join(',')})`,
      excluded,
    );
  }

  const clauses: string[] = [];
  const clauseParams: (string | number)[] = [];
  if (excluded.length > 0) {
    clauses.push(`package_name NOT IN (${excluded.map(() => '?').join(',')})`);
    clauseParams.push(...excluded);
  }
  if (dates && dates.length > 0) {
    clauses.push(`local_date IN (${dates.map(() => '?').join(',')})`);
    clauseParams.push(...dates);
  }
  const whereSQL = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  run(
    `INSERT INTO daily_rollups
       (local_date, package_name, opens_count, total_ms, late_night_ms, first_open, last_open, updated_at)
     SELECT
       local_date,
       package_name,
       COUNT(*),
       SUM(duration_ms),
       SUM(CASE WHEN hour_of_day >= ? THEN duration_ms ELSE 0 END),
       MIN(start_time),
       MAX(start_time),
       ?
     FROM sessions
     ${whereSQL}
     GROUP BY local_date, package_name
     ON CONFLICT(local_date, package_name) DO UPDATE SET
       opens_count   = excluded.opens_count,
       total_ms      = excluded.total_ms,
       late_night_ms = excluded.late_night_ms,
       first_open    = excluded.first_open,
       last_open     = excluded.last_open,
       updated_at    = excluded.updated_at`,
    [lateHour, Date.now(), ...clauseParams],
  );
}