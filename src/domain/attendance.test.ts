import { describe, expect, it } from 'vitest';
import type {
  AttendanceOutcome,
  AttendanceRecord,
  Booking,
  BookingBase,
  ClassId,
  DemoActor,
  DemoState,
  DomainResult,
  ScheduledClass,
  UtcInstant,
} from './types';
import {
  advanceAttendanceClock,
  checkIn,
  correctAttendance,
  recordManualAttendance,
  reverseCheckIn,
} from './attendance';

const start = '2026-10-02T16:30:00Z' as UtcInstant;
const end = '2026-10-02T17:30:00Z' as UtcInstant;
const beforeWindow = '2026-10-02T15:59:59Z' as UtcInstant;
const leadEdge = '2026-10-02T16:00:00Z' as UtcInstant;
const graceEdge = '2026-10-02T16:35:00Z' as UtcInstant;
const afterWindow = '2026-10-02T16:35:01Z' as UtcInstant;
const memberActor: DemoActor = { kind: 'member', memberId: 'member:demo' };
const coachActor: DemoActor = { kind: 'staff', staffId: 'staff:coach' };

function scheduledClass(
  classId: ClassId = 'class:demo',
  startsAt: UtcInstant = start,
  endsAt: UtcInstant = end,
  status: ScheduledClass['status'] = 'published',
): ScheduledClass {
  return {
    classId,
    schedule: {
      date: '2026-10-02',
      time: '09:30',
      timezone: 'America/Los_Angeles',
    },
    startsAt,
    endsAt,
    status,
    classTypeSnapshot: {
      classTypeId: 'classType:rowing',
      name: 'Illustrative Rowing',
      durationMinutes: 60,
      description: 'Fictional class.',
      difficulty: 'Beginner',
    },
    lateCancelWaived: false,
    reviewFlags: [],
  };
}

type BookingFixtureOverrides = Partial<
  Pick<
    Booking,
    | 'bookingId'
    | 'memberId'
    | 'classId'
    | 'stationId'
    | 'bookedAt'
    | 'attendanceRecordId'
    | 'reviewFlags'
  >
> &
  ({ readonly status?: 'booked' } | { readonly status: 'staffRemoved' });

function booking(overrides: BookingFixtureOverrides = {}): Booking {
  const base: BookingBase = {
    bookingId: 'booking:demo',
    memberId: 'member:demo',
    classId: 'class:demo',
    stationId: 'station:demo',
    bookedAt: '2026-10-01T16:00:00Z',
    attendanceRecordId: 'attendance:demo',
    reviewFlags: [],
  };
  return overrides.status === 'staffRemoved'
    ? {
        ...base,
        ...overrides,
        status: 'staffRemoved',
        removedAt: '2026-10-01T16:00:00Z',
        removedBy: 'staff:coach',
        removalReason: 'Fictional removal',
      }
    : { ...base, ...overrides, status: 'booked' };
}

function record(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    attendanceId: 'attendance:demo',
    bookingId: 'booking:demo',
    classId: 'class:demo',
    memberId: 'member:demo',
    currentOutcome: 'booked',
    checkIn: { status: 'notCheckedIn' },
    source: { kind: 'booking', bookingId: 'booking:demo' },
    corrections: [],
    ...overrides,
  };
}

function state(overrides: Partial<DemoState> = {}): DemoState {
  return {
    revision: 0,
    staffAccounts: [
      {
        staffId: 'staff:coach',
        identitySubject: 'identity:coach',
        active: true,
        assignedRoles: ['coach'],
        assignedClassIds: ['class:demo'],
      },
    ],
    members: [
      {
        memberId: 'member:demo',
        displayName: 'Fictional Member',
        verifiedEmail: 'member@example.invalid',
        identitySubject: 'identity:member',
        status: 'active',
        invitationId: 'invitation:accepted',
        adultAttestationAt: '2026-10-01T16:00:00Z',
        adultEligibility: 'attested',
        createdAt: '2026-10-01T16:00:00Z',
      },
    ],
    invitations: [
      {
        invitationId: 'invitation:accepted',
        email: 'member@example.invalid',
        issuedAt: '2026-10-01T15:00:00Z',
        expiresAt: '2026-10-08T15:00:00Z',
        issuedBy: 'staff:coach',
        status: 'accepted',
        acceptedAt: '2026-10-01T16:00:00Z',
        memberId: 'member:demo',
      },
    ],
    waivers: [
      {
        waiverVersionId: 'waiver:current',
        version: 1,
        text: 'Fictional placeholder.',
        createdAt: '2026-10-01T16:00:00Z',
        publishedAt: '2026-10-01T16:00:00Z',
        status: 'published',
      },
    ],
    currentWaiverVersionId: 'waiver:current',
    waiverSignatures: [
      {
        signatureId: 'signature:demo',
        memberId: 'member:demo',
        waiverVersionId: 'waiver:current',
        typedName: 'Fictional Member',
        signedAt: '2026-10-01T16:05:00Z',
      },
    ],
    stations: [],
    layout: { availability: 'current' },
    classTypes: [],
    weeklyTemplates: [],
    classes: [scheduledClass()],
    bookings: [booking()],
    waitlistEntries: [],
    attendance: [],
    notifications: [],
    settings: {
      illustrative: true,
      timezone: 'America/Los_Angeles',
      memberCap: 10,
      invitationExpiryMinutes: 60,
      scheduleRelease: { mode: 'immediate' },
      targetGapMinutes: 30,
      waitlistCutoffMinutes: 30,
      lateCancelCutoffMinutes: 30,
      checkInLeadMinutes: 30,
      checkInGraceMinutes: 5,
    },
    activeActor: memberActor,
    scenarioId: 'scenario:attendance',
    clock: { now: leadEdge, presetId: null },
    simulation: { delivery: 'success', identity: 'verified' },
    ...overrides,
  };
}

