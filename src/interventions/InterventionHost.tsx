import React from 'react';
import { useInterventionWatcher } from './useInterventionWatcher';
import { InterruptModal } from '../components/InterruptModal';

export function InterventionHost() {
  const { active, clear } = useInterventionWatcher();
  return <InterruptModal active={active} onClose={clear} />;
}