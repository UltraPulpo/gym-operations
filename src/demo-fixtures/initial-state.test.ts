import { DateTime } from 'luxon';
import { describe, expect, it, vi } from 'vitest';
import {
  advanceAttendanceClock,
  applyWeeklyTemplate,
  bookStation,
  cancelBooking,
  checkIn,
  countActiveMembers,
  getWaiverCompliance,
  joinWaitlist,
  requireCapability,
  resendNotification,
  selectClassLayout,
  selectCoachClassHistory,
  selectCoachProfile,
  selectReleasedClasses,
  validateClassCapacity,
  validateMembershipAction,
} from '../domain';
import type {
  DemoActor,
  DemoState,
  DomainResult,
  InvitationAcceptanceInput,
} from '../domain';
import {
  createDemoClockPresets,
  createInitialDemoState,
  DEMO_INITIAL_NOW,
  DEMO_NOTICE,
  DEMO_TIMEZONE,
  FIXTURE_IDS as ids,
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

function freezeGraph(graph: unknown): void {
  objectsIn(graph).forEach((object) => Object.freeze(object));
}

const memberActor = (
  memberId: DemoState['members'][number]['memberId'],
): DemoActor => ({
  kind: 'member',
  memberId,
});

describe('initial fictional demo state', () => {
  it('provides deterministic complete independent graphs, including every nested object', () => {
    const first = createInitialDemoState();
    const snapshot = structuredClone(first);
    const second = createInitialDemoState();
    expect(first).toEqual(second);
    const firstObjects = objectsIn(first);
    objectsIn(second).forEach((object) =>
      expect(firstObjects.has(object)).toBe(false),
    );
    freezeGraph(first);
    expect(createInitialDemoState()).toEqual(snapshot);
    expect(first).toEqual(snapshot);
    for (const collection of [
      first.staffAccounts,
      first.members,
      first.invitations,
      first.waivers,
      first.waiverSignatures,
      first.stations,
      first.classTypes,
      first.weeklyTemplates,
      first.classes,
      first.bookings,
      first.waitlistEntries,
      first.attendance,
      first.notifications,
    ]) {
      expect(collection.length).toBeGreaterThan(0);
    }
  });

  it('isolates actual nested mutations and ignores real wall-clock time without network access', () => {
    const first = createInitialDemoState();
    const pristine = createInitialDemoState();
    Reflect.set(first.settings, 'memberCap', 99);
    Reflect.set(first.classes[0].classTypeSnapshot, 'name', 'Changed snapshot');
    Reflect.set(
      first.staffAccounts.find((staff) => staff.coachProfile)!.coachProfile!
        .contact,
      'email',
      'changed@example.invalid',
    );
    Reflect.set(first.notifications[0].attempts, 'length', 0);
    expect(first).not.toEqual(pristine);
    expect(createInitialDemoState()).toEqual(pristine);
    expect(
      first.classTypes.find(
        (type) =>
          type.classTypeId === first.classes[0].classTypeSnapshot.classTypeId,
      )?.name,
    ).not.toBe('Changed snapshot');
    vi.useFakeTimers();
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Fixtures must not perform network requests.');
    });
    try {
      vi.setSystemTime(new Date('2038-06-01T00:00:00Z'));
      expect(createInitialDemoState()).toEqual(pristine);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
      vi.useRealTimers();
    }
  });

  it('uses a frozen UTC baseline and fresh named clock presets in the illustrative Los Angeles zone', () => {
    const state = createInitialDemoState();
    expect(state.revision).toBe(0);
    expect(state.scenarioId).toBe(ids.scenarios.baseline);
    expect(state.activeActor).toEqual({
      kind: 'staff',
      staffId: ids.staff.admin,
    });
    expect(state.clock).toEqual({
      now: DEMO_INITIAL_NOW,
      presetId: ids.clockPresets.baseline,
    });
    expect(state.settings.timezone).toBe('America/Los_Angeles');
    expect(DEMO_TIMEZONE).toBe(state.settings.timezone);
    expect(state.settings.illustrative).toBe(true);
    expect(state.simulation).toEqual({
      delivery: 'success',
      identity: 'verified',
    });
    expect(DEMO_NOTICE).toMatch(/fictional/i);
    expect(DEMO_NOTICE).toMatch(/illustrative/i);
    expect(DEMO_NOTICE).toMatch(/not.*(operational|operate)/i);
    expect(DEMO_NOTICE).toContain(DEMO_TIMEZONE);
    const presets = createDemoClockPresets();
    expect(presets).toEqual(createDemoClockPresets());
    const presetObjects = objectsIn(presets);
    objectsIn(createDemoClockPresets()).forEach((object) =>
      expect(presetObjects.has(object)).toBe(false),
    );
    expect(new Set(presets.map((preset) => preset.presetId)).size).toBe(
      presets.length,
    );
    expect(
      presets.find((preset) => preset.presetId === state.clock.presetId)
        ?.instant,
    ).toBe(state.clock.now);
    const checkInClass = state.classes.find(
      (item) => item.classId === ids.classes.checkIn,
    )!;
    expect(
      presets.find((preset) => preset.presetId === ids.clockPresets.classStart)
        ?.instant,
    ).toBe(checkInClass.startsAt);
    expect(
      presets.find((preset) => preset.presetId === ids.clockPresets.classEnd)
        ?.instant,
    ).toBe(checkInClass.endsAt);
    for (const preset of presets) {
      expect(DateTime.fromISO(preset.instant).isValid).toBe(true);
      expect(preset.instant).toMatch(/Z$/);
    }
    const presetTime = (presetId: string) =>
      Date.parse(
        presets.find((preset) => preset.presetId === presetId)!.instant,
      );
    const full = state.classes.find(
      (item) => item.classId === ids.classes.full,
    )!;
    expect(presetTime(ids.clockPresets.checkInOpens)).toBe(
      Date.parse(checkInClass.startsAt) -
        state.settings.checkInLeadMinutes * 60_000,
    );
    expect(presetTime(ids.clockPresets.checkInCloses)).toBe(
      Date.parse(checkInClass.startsAt) +
        state.settings.checkInGraceMinutes * 60_000,
    );
    expect(presetTime(ids.clockPresets.fullWaitlistCutoff)).toBe(
      Date.parse(full.startsAt) - state.settings.waitlistCutoffMinutes * 60_000,
    );
    expect(presetTime(ids.clockPresets.fullLateCancelCutoff)).toBe(
      Date.parse(full.startsAt) -
        state.settings.lateCancelCutoffMinutes * 60_000,
    );
  });

  it('keeps fixture identifiers unique, immutable, and present in their corresponding collections', () => {
    const state = createInitialDemoState();
    const collections = {
      staff: state.staffAccounts.map((item) => item.staffId),
      members: state.members.map((item) => item.memberId),
      invitations: state.invitations.map((item) => item.invitationId),
      waivers: state.waivers.map((item) => item.waiverVersionId),
      signatures: state.waiverSignatures.map((item) => item.signatureId),
      stations: state.stations.map((item) => item.stationId),
      classTypes: state.classTypes.map((item) => item.classTypeId),
      templates: state.weeklyTemplates.map((item) => item.templateId),
      templateEntries: state.weeklyTemplates.flatMap((item) =>
        item.entries.map((entry) => entry.entryId),
      ),
      classes: state.classes.map((item) => item.classId),
      bookings: state.bookings.map((item) => item.bookingId),
      waitlist: state.waitlistEntries.map((item) => item.entryId),
      attendance: state.attendance.map((item) => item.attendanceId),
      corrections: state.attendance.flatMap((item) =>
        item.corrections.map((correction) => correction.correctionId),
      ),
      notifications: state.notifications.map((item) => item.notificationId),
      clockPresets: createDemoClockPresets().map((item) => item.presetId),
      scenarios: [state.scenarioId],
    };
    for (const [group, entityIds] of Object.entries(collections)) {
      expect(new Set(entityIds).size).toBe(entityIds.length);
      expect(entityIds.slice().sort()).toEqual(
        Object.values(ids[group as keyof typeof collections])
          .slice()
          .sort(),
      );
    }
    objectsIn(ids).forEach((object) =>
      expect(Object.isFrozen(object)).toBe(true),
    );
  });

  it('links every member to an accepted invitation and real fixture signature evidence', () => {
    const state = createInitialDemoState();
    expect(
      new Set(state.members.map((member) => member.identitySubject)).size,
    ).toBe(state.members.length);
    expect(
      new Set(state.members.map((member) => member.verifiedEmail)).size,
    ).toBe(state.members.length);
    for (const member of state.members) {
      const invitation = state.invitations.find(
        (item) => item.invitationId === member.invitationId,
      );
      expect(invitation).toMatchObject({
        status: 'accepted',
        memberId: member.memberId,
        email: member.verifiedEmail,
        acceptedAt: member.createdAt,
      });
      expect(member.adultEligibility).toBe('attested');
      expect(member.adultAttestationAt).toBe(member.createdAt);
      expect(
        state.waiverSignatures.some(
          (signature) =>
            signature.memberId === member.memberId &&
            signature.signedAt === member.createdAt &&
            signature.typedName === member.displayName,
        ),
      ).toBe(true);
    }
    for (const invitation of state.invitations) {
      expect(
        state.staffAccounts.some(
          (staff) => staff.staffId === invitation.issuedBy,
        ),
      ).toBe(true);
      expect(Date.parse(invitation.expiresAt)).toBeGreaterThan(
        Date.parse(invitation.issuedAt),
      );
      if (invitation.status === 'accepted') {
        expect(Date.parse(invitation.acceptedAt)).toBeLessThan(
          Date.parse(invitation.expiresAt),
        );
        expect(
          state.members.find(
            (member) => member.memberId === invitation.memberId,
          )?.invitationId,
        ).toBe(invitation.invitationId);
      }
      if (invitation.status === 'outstanding')
        expect(invitation.expiresAt > state.clock.now).toBe(true);
      if (invitation.status === 'expired')
        expect(invitation.expiredAt <= state.clock.now).toBe(true);
      if (invitation.status === 'superseded') {
        expect(
          state.invitations.find(
            (item) => item.invitationId === invitation.replacementId,
          )?.email,
        ).toBe(invitation.email);
      }
    }
    expect(
      new Set(
        state.invitations
          .filter((item) => item.status === 'outstanding')
          .map((item) => item.email),
      ).size,
    ).toBe(
      state.invitations.filter((item) => item.status === 'outstanding').length,
    );
    for (const signature of state.waiverSignatures) {
      expect(
        state.members.some((member) => member.memberId === signature.memberId),
      ).toBe(true);
      const waiver = state.waivers.find(
        (item) => item.waiverVersionId === signature.waiverVersionId,
      );
      expect(waiver?.status).toBe('published');
      if (waiver?.status === 'published')
        expect(waiver.publishedAt <= signature.signedAt).toBe(true);
    }
    expect(
      state.waivers.find(
        (item) => item.waiverVersionId === state.currentWaiverVersionId,
      )?.status,
    ).toBe('published');
    expect(getWaiverCompliance(state, ids.members.maple).status).toBe(
      'current',
    );
    expect(getWaiverCompliance(state, ids.members.aspen).status).toBe(
      'outdated',
    );
  });

  it('provides consistent single-role, multi-role, inactive staff and exact coach class ownership', () => {
    const state = createInitialDemoState();
    expect(state.staffAccounts.map((staff) => staff.assignedRoles)).toEqual(
      expect.arrayContaining([
        ['admin'],
        ['frontDesk'],
        ['coach'],
        ['frontDesk', 'coach'],
      ]),
    );
    expect(state.staffAccounts.some((staff) => !staff.active)).toBe(true);
    for (const staff of state.staffAccounts) {
      expect(new Set(staff.assignedRoles).size).toBe(
        staff.assignedRoles.length,
      );
      expect(staff.assignedClassIds.slice().sort()).toEqual(
        state.classes
          .filter((item) => item.coachId === staff.staffId)
          .map((item) => item.classId)
          .sort(),
      );
      if (staff.assignedRoles.includes('coach'))
        expect(staff.coachProfile).toBeDefined();
    }
    for (const item of state.classes) {
      if (item.coachId) {
        const coach = state.staffAccounts.find(
          (staff) => staff.staffId === item.coachId,
        );
        expect(coach?.active).toBe(true);
        expect(coach?.assignedRoles).toContain('coach');
        expect(coach?.assignedClassIds).toContain(item.classId);
      }
    }
    const actor: DemoActor = { kind: 'staff', staffId: ids.staff.coach };
    expect(
      requireCapability(state, actor, 'manageAttendance', {
        classId: ids.classes.checkIn,
      }).success,
    ).toBe(true);
    expect(
      requireCapability(state, actor, 'manageAttendance', {
        classId: ids.classes.full,
      }),
    ).toMatchObject({
      success: false,
      error: { reason: 'classScopeDenied' },
    });
    expect(
      requireCapability(
        state,
        { kind: 'staff', staffId: ids.staff.inactive },
        'viewSchedule',
      ),
    ).toMatchObject({
      success: false,
      error: { reason: 'inactiveStaff' },
    });
  });

  it('resolves all local schedules to exact UTC instants without overlaps and snapshots class types independently', () => {
    const state = createInitialDemoState();
    expect(new Set(state.classes.map((item) => item.status))).toEqual(
      new Set(['draft', 'published', 'cancelled', 'completed']),
    );
    expect(
      state.classes.some(
        (item) => item.status === 'published' && !item.coachId,
      ),
    ).toBe(true);
    expect(
      new Set(state.classTypes.map((item) => item.durationMinutes)),
    ).toEqual(new Set([30, 45, 60]));
    for (const item of state.classes) {
      const local = DateTime.fromISO(
        `${item.schedule.date}T${item.schedule.time}`,
        { zone: DEMO_TIMEZONE },
      );
      expect(item.schedule.timezone).toBe(DEMO_TIMEZONE);
      expect(local.toUTC().toISO({ suppressMilliseconds: true })).toBe(
        item.startsAt,
      );
      expect(Date.parse(item.endsAt) - Date.parse(item.startsAt)).toBe(
        item.classTypeSnapshot.durationMinutes * 60_000,
      );
      const type = state.classTypes.find(
        (candidate) =>
          candidate.classTypeId === item.classTypeSnapshot.classTypeId,
      );
      expect(type).toEqual(item.classTypeSnapshot);
      expect(type).not.toBe(item.classTypeSnapshot);
      if (item.status === 'completed') {
        expect(item.endsAt <= state.clock.now).toBe(true);
        expect(item.completedAt).toBe(item.endsAt);
      } else if (item.status !== 'cancelled')
        expect(item.endsAt > state.clock.now).toBe(true);
      if (item.status !== 'draft') expect(item.publishedAt).toBeDefined();
      if (item.status === 'cancelled') {
        expect(item.cancelledAt).toBeDefined();
        expect(item.cancellationReason).toMatch(/fictional/i);
      }
    }
    const nonCancelled = state.classes
      .filter((item) => item.status !== 'cancelled')
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    for (let index = 1; index < nonCancelled.length; index += 1) {
      expect(
        nonCancelled[index - 1].endsAt <= nonCancelled[index].startsAt,
      ).toBe(true);
    }
    expect(state.settings.scheduleRelease).toEqual({ mode: 'immediate' });
    const immediate = value(
      selectReleasedClasses(
        state.classes,
        state.settings.scheduleRelease,
        state.clock.now,
      ),
    );
    expect(
      immediate.some((item) => item.classId === ids.classes.laterRelease),
    ).toBe(true);
    const manual = value(
      selectReleasedClasses(state.classes, { mode: 'manual' }, state.clock.now),
    );
    expect(manual.some((item) => item.classId === ids.classes.full)).toBe(true);
    expect(
      manual.some((item) => item.classId === ids.classes.laterRelease),
    ).toBe(false);
    expect(
      value(
        selectReleasedClasses(
          state.classes,
          { mode: 'rolling', advanceMinutes: 1440 },
          state.clock.now,
        ),
      ).some((item) => item.classId === ids.classes.laterRelease),
    ).toBe(false);
  });

  it('provides linked alternating templates that expand to drafts and skip exact baseline duplicates', () => {
    const state = createInitialDemoState();
    expect(state.weeklyTemplates.length).toBe(2);
    for (const template of state.weeklyTemplates) {
      for (const entry of template.entries) {
        expect(
          state.classTypes.some(
            (type) => type.classTypeId === entry.classTypeId,
          ),
        ).toBe(true);
        if (entry.coachId)
          expect(
            state.staffAccounts.find((staff) => staff.staffId === entry.coachId)
              ?.assignedRoles,
          ).toContain('coach');
      }
      const applied = value(
        applyWeeklyTemplate({
          template,
          weekStartsOn: '2026-10-19',
          timezone: DEMO_TIMEZONE,
          classTypes: state.classTypes,
          classes: state.classes,
          targetGapMinutes: state.settings.targetGapMinutes,
        }),
      );
      expect(applied.classes).toHaveLength(template.entries.length);
      expect(applied.classes.every((item) => item.status === 'draft')).toBe(
        true,
      );
    }
    const baseline = value(
      applyWeeklyTemplate({
        template: state.weeklyTemplates.find(
          (item) => item.templateId === ids.templates.weekA,
        )!,
        weekStartsOn: '2026-10-05',
        timezone: DEMO_TIMEZONE,
        classTypes: state.classTypes,
        classes: state.classes,
        targetGapMinutes: state.settings.targetGapMinutes,
      }),
    );
    expect(baseline.skippedDuplicates).toContain(ids.classes.checkIn);
  });

  it('links canonical booking attendance and retains cancellation, staff-removal, promotion and correction history', () => {
    const state = createInitialDemoState();
    for (const booking of state.bookings) {
      expect(
        state.members.some((member) => member.memberId === booking.memberId),
      ).toBe(true);
      const item = state.classes.find(
        (item) => item.classId === booking.classId,
      )!;
      expect(item.status).not.toBe('draft');
      expect(
        state.stations.some(
          (station) => station.stationId === booking.stationId,
        ),
      ).toBe(true);
      const attendance = state.attendance.find(
        (record) => record.attendanceId === booking.attendanceRecordId,
      );
      expect(attendance).toMatchObject({
        bookingId: booking.bookingId,
        memberId: booking.memberId,
        classId: booking.classId,
      });

      if (item.status === 'cancelled') expect(booking.status).toBe('cancelled');
      if (booking.status === 'cancelled')
        expect(['cancelled', 'lateCancel']).toContain(
          attendance?.currentOutcome,
        );
      if (booking.status === 'staffRemoved') {
        expect(attendance?.currentOutcome).toBe('staffRemoved');
        expect(
          state.staffAccounts.some(
            (staff) => staff.staffId === booking.removedBy,
          ),
        ).toBe(true);
      }
      if (item.status === 'completed')
        expect(attendance?.currentOutcome).not.toBe('booked');
      if (booking.promotedFromEntryId) {
        expect(
          state.waitlistEntries.find(
            (entry) => entry.entryId === booking.promotedFromEntryId,
          ),
        ).toMatchObject({
          status: 'promoted',
          bookingId: booking.bookingId,
          classId: booking.classId,
          memberId: booking.memberId,
        });
      }
    }
    for (const record of state.attendance) {
      expect(
        state.classes.some((item) => item.classId === record.classId),
      ).toBe(true);
      expect(
        state.members.some((member) => member.memberId === record.memberId),
      ).toBe(true);
      if (record.bookingId)
        expect(
          state.bookings.find(
            (booking) => booking.bookingId === record.bookingId,
          )?.attendanceRecordId,
        ).toBe(record.attendanceId);
      if (record.checkIn.status === 'checkedIn')
        expect(record.currentOutcome).toBe('attended');
      for (const correction of record.corrections) {
        expect(
          state.staffAccounts.some(
            (staff) => staff.staffId === correction.staffId,
          ),
        ).toBe(true);
        expect(correction.recordedAt <= state.clock.now).toBe(true);
      }
      if (record.corrections.length)
        expect(record.currentOutcome).toBe(
          record.corrections.at(-1)?.newOutcome,
        );
    }
    expect(
      new Set(state.attendance.map((item) => item.currentOutcome)),
    ).toEqual(
      new Set([
        'booked',
        'attended',
        'cancelled',
        'lateCancel',
        'noShow',
        'staffRemoved',
      ]),
    );
    expect(
      state.attendance.find(
        (item) => item.attendanceId === ids.attendance.historyCorrected,
      ),
    ).toMatchObject({
      currentOutcome: 'attended',
      checkIn: { status: 'notCheckedIn' },
      corrections: [{ previousOutcome: 'noShow', newOutcome: 'attended' }],
    });
    const live = state.bookings.filter(
      (booking) => booking.status === 'booked',
    );
    expect(
      new Set(live.map((booking) => `${booking.classId}/${booking.stationId}`))
        .size,
    ).toBe(live.length);
    expect(
      new Set(live.map((booking) => `${booking.classId}/${booking.memberId}`))
        .size,
    ).toBe(live.length);
  });

  it('provides all four station overlay states, free/full classes and explicit retained outage/inactive flags', () => {
    const state = createInitialDemoState();
    expect(value(validateClassCapacity(state))).toBe(3);
    expect(
      new Set(
        state.stations.map((station) => `${station.row}/${station.column}`),
      ).size,
    ).toBe(state.stations.length);
    expect(state.stations.some((station) => station.pm5Serial === null)).toBe(
      true,
    );
    const layout = selectClassLayout(state, ids.classes.checkIn);
    expect(layout.status).toBe('available');
    if (layout.status !== 'available')
      throw new Error('Fixture layout must load.');
    expect(new Set(layout.stations.map((station) => station.state))).toEqual(
      new Set([
        'available',
        'bookedNotCheckedIn',
        'bookedCheckedIn',
        'outOfService',
      ]),
    );
    expect(
      layout.stations.every((station) => station.stateLabel.length > 0),
    ).toBe(true);
    expect(
      state.bookings.find(
        (booking) => booking.bookingId === ids.bookings.outage,
      ),
    ).toMatchObject({
      status: 'booked',
      memberId: ids.members.moss,
      stationId: ids.stations.outage,
      reviewFlags: ['memberInactive', 'stationOutOfService'],
    });
    for (const booking of state.bookings.filter(
      (booking) => booking.status === 'booked',
    )) {
      const member = state.members.find(
        (item) => item.memberId === booking.memberId,
      )!;
      const station = state.stations.find(
        (item) => item.stationId === booking.stationId,
      )!;
      expect(booking.reviewFlags.includes('memberInactive')).toBe(
        member.status !== 'active',
      );
      expect(booking.reviewFlags.includes('stationOutOfService')).toBe(
        !station.inService,
      );
    }
    const full = selectClassLayout(state, ids.classes.full);
    expect(
      full.status === 'available' &&
        full.stations.filter((station) => station.state === 'available'),
    ).toEqual([]);
    const free = selectClassLayout(state, ids.classes.free);
    expect(
      free.status === 'available' &&
        free.stations.filter((station) => station.state === 'available').length,
    ).toBe(2);
  });

  it('links queues and flags, preserves FIFO order, and promotes the first currently eligible waiter', () => {
    const state = createInitialDemoState();
    for (const entry of state.waitlistEntries) {
      expect(state.classes.some((item) => item.classId === entry.classId)).toBe(
        true,
      );
      expect(
        state.members.some((item) => item.memberId === entry.memberId),
      ).toBe(true);
      if (entry.status === 'promoted')
        expect(
          state.bookings.find(
            (booking) => booking.bookingId === entry.bookingId,
          ),
        ).toMatchObject({
          memberId: entry.memberId,
          classId: entry.classId,
          promotedFromEntryId: entry.entryId,
        });
      if (entry.status === 'cancelled')
        expect(
          state.classes.find((item) => item.classId === entry.classId)?.status,
        ).toBe('cancelled');
    }
    const waiting = state.waitlistEntries.filter(
      (entry) =>
        entry.classId === ids.classes.full && entry.status === 'waiting',
    );
    expect(waiting.map((entry) => entry.memberId)).toEqual([
      ids.members.moss,
      ids.members.aspen,
      ids.members.willow,
    ]);
    expect(waiting[0].reviewFlags).toEqual(['memberInactive']);
    expect(waiting[1].reviewFlags).toEqual(['waiverOutdated']);
    expect(waiting[2].reviewFlags).toEqual([]);
    expect(new Set(waiting.map((entry) => entry.joinOrder)).size).toBe(
      waiting.length,
    );
    const patch = value(
      cancelBooking(
        state,
        memberActor(ids.members.maple),
        ids.bookings.fullMaple,
        state.clock.now,
      ),
    );
    expect(
      patch.bookings?.some(
        (booking) =>
          booking.memberId === ids.members.willow &&
          booking.classId === ids.classes.full &&
          booking.status === 'booked',
      ),
    ).toBe(true);
    expect(
      patch.waitlistEntries?.find(
        (entry) => entry.entryId === ids.waitlist.willow,
      )?.status,
    ).toBe('promoted');
    expect(
      patch.waitlistEntries
        ?.filter((entry) => entry.status === 'waiting')
        .map((entry) => entry.memberId),
    ).toEqual([ids.members.moss, ids.members.aspen]);
    expect(createInitialDemoState()).toEqual(state);
  });

  it('retains enough reservation history to explain full-class joins and never double-assigns a station over time', () => {
    const state = createInitialDemoState();
    const endOfReservation = (booking: DemoState['bookings'][number]) =>
      booking.status === 'cancelled'
        ? booking.cancelledAt
        : booking.status === 'staffRemoved'
          ? booking.removedAt
          : state.classes.find((item) => item.classId === booking.classId)!
              .endsAt;
    for (const first of state.bookings) {
      expect(first.bookedAt < endOfReservation(first)).toBe(true);
      for (const second of state.bookings) {
        if (
          first.bookingId === second.bookingId ||
          first.classId !== second.classId ||
          (first.stationId !== second.stationId &&
            first.memberId !== second.memberId)
        )
          continue;
        expect(
          first.bookedAt < endOfReservation(second) &&
            second.bookedAt < endOfReservation(first),
        ).toBe(false);
      }
    }
    for (const entry of state.waitlistEntries) {
      const inService = state.stations.filter((station) => station.inService);
      const occupied = state.bookings.filter(
        (booking) =>
          booking.classId === entry.classId &&
          booking.bookedAt <= entry.joinedAt &&
          entry.joinedAt < endOfReservation(booking) &&
          inService.some((station) => station.stationId === booking.stationId),
      );
      expect(occupied).toHaveLength(inService.length);
      expect(
        occupied.some((booking) => booking.memberId === entry.memberId),
      ).toBe(false);
      expect(
        state.members.find((member) => member.memberId === entry.memberId)!
          .createdAt <= entry.joinedAt,
      ).toBe(true);
    }
  });

  it('supports meaningful booking, queue and check-in tests without inventing missing prerequisite records', () => {
    const state = createInitialDemoState();
    freezeGraph(state);
    const actor = memberActor(ids.members.juniper);
    expect(
      bookStation(
        state,
        actor,
        ids.members.juniper,
        ids.classes.free,
        ids.stations.west,
        'booking:test-free',
        state.clock.now,
      ).success,
    ).toBe(true);
    expect(
      bookStation(
        state,
        actor,
        ids.members.juniper,
        ids.classes.full,
        ids.stations.north,
        'booking:test-conflict',
        state.clock.now,
      ),
    ).toMatchObject({ success: false, error: { category: 'DemoConflict' } });
    expect(
      joinWaitlist(
        state,
        actor,
        ids.members.juniper,
        ids.classes.full,
        'waitlist:test-rejoin',
        state.clock.now,
      ).success,
    ).toBe(true);
    expect(
      checkIn(
        state,
        memberActor(ids.members.cedar),
        ids.bookings.checkInCedar,
        state.clock.now,
      ).success,
    ).toBe(true);
    expect(
      checkIn(
        state,
        memberActor(ids.members.moss),
        ids.bookings.outage,
        state.clock.now,
      ),
    ).toMatchObject({ success: false, error: { reason: 'memberInactive' } });
    expect(
      bookStation(
        state,
        memberActor(ids.members.aspen),
        ids.members.aspen,
        ids.classes.checkIn,
        ids.stations.east,
        'booking:test-old',
        state.clock.now,
      ),
    ).toMatchObject({ success: false, error: { reason: 'waiverOutdated' } });
    expect(
      bookStation(
        state,
        memberActor(ids.members.fern),
        ids.members.fern,
        ids.classes.free,
        ids.stations.west,
        'booking:test-pending',
        state.clock.now,
      ),
    ).toMatchObject({ success: false, error: { reason: 'memberInactive' } });
  });

  it('supports invitation acceptance both below and at the active-member cap using one coherent baseline', () => {
    const state = createInitialDemoState();
    expect(countActiveMembers(state)).toBeLessThan(state.settings.memberCap);
    const invitation = state.invitations.find(
      (item) => item.invitationId === ids.invitations.outstanding,
    )!;
    const input: InvitationAcceptanceInput = {
      invitationId: invitation.invitationId,
      memberId: 'member:test-invitee',
      signatureId: 'signature:test-invitee',
      displayName: 'Fictional Invitee',
      adultAttested: true,
      identity: {
        outcome: 'verified',
        subject: 'identity:test-invitee',
        verifiedEmail: invitation.email,
      },
      waiver: {
        waiverVersionId: ids.waivers.current,
        typedName: 'Fictional Invitee',
      },
    };
    const actor: DemoActor = {
      kind: 'invitation',
      invitationId: invitation.invitationId,
    };
    const active = value(
      validateMembershipAction(
        state,
        actor,
        { type: 'acceptInvitation', payload: input },
        state.clock.now,
      ),
    ).changes;
    expect(
      active.members?.find((member) => member.memberId === input.memberId)
        ?.status,
    ).toBe('active');
    const atCap: DemoState = {
      ...state,
      settings: { ...state.settings, memberCap: countActiveMembers(state) },
    };
    const pending = value(
      validateMembershipAction(
        atCap,
        actor,
        { type: 'acceptInvitation', payload: input },
        state.clock.now,
      ),
    ).changes;
    expect(
      pending.members?.find((member) => member.memberId === input.memberId)
        ?.status,
    ).toBe('pending');
    expect(createInitialDemoState()).toEqual(state);
  });

  it('supports exact-end no-show transitions without overwriting past corrections', () => {
    const state = createInitialDemoState();
    const end = createDemoClockPresets().find(
      (preset) => preset.presetId === ids.clockPresets.classEnd,
    )!;
    const patch = value(advanceAttendanceClock(state, end.instant));
    expect(
      patch.classes?.find((item) => item.classId === ids.classes.checkIn)
        ?.status,
    ).toBe('completed');
    expect(
      patch.attendance?.find(
        (item) => item.attendanceId === ids.attendance.checkInCedar,
      )?.currentOutcome,
    ).toBe('noShow');
    expect(
      patch.attendance?.find(
        (item) => item.attendanceId === ids.attendance.checkInMaple,
      )?.currentOutcome,
    ).toBe('attended');
    expect(
      patch.attendance?.find(
        (item) => item.attendanceId === ids.attendance.historyCorrected,
      ),
    ).toEqual(
      state.attendance.find(
        (item) => item.attendanceId === ids.attendance.historyCorrected,
      ),
    );
  });

  it('links every simulated notification to its true owner, event and deterministic attempt history', () => {
    const state = createInitialDemoState();
    expect(
      new Set(state.notifications.map((record) => record.event.type)),
    ).toEqual(
      new Set([
        'invitation',
        'bookingConfirmed',
        'waitlistPromoted',
        'classCancelled',
        'classChanged',
      ]),
    );
    expect(new Set(state.notifications.map((record) => record.status))).toEqual(
      new Set(['sent', 'failed']),
    );
    const attemptIds = state.notifications.flatMap((record) =>
      record.attempts.map((attempt) => attempt.attemptId),
    );
    expect(new Set(attemptIds).size).toBe(attemptIds.length);
    for (const record of state.notifications) {
      expect(record.simulated).toBe(true);
      expect(record.status).toBe(record.attempts.at(-1)?.status);
      expect(record.attempts.length).toBeGreaterThan(0);
      const event = record.event;
      if (event.type === 'invitation') {
        expect(record.recipient).toEqual({
          kind: 'invitee',
          email: state.invitations.find(
            (item) => item.invitationId === event.invitationId,
          )?.email,
        });
      } else {
        expect(
          state.classes.some((item) => item.classId === event.classId),
        ).toBe(true);
        expect(record.recipient.kind).toBe('member');
        if (record.recipient.kind !== 'member')
          throw new Error('Member event requires member recipient.');
        const memberId = record.recipient.memberId;
        expect(
          state.members.find((item) => item.memberId === memberId)
            ?.verifiedEmail,
        ).toBe(record.recipient.email);
        if (
          event.type === 'bookingConfirmed' ||
          event.type === 'waitlistPromoted'
        ) {
          expect(
            state.bookings.find((item) => item.bookingId === event.bookingId),
          ).toMatchObject({ classId: event.classId, memberId });
        }
        if (event.type === 'waitlistPromoted')
          expect(
            state.waitlistEntries.find(
              (entry) => entry.entryId === event.entryId,
            ),
          ).toMatchObject({
            status: 'promoted',
            bookingId: event.bookingId,
            classId: event.classId,
            memberId,
          });
        if (event.type === 'classCancelled')
          expect(
            state.classes.find((item) => item.classId === event.classId)
              ?.status,
          ).toBe('cancelled');
        if (event.type === 'classChanged' || event.type === 'classCancelled') {
          expect(
            state.bookings.some(
              (booking) =>
                booking.classId === event.classId &&
                booking.memberId === memberId,
            ) ||
              state.waitlistEntries.some(
                (entry) =>
                  entry.classId === event.classId &&
                  entry.memberId === memberId,
              ),
          ).toBe(true);
        }
      }
      for (const attempt of record.attempts) {
        expect(attempt.attemptedAt <= state.clock.now).toBe(true);
        expect(attempt.scenario).toBe(
          attempt.status === 'sent' ? 'success' : 'failure',
        );
        if (attempt.resentBy)
          expect(
            state.staffAccounts.some(
              (staff) => staff.staffId === attempt.resentBy,
            ),
          ).toBe(true);
        if (attempt.status === 'failed')
          expect(attempt.error).toMatchObject({
            category: 'SimulatedDeliveryFailure',
            scenario: 'failure',
            notificationId: record.notificationId,
          });
      }
    }
  });

  it('supports failed-notification resend and privacy-safe coach views with linked past class history', () => {
    const state = createInitialDemoState();
    freezeGraph(state);
    const resent = value(
      resendNotification(
        state,
        state.activeActor,
        ids.notifications.invitationFailed,
        'success',
        state.clock.now,
      ),
    );
    expect(
      resent.notifications?.find(
        (record) =>
          record.notificationId === ids.notifications.invitationFailed,
      ),
    ).toMatchObject({
      status: 'sent',
      attempts: [
        { status: 'failed' },
        { status: 'sent', resentBy: ids.staff.admin },
      ],
    });
    const memberView = value(
      selectCoachProfile(
        state,
        ids.staff.coach,
        memberActor(ids.members.juniper),
      ),
    );
    expect(JSON.stringify(memberView)).not.toContain(
      'coach-indigo@example.invalid',
    );
    expect(
      JSON.stringify(
        value(selectCoachProfile(state, ids.staff.coach, state.activeActor)),
      ),
    ).toContain('coach-indigo@example.invalid');
    expect(
      value(
        selectCoachClassHistory(
          state,
          ids.staff.coach,
          memberActor(ids.members.juniper),
        ),
      ).map((item) => item.classId),
    ).toContain(ids.classes.history);
    expect(createInitialDemoState()).toEqual(state);
  });

  it('keeps template wall-clock times stable across the illustrative Los Angeles daylight-saving change', () => {
    const state = createInitialDemoState();
    const template = state.weeklyTemplates.find(
      (item) => item.templateId === ids.templates.weekA,
    )!;
    const expand = (weekStartsOn: '2026-10-26' | '2026-11-02') =>
      value(
        applyWeeklyTemplate({
          template,
          weekStartsOn,
          timezone: DEMO_TIMEZONE,
          classTypes: state.classTypes,
          classes: state.classes,
          targetGapMinutes: state.settings.targetGapMinutes,
        }),
      ).classes;
    const before = expand('2026-10-26');
    const after = expand('2026-11-02');
    expect(before[0].schedule.time).toBe('09:00');
    expect(after[0].schedule.time).toBe('09:00');
    expect(before[0].startsAt).toBe('2026-10-26T16:00:00Z');
    expect(after[0].startsAt).toBe('2026-11-02T17:00:00Z');
  });

  it('contains reserved fictional emails, local avatar identifiers and non-legal demonstration waiver text only', () => {
    const state = createInitialDemoState();
    for (const member of state.members) {
      expect(member.displayName).toMatch(/^Fictional /);
      expect(member.verifiedEmail).toMatch(/@example\.invalid$/);
    }
    for (const invitation of state.invitations)
      expect(invitation.email).toMatch(/@example\.invalid$/);
    for (const staff of state.staffAccounts) {
      if (staff.coachProfile) {
        expect(staff.coachProfile.displayName).toMatch(/^Fictional /);
        expect(staff.coachProfile.contact.email).toMatch(/@example\.invalid$/);
        expect(staff.coachProfile.avatarId).toMatch(/^avatar:fictional-/);
        expect(staff.coachProfile.contact.phone).toBeUndefined();
      }
    }
    for (const waiver of state.waivers) {
      expect(waiver.text).toMatch(/demonstration only/i);
      expect(waiver.text).toMatch(/not.*legal/i);
    }
    expect(JSON.stringify(state)).not.toMatch(
      /https?:\/\/|password|accessToken|refreshToken/,
    );
  });
});
