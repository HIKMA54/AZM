import { useCallback, useEffect, useState } from 'react';
import { UsageStatsService } from '../services/UsageStats';
import { sessionize } from '../detection/sessionize';
import { saveSessions } from '../database/sessionsRepo';
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

function prettyName(pkg: string): string {
  const last = pkg.split('.').pop() ?? pkg;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

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
      // Best-effort: pull the latest events so today is current. Historical
      // insights still render from stored data if access isn't granted.
      try {
        if (await UsageStatsService.hasUsageAccess()) {
          const end = Date.now();
          saveSessions(
            sessionize(await UsageStatsService.queryEvents(end - 86400000, end), end),
          );
        }
      } catch {}

      refreshRollups();
      refreshBaselines();

      const stats = getBreakAcceptanceStats();
      setModel({
        series: getWeeklySeries(),
        summary: getWeeklySummary(),
        breaks: { accepted: stats.accepted, total: stats.total },
        topApps: getTopAppsThisWeek().map(a => ({ ...a, name: prettyName(a.packageName) })),
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