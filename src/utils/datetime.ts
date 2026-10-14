// All local time, not UTC: a 00:30 session belongs to that local day.

/** 'YYYY-MM-DD' */
export function toLocalDate(epochMs: number): string {
  const d = new Date(epochMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function hourOfDay(epochMs: number): number {
  return new Date(epochMs).getHours();
}

export function startOfLocalDay(epochMs: number): number {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
