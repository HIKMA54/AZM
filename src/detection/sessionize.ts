import { AppSession, UsageEvent, UsageEventType } from '../services/usageTypes';

/**
 * Pairs each foreground event with the next background event for the same
 * package.
 *
 * @param events    raw events, in any order
 * @param windowEnd end time for a session still open at query time
 */
export function sessionize(
  events: UsageEvent[],
  windowEnd: number = Date.now(),
): AppSession[] {
  const byPackage = new Map<string, UsageEvent[]>();
  for (const e of events) {
    const list = byPackage.get(e.packageName) ?? [];
    list.push(e);
    byPackage.set(e.packageName, list);
  }

  const sessions: AppSession[] = [];

  for (const [packageName, list] of byPackage) {
    list.sort((a, b) => a.timestamp - b.timestamp);
    let openStart: number | null = null;

    for (const e of list) {
      if (e.eventType === UsageEventType.Foreground) {
        // Repeated foregrounds happen; keep the earliest.
        if (openStart === null) openStart = e.timestamp;
      } else if (e.eventType === UsageEventType.Background) {
        if (openStart !== null) {
          sessions.push(makeSession(packageName, openStart, e.timestamp, false));
          openStart = null;
        }
      }
    }

    if (openStart !== null) {
      sessions.push(makeSession(packageName, openStart, windowEnd, true));
    }
  }

  sessions.sort((a, b) => a.start - b.start);
  return sessions;
}

function makeSession(
  packageName: string,
  start: number,
  end: number,
  open: boolean,
): AppSession {
  return {
    packageName,
    start,
    end,
    durationMs: Math.max(0, end - start),
    open,
  };
}