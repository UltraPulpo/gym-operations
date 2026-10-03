import { describe, expect, it } from 'vitest';
import type {
  AttendanceRecord,
  Booking,
  ClassId,
  DemoActor,
  DemoState,
  DomainResult,
  Member,
  ScheduledClass,
  UtcInstant,
  WaitlistEntry,
} from './types';
import {
  bookStation,
  cancelBooking,
  cancelClassReservations,
  joinWaitlist,
  leaveWaitlist,
  moveBooking,
  moveOwnBooking,
  removeBooking,
  swapBookings,
  promoteWaitlist,
} from './booking';
import { editScheduledClass } from './scheduling';

const now: UtcInstant = '2026-10-02T16:00:00Z';
const classStart: UtcInstant = '2026-10-02T17:00:00Z';
const classEnd: UtcInstant = '2026-10-02T18:00:00Z';
const waiverId = 'waiver:current';
const classId: ClassId = 'class:upcoming';
const memberOne = 'member:one';
const memberTwo = 'member:two';
const memberThree = 'member:three';
const memberFour = 'member:four';
const memberFive = 'member:five';

const admin: DemoActor = { kind: 'staff', staffId: 'staff:admin' };
const frontDesk: DemoActor = { kind: 'staff', staffId: 'staff:frontDesk' };
const coach: DemoActor = { kind: 'staff', staffId: 'staff:coach' };

function makeMember(
  memberId: Member['memberId'],
  status: Member['status'] = 'active',
): Member {
  const suffix = memberId.slice('member:'.length);
  return {
    memberId,
    displayName: `Fictional ${suffix}`,
    verifiedEmail: `${suffix}@example.invalid`,
    identitySubject: `identity:${suffix}`,
    status,
    invitationId: `invitation:${suffix}`,
    adultAttestationAt: now,
    adultEligibility: 'attested',
    createdAt: now,
  };
}

function makeClass(overrides: Partial<ScheduledClass> = {}): ScheduledClass {
  return {
    classId,
    schedule: {
      date: '2026-10-02',
      time: '10:00',
      timezone: 'America/Los_Angeles',
    },
    startsAt: classStart,
    endsAt: classEnd,
    status: 'published',
    classTypeSnapshot: {
      classTypeId: 'classType:rowing',
      name: 'Illustrative Rowing',
      durationMinutes: 60,
      description: 'Fictional class.',
      difficulty: 'Illustrative',
    },
    releasedAt: '2026-10-02T15:00:00Z',
    publishedAt: '2026-10-02T14:00:00Z',
    lateCancelWaived: false,
    reviewFlags: [],
    ...overrides,
  };
}

function makeBooking(
  bookingId: Booking['bookingId'],
  memberId: Booking['memberId'],
  stationId: Booking['stationId'],
  targetClassId = classId,
): Booking {
  return {
    bookingId,
    memberId,
    classId: targetClassId,
    stationId,
    bookedAt: now,
    attendanceRecordId: `attendance:${bookingId.slice('booking:'.length)}`,
    reviewFlags: [],
    status: 'booked',
  };
}

function makeAttendance(booking: Booking): AttendanceRecord {
  return {
    attendanceId: booking.attendanceRecordId,
    bookingId: booking.bookingId,
    classId: booking.classId,
    memberId: booking.memberId,
    currentOutcome: 'booked',
    checkIn: { status: 'notCheckedIn' },
    source: { kind: 'booking', bookingId: booking.bookingId },
    corrections: [],
  };
}

function makeWaitlist(
  entryId: WaitlistEntry['entryId'],
  memberId: WaitlistEntry['memberId'],
  joinOrder: number,
  status: 'waiting' | 'left' = 'waiting',
): WaitlistEntry {
  const base = {
    entryId,
    memberId,
    classId,
    joinOrder,
    joinedAt: now,
    reviewFlags: [],
  };
  if (status === 'left') return { ...base, status, leftAt: now };
  return { ...base, status };
}

