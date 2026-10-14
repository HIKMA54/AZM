import { NativeModules } from 'react-native';
import { UsageStatsService } from '../services/UsageStats';
import { initDatabase } from '../database/db';
import { ingestRecentEvents } from '../detection/ingest';
import { refreshRollups } from '../detection/rollups';
import { runDetection } from '../detection/engine';
import {
  decideIntervention,
  presentIntervention,
} from '../interventions/interventionEngine';

const { AzmMonitor } = NativeModules;

/**
 * The headless background task. Runs with no UI when the foreground service
 * ticks. It reuses the exact same engine the app uses — pull events, run
 * detection, decide — and if an intervention is warranted, logs it and hands it
 * to the native side, which brings Azm to the front with the full-screen
 * interrupt if "Display over other apps" is granted, or posts a notification.
 *
 * It must never throw: a crash here would take down the background process, so
 * everything is wrapped defensively.
 */
export default async function backgroundTask(): Promise<void> {
  try {
    initDatabase(); // ensure the DB is open in this headless JS context
    if (!(await UsageStatsService.hasUsageAccess())) return;

    const end = Date.now();
    const { touchedDates } = await ingestRecentEvents(end);
    if (touchedDates.length > 0) refreshRollups(touchedDates);

    const decision = decideIntervention(runDetection(end), end);
    if (decision.shouldIntervene) {
      presentIntervention(decision, end); // record it in the interventions log
      AzmMonitor?.postIntervention(decision.title, decision.body); // interrupt or notification
    }
  } catch {
    // Swallow — a background task must fail quietly, never crash the process.
  }
}