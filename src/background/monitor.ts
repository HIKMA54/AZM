import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { query, run } from '../database/db';

const { AzmMonitor } = NativeModules;

function setEnabledFlag(on: boolean): void {
  run(
    `INSERT INTO settings (key, value) VALUES ('monitoring_enabled', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [on ? 'true' : 'false'],
  );
}

export const Monitor = {
  /** What the user asked for, which may differ from isRunning(). */
  isEnabled(): boolean {
    return (
      query<{ value: string }>(
        `SELECT value FROM settings WHERE key = 'monitoring_enabled'`,
      )[0]?.value === 'true'
    );
  },

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

  /** "Display over other apps". Without it, background nudges are notifications. */
  async canShowOverApps(): Promise<boolean> {
    try {
      return await AzmMonitor.canDrawOverlays();
    } catch {
      return false;
    }
  },

  async openOverAppsSettings(): Promise<void> {
    await AzmMonitor.openOverlaySettings();
  },

  /**
   * Restarts the service when monitoring is switched on but not running,
   * e.g. after a reinstall or the process being killed. Called on launch.
   */
  async ensureRunning(): Promise<void> {
    if (!Monitor.isEnabled()) return;
    if (await Monitor.isRunning()) return;
    try {
      await AzmMonitor.start();
    } catch {}
  },

  /** Testing aid: run one background check after `seconds`. */
  async testCheckIn(seconds: number): Promise<void> {
    await AzmMonitor.runCheckIn(seconds);
  },

  /** Clears the intervention notification once the interrupt is on screen. */
  clearInterventionNotification(): void {
    try {
      AzmMonitor?.clearInterventionNotification?.();
    } catch {}
  },
};