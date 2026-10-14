import { query, run } from './db';

export type SettingKey =
  | 'daily_goal_minutes'
  | 'quiet_hours_start' // 'HH:MM'
  | 'quiet_hours_end' // 'HH:MM'
  | 'late_night_start_hour' // 0-23
  | 'learning_phase_start'; // 'YYYY-MM-DD'

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

/** Writes defaults for any key that isn't set yet. */
export function seedDefaultSettings(): void {
  const defaults: Array<[SettingKey, string]> = [
    ['daily_goal_minutes', '120'],
    ['quiet_hours_start', '22:00'],
    ['quiet_hours_end', '07:00'],
    ['late_night_start_hour', '23'],
  ];
  for (const [key, value] of defaults) {
    if (getSetting(key) === null) setSetting(key, value);
  }
}