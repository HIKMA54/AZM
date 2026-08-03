/**
 * Azm database schema.
 *
 * Design principle: Azm stores facts, not scores. Every column is a raw or
 * plainly-derived measurement (a count, a duration, a timestamp). Nothing here
 * is an aggregated "habit score" or "attention score" — those were deliberately
 * rejected because they can't be defended without a documented computation.
 * Risk level (Low/Medium/High) is never stored; it is computed at read-time by
 * the detection engine from these facts, so every claim Azm makes traces back
 * to a row you can point at.
 *
 * Each table maps to something concrete:
 *   tracked_apps   -> the Tracked Apps picker (what Azm watches)
 *   sessions       -> the atomic unit; impulse opens, session length, time-of-day
 *   daily_rollups  -> per-app-per-day aggregates for Insights charts + baselines
 *   app_baselines  -> the "usual" each rule compares against (documented averages)
 *   interventions  -> every intervention shown + the user's response (break rate)
 *   settings       -> quiet hours, daily goal, learning-phase start, etc.
 */

/** Bump this when the schema changes; initDatabase() migrates on open. */
export const SCHEMA_VERSION = 1;

/**
 * DDL statements, one per array entry. op-sqlite executes a single statement
 * per execute() call, so the schema is split rather than run as one script.
 */
export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS tracked_apps (
     package_name TEXT PRIMARY KEY,
     app_name     TEXT NOT NULL,
     is_tracked   INTEGER NOT NULL DEFAULT 1,  -- 0/1
     added_at     INTEGER NOT NULL             -- epoch ms
   )`,

  `CREATE TABLE IF NOT EXISTS sessions (
     id           INTEGER PRIMARY KEY AUTOINCREMENT,
     package_name TEXT NOT NULL,
     start_time   INTEGER NOT NULL,             -- epoch ms (foreground)
     end_time     INTEGER NOT NULL,             -- epoch ms (background / query cap)
     duration_ms  INTEGER NOT NULL,
     was_open     INTEGER NOT NULL DEFAULT 0,   -- 0/1, still foreground at query time
     local_date   TEXT NOT NULL,                -- 'YYYY-MM-DD' device-local, for per-day grouping
     hour_of_day  INTEGER NOT NULL,             -- 0-23 device-local, for time-of-day / late-night rules
     created_at   INTEGER NOT NULL              -- epoch ms this row was written
   )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_pkg_date ON sessions(package_name, local_date)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(start_time)`,
  // A session is uniquely identified by its app + foreground timestamp. This
  // lets re-ingestion of overlapping query windows use INSERT OR IGNORE instead
  // of creating duplicates.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_unique ON sessions(package_name, start_time)`,

  `CREATE TABLE IF NOT EXISTS daily_rollups (
     local_date    TEXT NOT NULL,
     package_name  TEXT NOT NULL,
     opens_count   INTEGER NOT NULL DEFAULT 0,  -- number of sessions (opens) that day
     total_ms      INTEGER NOT NULL DEFAULT 0,  -- total foreground time that day
     late_night_ms INTEGER NOT NULL DEFAULT 0,  -- ms accrued in the late-night window
     first_open    INTEGER,                     -- epoch ms of first open that day
     last_open     INTEGER,                     -- epoch ms of last open that day
     updated_at    INTEGER NOT NULL,
     PRIMARY KEY (local_date, package_name)
   )`,

  `CREATE TABLE IF NOT EXISTS app_baselines (
     package_name   TEXT PRIMARY KEY,
     avg_opens_day  REAL NOT NULL DEFAULT 0,    -- mean daily opens over the sample window
     avg_session_ms REAL NOT NULL DEFAULT 0,    -- mean session duration
     avg_daily_ms   REAL NOT NULL DEFAULT 0,    -- mean total daily foreground time
     sample_days    INTEGER NOT NULL DEFAULT 0, -- days of data used (gates the 7-day learning phase)
     updated_at     INTEGER NOT NULL
   )`,

  `CREATE TABLE IF NOT EXISTS interventions (
     id             INTEGER PRIMARY KEY AUTOINCREMENT,
     package_name   TEXT NOT NULL,
     trigger_type   TEXT NOT NULL,              -- 'impulse_opens' | 'long_session' | 'late_night' | 'daily_goal'
     trigger_detail TEXT,                        -- JSON of the numbers that fired the rule (for the transparency screen)
     shown_at       INTEGER NOT NULL,            -- epoch ms
     response       TEXT NOT NULL DEFAULT 'no_response', -- 'accepted_break'|'kept_scrolling'|'dismissed'|'snoozed'|'no_response'
     responded_at   INTEGER                      -- epoch ms
   )`,
  `CREATE INDEX IF NOT EXISTS idx_interventions_shown ON interventions(shown_at)`,

  `CREATE TABLE IF NOT EXISTS settings (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
];

/* -------------------------------------------------------------------------- */
/* Row types — the shape each table returns when queried.                     */
/* -------------------------------------------------------------------------- */

export interface TrackedAppRow {
  package_name: string;
  app_name: string;
  is_tracked: number; // 0 | 1
  added_at: number;
}

export interface SessionRow {
  id: number;
  package_name: string;
  start_time: number;
  end_time: number;
  duration_ms: number;
  was_open: number; // 0 | 1
  local_date: string;
  hour_of_day: number;
  created_at: number;
}

export interface DailyRollupRow {
  local_date: string;
  package_name: string;
  opens_count: number;
  total_ms: number;
  late_night_ms: number;
  first_open: number | null;
  last_open: number | null;
  updated_at: number;
}

export interface AppBaselineRow {
  package_name: string;
  avg_opens_day: number;
  avg_session_ms: number;
  avg_daily_ms: number;
  sample_days: number;
  updated_at: number;
}

export type InterventionTrigger =
  | 'impulse_opens'
  | 'long_session'
  | 'late_night'
  | 'daily_goal';

export type InterventionResponse =
  | 'accepted_break'
  | 'kept_scrolling'
  | 'dismissed'
  | 'snoozed'
  | 'no_response';

export interface InterventionRow {
  id: number;
  package_name: string;
  trigger_type: InterventionTrigger;
  trigger_detail: string | null;
  shown_at: number;
  response: InterventionResponse;
  responded_at: number | null;
}