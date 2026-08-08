import { DetectionResult } from '../detection/engine';
import { RuleResult } from '../detection/rules';
import { InterventionResponse } from '../database/schema';
import {
  INTERVENTION_COOLDOWN_MIN,
  MAX_INTERVENTIONS_PER_DAY,
  TRIGGER_PRIORITY,
} from './interventionConfig';
import {
  getLastInterventionTime,
  countInterventionsSince,
  logIntervention,
} from './interventionsRepo';

/**
 * How forcefully to intervene:
 *   none      -> don't
 *   gentle    -> a dismissable reminder (low friction)
 *   interrupt -> a full-screen prompt with an explicit choice
 *
 * Level is chosen from risk alone and never auto-escalates past 'interrupt'.
 * Harder measures (temporary lockouts) are intentionally left out of automatic
 * escalation: per Azm's design, stronger friction is user-controlled, not
 * something the app ramps up silently on someone.
 */
export type InterventionLevel = 'none' | 'gentle' | 'interrupt';

export interface InterventionOption {
  label: string;
  response: InterventionResponse;
}

export interface InterventionDecision {
  shouldIntervene: boolean;
  reason: string; // why it did/didn't fire — also useful on the transparency screen
  level: InterventionLevel;
  trigger: RuleResult | null;
  packageName: string | null;
  title: string;
  body: string;
  options: InterventionOption[];
}

function startOfDayMs(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function shortPkg(p: string | null): string {
  if (!p) return 'an app';
  const parts = p.split('.');
  return parts[parts.length - 1];
}

/** Chooses which fired rule the intervention speaks to (see TRIGGER_PRIORITY). */
function pickPrimary(fired: RuleResult[]): RuleResult | null {
  for (const t of TRIGGER_PRIORITY) {
    const hit = fired.find(r => r.type === t);
    if (hit) return hit;
  }
  return fired[0] ?? null;
}

/**
 * Calm, specific copy that names the actual numbers behind the prompt. The tone
 * is a nudge with an out, never a scold — the user always keeps agency.
 */
function copyFor(trigger: RuleResult): { title: string; body: string } {
  const d = trigger.detail;
  const app = shortPkg(trigger.packageName);
  switch (trigger.type) {
    case 'daily_goal':
      return {
        title: "You've reached today's goal",
        body: `That's ${d.usedMin} minutes today — ${d.overMin} over your ${d.goalMin}-minute goal. A good moment to pause?`,
      };
    case 'long_session':
      return {
        title: 'This is a long one',
        body: `You've been on ${app} for ${d.sessionMin} minutes, longer than your usual ${d.usualMin}. Want to step away?`,
      };
    case 'impulse_opens':
      return {
        title: 'Opening a lot today',
        body: `You've opened ${app} ${d.opens} times — more than your usual ${d.usual}. Take a breather?`,
      };
    case 'late_night':
      return {
        title: 'Winding down?',
        body: `It's past ${d.sinceHour}:00 and you're still scrolling. Maybe rest your eyes for tonight?`,
      };
    default:
      return {
        title: 'Time for a break?',
        body: 'You might be using this more than you meant to.',
      };
  }
}

function optionsFor(level: InterventionLevel): InterventionOption[] {
  if (level === 'interrupt') {
    return [
      { label: 'Take a break', response: 'accepted_break' },
      { label: 'Keep scrolling', response: 'kept_scrolling' },
      { label: 'Not now', response: 'snoozed' },
    ];
  }
  return [
    { label: 'Take a break', response: 'accepted_break' },
    { label: 'Dismiss', response: 'dismissed' },
  ];
}

function levelForRisk(risk: DetectionResult['riskLevel']): InterventionLevel {
  if (risk === 'high') return 'interrupt';
  if (risk === 'medium') return 'gentle';
  return 'none';
}

/**
 * Decides whether and how to intervene given a detection result. Pure aside from
 * reading the intervention log for cooldown/cap checks — it writes nothing, so
 * it's safe to call freely (e.g. to preview on the transparency screen).
 *
 * Gating order: something must have fired, it must not be quiet hours, the
 * cooldown must have elapsed, and the daily cap must not be hit.
 */
export function decideIntervention(
  result: DetectionResult,
  now: number = Date.now(),
): InterventionDecision {
  const none = (reason: string): InterventionDecision => ({
    shouldIntervene: false,
    reason,
    level: 'none',
    trigger: null,
    packageName: null,
    title: '',
    body: '',
    options: [],
  });

  if (result.firedRules.length === 0) return none('no rules fired');
  if (result.withinQuietHours) return none('within quiet hours');

  const last = getLastInterventionTime();
  if (last != null && now - last < INTERVENTION_COOLDOWN_MIN * 60 * 1000) {
    return none('cooldown active');
  }
  if (countInterventionsSince(startOfDayMs(now)) >= MAX_INTERVENTIONS_PER_DAY) {
    return none('daily cap reached');
  }

  const level = levelForRisk(result.riskLevel);
  if (level === 'none') return none('risk below intervention threshold');

  const trigger = pickPrimary(result.firedRules);
  if (!trigger) return none('no primary trigger');

  const { title, body } = copyFor(trigger);
  return {
    shouldIntervene: true,
    reason: `risk ${result.riskLevel}, primary ${trigger.type}`,
    level,
    trigger,
    packageName: trigger.packageName,
    title,
    body,
    options: optionsFor(level),
  };
}

/**
 * Records that a decided intervention was shown, returning its log id so the
 * caller can attach the user's response later via recordResponse(). Writing at
 * show-time (not response-time) is what starts the cooldown and makes an
 * ignored prompt still countable.
 */
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