import type { DemoActor, DemoState } from '../domain';
import { createInitialDemoState } from '../demo-fixtures';
import { loadScenario } from '../demo-scenarios';
import { validateAction } from '../demo-state';

export interface DemoTestStateOptions {
  readonly scenarioId?: string;
  readonly actor?: DemoActor;
}

export function createDemoTestState({
  scenarioId,
  actor,
}: DemoTestStateOptions = {}): DemoState {
  let state: DemoState;
  if (scenarioId === undefined) {
    state = createInitialDemoState();
  } else {
    const loaded = loadScenario(scenarioId);
    if (!loaded.success) {
      throw new Error(
        `Cannot set up demo scenario "${scenarioId}": ${loaded.error.message}`,
      );
    }
    state = loaded.value.snapshot;
  }

  if (actor === undefined) return state;

  const selectedActor = { ...actor };
  const result = validateAction(
    state,
    state.activeActor,
    { type: 'selectActor', payload: { actor: selectedActor } },
    state.clock.now,
  );
  if (!result.success) {
    throw new Error(`Cannot set up demo actor: ${result.error.message}`);
  }
  // Setup chooses a persona without making the pristine store appear edited.
  return { ...state, activeActor: selectedActor };
}
