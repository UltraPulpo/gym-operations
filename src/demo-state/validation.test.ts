import { describe, expect, it } from 'vitest';
import type {
  ActionOf,
  DemoAction,
  DemoActionType,
  DemoState,
  DomainError,
} from '../domain';
import { FIXTURE_IDS as ids, createInitialDemoState } from '../demo-fixtures';
import { validateAction } from './validation';
import { demoReducer } from './reducer';
import { expectSuccess } from './test-helpers';
import { getWaiverCompliance } from '../domain';
import { createDemoStore } from './store';

interface RoutedCase<Type extends DemoActionType> {
  readonly action: (state: DemoState) => ActionOf<Type>;
  readonly setup?: (state: DemoState) => DemoState;
}

const routeCases = {
  createStaffAccount: {
    action: () => ({
      type: 'createStaffAccount',
      payload: {
        staff: {
          staffId: 'staff:validation-created',
          identitySubject: 'identity:validation-created',
          active: true,
          assignedRoles: ['frontDesk'],
          assignedClassIds: [],
        },
      },
    }),
  },
  updateStaffAccount: {
    action: () => ({
      type: 'updateStaffAccount',
      payload: { staffId: ids.staff.frontDesk, updates: { active: false } },
    }),
  },
  deactivateStaffAccount: {
    action: () => ({
      type: 'deactivateStaffAccount',
      payload: { staffId: ids.staff.frontDesk },
    }),
  },
  createInvitation: {
    action: () => ({
      type: 'createInvitation',
      payload: {
        invitationId: 'invitation:validation-new',
        email: 'validation.new@example.invalid',
      },
    }),
  },
  resendInvitation: {
    action: () => ({
      type: 'resendInvitation',
      payload: {
        invitationId: ids.invitations.outstanding,
        replacementId: 'invitation:validation-replacement',
      },
    }),
  },
  revokeInvitation: {
    action: () => ({
      type: 'revokeInvitation',
      payload: { invitationId: ids.invitations.outstanding },
    }),
  },
  expireInvitations: {
    setup: (state) => ({
      ...state,
      invitations: state.invitations.map((invitation) =>
        invitation.invitationId === ids.invitations.outstanding
          ? { ...invitation, expiresAt: state.clock.now }
          : invitation,
      ),
    }),
    action: () => ({ type: 'expireInvitations', payload: {} }),
  },
  acceptInvitation: {
    setup: (state) => ({
      ...state,
      activeActor: {
        kind: 'invitation',
        invitationId: ids.invitations.outstanding,
      },
    }),
    action: () => ({
      type: 'acceptInvitation',
      payload: {
        invitationId: ids.invitations.outstanding,
        memberId: 'member:validation-new',
        signatureId: 'signature:validation-new',
        displayName: 'Fictional Validation New',
        adultAttested: true,
        identity: {
          outcome: 'verified',
          subject: 'identity:validation-new',
          verifiedEmail: 'invitee@example.invalid',
        },
        waiver: {
          waiverVersionId: ids.waivers.current,
          typedName: 'Fictional Validation New',
        },
      },
    }),
  },
  updateMemberProfile: {
    action: () => ({
      type: 'updateMemberProfile',
      payload: {
        memberId: ids.members.maple,
        updates: { displayName: 'Fictional Updated Maple' },
      },
    }),
  },
  setMemberStatus: {
    action: () => ({
      type: 'setMemberStatus',
      payload: { memberId: ids.members.maple, status: 'inactive' },
    }),
  },
  createWaiverVersion: {
    action: () => ({
      type: 'createWaiverVersion',
      payload: {
        waiver: {
          waiverVersionId: 'waiver:validation-draft',
          version: 4,
          status: 'draft',
          text: 'Demonstration only: fictional validation waiver marker.',
          createdAt: '2026-10-05T15:44:00Z',
        },
      },
    }),
  },
  publishWaiver: {
    action: () => ({
      type: 'publishWaiver',
      payload: { waiverVersionId: ids.waivers.draft },
    }),
  },
  signWaiver: {
    setup: (state) => ({
      ...state,
      activeActor: { kind: 'member', memberId: ids.members.aspen },
    }),
    action: () => ({
      type: 'signWaiver',
      payload: {
        memberId: ids.members.aspen,
        signatureId: 'signature:validation-aspen-current',
        waiverVersionId: ids.waivers.current,
        typedName: 'Fictional Aspen',
      },
    }),
  },
  createStation: {
    action: () => ({
      type: 'createStation',
      payload: {
        station: {
          stationId: 'station:validation-south',
          label: 'Demo South',
          pm5Serial: 'DEMO-PM5-SOUTH',
          inService: true,
          row: 2,
          column: 1,
        },
      },
    }),
  },
  updateStation: {
    action: () => ({
      type: 'updateStation',
      payload: {
        stationId: ids.stations.north,
        updates: { label: 'Demo North Updated' },
      },
    }),
  },
  placeStation: {
    action: () => ({
      type: 'placeStation',
      payload: { stationId: ids.stations.north, row: 2, column: 2 },
    }),
  },
  setLayoutOrientation: {
    action: () => ({
      type: 'setLayoutOrientation',
      payload: { orientationLabel: 'Demo entrance on the left' },
    }),
  },
  createClassType: {
    action: () => ({
      type: 'createClassType',
      payload: {
        classType: {
          classTypeId: 'classType:validation-strength',
          name: 'Demo Strength',
          durationMinutes: 45,
          description: 'Fictional strength class.',
          difficulty: 'Illustrative intermediate',
        },
      },
    }),
  },
  updateClassType: {
    action: () => ({
      type: 'updateClassType',
      payload: {
        classTypeId: ids.classTypes.sprint,
        updates: { name: 'Demo Sprint Updated' },
      },
    }),
  },
  createWeeklyTemplate: {
    action: () => ({
      type: 'createWeeklyTemplate',
      payload: {
        template: {
          templateId: 'template:validation-week',
          name: 'Validation Week',
          entries: [
            {
              entryId: 'templateEntry:validation-week-monday',
              weekday: 1,
              localTime: '11:00',
              classTypeId: ids.classTypes.sprint,
            },
          ],
        },
      },
    }),
  },
  updateWeeklyTemplate: {
    action: () => ({
      type: 'updateWeeklyTemplate',
      payload: {
        templateId: ids.templates.weekA,
        updates: { name: 'Illustrative Week A Updated' },
      },
    }),
  },
  deleteWeeklyTemplate: {
    action: () => ({
      type: 'deleteWeeklyTemplate',
      payload: { templateId: ids.templates.weekB },
    }),
  },
  applyWeeklyTemplate: {
    action: () => ({
      type: 'applyWeeklyTemplate',
      payload: { templateId: ids.templates.weekA, weekStartsOn: '2026-10-19' },
    }),
  },
  createDraftClass: {
    action: () => ({
      type: 'createDraftClass',
      payload: {
        classId: 'class:validation-draft',
        classTypeId: ids.classTypes.sprint,
        schedule: {
          date: '2026-10-12',
          time: '11:00',
          timezone: 'America/Los_Angeles',
        },
      },
    }),
  },
  editScheduledClass: {
    action: () => ({
      type: 'editScheduledClass',
      payload: {
        classId: ids.classes.draft,
        updates: { coachId: ids.staff.coach },
      },
    }),
  },
  deleteDraftClass: {
    action: () => ({
      type: 'deleteDraftClass',
      payload: { classId: ids.classes.draft },
    }),
  },
  publishClasses: {
    action: () => ({
      type: 'publishClasses',
      payload: { classIds: [ids.classes.draft] },
    }),
  },
  releaseClasses: {
    action: () => ({
      type: 'releaseClasses',
      payload: { classIds: [ids.classes.laterRelease] },
    }),
  },
  cancelClass: {
    action: () => ({
      type: 'cancelClass',
      payload: {
        classId: ids.classes.full,
        reason: 'Fictional validation cancellation',
      },
    }),
  },
  bookStation: {
    setup: (state) => ({
      ...state,
      activeActor: { kind: 'member', memberId: ids.members.willow },
    }),
    action: () => ({
      type: 'bookStation',
      payload: {
        memberId: ids.members.willow,
        classId: ids.classes.free,
        stationId: ids.stations.east,
      },
    }),
  },
  cancelBooking: {
    setup: (state) => ({
      ...state,
      activeActor: { kind: 'member', memberId: ids.members.maple },
    }),
    action: () => ({
      type: 'cancelBooking',
      payload: { bookingId: ids.bookings.fullMaple },
    }),
  },
  removeBooking: {
    action: () => ({
      type: 'removeBooking',
      payload: {
        bookingId: ids.bookings.fullMaple,
        reason: 'Fictional validation removal',
      },
    }),
  },
  moveBooking: {
    action: () => ({
      type: 'moveBooking',
      payload: {
        bookingId: ids.bookings.checkInMaple,
        destinationStationId: ids.stations.east,
        confirmed: true,
      },
    }),
  },
  swapBookings: {
    action: () => ({
      type: 'swapBookings',
      payload: {
        bookingId: ids.bookings.fullMaple,
        otherBookingId: ids.bookings.fullCedar,
        confirmed: true,
      },
    }),
  },
  joinWaitlist: {
    setup: (state) => ({
      ...state,
      activeActor: { kind: 'member', memberId: ids.members.juniper },
    }),
    action: () => ({
      type: 'joinWaitlist',
      payload: { memberId: ids.members.juniper, classId: ids.classes.full },
    }),
  },
  leaveWaitlist: {
    setup: (state) => ({
      ...state,
      activeActor: { kind: 'member', memberId: ids.members.willow },
    }),
    action: () => ({
      type: 'leaveWaitlist',
      payload: { entryId: ids.waitlist.willow },
    }),
  },
  promoteWaitlist: {
    setup: (state) => ({
      ...state,
      bookings: state.bookings.filter(
        (booking) => booking.bookingId !== ids.bookings.fullMaple,
      ),
      attendance: state.attendance.filter(
        (record) => record.bookingId !== ids.bookings.fullMaple,
      ),
    }),
    action: () => ({
      type: 'promoteWaitlist',
      payload: { classId: ids.classes.full, stationId: ids.stations.north },
    }),
  },
  checkIn: {
    setup: (state) => ({
      ...state,
      activeActor: { kind: 'member', memberId: ids.members.maple },
      attendance: state.attendance.map((record) =>
        record.attendanceId === ids.attendance.checkInMaple
          ? {
              ...record,
              currentOutcome: 'booked',
              checkIn: { status: 'notCheckedIn' },
            }
          : record,
      ),
    }),
    action: () => ({
      type: 'checkIn',
      payload: { bookingId: ids.bookings.checkInMaple },
    }),
  },
  reverseCheckIn: {
    action: () => ({
      type: 'reverseCheckIn',
      payload: {
        attendanceId: ids.attendance.checkInMaple,
        reason: 'Fictional validation reversal',
      },
    }),
  },
  correctAttendance: {
    action: () => ({
      type: 'correctAttendance',
      payload: {
        attendanceId: ids.attendance.historyNoShow,
        outcome: 'attended',
        reason: 'Fictional validation correction',
      },
    }),
  },
  recordManualAttendance: {
    setup: (state) => ({
      ...state,
      clock: { now: '2026-10-05T16:45:00Z', presetId: null },
    }),
    action: () => ({
      type: 'recordManualAttendance',
      payload: {
        classId: ids.classes.checkIn,
        memberId: ids.members.willow,
        outcome: 'attended',
        reason: 'Fictional outage attendance',
      },
    }),
  },
  resendNotification: {
    action: () => ({
      type: 'resendNotification',
      payload: {
        notificationId: ids.notifications.invitationFailed,
        scenario: 'success',
      },
    }),
  },
  updateOwnCoachProfile: {
    setup: (state) => ({
      ...state,
      activeActor: { kind: 'staff', staffId: ids.staff.coach },
    }),
    action: () => ({
      type: 'updateOwnCoachProfile',
      payload: {
        staffId: ids.staff.coach,
        updates: { biography: 'Fictional validation biography' },
      },
    }),
  },
  updateCoachProfile: {
    action: () => ({
      type: 'updateCoachProfile',
      payload: {
        staffId: ids.staff.coach,
        updates: { biography: 'Fictional validation biography' },
      },
    }),
  },
  updateSettings: {
    action: () => ({
      type: 'updateSettings',
      payload: { updates: { memberCap: 10 } },
    }),
  },
  selectActor: {
    action: () => ({
      type: 'selectActor',
      payload: { actor: { kind: 'member', memberId: ids.members.maple } },
    }),
  },
  setSimulation: {
    action: () => ({ type: 'setSimulation', payload: { delivery: 'failure' } }),
  },
  advanceClock: {
    action: () => ({
      type: 'advanceClock',
      payload: { to: '2026-10-05T16:45:00Z' },
    }),
  },
  setClockPreset: {
    action: () => ({
      type: 'setClockPreset',
      payload: { presetId: ids.clockPresets.classEnd },
    }),
  },
  resetDemo: {
    setup: (state) => ({
      ...state,
      simulation: { ...state.simulation, delivery: 'failure' },
    }),
    action: () => ({ type: 'resetDemo', payload: { confirmed: true } }),
  },
  loadScenario: {
    setup: (state) => ({
      ...state,
      simulation: { ...state.simulation, delivery: 'failure' },
    }),
    action: () => ({
      type: 'loadScenario',
      payload: { scenarioId: ids.scenarios.baseline, confirmed: true },
    }),
  },
  unsupportedOperation: {
    action: () => ({
      type: 'unsupportedOperation',
      payload: { operation: 'realEmail' },
    }),
  },
} satisfies { [Type in DemoActionType]: RoutedCase<Type> };

