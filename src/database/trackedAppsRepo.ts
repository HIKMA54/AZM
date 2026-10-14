import { query, run } from './db';
import { UsageStatsService } from '../services/UsageStats';

const SYSTEM_EXCLUSIONS_SETTING_KEY = 'system_excluded_packages';

/**
 * Caches the launcher / System UI / Azm package list in `settings`, so the
 * headless task (a separate JS context) can read it synchronously. Call once
 * per app start.
 */
export async function primeSystemExclusions(): Promise<void> {
  const excluded = await UsageStatsService.getSystemExcludedPackages();
  run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [SYSTEM_EXCLUSIONS_SETTING_KEY, JSON.stringify(excluded)],
  );
}

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
 * Apps that feed every count, rule and screen: the tracked apps, or every
 * observed app if none are tracked, minus the system exclusions.
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

/** Package -> label saved when the app was tracked. */
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