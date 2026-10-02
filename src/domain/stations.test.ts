import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  Booking,
  BookingBase,
  DemoActor,
  DemoState,
  DomainResult,
  ScheduledClass,
  SelectClassLayout,
  Station,
} from './types';
import {
  createStation,
  getClassCapacity,
  placeStation,
  selectClassLayout,
  setLayoutOrientation,
  updateStation,
  validateClassCapacity,
} from './stations';

const admin: DemoActor = { kind: 'staff', staffId: 'staff:admin' };
const member: DemoActor = { kind: 'member', memberId: 'member:one' };

function scheduledClass(
  overrides: Partial<ScheduledClass> = {},
): ScheduledClass {
  return {
    classId: 'class:current',
    schedule: {
      date: '2026-10-02',
      time: '09:00',
      timezone: 'America/Los_Angeles',
    },
    startsAt: '2026-10-02T16:00:00Z',
    endsAt: '2026-10-02T17:00:00Z',
    status: 'published',
    releasedAt: '2026-10-01T16:00:00Z',
    classTypeSnapshot: {
      classTypeId: 'classType:one',
      name: 'Fictional class',
      durationMinutes: 60,
      description: 'Illustrative',
      difficulty: 'All levels',
    },
    lateCancelWaived: false,
    reviewFlags: [],
    ...overrides,
  };
}

type BookingOverrides = Partial<BookingBase> &
  (
    | { readonly status?: 'booked' }
    | Omit<Extract<Booking, { status: 'cancelled' }>, keyof BookingBase>
    | Omit<Extract<Booking, { status: 'staffRemoved' }>, keyof BookingBase>
  );

function booking(overrides: BookingOverrides = {}): Booking {
  return {
    bookingId: 'booking:one',
    memberId: 'member:one',
    classId: 'class:current',
    stationId: 'station:one',
    bookedAt: '2026-10-01T16:00:00Z',
    attendanceRecordId: 'attendance:one',
    status: 'booked',
    reviewFlags: ['memberInactive'],
    ...overrides,
  };
}

function fixture(overrides: Partial<DemoState> = {}): DemoState {
  return {
    revision: 7,
    staffAccounts: [
      {
        staffId: 'staff:admin',
        identitySubject: 'identity:admin',
        active: true,
        assignedRoles: ['admin'],
        assignedClassIds: [],
      },
      {
        staffId: 'staff:desk',
        identitySubject: 'identity:desk',
        active: true,
        assignedRoles: ['frontDesk'],
        assignedClassIds: [],
      },
      {
        staffId: 'staff:coach',
        identitySubject: 'identity:coach',
        active: true,
        assignedRoles: ['coach'],
        assignedClassIds: ['class:current'],
      },
    ],
    members: [
      {
        memberId: 'member:one',
        displayName: 'Fictional Member',
        verifiedEmail: 'fictional@example.invalid',
        identitySubject: 'identity:member',
        status: 'active',
        invitationId: 'invitation:one',
        adultAttestationAt: '2026-10-01T16:00:00Z',
        adultEligibility: 'attested',
        createdAt: '2026-10-01T16:00:00Z',
      },
    ],
    invitations: [],
    waivers: [],
    currentWaiverVersionId: null,
    waiverSignatures: [],
    stations: [
      {
        stationId: 'station:one',
        label: 'Rower 1',
        pm5Serial: 'fictional-one',
        inService: true,
        row: 0,
        column: 0,
      },
      {
        stationId: 'station:two',
        label: 'Rower 2',
        pm5Serial: null,
        inService: true,
        row: 0,
        column: 2,
      },
    ],
    layout: { availability: 'current', orientationLabel: 'Door' },
    classTypes: [],
    weeklyTemplates: [],
    classes: [scheduledClass()],
    bookings: [booking()],
    waitlistEntries: [],
    attendance: [
      {
        attendanceId: 'attendance:one',
        classId: 'class:current',
        memberId: 'member:one',
        bookingId: 'booking:one',
        currentOutcome: 'booked',
        checkIn: { status: 'notCheckedIn' },
        source: { kind: 'booking', bookingId: 'booking:one' },
        corrections: [],
      },
    ],
    notifications: [],
    settings: {
      illustrative: true,
      timezone: 'America/Los_Angeles',
      memberCap: 20,
      invitationExpiryMinutes: 1440,
      scheduleRelease: { mode: 'immediate' },
      targetGapMinutes: 15,
      waitlistCutoffMinutes: 30,
      lateCancelCutoffMinutes: 60,
      checkInLeadMinutes: 15,
      checkInGraceMinutes: 10,
    },
    activeActor: admin,
    scenarioId: 'scenario:baseline',
    clock: { now: '2026-10-02T16:30:00Z', presetId: null },
    simulation: { identity: 'verified', delivery: 'success' },
    ...overrides,
  };
}

