import { query, run } from '../database/db';
import { InterventionTrigger, InterventionResponse } from '../database/schema';
import { startOfLocalDay } from '../utils/datetime';

export function logIntervention(
  trigger: InterventionTrigger,
  packageName: string | null,
  detail: Record<string, any>,
  now: number = Date.now(),
): number {
  run(
    `INSERT INTO interventions (package_name, trigger_type, trigger_detail, shown_at, response)
     VALUES (?, ?, ?, ?, 'no_response')`,
    [packageName ?? '*', trigger, JSON.stringify(detail), now],
  );
  return query<{ id: number }>('SELECT last_insert_rowid() AS id')[0]?.id ?? -1;
}

export function recordResponse(
  id: number,
  response: InterventionResponse,
  now: number = Date.now(),
): void {
  run('UPDATE interventions SET response = ?, responded_at = ? WHERE id = ?', [
    response,
    now,
    id,
  ]);
}

export function getLastInterventionTime(): number | null {
  return (
    query<{ t: number }>('SELECT MAX(shown_at) AS t FROM interventions')[0]?.t ??
    null
  );
}

export function getLastResponse(): InterventionResponse | null {
  const rows = query<{ response: InterventionResponse }>(
    'SELECT response FROM interventions ORDER BY shown_at DESC LIMIT 1',
  );
  return rows[0]?.response ?? null;
}

export function countInterventionsSince(sinceMs: number): number {
  return (
    query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM interventions WHERE shown_at >= ?',
      [sinceMs],
    )[0]?.n ?? 0
  );
}

export function countInterventionsToday(now: number = Date.now()): number {
  return countInterventionsSince(startOfLocalDay(now));
}

/** Interventions shown in [fromMs, toMs). */
export function countInterventionsBetween(fromMs: number, toMs: number): number {
  return (
    query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM interventions WHERE shown_at >= ? AND shown_at < ?',
      [fromMs, toMs],
    )[0]?.n ?? 0
  );
}

export interface PendingIntervention {
  id: number;
  packageName: string | null;
  trigger: InterventionTrigger;
  detail: Record<string, number>;
  shownAt: number;
}

export function getPendingIntervention(sinceMs: number): PendingIntervention | null {
  const row = query<{
    id: number;
    package_name: string;
    trigger_type: InterventionTrigger;
    trigger_detail: string | null;
    shown_at: number;
  }>(
    `SELECT id, package_name, trigger_type, trigger_detail, shown_at FROM interventions
     WHERE response = 'no_response' AND shown_at >= ?
     ORDER BY shown_at DESC LIMIT 1`,
    [sinceMs],
  )[0];
  if (!row) return null;

  let detail: Record<string, number> = {};
  try {
    detail = row.trigger_detail ? JSON.parse(row.trigger_detail) : {};
  } catch {
    // Keep an empty detail; the copy falls back to generic wording.
  }
  return {
    id: row.id,
    // logIntervention stores '*' for aggregate rules with no single app.
    packageName: row.package_name === '*' ? null : row.package_name,
    trigger: row.trigger_type,
    detail,
    shownAt: row.shown_at,
  };
}

/** Counts only accepted_break and kept_scrolling; snoozes etc. are ignored. */
export function getBreakAcceptanceStats(): {
  total: number;
  accepted: number;
  rate: number;
} {
  const total =
    query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM interventions
       WHERE response IN ('accepted_break', 'kept_scrolling')`,
    )[0]?.n ?? 0;
  const accepted =
    query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM interventions WHERE response = 'accepted_break'`,
    )[0]?.n ?? 0;

  return { total, accepted, rate: total > 0 ? accepted / total : 0 };
}

/** A line about yesterday's breaks for the interrupt, or null if none were taken. */
export function getYesterdayBreakMemory(now: number = Date.now()): string | null {
  const today = startOfLocalDay(now);
  // Safe on 23h/25h DST days.
  const yesterday = startOfLocalDay(today - 1);

  const rows = query<{
    trigger_type: InterventionTrigger;
    trigger_detail: string | null;
    response: InterventionResponse;
  }>(
    `SELECT trigger_type, trigger_detail, response FROM interventions
     WHERE shown_at >= ? AND shown_at < ?
     ORDER BY shown_at DESC`,
    [yesterday, today],
  );

  const decided = rows.filter(
    r => r.response === 'accepted_break' || r.response === 'kept_scrolling',
  );
  const accepted = decided.filter(r => r.response === 'accepted_break');
  if (accepted.length === 0) return null;

  for (const r of accepted) {
    if (r.trigger_type !== 'long_session' || !r.trigger_detail) continue;
    try {
      const minutes = Math.round(Number(JSON.parse(r.trigger_detail).sessionMin));
      if (minutes > 0) return `Yesterday you took a break after ${minutes} minutes.`;
    } catch {
      // Malformed detail: fall through to the count below.
    }
  }

  if (decided.length === 1) return 'Yesterday you took the break Azm suggested.';
  return `Yesterday you took ${accepted.length} of the ${decided.length} breaks Azm suggested.`;
}
