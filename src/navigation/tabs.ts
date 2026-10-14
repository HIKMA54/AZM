import { createContext, useContext } from 'react';

export type TabKey = 'today' | 'insights' | 'settings';

export const TabContext = createContext<(tab: TabKey) => void>(() => {});

export function useGoToTab(): (tab: TabKey) => void {
  return useContext(TabContext);
}
