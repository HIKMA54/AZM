import { useCallback, useEffect, useState } from 'react';
import { UsageStatsService } from '../services/UsageStats';
import { ingestRecentEvents } from '../detection/ingest';
import { getTrackedNameMap } from '../database/trackedAppsRepo';
import { refreshRollups } from '../detection/rollups';
import { refreshBaselines } from '../detection/baselines';
import {
  getWeeklySeries,
  getWeeklySummary,
  getTopAppsThisWeek,
  DaySeries,
  WeeklySummary,
  WeekApp,
} from '../detection/history';
import { getBreakAcceptanceStats } from '../interventions/interventionsRepo';
import { resolveAppName } from '../utils/appNames';

export interface InsightsModel {
  series: DaySeries[];
  summary: WeeklySummary;
  breaks: { accepted: number; total: number };
  topApps: (WeekApp & { name: string })[];
}

export function useInsights() {
  const [model, setModel] = useState<InsightsModel | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Best-effort; stored history still renders without usage access.
      try {
        if (await UsageStatsService.hasUsageAccess()) {
          const { touchedDates } = await ingestRecentEvents(Date.now());
          if (touchedDates.length > 0) refreshRollups(touchedDates);
        }
      } catch {}

      refreshBaselines();

      const stats = getBreakAcceptanceStats();
      const trackedNames = getTrackedNameMap();
      const topApps = await Promise.all(
        getTopAppsThisWeek().map(async a => ({
          ...a,
          name: await resolveAppName(a.packageName, trackedNames),
        })),
      );
      setModel({
        series: getWeeklySeries(),
        summary: getWeeklySummary(),
        breaks: { accepted: stats.accepted, total: stats.total },
        topApps,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { model, loading, refresh: load };
}