function makeState(overrides: Partial<DemoState> = {}): DemoState {
  const members = overrides.members ?? [
    makeMember(memberOne),
    makeMember(memberTwo),
    makeMember(memberThree),
    makeMember(memberFour),
    makeMember(memberFive),
  ];
  const invitations =
    overrides.invitations ??
    members.map((member) => ({
      invitationId: member.invitationId,
      email: member.verifiedEmail,
      issuedAt: '2026-10-01T12:00:00Z' as UtcInstant,
      expiresAt: '2026-10-09T12:00:00Z' as UtcInstant,
      issuedBy: 'staff:admin' as const,
      status: 'accepted' as const,
      acceptedAt: '2026-10-01T12:30:00Z' as UtcInstant,
      memberId: member.memberId,
    }));
  const waiverSignatures =
    overrides.waiverSignatures ??
    members.map((member, index) => ({
      signatureId: `signature:${index + 1}`,
      memberId: member.memberId,
      waiverVersionId: waiverId,
      typedName: member.displayName,
      signedAt: '2026-10-01T13:00:00Z' as UtcInstant,
    }));
  const bookings = overrides.bookings ?? [];
  const attendance =
    overrides.attendance ??
    bookings
      .filter((booking) => booking.status === 'booked')
      .map(makeAttendance);
  return {
    revision: 0,
    staffAccounts: [
      {
        staffId: 'staff:admin',
        identitySubject: 'identity:admin',
        active: true,
        assignedRoles: ['admin'],
        assignedClassIds: [],
      },
      {
        staffId: 'staff:frontDesk',
        identitySubject: 'identity:frontDesk',
        active: true,
        assignedRoles: ['frontDesk'],
        assignedClassIds: [],
      },
      {
        staffId: 'staff:coach',
        identitySubject: 'identity:coach',
        active: true,
        assignedRoles: ['coach'],
        assignedClassIds: [classId],
      },
    ],
    members,
    invitations,
    waivers: [
      {
        waiverVersionId: waiverId,
        version: 1,
        text: 'Fictional placeholder only.',
        createdAt: '2026-10-01T11:00:00Z',
        status: 'published',
        publishedAt: '2026-10-01T12:00:00Z',
      },
    ],
    currentWaiverVersionId: waiverId,
    waiverSignatures,
    stations: [
      {
        stationId: 'station:one',
        label: 'Station One',
        pm5Serial: null,
        inService: true,
        row: 0,
        column: 0,
      },
      {
        stationId: 'station:two',
        label: 'Station Two',
        pm5Serial: null,
        inService: true,
        row: 0,
        column: 1,
      },
      {
        stationId: 'station:three',
        label: 'Station Three',
        pm5Serial: null,
        inService: true,
        row: 0,
        column: 2,
      },
      {
        stationId: 'station:offline',
        label: 'Station Offline',
        pm5Serial: null,
        inService: false,
        row: 0,
        column: 3,
      },
    ],
    retiredStations: overrides.retiredStations ?? [],
    layout: { availability: 'current' },
    classTypes: [],
    weeklyTemplates: [],
    classes: [makeClass()],
    bookings,
    waitlistEntries: [],
    attendance,
    notifications: [],
    settings: {
      illustrative: true,
      timezone: 'America/Los_Angeles',
      memberCap: 20,
      invitationExpiryMinutes: 60,
      scheduleRelease: { mode: 'manual' },
      targetGapMinutes: 30,
      waitlistCutoffMinutes: 30,
      lateCancelCutoffMinutes: 30,
      checkInLeadMinutes: 30,
      checkInGraceMinutes: 5,
    },
    activeActor: { kind: 'member', memberId: memberOne },
    scenarioId: 'scenario:booking-tests',
    clock: { now, presetId: null },
    simulation: { delivery: 'success', identity: 'verified' },
    ...overrides,
  };
}

function value<T>(result: DomainResult<T>): T {
  if (!result.success) throw new Error(result.error.message);
  return result.value;
}

function booked(
  state: DemoState,
  memberId: Booking['memberId'] = memberOne,
  stationId: Booking['stationId'] = 'station:one',
): DemoState {
  const booking = makeBooking('booking:existing', memberId, stationId);
  return {
    ...state,
    bookings: [booking],
    attendance: [makeAttendance(booking)],
  };
}

