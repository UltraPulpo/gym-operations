import { DateTime } from 'luxon';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  advanceAttendanceClock,
  applyWeeklyTemplate,
  bookStation,
  cancelBooking,
  checkIn,
  countActiveMembers,
  getClassCapacity,
  getWaiverCompliance,
  joinWaitlist,
  moveBooking,
  publishClasses,
  selectClassLayout,
  signWaiver,
  validateMembershipAction,
} from '../domain';
import type {
  DemoState,
  DomainResult,
  GetScenarios,
  InvitationAcceptanceInput,
  LocalDate,
  LoadScenario,
  ScenarioId,
  WeeklyTemplateId,
  UtcInstant,
} from '../domain';
import {
  createInitialDemoState,
  DEMO_INITIAL_NOW,
  DEMO_TIMEZONE,
  FIXTURE_IDS as ids,
} from '../demo-fixtures';
import {
  DEFAULT_SCENARIO_ID,
  getScenarioClockPresets,
  getScenarios,
  loadScenario,
  SCENARIO_DATA_IDS,
  SCENARIO_IDS,
} from './index';

function value<T>(result: DomainResult<T>): T {
  if (!result.success) throw new Error(result.error.message);
  return result.value;
}

function objectsIn(graph: unknown, found = new Set<object>()): Set<object> {
  if (graph !== null && typeof graph === 'object' && !found.has(graph)) {
    found.add(graph);
    Object.values(graph).forEach((child) => objectsIn(child, found));
  }
  return found;
}

function load(id: ScenarioId): DemoState {
  return value(loadScenario(id)).snapshot;
}

function applyTemplate(
  state: DemoState,
  templateId: WeeklyTemplateId,
  weekStartsOn: LocalDate,
) {
  const template = state.weeklyTemplates.find(
    (item) => item.templateId === templateId,
  );
  if (!template) throw new Error('Expected scenario template.');
  return applyWeeklyTemplate({
    template,
    weekStartsOn,
    timezone: state.settings.timezone,
    classTypes: state.classTypes,
    classes: state.classes,
    targetGapMinutes: state.settings.targetGapMinutes,
  });
}

function acceptance(state: DemoState): InvitationAcceptanceInput {
  return {
    invitationId: ids.invitations.outstanding,
    memberId: 'member:scenario-invitee',
    signatureId: 'signature:scenario-invitee',
    displayName: 'Fictional Invitee',
    adultAttested: true,
    identity: {
      outcome: 'verified',
      subject: 'identity:scenario-invitee',
      verifiedEmail: 'invitee@example.invalid',
    },
    waiver: {
      waiverVersionId: state.currentWaiverVersionId!,
      typedName: 'Fictional Invitee',
    },
  };
}

