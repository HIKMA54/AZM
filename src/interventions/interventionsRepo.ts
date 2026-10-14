import { query, run } from '../database/db';
import { InterventionTrigger, InterventionResponse } from '../database/schema';
import { startOfLocalDay } from '../utils/datetime';

/**
 * The interventions table records every prompt Azm showed and what the user did.
 * It is the source of the break-acceptance metric and of the friction/cooldown
 * state that makes a limit breach carry a scaling consequence.
 */

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

/** The response to the most recently shown intervention (for cooldown choice). */
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

/**
 * How many interventions have already been shown today. Drives escalating
 * friction: each prior breach makes the next "keep scrolling" wait longer.
 */
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

/**
 * The most recent intervention since `sinceMs` that nobody has answered yet,
 * typically one posted as a notification while Azm was in the background.
 */
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

/**
 * Break-acceptance metric. Denominator counts only clear decisions
 * (accepted_break vs kept_scrolling); dismissed/snoozed/unanswered are excluded,
 * so the rate honestly answers "when asked to stop, did they?".
 */
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

/**
 * One factual line about yesterday's breaks, shown on the interrupt so the
 * prompt draws on the user's own record rather than generic advice. Returns
 * null when there is nothing worth saying (no decisions yesterday, or none of
 * the suggested breaks were taken), so the interrupt never opens with a
 * reproach.
 */
export function getYesterdayBreakMemory(now: number = Date.now()): string | null {
  const today = startOfLocalDay(now);
  // One ms before today's midnight is always inside yesterday, even on a
  // 23- or 25-hour daylight-saving day.
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

  // Most specific fact first: how long the stretch was when a break ended it.
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
