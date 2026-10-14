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
export default async function backgroundTask(
  data?: { test?: boolean },
): Promise<void> {
  const test = data?.test === true;
  try {
    initDatabase(); // separate JS context from the app
    if (!(await UsageStatsService.hasUsageAccess())) {
      AzmMonitor?.log?.('background check: skipped, no usage access');
      return;
    }

    const end = Date.now();
    const { touchedDates } = await ingestRecentEvents(end);
    if (touchedDates.length > 0) refreshRollups(touchedDates);

    const detection = runDetection(end);
    // A test run from Settings skips the cooldown and daily cap.
    const decision = decideIntervention(detection, end, { ignoreLimits: test });
    // Visible in logcat under the "Azm" tag, release builds included.
    AzmMonitor?.log?.(
      `background check${test ? ' (test)' : ''}: risk=${detection.riskLevel}, fired=[${detection.firedRules
        .map(r => r.type)
        .join(',')}], decision=${decision.shouldIntervene ? 'intervene' : 'none'} (${decision.reason})`,
    );
    if (decision.shouldIntervene) {
      presentIntervention(decision, end);
      AzmMonitor?.postIntervention(decision.title, decision.body);
    }
  } catch (e: any) {
    AzmMonitor?.log?.(`background check failed: ${e?.message ?? String(e)}`);
  }
}