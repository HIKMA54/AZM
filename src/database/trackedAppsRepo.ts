import { query, run } from './db';

/**
 * The tracked_apps table records which apps the user has chosen for Azm to
 * watch. Detection scopes to these when any exist (see getDetectionApps); until
 * the user picks any, detection falls back to every app it has observed. So an
 * empty table means "watch everything", and choosing apps narrows the focus.
 */

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