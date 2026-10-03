import type {
  DemoActionType,
  DemoReducer,
  DemoStateChanges,
  DomainError,
  UnsupportedOperation,
} from '../domain';

/** Dispatch misuse is explicit; UI request failures belong to validateAction. */
export class DemoReducerError extends Error {
  readonly error: DomainError;

  constructor(error: DomainError) {
    super(error.message);
    this.name = 'DemoReducerError';
    this.error = error;
  }
}

const supportedActions = {
  createStaffAccount: true,
  updateStaffAccount: true,
  deactivateStaffAccount: true,
  createInvitation: true,
  resendInvitation: true,
  revokeInvitation: true,
  expireInvitations: true,
  acceptInvitation: true,
  updateMemberProfile: true,
  setMemberStatus: true,
  createWaiverVersion: true,
  publishWaiver: true,
  signWaiver: true,
  createStation: true,
  updateStation: true,
  placeStation: true,
  retireStation: true,
  insertLayoutLine: true,
  removeLayoutLine: true,
  setLayoutOrientation: true,
  createClassType: true,
  updateClassType: true,
  createWeeklyTemplate: true,
  updateWeeklyTemplate: true,
  deleteWeeklyTemplate: true,
  applyWeeklyTemplate: true,
  createDraftClass: true,
  editScheduledClass: true,
  deleteDraftClass: true,
  publishClasses: true,
  releaseClasses: true,
  cancelClass: true,
  bookStation: true,
  cancelBooking: true,
  removeBooking: true,
  moveBooking: true,
  swapBookings: true,
  joinWaitlist: true,
  leaveWaitlist: true,
  promoteWaitlist: true,
  checkIn: true,
  reverseCheckIn: true,
  correctAttendance: true,
  recordManualAttendance: true,
  resendNotification: true,
  updateOwnCoachProfile: true,
  updateCoachProfile: true,
  updateSettings: true,
  selectActor: true,
  setSimulation: true,
  advanceClock: true,
  setClockPreset: true,
  resetDemo: true,
  loadScenario: true,
  unsupportedOperation: false,
} satisfies Record<DemoActionType, boolean>;

function invalid(field: string, message: string): never {
  throw new DemoReducerError({
    category: 'ValidationError',
    message,
    fields: [{ field, message }],
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function id(value: unknown, prefix: string): boolean {
  return (
    typeof value === 'string' &&
    value.startsWith(`${prefix}:`) &&
    value.length > prefix.length + 1 &&
    !/\s/.test(value)
  );
}

function instant(value: unknown): boolean {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)
  )
    return false;
  const date = new Date(value);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().replace('.000Z', 'Z') === value
  );
}

function actor(value: unknown): boolean {
  if (!record(value)) return false;
  switch (value.kind) {
    case 'staff':
      return id(value.staffId, 'staff');
    case 'member':
      return id(value.memberId, 'member');
    case 'invitation':
      return id(value.invitationId, 'invitation');
    default:
      return false;
  }
}

function collection(value: unknown): boolean {
  return Array.isArray(value) && value.every(record);
}

function wholeNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function finiteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

const fieldChecks = {
  staffAccounts: collection,
  members: collection,
  invitations: collection,
  waivers: collection,
  currentWaiverVersionId: (value) => value === null || id(value, 'waiver'),
  waiverSignatures: collection,
  stations: collection,
  retiredStations: collection,
  layout: (value) =>
    record(value) &&
    ['current', 'stale', 'unavailable'].includes(String(value.availability)) &&
    (value.orientationLabel === undefined ||
      typeof value.orientationLabel === 'string'),
  classTypes: collection,
  weeklyTemplates: collection,
  classes: collection,
  bookings: collection,
  waitlistEntries: collection,
  attendance: collection,
  notifications: collection,
  settings: (value) =>
    record(value) &&
    value.illustrative === true &&
    typeof value.timezone === 'string' &&
    value.timezone.includes('/') &&
    [
      'memberCap',
      'invitationExpiryMinutes',
      'targetGapMinutes',
      'waitlistCutoffMinutes',
      'lateCancelCutoffMinutes',
      'checkInLeadMinutes',
      'checkInGraceMinutes',
    ].every((key) => finiteNumber(value[key])) &&
    record(value.scheduleRelease) &&
    (value.scheduleRelease.mode === 'immediate' ||
      value.scheduleRelease.mode === 'manual' ||
      (value.scheduleRelease.mode === 'rolling' &&
        finiteNumber(value.scheduleRelease.advanceMinutes))),
  activeActor: actor,
  scenarioId: (value) => id(value, 'scenario'),
  clock: (value) =>
    record(value) &&
    instant(value.now) &&
    (value.presetId === null || id(value.presetId, 'clockPreset')),
  simulation: (value) =>
    record(value) &&
    (value.delivery === 'success' || value.delivery === 'failure') &&
    (value.identity === 'verified' ||
      value.identity === 'rejected' ||
      value.identity === 'mismatched'),
} satisfies { [Key in keyof DemoStateChanges]-?: (value: unknown) => boolean };

