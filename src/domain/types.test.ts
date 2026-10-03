import { describe, expect, expectTypeOf, it } from 'vitest';
import * as publicContract from './index';
import type {
  ApplyWeeklyTemplateInput,
  AcceptedAction,
  ActionOf,
  AttendanceCorrection,
  AttendanceOutcome,
  AttendanceRecord,
  Booking,
  BookingStatus,
  CapabilityTarget,
  CheckInState,
  ClassTypeChanges,
  ClassStatus,
  ClassType,
  ClassTypeInput,
  CoachProfile,
  CoachProfileView,
  DemoAction,
  DemoActor,
  DemoScenario,
  DemoState,
  DomainError,
  DomainResult,
  Invitation,
  LayoutView,
  LocalDate,
  LocalTime,
  Member,
  MembershipAction,
  MemberId,
  MemberStatus,
  NotificationEvent,
  NotificationInput,
  NotificationRecord,
  NotificationAttempt,
  PublishedClassBatch,
  PublicCoachProfile,
  ScheduledClass,
  ScheduledClassEdit,
  StaffAccount,
  StaffId,
  StaffRole,
  StaffLayoutStation,
  Station,
  SystemSettings,
  UtcInstant,
  WaiverSignature,
  WaiverVersion,
  WaitlistEntry,
  WaitlistStatus,
  WeeklyTemplate,
} from './index';

