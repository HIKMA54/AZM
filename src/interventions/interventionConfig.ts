import { InterventionTrigger } from '../database/schema';

/** Per-day cap on interventions. */
export const MAX_INTERVENTIONS_PER_DAY = 8;

/** Which fired rule the intervention talks about, most actionable first. */
export const TRIGGER_PRIORITY: InterventionTrigger[] = [
  'long_session',
  'impulse_opens',
  'late_night',
  'daily_goal',
];

/** Minutes before the next intervention, by the last response. */
export const COOLDOWN_AFTER_BREAK_MIN = 45;
export const COOLDOWN_AFTER_CONTINUE_MIN = 15;
export const COOLDOWN_DEFAULT_MIN = 30;

/** Seconds before "keep scrolling" unlocks: base + step per intervention today. */
export const FRICTION_BASE_SEC = 5;
export const FRICTION_STEP_SEC = 10;
export const FRICTION_MAX_SEC = 60;

/** An unanswered intervention is reshown if Azm opens within this many minutes. */
export const PENDING_INTERVENTION_WINDOW_MIN = 15;
