import { DetectionResult } from '../detection/engine';
import { RuleResult } from '../detection/rules';
import { InterventionResponse } from '../database/schema';
import {
  MAX_INTERVENTIONS_PER_DAY,
  TRIGGER_PRIORITY,
  COOLDOWN_AFTER_BREAK_MIN,
  COOLDOWN_AFTER_CONTINUE_MIN,
  COOLDOWN_DEFAULT_MIN,
  FRICTION_BASE_SEC,
  FRICTION_STEP_SEC,
  FRICTION_MAX_SEC,
  PENDING_INTERVENTION_WINDOW_MIN,
} from './interventionConfig';
import {
  getLastInterventionTime,
  getLastResponse,
  countInterventionsSince,
  countInterventionsToday,
  countInterventionsBetween,
  getPendingIntervention,
  logIntervention,
} from './interventionsRepo';
import { startOfLocalDay } from '../utils/datetime';
import { displayAppName } from '../utils/appNames';
import { getTrackedNameMap } from '../database/trackedAppsRepo';

export type InterventionLevel = 'none' | 'gentle' | 'interrupt';

export interface InterventionOption {
  label: string;
  response: InterventionResponse;
  /** Seconds the option is held before it can be tapped (0 = immediate). */
  delaySec: number;
}

export interface InterventionDecision {
  shouldIntervene: boolean;
  reason: string;
  level: InterventionLevel;
  trigger: RuleResult | null;
  /** Every rule that fired for this decision, for the "why" view. */
  firedRules: RuleResult[];
  packageName: string | null;
  title: string;
  body: string;
  options: InterventionOption[];
  frictionSec: number;
}

function pickPrimary(fired: RuleResult[]): RuleResult | null {
  for (const t of TRIGGER_PRIORITY) {
    const hit = fired.find(r => r.type === t);
    if (hit) return hit;
  }
  return fired[0] ?? null;
}

/** Based on the last response: longer after a break, shorter after continuing. */
function cooldownMinutes(): number {
  switch (getLastResponse()) {
    case 'accepted_break':
      return COOLDOWN_AFTER_BREAK_MIN;
    case 'kept_scrolling':
      return COOLDOWN_AFTER_CONTINUE_MIN;
    default:
      return COOLDOWN_DEFAULT_MIN;
  }
}

/** "Keep scrolling" delay: grows with each intervention today, up to the cap. */
function frictionSeconds(
  now: number,
  priorToday: number = countInterventionsToday(now),
): number {
  return Math.min(
    FRICTION_MAX_SEC,
    FRICTION_BASE_SEC + priorToday * FRICTION_STEP_SEC,
  );
}

function copyFor(trigger: RuleResult): { title: string; body: string } {
  const d = trigger.detail;
  const app = displayAppName(trigger.packageName, getTrackedNameMap());
  switch (trigger.type) {
    case 'daily_goal':
      return {
        title: "You've reached today's goal",
        body: `That's ${d.usedMin} minutes today, ${d.overMin} over your ${d.goalMin}-minute goal. A good moment to pause?`,
      };
    case 'long_session':
      return {
        title: 'This is a long one',
        body: `You've been on ${app} for ${d.sessionMin} minutes, longer than your usual ${d.usualMin}. Want to step away?`,
      };
    case 'impulse_opens':
      return {
        title: 'Opening a lot today',
        body: `You've opened ${app} ${d.opens} times, more than your usual ${d.usual}. Take a breather?`,
      };
    case 'late_night':
      return {
        title: 'Winding down?',
        body: `It's past ${d.sinceHour}:00 and you're still scrolling. Maybe rest your eyes for tonight?`,
      };
    default:
      return { title: 'Time for a break?', body: 'You might be using this more than you meant to.' };
  }
}