const now: UtcInstant = '2026-10-02T16:00:00Z';
const actor: DemoActor = { kind: 'staff', staffId: 'staff:admin' };
const staff: StaffAccount = {
  staffId: 'staff:admin',
  active: true,
  assignedRoles: ['admin', 'coach'],
  assignedClassIds: ['class:morning'],
  identitySubject: 'identity:fictional-staff',
  coachProfile: {
    displayName: 'Demo Coach',
    avatarId: 'avatar:initials',
    biography: 'Fictional coach.',
    certifications: ['Illustrative certificate'],
    contact: { email: 'coach@example.invalid', phone: 'fictional' },
  },
};
const member: Member = {
  memberId: 'member:demo',
  displayName: 'Demo Member',
  verifiedEmail: 'member@example.invalid',
  contactEmail: 'contact@example.invalid',
  identitySubject: 'identity:fictional-member',
  status: 'active',
  invitationId: 'invitation:accepted',
  adultAttestationAt: now,
  adultEligibility: 'attested',
  createdAt: now,
};
const invitation: Invitation = {
  invitationId: 'invitation:accepted',
  email: member.verifiedEmail,
  status: 'accepted',
  issuedAt: now,
  expiresAt: '2026-10-09T16:00:00Z',
  issuedBy: staff.staffId,
  acceptedAt: now,
  memberId: member.memberId,
};
const waiver: WaiverVersion = {
  waiverVersionId: 'waiver:one',
  version: 1,
  text: 'Fictional, non-legal waiver.',
  status: 'published',
  createdAt: now,
  publishedAt: now,
};
const signature: WaiverSignature = {
  signatureId: 'signature:one',
  memberId: member.memberId,
  waiverVersionId: waiver.waiverVersionId,
  typedName: member.displayName,
  signedAt: now,
};
const station: Station = {
  stationId: 'station:one',
  label: 'Demo 1',
  pm5Serial: 'FICTIONAL-PM5',
  inService: true,
  row: 0,
  column: 0,
};
const classType: ClassType = {
  classTypeId: 'classType:rowing',
  name: 'Demo Rowing',
  durationMinutes: 45,
  description: 'Fictional rowing class.',
  difficulty: 'Illustrative beginner',
  alias: 'Row',
  whatToBring: 'Water',
};
const scheduledClass: ScheduledClass = {
  classId: 'class:morning',
  schedule: {
    date: '2026-10-02',
    time: '09:00',
    timezone: 'America/Los_Angeles',
  },
  startsAt: now,
  endsAt: '2026-10-02T16:45:00Z',
  status: 'published',
  coachId: staff.staffId,
  classTypeSnapshot: classType,
  releasedAt: now,
  lateCancelWaived: false,
  reviewFlags: [],
};
const template: WeeklyTemplate = {
  templateId: 'template:week-a',
  name: 'Illustrative week A',
  entries: [
    {
      entryId: 'templateEntry:friday',
      weekday: 5,
      localTime: '09:00',
      classTypeId: classType.classTypeId,
      coachId: staff.staffId,
    },
  ],
};
const correction: AttendanceCorrection = {
  correctionId: 'correction:one',
  staffId: staff.staffId,
  previousOutcome: 'noShow',
  newOutcome: 'attended',
  recordedAt: now,
  reason: 'Illustrative outage reconciliation',
};
const attendance: AttendanceRecord = {
  attendanceId: 'attendance:one',
  classId: scheduledClass.classId,
  memberId: member.memberId,
  bookingId: 'booking:one',
  currentOutcome: 'attended',
  checkIn: { status: 'notCheckedIn' },
  source: { kind: 'manualOutage', staffId: staff.staffId, recordedAt: now },
  corrections: [correction],
};
const booking: Booking = {
  bookingId: 'booking:one',
  memberId: member.memberId,
  classId: scheduledClass.classId,
  stationId: station.stationId,
  status: 'booked',
  bookedAt: now,
  attendanceRecordId: attendance.attendanceId,
  reviewFlags: [],
};
const waitlistEntry: WaitlistEntry = {
  entryId: 'waitlist:one',
  classId: scheduledClass.classId,
  memberId: 'member:queued',
  joinOrder: 1,
  joinedAt: now,
  status: 'waiting',
  reviewFlags: ['waiverOutdated'],
};
const deliveryError = {
  category: 'SimulatedDeliveryFailure',
  message: 'Illustrative provider rejection',
  scenario: 'failure',
} satisfies DomainError;
const notification: NotificationRecord = {
  notificationId: 'notification:one',
  simulated: true,
  event: {
    type: 'bookingConfirmed',
    bookingId: booking.bookingId,
    classId: scheduledClass.classId,
  },
  recipient: {
    kind: 'member',
    memberId: member.memberId,
    email: member.verifiedEmail,
  },
  createdAt: now,
  status: 'failed',
  attempts: [
    {
      attemptId: 'notificationAttempt:one',
      attemptedAt: now,
      scenario: 'failure',
      status: 'failed',
      error: deliveryError,
    },
  ],
};
const settings: SystemSettings = {
  illustrative: true,
  timezone: 'America/Los_Angeles',
  memberCap: 10,
  invitationExpiryMinutes: 10080,
  scheduleRelease: { mode: 'immediate' },
  targetGapMinutes: 30,
  waitlistCutoffMinutes: 60,
  lateCancelCutoffMinutes: 120,
  checkInLeadMinutes: 30,
  checkInGraceMinutes: 5,
};
const state: DemoState = {
  revision: 0,
  staffAccounts: [staff],
  members: [member],
  invitations: [invitation],
  waivers: [waiver],
  currentWaiverVersionId: waiver.waiverVersionId,
  waiverSignatures: [signature],
  stations: [station],
  layout: { orientationLabel: 'Illustrative front', availability: 'current' },
  classTypes: [classType],
  weeklyTemplates: [template],
  classes: [scheduledClass],
  bookings: [booking],
  waitlistEntries: [waitlistEntry],
  attendance: [attendance],
  notifications: [notification],
  settings,
  activeActor: actor,
  scenarioId: 'scenario:baseline',
  clock: { now, presetId: 'clockPreset:baseline' },
  simulation: { delivery: 'success', identity: 'verified' },
};
const scenario: DemoScenario = {
  scenarioId: state.scenarioId,
  name: 'Baseline',
  description: 'Fictional illustrative state.',
  category: 'baseline',
  illustrative: true,
  snapshot: state,
  defaultActor: actor,
  clockInstant: now,
  timezone: settings.timezone,
};

