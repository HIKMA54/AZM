import { InterventionTrigger } from '../database/schema';

/**
 * Guardrails so Azm never becomes the compulsive-checking problem it's meant to
 * reduce. These are deliberate anti-nag limits, documented and tunable.
 */

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

/**
 * Minutes of quiet after an intervention, chosen by the user's last response:
 * a taken break earns the longest rest, while choosing to keep scrolling brings
 * Azm back sooner.
 */
export const COOLDOWN_AFTER_BREAK_MIN = 45;
export const COOLDOWN_AFTER_CONTINUE_MIN = 15;
export const COOLDOWN_DEFAULT_MIN = 30;

/**
 * Delay (seconds) before "keep scrolling" can be tapped. Starts at the base and
 * grows by one step for each intervention already shown today, up to the cap.
 */
export const FRICTION_BASE_SEC = 5;
export const FRICTION_STEP_SEC = 10;
export const FRICTION_MAX_SEC = 60;

/**
 * An intervention left unanswered (a background notification, or an in-app
 * interrupt closed without a choice) is shown again full-screen if Azm is
 * opened within this many minutes of it.
 */
export const PENDING_INTERVENTION_WINDOW_MIN = 15;