type RouteAssertion = (next: DemoState, before: DemoState) => void;
const routeAssertions = {
  createStaffAccount: (next) =>
    expect(
      next.staffAccounts.find(
        (staff) => staff.staffId === 'staff:validation-created',
      ),
    ).toMatchObject({ active: true, assignedRoles: ['frontDesk'] }),
  updateStaffAccount: (next) =>
    expect(
      next.staffAccounts.find((staff) => staff.staffId === ids.staff.frontDesk)
        ?.active,
    ).toBe(false),
  deactivateStaffAccount: (next) =>
    expect(
      next.staffAccounts.find((staff) => staff.staffId === ids.staff.frontDesk)
        ?.active,
    ).toBe(false),
  createInvitation: (next, before) => {
    expect(next.invitations).toHaveLength(before.invitations.length + 1);
    expect(next.invitations.at(-1)).toMatchObject({
      invitationId: 'invitation:validation-new',
      email: 'validation.new@example.invalid',
      status: 'outstanding',
      issuedAt: before.clock.now,
    });
    expect(next.notifications.at(-1)).toMatchObject({
      event: { type: 'invitation', invitationId: 'invitation:validation-new' },
    });
  },
  resendInvitation: (next, before) => {
    expect(
      next.invitations.find(
        (invitation) => invitation.invitationId === ids.invitations.outstanding,
      ),
    ).toMatchObject({
      status: 'superseded',
      replacementId: 'invitation:validation-replacement',
    });
    expect(next.invitations.at(-1)).toMatchObject({
      invitationId: 'invitation:validation-replacement',
      status: 'outstanding',
      issuedAt: before.clock.now,
    });
    expect(next.notifications).toHaveLength(before.notifications.length + 1);
  },
  revokeInvitation: (next, before) =>
    expect(
      next.invitations.find(
        (invitation) => invitation.invitationId === ids.invitations.outstanding,
      ),
    ).toMatchObject({ status: 'revoked', revokedAt: before.clock.now }),
  expireInvitations: (next, before) =>
    expect(
      next.invitations.find(
        (invitation) => invitation.invitationId === ids.invitations.outstanding,
      ),
    ).toMatchObject({ status: 'expired', expiredAt: before.clock.now }),
  acceptInvitation: (next, before) => {
    expect(next.members).toHaveLength(before.members.length + 1);
    expect(next.members.at(-1)).toMatchObject({
      memberId: 'member:validation-new',
      verifiedEmail: 'invitee@example.invalid',
      status: 'active',
    });
    expect(
      next.invitations.find(
        (invitation) => invitation.invitationId === ids.invitations.outstanding,
      ),
    ).toMatchObject({
      status: 'accepted',
      memberId: 'member:validation-new',
      acceptedAt: before.clock.now,
    });
    expect(next.waiverSignatures.at(-1)).toMatchObject({
      signatureId: 'signature:validation-new',
      signedAt: before.clock.now,
    });
  },
  updateMemberProfile: (next) =>
    expect(
      next.members.find((member) => member.memberId === ids.members.maple)
        ?.displayName,
    ).toBe('Fictional Updated Maple'),
  setMemberStatus: (next) => {
    expect(
      next.members.find((member) => member.memberId === ids.members.maple)
        ?.status,
    ).toBe('inactive');
    expect(
      next.bookings.find(
        (booking) => booking.bookingId === ids.bookings.fullMaple,
      )?.reviewFlags,
    ).toContain('memberInactive');
  },
  createWaiverVersion: (next) =>
    expect(next.waivers.at(-1)).toMatchObject({
      waiverVersionId: 'waiver:validation-draft',
      version: 4,
      status: 'draft',
    }),
  publishWaiver: (next, before) => {
    expect(next.currentWaiverVersionId).toBe(ids.waivers.draft);
    expect(
      next.waivers.find(
        (waiver) => waiver.waiverVersionId === ids.waivers.draft,
      ),
    ).toMatchObject({ status: 'published', publishedAt: before.clock.now });
    expect(next.waiverSignatures).toEqual(before.waiverSignatures);
    expect(getWaiverCompliance(next, ids.members.maple).status).toBe(
      'outdated',
    );
    expect(next.bookings).toEqual(before.bookings);
  },
  signWaiver: (next, before) => {
    expect(next.waiverSignatures.at(-1)).toMatchObject({
      signatureId: 'signature:validation-aspen-current',
      memberId: ids.members.aspen,
      waiverVersionId: ids.waivers.current,
      signedAt: before.clock.now,
    });
    expect(getWaiverCompliance(next, ids.members.aspen).status).toBe('current');
  },
  createStation: (next) =>
    expect(next.stations.at(-1)).toMatchObject({
      stationId: 'station:validation-south',
      row: 2,
      column: 1,
      inService: true,
    }),
  updateStation: (next) =>
    expect(
      next.stations.find((station) => station.stationId === ids.stations.north)
        ?.label,
    ).toBe('Demo North Updated'),
  placeStation: (next) =>
    expect(
      next.stations.find((station) => station.stationId === ids.stations.north),
    ).toMatchObject({ row: 2, column: 2 }),
  setLayoutOrientation: (next) =>
    expect(next.layout.orientationLabel).toBe('Demo entrance on the left'),
  createClassType: (next) =>
    expect(next.classTypes.at(-1)).toMatchObject({
      classTypeId: 'classType:validation-strength',
      name: 'Demo Strength',
      durationMinutes: 45,
    }),
  updateClassType: (next, before) => {
    expect(
      next.classTypes.find((type) => type.classTypeId === ids.classTypes.sprint)
        ?.name,
    ).toBe('Demo Sprint Updated');
    expect(next.classes).toEqual(before.classes);
  },
  createWeeklyTemplate: (next) =>
    expect(next.weeklyTemplates.at(-1)).toMatchObject({
      templateId: 'template:validation-week',
      name: 'Validation Week',
      entries: [{ weekday: 1, localTime: '11:00' }],
    }),
  updateWeeklyTemplate: (next) =>
    expect(
      next.weeklyTemplates.find(
        (template) => template.templateId === ids.templates.weekA,
      )?.name,
    ).toBe('Illustrative Week A Updated'),
  deleteWeeklyTemplate: (next) =>
    expect(
      next.weeklyTemplates.some(
        (template) => template.templateId === ids.templates.weekB,
      ),
    ).toBe(false),
  applyWeeklyTemplate: (next, before) => {
    const added = next.classes.slice(before.classes.length);
    expect(added).toHaveLength(
      before.weeklyTemplates.find(
        (template) => template.templateId === ids.templates.weekA,
      )!.entries.length,
    );
    expect(
      added.every(
        (item) =>
          item.status === 'draft' &&
          item.schedule.date >= '2026-10-19' &&
          item.schedule.date <= '2026-10-25',
      ),
    ).toBe(true);
  },
  createDraftClass: (next) =>
    expect(next.classes.at(-1)).toMatchObject({
      classId: 'class:validation-draft',
      status: 'draft',
      schedule: {
        date: '2026-10-12',
        time: '11:00',
        timezone: 'America/Los_Angeles',
      },
    }),
  editScheduledClass: (next) =>
    expect(
      next.classes.find((item) => item.classId === ids.classes.draft)?.coachId,
    ).toBe(ids.staff.coach),
  deleteDraftClass: (next) =>
    expect(
      next.classes.some((item) => item.classId === ids.classes.draft),
    ).toBe(false),
  publishClasses: (next, before) =>
    expect(
      next.classes.find((item) => item.classId === ids.classes.draft),
    ).toMatchObject({ status: 'published', publishedAt: before.clock.now }),
  releaseClasses: (next, before) =>
    expect(
      next.classes.find((item) => item.classId === ids.classes.laterRelease)
        ?.releasedAt,
    ).toBe(before.clock.now),
  cancelClass: (next, before) => {
    expect(
      next.classes.find((item) => item.classId === ids.classes.full),
    ).toMatchObject({ status: 'cancelled', cancelledAt: before.clock.now });
    expect(
      next.bookings
        .filter((booking) => booking.classId === ids.classes.full)
        .every((booking) => booking.status === 'cancelled'),
    ).toBe(true);
    expect(
      next.waitlistEntries.filter(
        (entry) =>
          entry.classId === ids.classes.full && entry.status === 'waiting',
      ),
    ).toEqual([]);
    expect(next.notifications.slice(before.notifications.length)).toHaveLength(
      6,
    );
  },
  bookStation: (next, before) => {
    const booking = next.bookings.at(-1)!;
    expect(booking).toMatchObject({
      memberId: ids.members.willow,
      classId: ids.classes.free,
      stationId: ids.stations.east,
      bookedAt: before.clock.now,
      status: 'booked',
    });
    expect(next.attendance.at(-1)).toMatchObject({
      bookingId: booking.bookingId,
      currentOutcome: 'booked',
    });
    expect(next.notifications.at(-1)).toMatchObject({
      event: { type: 'bookingConfirmed', bookingId: booking.bookingId },
    });
  },
  cancelBooking: (next, before) => {
    expect(
      next.bookings.find(
        (booking) => booking.bookingId === ids.bookings.fullMaple,
      ),
    ).toMatchObject({
      status: 'cancelled',
      cancelledAt: before.clock.now,
      cancellationReason: 'member',
    });
    expect(next.bookings.at(-1)).toMatchObject({
      memberId: ids.members.willow,
      promotedFromEntryId: ids.waitlist.willow,
    });
  },
  removeBooking: (next, before) =>
    expect(
      next.bookings.find(
        (booking) => booking.bookingId === ids.bookings.fullMaple,
      ),
    ).toMatchObject({ status: 'staffRemoved', removedAt: before.clock.now }),
  moveBooking: (next) =>
    expect(
      next.bookings.find(
        (booking) => booking.bookingId === ids.bookings.checkInMaple,
      )?.stationId,
    ).toBe(ids.stations.east),
  swapBookings: (next, before) => {
    expect(
      next.bookings.find(
        (booking) => booking.bookingId === ids.bookings.fullMaple,
      )?.stationId,
    ).toBe(ids.stations.west);
    expect(
      next.bookings.find(
        (booking) => booking.bookingId === ids.bookings.fullCedar,
      )?.stationId,
    ).toBe(ids.stations.north);
    expect(next.notifications).toEqual(before.notifications);
  },
  joinWaitlist: (next, before) =>
    expect(next.waitlistEntries.at(-1)).toMatchObject({
      memberId: ids.members.juniper,
      classId: ids.classes.full,
      status: 'waiting',
      joinedAt: before.clock.now,
    }),
  leaveWaitlist: (next, before) =>
    expect(
      next.waitlistEntries.find(
        (entry) => entry.entryId === ids.waitlist.willow,
      ),
    ).toMatchObject({ status: 'left', leftAt: before.clock.now }),
  promoteWaitlist: (next, before) => {
    expect(next.bookings).toHaveLength(before.bookings.length + 1);
    expect(next.bookings.at(-1)).toMatchObject({
      memberId: ids.members.willow,
      stationId: ids.stations.north,
      promotedFromEntryId: ids.waitlist.willow,
    });
    expect(
      next.waitlistEntries.find((entry) => entry.entryId === ids.waitlist.moss)
        ?.reviewFlags,
    ).toEqual(['memberInactive']);
    expect(
      next.waitlistEntries.find((entry) => entry.entryId === ids.waitlist.aspen)
        ?.reviewFlags,
    ).toEqual(['waiverOutdated']);
    expect(next.notifications.at(-1)?.event.type).toBe('waitlistPromoted');
  },
  checkIn: (next, before) =>
    expect(
      next.attendance.find(
        (record) => record.attendanceId === ids.attendance.checkInMaple,
      ),
    ).toMatchObject({
      currentOutcome: 'attended',
      checkIn: {
        status: 'checkedIn',
        checkedInAt: before.clock.now,
        checkedInBy: before.activeActor,
      },
    }),
  reverseCheckIn: (next) => {
    expect(
      next.attendance.find(
        (record) => record.attendanceId === ids.attendance.checkInMaple,
      ),
    ).toMatchObject({
      currentOutcome: 'booked',
      checkIn: { status: 'notCheckedIn' },
    });
    expect(
      next.attendance
        .find((record) => record.attendanceId === ids.attendance.checkInMaple)
        ?.corrections.at(-1)?.reason,
    ).toBe('Fictional validation reversal');
  },
  correctAttendance: (next) => {
    expect(
      next.attendance.find(
        (record) => record.attendanceId === ids.attendance.historyNoShow,
      )?.currentOutcome,
    ).toBe('attended');
    expect(
      next.attendance
        .find((record) => record.attendanceId === ids.attendance.historyNoShow)
        ?.corrections.at(-1),
    ).toMatchObject({
      previousOutcome: 'noShow',
      newOutcome: 'attended',
      reason: 'Fictional validation correction',
    });
  },
  recordManualAttendance: (next) =>
    expect(next.attendance.at(-1)).toMatchObject({
      classId: ids.classes.checkIn,
      memberId: ids.members.willow,
      currentOutcome: 'attended',
      source: { kind: 'manualOutage' },
    }),
  resendNotification: (next, before) => {
    const notification = next.notifications.find(
      (record) => record.notificationId === ids.notifications.invitationFailed,
    )!;
    expect(notification.status).toBe('sent');
    expect(notification.attempts).toHaveLength(2);
    expect(notification.attempts.at(-1)).toMatchObject({
      attemptedAt: before.clock.now,
      status: 'sent',
    });
  },
  updateOwnCoachProfile: (next) =>
    expect(
      next.staffAccounts.find((staff) => staff.staffId === ids.staff.coach)
        ?.coachProfile?.biography,
    ).toBe('Fictional validation biography'),
  updateCoachProfile: (next) =>
    expect(
      next.staffAccounts.find((staff) => staff.staffId === ids.staff.coach)
        ?.coachProfile?.biography,
    ).toBe('Fictional validation biography'),
  updateSettings: (next) => expect(next.settings.memberCap).toBe(10),
  selectActor: (next) =>
    expect(next.activeActor).toEqual({
      kind: 'member',
      memberId: ids.members.maple,
    }),
  setSimulation: (next) => expect(next.simulation.delivery).toBe('failure'),
  advanceClock: (next) => {
    expect(next.clock.now).toBe('2026-10-05T16:45:00Z');
    expect(
      next.classes.find((item) => item.classId === ids.classes.checkIn)?.status,
    ).toBe('completed');
    expect(
      next.attendance.find(
        (record) => record.attendanceId === ids.attendance.checkInCedar,
      )?.currentOutcome,
    ).toBe('noShow');
  },
  setClockPreset: (next) => {
    expect(next.clock).toEqual({
      now: '2026-10-05T16:45:00Z',
      presetId: ids.clockPresets.classEnd,
    });
    expect(
      next.classes.find((item) => item.classId === ids.classes.checkIn)?.status,
    ).toBe('completed');
  },
  resetDemo: (next, before) =>
    expect(next).toEqual({
      ...createInitialDemoState(),
      revision: before.revision + 1,
    }),
  loadScenario: (next, before) =>
    expect(next).toEqual({
      ...createInitialDemoState(),
      revision: before.revision + 1,
    }),
  unsupportedOperation: () => {
    throw new Error('Unsupported operations must not be accepted.');
  },
} satisfies Record<DemoActionType, RouteAssertion>;

