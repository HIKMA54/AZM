/**
 * All detection thresholds live here, named and documented, so every number a
 * rule uses is auditable in one place rather than buried as a magic constant.
 * These are deliberate, defensible defaults — not learned, not weighted — and
 * each maps to a single measurable variable.
 */

/** Trailing days considered when computing an app's baseline. */
export const BASELINE_WINDOW_DAYS = 14;

/**
 * Days of data required before baseline-dependent rules (impulse opens, long
 * session) are trusted. Below this, Azm is in its "learning phase" and holds
 * those comparisons back rather than flag against an unstable "usual".
 */
export const LEARNING_PHASE_DAYS = 7;

/** Opens today must be >= this multiple of the app's usual daily opens to flag. */
export const IMPULSE_MULTIPLIER = 2.0;
/** Absolute floor so a quiet day (e.g. 2 opens vs a usual 1) never flags. */
export const IMPULSE_MIN_OPENS = 4;

/** A session must be >= this multiple of the app's usual session length to flag. */
export const LONG_SESSION_MULTIPLIER = 2.0;
/** Absolute floor (ms) so short sessions never flag regardless of ratio. */
export const LONG_SESSION_MIN_MS = 10 * 60 * 1000; // 10 minutes

/** Number of opens in the late-night window needed to flag (any use flags). */
export const LATE_NIGHT_MIN_OPENS = 1;

/** Fallbacks used only if the corresponding setting is missing. */
export const DEFAULT_LATE_NIGHT_HOUR = 23;
export const DEFAULT_DAILY_GOAL_MIN = 120;