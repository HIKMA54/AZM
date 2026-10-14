jest.mock('../src/services/UsageStats', () => ({
  UsageStatsService: { getAppLabel: jest.fn() },
}));
jest.mock('../src/database/trackedAppsRepo', () => ({
  getTrackedNameMap: () => new Map([['com.zhiliaoapp.musically', 'TikTok']]),
}));
jest.mock('../src/database/db', () => {
  const state: { rows: any[] } = { rows: [] };
  return {
    __state: state,
    run: jest.fn(),
    query: jest.fn((sql: string, params: any[] = []) => {
      if (sql.includes("WHERE response = 'no_response' AND shown_at >= ?")) {
        return state.rows
          .filter(r => r.response === 'no_response' && r.shown_at >= params[0])
          .sort((a, b) => b.shown_at - a.shown_at)
          .slice(0, 1);
      }
      if (sql.includes('WHERE shown_at >= ? AND shown_at < ?')) {
        return [
          { n: state.rows.filter(r => r.shown_at >= params[0] && r.shown_at < params[1]).length },
        ];
      }
      return [];
    }),
  };
});

import { resumePendingIntervention } from '../src/interventions/interventionEngine';
import { FRICTION_BASE_SEC, FRICTION_STEP_SEC } from '../src/interventions/interventionConfig';

const db = jest.requireMock('../src/database/db').__state;
const now = new Date(2026, 9, 11, 21, 0).getTime();
const min = 60 * 1000;
const detection = (riskLevel: 'low' | 'medium' | 'high') => ({ riskLevel } as any);

const row = (over: Partial<any>) => ({
  id: 7,
  package_name: 'com.zhiliaoapp.musically',
  trigger_type: 'impulse_opens',
  trigger_detail: JSON.stringify({ opens: 7, usual: 2 }),
  shown_at: now - 5 * min,
  response: 'no_response',
  ...over,
});

beforeEach(() => {
  db.rows = [];
});

it('returns null when nothing is pending', () => {
  expect(resumePendingIntervention(detection('high'), now)).toBeNull();
});

it('reopens an unanswered intervention with its original copy and id', () => {
  db.rows = [row({})];
  const r = resumePendingIntervention(detection('high'), now)!;
  expect(r.id).toBe(7);
  expect(r.decision.shouldIntervene).toBe(true);
  expect(r.decision.level).toBe('interrupt');
  expect(r.decision.body).toContain('TikTok 7 times');
  expect(r.decision.firedRules).toHaveLength(1);
});

it('ignores answered or stale interventions', () => {
  db.rows = [
    row({ id: 1, response: 'accepted_break' }),
    row({ id: 2, shown_at: now - 40 * min }),
  ];
  expect(resumePendingIntervention(detection('high'), now)).toBeNull();
});

it('keeps the friction it had when first shown', () => {
  db.rows = [
    row({ id: 1, shown_at: now - 120 * min, response: 'kept_scrolling' }),
    row({ id: 2, shown_at: now - 5 * min }),
  ];
  const r = resumePendingIntervention(detection('medium'), now)!;
  expect(r.decision.level).toBe('gentle');
  expect(r.decision.frictionSec).toBe(FRICTION_BASE_SEC + FRICTION_STEP_SEC);
});

it('handles aggregate rules stored without an app', () => {
  db.rows = [
    row({
      package_name: '*',
      trigger_type: 'daily_goal',
      trigger_detail: JSON.stringify({ usedMin: 130, goalMin: 120, overMin: 10 }),
    }),
  ];
  const r = resumePendingIntervention(detection('high'), now)!;
  expect(r.decision.packageName).toBeNull();
  expect(r.decision.title).toBe("You've reached today's goal");
});