describe('member booking and waitlist rules', () => {
  it('books a free in-service station for an eligible member and records attendance and simulated confirmation', () => {
    const input = makeState();
    const result = value(
      bookStation(
        input,
        { kind: 'member', memberId: memberOne },
        memberOne,
        classId,
        'station:one',
        'booking:new',
        now,
      ),
    );

    expect(result.bookings).toEqual([
      expect.objectContaining({
        bookingId: 'booking:new',
        memberId: memberOne,
        stationId: 'station:one',
        status: 'booked',
      }),
    ]);
    expect(result.attendance).toEqual([
      expect.objectContaining({
        bookingId: 'booking:new',
        currentOutcome: 'booked',
        checkIn: { status: 'notCheckedIn' },
      }),
    ]);
    expect(result.notifications?.[0]).toMatchObject({
      event: { type: 'bookingConfirmed', bookingId: 'booking:new' },
      status: 'sent',
    });
    expect(input.bookings).toEqual([]);
  });

  it('allows a member to hold bookings in multiple classes without imposing a count limit', () => {
    const firstClass = makeClass();
    const secondClass = makeClass({
      classId: 'class:later',
      startsAt: '2026-10-03T17:00:00Z',
      endsAt: '2026-10-03T18:00:00Z',
    });
    const input = makeState({
      classes: [firstClass, secondClass],
      bookings: [
        makeBooking('booking:first', memberOne, 'station:one', classId),
      ],
    });

    const result = bookStation(
      input,
      { kind: 'member', memberId: memberOne },
      memberOne,
      'class:later',
      'station:three',
      'booking:third',
      now,
    );

    expect(value(result).bookings).toHaveLength(2);
    expect(value(result).bookings?.[1]?.stationId).toBe('station:three');
  });

  it('returns refreshed availability when a previously free station is already occupied', () => {
    const input = booked(makeState(), memberTwo);
    const result = bookStation(
      input,
      { kind: 'member', memberId: memberOne },
      memberOne,
      classId,
      'station:one',
      'booking:new',
      now,
    );

    expect(result).toMatchObject({
      success: false,
      error: {
        category: 'DemoConflict',
        conflict: {
          kind: 'station',
          classId,
          stationId: 'station:one',
          availableStationIds: ['station:two', 'station:three'],
        },
      },
    });
    expect(input.bookings).toHaveLength(1);
  });

  it('includes explicit stale layout status alongside refreshed conflict availability', () => {
    const input = booked(
      makeState({ layout: { availability: 'stale' } }),
      memberTwo,
    );
    const result = bookStation(
      input,
      { kind: 'member', memberId: memberOne },
      memberOne,
      classId,
      'station:one',
      'booking:new',
      now,
    );

    expect(result).toMatchObject({
      success: false,
      error: {
        category: 'DemoConflict',
        conflict: {
          kind: 'station',
          availableStationIds: ['station:two', 'station:three'],
          layout: {
            status: 'unavailable',
            error: { resource: 'layout', stale: true },
          },
        },
      },
    });
  });

  it('enforces station exclusivity per class rather than across separate classes', () => {
    const input = makeState({
      classes: [makeClass(), makeClass({ classId: 'class:later' })],
      bookings: [
        makeBooking(
          'booking:other-class',
          memberTwo,
          'station:one',
          'class:later',
        ),
      ],
    });

    expect(
      bookStation(
        input,
        { kind: 'member', memberId: memberOne },
        memberOne,
        classId,
        'station:one',
        'booking:new',
        now,
      ).success,
    ).toBe(true);
  });

  it.each([
    [
      'inactive member',
      () => makeState({ members: [makeMember(memberOne, 'inactive')] }),
    ],
    ['missing current waiver', () => makeState({ waiverSignatures: [] })],
    [
      'unaccepted invitation',
      () =>
        makeState({
          invitations: [
            {
              invitationId: 'invitation:one',
              email: 'one@example.invalid',
              issuedAt: '2026-10-01T12:00:00Z',
              expiresAt: '2026-10-09T12:00:00Z',
              issuedBy: 'staff:admin',
              status: 'outstanding',
            },
          ],
        }),
    ],
    [
      'unpublished class',
      () => makeState({ classes: [makeClass({ status: 'draft' })] }),
    ],
    [
      'unreleased manual class',
      () => makeState({ classes: [makeClass({ releasedAt: undefined })] }),
    ],
    ['zero in-service capacity', () => makeState({ stations: [] })],
    [
      'out-of-service station',
      () =>
        makeState({
          stations: [
            {
              stationId: 'station:offline',
              label: 'Station Offline',
              pm5Serial: null,
              inService: false,
              row: 0,
              column: 0,
            },
          ],
        }),
    ],
  ])(
    'rejects booking when %s and leaves the input unchanged',
    (_name, create) => {
      const input = create();
      const snapshot = JSON.stringify(input);
      const result = bookStation(
        input,
        { kind: 'member', memberId: memberOne },
        memberOne,
        classId,
        'station:one',
        'booking:new',
        now,
      );

      expect(result.success).toBe(false);
      expect(JSON.stringify(input)).toBe(snapshot);
    },
  );

  it('rejects booking after class start and booking ID reuse', () => {
    const input = makeState();
    expect(
      bookStation(
        input,
        { kind: 'member', memberId: memberOne },
        memberOne,
        classId,
        'station:one',
        'booking:new',
        classStart,
      ),
    ).toMatchObject({
      success: false,
      error: { category: 'IneligibleDemoAction', reason: 'classStarted' },
    });
    const existing = booked(input);
    expect(
      bookStation(
        existing,
        { kind: 'member', memberId: memberTwo },
        memberTwo,
        classId,
        'station:two',
        'booking:existing',
        now,
      ).success,
    ).toBe(false);
  });

  it('requires a full class to join, retains a departed entry, and rejoins at the FIFO tail', () => {
    const input = makeState({
      waitlistEntries: [
        makeWaitlist('waitlist:historical', memberFour, 8, 'left'),
      ],
    });
    expect(
      joinWaitlist(
        input,
        { kind: 'member', memberId: memberFour },
        memberFour,
        classId,
        'waitlist:first',
        now,
      ),
    ).toMatchObject({
      success: false,
      error: { category: 'IneligibleDemoAction', reason: 'classNotFull' },
    });

    const full = makeState({
      bookings: [
        makeBooking('booking:one', memberOne, 'station:one'),
        makeBooking('booking:two', memberTwo, 'station:two'),
        makeBooking('booking:three', memberThree, 'station:three'),
      ],
      waitlistEntries: [
        makeWaitlist('waitlist:historical', memberThree, 8, 'left'),
      ],
    });
    const joined = value(
      joinWaitlist(
        full,
        { kind: 'member', memberId: memberFour },
        memberFour,
        classId,
        'waitlist:first',
        now,
      ),
    );
    expect(joined.waitlistEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId: 'waitlist:first', joinOrder: 9 }),
      ]),
    );
    const left = value(
      leaveWaitlist(
        { ...full, waitlistEntries: joined.waitlistEntries ?? [] },
        { kind: 'member', memberId: memberFour },
        'waitlist:first',
        now,
      ),
    );
    const rejoined = value(
      joinWaitlist(
        { ...full, waitlistEntries: left.waitlistEntries ?? [] },
        { kind: 'member', memberId: memberFour },
        memberFour,
        classId,
        'waitlist:rejoined',
        now,
      ),
    );
    expect(rejoined.waitlistEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entryId: 'waitlist:first',
          status: 'left',
        }),
        expect.objectContaining({
          entryId: 'waitlist:rejoined',
          joinOrder: 10,
          status: 'waiting',
        }),
      ]),
    );
  });

  it('promotes the first eligible FIFO entry after a member cancellation and retains skipped entries for review', () => {
    const booking = makeBooking('booking:departing', memberOne, 'station:one');
    const inactiveMember = makeMember(memberTwo, 'inactive');
    const input = makeState({
      members: [
        makeMember(memberOne),
        inactiveMember,
        makeMember(memberThree),
        makeMember(memberFour),
        makeMember(memberFive),
      ],
      bookings: [booking],
      attendance: [makeAttendance(booking)],
      waiverSignatures: makeState().waiverSignatures.filter(
        (signature) => signature.memberId !== memberThree,
      ),
      invitations: makeState().invitations.filter(
        (invitation) =>
          !('memberId' in invitation) || invitation.memberId !== memberFour,
      ),
      waitlistEntries: [
        makeWaitlist('waitlist:inactive', memberTwo, 1),
        makeWaitlist('waitlist:old-waiver', memberThree, 2),
        makeWaitlist('waitlist:unaccepted', memberFour, 3),
        makeWaitlist('waitlist:eligible', memberFive, 4),
      ],
    });

    const result = value(
      cancelBooking(
        input,
        { kind: 'member', memberId: memberOne },
        booking.bookingId,
        now,
      ),
    );
    expect(result.bookings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookingId: booking.bookingId,
          status: 'cancelled',
          cancellationReason: 'member',
        }),
        expect.objectContaining({
          memberId: memberFive,
          stationId: 'station:one',
          status: 'booked',
          promotedFromEntryId: 'waitlist:eligible',
        }),
      ]),
    );
    expect(result.waitlistEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entryId: 'waitlist:inactive',
          status: 'waiting',
          reviewFlags: ['memberInactive'],
        }),
        expect.objectContaining({
          entryId: 'waitlist:old-waiver',
          status: 'waiting',
          reviewFlags: ['waiverOutdated'],
        }),
        expect.objectContaining({
          entryId: 'waitlist:unaccepted',
          status: 'waiting',
          reviewFlags: ['invitationNotAccepted'],
        }),
        expect.objectContaining({
          entryId: 'waitlist:eligible',
          status: 'promoted',
        }),
      ]),
    );
    expect(result.attendance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookingId: booking.bookingId,
          currentOutcome: 'cancelled',
        }),
        expect.objectContaining({
          memberId: memberFive,
          currentOutcome: 'booked',
        }),
      ]),
    );
    expect(result.notifications?.map((item) => item.event.type)).toEqual([
      'waitlistPromoted',
    ]);
  });

  it('returns an explicit non-promotion result and retains every skipped review flag', () => {
    const input = makeState({
      members: [
        makeMember(memberOne),
        makeMember(memberTwo, 'inactive'),
        makeMember(memberThree),
        makeMember(memberFour),
      ],
      waiverSignatures: makeState().waiverSignatures.filter(
        (signature) => signature.memberId !== memberThree,
      ),
      invitations: makeState().invitations.filter(
        (invitation) =>
          !('memberId' in invitation) || invitation.memberId !== memberFour,
      ),
      waitlistEntries: [
        makeWaitlist('waitlist:inactive', memberTwo, 1),
        makeWaitlist('waitlist:waiver', memberThree, 2),
        makeWaitlist('waitlist:invitation', memberFour, 3),
      ],
    });
    const before = structuredClone(input);
    const result = value(
      promoteWaitlist(input, frontDesk, classId, 'station:one', now),
    );
    expect(result.promoted).toBe(false);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        category: 'waitlistNotPromoted',
        classId,
        reason: 'noEligibleWaiter',
      }),
    ]);
    expect(result.changes.bookings).toBeUndefined();
    expect(result.changes.attendance).toBeUndefined();
    expect(result.changes.notifications).toBeUndefined();
    expect(
      result.changes.waitlistEntries?.map((entry) => [
        entry.status,
        entry.reviewFlags,
      ]),
    ).toEqual([
      ['waiting', ['memberInactive']],
      ['waiting', ['waiverOutdated']],
      ['waiting', ['invitationNotAccepted']],
    ]);
    expect(input).toEqual(before);
    const departing = makeBooking(
      'booking:departing',
      memberOne,
      'station:one',
    );
    const automatic = value(
      cancelBooking(
        {
          ...input,
          bookings: [departing],
          attendance: [makeAttendance(departing)],
        },
        { kind: 'member', memberId: memberOne },
        departing.bookingId,
        now,
      ),
    );
    expect(automatic.waitlistEntries).toEqual(result.changes.waitlistEntries);
    expect(automatic.bookings).toHaveLength(1);
    expect(automatic.bookings?.[0]?.status).toBe('cancelled');
    expect(automatic.notifications).toBeUndefined();
  });

  it('shares skipped-entry policy between automated cancellation and manual promotion', () => {
    const booking = makeBooking('booking:departing', memberOne, 'station:one');
    const state = makeState({
      members: [
        makeMember(memberOne),
        makeMember(memberTwo, 'inactive'),
        makeMember(memberThree),
      ],
      waitlistEntries: [
        makeWaitlist('waitlist:inactive', memberTwo, 1),
        makeWaitlist('waitlist:eligible', memberThree, 2),
      ],
    });
    const manual = value(
      promoteWaitlist(state, frontDesk, classId, 'station:one', now),
    );
    const automatic = value(
      cancelBooking(
        {
          ...state,
          bookings: [booking],
          attendance: [makeAttendance(booking)],
        },
        { kind: 'member', memberId: memberOne },
        booking.bookingId,
        now,
      ),
    );
    expect(manual.promoted).toBe(true);
    expect(manual.warnings).toEqual([]);
    expect(manual.changes.waitlistEntries).toEqual(automatic.waitlistEntries);
    expect(manual.changes.bookings?.[0]).toEqual(automatic.bookings?.at(-1));
    expect(manual.changes.attendance?.[0]).toEqual(
      automatic.attendance?.at(-1),
    );
    expect(manual.changes.notifications).toEqual(automatic.notifications);
  });

  it('retains all-ineligible flags after automated cancellation without a phantom promotion', () => {
    const booking = makeBooking('booking:departing', memberOne, 'station:one');
    const input = makeState({
      members: [makeMember(memberOne), makeMember(memberTwo, 'inactive')],
      bookings: [booking],
      waitlistEntries: [makeWaitlist('waitlist:inactive', memberTwo, 1)],
    });
    const before = structuredClone(input);
    const result = value(
      cancelBooking(
        input,
        { kind: 'member', memberId: memberOne },
        booking.bookingId,
        now,
      ),
    );
    expect(result.bookings).toHaveLength(1);
    expect(result.bookings?.[0]?.status).toBe('cancelled');
    expect(result.waitlistEntries?.[0]).toMatchObject({
      status: 'waiting',
      reviewFlags: ['memberInactive'],
    });
    expect(result.notifications).toBeUndefined();
    expect(input).toEqual(before);
  });

  it.each(['2026-10-02T16:29:59Z', '2026-10-02T16:30:00Z'] as const)(
    'enforces the same strict manual promotion cutoff at %s',
    (instant) => {
      const input = makeState({
        waitlistEntries: [makeWaitlist('waitlist:next', memberTwo, 1)],
      });
      const before = structuredClone(input);
      const result = promoteWaitlist(
        input,
        frontDesk,
        classId,
        'station:one',
        instant,
      );
      if (instant === '2026-10-02T16:29:59Z') {
        const promotion = value(result);
        expect(promotion.promoted).toBe(true);
        expect(promotion.changes.waitlistEntries?.[0]?.status).toBe('promoted');
      } else {
        expect(result).toMatchObject({
          success: false,
          error: { reason: 'waitlistCutoffReached' },
        });
      }
      expect(input).toEqual(before);
    },
  );

  it.each(['manual', 'automatic'] as const)(
    'rejects %s promotion atomically when notification composition is invalid',
    (path) => {
      const booking = makeBooking(
        'booking:departing',
        memberOne,
        'station:one',
      );
      const input = makeState({
        simulation: {
          delivery: 'invalid' as DemoState['simulation']['delivery'],
          identity: 'verified',
        },
        bookings: path === 'automatic' ? [booking] : [],
        waitlistEntries: [makeWaitlist('waitlist:next', memberTwo, 1)],
      });
      const before = structuredClone(input);
      const result =
        path === 'manual'
          ? promoteWaitlist(input, frontDesk, classId, 'station:one', now)
          : cancelBooking(
              input,
              { kind: 'member', memberId: memberOne },
              booking.bookingId,
              now,
            );
      expect(result).toMatchObject({
        success: false,
        error: { category: 'ValidationError', fields: [{ field: 'scenario' }] },
      });
      expect(input).toEqual(before);
    },
  );
  it('does not promote at cutoff equality but promotes strictly before the cutoff', () => {
    const booking = makeBooking('booking:departing', memberOne, 'station:one');
    const input = makeState({
      bookings: [booking],
      waitlistEntries: [makeWaitlist('waitlist:next', memberTwo, 1)],
    });
    const cutoff = '2026-10-02T16:30:00Z' as UtcInstant;
    const equality = value(
      cancelBooking(
        input,
        { kind: 'member', memberId: memberOne },
        booking.bookingId,
        cutoff,
      ),
    );
    expect(equality.bookings).toHaveLength(1);
    expect(equality.waitlistEntries).toBeUndefined();

    const before = value(
      cancelBooking(
        input,
        { kind: 'member', memberId: memberOne },
        booking.bookingId,
        '2026-10-02T16:29:59Z',
      ),
    );
    expect(before.bookings).toHaveLength(2);
    expect(before.waitlistEntries?.[0]?.status).toBe('promoted');

    const bookableAfterCutoff = value(
      bookStation(
        { ...input, ...equality },
        { kind: 'member', memberId: memberThree },
        memberThree,
        classId,
        'station:one',
        'booking:ordinary-after-cutoff',
        cutoff,
      ),
    );
    expect(bookableAfterCutoff.bookings).toHaveLength(2);
    expect(bookableAfterCutoff.waitlistEntries).toBeUndefined();
  });

  it('does not promote a waitlisted member when a cancellation frees an out-of-service station', () => {
    const booking = makeBooking(
      'booking:offline',
      memberOne,
      'station:offline',
    );
    const input = makeState({
      bookings: [booking],
      waitlistEntries: [makeWaitlist('waitlist:next', memberTwo, 1)],
    });

    const result = value(
      cancelBooking(
        input,
        { kind: 'member', memberId: memberOne },
        booking.bookingId,
        now,
      ),
    );

    expect(result.bookings).toHaveLength(1);
    expect(result.waitlistEntries).toBeUndefined();
  });

  it('marks cancellations strictly after the late-cancel cutoff without conflating them with no-shows', () => {
    const booking = makeBooking('booking:late', memberOne, 'station:one');
    const input = makeState({
      bookings: [booking],
      attendance: [makeAttendance(booking)],
    });
    const atCutoff = value(
      cancelBooking(
        input,
        { kind: 'member', memberId: memberOne },
        booking.bookingId,
        '2026-10-02T16:30:00Z',
      ),
    );
    const afterCutoff = value(
      cancelBooking(
        input,
        { kind: 'member', memberId: memberOne },
        booking.bookingId,
        '2026-10-02T16:30:01Z',
      ),
    );
    expect(atCutoff.attendance?.[0]?.currentOutcome).toBe('cancelled');
    expect(afterCutoff.attendance?.[0]?.currentOutcome).toBe('lateCancel');
    expect(afterCutoff.bookings?.[0]?.status).toBe('cancelled');
  });

  it.each([
    { time: '09:45', cancellationAt: '2026-10-02T16:30:01Z' },
    { time: '10:15', cancellationAt: '2026-10-02T17:00:01Z' },
  ] as const)(
    'waives late cancellation after a published start-time edit to $time',
    ({ time, cancellationAt }) => {
      const input = booked(makeState());
      const original = structuredClone(input);
      const edited = value(
        editScheduledClass(
          input.classes,
          classId,
          {
            schedule: {
              date: '2026-10-02',
              time,
              timezone: 'America/Los_Angeles',
            },
          },
          input.classTypes,
        ),
      );
      const editedState = { ...input, classes: [edited.scheduledClass] };
      const beforeCancellation = structuredClone(editedState);
      const result = value(
        cancelBooking(
          editedState,
          input.activeActor,
          'booking:existing',
          cancellationAt,
        ),
      );

      expect(edited.scheduledClass.lateCancelWaived).toBe(true);
      expect(result.bookings?.[0]).toMatchObject({
        status: 'cancelled',
        cancellationReason: 'member',
        cancelledAt: cancellationAt,
      });
      expect(result.attendance?.[0]).toMatchObject({
        currentOutcome: 'cancelled',
        source: {
          kind: 'memberCancellation',
          recordedAt: cancellationAt,
        },
      });
      expect(input).toEqual(original);
      expect(editedState).toEqual(beforeCancellation);
    },
  );

  it.each([
    {
      change: 'date-only',
      updates: {
        schedule: {
          date: '2026-10-03',
          time: '10:00',
          timezone: 'America/Los_Angeles',
        },
      },
      cancellationAt: '2026-10-03T16:30:01Z',
    },
    {
      change: 'coach-only',
      updates: { coachId: 'staff:coach' },
      cancellationAt: '2026-10-02T16:30:01Z',
    },
  ] as const)(
    'retains late cancellation after a published $change edit',
    ({ updates, cancellationAt }) => {
      const input = booked(makeState());
      const edited = value(
        editScheduledClass(input.classes, classId, updates, input.classTypes),
      );
      const editedState = { ...input, classes: [edited.scheduledClass] };
      const original = structuredClone(editedState);
      const result = value(
        cancelBooking(
          editedState,
          input.activeActor,
          'booking:existing',
          cancellationAt,
        ),
      );

      expect(edited.scheduledClass.lateCancelWaived).toBe(false);
      expect(result.bookings?.[0]?.status).toBe('cancelled');
      expect(result.attendance?.[0]?.currentOutcome).toBe('lateCancel');
      expect(editedState).toEqual(original);
    },
  );

  it('preserves cutoff validation and the cancellation window when late cancellation is waived', () => {
    const input = booked(
      makeState({ classes: [makeClass({ lateCancelWaived: true })] }),
    );
    const invalidCutoff = {
      ...input,
      settings: { ...input.settings, lateCancelCutoffMinutes: -1 },
    };
    const original = structuredClone(invalidCutoff);
    expect(
      cancelBooking(
        invalidCutoff,
        input.activeActor,
        'booking:existing',
        '2026-10-02T16:30:01Z',
      ),
    ).toMatchObject({
      success: false,
      error: {
        category: 'ValidationError',
        fields: [{ field: 'lateCancelCutoffMinutes' }],
      },
    });
    expect(invalidCutoff).toEqual(original);
    expect(
      cancelBooking(
        input,
        input.activeActor,
        'booking:existing',
        '2026-10-02T17:00:01Z',
      ),
    ).toMatchObject({
      success: false,
      error: { category: 'IneligibleDemoAction', reason: 'classStarted' },
    });
  });

  it('allows member cancellation through the exact class start and rejects it afterward', () => {
    const booking = makeBooking('booking:departing', memberOne, 'station:one');
    const input = makeState({
      bookings: [booking],
      attendance: [makeAttendance(booking)],
    });
    expect(
      cancelBooking(
        input,
        { kind: 'member', memberId: memberOne },
        booking.bookingId,
        classStart,
      ).success,
    ).toBe(true);
    expect(
      cancelBooking(
        input,
        { kind: 'member', memberId: memberOne },
        booking.bookingId,
        '2026-10-02T17:00:01Z',
      ),
    ).toMatchObject({
      success: false,
      error: { category: 'IneligibleDemoAction', reason: 'classStarted' },
    });
  });
});

