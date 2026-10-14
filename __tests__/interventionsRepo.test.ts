// Run under more than one TZ so the daylight-saving days below are exercised.
jest.mock('../src/database/db', () => {
  const state: { rows: any[]; calls: { sql: string; params: any[] }[] } = {
    rows: [],
    calls: [],
  };
  return {
    __state: state,
    run: jest.fn(),
    query: jest.fn((sql: string, params: any[] = []) => {
      state.calls.push({ sql, params });
      if (sql.includes('COUNT(*) AS n FROM interventions WHERE shown_at >=')) {
        return [{ n: state.rows.filter(r => r.shown_at >= params[0]).length }];
      }
      if (sql.includes('trigger_type, trigger_detail, response FROM interventions')) {
        return state.rows
          .filter(r => r.shown_at >= params[0] && r.shown_at < params[1])
          .sort((a, b) => b.shown_at - a.shown_at);
      }
      return [];
    }),
  };
});

import {
  countInterventionsToday,
  getYesterdayBreakMemory,
} from '../src/interventions/interventionsRepo';

const db = jest.requireMock('../src/database/db').__state;

function localMidnight(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

beforeEach(() => {
  db.rows = [];
  db.calls = [];
});

// Days chosen to include the US spring-forward and fall-back transitions.
const DAYS: [number, number, number][] = [
  [2026, 10, 10],
  [2026, 3, 9], // day after US spring-forward (8 Mar 2026)
  [2026, 11, 2], // day after US fall-back (1 Nov 2026)
  [2027, 1, 1],
];

describe('countInterventionsToday', () => {
  it.each(DAYS)('counts from local midnight on %i-%i-%i', (y, m, d) => {
    const midnight = localMidnight(y, m, d);
    countInterventionsToday(midnight + 15 * 3600 * 1000);
    expect(db.calls[0].params).toEqual([midnight]);
  });
});

describe('getYesterdayBreakMemory', () => {
  it.each(DAYS)('queries exactly yesterday on %i-%i-%i', (y, m, d) => {
    const midnight = localMidnight(y, m, d);
    const yesterday = new Date(y, m - 1, d - 1, 0, 0, 0, 0).getTime();
    getYesterdayBreakMemory(midnight + 9 * 3600 * 1000);
    expect(db.calls[0].params).toEqual([yesterday, midnight]);
  });

  const now = localMidnight(2026, 10, 10) + 10 * 3600 * 1000;
  const y = localMidnight(2026, 10, 9);
  const row = (h: number, trigger: string, response: string, detail: object = {}) => ({
    shown_at: y + h * 3600 * 1000,
    trigger_type: trigger,
    trigger_detail: JSON.stringify(detail),
    response,
  });

  it('is null with no breaks taken', () => {
    db.rows = [row(20, 'impulse_opens', 'kept_scrolling')];
    expect(getYesterdayBreakMemory(now)).toBeNull();
  });

  it('prefers the length of a long session that ended in a break', () => {
    db.rows = [
      row(14, 'long_session', 'accepted_break', { sessionMin: 34.6 }),
      row(20, 'impulse_opens', 'kept_scrolling'),
    ];
    expect(getYesterdayBreakMemory(now)).toBe('Yesterday you took a break after 35 minutes.');
  });

  it('uses the single-break wording', () => {
    db.rows = [row(20, 'late_night', 'accepted_break')];
    expect(getYesterdayBreakMemory(now)).toBe('Yesterday you took the break Azm suggested.');
  });

  it('counts accepted out of decided, ignoring snoozes', () => {
    db.rows = [
      row(10, 'impulse_opens', 'accepted_break'),
      row(12, 'impulse_opens', 'kept_scrolling'),
      row(13, 'daily_goal', 'accepted_break'),
      row(15, 'daily_goal', 'snoozed'),
    ];
    expect(getYesterdayBreakMemory(now)).toBe(
      'Yesterday you took 2 of the 3 breaks Azm suggested.',
    );
  });
});
