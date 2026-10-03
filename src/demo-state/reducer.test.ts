import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  advanceAttendanceClock,
  applyWeeklyTemplate,
  bookStation,
  cancelBooking,
  cancelClass,
  cancelClassReservations,
  checkIn,
  correctAttendance,
  createNotificationRecord,
  moveBooking,
  resendNotification,
  swapBookings,
  updateClassType,
  updateStation,
  publishWaiver,
  validateMembershipAction,
} from '../domain';
import type {
  AcceptedAction,
  ActionOf,
  DemoAction,
  DemoActionType,
  DemoReducer,
  DemoState,
  DemoStateChanges,
  DomainResult,
} from '../domain';
import { createInitialDemoState, FIXTURE_IDS as ids } from '../demo-fixtures';
import { getScenarios } from '../demo-scenarios';
import { demoReducer, DemoReducerError } from './reducer';

const fixture = createInitialDemoState();
const actions = {
  createStaffAccount: {
    type: 'createStaffAccount',
    payload: { staff: fixture.staffAccounts[0]! },
  },
  updateStaffAccount: {
    type: 'updateStaffAccount',
    payload: { staffId: ids.staff.admin, updates: { active: false } },
  },
  deactivateStaffAccount: {
    type: 'deactivateStaffAccount',
    payload: { staffId: ids.staff.admin },
  },
  createInvitation: {
    type: 'createInvitation',
    payload: { invitationId: 'invitation:new', email: 'new@example.invalid' },
  },
  resendInvitation: {
    type: 'resendInvitation',
    payload: {
      invitationId: ids.invitations.outstanding,
      replacementId: 'invitation:new',
    },
  },
  revokeInvitation: {
    type: 'revokeInvitation',
    payload: { invitationId: ids.invitations.outstanding },
  },
  expireInvitations: { type: 'expireInvitations', payload: {} },
  acceptInvitation: {
    type: 'acceptInvitation',
    payload: {
      invitationId: ids.invitations.outstanding,
      memberId: 'member:new',
      signatureId: 'signature:new',
      displayName: 'Fictional New',
      adultAttested: true,
      identity: {
        outcome: 'verified',
        subject: 'identity:new',
        verifiedEmail: 'invitee@example.invalid',
      },
      waiver: {
        waiverVersionId: ids.waivers.current,
        typedName: 'Fictional New',
      },
    },
  },
  updateMemberProfile: {
    type: 'updateMemberProfile',
    payload: {
      memberId: ids.members.maple,
      updates: { displayName: 'Fictional Updated' },
    },
  },
  setMemberStatus: {
    type: 'setMemberStatus',
    payload: { memberId: ids.members.maple, status: 'inactive' },
  },
  createWaiverVersion: {
    type: 'createWaiverVersion',
    payload: { waiver: fixture.waivers[0]! },
  },
  publishWaiver: {
    type: 'publishWaiver',
    payload: { waiverVersionId: ids.waivers.draft },
  },
  signWaiver: {
    type: 'signWaiver',
    payload: {
      memberId: ids.members.aspen,
      signatureId: 'signature:new',
      waiverVersionId: ids.waivers.current,
      typedName: 'Casey Park',
    },
  },
  createStation: {
    type: 'createStation',
    payload: { station: fixture.stations[0]! },
  },
  updateStation: {
    type: 'updateStation',
    payload: { stationId: ids.stations.north, updates: { inService: false } },
  },
  placeStation: {
    type: 'placeStation',
    payload: { stationId: ids.stations.north, row: 2, column: 2 },
  },
  setLayoutOrientation: {
    type: 'setLayoutOrientation',
    payload: { orientationLabel: 'Fictional entrance' },
  },
  createClassType: {
    type: 'createClassType',
    payload: { classType: fixture.classTypes[0]! },
  },
  updateClassType: {
    type: 'updateClassType',
    payload: {
      classTypeId: ids.classTypes.sprint,
      updates: { name: 'Fictional Updated' },
    },
  },
  createWeeklyTemplate: {
    type: 'createWeeklyTemplate',
    payload: { template: fixture.weeklyTemplates[0]! },
  },
  updateWeeklyTemplate: {
    type: 'updateWeeklyTemplate',
    payload: {
      templateId: ids.templates.weekA,
      updates: { name: 'Fictional Updated' },
    },
  },
  deleteWeeklyTemplate: {
    type: 'deleteWeeklyTemplate',
    payload: { templateId: ids.templates.weekA },
  },
  applyWeeklyTemplate: {
    type: 'applyWeeklyTemplate',
    payload: { templateId: ids.templates.weekA, weekStartsOn: '2026-10-12' },
  },
  createDraftClass: {
    type: 'createDraftClass',
    payload: {
      classId: 'class:new',
      classTypeId: ids.classTypes.sprint,
      schedule: {
        date: '2026-10-12',
        time: '09:00',
        timezone: 'America/Los_Angeles',
      },
    },
  },
  editScheduledClass: {
    type: 'editScheduledClass',
    payload: {
      classId: ids.classes.draft,
      updates: { coachId: ids.staff.coach },
    },
  },
  deleteDraftClass: {
    type: 'deleteDraftClass',
    payload: { classId: ids.classes.draft },
  },
  publishClasses: {
    type: 'publishClasses',
    payload: { classIds: [ids.classes.draft] },
  },
  releaseClasses: {
    type: 'releaseClasses',
    payload: { classIds: [ids.classes.laterRelease] },
  },
  cancelClass: {
    type: 'cancelClass',
    payload: { classId: ids.classes.full, reason: 'Fictional cancellation' },
  },
  bookStation: {
    type: 'bookStation',
    payload: {
      memberId: ids.members.willow,
      classId: ids.classes.free,
      stationId: ids.stations.east,
    },
  },
  cancelBooking: {
    type: 'cancelBooking',
    payload: { bookingId: ids.bookings.fullMaple },
  },
  removeBooking: {
    type: 'removeBooking',
    payload: { bookingId: ids.bookings.fullMaple, reason: 'Fictional removal' },
  },
  moveBooking: {
    type: 'moveBooking',
    payload: {
      bookingId: ids.bookings.checkInMaple,
      destinationStationId: ids.stations.east,
      confirmed: true,
    },
  },
  swapBookings: {
    type: 'swapBookings',
    payload: {
      bookingId: ids.bookings.fullMaple,
      otherBookingId: ids.bookings.fullCedar,
      confirmed: true,
    },
  },
  joinWaitlist: {
    type: 'joinWaitlist',
    payload: { memberId: ids.members.juniper, classId: ids.classes.full },
  },
  leaveWaitlist: {
    type: 'leaveWaitlist',
    payload: { entryId: ids.waitlist.willow },
  },
  promoteWaitlist: {
    type: 'promoteWaitlist',
    payload: { classId: ids.classes.full, stationId: ids.stations.north },
  },
  checkIn: {
    type: 'checkIn',
    payload: { bookingId: ids.bookings.checkInMaple },
  },
  reverseCheckIn: {
    type: 'reverseCheckIn',
    payload: {
      attendanceId: ids.attendance.checkInMaple,
      reason: 'Fictional reversal',
    },
  },
  correctAttendance: {
    type: 'correctAttendance',
    payload: {
      attendanceId: ids.attendance.historyNoShow,
      outcome: 'attended',
      reason: 'Fictional correction',
    },
  },
  recordManualAttendance: {
    type: 'recordManualAttendance',
    payload: {
      classId: ids.classes.checkIn,
      memberId: ids.members.willow,
      outcome: 'attended',
      reason: 'Fictional outage',
    },
  },
  resendNotification: {
    type: 'resendNotification',
    payload: {
      notificationId: ids.notifications.invitationFailed,
      scenario: 'success',
    },
  },
  updateOwnCoachProfile: {
    type: 'updateOwnCoachProfile',
    payload: {
      staffId: ids.staff.coach,
      updates: { biography: 'Fictional updated biography' },
    },
  },
  updateCoachProfile: {
    type: 'updateCoachProfile',
    payload: {
      staffId: ids.staff.coach,
      updates: { biography: 'Fictional updated biography' },
    },
  },
  updateSettings: {
    type: 'updateSettings',
    payload: { updates: { memberCap: 10 } },
  },
  selectActor: {
    type: 'selectActor',
    payload: { actor: { kind: 'member', memberId: ids.members.maple } },
  },
  setSimulation: { type: 'setSimulation', payload: { delivery: 'failure' } },
  advanceClock: {
    type: 'advanceClock',
    payload: { to: '2026-10-05T16:45:00Z' },
  },
  setClockPreset: {
    type: 'setClockPreset',
    payload: { presetId: ids.clockPresets.classEnd },
  },
  resetDemo: { type: 'resetDemo', payload: { confirmed: true } },
  loadScenario: {
    type: 'loadScenario',
    payload: { scenarioId: ids.scenarios.baseline, confirmed: true },
  },
  unsupportedOperation: {
    type: 'unsupportedOperation',
    payload: { operation: 'realEmail' },
  },
} satisfies { [Type in DemoActionType]: ActionOf<Type> };

