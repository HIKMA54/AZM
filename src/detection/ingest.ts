import { query, run } from '../database/db';
import { saveSessions } from '../database/sessionsRepo';
import { sessionize } from './sessionize';
import { UsageStatsService } from '../services/UsageStats';
import { toLocalDate } from '../utils/datetime';
import { MAX_INGEST_LOOKBACK_MS } from './detectionConfig';

/**
 * Single ingestion entry point, replacing the old "always query the last 24h"
 * pattern every foreground hook and the background task used to call
 * independently. That fixed window silently lost any calendar day the app
 * never ran during (killed process, disabled background service, etc.) once
 * more than 24h had passed — by the next run, those events had already aged
 * out of a fresh "now-24h" window.
 *
 * Instead this reads from a persisted checkpoint (settings.last_ingested_at)
 * forward to now, capped at MAX_INGEST_LOOKBACK_MS so a very long gap (app
 * reinstalled after weeks) still only asks the OS for a bounded window. The
 * checkpoint only advances after saveSessions() has actually returned, and
 * only forward — see advanceCheckpoint()'s SQL for why concurrent callers
 * (a foreground hook and the background task tick landing at the same time)
 * can't move it backwards or lose each other's progress.
 */
const LAST_INGESTED_KEY = 'last_ingested_at';

function getCheckpoint(): number | null {
  const raw = query<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [LAST_INGESTED_KEY],
  )[0]?.value;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Advances the checkpoint to `end`, but only if `end` is actually later than
 * whatever is currently stored. Expressed as a single atomic upsert so two
 * processes (the app's JS thread and a separately-running headless background
 * task) racing to write this can't clobber each other into going backwards —
 * whichever write lands second just becomes a no-op if it would regress.
 */
function advanceCheckpoint(end: number): void {
  run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value
     WHERE CAST(excluded.value AS INTEGER) > CAST(settings.value AS INTEGER)`,
    [LAST_INGESTED_KEY, String(end)],
  );
}

export interface IngestResult {
  /** Number of new session rows actually inserted (post dedup/exclusion). */
  inserted: number;
  /** Distinct local_date values touched by this batch, for a scoped rollup rebuild. */
  touchedDates: string[];
}

/**
 * Pulls whatever's new since the last successful ingest (capped at
 * MAX_INGEST_LOOKBACK_MS) and stores it. An empty result from the OS for part
 * or all of that window is a normal, successful outcome — not an error, and
 * nothing is fabricated to fill it. The checkpoint advances to `now` only
 * after saveSessions() returns without throwing; if queryEvents() or
 * saveSessions() throws, the checkpoint is left untouched so the same window
 * (or a larger one, next time) is retried later.
 */
export async function ingestRecentEvents(now: number = Date.now()): Promise<IngestResult> {
  const checkpoint = getCheckpoint();
  const begin = Math.max(checkpoint ?? -Infinity, now - MAX_INGEST_LOOKBACK_MS);

  if (begin >= now) {
    // Checkpoint is already at/after "now" (clock skew, or called twice in
    // the same millisecond) — nothing new to read, and nothing to advance.
    return { inserted: 0, touchedDates: [] };
  }

  const events = await UsageStatsService.queryEvents(begin, now);
  const sessions = sessionize(events, now);
  const inserted = saveSessions(sessions);

  const touchedDates = [...new Set(sessions.map(s => toLocalDate(s.start)))];

  advanceCheckpoint(now);

  return { inserted, touchedDates };
}
