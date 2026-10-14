export enum UsageEventType {
  /** Counts as one open. */
  Foreground = 1,
  Background = 2,
}

export interface UsageEvent {
  packageName: string;
  eventType: UsageEventType;
  /** Epoch milliseconds. */
  timestamp: number;
}

export interface AppInfo {
  packageName: string;
  appName: string;
}

export interface AppSession {
  packageName: string;
  /** Epoch ms. */
  start: number;
  /** Epoch ms, or the query end if still open. */
  end: number;
  durationMs: number;
  open: boolean;
}