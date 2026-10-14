jest.mock('../src/interventions/interventionsRepo', () => ({
  recordResponse: jest.fn(),
  getBreakAcceptanceStats: () => ({ accepted: 1, total: 1, rate: 1 }),
  getYesterdayBreakMemory: () => null,
}));
jest.mock('../src/components/WhyModal', () => ({ WhyContent: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { InterruptModal } from '../src/components/InterruptModal';
import { recordResponse } from '../src/interventions/interventionsRepo';

const active = {
  id: 3,
  decision: {
    shouldIntervene: true,
    reason: '',
    level: 'interrupt',
    trigger: null,
    firedRules: [],
    packageName: null,
    title: 'This is a long one',
    body: 'body',
    frictionSec: 15,
    options: [
      { label: 'Take a break', response: 'accepted_break', delaySec: 0 },
      { label: 'Keep scrolling', response: 'kept_scrolling', delaySec: 15 },
      { label: 'Not now', response: 'snoozed', delaySec: 5 },
    ],
  },
} as any;

// The option buttons are the only ones with accessibilityState and onPress.
function buttons(r: ReactTestRenderer.ReactTestRenderer) {
  const seen = new Set<string>();
  return r.root
    .findAll(n => !!n.props.accessibilityState && typeof n.props.onPress === 'function')
    .filter(n => {
      const label = n.findAll(c => typeof c.props.children === 'string')[0].props.children;
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
}

function labels(r: ReactTestRenderer.ReactTestRenderer) {
  return buttons(r).map(b => [
    b.findAll(c => typeof c.props.children === 'string')[0].props.children,
    b.props.accessibilityState.disabled,
  ]);
}

beforeEach(() => {
  jest.useFakeTimers();
  (recordResponse as jest.Mock).mockClear();
});
afterEach(() => jest.useRealTimers());

it('counts each option down separately', () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(<InterruptModal active={active} onClose={jest.fn()} />);
  });

  expect(labels(r)).toEqual([
    ['Take a break', false],
    ['Keep scrolling (15s)', true],
    ['Not now (5s)', true],
  ]);

  act(() => {
    jest.advanceTimersByTime(6000);
  });
  expect(labels(r)).toEqual([
    ['Take a break', false],
    ['Keep scrolling (9s)', true],
    ['Not now', false],
  ]);

  const notNow = buttons(r)[2];
  act(() => notNow.props.onPress());
  expect(recordResponse).toHaveBeenCalledWith(3, 'snoozed');
});