// These deliberately invalid assignments are checked by tsc, not executed by Vitest.
function negativeAssertions(
  rawAction: DemoAction,
  instant: UtcInstant,
  localTime: LocalTime,
  staffId: StaffId,
  accepted: AcceptedAction,
  publicProfile: PublicCoachProfile,
  staffProfile: CoachProfile,
  staffStations: readonly StaffLayoutStation[],
) {
  // @ts-expect-error A staff identifier is not a member identifier.
  const wrongId: MemberId = staffId;
  // @ts-expect-error UTC instants cannot be passed as wall-clock inputs.
  const wrongLocal: LocalTime = instant;
  // @ts-expect-error Wall-clock inputs are not internal comparison instants.
  const wrongInstant: UtcInstant = localTime;
  // @ts-expect-error No-show is an attendance outcome, not a booking lifecycle state.
  const noShowBooking: BookingStatus = 'noShow';
  // @ts-expect-error Late cancel is not a booking lifecycle state.
  const lateBooking: BookingStatus = 'lateCancel';
  // @ts-expect-error Current attendance cannot be replaced by correction history.
  const wrongOutcome: AttendanceOutcome = correction;
  // @ts-expect-error A correction entry is not an attendance record.
  const wrongRecord: AttendanceRecord = correction;
  // @ts-expect-error Check-in evidence is required when checked in.
  const wrongCheckIn: CheckInState = { status: 'checkedIn' };
  // @ts-expect-error Attempted actions are never reducer-ready accepted actions.
  const wrongAccepted: AcceptedAction = rawAction;
  // @ts-expect-error An accepted transition is not a form action.
  const wrongAction: DemoAction = accepted;
  // @ts-expect-error Member-visible coach details do not expose staff contacts.
  const contact = publicProfile.contact.email;
  // @ts-expect-error Only the three permitted class durations are supported.
  const wrongDuration: ClassType['durationMinutes'] = 90;
  // @ts-expect-error Failures cannot carry a success value.
  const wrongResult: DomainResult<Booking> = { success: false, value: booking };
  // @ts-expect-error Swap confirmation is required, not optional UI state.
  const wrongSwap: DemoAction = {
    type: 'swapBookings',
    payload: { bookingId: booking.bookingId, otherBookingId: 'booking:two' },
  };
  // @ts-expect-error An accepted invitation requires saved member evidence.
  const wrongInvitation: Invitation = {
    invitationId: 'invitation:bad',
    email: 'demo@example.invalid',
    issuedAt: now,
    expiresAt: now,
    issuedBy: staff.staffId,
    status: 'accepted',
  };
  // @ts-expect-error A booking event must reference its confirmed booking.
  const wrongEvent: NotificationEvent = {
    type: 'bookingConfirmed',
    classId: scheduledClass.classId,
  };
  // @ts-expect-error Date-only values are not UTC instants.
  const wrongDate: UtcInstant = '2026-10-02';
  // @ts-expect-error Readonly snapshots must not be rewritten.
  scheduledClass.classTypeSnapshot.name = 'Changed';
  // @ts-expect-error Immutable state collections cannot be mutated by features.
  state.bookings.push(booking);
  // @ts-expect-error A public profile cannot retain staff-only contact data.
  const leakingProfile: PublicCoachProfile = staffProfile;
  const leakingLayout: LayoutView = {
    status: 'available',
    audience: 'member',
    classId: scheduledClass.classId,
    canReseat: false,
    // @ts-expect-error A member layout cannot retain staff assignments.
    stations: staffStations,
  };
  const mismatchedPayload: ActionOf<'checkIn' | 'leaveWaitlist'> = {
    type: 'checkIn',
    // @ts-expect-error Action helpers preserve type/payload correlation for unions.
    payload: { entryId: waitlistEntry.entryId },
  };
  // @ts-expect-error Revision is owned by the reducer, not replacement data.
  const wrongChanges: AcceptedAction['changes'] = { revision: 99 };
  // @ts-expect-error Corrections are append-only history in immutable snapshots.
  attendance.corrections.push(correction);
  // @ts-expect-error Attendance outcomes are not waitlist lifecycle states.
  const wrongQueue: WaitlistStatus = 'attended';
  // @ts-expect-error Failed delivery attempts must retain their visible failure.
  const wrongAttempt: NotificationAttempt = {
    attemptId: 'notificationAttempt:bad',
    attemptedAt: now,
    status: 'failed',
    scenario: 'failure',
  };
  // @ts-expect-error Unknown fixed roles are not custom permissions.
  const wrongRole: StaffRole = 'owner';
  // @ts-expect-error Offset/local datetimes are not normalized UTC instants.
  const offsetInstant: UtcInstant = '2026-10-02T09:00:00-07:00';
  // @ts-expect-error Weekday uses the explicit Monday-through-Sunday range.
  const wrongWeekday: WeeklyTemplate['entries'][number]['weekday'] = 0;
  // @ts-expect-error A rolling release policy requires an advance window.
  const wrongRelease: SystemSettings['scheduleRelease'] = { mode: 'rolling' };
  const wrongLoad: DemoAction = {
    type: 'loadScenario',
    // @ts-expect-error Scenario replacement must retain confirmation.
    payload: { scenarioId: scenario.scenarioId },
  };
  void [
    wrongId,
    wrongLocal,
    wrongInstant,
    noShowBooking,
    lateBooking,
    wrongOutcome,
    wrongRecord,
    wrongCheckIn,
    wrongAccepted,
    wrongAction,
    contact,
    wrongDuration,
    wrongResult,
    wrongSwap,
    wrongInvitation,
    wrongEvent,
    wrongDate,
    leakingProfile,
    leakingLayout,
    mismatchedPayload,
    wrongChanges,
    wrongQueue,
    wrongAttempt,
    wrongRole,
    offsetInstant,
    wrongWeekday,
    wrongRelease,
    wrongLoad,
  ];
}
void negativeAssertions;

