import { describe, expect, it } from 'vitest';
import { FIXTURE_IDS as ids, createInitialDemoState } from '../demo-fixtures';
import { SCENARIO_IDS, loadScenario } from '../demo-scenarios';
import {
  selectActiveActor,
  selectCapabilities,
  selectClassAttendance,
  selectClassBookings,
  selectClassLayout,
  selectClassRosterMembers,
  selectClasses,
  selectClassSeatSummary,
  selectClassWaitlist,
  selectCoachClassHistory,
  selectCoachProfile,
  selectClock,
  selectInvitations,
  selectMember,
  selectMemberBookings,
  selectMembers,
  selectNotifications,
  selectPrintableRoster,
  selectScenarios,
  selectSettings,
  selectSimulation,
  selectStaff,
  selectStaffAccounts,
  selectWaiverCompliance,
} from './selectors';
import { expectSuccess } from './test-helpers';
import type { DemoActor } from '../domain';

describe('demo-state selectors', () => {
  it('limits member projections to self and never exposes identity subjects', () => {
    const seed = createInitialDemoState();
    const state = {
      ...seed,
      members: seed.members.map((member) => ({
        ...member,
        contactEmail: 'private.contact@example.invalid',
      })),
    };
    const actor: DemoActor = { kind: 'member', memberId: ids.members.maple };
    const members = selectMembers(state, actor);
    expect(members.map((member) => member.memberId)).toEqual([
      ids.members.maple,
    ]);
    expect(members[0]).toMatchObject({
      verifiedEmail: 'maya.chen@example.invalid',
      contactEmail: 'private.contact@example.invalid',
    });
    expect(JSON.stringify(members)).not.toContain('identitySubject');
    expect(selectMember(state, ids.members.cedar, actor)).toBeUndefined();
    expect(selectInvitations(state, actor)).toEqual([]);
    expect(selectStaffAccounts(state, actor)).toEqual([]);
    expect(selectStaff(state, ids.staff.coach, actor)).toBeUndefined();
  });

  it('provides contacts only to member-management staff, not assigned coaches', () => {
    const seed = createInitialDemoState();
    const state = {
      ...seed,
      members: seed.members.map((member) => ({
        ...member,
        contactEmail: 'private.contact@example.invalid',
      })),
    };
    const frontDesk: DemoActor = {
      kind: 'staff',
      staffId: ids.staff.frontDesk,
    };
    const coach: DemoActor = { kind: 'staff', staffId: ids.staff.coach };
    expect(selectMembers(state, frontDesk)).toHaveLength(state.members.length);
    expect(selectMember(state, ids.members.maple, frontDesk)).toHaveProperty(
      'contactEmail',
    );
    expect(
      selectMembers(state, coach)
        .map((member) => member.memberId)
        .sort(),
    ).toEqual(
      [
        ...new Set(
          state.bookings
            .filter(
              (booking) =>
                booking.status === 'booked' &&
                state.staffAccounts
                  .find((staff) => staff.staffId === ids.staff.coach)!
                  .assignedClassIds.includes(booking.classId),
            )
            .map((booking) => booking.memberId),
        ),
      ].sort(),
    );
    expect(JSON.stringify(selectMembers(state, coach))).not.toMatch(
      /verifiedEmail|contactEmail|identitySubject|invitationId/,
    );
    expect(selectInvitations(state, coach)).toEqual([]);
    expect(selectStaffAccounts(state, frontDesk)).toEqual([]);
    expect(JSON.stringify(selectStaffAccounts(state))).not.toMatch(
      /identitySubject|coachProfile/,
    );
  });

  it('projects names only for an authorized class roster, including retained history and queue-only members', () => {
    const seed = createInitialDemoState();
    const state = {
      ...seed,
      members: seed.members.map((member) => ({
        ...member,
        contactEmail: 'private.contact@example.invalid',
      })),
      waitlistEntries: [
        ...seed.waitlistEntries,
        {
          ...seed.waitlistEntries[0]!,
          entryId: 'waitlist:history-only-aspen' as const,
          memberId: ids.members.aspen,
          classId: ids.classes.history,
          joinOrder: 1,
          status: 'waiting' as const,
          reviewFlags: [],
        },
      ],
    };
    const coach: DemoActor = { kind: 'staff', staffId: ids.staff.coach };
    const roster = selectClassRosterMembers(state, ids.classes.history, coach);

    expect(roster).toEqual(
      expect.arrayContaining([
        { memberId: ids.members.willow, displayName: 'Taylor Reed' },
        { memberId: ids.members.juniper, displayName: 'Riley Morgan' },
        { memberId: ids.members.aspen, displayName: 'Casey Park' },
      ]),
    );
    expect(JSON.stringify(roster)).not.toMatch(
      /contactEmail|verifiedEmail|identitySubject|invitationId/,
    );
    expect(selectMembers(state, coach)).not.toContainEqual(
      expect.objectContaining({ memberId: ids.members.aspen }),
    );
    expect(selectClassRosterMembers(state, ids.classes.full, coach)).toEqual(
      [],
    );
    expect(
      selectClassRosterMembers(state, ids.classes.history, {
        kind: 'member',
        memberId: ids.members.maple,
      }),
    ).toEqual([]);
  });

  it.each([
    { kind: 'member', memberId: ids.members.maple },
    { kind: 'invitation', invitationId: ids.invitations.outstanding },
    { kind: 'staff', staffId: ids.staff.inactive },
    { kind: 'staff', staffId: 'staff:missing' },
  ] satisfies DemoActor[])(
    'hides printable rosters from unauthorized actor %j',
    (actor) => {
      const state = createInitialDemoState();
      expect(
        selectPrintableRoster(state, ids.classes.full, actor),
      ).toMatchObject({ success: false });
    },
  );

  it('restricts coach printable rosters to assigned classes and excludes contacts', () => {
    const state = createInitialDemoState();
    const actor: DemoActor = { kind: 'staff', staffId: ids.staff.coach };
    expect(selectPrintableRoster(state, ids.classes.full, actor)).toMatchObject(
      {
        success: false,
        error: { reason: 'classScopeDenied' },
      },
    );

    const roster = expectSuccess(
      selectPrintableRoster(state, ids.classes.checkIn, actor),
    );
    expect(roster.entries).toHaveLength(3);
    expect(JSON.stringify(roster)).not.toMatch(
      /Email|identitySubject|memberId/,
    );
  });

  it('limits an invitee to its own invitation projection', () => {
    const state = createInitialDemoState();
    expect(
      selectMembers(state, {
        kind: 'invitation',
        invitationId: ids.invitations.outstanding,
      }),
    ).toEqual([]);
    expect(
      selectInvitations(state, {
        kind: 'invitation',
        invitationId: ids.invitations.outstanding,
      }),
    ).toEqual([
      {
        invitationId: ids.invitations.outstanding,
        email: 'invitee@example.invalid',
        issuedAt: '2026-10-04T19:00:00Z',
        expiresAt: '2026-10-11T19:00:00Z',
        status: 'outstanding',
      },
    ]);
  });

  it.each([
    { kind: 'staff', staffId: ids.staff.inactive },
    { kind: 'staff', staffId: 'staff:missing' },
    { kind: 'member', memberId: 'member:missing' },
    { kind: 'invitation', invitationId: ids.invitations.revoked },
  ] satisfies DemoActor[])(
    'returns no visible directory records for %j',
    (actor) => {
      const state = createInitialDemoState();
      expect(selectMembers(state, actor)).toEqual([]);
      expect(selectInvitations(state, actor)).toEqual([]);
      expect(selectStaffAccounts(state, actor)).toEqual([]);
    },
  );

  it('honors the full staff scope of a multi-role coach and front-desk persona', () => {
    const state = createInitialDemoState();
    const actor: DemoActor = { kind: 'staff', staffId: ids.staff.multiRole };
    expect(selectMember(state, ids.members.willow, actor)).toHaveProperty(
      'verifiedEmail',
    );
    expect(
      expectSuccess(selectPrintableRoster(state, ids.classes.full, actor))
        .entries,
    ).toHaveLength(3);
    expect(selectInvitations(state, actor)).toHaveLength(
      state.invitations.length,
    );
    expect(selectStaffAccounts(state, actor)).toEqual([]);
  });
  it('selects classes chronologically for staff with full scope, including drafts', () => {
    const state = createInitialDemoState();
    const classes = selectClasses(state, {
      actor: { kind: 'staff', staffId: ids.staff.admin },
      now: state.clock.now,
    });

    expect(classes.map((scheduledClass) => scheduledClass.classId)).toEqual([
      ids.classes.history,
      ids.classes.cancelled,
      ids.classes.checkIn,
      ids.classes.free,
      ids.classes.full,
      ids.classes.draft,
      ids.classes.laterRelease,
    ]);
  });

  it('hides unreleased and non-published classes from member views', () => {
    const seed = createInitialDemoState();
    const state = {
      ...seed,
      settings: {
        ...seed.settings,
        scheduleRelease: { mode: 'manual' as const },
      },
    };
    const classes = selectClasses(state, {
      actor: { kind: 'member', memberId: ids.members.maple },
      now: state.clock.now,
    });

    expect(classes.map((scheduledClass) => scheduledClass.classId)).toEqual([
      ids.classes.checkIn,
      ids.classes.free,
      ids.classes.full,
    ]);
  });

  it('limits assigned-scope coaches to their own classes', () => {
    const state = createInitialDemoState();
    const classes = selectClasses(state, {
      actor: { kind: 'staff', staffId: ids.staff.coach },
      now: state.clock.now,
    });

    expect(classes.map((scheduledClass) => scheduledClass.classId)).toEqual([
      ids.classes.history,
      ids.classes.checkIn,
      ids.classes.laterRelease,
    ]);
  });

  it('wraps class layout selection using the explicit signature', () => {
    const state = createInitialDemoState();
    const layout = selectClassLayout(
      state,
      ids.classes.checkIn,
      { kind: 'staff', staffId: ids.staff.frontDesk },
      state.clock.now,
    );

    expect(layout.status).toBe('available');
    if (layout.status === 'available' && layout.audience === 'staff') {
      expect(layout.stations).toHaveLength(4);
    }
  });

  it('returns capabilities and active actor from the current state', () => {
    const state = createInitialDemoState();
    expect(selectActiveActor(state)).toEqual(state.activeActor);
    expect(expectSuccess(selectCapabilities(state)).capabilities).toContain(
      'manageStaff',
    );
  });

  it('selects class bookings, waitlist, attendance, printable roster, and seat summary deterministically', () => {
    const state = createInitialDemoState();

    expect(
      selectClassBookings(state, ids.classes.full).map(
        (booking) => booking.bookingId,
      ),
    ).toEqual([
      ids.bookings.fullMaple,
      ids.bookings.fullCedar,
      ids.bookings.fullBirch,
    ]);
    expect(
      selectClassWaitlist(state, ids.classes.full).map(
        (entry) => entry.entryId,
      ),
    ).toEqual([ids.waitlist.moss, ids.waitlist.aspen, ids.waitlist.willow]);
    expect(selectClassAttendance(state, ids.classes.checkIn)).toHaveLength(3);
    expect(
      expectSuccess(selectPrintableRoster(state, ids.classes.full)),
    ).toEqual({
      classId: ids.classes.full,
      entries: [
        { memberDisplayName: 'Maya Chen', stationLabel: 'Rower 01' },
        { memberDisplayName: 'Jordan Brooks', stationLabel: 'Rower 02' },
        { memberDisplayName: 'Sam Patel', stationLabel: 'Rower 03' },
      ],
    });
    expect(selectClassSeatSummary(state, ids.classes.full)).toEqual({
      classId: ids.classes.full,
      capacity: 3,
      booked: 3,
      available: 0,
      waitlist: 3,
    });
  });

  it('uses retired station labels for retained booking history', () => {
    const seed = createInitialDemoState();
    const west = seed.stations.find(
      (station) => station.stationId === ids.stations.west,
    )!;
    const state = {
      ...seed,
      stations: seed.stations.filter(
        (station) => station.stationId !== ids.stations.west,
      ),
      retiredStations: [
        ...seed.retiredStations,
        {
          stationId: west.stationId,
          label: west.label,
          pm5Serial: west.pm5Serial,
          retiredAt: seed.clock.now,
        },
      ],
    };

    expect(
      expectSuccess(selectPrintableRoster(state, ids.classes.full)),
    ).toEqual({
      classId: ids.classes.full,
      entries: [
        { memberDisplayName: 'Maya Chen', stationLabel: 'Rower 01' },
        {
          memberDisplayName: 'Jordan Brooks',
          stationLabel: 'Rower 02 (removed)',
        },
        { memberDisplayName: 'Sam Patel', stationLabel: 'Rower 03' },
      ],
    });
  });

  it('selects member, member bookings, members, staff, staff accounts, invitations, notifications, settings, clock and simulation', () => {
    const state = createInitialDemoState();

    expect(selectMember(state, ids.members.maple)?.displayName).toBe(
      'Maya Chen',
    );
    expect(
      selectMemberBookings(state, ids.members.maple).map(
        (booking) => booking.bookingId,
      ),
    ).toEqual([
      ids.bookings.historyAttended,
      ids.bookings.cancelled,
      ids.bookings.checkInMaple,
      ids.bookings.fullMaple,
    ]);
    expect(selectMembers(state)).toHaveLength(state.members.length);
    expect(selectStaff(state, ids.staff.coach)?.staffId).toBe(ids.staff.coach);
    expect(selectStaffAccounts(state)).toHaveLength(state.staffAccounts.length);
    expect(selectInvitations(state)[0]?.invitationId).toBe(
      ids.invitations.expired,
    );
    expect(
      selectNotifications(state).map((notice) => notice.notificationId),
    ).toEqual([
      ids.notifications.bookingConfirmed,
      ids.notifications.waitlistPromoted,
      ids.notifications.classCancelled,
      ids.notifications.invitationFailed,
      ids.notifications.classChanged,
    ]);
    expect(selectSettings(state)).toEqual(state.settings);
    expect(selectClock(state)).toEqual(state.clock);
    expect(selectSimulation(state)).toEqual(state.simulation);
  });

  it('wraps waiver compliance and coach selectors', () => {
    const state = createInitialDemoState();
    expect(selectWaiverCompliance(state, ids.members.aspen)).toMatchObject({
      status: 'outdated',
    });
    expect(
      expectSuccess(
        selectCoachProfile(state, ids.staff.coach, {
          kind: 'member',
          memberId: ids.members.maple,
        }),
      ).audience,
    ).toBe('member');
    expect(
      expectSuccess(selectCoachClassHistory(state, ids.staff.coach)).length,
    ).toBeGreaterThan(0);
  });

  it('selects fresh scenario metadata', () => {
    const state = createInitialDemoState();
    const scenarios = selectScenarios(state);
    expect(scenarios[0]?.scenarioId).toBe(SCENARIO_IDS.baseline);
    expect(scenarios).not.toBe(selectScenarios(state));
    const loaded = expectSuccess(loadScenario(SCENARIO_IDS.baseline));
    expect(scenarios[0]).toEqual(loaded);
  });
});
