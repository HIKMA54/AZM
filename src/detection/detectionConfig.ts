/** Trailing days considered when computing an app's baseline. */
export const BASELINE_WINDOW_DAYS = 14;

/** Furthest back one ingest reads, however old the checkpoint is. */
export const MAX_INGEST_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/** Days of data before impulse-open and long-session rules can fire. */
export const LEARNING_PHASE_DAYS = 7;

/** Opens today must be >= this multiple of the app's usual daily opens to flag. */
export const IMPULSE_MULTIPLIER = 2.0;
/** Absolute floor so a quiet day (e.g. 2 opens vs a usual 1) never flags. */
export const IMPULSE_MIN_OPENS = 4;

/** A session must be >= this multiple of the app's usual session length to flag. */
export const LONG_SESSION_MULTIPLIER = 2.0;
/** Absolute floor (ms) so short sessions never flag regardless of ratio. */
export const LONG_SESSION_MIN_MS = 10 * 60 * 1000;

/** Number of opens in the late-night window needed to flag (any use flags). */
export const LATE_NIGHT_MIN_OPENS = 1;

/** Fallbacks used only if the corresponding setting is missing. */
export const DEFAULT_LATE_NIGHT_HOUR = 23;
export const DEFAULT_DAILY_GOAL_MIN = 120;