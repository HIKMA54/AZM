import { UsageStatsService } from '../services/UsageStats';

// Lookup order: tracked_apps name, this cache, native label, package-id guess.
const sessionLabelCache = new Map<string, string>();

function prettyName(pkg: string): string {
  const last = pkg.split('.').pop() ?? pkg;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/** Like resolveAppName but synchronous, so it skips the native lookup. */
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
  } catch {}

  return prettyName(packageName);
}
