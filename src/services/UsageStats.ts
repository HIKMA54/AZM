import { NativeModules } from 'react-native';
import { AppInfo, UsageEvent } from './usageTypes';

const { UsageStats } = NativeModules;

if (!UsageStats) {
  console.warn(
    '[Azm] Native module "UsageStats" was not found. Verify that ' +
      'UsageStatsPackage is registered in MainApplication and rebuild the app.',
  );
}

export const UsageStatsService = {
  hasUsageAccess(): Promise<boolean> {
    return UsageStats.hasUsageAccess();
  },

  openUsageAccessSettings(): void {
    UsageStats.openUsageAccessSettings();
  },

  /** Times are epoch ms. */
  async queryEvents(beginTime: number, endTime: number): Promise<UsageEvent[]> {
    const raw = await UsageStats.queryEvents(beginTime, endTime);
    return raw as UsageEvent[];
  },

  async getLaunchableApps(): Promise<AppInfo[]> {
    const raw = await UsageStats.getLaunchableApps();
    return raw as AppInfo[];
  },

  /** Launcher, System UI and Azm. */
  async getSystemExcludedPackages(): Promise<string[]> {
    const raw = await UsageStats.getSystemExcludedPackages();
    return raw as string[];
  },

  /** Null if the package isn't installed. */
  async getAppLabel(packageName: string): Promise<string | null> {
    return UsageStats.getAppLabel(packageName);
  },
};