describe('staff removal and reseating rules', () => {
  it('records staff removal distinctly and promotes from a freed in-service station', () => {
    const booking = makeBooking('booking:removed', memberOne, 'station:one');
    const input = makeState({
      bookings: [booking],
      waitlistEntries: [makeWaitlist('waitlist:next', memberTwo, 1)],
    });
    const result = value(
      removeBooking(
        input,
        frontDesk,
        booking.bookingId,
        'Roster correction',
        now,
      ),
    );

    expect(result.bookings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookingId: booking.bookingId,
          status: 'staffRemoved',
          removalReason: 'Roster correction',
        }),
        expect.objectContaining({
          memberId: memberTwo,
          stationId: 'station:one',
          status: 'booked',
        }),
      ]),
    );
    expect(result.attendance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookingId: booking.bookingId,
          currentOutcome: 'staffRemoved',
        }),
      ]),
    );
  });

  it('moves a member to a free station before class start without altering attendance or notifying', () => {
    const booking = makeBooking('booking:member', memberOne, 'station:one');
    const attendance: AttendanceRecord = {
      ...makeAttendance(booking),
      currentOutcome: 'attended',
      checkIn: {
        status: 'checkedIn',
        checkedInAt: '2026-10-02T15:50:00Z',
        checkedInBy: { kind: 'member', memberId: memberOne },
      },
      corrections: [
        {
          correctionId: 'correction:existing',
          staffId: 'staff:admin',
          previousOutcome: 'booked',
          newOutcome: 'attended',
          recordedAt: '2026-10-02T15:55:00Z',
          reason: 'Prior correction',
        },
      ],
    };
    const input = makeState({ bookings: [booking], attendance: [attendance] });
    const result = value(
      moveOwnBooking(
        input,
        { kind: 'member', memberId: memberOne },
        booking.bookingId,
        'station:two',
        now,
      ),
    );

    expect(result.bookings?.[0]?.stationId).toBe('station:two');
    expect(result.attendance).toBeUndefined();
    expect(input.attendance[0]).toEqual(attendance);
    expect(result.notifications).toBeUndefined();
    expect(input.bookings[0]?.stationId).toBe('station:one');
  });

  it('rejects member moves at or after class start', () => {
    const input = booked(makeState());
    expect(
      moveOwnBooking(
        input,
        { kind: 'member', memberId: memberOne },
        'booking:existing',
        'station:two',
        classStart,
      ),
    ).toMatchObject({
      success: false,
      error: { category: 'IneligibleDemoAction', reason: 'classStarted' },
    });
  });

  it('staff moves a booking to a free station and promotes from the freed in-service station before cutoff', () => {
    const booking = makeBooking('booking:staff-move', memberOne, 'station:one');
    const input = makeState({
      bookings: [booking],
      waitlistEntries: [makeWaitlist('waitlist:next', memberTwo, 1)],
    });
    const result = value(
      moveBooking(input, admin, booking.bookingId, 'station:two', now),
    );

    expect(result.bookings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookingId: booking.bookingId,
          stationId: 'station:two',
        }),
        expect.objectContaining({
          memberId: memberTwo,
          stationId: 'station:one',
          status: 'booked',
        }),
      ]),
    );
    expect(result.notifications?.map((item) => item.event.type)).toEqual([
      'waitlistPromoted',
    ]);
  });

  it('does not promote when a booking on an out-of-service station is reseated', () => {
    const booking = makeBooking('booking:outage', memberOne, 'station:offline');
    const input = makeState({
      bookings: [booking],
      waitlistEntries: [makeWaitlist('waitlist:next', memberTwo, 1)],
    });
    const result = value(
      moveBooking(input, admin, booking.bookingId, 'station:two', now),
    );

    expect(result.bookings).toHaveLength(1);
    expect(result.waitlistEntries).toBeUndefined();
  });

  it('requires explicit confirmation for an occupied destination and atomically swaps without promotion or notifications', () => {
    const first = makeBooking('booking:first', memberOne, 'station:one');
    const second = makeBooking('booking:second', memberTwo, 'station:two');
    const firstAttendance: AttendanceRecord = {
      ...makeAttendance(first),
      currentOutcome: 'attended',
      checkIn: {
        status: 'checkedIn',
        checkedInAt: '2026-10-02T15:50:00Z',
        checkedInBy: { kind: 'member', memberId: memberOne },
      },
      corrections: [
        {
          correctionId: 'correction:first',
          staffId: 'staff:admin',
          previousOutcome: 'booked',
          newOutcome: 'attended',
          recordedAt: '2026-10-02T15:55:00Z',
          reason: 'Preserve the first correction.',
        },
      ],
    };
    const secondAttendance: AttendanceRecord = {
      ...makeAttendance(second),
      currentOutcome: 'attended',
      corrections: [
        {
          correctionId: 'correction:second',
          staffId: 'staff:admin',
          previousOutcome: 'booked',
          newOutcome: 'attended',
          recordedAt: '2026-10-02T15:56:00Z',
          reason: 'Preserve the second correction.',
        },
      ],
    };
    const input = makeState({
      bookings: [first, second],
      attendance: [firstAttendance, secondAttendance],
      waitlistEntries: [makeWaitlist('waitlist:next', memberThree, 1)],
    });
    expect(
      moveBooking(input, admin, first.bookingId, second.stationId, now),
    ).toMatchObject({
      success: false,
      error: {
        category: 'IneligibleDemoAction',
        reason: 'confirmationRequired',
      },
    });

    const swapped = value(
      swapBookings(input, admin, first.bookingId, second.bookingId, now, true),
    );
    expect(swapped.bookings).toEqual([
      expect.objectContaining({
        bookingId: first.bookingId,
        stationId: 'station:two',
      }),
      expect.objectContaining({
        bookingId: second.bookingId,
        stationId: 'station:one',
      }),
    ]);
    expect(swapped.attendance).toBeUndefined();
    expect(input.attendance).toEqual([firstAttendance, secondAttendance]);
    expect(swapped.waitlistEntries).toBeUndefined();
    expect(swapped.notifications).toBeUndefined();
  });

  it('rejects a swap without confirmation, across classes, or into an out-of-service station without changing either booking', () => {
    const first = makeBooking('booking:first', memberOne, 'station:one');
    const second = makeBooking('booking:second', memberTwo, 'station:two');
    const input = makeState({ bookings: [first, second] });
    const snapshot = JSON.stringify(input);

    expect(
      swapBookings(input, admin, first.bookingId, second.bookingId, now, false),
    ).toMatchObject({
      success: false,
      error: {
        category: 'IneligibleDemoAction',
        reason: 'confirmationRequired',
      },
    });
    expect(
      swapBookings(
        makeState({
          bookings: [
            first,
            makeBooking(
              'booking:other-class',
              memberTwo,
              'station:two',
              'class:later',
            ),
          ],
          classes: [makeClass(), makeClass({ classId: 'class:later' })],
        }),
        admin,
        first.bookingId,
        'booking:other-class',
        now,
        true,
      ).success,
    ).toBe(false);
    expect(
      moveBooking(input, admin, first.bookingId, 'station:offline', now)
        .success,
    ).toBe(false);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('rejects stale layout changes and labels direct exact-end published reseating as a defensive snapshot', () => {
    const input = booked(makeState({ layout: { availability: 'stale' } }));
    expect(
      moveBooking(input, admin, 'booking:existing', 'station:two', now),
    ).toMatchObject({
      success: false,
      error: {
        category: 'DemoUnavailableState',
        resource: 'layout',
        stale: true,
      },
    });
    const current = booked(makeState());
    expect(
      moveBooking(current, admin, 'booking:existing', 'station:two', classEnd)
        .success,
    ).toBe(true);
    expect(
      moveBooking(
        current,
        admin,
        'booking:existing',
        'station:two',
        '2026-10-02T18:00:01Z',
      ).success,
    ).toBe(false);
  });

  it('permits only staff reseating at exact end after clock-driven class completion', () => {
    const completed = makeClass({
      status: 'completed',
      completedAt: classEnd,
    });
    const first = makeBooking('booking:first', memberOne, 'station:one');
    const second = makeBooking('booking:second', memberTwo, 'station:two');
    const input = makeState({
      classes: [completed],
      bookings: [first, second],
    });

    expect(
      moveBooking(input, admin, first.bookingId, 'station:three', classEnd)
        .success,
    ).toBe(true);
    expect(
      swapBookings(
        input,
        admin,
        first.bookingId,
        second.bookingId,
        classEnd,
        true,
      ).success,
    ).toBe(true);
    expect(
      moveBooking(
        input,
        admin,
        first.bookingId,
        'station:three',
        '2026-10-02T18:00:01Z',
      ),
    ).toMatchObject({
      success: false,
      error: { category: 'IneligibleDemoAction', reason: 'classCompleted' },
    });
    expect(
      removeBooking(input, admin, first.bookingId, 'Too late', classEnd)
        .success,
    ).toBe(false);
    const unprocessedCompletion = booked(
      makeState({ classes: [makeClass({ status: 'completed' })] }),
    );
    expect(
      moveBooking(
        unprocessedCompletion,
        admin,
        'booking:existing',
        'station:two',
        classEnd,
      ).success,
    ).toBe(false);
  });

  it('enforces coach class scope and rejects member attempts to remove another member', () => {
    const input = booked(makeState());
    expect(
      removeBooking(input, coach, 'booking:existing', 'Reason', now).success,
    ).toBe(true);
    const otherClassBooking = makeBooking(
      'booking:other',
      memberTwo,
      'station:two',
      'class:other',
    );
    const otherClass = makeClass({ classId: 'class:other' });
    expect(
      moveBooking(
        makeState({
          classes: [makeClass(), otherClass],
          bookings: [otherClassBooking],
        }),
        coach,
        otherClassBooking.bookingId,
        'station:three',
        now,
      ),
    ).toMatchObject({
      success: false,
      error: {
        category: 'IneligibleDemoAction',
        reason: 'classScopeDenied',
      },
    });
    expect(
      removeBooking(
        input,
        { kind: 'member', memberId: memberOne },
        'booking:existing',
        'Reason',
        now,
      ).success,
    ).toBe(false);
  });

  it('cancels class bookings and waitlist records for history without promoting anyone', () => {
    const booking = makeBooking(
      'booking:class-cancelled',
      memberOne,
      'station:one',
    );
    const waiting = makeWaitlist('waitlist:cancelled', memberTwo, 1);
    const input = makeState({
      bookings: [booking],
      attendance: [makeAttendance(booking)],
      waitlistEntries: [waiting],
      classes: [
        makeClass({
          status: 'cancelled',
          cancelledAt: now,
          cancellationReason: 'Illustrative class cancellation',
        }),
      ],
    });
    const result = value(cancelClassReservations(input, classId, now));

    expect(result.bookings).toEqual([
      expect.objectContaining({
        bookingId: booking.bookingId,
        status: 'cancelled',
        cancellationReason: 'classCancelled',
      }),
    ]);
    expect(result.waitlistEntries).toEqual([
      expect.objectContaining({
        entryId: waiting.entryId,
        status: 'cancelled',
        reason: 'classCancelled',
      }),
    ]);
    expect(result.attendance).toEqual([
      { ...makeAttendance(booking), currentOutcome: 'cancelled' },
    ]);
    expect(input.attendance).toEqual([makeAttendance(booking)]);
    expect(result.notifications).toBeUndefined();
  });

  it('resolves only untouched booking-owned attendance and preserves check-in, corrections, manual records and unrelated history', () => {
    const bookings = Array.from({ length: 7 }, (_, index) =>
      makeBooking(`booking:cancel-${index}`, memberOne, 'station:one'),
    );
    const correction: AttendanceRecord['corrections'][number] = {
      correctionId: 'correction:preserved',
      staffId: 'staff:admin',
      previousOutcome: 'attended',
      newOutcome: 'booked',
      recordedAt: now,
      reason: 'Fictional correction',
    };
    const attendance: readonly AttendanceRecord[] = [
      makeAttendance(bookings[0]!),
      {
        ...makeAttendance(bookings[1]!),
        checkIn: { status: 'checkedIn', checkedInAt: now, checkedInBy: admin },
      },
      { ...makeAttendance(bookings[2]!), corrections: [correction] },
      {
        ...makeAttendance(bookings[3]!),
        source: {
          kind: 'manualOutage',
          staffId: 'staff:admin',
          recordedAt: now,
        },
      },
      { ...makeAttendance(bookings[4]!), currentOutcome: 'attended' },
      {
        ...makeAttendance(bookings[5]!),
        source: { kind: 'staff', staffId: 'staff:admin', recordedAt: now },
      },
      makeAttendance(bookings[6]!),
      {
        ...makeAttendance(
          makeBooking(
            'booking:other-class',
            memberTwo,
            'station:two',
            'class:other',
          ),
        ),
      },
      {
        attendanceId: 'attendance:manual-unlinked',
        classId,
        memberId: memberTwo,
        currentOutcome: 'booked',
        checkIn: { status: 'notCheckedIn' },
        source: {
          kind: 'manualOutage',
          staffId: 'staff:admin',
          recordedAt: now,
        },
        corrections: [],
      },
    ];
    const input = makeState({
      bookings: bookings.map((booking, index): Booking =>
        index === 6
          ? {
              ...booking,
              status: 'cancelled',
              cancelledAt: now,
              cancellationReason: 'member',
            }
          : booking,
      ),
      attendance,
      classes: [
        makeClass({
          status: 'cancelled',
          cancelledAt: now,
          cancellationReason: 'Fictional room closure',
        }),
      ],
    });
    const before = structuredClone(input);
    const changes = value(cancelClassReservations(input, classId, now));
    expect(changes.attendance).toEqual([
      { ...attendance[0], currentOutcome: 'cancelled' },
      ...attendance.slice(1),
    ]);
    expect(input).toEqual(before);
    const repeated = value(
      cancelClassReservations({ ...input, ...changes }, classId, now),
    );
    expect(repeated).toEqual(changes);
  });
});