describe('resettable fictional scenario catalog', () => {
  it('exports every named case in a stable default-first catalog with all six categories', () => {
    expectTypeOf(getScenarios).toExtend<GetScenarios>();
    expectTypeOf(loadScenario).toExtend<LoadScenario>();
    const catalog = getScenarios();
    expect(catalog.map((scenario) => scenario.scenarioId)).toEqual(
      Object.values(SCENARIO_IDS),
    );
    expect(new Set(catalog.map((scenario) => scenario.scenarioId)).size).toBe(
      catalog.length,
    );
    expect(DEFAULT_SCENARIO_ID).toBe(ids.scenarios.baseline);
    expect(catalog[0].scenarioId).toBe(DEFAULT_SCENARIO_ID);
    expect(new Set(catalog.map((scenario) => scenario.category))).toEqual(
      new Set([
        'baseline',
        'capacityWaitlist',
        'invitationMemberCap',
        'scheduleConflict',
        'waiverAttendance',
        'unavailableLayout',
      ]),
    );
    expect(Object.isFrozen(SCENARIO_IDS)).toBe(true);
    expect(Object.isFrozen(SCENARIO_DATA_IDS)).toBe(true);
  });

  it.each([
    'scenario:not-known',
    '',
    'baseline',
    ' scenario:baseline',
    'scenario:baseline ',
    'scenario:BASELINE',
  ])(
    'returns an explicit unavailable result for unknown ID %j, never a fallback',
    (id) => {
      for (const result of [loadScenario(id), getScenarioClockPresets(id)]) {
        expect(result).toEqual({
          success: false,
          error: {
            category: 'DemoUnavailableState',
            resource: 'scenario',
            resourceId: id,
            stale: false,
            message: expect.stringMatching(/scenario.*unavailable/i),
          },
        });
      }
    },
  );

  it('loads baseline exactly like the initial factory after any other scenario', () => {
    for (const id of Object.values(SCENARIO_IDS)) {
      load(id);
      expect(load(DEFAULT_SCENARIO_ID)).toEqual(createInitialDemoState());
    }
    expect(load(DEFAULT_SCENARIO_ID).clock.now).toBe(DEMO_INITIAL_NOW);
  });

  it('returns complete snapshots with matching actor, timezone, clock and default preset metadata', () => {
    for (const scenario of getScenarios()) {
      const state = load(scenario.scenarioId);
      expect(value(loadScenario(scenario.scenarioId))).toEqual(scenario);
      expect(state).toEqual(scenario.snapshot);
      expect(Object.keys(state).sort()).toEqual(
        Object.keys(createInitialDemoState()).sort(),
      );
      expect(state.revision).toBe(0);
      expect(state.scenarioId).toBe(scenario.scenarioId);
      expect(state.activeActor).toEqual(scenario.defaultActor);
      expect(state.clock.now).toBe(scenario.clockInstant);
      expect(state.settings.timezone).toBe(scenario.timezone);
      expect(scenario.timezone).toBe(DEMO_TIMEZONE);
      expect(scenario.illustrative).toBe(true);
      expect(state.settings.illustrative).toBe(true);
      expect(scenario.name.trim()).not.toBe('');
      expect(scenario.description).toMatch(/fictional/i);
      expect(scenario.description).toMatch(/illustrative/i);
      const presets = value(getScenarioClockPresets(scenario.scenarioId));
      expect(presets[0]).toMatchObject({
        presetId: state.clock.presetId,
        instant: state.clock.now,
      });
      expect(new Set(presets.map((preset) => preset.presetId)).size).toBe(
        presets.length,
      );
      presets.forEach((preset) => {
        expect(DateTime.fromISO(preset.instant).isValid).toBe(true);
        expect(preset.instant).toMatch(/Z$/);
        expect(preset.name.trim()).not.toBe('');
      });
      const actor = state.activeActor;
      if (actor.kind === 'staff')
        expect(
          state.staffAccounts.some((s) => s.staffId === actor.staffId),
        ).toBe(true);
      else if (actor.kind === 'member')
        expect(state.members.some((m) => m.memberId === actor.memberId)).toBe(
          true,
        );
      else
        expect(
          state.invitations.some((i) => i.invitationId === actor.invitationId),
        ).toBe(true);
    }
  });

  it('shares no mutable objects across catalog entries, catalogs, loads or presets', () => {
    const catalog = getScenarios();
    const all = objectsIn(catalog);
    for (const other of [
      getScenarios(),
      ...catalog.map((scenario) => load(scenario.scenarioId)),
    ]) {
      objectsIn(other).forEach((object) => expect(all.has(object)).toBe(false));
    }
    for (const scenario of catalog) {
      const first = objectsIn(scenario.snapshot);
      for (const other of catalog.filter((s) => s !== scenario))
        objectsIn(other.snapshot).forEach((object) =>
          expect(first.has(object)).toBe(false),
        );
      const presets = value(getScenarioClockPresets(scenario.scenarioId));
      const presetObjects = objectsIn(presets);
      objectsIn(value(getScenarioClockPresets(scenario.scenarioId))).forEach(
        (object) => expect(presetObjects.has(object)).toBe(false),
      );
      const loaded = load(scenario.scenarioId);
      const loadedObjects = objectsIn(loaded);
      objectsIn(load(scenario.scenarioId)).forEach((object) =>
        expect(loadedObjects.has(object)).toBe(false),
      );
      Reflect.set(loaded.settings, 'memberCap', 999);
      Reflect.set(loaded.classes[0].classTypeSnapshot, 'name', 'Changed');
      Reflect.set(loaded.notifications[0].attempts, 'length', 0);
      Reflect.set(presets[0], 'name', 'Changed');
      expect(load(scenario.scenarioId)).toEqual(scenario.snapshot);
      expect(
        value(getScenarioClockPresets(scenario.scenarioId))[0].name,
      ).not.toBe('Changed');
    }
    const pristine = getScenarios();
    Reflect.set(catalog[0].defaultActor, 'staffId', 'staff:mutated');
    Reflect.set(catalog[0].snapshot.waivers, 'length', 0);
    Reflect.set(catalog, 'length', 0);
    expect(getScenarios()).toEqual(pristine);
  });

  it('is independent of the real clock and never fetches services', () => {
    const pristine = getScenarios();
    vi.useFakeTimers();
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Scenarios must not request external services.');
    });
    try {
      vi.setSystemTime(new Date('2040-01-01T00:00:00Z'));
      expect(getScenarios()).toEqual(pristine);
      for (const scenario of pristine) {
        expect(load(scenario.scenarioId)).toEqual(scenario.snapshot);
        getScenarioClockPresets(scenario.scenarioId);
      }
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
      vi.useRealTimers();
    }
  });

  it('retains reciprocal member, invitation, booking, attendance, coach and promotion links', () => {
    for (const { snapshot: state } of getScenarios()) {
      for (const member of state.members) {
        expect(
          state.invitations.find((i) => i.invitationId === member.invitationId),
        ).toMatchObject({ status: 'accepted', memberId: member.memberId });
        expect(member.verifiedEmail).toMatch(/@example\.invalid$/);
      }
      for (const booking of state.bookings) {
        expect(state.members.some((m) => m.memberId === booking.memberId)).toBe(
          true,
        );
        expect(state.classes.some((c) => c.classId === booking.classId)).toBe(
          true,
        );
        expect(
          state.stations.some((s) => s.stationId === booking.stationId),
        ).toBe(true);
        expect(
          state.attendance.find(
            (a) => a.attendanceId === booking.attendanceRecordId,
          ),
        ).toMatchObject({
          bookingId: booking.bookingId,
          memberId: booking.memberId,
          classId: booking.classId,
        });
        if (booking.promotedFromEntryId)
          expect(
            state.waitlistEntries.find(
              (e) => e.entryId === booking.promotedFromEntryId,
            ),
          ).toMatchObject({ status: 'promoted', bookingId: booking.bookingId });
      }
      for (const staff of state.staffAccounts)
        expect([...staff.assignedClassIds].sort()).toEqual(
          state.classes
            .filter((c) => c.coachId === staff.staffId)
            .map((c) => c.classId)
            .sort(),
        );
      for (const scheduled of state.classes) {
        const local = DateTime.fromISO(scheduled.startsAt, {
          zone: state.settings.timezone,
        });
        expect(local.toISODate()).toBe(scheduled.schedule.date);
        expect(local.toFormat('HH:mm')).toBe(scheduled.schedule.time);
        expect(scheduled.schedule.timezone).toBe(DEMO_TIMEZONE);
        expect(
          Date.parse(scheduled.endsAt) - Date.parse(scheduled.startsAt),
        ).toBe(scheduled.classTypeSnapshot.durationMinutes * 60_000);
        if (scheduled.status === 'published')
          expect(scheduled.endsAt > state.clock.now).toBe(true);
        if (scheduled.status === 'completed') {
          expect(scheduled.completedAt).toBe(scheduled.endsAt);
          expect(scheduled.endsAt <= state.clock.now).toBe(true);
          for (const record of state.attendance.filter(
            (a) => a.classId === scheduled.classId,
          ))
            expect(record.currentOutcome).not.toBe('booked');
        }
      }
      const active = state.classes
        .filter((c) => c.status !== 'cancelled')
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      for (let i = 1; i < active.length; i++)
        expect(active[i - 1].endsAt <= active[i].startsAt).toBe(true);
    }
  });
});

