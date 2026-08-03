/** Raw event types as returned by the native module. */
export enum UsageEventType {
  /** App moved to the foreground — this is one "open". */
  Foreground = 1,
  /** App moved to the background. */
  Background = 2,
}

/** A single raw event from UsageStatsManager. */
export interface UsageEvent {
  packageName: string;
  eventType: UsageEventType;
  /** Epoch milliseconds. */
  timestamp: number;
}

/** A launchable app, used to populate the Tracked Apps picker. */
export interface AppInfo {
  packageName: string;
  appName: string;
}

/**
 * A reconstructed app session: one foreground period paired with the
 * background event that ended it. Sessions are the unit every behavioural
 * metric is computed from.
 */
export interface AppSession {
  packageName: string;
  /** Epoch ms when the app came to the foreground. */
  start: number;
  /** Epoch ms when it went to the background (or the query cap). */
  end: number;
  durationMs: number;
  /** True if the app was still open when the query window ended. */
  open: boolean;
}