function value<T>(result: DomainResult<T>): T {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.error.message);
  return result.value;
}

function freeze<T>(input: T): T {
  if (input && typeof input === 'object') {
    Object.values(input).forEach(freeze);
    Object.freeze(input);
  }
  return input;
}

describe('station boundary regressions', () => {
  it('implements the stable class-layout selector contract', () => {
    expectTypeOf(selectClassLayout).toMatchTypeOf<SelectClassLayout>();
  });

  it('honors rolling release at the exact threshold and manual release timestamps', () => {
    const base = fixture();
    const state = fixture({
      classes: [scheduledClass({ releasedAt: undefined })],
      settings: {
        ...base.settings,
        scheduleRelease: { mode: 'rolling', advanceMinutes: 60 },
      },
    });
    expect(
      selectClassLayout(state, 'class:current', member, '2026-10-02T14:59:59Z'),
    ).toMatchObject({ status: 'unavailable' });
    expect(
      selectClassLayout(state, 'class:current', member, '2026-10-02T15:00:00Z'),
    ).toMatchObject({ status: 'available' });
    const manual = fixture({
      settings: { ...base.settings, scheduleRelease: { mode: 'manual' } },
      classes: [scheduledClass({ releasedAt: '2026-10-02T15:00:00Z' })],
    });
    expect(
      selectClassLayout(
        manual,
        'class:current',
        member,
        '2026-10-02T14:59:59Z',
      ),
    ).toMatchObject({ status: 'unavailable' });
    expect(
      selectClassLayout(
        manual,
        'class:current',
        member,
        '2026-10-02T15:00:00Z',
      ),
    ).toMatchObject({ status: 'available' });
    const immediate = fixture({
      classes: [scheduledClass({ releasedAt: undefined })],
    });
    expect(selectClassLayout(immediate, 'class:current', member)).toMatchObject(
      { status: 'available' },
    );
  });

  it('does not change unrelated reservations, snapshots, or layout during service updates', () => {
    const base = fixture();
    const state = freeze(
      fixture({
        bookings: [
          booking(),
          booking({ bookingId: 'booking:two', stationId: 'station:two' }),
        ],
      }),
    );
    const next = value(
      updateStation(state, 'station:one', { inService: false }),
    );
    expect(next.bookings[1]).toEqual(state.bookings[1]);
    expect(next.classes[0].classTypeSnapshot).toBe(
      state.classes[0].classTypeSnapshot,
    );
    expect(next.layout).toBe(state.layout);
    expect(getClassCapacity(next)).toBe(1);
    expect(
      value(updateStation(base, 'station:one', { pm5Serial: null })).stations[0]
        .pm5Serial,
    ).toBeNull();
  });

  it('rejects inconsistent stored grid positions instead of rendering a misleading overlay', () => {
    const base = fixture();
    for (const stations of [
      [base.stations[0], { ...base.stations[1], row: 0, column: 0 }],
      [
        base.stations[0],
        { ...base.stations[1], stationId: base.stations[0].stationId },
      ],
      [base.stations[0], { ...base.stations[1], row: -1 }],
    ]) {
      expect(selectClassLayout(freeze(fixture({ stations })))).toMatchObject({
        status: 'unavailable',
        canReseat: false,
        error: { stale: true },
      });
    }
  });

  it('rejects mismatched attendance references rather than deriving a false station state', () => {
    const base = fixture();
    for (const attendance of [
      [{ ...base.attendance[0], bookingId: 'booking:other' as const }],
      [{ ...base.attendance[0], memberId: 'member:other' as const }],
      [{ ...base.attendance[0], classId: 'class:other' as const }],
    ]) {
      expect(selectClassLayout(freeze(fixture({ attendance })))).toMatchObject({
        status: 'unavailable',
        error: { stale: true },
      });
    }
  });
});

