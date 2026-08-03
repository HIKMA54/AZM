import { AppSession, UsageEvent, UsageEventType } from '../services/usageTypes';

/**
 * Reconstructs discrete app sessions from a flat list of foreground/background
 * events. A session is a MOVE_TO_FOREGROUND paired with the next
 * MOVE_TO_BACKGROUND for the same package.
 *
 * This is the seam between raw OS data and Azm's detection engine: impulse
 * opens (count of sessions), session length (duration), time-of-day and
 * late-night use (session.start) are all read off the sessions produced here,
 * so no behavioural claim depends on anything the sessionizer can't show.
 *
 * @param events    raw events, in any order
 * @param windowEnd epoch ms used to cap a session still open at query time
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
        // A second foreground without an intervening background can happen;
        // keep the earliest start so the session isn't artificially shortened.
        if (openStart === null) openStart = e.timestamp;
      } else if (e.eventType === UsageEventType.Background) {
        if (openStart !== null) {
          sessions.push(makeSession(packageName, openStart, e.timestamp, false));
          openStart = null;
        }
      }
    }

    // Still in the foreground at the end of the window: cap the session.
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