describe('stable domain contracts', () => {
  it('publishes all domain rule functions from the domain barrel', () => {
    expect(Object.keys(publicContract).sort()).toEqual(
      [
        'advanceAttendanceClock',
        'applyWeeklyTemplate',
        'bookStation',
        'cancelBooking',
        'cancelClass',
        'cancelClassReservations',
        'checkIn',
        'checkMemberEligibility',
        'completeClass',
        'correctAttendance',
        'countActiveMembers',
        'createClassType',
        'createClassTypeSnapshot',
        'createDraftClass',
        'createNotificationRecord',
        'createStaffAccount',
        'createStation',
        'createWaiverVersion',
        'createWeeklyTemplate',
        'deactivateStaffAccount',
        'deleteDraftClass',
        'deleteWeeklyTemplate',
        'editScheduledClass',
        'expireInvitations',
        'getClassCapacity',
        'getCurrentWaiver',
        'getWaiverCompliance',
        'joinWaitlist',
        'leaveWaitlist',
        'moveBooking',
        'moveOwnBooking',
        'placeStation',
        'promoteWaitlist',
        'publishClasses',
        'publishWaiver',
        'recordManualAttendance',
        'recordNotification',
        'releaseClasses',
        'removeBooking',
        'requireCapability',
        'requireCurrentWaiver',
        'resendNotification',
        'reverseCheckIn',
        'selectClassLayout',
        'selectCoachClassHistory',
        'selectCoachProfile',
        'selectDemoCapabilities',
        'selectReleasedClasses',
        'setLayoutOrientation',
        'signWaiver',
        'swapBookings',
        'updateClassType',
        'updateCoachProfile',
        'updateOwnCoachProfile',
        'updateStaffAccount',
        'updateStation',
        'updateWeeklyTemplate',
        'validateClassCapacity',
        'validateClassType',
        'validateMembershipAction',
        'validateNotificationAction',
      ].sort(),
    );
  });

  it('publishes capability-specific helper types from the domain barrel', () => {
    expectTypeOf<MembershipAction>().not.toBeAny();
    expectTypeOf<ApplyWeeklyTemplateInput>().not.toBeAny();
    expectTypeOf<ScheduledClassEdit>().not.toBeAny();
    expectTypeOf<PublishedClassBatch>().not.toBeAny();
    expectTypeOf<CapabilityTarget>().not.toBeAny();
    expectTypeOf<NotificationInput>().not.toBeAny();
    expectTypeOf<ClassTypeInput>().not.toBeAny();
    expectTypeOf<ClassTypeChanges>().not.toBeAny();
    expectTypeOf<CoachProfileView>().not.toBeAny();
  });

  it('represents a complete independent scenario and all state collections', () => {
    expectTypeOf(state).toEqualTypeOf<DemoState>();
    expectTypeOf(scenario).toEqualTypeOf<DemoScenario>();
    expect(state.settings.illustrative).toBe(true);
    expect(scenario.timezone).toBe('America/Los_Angeles');
    expect(state.attendance[0]?.corrections[0]?.newOutcome).toBe('attended');
  });

  it('keeps lifecycle, outcomes, and local/UTC values distinct', () => {
    expectTypeOf<MemberStatus>().toEqualTypeOf<
      'pending' | 'active' | 'inactive'
    >();
    expectTypeOf<StaffRole>().toEqualTypeOf<'admin' | 'frontDesk' | 'coach'>();
    expectTypeOf<ClassStatus>().toEqualTypeOf<
      'draft' | 'published' | 'cancelled' | 'completed'
    >();
    expectTypeOf<BookingStatus>().toEqualTypeOf<
      'booked' | 'cancelled' | 'staffRemoved'
    >();
    expectTypeOf<LocalDate>().not.toEqualTypeOf<UtcInstant>();
    expectTypeOf<LocalTime>().not.toEqualTypeOf<UtcInstant>();
    expectTypeOf<AttendanceCorrection>().not.toEqualTypeOf<AttendanceRecord>();
  });

  it('carries validated atomic changes separately from raw requests', () => {
    const action: DemoAction = {
      type: 'bookStation',
      payload: {
        memberId: member.memberId,
        classId: scheduledClass.classId,
        stationId: station.stationId,
      },
    };
    const accepted: AcceptedAction = {
      type: 'accepted',
      action,
      actor,
      validatedAt: now,
      baseRevision: state.revision,
      changes: {
        bookings: [booking],
        attendance: [attendance],
        notifications: [notification],
      },
      warnings: [],
    };
    const result: DomainResult<AcceptedAction> = {
      success: true,
      value: accepted,
    };
    if (result.success) {
      expect(result.value.changes.bookings).toEqual([booking]);
    }
    expectTypeOf<AcceptedAction>().not.toExtend<DemoAction>();
  });

  it('covers every workflow with typed request payloads', () => {
    const draft = {
      classId: scheduledClass.classId,
      schedule: scheduledClass.schedule,
      classTypeId: classType.classTypeId,
    };
    const actions = [
      { type: 'createStaffAccount', payload: { staff } },
      {
        type: 'updateStaffAccount',
        payload: {
          staffId: staff.staffId,
          updates: {
            assignedRoles: ['coach'],
            assignedClassIds: [scheduledClass.classId],
          },
        },
      },
      { type: 'deactivateStaffAccount', payload: { staffId: staff.staffId } },
      {
        type: 'createInvitation',
        payload: {
          invitationId: 'invitation:new',
          email: 'new@example.invalid',
        },
      },
      {
        type: 'resendInvitation',
        payload: {
          invitationId: invitation.invitationId,
          replacementId: 'invitation:replacement',
        },
      },
      {
        type: 'revokeInvitation',
        payload: { invitationId: invitation.invitationId },
      },
      { type: 'expireInvitations', payload: {} },
      {
        type: 'acceptInvitation',
        payload: {
          invitationId: invitation.invitationId,
          memberId: member.memberId,
          signatureId: signature.signatureId,
          displayName: member.displayName,
          adultAttested: true,
          identity: {
            outcome: 'verified',
            subject: member.identitySubject,
            verifiedEmail: member.verifiedEmail,
          },
          waiver: {
            waiverVersionId: waiver.waiverVersionId,
            typedName: member.displayName,
          },
        },
      },
      {
        type: 'updateMemberProfile',
        payload: {
          memberId: member.memberId,
          updates: {
            displayName: 'Corrected demo',
            adultEligibility: 'denied',
          },
        },
      },
      {
        type: 'setMemberStatus',
        payload: { memberId: member.memberId, status: 'inactive' },
      },
      { type: 'createWaiverVersion', payload: { waiver } },
      {
        type: 'publishWaiver',
        payload: { waiverVersionId: waiver.waiverVersionId },
      },
      {
        type: 'signWaiver',
        payload: {
          memberId: member.memberId,
          signatureId: signature.signatureId,
          waiverVersionId: waiver.waiverVersionId,
          typedName: member.displayName,
        },
      },
      { type: 'createStation', payload: { station } },
      {
        type: 'updateStation',
        payload: {
          stationId: station.stationId,
          updates: { inService: false, pm5Serial: null },
        },
      },
      {
        type: 'placeStation',
        payload: { stationId: station.stationId, row: 1, column: 1 },
      },
      { type: 'setLayoutOrientation', payload: { orientationLabel: 'Front' } },
      { type: 'createClassType', payload: { classType } },
      {
        type: 'updateClassType',
        payload: {
          classTypeId: classType.classTypeId,
          updates: { durationMinutes: 60 },
        },
      },
      { type: 'createWeeklyTemplate', payload: { template } },
      {
        type: 'updateWeeklyTemplate',
        payload: {
          templateId: template.templateId,
          updates: { entries: template.entries },
        },
      },
      {
        type: 'deleteWeeklyTemplate',
        payload: { templateId: template.templateId },
      },
      {
        type: 'applyWeeklyTemplate',
        payload: {
          templateId: template.templateId,
          weekStartsOn: '2026-10-05',
        },
      },
      { type: 'createDraftClass', payload: draft },
      {
        type: 'editScheduledClass',
        payload: {
          classId: scheduledClass.classId,
          updates: { coachId: null, schedule: scheduledClass.schedule },
        },
      },
      {
        type: 'deleteDraftClass',
        payload: { classId: scheduledClass.classId },
      },
      {
        type: 'publishClasses',
        payload: { classIds: [scheduledClass.classId] },
      },
      {
        type: 'releaseClasses',
        payload: { classIds: [scheduledClass.classId] },
      },
      {
        type: 'cancelClass',
        payload: {
          classId: scheduledClass.classId,
          reason: 'Demo cancellation',
        },
      },
      {
        type: 'bookStation',
        payload: {
          memberId: member.memberId,
          classId: scheduledClass.classId,
          stationId: station.stationId,
        },
      },
      { type: 'cancelBooking', payload: { bookingId: booking.bookingId } },
      {
        type: 'removeBooking',
        payload: { bookingId: booking.bookingId, reason: 'Demo staff removal' },
      },
      {
        type: 'moveBooking',
        payload: {
          bookingId: booking.bookingId,
          destinationStationId: 'station:two',
          confirmed: true,
        },
      },
      {
        type: 'swapBookings',
        payload: {
          bookingId: booking.bookingId,
          otherBookingId: 'booking:two',
          confirmed: true,
        },
      },
      {
        type: 'joinWaitlist',
        payload: { classId: scheduledClass.classId, memberId: member.memberId },
      },
      { type: 'leaveWaitlist', payload: { entryId: waitlistEntry.entryId } },
      {
        type: 'promoteWaitlist',
        payload: {
          classId: scheduledClass.classId,
          stationId: station.stationId,
        },
      },
      { type: 'checkIn', payload: { bookingId: booking.bookingId } },
      {
        type: 'reverseCheckIn',
        payload: {
          attendanceId: attendance.attendanceId,
          reason: 'Demo reversal',
        },
      },
      {
        type: 'correctAttendance',
        payload: {
          attendanceId: attendance.attendanceId,
          outcome: 'attended',
          reason: 'Demo correction',
        },
      },
      {
        type: 'recordManualAttendance',
        payload: {
          classId: scheduledClass.classId,
          memberId: member.memberId,
          outcome: 'attended',
          reason: 'Demo outage',
        },
      },
      {
        type: 'resendNotification',
        payload: {
          notificationId: notification.notificationId,
          scenario: 'success',
        },
      },
      {
        type: 'updateOwnCoachProfile',
        payload: {
          staffId: staff.staffId,
          updates: { biography: 'Fictional bio', avatarId: 'avatar:initials' },
        },
      },
      {
        type: 'updateCoachProfile',
        payload: {
          staffId: staff.staffId,
          updates: {
            displayName: 'Coach Demo',
            contact: { email: 'demo@example.invalid' },
          },
        },
      },
      {
        type: 'updateSettings',
        payload: {
          updates: {
            memberCap: 20,
            scheduleRelease: { mode: 'rolling', advanceMinutes: 10080 },
          },
        },
      },
      {
        type: 'selectActor',
        payload: {
          actor: { kind: 'invitation', invitationId: invitation.invitationId },
        },
      },
      {
        type: 'setSimulation',
        payload: { delivery: 'failure', identity: 'rejected' },
      },
      { type: 'advanceClock', payload: { to: '2026-10-02T17:00:00Z' } },
      {
        type: 'setClockPreset',
        payload: { presetId: 'clockPreset:class-end' },
      },
      { type: 'resetDemo', payload: { confirmed: true } },
      {
        type: 'loadScenario',
        payload: { scenarioId: scenario.scenarioId, confirmed: true },
      },
      {
        type: 'unsupportedOperation',
        payload: { operation: 'offlineBooking' },
      },
    ] satisfies readonly DemoAction[];
    expectTypeOf<(typeof actions)[number]['type']>().toEqualTypeOf<
      DemoAction['type']
    >();
    expect(new Set(actions.map((action) => action.type)).size).toBe(
      actions.length,
    );
  });

  it('provides all explicit failure categories with user-displayable context', () => {
    const errors: readonly DomainError[] = [
      {
        category: 'ValidationError',
        message: 'Required field',
        fields: [{ field: 'displayName', message: 'Enter a name' }],
      },
      {
        category: 'IneligibleDemoAction',
        message: 'Current waiver required',
        reason: 'waiverOutdated',
        memberId: member.memberId,
      },
      {
        category: 'DemoConflict',
        message: 'Station unavailable',
        conflict: {
          kind: 'station',
          classId: scheduledClass.classId,
          stationId: station.stationId,
          availableStationIds: [],
        },
      },
      {
        category: 'DemoConflict',
        message: 'Overlap',
        conflict: { kind: 'schedule', classIds: [scheduledClass.classId] },
      },
      {
        category: 'DemoUnavailableState',
        message: 'Unknown scenario',
        resource: 'scenario',
        resourceId: 'scenario:missing',
        stale: false,
      },
      deliveryError,
      {
        category: 'UnsupportedPrototypeOperation',
        message: 'No offline booking',
        operation: 'offlineBooking',
      },
    ];
    const failure: DomainResult<AcceptedAction> = {
      success: false,
      error: deliveryError,
    };
    expect(failure.success).toBe(false);
    expect(new Set(errors.map((error) => error.category)).size).toBe(6);
  });

  it('models privacy-filtered and unavailable layouts without success-shaped fallbacks', () => {
    const view: LayoutView = {
      status: 'available',
      audience: 'member',
      classId: scheduledClass.classId,
      canReseat: false,
      stations: [
        {
          stationId: station.stationId,
          label: station.label,
          row: 0,
          column: 0,
          state: 'bookedCheckedIn',
          stateLabel: 'Booked, checked in',
        },
      ],
    };
    const unavailable: LayoutView = {
      status: 'unavailable',
      canReseat: false,
      error: {
        category: 'DemoUnavailableState',
        message: 'Stale layout',
        resource: 'layout',
        stale: true,
      },
    };
    expect(view.stations[0]).not.toHaveProperty('assignedMember');
    expect(unavailable.canReseat).toBe(false);
  });
});
