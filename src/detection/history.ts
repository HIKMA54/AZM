import { query } from '../database/db';
import { toLocalDate } from '../utils/datetime';
import { getSettingNumber } from '../database/settingsRepo';
import { getScopedApps } from '../database/trackedAppsRepo';
import { getBaseline, getLearningPhase } from './baselines';
import {
  LEARNING_PHASE_DAYS,
  DEFAULT_LATE_NIGHT_HOUR,
  DEFAULT_DAILY_GOAL_MIN,
} from './detectionConfig';
import {
  RiskLevel,
  RuleResult,
  deriveRiskLevel,
  impulseOpensRule,
  longSessionRule,
  lateNightRule,
  dailyGoalRule,
} from './rules';

const DAY_MS = 86400000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function weekdayShort(ts: number): string {
  return WEEKDAYS[new Date(ts).getDay()];
}

/**
 * Computes the risk level for a single past day by replaying the same rules the
 * live engine uses, against that day's stored sessions. Baselines are the
 * current ones, so this reads as "how that day compared to your recent usual" —
 * a documented approximation that keeps the whole trend on one consistent ruler.
 */
export function riskForDate(
  date: string,
  now: number = Date.now(),
): { level: RiskLevel; fired: RuleResult[] } {
  const learning = getLearningPhase();
  const lateHour =
    getSettingNumber('late_night_start_hour') ?? DEFAULT_LATE_NIGHT_HOUR;
  const goalMin =
    getSettingNumber('daily_goal_minutes') ?? DEFAULT_DAILY_GOAL_MIN;

  const scoped = getScopedApps();
  if (scoped.length === 0) {
    return { level: 'low', fired: [] };
  }
  const placeholders = scoped.map(() => '?').join(',');
  const apps = query<{ package_name: string }>(
    `SELECT DISTINCT package_name FROM sessions
     WHERE local_date = ? AND package_name IN (${placeholders})`,
    [date, ...scoped],
  ).map(r => r.package_name);

  const rules: RuleResult[] = [];
  for (const pkg of apps) {
    const baseline = getBaseline(pkg);
    const ready =
      !learning.active &&
      baseline != null &&
      baseline.sample_days >= LEARNING_PHASE_DAYS;

    const opens =
      query<{ n: number }>(
        'SELECT COUNT(*) AS n FROM sessions WHERE package_name = ? AND local_date = ?',
        [pkg, date],
      )[0]?.n ?? 0;
    const longest =
      query<{ m: number }>(
        'SELECT MAX(duration_ms) AS m FROM sessions WHERE package_name = ? AND local_date = ?',
        [pkg, date],
      )[0]?.m ?? 0;

    rules.push(impulseOpensRule(pkg, opens, baseline?.avg_opens_day ?? 0, ready));
    rules.push(longSessionRule(pkg, longest, baseline?.avg_session_ms ?? 0, ready));
  }

  const lateOpens =
    query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sessions
       WHERE local_date = ? AND hour_of_day >= ? AND package_name IN (${placeholders})`,
      [date, lateHour, ...scoped],
    )[0]?.n ?? 0;
  rules.push(lateNightRule(lateOpens, lateHour));

  const totalMs =
    query<{ m: number }>(
      `SELECT SUM(duration_ms) AS m FROM sessions
       WHERE local_date = ? AND package_name IN (${placeholders})`,
      [date, ...scoped],
    )[0]?.m ?? 0;
  rules.push(dailyGoalRule(Math.round(totalMs / 60000), goalMin));

  return { level: deriveRiskLevel(rules), fired: rules.filter(r => r.fired) };
}

export interface DaySeries {
  date: string;
  weekday: string;
  hasData: boolean;
  level: RiskLevel;
  opens: number;
  minutes: number;
  lateNightMin: number;
  isToday: boolean;
}

/** The last 7 days, oldest first, with per-day risk and behavioral totals. */
export function getWeeklySeries(now: number = Date.now()): DaySeries[] {
  const lateHour =
    getSettingNumber('late_night_start_hour') ?? DEFAULT_LATE_NIGHT_HOUR;
  const todayStr = toLocalDate(now);
  const days: DaySeries[] = [];
  const scoped = getScopedApps();

  if (scoped.length === 0) {
    for (let i = 6; i >= 0; i--) {
      const ts = now - i * DAY_MS;
      const date = toLocalDate(ts);
      days.push({
        date,
        weekday: weekdayShort(ts),
        hasData: false,
        level: 'low',
        opens: 0,
        minutes: 0,
        lateNightMin: 0,
        isToday: date === todayStr,
      });
    }
    return days;
  }
  const placeholders = scoped.map(() => '?').join(',');

  for (let i = 6; i >= 0; i--) {
    const ts = now - i * DAY_MS;
    const date = toLocalDate(ts);
    const agg =
      query<{ opens: number; total: number; late: number }>(
        `SELECT COUNT(*) AS opens,
                SUM(duration_ms) AS total,
                SUM(CASE WHEN hour_of_day >= ? THEN duration_ms ELSE 0 END) AS late
         FROM sessions WHERE local_date = ? AND package_name IN (${placeholders})`,
        [lateHour, date, ...scoped],
      )[0] ?? { opens: 0, total: 0, late: 0 };

    const hasData = (agg.opens ?? 0) > 0;
    days.push({
      date,
      weekday: weekdayShort(ts),
      hasData,
      level: hasData ? riskForDate(date, now).level : 'low',
      opens: agg.opens ?? 0,
      minutes: Math.round((agg.total ?? 0) / 60000),
      lateNightMin: Math.round((agg.late ?? 0) / 60000),
      isToday: date === todayStr,
    });
  }
  return days;
}

export interface WeeklySummary {
  daysWithData: number;
  avgOpensPerDay: number;
  totalMinutes: number;
  lateNightMinutes: number;
}

export function getWeeklySummary(now: number = Date.now()): WeeklySummary {
  const lateHour =
    getSettingNumber('late_night_start_hour') ?? DEFAULT_LATE_NIGHT_HOUR;
  const start = toLocalDate(now - 6 * DAY_MS);
  const end = toLocalDate(now);
  const scoped = getScopedApps();

  if (scoped.length === 0) {
    return { daysWithData: 0, avgOpensPerDay: 0, totalMinutes: 0, lateNightMinutes: 0 };
  }
  const placeholders = scoped.map(() => '?').join(',');

  const agg =
    query<{ opens: number; total: number; late: number; days: number }>(
      `SELECT COUNT(*) AS opens,
              SUM(duration_ms) AS total,
              SUM(CASE WHEN hour_of_day >= ? THEN duration_ms ELSE 0 END) AS late,
              COUNT(DISTINCT local_date) AS days
       FROM sessions
       WHERE local_date >= ? AND local_date <= ? AND package_name IN (${placeholders})`,
      [lateHour, start, end, ...scoped],
    )[0] ?? { opens: 0, total: 0, late: 0, days: 0 };

  const days = agg.days ?? 0;
  return {
    daysWithData: days,
    avgOpensPerDay: days > 0 ? Math.round((agg.opens ?? 0) / days) : 0,
    totalMinutes: Math.round((agg.total ?? 0) / 60000),
    lateNightMinutes: Math.round((agg.late ?? 0) / 60000),
  };
}

export interface WeekApp {
  packageName: string;
  opens: number;
  minutes: number;
}

export function getTopAppsThisWeek(now: number = Date.now()): WeekApp[] {
  const start = toLocalDate(now - 6 * DAY_MS);
  const end = toLocalDate(now);
  const scoped = getScopedApps();
  if (scoped.length === 0) return [];
  const placeholders = scoped.map(() => '?').join(',');

  return query<{ packageName: string; opens: number; ms: number }>(
    `SELECT package_name AS packageName, COUNT(*) AS opens, SUM(duration_ms) AS ms
     FROM sessions
     WHERE local_date >= ? AND local_date <= ? AND package_name IN (${placeholders})
     GROUP BY package_name ORDER BY ms DESC LIMIT 5`,
    [start, end, ...scoped],
  ).map(a => ({
    packageName: a.packageName,
    opens: a.opens,
    minutes: Math.round((a.ms ?? 0) / 60000),
  }));
}