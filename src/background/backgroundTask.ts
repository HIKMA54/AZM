import { NativeModules } from 'react-native';
import { UsageStatsService } from '../services/UsageStats';
import { sessionize } from '../detection/sessionize';
import { initDatabase } from '../database/db';
import { saveSessions } from '../database/sessionsRepo';
import { runDetection } from '../detection/engine';
import {
  decideIntervention,
  presentIntervention,
} from '../interventions/interventionEngine';

const { AzmMonitor } = NativeModules;

/**
 * The headless background task. Runs with no UI when the foreground service
 * ticks. It reuses the exact same engine the app uses — pull events, run
 * detection, decide — and if an intervention is warranted, logs it and posts an
 * OS notification (since the app isn't open to show the in-app interrupt).
 *
 * It must never throw: a crash here would take down the background process, so
 * everything is wrapped defensively.
 */
export default async function backgroundTask(): Promise<void> {
  try {
    initDatabase(); // ensure the DB is open in this headless JS context
    if (!(await UsageStatsService.hasUsageAccess())) return;

    const end = Date.now();
    saveSessions(
      sessionize(await UsageStatsService.queryEvents(end - 86400000, end), end),
    );

    const decision = decideIntervention(runDetection(end), end);
    if (decision.shouldIntervene) {
      presentIntervention(decision, end); // record it in the interventions log
      AzmMonitor?.postIntervention(decision.title, decision.body); // OS nudge
    }
  } catch {
    // Swallow — a background task must fail quietly, never crash the process.
  }
}