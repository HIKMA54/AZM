import { InterventionTrigger } from '../database/schema';
import {
  IMPULSE_MULTIPLIER,
  IMPULSE_MIN_OPENS,
  LONG_SESSION_MULTIPLIER,
  LONG_SESSION_MIN_MS,
  LATE_NIGHT_MIN_OPENS,
} from './detectionConfig';

export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * The outcome of evaluating one rule.
 * - `type` reuses InterventionTrigger so a fired rule maps 1:1 onto the
 *   interventions log if step 4 decides to act on it.
 * - `detail` carries the exact numbers behind the decision; the "why am I
 *   seeing this" transparency screen renders these directly.
 * - `status` distinguishes a rule that ran ('active') from one held back
 *   because its baseline isn't ready yet ('learning').
 */
export interface RuleResult {
  type: InterventionTrigger;
  fired: boolean;
  packageName: string | null; // per-app rules set this; aggregate rules are null
  status: 'active' | 'learning';
  detail: Record<string, number>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Opens today vs the app's usual daily opens (baseline-dependent). */
export function impulseOpensRule(
  packageName: string,
  opensToday: number,
  avgOpensDay: number,
  baselineReady: boolean,
): RuleResult {
  if (!baselineReady) {
    return {
      type: 'impulse_opens',
      fired: false,
      packageName,
      status: 'learning',
      detail: { opens: opensToday },
    };
  }
  const threshold = avgOpensDay * IMPULSE_MULTIPLIER;
  const fired = opensToday >= threshold && opensToday >= IMPULSE_MIN_OPENS;
  return {
    type: 'impulse_opens',
    fired,
    packageName,
    status: 'active',
    detail: {
      opens: opensToday,
      usual: round1(avgOpensDay),
      threshold: round1(threshold),
    },
  };
}

/** Longest session today vs the app's usual session length (baseline-dependent). */
export function longSessionRule(
  packageName: string,
  longestMs: number,
  avgSessionMs: number,
  baselineReady: boolean,
): RuleResult {
  if (!baselineReady) {
    return {
      type: 'long_session',
      fired: false,
      packageName,
      status: 'learning',
      detail: { sessionMin: round1(longestMs / 60000) },
    };
  }
  const threshold = avgSessionMs * LONG_SESSION_MULTIPLIER;
  const fired = longestMs >= threshold && longestMs >= LONG_SESSION_MIN_MS;
  return {
    type: 'long_session',
    fired,
    packageName,
    status: 'active',
    detail: {
      sessionMin: round1(longestMs / 60000),
      usualMin: round1(avgSessionMs / 60000),
      thresholdMin: round1(threshold / 60000),
    },
  };
}

/** Any use at/after the late-night hour. Absolute rule — needs no baseline. */
export function lateNightRule(
  lateNightOpens: number,
  sinceHour: number,
): RuleResult {
  return {
    type: 'late_night',
    fired: lateNightOpens >= LATE_NIGHT_MIN_OPENS,
    packageName: null,
    status: 'active',
    detail: { opens: lateNightOpens, sinceHour },
  };
}

/** Total tracked-app time today vs the user's daily goal. Absolute rule. */
export function dailyGoalRule(
  usedMinutes: number,
  goalMinutes: number,
): RuleResult {
  return {
    type: 'daily_goal',
    fired: usedMinutes >= goalMinutes,
    packageName: null,
    status: 'active',
    detail: {
      usedMin: usedMinutes,
      goalMin: goalMinutes,
      overMin: Math.max(0, usedMinutes - goalMinutes),
    },
  };
}

/**
 * Risk level is DERIVED here at read-time from which rules fired. It is never
 * stored and it is not a weighted score — it is an explicit, documented mapping
 * from a set of boolean rule outcomes to a band:
 *
 *   high   : 3+ rules fired, OR the day's goal was exceeded alongside impulsive
 *            opening (the combination that best signals a compulsive day)
 *   medium : at least one rule fired
 *   low    : nothing fired
 *
 * Every level therefore traces back to named rules a person can inspect, which
 * is the whole reason composite scores were rejected for this project.
 */
export function deriveRiskLevel(rules: RuleResult[]): RiskLevel {
  const fired = rules.filter(r => r.fired);
  const has = (t: InterventionTrigger) => fired.some(r => r.type === t);

  if (fired.length >= 3 || (has('daily_goal') && has('impulse_opens'))) {
    return 'high';
  }
  if (fired.length >= 1) {
    return 'medium';
  }
  return 'low';
}