describe('validateAction', () => {
  it.each(['success', 'failure'] as const)(
    'composes one cancellation notification per active booked or waiting member with delivery %s',
    (delivery) => {
      const initial = createInitialDemoState();
      const waiter = initial.waitlistEntries.find(
        (entry) => entry.entryId === ids.waitlist.willow,
      )!;
      const state: DemoState = {
        ...initial,
        simulation: { ...initial.simulation, delivery },
        waitlistEntries: [
          ...initial.waitlistEntries,
          { ...waiter, entryId: 'waitlist:duplicate-willow' },
          {
            ...waiter,
            entryId: 'waitlist:also-booked-maple',
            memberId: ids.members.maple,
          },
        ],
      };
      const before = structuredClone(state);
      const accepted = expectSuccess(
        validateAction(
          state,
          state.activeActor,
          {
            type: 'cancelClass',
            payload: {
              classId: ids.classes.full,
              reason: 'Fictional room closure',
            },
          },
          state.clock.now,
        ),
      );
      const notifications = accepted.changes.notifications?.filter(
        (record) =>
          !state.notifications.some(
            (existing) => existing.notificationId === record.notificationId,
          ),
      );
      expect(notifications).toHaveLength(6);
      expect(notifications?.map((record) => record.recipient)).toEqual(
        ['maple', 'cedar', 'birch', 'moss', 'aspen', 'willow'].map((name) => ({
          kind: 'member',
          memberId: `member:${name}`,
          email: `${name}@example.invalid`,
        })),
      );
      for (const record of notifications ?? []) {
        expect(record).toMatchObject({
          event: { type: 'classCancelled', classId: ids.classes.full },
          status: delivery === 'success' ? 'sent' : 'failed',
        });
      }
      expect(state).toEqual(before);
    },
  );

  it('explains the fixed timezone rule without implementation tracking references', () => {
    const state = createInitialDemoState();
    expect(
      validateAction(
        state,
        state.activeActor,
        {
          type: 'updateSettings',
          payload: { updates: { timezone: 'Europe/London' } },
        },
        state.clock.now,
      ),
    ).toMatchObject({
      success: false,
      error: {
        category: 'ValidationError',
        message:
          'The demo timezone cannot be changed through this state action.',
      },
    });
  });
  it.each(Object.entries(routeCases))(
    'validates and applies the %s route with its actual preconditions',
    (type, route: RoutedCase<DemoActionType>) => {
      const seed: DemoState = {
        ...createInitialDemoState(),
        revision: 17,
        clock: { now: '2026-10-05T15:46:00Z', presetId: null },
      };
      const state = route.setup ? route.setup(seed) : seed;
      const action = route.action(state);
      const before = structuredClone(state);
      const requestBefore = structuredClone(action);
      const result = validateAction(
        state,
        state.activeActor,
        action,
        state.clock.now,
      );
      expect(state).toEqual(before);
      expect(action).toEqual(requestBefore);
      if (type === 'unsupportedOperation') {
        expect(result).toMatchObject({
          success: false,
          error: {
            category: 'UnsupportedPrototypeOperation',
            operation: 'realEmail',
          },
        });
        return;
      }
      const accepted = expectSuccess(result);
      expect(accepted).toMatchObject({
        type: 'accepted',
        action,
        actor: state.activeActor,
        validatedAt: state.clock.now,
        baseRevision: 17,
      });
      expect(accepted.warnings).toEqual([]);
      const next = demoReducer(state, accepted);
      expect(next.revision).toBe(18);
      expect(next).toEqual({ ...state, ...accepted.changes, revision: 18 });
      routeAssertions[action.type](next, state);
      const store = createDemoStore(state);
      store.dispatch(structuredClone(accepted));
      expect(store.getSnapshot().state).toEqual(next);
      expect(state).toEqual(before);
      expect(action).toEqual(requestBefore);
    },
  );

  it.each(
    Object.entries(routeCases).filter(
      ([type]) =>
        ![
          'selectActor',
          'setSimulation',
          'advanceClock',
          'setClockPreset',
          'resetDemo',
          'loadScenario',
          'unsupportedOperation',
        ].includes(type),
    ),
  )(
    'rejects %s for an unrelated member without mutation',
    (_type, route: RoutedCase<DemoActionType>) => {
      const seed = createInitialDemoState();
      const prepared = route.setup ? route.setup(seed) : seed;
      const actor = { kind: 'member', memberId: ids.members.cedar } as const;
      const state = { ...prepared, activeActor: actor };
      const action = route.action(state);
      const before = structuredClone({ state, action });
      expect(
        validateAction(state, actor, action, state.clock.now),
      ).toMatchObject({
        success: false,
        error: { category: 'IneligibleDemoAction', reason: 'roleDenied' },
      });
      expect({ state, action }).toEqual(before);
    },
  );

  const controlFailures: {
    readonly name: string;
    readonly action: (state: DemoState) => DemoAction;
    readonly error: Partial<DomainError>;
  }[] = [
    {
      name: 'selectActor',
      action: () => ({
        type: 'selectActor',
        payload: { actor: { kind: 'member', memberId: 'member:missing' } },
      }),
      error: {
        category: 'DemoUnavailableState',
        resource: 'member',
        resourceId: 'member:missing',
      },
    },
    {
      name: 'setSimulation',
      action: () => ({ type: 'setSimulation', payload: {} }),
      error: {
        category: 'ValidationError',
        fields: [
          {
            field: 'payload',
            message: 'Provide at least one simulation field to update.',
          },
        ],
      },
    },
    {
      name: 'advanceClock',
      action: () => ({
        type: 'advanceClock',
        payload: { to: '2026-10-05T15:44:59Z' },
      }),
      error: { category: 'IneligibleDemoAction', reason: 'backwardClock' },
    },
    {
      name: 'setClockPreset',
      action: () => ({
        type: 'setClockPreset',
        payload: { presetId: ids.clockPresets.checkInOpens },
      }),
      error: { category: 'IneligibleDemoAction', reason: 'backwardClock' },
    },
    {
      name: 'resetDemo',
      action: () => {
        const action = routeCases.resetDemo.action();
        Reflect.deleteProperty(action.payload, 'confirmed');
        return action;
      },
      error: {
        category: 'IneligibleDemoAction',
        reason: 'confirmationRequired',
      },
    },
    {
      name: 'loadScenario',
      action: () => ({
        type: 'loadScenario',
        payload: { scenarioId: 'scenario:missing', confirmed: true },
      }),
      error: {
        category: 'DemoUnavailableState',
        resource: 'scenario',
        resourceId: 'scenario:missing',
      },
    },
  ];

  it.each(controlFailures)(
    'rejects invalid $name controls without changing inputs',
    ({ action: factory, error }) => {
      const state = createInitialDemoState();
      const action = factory(state);
      const before = structuredClone({ state, action });
      expect(
        validateAction(state, state.activeActor, action, state.clock.now),
      ).toMatchObject({ success: false, error });
      expect({ state, action }).toEqual(before);
    },
  );
});