function optionsFor(level: InterventionLevel, frictionSec: number): InterventionOption[] {
  if (level === 'interrupt') {
    return [
      { label: 'Take a break', response: 'accepted_break', delaySec: 0 },
      { label: 'Keep scrolling', response: 'kept_scrolling', delaySec: frictionSec },
      { label: 'Not now', response: 'snoozed', delaySec: Math.min(frictionSec, 5) },
    ];
  }
  return [
    { label: 'Take a break', response: 'accepted_break', delaySec: 0 },
    { label: 'Keep scrolling', response: 'kept_scrolling', delaySec: frictionSec },
  ];
}

function levelForRisk(risk: DetectionResult['riskLevel']): InterventionLevel {
  if (risk === 'high') return 'interrupt';
  if (risk === 'medium') return 'gentle';
  return 'none';
}

/**
 * Read-only. Skips when nothing fired, in quiet hours, during cooldown, or
 * once the daily cap is hit.
 */
export function decideIntervention(
  result: DetectionResult,
  now: number = Date.now(),
  opts: { ignoreLimits?: boolean } = {},
): InterventionDecision {
  const none = (reason: string): InterventionDecision => ({
    shouldIntervene: false,
    reason,
    level: 'none',
    trigger: null,
    firedRules: [],
    packageName: null,
    title: '',
    body: '',
    options: [],
    frictionSec: 0,
  });

  if (result.firedRules.length === 0) return none('no rules fired');
  if (result.withinQuietHours) return none('within quiet hours');

  // ignoreLimits is only set by the Settings test button.
  if (!opts.ignoreLimits) {
    const last = getLastInterventionTime();
    const cooldownMs = cooldownMinutes() * 60 * 1000;
    if (last != null && now - last < cooldownMs) return none('cooldown active');

    if (countInterventionsSince(startOfLocalDay(now)) >= MAX_INTERVENTIONS_PER_DAY) {
      return none('daily cap reached');
    }
  }

  const level = levelForRisk(result.riskLevel);
  if (level === 'none') return none('risk below intervention threshold');

  const trigger = pickPrimary(result.firedRules);
  if (!trigger) return none('no primary trigger');

  const frictionSec = frictionSeconds(now);
  const { title, body } = copyFor(trigger);
  return {
    shouldIntervene: true,
    reason: `risk ${result.riskLevel}, primary ${trigger.type}, friction ${frictionSec}s`,
    level,
    trigger,
    firedRules: result.firedRules,
    packageName: trigger.packageName,
    title,
    body,
    options: optionsFor(level, frictionSec),
    frictionSec,
  };
}

export function presentIntervention(
  decision: InterventionDecision,
  now: number = Date.now(),
): number {
  if (!decision.shouldIntervene || !decision.trigger) return -1;
  return logIntervention(
    decision.trigger.type,
    decision.packageName,
    decision.trigger.detail,
    now,
  );
}

/**
 * Reopens a logged but unanswered intervention, usually one sent as a
 * notification. Otherwise the cooldown it started would hide it when the user
 * opens Azm. Friction is recomputed as of when it was first shown.
 */
export function resumePendingIntervention(
  result: DetectionResult,
  now: number = Date.now(),
): { decision: InterventionDecision; id: number } | null {
  const pending = getPendingIntervention(
    now - PENDING_INTERVENTION_WINDOW_MIN * 60 * 1000,
  );
  if (!pending) return null;

  const trigger: RuleResult = {
    type: pending.trigger,
    fired: true,
    packageName: pending.packageName,
    status: 'active',
    detail: pending.detail,
  };
  const level: InterventionLevel =
    levelForRisk(result.riskLevel) === 'interrupt' ? 'interrupt' : 'gentle';
  const frictionSec = frictionSeconds(
    now,
    countInterventionsBetween(startOfLocalDay(pending.shownAt), pending.shownAt),
  );
  const { title, body } = copyFor(trigger);

  return {
    id: pending.id,
    decision: {
      shouldIntervene: true,
      reason: `resumed pending ${trigger.type}, friction ${frictionSec}s`,
      level,
      trigger,
      firedRules: [trigger],
      packageName: trigger.packageName,
      title,
      body,
      options: optionsFor(level, frictionSec),
      frictionSec,
    },
  };
}
