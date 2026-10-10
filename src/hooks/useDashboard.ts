import { useCallback, useEffect, useState } from 'react';
import { UsageStatsService } from '../services/UsageStats';
import { ingestRecentEvents } from '../detection/ingest';
import { refreshRollups } from '../detection/rollups';
import { query } from '../database/db';
import { getScopedApps, getTrackedNameMap } from '../database/trackedAppsRepo';
import { toLocalDate } from '../utils/datetime';
import { runDetection } from '../detection/engine';
import { RiskLevel } from '../detection/rules';
import { getBreakAcceptanceStats } from '../interventions/interventionsRepo';
import { resolveAppName, displayAppName } from '../utils/appNames';

export interface AppUsage {
  packageName: string;
  name: string;
  opens: number;
  minutes: number;
}

export interface DashboardModel {
  headline: string; // the plain-language daily read
  subline: string;
  riskLevel: RiskLevel;
  learningPhase: { active: boolean; day: number; of: number };
  opensToday: number;
  longestMin: number;
  totalMin: number;
  breaks: { accepted: number; total: number };
  insights: string[]; // plain-language lines from fired rules
  topApps: AppUsage[];
}

export type DashboardPhase = 'loading' | 'needsPermission' | 'ready' | 'error';

function timeOfDayGreeting(now: number): string {
  const h = new Date(now).getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Turns a fired rule into one plain-language line for the dashboard. */
function insightLine(rule: any, trackedNames: Map<string, string>): string {
  const d = rule.detail ?? {};
  const app = displayAppName(rule.packageName, trackedNames);
  switch (rule.type) {
    case 'daily_goal':
      return `You've passed your ${d.goalMin}-minute goal — ${d.usedMin} minutes so far.`;
    case 'long_session':
      return `A long stretch on ${app}: ${d.sessionMin} minutes, more than your usual ${d.usualMin}.`;
    case 'impulse_opens':
      return `You opened ${app} ${d.opens} times — more than your usual ${d.usual}.`;
    case 'late_night':
      return `You were still scrolling after ${d.sinceHour}:00.`;
    default:
      return 'Something looked a little off today.';
  }
}

function headlineFor(
  risk: RiskLevel,
  learning: { active: boolean; day: number; of: number },
): { headline: string; subline: string } {
  if (learning.active) {
    return {
      headline: 'Still learning your rhythm.',
      subline: `Day ${learning.day} of ${learning.of}. Azm needs a week to know your usual before it flags anything unusual.`,
    };
  }
  if (risk === 'high') {
    return {
      headline: "Today's been a heavy day.",
      subline: 'A few patterns pulled hard at your attention. No judgment — just worth seeing.',
    };
  }
  if (risk === 'medium') {
    return {
      headline: 'A few things tugged at your attention.',
      subline: 'Nothing alarming, but a couple of moments stood out below.',
    };
  }
  return {
    headline: 'Your attention looks steady today.',
    subline: 'Nothing pulled you off track. Keep it easy.',
  };
}

export function useDashboard() {
  const [phase, setPhase] = useState<DashboardPhase>('loading');
  const [model, setModel] = useState<DashboardModel | null>(null);

  const load = useCallback(async () => {
    try {
      const granted = await UsageStatsService.hasUsageAccess();
      if (!granted) {
        setPhase('needsPermission');
        return;
      }

      const end = Date.now();
      const { touchedDates } = await ingestRecentEvents(end);
      if (touchedDates.length > 0) refreshRollups(touchedDates);

      const detection = runDetection(end);
      const date = toLocalDate(end);
      const trackedNames = getTrackedNameMap();

      // Today's figures are scoped to the exact same app list detection just
      // used — tracked apps only (or every observed app minus the home
      // launcher/System UI/Azm, before anything's been tracked).
      const scoped = getScopedApps();
      const placeholders = scoped.map(() => '?').join(',');

      const totals =
        scoped.length === 0
          ? { opens: 0, longest: 0, total: 0 }
          : query<{ opens: number; longest: number; total: number }>(
              `SELECT COUNT(*) AS opens, MAX(duration_ms) AS longest, SUM(duration_ms) AS total
               FROM sessions WHERE local_date = ? AND package_name IN (${placeholders})`,
              [date, ...scoped],
            )[0] ?? { opens: 0, longest: 0, total: 0 };

      const apps =
        scoped.length === 0
          ? []
          : query<{ packageName: string; opens: number; ms: number }>(
              `SELECT package_name AS packageName, COUNT(*) AS opens, SUM(duration_ms) AS ms
               FROM sessions WHERE local_date = ? AND package_name IN (${placeholders})
               GROUP BY package_name ORDER BY ms DESC LIMIT 4`,
              [date, ...scoped],
            );

      const stats = getBreakAcceptanceStats();
      const { headline, subline } = headlineFor(
        detection.riskLevel,
        detection.learningPhase,
      );

      const topApps = await Promise.all(
        apps.map(async a => ({
          packageName: a.packageName,
          name: await resolveAppName(a.packageName, trackedNames),
          opens: a.opens,
          minutes: Math.round((a.ms ?? 0) / 60000),
        })),
      );

      setModel({
        headline,
        subline,
        riskLevel: detection.riskLevel,
        learningPhase: detection.learningPhase,
        opensToday: totals.opens ?? 0,
        longestMin: Math.round((totals.longest ?? 0) / 60000),
        totalMin: Math.round((totals.total ?? 0) / 60000),
        breaks: { accepted: stats.accepted, total: stats.total },
        insights: detection.firedRules.map(r => insightLine(r, trackedNames)),
        topApps,
      });
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return {
    phase,
    model,
    refresh: load,
    greeting: timeOfDayGreeting(Date.now()),
    openUsageSettings: () => UsageStatsService.openUsageAccessSettings(),
  };
}