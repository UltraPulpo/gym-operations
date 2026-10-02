import { expect } from 'vitest';
import type {
  AcceptedAction,
  DemoAction,
  DemoActor,
  DemoState,
  DomainResult,
  UtcInstant,
} from '../domain';
import { createInitialDemoState, FIXTURE_IDS as ids } from '../demo-fixtures';
import { demoReducer } from './reducer';

export function expectSuccess<T>(result: DomainResult<T>): T {
  expect(result.success).toBe(true);
  if (!result.success) {
    throw new Error(result.error.message);
  }
  return result.value;
}

export function expectFailure<T>(result: DomainResult<T>) {
  expect(result.success).toBe(false);
  if (result.success) {
    throw new Error('Expected a failure result.');
  }
  return result.error;
}

export function applyAccepted(
  state: DemoState,
  accepted: AcceptedAction,
): DemoState {
  return demoReducer(state, accepted);
}

export function freshState(): DemoState {
  return createInitialDemoState();
}

export function withActor(state: DemoState, actor: DemoActor): DemoState {
  return { ...state, activeActor: actor };
}

export function withNow(state: DemoState, now: UtcInstant): DemoState {
  return {
    ...state,
    clock: { ...state.clock, now, presetId: null },
  };
}

export function adminActor(): DemoActor {
  return { kind: 'staff', staffId: ids.staff.admin };
}

export function frontDeskActor(): DemoActor {
  return { kind: 'staff', staffId: ids.staff.frontDesk };
}

export function coachActor(): DemoActor {
  return { kind: 'staff', staffId: ids.staff.coach };
}

export function multiRoleActor(): DemoActor {
  return { kind: 'staff', staffId: ids.staff.multiRole };
}

export function memberActor(memberId = ids.members.maple): DemoActor {
  return { kind: 'member', memberId };
}

export function invitationActor(
  invitationId = ids.invitations.outstanding,
): DemoActor {
  return { kind: 'invitation', invitationId };
}

export function cloneState(state: DemoState): DemoState {
  return structuredClone(state);
}

export function expectNoMutation<T>(value: T, before: T) {
  expect(value).toEqual(before);
}

export function actionNow(
  state: DemoState,
  now: UtcInstant = state.clock.now,
): UtcInstant {
  return now;
}

export function expectAcceptedEnvelope(
  state: DemoState,
  action: DemoAction,
  accepted: AcceptedAction,
  actor: DemoActor,
  now: UtcInstant,
) {
  expect(accepted).toMatchObject({
    type: 'accepted',
    action,
    actor,
    validatedAt: now,
    baseRevision: state.revision,
  });
}