describe('capacity and station service transitions', () => {
  it('counts only in-service stations and rejects zero capacity for publication and booking', () => {
    expect(getClassCapacity(fixture())).toBe(2);
    expect(value(validateClassCapacity(fixture(), 'class:current'))).toBe(2);
    const state = fixture({ stations: [] });
    expect(getClassCapacity(state)).toBe(0);
    expect(validateClassCapacity(state, 'class:current')).toMatchObject({
      success: false,
      error: { category: 'IneligibleDemoAction', reason: 'zeroCapacity' },
    });
  });

  describe('position-only layout transitions', () => {
    it('swaps occupied cells including out-of-service stations without touching reservation data', () => {
      const state = freeze(
        fixture({
          stations: fixture().stations.map((station, index) => ({
            ...station,
            inService: index === 0,
          })),
        }),
      );
      const next = value(
        placeStation(state, 'station:one', { row: 0, column: 2 }),
      );
      expect(next.stations).toEqual([
        { ...state.stations[0], row: 0, column: 2 },
        { ...state.stations[1], row: 0, column: 0 },
      ]);
      expect(getClassCapacity(next)).toBe(getClassCapacity(state));
      for (const key of [
        'bookings',
        'attendance',
        'classes',
        'waitlistEntries',
        'notifications',
      ] as const) {
        expect(next[key]).toBe(state[key]);
      }
      expect(state.stations[0].column).toBe(0);
    });

    it('moves to an empty cell, retains gaps, and allows a same-cell no-op', () => {
      const state = freeze(fixture());
      const next = value(
        placeStation(state, 'station:one', { row: 4, column: 7 }),
      );
      expect(next.stations[0]).toEqual({
        ...state.stations[0],
        row: 4,
        column: 7,
      });
      expect(next.stations[1]).toBe(state.stations[1]);
      expect(
        value(placeStation(state, 'station:one', { row: 0, column: 0 })),
      ).toBe(state);
    });

    it('keeps all cells distinct through repeated moves and swaps', () => {
      let state = freeze(fixture());
      for (const position of [
        { row: 0, column: 2 },
        { row: 2, column: 5 },
        { row: 0, column: 0 },
      ]) {
        state = value(placeStation(state, 'station:one', position));
        expect(
          new Set(
            state.stations.map((station) => `${station.row}:${station.column}`),
          ).size,
        ).toBe(state.stations.length);
      }
    });

    it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
      'rejects invalid row or column %s',
      (coordinate) => {
        const state = freeze(fixture());
        expect(
          placeStation(state, 'station:one', { row: coordinate, column: 0 }),
        ).toMatchObject({
          success: false,
          error: { category: 'ValidationError' },
        });
        expect(
          placeStation(state, 'station:one', { row: 0, column: coordinate }),
        ).toMatchObject({ success: false });
      },
    );

    it('reports missing stations and restricts layout and orientation edits to active admins', () => {
      const state = freeze(fixture());
      expect(
        placeStation(state, 'station:missing', { row: 1, column: 1 }),
      ).toMatchObject({ success: false, error: { resource: 'station' } });
      for (const actor of [
        member,
        { kind: 'staff', staffId: 'staff:desk' } as const,
        { kind: 'staff', staffId: 'staff:coach' } as const,
      ]) {
        expect(
          placeStation(state, 'station:one', { row: 1, column: 1 }, actor),
        ).toMatchObject({ success: false });
        expect(setLayoutOrientation(state, 'Window', actor)).toMatchObject({
          success: false,
        });
      }
      const next = value(setLayoutOrientation(state, 'Window'));
      expect(next.layout).toEqual({
        availability: 'current',
        orientationLabel: 'Window',
      });
      expect(next.stations).toBe(state.stations);
      expect(next.bookings).toBe(state.bookings);
      expect(
        value(setLayoutOrientation(next, '')).layout.orientationLabel,
      ).toBeUndefined();
    });
  });

  describe('class layout overlays', () => {
    it('defaults to the in-progress class and then to the earliest future non-cancelled class', () => {
      const current = scheduledClass();
      const future = scheduledClass({
        classId: 'class:future',
        startsAt: '2026-10-02T18:00:00Z',
        endsAt: '2026-10-02T19:00:00Z',
      });
      const state = freeze(
        fixture({
          classes: [
            future,
            scheduledClass({ classId: 'class:cancelled', status: 'cancelled' }),
            scheduledClass({ classId: 'class:completed', status: 'completed' }),
            current,
          ],
        }),
      );
      expect(selectClassLayout(state)).toMatchObject({
        status: 'available',
        classId: current.classId,
      });
      expect(
        selectClassLayout(state, undefined, admin, current.endsAt),
      ).toMatchObject({ status: 'available', classId: future.classId });
      expect(
        selectClassLayout(state, undefined, admin, current.startsAt),
      ).toMatchObject({ classId: current.classId });
    });

    it('exposes all four textual station states using canonical attendance', () => {
      const base = fixture();
      const state = freeze(
        fixture({
          stations: [
            ...base.stations,
            {
              ...base.stations[0],
              stationId: 'station:three',
              row: 1,
              inService: false,
            },
            { ...base.stations[0], stationId: 'station:four', row: 2 },
          ],
          bookings: [
            booking(),
            booking({
              bookingId: 'booking:two',
              stationId: 'station:two',
              attendanceRecordId: 'attendance:two',
            }),
            booking({
              bookingId: 'booking:three',
              stationId: 'station:three',
              attendanceRecordId: 'attendance:three',
            }),
            booking({
              bookingId: 'booking:cancelled',
              stationId: 'station:four',
              status: 'cancelled',
              cancelledAt: '2026-10-02T15:00:00Z',
              cancellationReason: 'member',
            }),
          ],
          attendance: [
            ...base.attendance,
            {
              ...base.attendance[0],
              attendanceId: 'attendance:two',
              bookingId: 'booking:two',
              checkIn: {
                status: 'checkedIn',
                checkedInAt: base.clock.now,
                checkedInBy: admin,
              },
            },
            {
              ...base.attendance[0],
              attendanceId: 'attendance:three',
              bookingId: 'booking:three',
            },
          ],
        }),
      );
      const layout = selectClassLayout(state);
      expect(layout.status).toBe('available');
      if (layout.status !== 'available') throw new Error(layout.error.message);
      expect(layout.stations.map((station) => station.state)).toEqual([
        'bookedNotCheckedIn',
        'bookedCheckedIn',
        'outOfService',
        'available',
      ]);
      expect(layout.stations.map((station) => station.stateLabel)).toEqual([
        'Booked, not checked in',
        'Booked, checked in',
        'Out of service',
        'Available',
      ]);
      expect(layout).toMatchObject({
        orientationLabel: 'Door',
        canReseat: true,
      });
    });

    it('filters reservations by class and never exposes member names or IDs in member layouts', () => {
      const state = freeze(
        fixture({
          bookings: [
            booking(),
            booking({ classId: 'class:another', stationId: 'station:two' }),
          ],
        }),
      );
      const layout = selectClassLayout(state, 'class:current', member);
      expect(layout).toMatchObject({
        status: 'available',
        audience: 'member',
        canReseat: false,
      });
      if (layout.status !== 'available') throw new Error(layout.error.message);
      expect(layout.stations[1].state).toBe('available');
      for (const station of layout.stations) {
        expect(station).not.toHaveProperty('assignedMember');
        expect(station).not.toHaveProperty('bookingId');
        expect(station).not.toHaveProperty('reviewFlags');
      }
      expect(JSON.stringify(layout)).not.toContain('Fictional Member');
      expect(JSON.stringify(layout)).not.toContain('member:one');
      expect(JSON.stringify(layout)).not.toContain('example.invalid');
    });

    it('shows names only to admins, front desk, and coaches scoped to that class', () => {
      const state = freeze(fixture());
      for (const actor of [
        admin,
        { kind: 'staff', staffId: 'staff:desk' } as const,
        { kind: 'staff', staffId: 'staff:coach' } as const,
      ]) {
        expect(selectClassLayout(state, 'class:current', actor)).toMatchObject({
          status: 'available',
          audience: 'staff',
          canReseat: true,
          stations: [
            {
              assignedMember: {
                memberId: 'member:one',
                displayName: 'Fictional Member',
              },
              bookingId: 'booking:one',
              reviewFlags: ['memberInactive'],
            },
            {},
          ],
        });
      }
      const unassigned = fixture({
        classes: [scheduledClass({ classId: 'class:other' })],
        bookings: [booking({ classId: 'class:other' })],
        attendance: fixture().attendance.map((record) => ({
          ...record,
          classId: 'class:other',
        })),
      });
      const layout = selectClassLayout(unassigned, 'class:other', {
        kind: 'staff',
        staffId: 'staff:coach',
      });
      expect(layout).toMatchObject({ status: 'available', canReseat: false });
      if (layout.status !== 'available') throw new Error(layout.error.message);
      expect(layout.stations[0]).not.toHaveProperty('assignedMember');
      expect(layout.stations[0]).not.toHaveProperty('bookingId');
      expect(JSON.stringify(layout)).not.toContain('member:one');
    });

    it('uses the union of staff roles rather than restricting multi-role coaches', () => {
      const state = fixture({
        staffAccounts: fixture().staffAccounts.map((staff) =>
          staff.staffId === 'staff:coach'
            ? {
                ...staff,
                assignedRoles: ['coach', 'frontDesk'],
                assignedClassIds: [],
              }
            : staff,
        ),
      });
      expect(
        selectClassLayout(state, 'class:current', {
          kind: 'staff',
          staffId: 'staff:coach',
        }),
      ).toMatchObject({
        status: 'available',
        canReseat: true,
        stations: [{ assignedMember: { displayName: 'Fictional Member' } }, {}],
      });
    });

    it.each(['stale', 'unavailable'] as const)(
      'explicitly rejects %s overlay data and disables reseating',
      (availability) => {
        const state = freeze(fixture({ layout: { availability } }));
        const layout = selectClassLayout(state);
        expect(layout).toMatchObject({
          status: 'unavailable',
          canReseat: false,
          error: {
            category: 'DemoUnavailableState',
            resource: 'layout',
            stale: availability === 'stale',
          },
        });
        expect(layout).not.toHaveProperty('stations');
        expect(JSON.stringify(layout)).not.toContain('Fictional Member');
      },
    );

    it('does not substitute a default class for missing, cancelled, completed, or ended selections', () => {
      for (const status of ['cancelled', 'completed'] as const) {
        expect(
          selectClassLayout(
            fixture({ classes: [scheduledClass({ status })] }),
            'class:current',
          ),
        ).toMatchObject({ status: 'unavailable', canReseat: false });
      }
      expect(selectClassLayout(fixture(), 'class:missing')).toMatchObject({
        status: 'unavailable',
        error: { resource: 'class' },
      });
      expect(
        selectClassLayout(
          fixture(),
          'class:current',
          admin,
          '2026-10-02T17:00:00Z',
        ),
      ).toMatchObject({ status: 'unavailable' });
      expect(selectClassLayout(fixture({ classes: [] }))).toMatchObject({
        status: 'unavailable',
      });
    });

    it('allows staff draft overlays but hides drafts and unreleased classes from members', () => {
      const state = fixture({
        classes: [
          scheduledClass({ status: 'draft' }),
          scheduledClass({
            classId: 'class:future',
            startsAt: '2026-10-02T18:00:00Z',
            endsAt: '2026-10-02T19:00:00Z',
          }),
        ],
      });
      expect(selectClassLayout(state)).toMatchObject({
        status: 'available',
        classId: 'class:current',
      });
      expect(selectClassLayout(state, undefined, member)).toMatchObject({
        status: 'available',
        classId: 'class:future',
      });
      expect(selectClassLayout(state, 'class:current', member)).toMatchObject({
        status: 'unavailable',
      });
      const unreleased = fixture({
        settings: { ...state.settings, scheduleRelease: { mode: 'manual' } },
        classes: [scheduledClass({ releasedAt: undefined })],
      });
      expect(
        selectClassLayout(unreleased, 'class:current', member),
      ).toMatchObject({ status: 'unavailable' });
    });

    it('does not disclose overlays to unknown, inactive, or invitation actors', () => {
      const state = fixture();
      const inactive = fixture({
        staffAccounts: state.staffAccounts.map((staff) => ({
          ...staff,
          active: false,
        })),
      });
      expect(selectClassLayout(inactive)).toMatchObject({
        status: 'unavailable',
        canReseat: false,
      });
      for (const actor of [
        { kind: 'staff', staffId: 'staff:missing' },
        { kind: 'member', memberId: 'member:missing' },
        { kind: 'invitation', invitationId: 'invitation:one' },
      ] satisfies DemoActor[]) {
        expect(selectClassLayout(state, 'class:current', actor)).toMatchObject({
          status: 'unavailable',
          canReseat: false,
        });
      }
    });

    it('returns unavailable instead of inventing available/check-in/name data when references are missing', () => {
      for (const state of [
        fixture({ members: [] }),
        fixture({ attendance: [] }),
        fixture({ stations: [] }),
        fixture({
          bookings: [booking(), booking({ bookingId: 'booking:duplicate' })],
        }),
      ]) {
        expect(selectClassLayout(freeze(state))).toMatchObject({
          status: 'unavailable',
          canReseat: false,
          error: { stale: true },
        });
      }
    });
  });

  it('flags active reservations on an outage without moving or cancelling anything', () => {
    const state = freeze(fixture());
    const next = value(
      updateStation(state, 'station:one', { inService: false }),
    );
    expect(next.stations[0]).toEqual({
      ...state.stations[0],
      inService: false,
    });
    expect(next.bookings[0]).toEqual({
      ...state.bookings[0],
      reviewFlags: ['memberInactive', 'stationOutOfService'],
    });
    expect(next.attendance).toBe(state.attendance);
    expect(next.waitlistEntries).toBe(state.waitlistEntries);
    expect(next.notifications).toBe(state.notifications);
    expect(next.revision).toBe(state.revision);
    expect(state.stations[0].inService).toBe(true);
    expect(state.bookings[0].reviewFlags).toEqual(['memberInactive']);
  });

  it('flags zero-capacity classes without altering lifecycle or historical bookings', () => {
    const cancelled = booking({
      bookingId: 'booking:cancelled',
      status: 'cancelled',
      cancelledAt: '2026-10-02T15:00:00Z',
      cancellationReason: 'member',
    });
    const state = fixture({
      stations: [fixture().stations[0]],
      bookings: [booking(), cancelled],
      classes: [
        scheduledClass(),
        scheduledClass({ classId: 'class:draft', status: 'draft' }),
        scheduledClass({ classId: 'class:history', status: 'completed' }),
      ],
    });
    const next = value(
      updateStation(freeze(state), 'station:one', { inService: false }),
    );
    expect(next.classes.slice(0, 2).map((item) => item.reviewFlags)).toEqual([
      ['zeroCapacity'],
      ['zeroCapacity'],
    ]);
    expect(next.classes.map((item) => item.status)).toEqual([
      'published',
      'draft',
      'completed',
    ]);
    expect(next.classes[2]).toBe(state.classes[2]);
    expect(next.bookings[1]).toBe(cancelled);
    const restored = value(
      updateStation(next, 'station:one', { inService: true }),
    );
    expect(restored.classes[0].reviewFlags).toEqual([]);
    expect(restored.bookings[0].reviewFlags).toEqual(['memberInactive']);
  });

  it('deduplicates outage flags and preserves unrelated flags', () => {
    const state = fixture({
      bookings: [
        booking({ reviewFlags: ['memberInactive', 'stationOutOfService'] }),
      ],
    });
    const next = value(
      updateStation(freeze(state), 'station:one', { inService: false }),
    );
    const repeated = value(
      updateStation(next, 'station:one', { inService: false }),
    );
    expect(repeated.bookings[0].reviewFlags).toEqual([
      'memberInactive',
      'stationOutOfService',
    ]);
  });

  it('creates a station and updates only editable metadata', () => {
    const station: Station = {
      stationId: 'station:new',
      label: 'Rower 3',
      pm5Serial: null,
      inService: false,
      row: 3,
      column: 4,
    };
    const state = freeze(fixture());
    const next = value(createStation(state, station));
    expect(next.stations).toEqual([...state.stations, station]);
    expect(next.stations[2]).not.toBe(station);
    const edited = value(
      updateStation(next, station.stationId, {
        label: 'New label',
        pm5Serial: 'fictional-3',
      }),
    );
    expect(edited.stations[2]).toEqual({
      ...station,
      label: 'New label',
      pm5Serial: 'fictional-3',
    });
    expect(getClassCapacity(edited)).toBe(2);
  });

  it('clears zero-capacity warnings when adding an in-service station', () => {
    const state = fixture({
      stations: [],
      classes: [scheduledClass({ reviewFlags: ['zeroCapacity'] })],
    });
    const next = value(createStation(state, fixture().stations[0]));
    expect(next.classes[0].reviewFlags).toEqual([]);
  });

  it.each([
    { kind: 'member', memberId: 'member:one' },
    { kind: 'staff', staffId: 'staff:desk' },
    { kind: 'staff', staffId: 'staff:coach' },
    { kind: 'staff', staffId: 'staff:missing' },
  ] satisfies DemoActor[])(
    'rejects non-admin station edits for %j',
    (actor) => {
      const state = freeze(fixture({ activeActor: actor }));
      expect(
        updateStation(state, 'station:one', { inService: false }),
      ).toMatchObject({ success: false });
      expect(
        createStation(state, {
          ...state.stations[0],
          stationId: 'station:new',
        }),
      ).toMatchObject({ success: false });
    },
  );

  it('rejects inactive admins and missing stations explicitly', () => {
    const state = fixture();
    expect(
      updateStation(
        fixture({
          staffAccounts: state.staffAccounts.map((staff) => ({
            ...staff,
            active: false,
          })),
        }),
        'station:one',
        { inService: false },
      ),
    ).toMatchObject({
      success: false,
      error: { reason: 'inactiveStaff' },
    });
    expect(updateStation(state, 'station:missing', {})).toMatchObject({
      success: false,
      error: { category: 'DemoUnavailableState', resource: 'station' },
    });
  });

  it('rejects duplicate IDs, occupied coordinates, invalid coordinates, and blank labels', () => {
    const state = freeze(fixture());
    for (const station of [
      state.stations[0],
      { ...state.stations[0], stationId: 'station:new' as const },
      { ...state.stations[0], stationId: 'station:new' as const, row: -1 },
      { ...state.stations[0], stationId: 'station:new' as const, row: 1.5 },
      { ...state.stations[0], stationId: 'station:new' as const, row: NaN },
      {
        ...state.stations[0],
        stationId: 'station:new' as const,
        row: 3,
        label: ' ',
      },
    ]) {
      expect(createStation(state, station)).toMatchObject({
        success: false,
        error: { category: 'ValidationError' },
      });
    }
    expect(updateStation(state, 'station:one', { label: ' ' })).toMatchObject({
      success: false,
    });
  });
});
