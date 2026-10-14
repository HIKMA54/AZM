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
 * `detail` holds the numbers shown on the "why" screen. `status` is
 * 'learning' when the rule was skipped for lack of a baseline.
 */
export interface RuleResult {
  type: InterventionTrigger;
  fired: boolean;
  packageName: string | null; // null for aggregate rules
  status: 'active' | 'learning';
  detail: Record<string, number>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

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
 *   high   : 3+ rules fired, or daily goal + impulse opens
 *   medium : any rule fired
 *   low    : nothing fired
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