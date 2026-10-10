jest.mock('../src/services/UsageStats', () => ({
  UsageStatsService: { getAppLabel: jest.fn() },
}));

import { displayAppName, resolveAppName } from '../src/utils/appNames';
import { UsageStatsService } from '../src/services/UsageStats';

const getAppLabel = UsageStatsService.getAppLabel as jest.Mock;
const tracked = new Map([['com.zhiliaoapp.musically', 'TikTok']]);

describe('displayAppName', () => {
  it('uses the tracked app label first', () => {
    expect(displayAppName('com.zhiliaoapp.musically', tracked)).toBe('TikTok');
  });

  it('falls back to a capitalised guess from the package id', () => {
    expect(displayAppName('com.instagram.android', tracked)).toBe('Android');
    expect(displayAppName('com.example.reddit', tracked)).toBe('Reddit');
  });

  it('says "an app" for aggregate rules with no package', () => {
    expect(displayAppName(null, tracked)).toBe('an app');
  });

  it('reuses a label already resolved natively this session', async () => {
    getAppLabel.mockResolvedValueOnce('Snapchat');
    expect(await resolveAppName('com.snapchat.android', new Map())).toBe('Snapchat');
    expect(displayAppName('com.snapchat.android', new Map())).toBe('Snapchat');
  });
});
