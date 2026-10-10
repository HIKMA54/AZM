import { UsageStatsService } from '../services/UsageStats';

/**
 * Single label source for every screen: tracked_apps.app_name (captured from
 * PackageManager.getApplicationLabel at tracking time — see
 * trackedAppsRepo.getTrackedNameMap) is checked first, so the common case
 * never calls the native side at all. A package with no cached name (not yet
 * tracked) gets a one-time native lookup, cached here in memory for the rest
 * of the session. Only a package that can't be resolved at all (uninstalled)
 * falls back to a name guessed from its package id.
 */
const sessionLabelCache = new Map<string, string>();

function prettyName(pkg: string): string {
  const last = pkg.split('.').pop() ?? pkg;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/**
 * Synchronous label for places that can't await the native lookup (rule copy,
 * intervention text). Same order as resolveAppName minus the native call:
 * tracked name, then any label already resolved this session, then the guess.
 */
export function displayAppName(
  packageName: string | null,
  trackedNames: Map<string, string>,
): string {
  if (!packageName) return 'an app';
  return (
    trackedNames.get(packageName) ??
    sessionLabelCache.get(packageName) ??
    prettyName(packageName)
  );
}

export async function resolveAppName(
  packageName: string,
  trackedNames: Map<string, string>,
): Promise<string> {
  const known = trackedNames.get(packageName);
  if (known) return known;

  const cached = sessionLabelCache.get(packageName);
  if (cached) return cached;

  try {
    const label = await UsageStatsService.getAppLabel(packageName);
    if (label) {
      sessionLabelCache.set(packageName, label);
      return label;
    }
  } catch {
    // fall through to the package-derived guess
  }

  return prettyName(packageName);
}
