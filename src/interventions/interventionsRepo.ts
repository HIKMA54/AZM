import { query, run } from '../database/db';
import { InterventionTrigger, InterventionResponse } from '../database/schema';

/**
 * The interventions table is the record of every prompt Azm showed and what the
 * user did about it. It's the source of the break-acceptance metric, so the
 * write path is deliberately simple: log when shown, update when answered.
 */

/**
 * Records that an intervention was shown. Aggregate triggers (late-night, daily
 * goal) aren't tied to one app, so a null package is stored as '*' to satisfy
 * the NOT NULL column while still being distinguishable from a real package.
 * Returns the new row id, used later to attach the user's response.
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

/** Attaches the user's response to a previously shown intervention. */
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

/** Epoch ms of the most recent intervention shown, or null if none. */
export function getLastInterventionTime(): number | null {
  return (
    query<{ t: number }>('SELECT MAX(shown_at) AS t FROM interventions')[0]?.t ??
    null
  );
}

/** How many interventions have been shown since a given timestamp. */
export function countInterventionsSince(sinceMs: number): number {
  return (
    query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM interventions WHERE shown_at >= ?',
      [sinceMs],
    )[0]?.n ?? 0
  );
}

/**
 * Break-acceptance metric. The denominator is only interventions the user gave
 * a clear accept/decline to ('accepted_break' vs 'kept_scrolling'); dismissed,
 * snoozed, and unanswered prompts are excluded because they aren't a decision
 * either way. This keeps the rate an honest measure of "when asked to stop, did
 * they?" rather than an inflated or deflated proxy.
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