function value<T>(result: DomainResult<T>): T {
  if (!result.success) throw new Error(result.error.message);
  return result.value;
}

function accepted(
  state: DemoState,
  action: DemoAction,
  changes: DemoStateChanges,
): AcceptedAction {
  return {
    type: 'accepted',
    action,
    changes,
    actor: state.activeActor,
    validatedAt: state.clock.now,
    baseRevision: state.revision,
    warnings: [],
  };
}

function freeze<T>(input: T): T {
  if (input !== null && typeof input === 'object') {
    Object.values(input).forEach(freeze);
    Object.freeze(input);
  }
  return input;
}

function replacements(state: DemoState): DemoStateChanges {
  const { revision: _revision, ...changes } = state;
  void _revision;
  return changes;
}

function apply(
  state: DemoState,
  action: DemoAction,
  changes: DemoStateChanges,
): DemoState {
  const snapshot = structuredClone(state);
  const envelope = freeze(accepted(state, action, changes));
  const envelopeSnapshot = structuredClone(envelope);
  const next = demoReducer(freeze(state), envelope);
  expect(state).toEqual(snapshot);
  expect(envelope).toEqual(envelopeSnapshot);
  expect(next).toEqual({ ...state, ...changes, revision: state.revision + 1 });
  for (const key of Object.keys(state) as (keyof DemoState)[]) {
    if (key !== 'revision' && !Object.hasOwn(changes, key)) {
      expect(next[key]).toBe(state[key]);
    }
  }
  return next;
}

