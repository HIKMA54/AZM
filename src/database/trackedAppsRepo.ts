import { query, run } from './db';
import { UsageStatsService } from '../services/UsageStats';

/**
 * The tracked_apps table records which apps the user has chosen for Azm to
 * watch. Detection scopes to these when any exist (see getScopedApps); until
 * the user picks any, detection falls back to every app it has observed. So an
 * empty table means "watch everything", and choosing apps narrows the focus.
 */

const SYSTEM_EXCLUSIONS_SETTING_KEY = 'system_excluded_packages';

/**
 * Refreshes the cached set of packages that must never be tracked or counted
 * — the device's current home app, System UI, and Azm itself — resolved via
 * the native module (PackageManager.resolveActivity for the home app; no
 * hardcoded manufacturer package names). Persisted to `settings` rather than
 * kept only in memory so the headless background task, which runs in its own
 * fresh JS context with no app UI, can read it back synchronously without a
 * second native round-trip. Call once per foreground app start.
 */
export async function primeSystemExclusions(): Promise<void> {
  const excluded = await UsageStatsService.getSystemExcludedPackages();
  run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [SYSTEM_EXCLUSIONS_SETTING_KEY, JSON.stringify(excluded)],
  );
}

/**
 * The hard-excluded package set (home launcher / System UI / Azm), read back
 * from the cache primeSystemExclusions() persisted. Used at ingestion and
 * rollup time so stored data never includes them in the first place — Azm's
 * own historical data for genuinely untracked apps (e.g. an app the user
 * hasn't chosen to track yet) is deliberately left alone, so that tracking it
 * later can draw on real history rather than starting from zero.
 */
export function getSystemExclusions(): Set<string> {
  const raw = query<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [SYSTEM_EXCLUSIONS_SETTING_KEY],
  )[0]?.value;
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

/**
 * The single definition of which apps feed Azm's counts, minutes, rules,
 * baseline and risk: the user's tracked apps if any have been chosen,
 * otherwise every app Azm has observed — in both cases minus the home
 * launcher / System UI / Azm itself. Every screen and rule reads this same
 * list rather than each re-deriving its own scope.
 */
export function getScopedApps(): string[] {
  const excluded = getSystemExclusions();
  const tracked = query<{ package_name: string }>(
    'SELECT package_name FROM tracked_apps WHERE is_tracked = 1',
  ).map(r => r.package_name);

  if (tracked.length > 0) {
    return tracked.filter(pkg => !excluded.has(pkg));
  }

  const observed = query<{ package_name: string }>(
    'SELECT DISTINCT package_name FROM sessions',
  ).map(r => r.package_name);
  return observed.filter(pkg => !excluded.has(pkg));
}

/**
 * Package -> real app label, captured from PackageManager at the moment the
 * app was tracked (see setTracked). The single label source every screen
 * should read from instead of guessing a name from the package id.
 */
export function getTrackedNameMap(): Map<string, string> {
  const rows = query<{ package_name: string; app_name: string }>(
    'SELECT package_name, app_name FROM tracked_apps',
  );
  return new Map(rows.map(r => [r.package_name, r.app_name]));
}

export interface TrackedApp {
  packageName: string;
  appName: string;
}

/** Package names the user is actively tracking. */
export function getTrackedSet(): Set<string> {
  const rows = query<{ package_name: string }>(
    'SELECT package_name FROM tracked_apps WHERE is_tracked = 1',
  );
  return new Set(rows.map(r => r.package_name));
}

export function countTracked(): number {
  return (
    query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM tracked_apps WHERE is_tracked = 1',
    )[0]?.n ?? 0
  );
}

/** Turns tracking on/off for one app (upsert — keeps history if toggled off). */
export function setTracked(
  packageName: string,
  appName: string,
  tracked: boolean,
): void {
  run(
    `INSERT INTO tracked_apps (package_name, app_name, is_tracked, added_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(package_name) DO UPDATE SET
       app_name   = excluded.app_name,
       is_tracked = excluded.is_tracked`,
    [packageName, appName, tracked ? 1 : 0, Date.now()],
  );
}