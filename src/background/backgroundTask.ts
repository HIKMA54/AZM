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
 * Headless task run on each foreground-service tick. Same pipeline as the app:
 * ingest, detect, decide, then hand any intervention to the native side.
 * Never throws, since that would kill the background process.
 */
export default async function backgroundTask(): Promise<void> {
  try {
    initDatabase(); // separate JS context from the app
    if (!(await UsageStatsService.hasUsageAccess())) return;

    const end = Date.now();
    const { touchedDates } = await ingestRecentEvents(end);
    if (touchedDates.length > 0) refreshRollups(touchedDates);

    const decision = decideIntervention(runDetection(end), end);
    if (decision.shouldIntervene) {
      presentIntervention(decision, end);
      AzmMonitor?.postIntervention(decision.title, decision.body);
    }
  } catch {}
}