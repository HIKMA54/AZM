import { query } from '../database/db';
import { toLocalDate } from '../utils/datetime';
import { getSetting, getSettingNumber } from '../database/settingsRepo';
import { getScopedApps } from '../database/trackedAppsRepo';
import { getOpensForApp } from '../database/sessionsRepo';
import { refreshBaselines, getBaseline, getLearningPhase } from './baselines';
import {
  LEARNING_PHASE_DAYS,
  DEFAULT_LATE_NIGHT_HOUR,
  DEFAULT_DAILY_GOAL_MIN,
} from './detectionConfig';
import {
  RuleResult,
  RiskLevel,
  deriveRiskLevel,
  impulseOpensRule,
  longSessionRule,
  lateNightRule,
  dailyGoalRule,
} from './rules';

export interface DetectionResult {
  date: string;
  riskLevel: RiskLevel;
  learningPhase: { active: boolean; day: number; of: number };
  rules: RuleResult[]; // fired or not
  firedRules: RuleResult[];
  withinQuietHours: boolean;
}

function getLongestSessionMs(pkg: string, date: string): number {
  return (
    query<{ m: number }>(
      'SELECT MAX(duration_ms) AS m FROM sessions WHERE package_name = ? AND local_date = ?',
      [pkg, date],
    )[0]?.m ?? 0
  );
}

function getLateNightOpens(
  date: string,
  sinceHour: number,
  apps: string[],
): number {
  if (apps.length === 0) return 0;
  const placeholders = apps.map(() => '?').join(',');
  return (
    query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sessions
       WHERE local_date = ? AND hour_of_day >= ? AND package_name IN (${placeholders})`,
      [date, sinceHour, ...apps],
    )[0]?.n ?? 0
  );
}

function getTotalMsForDate(date: string, apps: string[]): number {
  if (apps.length === 0) return 0;
  const placeholders = apps.map(() => '?').join(',');
  return (
    query<{ m: number }>(
      `SELECT SUM(duration_ms) AS m FROM sessions
       WHERE local_date = ? AND package_name IN (${placeholders})`,
      [date, ...apps],
    )[0]?.m ?? 0
  );
}

/** 'HH:MM' -> minutes since midnight. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** The window may wrap past midnight (e.g. 22:00 -> 07:00). */
function isWithinQuietHours(now: number): boolean {
  const start = getSetting('quiet_hours_start');
  const end = getSetting('quiet_hours_end');
  if (!start || !end) return false;

  const d = new Date(now);
  const cur = d.getHours() * 60 + d.getMinutes();
  const s = toMinutes(start);
  const e = toMinutes(end);

  return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
}

/**
 * Evaluates every rule for `now` and derives a risk level. Per-app rules use
 * each app's own baseline; late-night and daily-goal run across all scoped
 * apps. Callers refresh rollups first. Read-only apart from baselines.
 */
export function runDetection(now: number = Date.now()): DetectionResult {
  refreshBaselines(now);

  const date = toLocalDate(now);
  const learningPhase = getLearningPhase();
  const apps = getScopedApps();
  const lateHour =
    getSettingNumber('late_night_start_hour') ?? DEFAULT_LATE_NIGHT_HOUR;
  const goalMin =
    getSettingNumber('daily_goal_minutes') ?? DEFAULT_DAILY_GOAL_MIN;

  const rules: RuleResult[] = [];

  // Per-app, baseline-dependent rules.
  for (const pkg of apps) {
    const baseline = getBaseline(pkg);
    const baselineReady =
      !learningPhase.active &&
      baseline != null &&
      baseline.sample_days >= LEARNING_PHASE_DAYS;

    rules.push(
      impulseOpensRule(
        pkg,
        getOpensForApp(pkg, date),
        baseline?.avg_opens_day ?? 0,
        baselineReady,
      ),
    );
    rules.push(
      longSessionRule(
        pkg,
        getLongestSessionMs(pkg, date),
        baseline?.avg_session_ms ?? 0,
        baselineReady,
      ),
    );
  }

  // Aggregate, absolute rules.
  rules.push(lateNightRule(getLateNightOpens(date, lateHour, apps), lateHour));
  const usedMin = Math.round(getTotalMsForDate(date, apps) / 60000);
  rules.push(dailyGoalRule(usedMin, goalMin));

  return {
    date,
    riskLevel: deriveRiskLevel(rules),
    learningPhase,
    rules,
    firedRules: rules.filter(r => r.fired),
    withinQuietHours: isWithinQuietHours(now),
  };
}