afterEach(() => vi.restoreAllMocks());

describe('accepted demo reducer', () => {
  it('applies trusted accepted patches without replaying request validation', () => {
    const reducer: DemoReducer = demoReducer;
    const state = createInitialDemoState();
    const settings = { ...state.settings, memberCap: 42 };
    const next = reducer(
      state,
      accepted(state, actions.updateSettings, { settings }),
    );
    expect(next.settings.memberCap).toBe(42);
    expect(next.revision).toBe(1);
    expect(state.settings.memberCap).not.toBe(42);
  });

  const familyChanges: Partial<
    Record<DemoActionType, readonly (keyof DemoStateChanges)[]>
  > = {
    createStaffAccount: ['staffAccounts'],
    updateStaffAccount: ['staffAccounts'],
    deactivateStaffAccount: ['staffAccounts'],
    createInvitation: ['invitations', 'notifications'],
    resendInvitation: ['invitations', 'notifications'],
    revokeInvitation: ['invitations'],
    expireInvitations: ['invitations'],
    acceptInvitation: ['invitations', 'members', 'waiverSignatures'],
    updateMemberProfile: ['members', 'bookings', 'waitlistEntries'],
    setMemberStatus: ['members', 'bookings', 'waitlistEntries'],
    createWaiverVersion: ['waivers'],
    publishWaiver: ['waivers', 'currentWaiverVersionId'],
    signWaiver: ['waiverSignatures'],
    createStation: ['stations', 'classes'],
    updateStation: ['stations', 'bookings', 'classes'],
    placeStation: ['stations'],
    setLayoutOrientation: ['layout'],
    createClassType: ['classTypes'],
    updateClassType: ['classTypes'],
    createWeeklyTemplate: ['weeklyTemplates'],
    updateWeeklyTemplate: ['weeklyTemplates'],
    deleteWeeklyTemplate: ['weeklyTemplates'],
    applyWeeklyTemplate: ['classes'],
    createDraftClass: ['classes'],
    editScheduledClass: ['classes', 'notifications'],
    deleteDraftClass: ['classes'],
    publishClasses: ['classes'],
    releaseClasses: ['classes'],
    cancelClass: [
      'classes',
      'bookings',
      'waitlistEntries',
      'attendance',
      'notifications',
    ],
    bookStation: ['bookings', 'attendance', 'notifications'],
    cancelBooking: [
      'bookings',
      'attendance',
      'waitlistEntries',
      'notifications',
    ],
    removeBooking: [
      'bookings',
      'attendance',
      'waitlistEntries',
      'notifications',
    ],
    moveBooking: ['bookings', 'waitlistEntries', 'attendance', 'notifications'],
    swapBookings: ['bookings'],
    joinWaitlist: ['waitlistEntries'],
    leaveWaitlist: ['waitlistEntries'],
    promoteWaitlist: [
      'bookings',
      'waitlistEntries',
      'attendance',
      'notifications',
    ],
    checkIn: ['attendance'],
    reverseCheckIn: ['attendance'],
    correctAttendance: ['attendance'],
    recordManualAttendance: ['attendance'],
    resendNotification: ['notifications'],
    updateOwnCoachProfile: ['staffAccounts'],
    updateCoachProfile: ['staffAccounts'],
    updateSettings: ['settings'],
    selectActor: ['activeActor'],
    setSimulation: ['simulation'],
    advanceClock: ['clock', 'classes', 'attendance'],
    setClockPreset: ['clock', 'classes', 'attendance'],
  };

  it.each(
    Object.values(actions).filter(
      (action) =>
        !['resetDemo', 'loadScenario', 'unsupportedOperation'].includes(
          action.type,
        ),
    ),
  )(
    'applies $type collection replacements without modifying omitted fields',
    (action) => {
      const state = createInitialDemoState();
      const keys = familyChanges[action.type];
      expect(keys).toBeDefined();
      const replacement = {
        ...state,
        staffAccounts: state.staffAccounts.slice(1),
        members: state.members.slice(1),
        invitations: state.invitations.slice(1),
        waivers: state.waivers.slice(1),
        currentWaiverVersionId: null,
        waiverSignatures: state.waiverSignatures.slice(1),
        stations: state.stations.slice(1),
        layout: { availability: 'unavailable' as const },
        classTypes: state.classTypes.slice(1),
        weeklyTemplates: state.weeklyTemplates.slice(1),
        classes: state.classes.slice(1),
        bookings: state.bookings.slice(1),
        waitlistEntries: state.waitlistEntries.slice(1),
        attendance: state.attendance.slice(1),
        notifications: state.notifications.slice(1),
        settings: { ...state.settings, memberCap: 42 },
        activeActor: { kind: 'member' as const, memberId: ids.members.maple },
        simulation: { ...state.simulation, delivery: 'failure' as const },
        clock: {
          now: '2026-10-05T16:45:00Z' as const,
          presetId: ids.clockPresets.classEnd,
        },
      };
      const changes = Object.fromEntries(
        keys!.map((key) => [key, replacement[key]]),
      );
      apply(state, action, changes);
    },
  );

  it('allows an accepted no-op while still advancing the revision', () => {
    apply(createInitialDemoState(), actions.expireInvitations, {});
  });

  it('preserves accepted fractional policy durations rather than imposing new reducer policy', () => {
    const state = createInitialDemoState();
    const settings = {
      ...state.settings,
      invitationExpiryMinutes: 0.5,
      targetGapMinutes: 1.5,
      scheduleRelease: { mode: 'rolling' as const, advanceMinutes: 0.5 },
    };
    expect(apply(state, actions.updateSettings, { settings }).settings).toEqual(
      settings,
    );
  });

  it('commits booking, canonical attendance and a failed simulated notice together', () => {
    const state = createInitialDemoState();
    const failing = {
      ...state,
      simulation: { ...state.simulation, delivery: 'failure' as const },
    };
    const changes = value(
      bookStation(
        failing,
        { kind: 'member', memberId: ids.members.willow },
        ids.members.willow,
        ids.classes.free,
        ids.stations.east,
        'booking:reducer-new',
        state.clock.now,
      ),
    );
    const next = apply(failing, actions.bookStation, changes);
    const booking = next.bookings.at(-1)!;
    expect(booking.status).toBe('booked');
    expect(
      next.attendance.find(
        (record) => record.attendanceId === booking.attendanceRecordId,
      )?.bookingId,
    ).toBe(booking.bookingId);
    expect(next.notifications.at(-1)).toMatchObject({
      status: 'failed',
      event: { type: 'bookingConfirmed', bookingId: booking.bookingId },
    });
  });

  it('applies cancellation and eligible FIFO promotion as one revision retaining skipped entries', () => {
    const state = createInitialDemoState();
    const changes = value(
      cancelBooking(
        state,
        { kind: 'member', memberId: ids.members.maple },
        ids.bookings.fullMaple,
        state.clock.now,
      ),
    );
    const next = apply(state, actions.cancelBooking, changes);
    expect(
      next.bookings.find(
        (record) => record.bookingId === ids.bookings.fullMaple,
      )?.status,
    ).toBe('cancelled');
    expect(
      next.waitlistEntries.find(
        (entry) => entry.entryId === ids.waitlist.willow,
      )?.status,
    ).toBe('promoted');
    expect(
      next.waitlistEntries.find((entry) => entry.entryId === ids.waitlist.moss)
        ?.status,
    ).toBe('waiting');
    expect(
      next.waitlistEntries.find((entry) => entry.entryId === ids.waitlist.aspen)
        ?.status,
    ).toBe('waiting');
    expect(next.notifications.at(-1)?.event.type).toBe('waitlistPromoted');
    expect(
      next.bookings
        .filter(
          (booking) =>
            booking.classId === ids.classes.full && booking.status === 'booked',
        )
        .map((booking) => booking.stationId)
        .sort(),
    ).toEqual(
      [ids.stations.north, ids.stations.west, ids.stations.east].sort(),
    );
  });

  it('applies reseating and swaps without recalculating or partially mutating assignments', () => {
    const state = createInitialDemoState();
    const moved = apply(
      state,
      actions.moveBooking,
      value(
        moveBooking(
          state,
          state.activeActor,
          ids.bookings.checkInMaple,
          ids.stations.east,
          state.clock.now,
        ),
      ),
    );
    expect(
      moved.bookings.find(
        (booking) => booking.bookingId === ids.bookings.checkInMaple,
      )?.stationId,
    ).toBe(ids.stations.east);
    const swapped = apply(
      moved,
      actions.swapBookings,
      value(
        swapBookings(
          moved,
          moved.activeActor,
          ids.bookings.fullMaple,
          ids.bookings.fullCedar,
          moved.clock.now,
          true,
        ),
      ),
    );
    expect(
      swapped.bookings.find(
        (booking) => booking.bookingId === ids.bookings.fullMaple,
      )?.stationId,
    ).toBe(ids.stations.west);
    expect(
      swapped.bookings.find(
        (booking) => booking.bookingId === ids.bookings.fullCedar,
      )?.stationId,
    ).toBe(ids.stations.north);
    expect(swapped.waitlistEntries).toBe(moved.waitlistEntries);
    expect(swapped.notifications).toBe(moved.notifications);
  });

  it('applies a complete template proposal and preserves existing class snapshots', () => {
    const state = createInitialDemoState();
    const proposal = value(
      applyWeeklyTemplate({
        template: state.weeklyTemplates[0]!,
        weekStartsOn: '2026-10-12',
        classTypes: state.classTypes,
        classes: state.classes,
        timezone: state.settings.timezone,
        targetGapMinutes: state.settings.targetGapMinutes,
      }),
    );
    expect(proposal.classes.length).toBeGreaterThan(0);
    const envelope = accepted(state, actions.applyWeeklyTemplate, {
      classes: [...state.classes, ...proposal.classes],
    });
    const next = demoReducer(
      freeze(state),
      freeze({ ...envelope, warnings: proposal.warnings }),
    );
    expect(
      next.classes
        .slice(state.classes.length)
        .every((item) => item.status === 'draft'),
    ).toBe(true);
    const edited = value(
      updateClassType(next, ids.classTypes.sprint, {
        name: 'Fictional edited name',
      }),
    );
    const afterEdit = apply(next, actions.updateClassType, {
      classTypes: edited.classTypes,
    });
    expect(afterEdit.classes).toBe(next.classes);
    expect(afterEdit.classes).toEqual([...state.classes, ...proposal.classes]);
  });

  it('applies actual membership accepted envelopes including review flags', () => {
    const state = createInitialDemoState();
    const envelope = value(
      validateMembershipAction(
        state,
        state.activeActor,
        actions.setMemberStatus,
        state.clock.now,
      ),
    );
    const next = apply(state, envelope.action, envelope.changes);
    expect(
      next.members.find((member) => member.memberId === ids.members.maple)
        ?.status,
    ).toBe('inactive');
    expect(
      next.bookings.find(
        (booking) => booking.bookingId === ids.bookings.fullMaple,
      )?.reviewFlags,
    ).toContain('memberInactive');
    expect(
      next.bookings.find(
        (booking) => booking.bookingId === ids.bookings.fullMaple,
      )?.status,
    ).toBe('booked');
  });

  it('retains a confirmed invitation acceptance, member and waiver evidence together', () => {
    const state = createInitialDemoState();
    const envelope = value(
      validateMembershipAction(
        state,
        { kind: 'invitation', invitationId: ids.invitations.outstanding },
        actions.acceptInvitation,
        state.clock.now,
      ),
    );
    const next = apply(state, envelope.action, envelope.changes);
    expect(
      next.invitations.find(
        (invitation) => invitation.invitationId === ids.invitations.outstanding,
      ),
    ).toMatchObject({ status: 'accepted', memberId: 'member:new' });
    expect(next.members.at(-1)?.memberId).toBe('member:new');
    expect(next.waiverSignatures.at(-1)).toMatchObject({
      memberId: 'member:new',
      signatureId: 'signature:new',
    });
    expect(next.bookings).toBe(state.bookings);
  });

  it('applies service review flags and waiver publication without deleting or reseating bookings', () => {
    const state = createInitialDemoState();
    const serviceChange = value(
      updateStation(state, ids.stations.north, { inService: false }),
    );
    const next = apply(state, actions.updateStation, {
      stations: serviceChange.stations,
      classes: serviceChange.classes,
      bookings: serviceChange.bookings,
    });
    expect(
      next.bookings.find(
        (booking) => booking.bookingId === ids.bookings.fullMaple,
      ),
    ).toMatchObject({
      status: 'booked',
      stationId: ids.stations.north,
      reviewFlags: ['stationOutOfService'],
    });
    const published = value(
      publishWaiver(next, ids.waivers.draft, next.clock.now),
    );
    const final = apply(next, actions.publishWaiver, {
      waivers: published.waivers,
      currentWaiverVersionId: published.currentWaiverVersionId,
    });
    expect(final.currentWaiverVersionId).toBe(ids.waivers.draft);
    expect(final.bookings).toBe(next.bookings);
    expect(final.waiverSignatures).toBe(next.waiverSignatures);
  });

  it('applies class cancellation, reservation history and notices without promotion', () => {
    const state = createInitialDemoState();
    const cancelled = value(
      cancelClass(
        state.classes,
        ids.classes.full,
        'Fictional cancellation',
        state.clock.now,
      ),
    );
    const classes = state.classes.map((item) =>
      item.classId === ids.classes.full ? cancelled.scheduledClass : item,
    );
    const changes = value(
      cancelClassReservations(
        { ...state, classes },
        ids.classes.full,
        state.clock.now,
      ),
    );
    const recipientIds = new Set([
      ...state.bookings
        .filter(
          (booking) =>
            booking.classId === ids.classes.full && booking.status === 'booked',
        )
        .map((booking) => booking.memberId),
      ...state.waitlistEntries
        .filter(
          (entry) =>
            entry.classId === ids.classes.full && entry.status === 'waiting',
        )
        .map((entry) => entry.memberId),
    ]);
    const notices = [...recipientIds].map((memberId, index) =>
      value(
        createNotificationRecord(
          {
            notificationId: `notification:reducer-cancellation-${index}`,
            event: { type: 'classCancelled', classId: ids.classes.full },
            recipient: {
              kind: 'member',
              memberId,
              email: state.members.find(
                (member) => member.memberId === memberId,
              )!.verifiedEmail,
            },
            scenario: state.simulation.delivery,
          },
          state.clock.now,
        ),
      ),
    );
    const next = apply(state, actions.cancelClass, {
      ...changes,
      classes,
      notifications: [...state.notifications, ...notices],
    });
    expect(
      next.classes.find((item) => item.classId === ids.classes.full)?.status,
    ).toBe('cancelled');
    expect(
      next.bookings
        .filter((booking) => booking.classId === ids.classes.full)
        .some((booking) => booking.status === 'booked'),
    ).toBe(false);
    expect(
      next.waitlistEntries
        .filter((entry) => entry.classId === ids.classes.full)
        .some((entry) => entry.status === 'waiting'),
    ).toBe(false);
    expect(next.bookings).toHaveLength(state.bookings.length);
    expect(
      next.notifications
        .slice(state.notifications.length)
        .every((notice) => notice.event.type === 'classCancelled'),
    ).toBe(true);
    expect(next.notifications.length).toBe(
      state.notifications.length + recipientIds.size,
    );
  });

  it('applies check-in, exact-end no-show and corrections without overwriting history on later steps', () => {
    const initial = createInitialDemoState();
    const state: DemoState = {
      ...initial,
      attendance: initial.attendance.map((record) =>
        record.attendanceId === ids.attendance.checkInMaple
          ? {
              ...record,
              currentOutcome: 'booked',
              checkIn: { status: 'notCheckedIn' },
            }
          : record,
      ),
    };
    const checked = apply(
      state,
      actions.checkIn,
      value(
        checkIn(
          state,
          state.activeActor,
          ids.bookings.checkInMaple,
          state.clock.now,
        ),
      ),
    );
    const ended = apply(
      checked,
      actions.advanceClock,
      value(advanceAttendanceClock(checked, '2026-10-05T16:45:00Z')),
    );
    expect(
      ended.classes.find((item) => item.classId === ids.classes.checkIn)
        ?.status,
    ).toBe('completed');
    expect(
      ended.attendance.find(
        (record) => record.attendanceId === ids.attendance.checkInMaple,
      )?.currentOutcome,
    ).toBe('attended');
    expect(
      ended.attendance.find(
        (record) => record.attendanceId === ids.attendance.checkInCedar,
      )?.currentOutcome,
    ).toBe('noShow');
    const corrected = apply(
      ended,
      actions.correctAttendance,
      value(
        correctAttendance(
          ended,
          ended.activeActor,
          ids.attendance.checkInCedar,
          'attended',
          'Fictional roster correction',
          ended.clock.now,
        ),
      ),
    );
    const later = apply(
      corrected,
      actions.advanceClock,
      value(advanceAttendanceClock(corrected, '2026-10-05T16:46:00Z')),
    );
    expect(later.attendance).toBe(corrected.attendance);
    expect(
      later.attendance.find(
        (record) => record.attendanceId === ids.attendance.checkInCedar,
      ),
    ).toMatchObject({
      currentOutcome: 'attended',
      corrections: [{ previousOutcome: 'noShow', newOutcome: 'attended' }],
    });
  });

  it('appends resend history rather than issuing delivery or dropping earlier attempts', () => {
    const state = createInitialDemoState();
    const changes = value(
      resendNotification(
        state,
        state.activeActor,
        ids.notifications.invitationFailed,
        'success',
        state.clock.now,
      ),
    );
    const next = apply(state, actions.resendNotification, changes);
    const old = state.notifications.find(
      (notice) => notice.notificationId === ids.notifications.invitationFailed,
    )!;
    const notice = next.notifications.find(
      (item) => item.notificationId === old.notificationId,
    )!;
    expect(notice.attempts.slice(0, -1)).toEqual(old.attempts);
    expect(notice.status).toBe('sent');
  });

  it.each([actions.resetDemo, actions.loadScenario])(
    'replaces every field with a fresh $type graph and a monotonic revision',
    (action) => {
      const old = { ...createInitialDemoState(), revision: 8 };
      const scenario = getScenarios()[1]!.snapshot;
      const source =
        action.type === 'resetDemo' ? createInitialDemoState() : scenario;
      const matchingAction =
        action.type === 'loadScenario'
          ? {
              ...action,
              payload: { ...action.payload, scenarioId: source.scenarioId },
            }
          : action;
      const envelope = freeze(
        accepted(old, matchingAction, replacements(source)),
      );
      const snapshot = structuredClone(old);
      const next = demoReducer(freeze(old), envelope);
      const again = demoReducer(old, envelope);
      expect(next).toEqual({ ...source, revision: 9 });
      expect(old).toEqual(snapshot);
      expect(envelope.changes).toEqual(replacements(source));
      expect(next).toEqual(again);
      expect(next.members).not.toBe(source.members);
      expect(next.members[0]).not.toBe(source.members[0]);
      expect(next.classes[0]?.classTypeSnapshot).not.toBe(
        source.classes[0]?.classTypeSnapshot,
      );
      expect(next.attendance[0]?.corrections).not.toBe(
        source.attendance[0]?.corrections,
      );
      expect(next.settings).not.toBe(again.settings);
      expect(next.clock).not.toBe(source.clock);
      expect(
        Reflect.set(next.members[0]!, 'displayName', 'Fictional local edit'),
      ).toBe(true);
      expect(source.members[0]?.displayName).not.toBe('Fictional local edit');
      expect(again.members[0]?.displayName).not.toBe('Fictional local edit');
    },
  );

  it.each(getScenarios())(
    'accepts the complete $name scenario snapshot without modifying the stored fixture',
    (scenario) => {
      const state = freeze(createInitialDemoState());
      const snapshot = structuredClone(scenario);
      const action = {
        type: 'loadScenario' as const,
        payload: { scenarioId: scenario.scenarioId, confirmed: true as const },
      };
      const next = demoReducer(
        state,
        freeze(accepted(state, action, replacements(scenario.snapshot))),
      );
      expect(next).toEqual({ ...scenario.snapshot, revision: 1 });
      expect(scenario).toEqual(snapshot);
      expect(next.classes).not.toBe(scenario.snapshot.classes);
    },
  );

  it('is deterministic and has no time, random, network or notification side effects', () => {
    const state = freeze(createInitialDemoState());
    const action = freeze(
      accepted(state, actions.updateSettings, {
        settings: { ...state.settings, memberCap: 42 },
      }),
    );
    const forbidden = () => {
      throw new Error('Reducer side effect');
    };
    vi.spyOn(Date, 'now').mockImplementation(forbidden);
    vi.spyOn(Math, 'random').mockImplementation(forbidden);
    vi.spyOn(globalThis, 'fetch').mockImplementation(forbidden);
    vi.spyOn(console, 'log').mockImplementation(forbidden);
    vi.spyOn(console, 'error').mockImplementation(forbidden);
    expect(demoReducer(state, action)).toEqual(demoReducer(state, action));
  });

  it.each([
    null,
    {},
    actions.updateSettings,
    { success: false, error: { message: 'Rejected' } },
    { type: 'accepted' },
    { type: 'unaccepted' },
  ])('explicitly rejects unaccepted or incomplete envelopes: %j', (input) => {
    const state = freeze(createInitialDemoState());
    const snapshot = structuredClone(state);
    expect(() => Reflect.apply(demoReducer, undefined, [state, input])).toThrow(
      DemoReducerError,
    );
    expect(state).toEqual(snapshot);
  });

  it.each([
    { baseRevision: -1 },
    { baseRevision: 0.5 },
    { baseRevision: NaN },
    { baseRevision: Infinity },
    { baseRevision: '0' },
    { action: { type: 'unknown', payload: {} } },
    { action: null },
    { action: { type: 'updateSettings', payload: null } },
    { actor: null },
    { actor: { kind: 'unknown' } },
    { validatedAt: 'not an instant' },
    { warnings: null },
    { changes: null },
    { changes: [] },
    { changes: { revision: 999 } },
    { changes: { unknown: [] } },
    { changes: { members: undefined } },
    { changes: { bookings: null } },
    { changes: { attendance: {} } },
    { changes: { classes: [null] } },
    { changes: { layout: [] } },
    { changes: { settings: null } },
    { changes: { currentWaiverVersionId: 42 } },
    { changes: { scenarioId: null } },
    { changes: { clock: { now: 'broken', presetId: null } } },
    { changes: { simulation: { delivery: 'live', identity: 'verified' } } },
  ])(
    'explicitly rejects a malformed envelope without modifying either input: %j',
    (override) => {
      const state = freeze(createInitialDemoState());
      const input = freeze({
        ...accepted(state, actions.updateSettings, {}),
        ...override,
      });
      const snapshot = structuredClone(state);
      const inputSnapshot = structuredClone(input);
      expect(() =>
        Reflect.apply(demoReducer, undefined, [state, input]),
      ).toThrow(DemoReducerError);
      expect(state).toEqual(snapshot);
      expect(input).toEqual(inputSnapshot);
    },
  );

  it('reports a typed revision conflict and cannot replay an accepted action', () => {
    const state = createInitialDemoState();
    const envelope = accepted(state, actions.expireInvitations, {});
    const next = demoReducer(state, envelope);
    try {
      demoReducer(next, envelope);
      expect.fail('A stale accepted envelope must not apply.');
    } catch (error) {
      expect(error).toBeInstanceOf(DemoReducerError);
      expect(error).toMatchObject({
        error: {
          category: 'DemoConflict',
          conflict: {
            kind: 'revision',
            expectedRevision: 0,
            currentRevision: 1,
          },
        },
      });
    }
  });

  it('never accepts an unsupported operation even when wrapped as accepted', () => {
    const state = freeze(createInitialDemoState());
    expect(() =>
      demoReducer(state, accepted(state, actions.unsupportedOperation, {})),
    ).toThrow(DemoReducerError);
    try {
      demoReducer(state, accepted(state, actions.unsupportedOperation, {}));
    } catch (error) {
      expect(error).toMatchObject({
        error: {
          category: 'UnsupportedPrototypeOperation',
          operation: 'realEmail',
        },
      });
    }
  });

  it.each([actions.resetDemo, actions.loadScenario])(
    'rejects partial $type replacements instead of retaining stale collections',
    (action) => {
      const state = freeze(createInitialDemoState());
      expect(() =>
        demoReducer(state, accepted(state, action, { members: [] })),
      ).toThrow(DemoReducerError);
    },
  );

  it('rejects revision overflow rather than losing the stale-action guard', () => {
    const state = {
      ...createInitialDemoState(),
      revision: Number.MAX_SAFE_INTEGER,
    };
    expect(() =>
      demoReducer(state, accepted(state, actions.expireInvitations, {})),
    ).toThrow(DemoReducerError);
  });
});