function actionType(value: unknown): value is DemoActionType {
  return typeof value === 'string' && Object.hasOwn(supportedActions, value);
}

function changeKey(value: PropertyKey): value is keyof DemoStateChanges {
  return typeof value === 'string' && Object.hasOwn(fieldChecks, value);
}

const unsupportedOperations = [
  'liveAuthentication',
  'realEmail',
  'sharedPersistence',
  'offlineBooking',
  'equipmentConnection',
  'mediaUpload',
] satisfies readonly UnsupportedOperation[];

function unsupportedOperation(value: unknown): value is UnsupportedOperation {
  return unsupportedOperations.some((operation) => operation === value);
}

/**
 * Applies the rules' complete replacements, not the request payload. Structural
 * guards detect dispatch misuse; they do not revalidate records or gym policy.
 * Omitted fields retain identity. Reset/scenario envelopes must replace the
 * entire graph and are cloned so stored scenario snapshots cannot be aliased.
 */
export const demoReducer: DemoReducer = (state, accepted) => {
  if (!record(accepted) || accepted.type !== 'accepted') {
    invalid('type', 'The demo reducer requires a validated accepted action.');
  }
  if (
    !record(accepted.action) ||
    !actionType(accepted.action.type) ||
    !record(accepted.action.payload)
  ) {
    invalid(
      'action',
      'The accepted envelope requires a known action and payload.',
    );
  }
  if (accepted.action.type === 'unsupportedOperation') {
    const operation = accepted.action.payload.operation;
    if (!unsupportedOperation(operation)) {
      invalid(
        'action.payload.operation',
        'Choose a known unsupported prototype operation.',
      );
    }
    throw new DemoReducerError({
      category: 'UnsupportedPrototypeOperation',
      message: 'Unsupported prototype operations cannot be dispatched.',
      operation,
    });
  }
  if (
    !actor(accepted.actor) ||
    !instant(accepted.validatedAt) ||
    !collection(accepted.warnings)
  ) {
    invalid(
      'envelope',
      'The accepted envelope requires an actor, validation instant and warnings array.',
    );
  }
  if (
    !wholeNumber(accepted.baseRevision) ||
    !wholeNumber(state.revision) ||
    state.revision === Number.MAX_SAFE_INTEGER
  ) {
    invalid(
      'baseRevision',
      'The demo revision must be a non-negative safe integer with room to advance.',
    );
  }
  if (accepted.baseRevision !== state.revision) {
    throw new DemoReducerError({
      category: 'DemoConflict',
      message:
        'The accepted action was validated against a different demo revision.',
      conflict: {
        kind: 'revision',
        expectedRevision: accepted.baseRevision,
        currentRevision: state.revision,
      },
    });
  }
  if (!record(accepted.changes)) {
    invalid(
      'changes',
      'The accepted envelope requires collection replacements.',
    );
  }
  for (const key of Reflect.ownKeys(accepted.changes)) {
    if (!changeKey(key) || !fieldChecks[key](accepted.changes[key])) {
      invalid(
        `changes.${String(key)}`,
        'The accepted envelope contains an unknown or malformed replacement.',
      );
    }
  }
  const replacing =
    accepted.action.type === 'resetDemo' ||
    accepted.action.type === 'loadScenario';
  if (
    replacing &&
    Object.keys(fieldChecks).some(
      (key) => !Object.hasOwn(accepted.changes, key),
    )
  ) {
    invalid(
      'changes',
      'Reset and scenario loading require every state replacement field.',
    );
  }
  const changes = replacing
    ? structuredClone(accepted.changes)
    : accepted.changes;
  return { ...state, ...changes, revision: state.revision + 1 };
};
