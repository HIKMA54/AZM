import { query, run } from './db';

/**
 * Settings are a simple key-value table. Typed getters/setters wrap the raw
 * string storage so callers work with numbers/strings, not serialization.
 * Keys used by Azm are listed in SettingKey for discoverability.
 */
export type SettingKey =
  | 'daily_goal_minutes' // user's daily social-time goal
  | 'quiet_hours_start' // 'HH:MM', interventions suppressed inside this window
  | 'quiet_hours_end' // 'HH:MM'
  | 'late_night_start_hour' // integer hour (0-23) marking the late-night window start
  | 'learning_phase_start'; // 'YYYY-MM-DD' the 7-day baseline learning phase began

export function getSetting(key: SettingKey): string | null {
  const rows = query<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [key],
  );
  return rows[0]?.value ?? null;
}

export function setSetting(key: SettingKey, value: string): void {
  run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export function getSettingNumber(key: SettingKey): number | null {
  const raw = getSetting(key);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function setSettingNumber(key: SettingKey, value: number): void {
  setSetting(key, String(value));
}

/**
 * Seeds sensible defaults the first time the app runs. Only writes a key if it
 * is absent, so it never overwrites a choice the user has already made.
 * These are starting points, not fixed rules — the Settings screen edits them.
 */
export function seedDefaultSettings(): void {
  const defaults: Array<[SettingKey, string]> = [
    ['daily_goal_minutes', '120'], // 2h default goal
    ['quiet_hours_start', '22:00'],
    ['quiet_hours_end', '07:00'],
    ['late_night_start_hour', '23'], // opens at/after 23:00 count as late-night
  ];
  for (const [key, value] of defaults) {
    if (getSetting(key) === null) setSetting(key, value);
  }
}