describe('scenario workflow semantics', () => {
  it('starts capacity/waitlist as an eligible unbooked member at a genuinely full class', () => {
    const state = load(SCENARIO_IDS.capacityWaitlist);
    expect(state.activeActor).toEqual({
      kind: 'member',
      memberId: ids.members.juniper,
    });
    expect(getClassCapacity(state)).toBe(3);
    expect(
      bookStation(
        state,
        state.activeActor,
        ids.members.juniper,
        ids.classes.full,
        ids.stations.north,
        'booking:scenario-new',
        state.clock.now,
      ),
    ).toMatchObject({ success: false, error: { category: 'DemoConflict' } });
    const joined = value(
      joinWaitlist(
        state,
        state.activeActor,
        ids.members.juniper,
        ids.classes.full,
        'waitlist:scenario-rejoined',
        state.clock.now,
      ),
    );
    expect(
      joined.waitlistEntries?.find(
        (e) => e.entryId === 'waitlist:scenario-rejoined',
      ),
    ).toMatchObject({ status: 'waiting', joinOrder: 6 });
  });

  it('promotes the first eligible FIFO waiter to the freed station, retaining skipped waiters for review', () => {
    const state = load(SCENARIO_IDS.capacityWaitlist);
    const before = structuredClone(state);
    const changes = value(
      cancelBooking(
        state,
        { kind: 'member', memberId: ids.members.maple },
        ids.bookings.fullMaple,
        state.clock.now,
      ),
    );
    expect(
      changes.waitlistEntries?.find((e) => e.entryId === ids.waitlist.willow),
    ).toMatchObject({ status: 'promoted' });
    for (const [entryId, flag] of [
      [ids.waitlist.moss, 'memberInactive'],
      [ids.waitlist.aspen, 'waiverOutdated'],
    ] as const)
      expect(
        changes.waitlistEntries?.find((e) => e.entryId === entryId),
      ).toMatchObject({
        status: 'waiting',
        reviewFlags: expect.arrayContaining([flag]),
      });
    expect(
      changes.bookings?.find(
        (b) => b.promotedFromEntryId === ids.waitlist.willow,
      ),
    ).toMatchObject({
      memberId: ids.members.willow,
      stationId: ids.stations.north,
      status: 'booked',
    });
    expect(state).toEqual(before);
  });

  it('supports exact late-cancel and waitlist-cutoff boundaries through named presets', () => {
    const state = load(SCENARIO_IDS.capacityWaitlist);
    const presets = value(getScenarioClockPresets(state.scenarioId));
    const late = presets.find(
      (p) => p.presetId === ids.clockPresets.fullLateCancelCutoff,
    )!.instant;
    const cutoff = presets.find(
      (p) => p.presetId === ids.clockPresets.fullWaitlistCutoff,
    )!.instant;
    const changes = value(
      cancelBooking(
        state,
        { kind: 'member', memberId: ids.members.maple },
        ids.bookings.fullMaple,
        late,
      ),
    );
    expect(
      changes.attendance?.find(
        (a) => a.attendanceId === ids.attendance.fullMaple,
      )?.currentOutcome,
    ).toBe('cancelled');
    const afterLateCutoff = value(
      cancelBooking(
        state,
        { kind: 'member', memberId: ids.members.maple },
        ids.bookings.fullMaple,
        '2026-10-05T17:00:01Z',
      ),
    );
    expect(
      afterLateCutoff.attendance?.find(
        (a) => a.attendanceId === ids.attendance.fullMaple,
      )?.currentOutcome,
    ).toBe('lateCancel');
    expect(
      joinWaitlist(
        state,
        state.activeActor,
        ids.members.juniper,
        ids.classes.full,
        'waitlist:scenario-at-cutoff',
        cutoff,
      ),
    ).toMatchObject({ success: true });
    const atCutoff = value(
      cancelBooking(
        state,
        { kind: 'member', memberId: ids.members.maple },
        ids.bookings.fullMaple,
        cutoff,
      ),
    );
    expect(
      atCutoff.waitlistEntries?.some(
        (e) => e.entryId === ids.waitlist.willow && e.status === 'promoted',
      ),
    ).not.toBe(true);
    const freed = { ...state, ...atCutoff };
    expect(
      freed.waitlistEntries.find(
        (entry) => entry.entryId === ids.waitlist.willow,
      ),
    ).toMatchObject({ status: 'waiting' });
    expect(
      bookStation(
        freed,
        state.activeActor,
        ids.members.juniper,
        ids.classes.full,
        ids.stations.north,
        'booking:scenario-after-cutoff',
        cutoff,
      ).success,
    ).toBe(true);
  });

  it('accepts a complete invitation into pending at the cap, while baseline accepts into active', () => {
    const state = load(SCENARIO_IDS.invitationMemberCap);
    expect(state.activeActor).toEqual({
      kind: 'invitation',
      invitationId: ids.invitations.outstanding,
    });
    expect(state.settings.memberCap).toBe(countActiveMembers(state));
    const before = structuredClone(state);
    const accepted = value(
      validateMembershipAction(
        state,
        state.activeActor,
        { type: 'acceptInvitation', payload: acceptance(state) },
        state.clock.now,
      ),
    );
    expect(
      accepted.changes.members?.find(
        (m) => m.memberId === 'member:scenario-invitee',
      )?.status,
    ).toBe('pending');
    expect(
      accepted.changes.invitations?.find(
        (i) => i.invitationId === ids.invitations.outstanding,
      ),
    ).toMatchObject({
      status: 'accepted',
      memberId: 'member:scenario-invitee',
    });
    expect(accepted.changes.waiverSignatures).toContainEqual(
      expect.objectContaining({
        memberId: 'member:scenario-invitee',
        waiverVersionId: ids.waivers.current,
      }),
    );
    expect(state).toEqual(before);
    const baseline = load(DEFAULT_SCENARIO_ID);
    const active = value(
      validateMembershipAction(
        baseline,
        state.activeActor,
        { type: 'acceptInvitation', payload: acceptance(baseline) },
        baseline.clock.now,
      ),
    );
    expect(
      active.changes.members?.find(
        (m) => m.memberId === 'member:scenario-invitee',
      )?.status,
    ).toBe('active');
  });

  it.each([
    [ids.invitations.expired, 'invitationExpired'],
    [ids.invitations.revoked, 'invitationRevoked'],
    [ids.invitations.superseded, 'invitationRevoked'],
  ] as const)(
    'retains invitation rejection case %s without mutating the cap snapshot',
    (invitationId, reason) => {
      const state = load(SCENARIO_IDS.invitationMemberCap);
      const before = structuredClone(state);
      expect(
        validateMembershipAction(
          state,
          { kind: 'invitation', invitationId },
          {
            type: 'acceptInvitation',
            payload: { ...acceptance(state), invitationId },
          },
          state.clock.now,
        ),
      ).toMatchObject({ success: false, error: { reason } });
      expect(state).toEqual(before);
    },
  );

  it('rejects the outstanding invitation at exactly its expiry without consuming it', () => {
    const state = load(SCENARIO_IDS.invitationMemberCap);
    const before = structuredClone(state);
    const invitation = state.invitations.find(
      (i) => i.invitationId === ids.invitations.outstanding,
    )!;
    expect(
      validateMembershipAction(
        state,
        state.activeActor,
        { type: 'acceptInvitation', payload: acceptance(state) },
        invitation.expiresAt,
      ),
    ).toMatchObject({ success: false, error: { reason: 'invitationExpired' } });
    expect(state).toEqual(before);
  });

  it.each([
    ['rejected', 'identityRejected'],
    ['mismatched', 'identityMismatch'],
  ] as const)(
    'provides explicit simulated %s identity rejection with no network or acceptance',
    (outcome, reason) => {
      const state = load(SCENARIO_IDS.invitationMemberCap);
      const payload = acceptance(state);
      const before = structuredClone(state);
      expect(
        validateMembershipAction(
          state,
          state.activeActor,
          {
            type: 'acceptInvitation',
            payload: {
              ...payload,
              identity:
                outcome === 'rejected'
                  ? { outcome, message: 'Fictional identity rejected.' }
                  : {
                      outcome,
                      subject: 'identity:scenario-mismatch',
                      verifiedEmail: 'mismatch@example.invalid',
                    },
            },
          },
          state.clock.now,
        ),
      ).toMatchObject({ success: false, error: { reason } });
      expect(state).toEqual(before);
    },
  );

  it('rejects an entire conflicting template proposal, not an already-invalid schedule', () => {
    const state = load(SCENARIO_IDS.scheduleConflict);
    expect(state.activeActor).toEqual({
      kind: 'staff',
      staffId: ids.staff.admin,
    });
    const before = structuredClone(state);
    expect(
      applyTemplate(state, ids.templates.weekA, '2026-10-05'),
    ).toMatchObject({
      success: false,
      error: {
        category: 'DemoConflict',
        conflict: {
          kind: 'schedule',
          classIds: expect.arrayContaining([ids.classes.checkIn]),
        },
      },
    });
    expect(state).toEqual(before);
  });

  it('also offers a zero-gap but nonoverlapping template that succeeds with explicit warnings', () => {
    const state = load(SCENARIO_IDS.scheduleConflict);
    const applied = value(
      applyTemplate(state, SCENARIO_DATA_IDS.gapTemplate, '2026-10-05'),
    );
    expect(applied.classes).toHaveLength(1);
    expect(applied.classes[0]).toMatchObject({
      status: 'draft',
      startsAt: '2026-10-05T16:45:00Z',
      endsAt: '2026-10-05T17:15:00Z',
    });
    expect(
      applied.warnings.filter((w) => w.actualGapMinutes === 0),
    ).toHaveLength(2);
  });

  it('retains an old-waiver booking, blocks new booking and check-in, and permits signing then check-in', () => {
    const state = load(SCENARIO_IDS.waiverAttendance);
    expect(state.activeActor).toEqual({
      kind: 'member',
      memberId: ids.members.aspen,
    });
    expect(state.clock.now).toBe('2026-10-05T17:15:00Z');
    expect(getWaiverCompliance(state, ids.members.aspen)).toMatchObject({
      status: 'outdated',
    });
    const retained = state.bookings.find(
      (b) => b.bookingId === ids.bookings.outdatedWaiver,
    );
    expect(retained).toMatchObject({
      status: 'booked',
      stationId: ids.stations.north,
    });
    expect(
      checkIn(
        state,
        state.activeActor,
        ids.bookings.outdatedWaiver,
        state.clock.now,
      ),
    ).toMatchObject({ success: false, error: { reason: 'waiverOutdated' } });
    expect(
      bookStation(
        state,
        state.activeActor,
        ids.members.aspen,
        ids.classes.full,
        ids.stations.north,
        'booking:scenario-waiver',
        state.clock.now,
      ),
    ).toMatchObject({ success: false, error: { reason: 'waiverOutdated' } });
    const current = value(
      signWaiver(
        state,
        {
          memberId: ids.members.aspen,
          signatureId: 'signature:scenario-aspen-current',
          waiverVersionId: ids.waivers.current,
          typedName: 'Fictional Aspen',
        },
        state.clock.now,
      ),
    );
    expect(
      checkIn(
        current,
        current.activeActor,
        ids.bookings.outdatedWaiver,
        current.clock.now,
      ).success,
    ).toBe(true);
    expect(
      state.bookings.find((b) => b.bookingId === ids.bookings.outdatedWaiver),
    ).toEqual(retained);
  });

  it('advances attendance at exact class end while preserving checked-in outcomes and correction history', () => {
    const state = load(DEFAULT_SCENARIO_ID);
    const end = value(getScenarioClockPresets(state.scenarioId)).find(
      (p) => p.presetId === ids.clockPresets.classEnd,
    )!.instant;
    const changes = value(advanceAttendanceClock(state, end));
    expect(
      changes.classes?.find((c) => c.classId === ids.classes.checkIn),
    ).toMatchObject({ status: 'completed', completedAt: end });
    expect(
      changes.attendance?.find(
        (a) => a.attendanceId === ids.attendance.checkInCedar,
      ),
    ).toMatchObject({ currentOutcome: 'noShow' });
    expect(
      changes.attendance?.find(
        (a) => a.attendanceId === ids.attendance.checkInMaple,
      ),
    ).toMatchObject({ currentOutcome: 'attended' });
    const history = state.attendance.find(
      (a) => a.attendanceId === ids.attendance.historyCorrected,
    );
    expect(
      changes.attendance?.find(
        (a) => a.attendanceId === ids.attendance.historyCorrected,
      ),
    ).toEqual(history);
    expect(
      value(advanceAttendanceClock({ ...state, ...changes }, end)),
    ).toEqual({});
  });

  it.each([
    ['2026-10-05T15:29:59Z', false],
    ['2026-10-05T15:30:00Z', true],
    ['2026-10-05T16:05:00Z', true],
    ['2026-10-05T16:05:01Z', false],
  ] satisfies [UtcInstant, boolean][])(
    'demonstrates member check-in boundary %s (%s)',
    (instant, allowed) => {
      const state = load(DEFAULT_SCENARIO_ID);
      const before = structuredClone(state);
      const result = checkIn(
        state,
        { kind: 'member', memberId: ids.members.cedar },
        ids.bookings.checkInCedar,
        instant,
      );
      expect(result.success).toBe(allowed);
      if (!allowed)
        expect(result).toMatchObject({
          error: { reason: 'outsideCheckInWindow' },
        });
      expect(state).toEqual(before);
    },
  );

  it('shows all four baseline station overlay states and omits assigned names from member layout', () => {
    const state = load(DEFAULT_SCENARIO_ID);
    const staffView = selectClassLayout(state, ids.classes.checkIn);
    expect(staffView.status).toBe('available');
    if (staffView.status !== 'available')
      throw new Error('Expected available staff layout.');
    expect(new Set(staffView.stations.map((s) => s.state))).toEqual(
      new Set([
        'available',
        'bookedNotCheckedIn',
        'bookedCheckedIn',
        'outOfService',
      ]),
    );
    expect(staffView.stations.some((s) => 'assignedMember' in s)).toBe(true);
    const memberView = selectClassLayout(state, ids.classes.checkIn, {
      kind: 'member',
      memberId: ids.members.cedar,
    });
    expect(memberView.status).toBe('available');
    if (memberView.status !== 'available')
      throw new Error('Expected available member layout.');
    for (const station of memberView.stations) {
      expect(station.stateLabel.trim()).not.toBe('');
      expect(station).not.toHaveProperty('assignedMember');
      expect(station).not.toHaveProperty('bookingId');
    }
  });

  it('shows the morning attendance transition already applied in the later waiver snapshot', () => {
    const state = load(SCENARIO_IDS.waiverAttendance);
    expect(
      state.classes.find((c) => c.classId === ids.classes.checkIn)?.status,
    ).toBe('completed');
    expect(
      state.attendance.find(
        (a) => a.attendanceId === ids.attendance.checkInCedar,
      )?.currentOutcome,
    ).toBe('noShow');
    expect(
      state.attendance.find(
        (a) => a.attendanceId === ids.attendance.historyCorrected,
      )?.corrections,
    ).toHaveLength(1);
  });

  it('demonstrates zero in-service capacity without erasing bookings or moving stations', () => {
    const state = load(SCENARIO_IDS.serviceUnavailable);
    expect(getClassCapacity(state)).toBe(0);
    expect(state.simulation.delivery).toBe('failure');
    const baseline = createInitialDemoState();
    expect(
      state.bookings.map((b) => [b.bookingId, b.status, b.stationId]),
    ).toEqual(
      baseline.bookings.map((b) => [b.bookingId, b.status, b.stationId]),
    );
    for (const booking of state.bookings.filter((b) => b.status === 'booked'))
      expect(booking.reviewFlags).toContain('stationOutOfService');
    for (const scheduled of state.classes.filter(
      (c) => c.status === 'published' || c.status === 'draft',
    ))
      expect(scheduled.reviewFlags).toContain('zeroCapacity');
    expect(
      bookStation(
        state,
        { kind: 'member', memberId: ids.members.juniper },
        ids.members.juniper,
        ids.classes.free,
        ids.stations.east,
        'booking:scenario-zero',
        state.clock.now,
      ),
    ).toMatchObject({ success: false, error: { reason: 'zeroCapacity' } });
    expect(
      publishClasses(
        state.classes,
        [ids.classes.draft],
        state.clock.now,
        state.settings.targetGapMinutes,
        state,
      ),
    ).toMatchObject({ success: false, error: { reason: 'zeroCapacity' } });
  });

  it.each([
    ['layoutUnavailable', false],
    ['layoutStale', true],
  ] as const)(
    'makes %s explicit and disables reseating without discarding data',
    (key, stale) => {
      const state = load(SCENARIO_IDS[key]);
      const before = structuredClone(state);
      expect(selectClassLayout(state, ids.classes.checkIn)).toMatchObject({
        status: 'unavailable',
        canReseat: false,
        error: {
          category: 'DemoUnavailableState',
          resource: 'layout',
          stale,
        },
      });
      expect(
        moveBooking(
          state,
          state.activeActor,
          ids.bookings.checkInCedar,
          ids.stations.east,
          state.clock.now,
        ),
      ).toMatchObject({
        success: false,
        error: { category: 'DemoUnavailableState', stale },
      });
      expect(state.bookings).toEqual(createInitialDemoState().bookings);
      expect(state).toEqual(before);
    },
  );

  it.each([
    [
      'dstSpring',
      '2027-03-01',
      '2027-03-08',
      17,
      16,
      167,
      '2027-03-14T09:59:59Z',
      '2027-03-14T10:00:00Z',
      '01:59:59',
      '03:00:00',
    ],
    [
      'dstFall',
      '2026-10-19',
      '2026-10-26',
      16,
      17,
      169,
      '2026-11-01T08:59:59Z',
      '2026-11-01T09:00:00Z',
      '01:59:59',
      '01:00:00',
    ],
  ] as const)(
    'provides %s wall-clock recurrence and exact transition presets',
    (
      key,
      beforeWeek,
      afterWeek,
      beforeUtcHour,
      afterUtcHour,
      elapsedHours,
      beforeInstant,
      afterInstant,
      beforeLocal,
      afterLocal,
    ) => {
      const state = load(SCENARIO_IDS[key]);
      const first = value(
        applyTemplate(state, SCENARIO_DATA_IDS.dstTemplate, beforeWeek),
      ).classes[0];
      const second = value(
        applyTemplate(state, SCENARIO_DATA_IDS.dstTemplate, afterWeek),
      ).classes[0];
      expect(first.schedule.time).toBe('09:00');
      expect(second.schedule.time).toBe('09:00');
      expect(DateTime.fromISO(first.startsAt, { zone: 'utc' }).hour).toBe(
        beforeUtcHour,
      );
      expect(DateTime.fromISO(second.startsAt, { zone: 'utc' }).hour).toBe(
        afterUtcHour,
      );
      expect(
        (Date.parse(second.startsAt) - Date.parse(first.startsAt)) / 3_600_000,
      ).toBe(elapsedHours);
      const presets = value(getScenarioClockPresets(state.scenarioId));
      expect(presets.map((p) => p.instant)).toEqual([
        state.clock.now,
        beforeInstant,
        afterInstant,
      ]);
      expect(
        DateTime.fromISO(beforeInstant, { zone: DEMO_TIMEZONE }).toFormat(
          'HH:mm:ss',
        ),
      ).toBe(beforeLocal);
      expect(
        DateTime.fromISO(afterInstant, { zone: DEMO_TIMEZONE }).toFormat(
          'HH:mm:ss',
        ),
      ).toBe(afterLocal);
    },
  );
});
