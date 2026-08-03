import { NativeModules } from 'react-native';
import { AppInfo, UsageEvent } from './usageTypes';

const { UsageStats } = NativeModules;

if (!UsageStats) {
  // Catches a missing/incorrect native registration early in development,
  // before a downstream call fails with a less obvious error.
  console.warn(
    '[Azm] Native module "UsageStats" was not found. Verify that ' +
      'UsageStatsPackage is registered in MainApplication and rebuild the app.',
  );
}

/**
 * Thin JS wrapper over the Kotlin UsageStats module. Keeps the rest of the
 * codebase free of raw NativeModules access and gives every call a typed shape.
 */
export const UsageStatsService = {
  /** True if the user has granted Usage Access to Azm. */
  hasUsageAccess(): Promise<boolean> {
    return UsageStats.hasUsageAccess();
  },

  /** Deep-links to the system Usage Access settings screen. */
  openUsageAccessSettings(): void {
    UsageStats.openUsageAccessSettings();
  },

  /**
   * Foreground/background events between two epoch-ms timestamps.
   * @param beginTime start of the window (epoch ms)
   * @param endTime   end of the window (epoch ms)
   */
  async queryEvents(beginTime: number, endTime: number): Promise<UsageEvent[]> {
    const raw = await UsageStats.queryEvents(beginTime, endTime);
    return raw as UsageEvent[];
  },

  /** Launchable apps for the Tracked Apps picker. */
  async getLaunchableApps(): Promise<AppInfo[]> {
    const raw = await UsageStats.getLaunchableApps();
    return raw as AppInfo[];
  },
};