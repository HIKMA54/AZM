import { createContext, useContext } from 'react';

export type TabKey = 'today' | 'insights' | 'settings';

/**
 * Lets a screen switch tabs without prop drilling, e.g. the "why" sheet's
 * "Adjust nudge settings" button jumping to Settings. AppNavigator provides it.
 */
export const TabContext = createContext<(tab: TabKey) => void>(() => {});

export function useGoToTab(): (tab: TabKey) => void {
  return useContext(TabContext);
}
