import { toLocalDate, hourOfDay } from '../src/utils/datetime';

describe('datetime', () => {
  it('formats a local date with zero padding', () => {
    expect(toLocalDate(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  });

  it('keeps a 00:30 session on its own local day and hour', () => {
    const t = new Date(2026, 9, 10, 0, 30).getTime();
    expect(toLocalDate(t)).toBe('2026-10-10');
    expect(hourOfDay(t)).toBe(0);
  });
});
