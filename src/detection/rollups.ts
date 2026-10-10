import { run } from '../database/db';
import { getSettingNumber } from '../database/settingsRepo';
import { getSystemExclusions } from '../database/trackedAppsRepo';
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
 *
 * The home launcher / System UI / Azm are excluded here even though
 * saveSessions() already keeps them out of `sessions` going forward — this is
 * what actually cleans rollups built before that fix existed, without
 * deleting the raw session rows themselves.
 *
 * @param dates  When given, only these local_dates are rebuilt — used after a
 *   checkpointed ingest, which knows exactly which days its batch touched, so
 *   a routine catch-up doesn't rescan the entire sessions history every time.
 *   Omitted entirely (not just empty), the full table is rebuilt.
 */
export function refreshRollups(dates?: string[]): void {
  const lateHour =
    getSettingNumber('late_night_start_hour') ?? DEFAULT_LATE_NIGHT_HOUR;
  const excluded = [...getSystemExclusions()];

  // Deletes any rows already rolled up for an excluded package before this
  // fix existed — the INSERT...SELECT below only updates rows it still
  // produces, so a stale row for e.g. the launcher would otherwise never go
  // away on its own. Unscoped by date: it's a one-time historical cleanup,
  // cheap, and a no-op once already clean.
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