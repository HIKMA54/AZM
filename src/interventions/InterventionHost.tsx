import React from 'react';
import { useInterventionWatcher } from './useInterventionWatcher';
import { InterruptModal } from '../components/InterruptModal';

/**
 * Top-level overlay that ties the watcher to the interrupt surface. Rendered
 * once, above the whole app, so an intervention can appear over any screen.
 */
export function InterventionHost() {
  const { active, clear } = useInterventionWatcher();
  return <InterruptModal active={active} onClose={clear} />;
}