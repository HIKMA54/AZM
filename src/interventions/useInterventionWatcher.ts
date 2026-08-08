import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { UsageStatsService } from '../services/UsageStats';
import { sessionize } from '../detection/sessionize';
import { saveSessions } from '../database/sessionsRepo';
import { runDetection } from '../detection/engine';
import {
  decideIntervention,
  presentIntervention,
  InterventionDecision,
} from './interventionEngine';

export interface ActiveIntervention {
  decision: InterventionDecision;
  id: number;
}

/**
 * Watches for interventions from inside the app: it re-checks on launch and
 * every time the app returns to the foreground. That foreground check is a
 * stand-in for the background service (next step) — once that exists, the same
 * decision path runs continuously instead of only when the app is opened.
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
      saveSessions(
        sessionize(await UsageStatsService.queryEvents(end - 86400000, end), end),
      );
      const decision = decideIntervention(runDetection(end), end);
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