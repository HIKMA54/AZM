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

/** Checks on launch and whenever the app returns to the foreground. */
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
      // Checked first, or its own cooldown would hide it.
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