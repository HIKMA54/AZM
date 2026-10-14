import React from 'react';
import { useInterventionWatcher } from './useInterventionWatcher';
import { InterruptModal } from '../components/InterruptModal';

export function InterventionHost() {
  const { active, clear } = useInterventionWatcher();
  // Remount per intervention so no view or countdown carries over.
  return <InterruptModal key={active?.id ?? 'none'} active={active} onClose={clear} />;
}