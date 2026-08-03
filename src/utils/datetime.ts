/**
 * Date/time helpers. All of these use the device's local timezone on purpose:
 * "late-night use" and "which day did this happen" are human, local concepts,
 * so a session at 00:30 must land on the right calendar day and hour for the
 * person, not in UTC.
 */

/** 'YYYY-MM-DD' in device-local time, used to group sessions by calendar day. */
export function toLocalDate(epochMs: number): string {
  const d = new Date(epochMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Hour of day (0-23) in device-local time. */
export function hourOfDay(epochMs: number): number {
  return new Date(epochMs).getHours();
}

/** Today's local date string. */
export function today(): string {
  return toLocalDate(Date.now());
}