function value<T>(result: DomainResult<T>): T {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.error.message);
  return result.value;
}

function error<T>(result: DomainResult<T>): string {
  expect(result.success).toBe(false);
  if (result.success) throw new Error('Expected a domain failure.');
  return result.error.category;
}

function freeze<T>(input: T): T {
  if (input !== null && typeof input === 'object') {
    Object.values(input).forEach(freeze);
    Object.freeze(input);
  }
  return input;
}

describe('attendance rules', () => {
  it('allows member check-in at both configured window edges, including during an earlier class', () => {
    const earlier = scheduledClass(
      'class:earlier',
      '2026-10-02T16:15:00Z',
      '2026-10-02T16:45:00Z',
    );
    const input = freeze(
      state({
        classes: [scheduledClass(), earlier],
        clock: { now: leadEdge, presetId: null },
      }),
    );

    const atLead = value(checkIn(input, memberActor, 'booking:demo', leadEdge));
    expect(atLead.attendance?.[0]?.checkIn).toEqual({
      status: 'checkedIn',
      checkedInAt: leadEdge,
      checkedInBy: memberActor,
    });
    expect(
      value(checkIn(input, memberActor, 'booking:demo', graceEdge))
        .attendance?.[0]?.currentOutcome,
    ).toBe('attended');
    expect(input.attendance).toEqual([]);
  });

  it('rejects self-check-in just outside either configured edge', () => {
    const input = state();
    expect(
      error(checkIn(input, memberActor, 'booking:demo', beforeWindow)),
    ).toBe('IneligibleDemoAction');
    expect(
      error(checkIn(input, memberActor, 'booking:demo', afterWindow)),
    ).toBe('IneligibleDemoAction');
    expect(input.attendance).toEqual([]);
  });

  it('requires active membership, accepted invitation, and a current waiver signature', () => {
    const inactive = state({
      members: [{ ...state().members[0]!, status: 'inactive' }],
    });
    const unacceptedInvite = state({
      invitations: [
        {
          ...state().invitations[0]!,
          status: 'revoked',
          revokedAt: '2026-10-01T16:00:00Z',
          revokedBy: 'staff:coach',
        },
      ],
    });
    const outdatedWaiver = state({
      currentWaiverVersionId: 'waiver:new',
      waivers: [
        ...state().waivers,
        {
          waiverVersionId: 'waiver:new',
          version: 2,
          text: 'New fictional placeholder.',
          createdAt: '2026-10-01T16:00:00Z',
          publishedAt: '2026-10-01T17:00:00Z',
          status: 'published',
        },
      ],
    });

    expect(
      error(checkIn(inactive, memberActor, 'booking:demo', leadEdge)),
    ).toBe('IneligibleDemoAction');
    expect(
      error(checkIn(unacceptedInvite, memberActor, 'booking:demo', leadEdge)),
    ).toBe('IneligibleDemoAction');
    expect(
      error(checkIn(outdatedWaiver, memberActor, 'booking:demo', leadEdge)),
    ).toBe('IneligibleDemoAction');
  });

  it('rejects a member trying to check in another member or an unbooked attendee', () => {
    const otherMember: DemoActor = {
      kind: 'member',
      memberId: 'member:other',
    };
    const input = state({
      members: [
        ...state().members,
        { ...state().members[0]!, memberId: 'member:other' },
      ],
    });
    expect(error(checkIn(input, otherMember, 'booking:demo', leadEdge))).toBe(
      'IneligibleDemoAction',
    );
    expect(
      error(
        checkIn(
          state({ bookings: [booking({ status: 'staffRemoved' })] }),
          memberActor,
          'booking:demo',
          leadEdge,
        ),
      ),
    ).toBe('IneligibleDemoAction');
  });

  it('lets scoped staff check in outside the member window and records the actor', () => {
    const input = state({ clock: { now: end, presetId: null } });
    const changes = value(checkIn(input, coachActor, 'booking:demo', end));
    expect(changes.attendance?.[0]).toMatchObject({
      currentOutcome: 'attended',
      checkIn: { status: 'notCheckedIn' },
      source: { kind: 'staff', staffId: 'staff:coach', recordedAt: end },
    });
  });

  it('enforces coach class scope and preserves staff correction history', () => {
    const otherClass = scheduledClass('class:other');
    const outOfScope = state({
      classes: [otherClass],
      bookings: [booking({ classId: 'class:other' })],
    });
    expect(
      error(checkIn(outOfScope, coachActor, 'booking:demo', leadEdge)),
    ).toBe('IneligibleDemoAction');

    const input = state({ attendance: [record()] });
    const corrected = value(
      correctAttendance(
        input,
        coachActor,
        'attendance:demo',
        'lateCancel',
        'Corrected roster entry',
        end,
      ),
    );
    expect(corrected.attendance?.[0]?.currentOutcome).toBe('lateCancel');
    expect(corrected.attendance?.[0]?.corrections).toEqual([
      expect.objectContaining({
        previousOutcome: 'booked',
        newOutcome: 'lateCancel',
        staffId: 'staff:coach',
        reason: 'Corrected roster entry',
        recordedAt: end,
      }),
    ]);
    expect(input.attendance[0]?.corrections).toEqual([]);
  });

  it('allows staff corrections after class end without reopening check-in', () => {
    const checkedIn = record({
      currentOutcome: 'noShow',
      checkIn: {
        status: 'checkedIn',
        checkedInAt: start,
        checkedInBy: memberActor,
      },
    });
    const input = state({
      classes: [scheduledClass('class:demo', start, end, 'completed')],
      attendance: [checkedIn],
    });
    const corrected = value(
      checkIn(input, coachActor, 'booking:demo', '2026-10-02T18:00:00Z'),
    );
    expect(corrected.attendance?.[0]?.currentOutcome).toBe('attended');
    expect(corrected.attendance?.[0]?.checkIn).toEqual(checkedIn.checkIn);
    expect(corrected.attendance?.[0]?.corrections).toHaveLength(1);

    const reversed = value(
      reverseCheckIn(
        correctedState(input, corrected),
        coachActor,
        'attendance:demo',
        'Member did not attend',
        '2026-10-02T18:05:00Z',
      ),
    );
    expect(reversed.attendance?.[0]?.currentOutcome).toBe('noShow');
    expect(reversed.attendance?.[0]?.checkIn).toEqual(checkedIn.checkIn);
  });

  it('reverses a check-in before class end and records the reason', () => {
    const checkedIn = record({
      currentOutcome: 'attended',
      checkIn: {
        status: 'checkedIn',
        checkedInAt: leadEdge,
        checkedInBy: memberActor,
      },
    });
    const input = state({ attendance: [checkedIn] });
    const reversed = value(
      reverseCheckIn(
        input,
        coachActor,
        'attendance:demo',
        'Member left before class',
        start,
      ),
    );
    expect(reversed.attendance?.[0]?.currentOutcome).toBe('booked');
    expect(reversed.attendance?.[0]?.checkIn).toEqual({
      status: 'notCheckedIn',
    });
    expect(reversed.attendance?.[0]?.corrections[0]).toMatchObject({
      previousOutcome: 'attended',
      newOutcome: 'booked',
      previousCheckIn: checkedIn.checkIn,
      newCheckIn: { status: 'notCheckedIn' },
      reason: 'Member left before class',
    });
  });

  it('records manual outage attendance without changing the related booking', () => {
    const input = freeze(state());
    const changes = value(
      recordManualAttendance(
        input,
        coachActor,
        'class:demo',
        'member:demo',
        'attended',
        'Paper roster during outage',
        end,
      ),
    );
    expect(changes.attendance?.[0]).toMatchObject({
      currentOutcome: 'attended',
      bookingId: 'booking:demo',
      source: { kind: 'manualOutage', staffId: 'staff:coach', recordedAt: end },
    });
    expect(changes.bookings).toBeUndefined();
    expect(input.bookings[0]?.status).toBe('booked');
  });

  it('records manual attendance for a non-booked attendee and distinct outcomes', () => {
    const input = state({ bookings: [] });
    const outcome: AttendanceOutcome = 'staffRemoved';
    const changes = value(
      recordManualAttendance(
        input,
        coachActor,
        'class:demo',
        'member:demo',
        outcome,
        'Recorded from paper roster',
        end,
      ),
    );
    expect(changes.attendance?.[0]).toMatchObject({
      currentOutcome: outcome,
      checkIn: { status: 'notCheckedIn' },
      source: { kind: 'manualOutage' },
    });
    expect(changes.attendance?.[0]?.bookingId).toBeUndefined();
  });

  it('completes exactly at class end and marks only unresolved booked members no-show', () => {
    const otherBooking = booking({
      bookingId: 'booking:checked',
      attendanceRecordId: 'attendance:checked',
      memberId: 'member:checked',
    });
    const input = state({
      bookings: [booking(), otherBooking],
      attendance: [
        record({
          attendanceId: 'attendance:checked',
          bookingId: 'booking:checked',
          memberId: 'member:checked',
          currentOutcome: 'attended',
          checkIn: {
            status: 'checkedIn',
            checkedInAt: start,
            checkedInBy: memberActor,
          },
        }),
      ],
      clock: { now: start, presetId: 'clockPreset:before-end' },
    });

    const changes = value(advanceAttendanceClock(input, end));
    expect(changes.clock).toEqual({ now: end, presetId: null });
    expect(changes.classes?.[0]).toMatchObject({
      status: 'completed',
      completedAt: end,
    });
    expect(changes.attendance).toEqual([
      expect.objectContaining({
        attendanceId: 'attendance:checked',
        currentOutcome: 'attended',
      }),
      expect.objectContaining({
        attendanceId: 'attendance:demo',
        currentOutcome: 'noShow',
        source: { kind: 'classEnd', recordedAt: end },
      }),
    ]);
  });

  it('completes classes crossed by a clock advance but not classes ending before its start', () => {
    const endedEarlier = scheduledClass(
      'class:earlier',
      '2026-10-02T14:30:00Z',
      '2026-10-02T15:30:00Z',
    );
    const crossed = scheduledClass(
      'class:crossed',
      '2026-10-02T16:00:00Z',
      '2026-10-02T16:30:00Z',
    );
    const input = state({
      classes: [endedEarlier, crossed],
      bookings: [
        booking({
          classId: 'class:earlier',
          attendanceRecordId: 'attendance:earlier',
        }),
        booking({
          classId: 'class:crossed',
          attendanceRecordId: 'attendance:crossed',
        }),
      ],
      clock: { now: '2026-10-02T15:30:00Z', presetId: null },
    });

    const changes = value(advanceAttendanceClock(input, end));
    expect(changes.classes?.map((item) => item.status)).toEqual([
      'published',
      'completed',
    ]);
    expect(changes.attendance?.map((item) => item.classId)).toEqual([
      'class:crossed',
    ]);
  });

  it('is idempotent when the clock is repeated or advanced after a staff correction', () => {
    const completed = scheduledClass('class:demo', start, end, 'completed');
    const corrected = record({
      currentOutcome: 'attended',
      corrections: [
        {
          correctionId: 'correction:attended',
          staffId: 'staff:coach',
          previousOutcome: 'noShow',
          newOutcome: 'attended',
          recordedAt: '2026-10-02T17:45:00Z',
          reason: 'Confirmed arrival from staff notes',
        },
      ],
    });
    const input = state({
      classes: [completed],
      attendance: [corrected],
      clock: { now: end, presetId: null },
    });
    const repeated = value(advanceAttendanceClock(input, end));
    const extended = value(
      advanceAttendanceClock(input, '2026-10-02T19:00:00Z'),
    );

    expect(repeated.attendance).toBeUndefined();
    expect(extended.attendance).toBeUndefined();
    expect(extended.classes).toBeUndefined();
    expect(extended.clock?.now).toBe('2026-10-02T19:00:00Z');
    expect(corrected.currentOutcome).toBe('attended');
    expect(corrected.corrections).toHaveLength(1);
  });

  it('rejects backward clock movement and invalid correction requests without mutation', () => {
    const input = freeze(state({ attendance: [record()] }));
    expect(error(advanceAttendanceClock(input, '2026-10-02T15:00:00Z'))).toBe(
      'IneligibleDemoAction',
    );
    expect(
      error(
        correctAttendance(
          input,
          coachActor,
          'attendance:demo',
          'attended',
          '  ',
          end,
        ),
      ),
    ).toBe('ValidationError');
    expect(input.attendance[0]?.currentOutcome).toBe('booked');
    expect(input.attendance[0]?.corrections).toEqual([]);
  });
});

function correctedState(
  original: DemoState,
  changes: { readonly attendance?: readonly AttendanceRecord[] },
): DemoState {
  return { ...original, attendance: changes.attendance ?? original.attendance };
}
