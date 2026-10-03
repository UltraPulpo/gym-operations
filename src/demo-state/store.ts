import type {
  AcceptedAction,
  ClockPresetId,
  DemoAction,
  DemoState,
  DomainResult,
  ScenarioId,
  UtcInstant,
} from '../domain';
import { createInitialDemoState } from '../demo-fixtures';
import {
  advanceClockBy as buildAdvanceClockBy,
  setClockPresetAction,
} from './clock';
import { demoReducer, DemoReducerError } from './reducer';
import { validateAction } from './validation';

export interface DemoStoreSnapshot {
  readonly state: DemoState;
  readonly hasUnsavedEdits: boolean;
  readonly workspaceVersion: number;
}

export interface SubmitOptions {
  readonly expectedRevision?: number;
}

export interface DemoStore {
  getSnapshot(): DemoStoreSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(accepted: AcceptedAction): void;
  validate(action: DemoAction): DomainResult<AcceptedAction>;
  submit(
    action: DemoAction,
    options?: SubmitOptions,
  ): DomainResult<AcceptedAction>;
  resetDemo(options?: {
    readonly confirmed?: boolean;
  }): DomainResult<AcceptedAction>;
  loadScenario(
    scenarioId: ScenarioId,
    options?: { readonly confirmed?: boolean },
  ): DomainResult<AcceptedAction>;
  advanceClock(to: UtcInstant): DomainResult<AcceptedAction>;
  advanceClockBy(minutes: number): DomainResult<AcceptedAction>;
  setClockPreset(presetId: ClockPresetId): DomainResult<AcceptedAction>;
}

function conflict(
  currentRevision: number,
  expectedRevision: number,
): Extract<DomainResult<never>, { success: false }> {
  return {
    success: false,
    error: {
      category: 'DemoConflict',
      message: 'The demo state changed before this action could be submitted.',
      conflict: {
        kind: 'revision',
        expectedRevision,
        currentRevision,
      },
    },
  };
}

function confirmationRequired(): DomainResult<never> {
  return {
    success: false,
    error: {
      category: 'IneligibleDemoAction',
      reason: 'confirmationRequired',
      message:
        'Confirm replacing local demo edits before resetting or loading a scenario.',
    },
  };
}

function invalidMinutes(): DomainResult<never> {
  return {
    success: false,
    error: {
      category: 'ValidationError',
      message: 'Clock steps require positive whole minutes.',
      fields: [
        {
          field: 'minutes',
          message: 'Clock steps require positive whole minutes.',
        },
      ],
    },
  };
}

function isReplacementAction(
  action: AcceptedAction['action']['type'],
): boolean {
  return action === 'resetDemo' || action === 'loadScenario';
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null ||
    Array.isArray(left) !== Array.isArray(right)
  )
    return false;
  const leftKeys = Reflect.ownKeys(left);
  const rightKeys = Reflect.ownKeys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) &&
        sameValue(Reflect.get(left, key), Reflect.get(right, key)),
    )
  );
}

export function createDemoStore(
  initialState: DemoState = createInitialDemoState(),
): DemoStore {
  let state = initialState;
  let baselineRevision = initialState.revision;
  let snapshot: DemoStoreSnapshot = {
    state,
    hasUnsavedEdits: state.revision !== baselineRevision,
    workspaceVersion: baselineRevision,
  };
  const listeners = new Set<() => void>();

  const refreshSnapshot = (): void => {
    snapshot = {
      state,
      hasUnsavedEdits: state.revision !== baselineRevision,
      workspaceVersion: baselineRevision,
    };
  };

  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const dispatch = (accepted: AcceptedAction): void => {
    if (accepted.baseRevision !== state.revision) {
      throw new DemoReducerError(
        conflict(state.revision, accepted.baseRevision).error,
      );
    }
    const current = validateAction(
      state,
      state.activeActor,
      accepted.action,
      state.clock.now,
    );
    if (!current.success) throw new DemoReducerError(current.error);
    if (!sameValue(accepted, current.value)) {
      throw new DemoReducerError({
        category: 'ValidationError',
        message:
          'The accepted envelope does not match the current validated action.',
        fields: [
          {
            field: 'envelope',
            message:
              'Revalidate this action against the current demo snapshot.',
          },
        ],
      });
    }
    const nextState = demoReducer(state, current.value);
    state = nextState;
    if (isReplacementAction(accepted.action.type)) {
      baselineRevision = nextState.revision;
    }
    refreshSnapshot();
    notify();
  };

  const validate = (action: DemoAction): DomainResult<AcceptedAction> =>
    validateAction(state, state.activeActor, action, state.clock.now);

  const submit = (
    action: DemoAction,
    options: SubmitOptions = {},
  ): DomainResult<AcceptedAction> => {
    if (
      options.expectedRevision !== undefined &&
      options.expectedRevision !== state.revision
    ) {
      return conflict(state.revision, options.expectedRevision);
    }
    const accepted = validate(action);
    if (!accepted.success) return accepted;
    dispatch(accepted.value);
    return accepted;
  };

  const resetDemo = (
    options: { readonly confirmed?: boolean } = {},
  ): DomainResult<AcceptedAction> => {
    if (snapshot.hasUnsavedEdits && options.confirmed !== true) {
      return confirmationRequired();
    }
    return submit({ type: 'resetDemo', payload: { confirmed: true } });
  };

  const loadScenario = (
    scenarioId: ScenarioId,
    options: { readonly confirmed?: boolean } = {},
  ): DomainResult<AcceptedAction> => {
    if (snapshot.hasUnsavedEdits && options.confirmed !== true) {
      return confirmationRequired();
    }
    return submit({
      type: 'loadScenario',
      payload: { scenarioId, confirmed: true },
    });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch,
    validate,
    submit,
    resetDemo,
    loadScenario,
    advanceClock(to) {
      return submit({ type: 'advanceClock', payload: { to } });
    },
    advanceClockBy(minutes) {
      let action: DemoAction;
      try {
        action = buildAdvanceClockBy(state, minutes);
      } catch (error) {
        if (error instanceof RangeError) return invalidMinutes();
        throw error;
      }
      return submit(action);
    },
    setClockPreset(presetId) {
      return submit(setClockPresetAction(presetId));
    },
  };
}
