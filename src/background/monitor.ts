import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { query, run } from '../database/db';

const { AzmMonitor } = NativeModules;

/** Persisted "the user wants monitoring on" flag, stored in the settings table. */
function setEnabledFlag(on: boolean): void {
  run(
    `INSERT INTO settings (key, value) VALUES ('monitoring_enabled', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [on ? 'true' : 'false'],
  );
}

export const Monitor = {
  /** Desired state, remembered across restarts so the toggle reflects reality. */
  isEnabled(): boolean {
    return (
      query<{ value: string }>(
        `SELECT value FROM settings WHERE key = 'monitoring_enabled'`,
      )[0]?.value === 'true'
    );
  },

  /** Whether the foreground service is actually running right now. */
  async isRunning(): Promise<boolean> {
    try {
      return await AzmMonitor.isRunning();
    } catch {
      return false;
    }
  },

  async enable(): Promise<void> {
    // POST_NOTIFICATIONS is a runtime permission on Android 13+.
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
    }
    await AzmMonitor.start();
    setEnabledFlag(true);
  },

  async disable(): Promise<void> {
    await AzmMonitor.stop();
    setEnabledFlag(false);
  },

  /**
   * Whether "Display over other apps" is granted. With it, a background check
   * brings Azm to the front with the full-screen interrupt; without it, the
   * user gets a notification instead.
   */
  async canShowOverApps(): Promise<boolean> {
    try {
      return await AzmMonitor.canDrawOverlays();
    } catch {
      return false;
    }
  },

  /** Opens the system screen where the user grants that permission. */
  async openOverAppsSettings(): Promise<void> {
    await AzmMonitor.openOverlaySettings();
  },
};