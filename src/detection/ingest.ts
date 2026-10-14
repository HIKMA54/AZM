import { query, run } from '../database/db';
import { saveSessions } from '../database/sessionsRepo';
import { sessionize } from './sessionize';
import { UsageStatsService } from '../services/UsageStats';
import { toLocalDate } from '../utils/datetime';
import { MAX_INGEST_LOOKBACK_MS } from './detectionConfig';

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
 * Only moves forward. One upsert, so the app and the headless task can race
 * without either pushing the checkpoint back.
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
  inserted: number;
  /** Dates to pass to refreshRollups(). */
  touchedDates: string[];
}

/**
 * Reads events from the last checkpoint (at most MAX_INGEST_LOOKBACK_MS back)
 * to `now` and stores them. If anything throws the checkpoint stays put, so
 * the window is retried next time.
 */
export async function ingestRecentEvents(now: number = Date.now()): Promise<IngestResult> {
  const checkpoint = getCheckpoint();
  const begin = Math.max(checkpoint ?? -Infinity, now - MAX_INGEST_LOOKBACK_MS);

  if (begin >= now) {
    // Clock skew, or two calls in the same millisecond.
    return { inserted: 0, touchedDates: [] };
  }

  const events = await UsageStatsService.queryEvents(begin, now);
  const sessions = sessionize(events, now);
  const inserted = saveSessions(sessions);

  const touchedDates = [...new Set(sessions.map(s => toLocalDate(s.start)))];

  advanceCheckpoint(now);

  return { inserted, touchedDates };
}
