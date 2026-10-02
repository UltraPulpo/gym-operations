import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';
import type {
  AcceptedAction,
  ClockPreset,
  DemoCapabilities,
  DemoScenario,
  DemoState,
  DomainResult,
  UtcInstant,
} from '../domain';
import { selectClockPresets } from './clock';
import { selectCapabilities, selectScenarios } from './selectors';
import type { DemoStore } from './store';

export interface DemoStateApi {
  /** Validation snapshot only; render role-aware selector projections, not raw records. */
  readonly state: DemoState;
  readonly revision: number;
  readonly activeActor: DemoState['activeActor'];
  readonly now: UtcInstant;
  readonly capabilities: DomainResult<DemoCapabilities>;
  readonly hasUnsavedEdits: boolean;
  readonly dispatch: (accepted: AcceptedAction) => void;
  readonly validate: DemoStore['validate'];
  readonly submit: DemoStore['submit'];
  readonly resetDemo: DemoStore['resetDemo'];
  readonly loadScenario: DemoStore['loadScenario'];
  readonly advanceClock: DemoStore['advanceClock'];
  readonly advanceClockBy: DemoStore['advanceClockBy'];
  readonly setClockPreset: DemoStore['setClockPreset'];
  readonly clockPresets: DomainResult<readonly ClockPreset[]>;
  readonly scenarios: readonly DemoScenario[];
}

export const DemoStateContext = createContext<DemoStore | null>(null);

export function useDemoState(): DemoStateApi {
  const store = useContext(DemoStateContext);
  if (!store) {
    throw new Error('useDemoState must be used within a DemoStateProvider.');
  }

  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  return useMemo(
    () => ({
      state: snapshot.state,
      revision: snapshot.state.revision,
      activeActor: snapshot.state.activeActor,
      now: snapshot.state.clock.now,
      capabilities: selectCapabilities(snapshot.state),
      hasUnsavedEdits: snapshot.hasUnsavedEdits,
      dispatch: store.dispatch,
      validate: store.validate,
      submit: store.submit,
      resetDemo: store.resetDemo,
      loadScenario: store.loadScenario,
      advanceClock: store.advanceClock,
      advanceClockBy: store.advanceClockBy,
      setClockPreset: store.setClockPreset,
      clockPresets: selectClockPresets(snapshot.state),
      scenarios: selectScenarios(snapshot.state),
    }),
    [snapshot, store],
  );
}
