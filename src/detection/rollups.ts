import { run } from '../database/db';
import { getSettingNumber } from '../database/settingsRepo';
import { DEFAULT_LATE_NIGHT_HOUR } from './detectionConfig';

/**
 * Rebuilds the daily_rollups table from raw sessions in a single pass.
 *
 * Rollups are per-app-per-day aggregates (opens, total time, late-night time,
 * first/last open) so the Insights charts and baseline computation never have
 * to rescan every session. Data volume is small (one person's usage), so a full
 * rebuild each run is simpler and less error-prone than incremental updates and
 * still cheap. late_night_ms attributes a session's whole duration by its start
 * hour — a documented simplification: a session that begins at/after the
 * late-night hour counts as late-night use.
 */
export function refreshRollups(): void {
  const lateHour =
    getSettingNumber('late_night_start_hour') ?? DEFAULT_LATE_NIGHT_HOUR;

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
     GROUP BY local_date, package_name
     ON CONFLICT(local_date, package_name) DO UPDATE SET
       opens_count   = excluded.opens_count,
       total_ms      = excluded.total_ms,
       late_night_ms = excluded.late_night_ms,
       first_open    = excluded.first_open,
       last_open     = excluded.last_open,
       updated_at    = excluded.updated_at`,
    [lateHour, Date.now()],
  );
}