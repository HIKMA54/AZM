import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { UsageStatsService } from '../services/UsageStats';
import { ingestRecentEvents } from '../detection/ingest';
import { refreshRollups } from '../detection/rollups';
import { runDetection } from '../detection/engine';
import {
  decideIntervention,
  presentIntervention,
  resumePendingIntervention,
  InterventionDecision,
} from './interventionEngine';

export interface ActiveIntervention {
  decision: InterventionDecision;
  id: number;
}

/**
 * Watches for interventions from inside the app: it re-checks on launch and
 * every time the app returns to the foreground. While the app is closed the
 * background task makes the same decision and posts a notification; when the
 * user then opens Azm, that unanswered intervention is shown here full-screen.
 *
 * Guards: it won't run while a check is in flight or while an intervention is
 * already on screen, and decideIntervention's own cooldown/quiet-hours/cap
 * rules still gate whether anything actually shows.
 */
export function useInterventionWatcher() {
  const [active, setActive] = useState<ActiveIntervention | null>(null);
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (busy.current || active) return;
    busy.current = true;
    try {
      if (!(await UsageStatsService.hasUsageAccess())) return;
      const end = Date.now();
      const { touchedDates } = await ingestRecentEvents(end);
      if (touchedDates.length > 0) refreshRollups(touchedDates);
      const detection = runDetection(end);
      // An unanswered intervention (e.g. the notification the user just
      // tapped) comes first; otherwise its own cooldown would hide it.
      const pending = resumePendingIntervention(detection, end);
      if (pending) {
        setActive(pending);
        return;
      }
      const decision = decideIntervention(detection, end);
      if (decision.shouldIntervene) {
        setActive({ decision, id: presentIntervention(decision, end) });
      }
    } catch {
    } finally {
      busy.current = false;
    }
  }, [active]);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  return { active, clear: useCallback(() => setActive(null), []) };
}