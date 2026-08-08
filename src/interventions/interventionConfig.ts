import { InterventionTrigger } from '../database/schema';

/**
 * Guardrails so Azm never becomes the compulsive-checking problem it's meant to
 * reduce. These are deliberate anti-nag limits, documented and tunable.
 */

/** Minimum minutes between any two interventions. */
export const INTERVENTION_COOLDOWN_MIN = 30;

/** Hard ceiling on interventions per day, regardless of how much fires. */
export const MAX_INTERVENTIONS_PER_DAY = 8;

/**
 * When several rules fire at once, this order decides which one the
 * intervention speaks to. In-the-moment, actionable signals come first (you can
 * act on a long session right now); the daily-goal summary comes last. Tunable.
 */
export const TRIGGER_PRIORITY: InterventionTrigger[] = [
  'long_session',
  'impulse_opens',
  'late_night',
  'daily_goal',
];