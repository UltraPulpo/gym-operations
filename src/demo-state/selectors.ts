import {
  selectCoachClassHistory as selectDomainCoachClassHistory,
  selectCoachProfile as selectDomainCoachProfile,
  selectClassLayout as selectDomainClassLayout,
  selectDemoCapabilities,
  selectReleasedClasses,
  getWaiverCompliance,
  requireCapability,
} from '../domain';
import { getScenarios } from '../demo-scenarios';
import type {
  Booking,
  ClassFilters,
  ClassId,
  DemoActor,
  DemoCapabilities,
  DemoScenario,
  DemoState,
  DomainResult,
  Invitation,
  LayoutView,
  Member,
  NotificationRecord,
  PrintableRoster,
  ScheduledClass,
  StaffAccount,
  StaffId,
  StationId,
  WaitlistEntry,
  WaiverCompliance,
} from '../domain';

export interface SelectBookingsOptions {
  readonly includeInactive?: boolean;
}

export interface ClassSeatSummary {
  readonly classId: ClassId;
  readonly capacity: number;
  readonly booked: number;
  readonly available: number;
  readonly waitlist: number;
}

export type MemberView = Pick<Member, 'memberId' | 'displayName' | 'status'> &
  Partial<Pick<Member, 'verifiedEmail' | 'contactEmail'>>;
export type StaffAccountView = Pick<
  StaffAccount,
  'staffId' | 'active' | 'assignedRoles' | 'assignedClassIds'
>;
export type InvitationView = Pick<
  Invitation,
  'invitationId' | 'email' | 'status' | 'issuedAt' | 'expiresAt'
>;

function sortClasses(
  classes: readonly ScheduledClass[],
): readonly ScheduledClass[] {
  return classes
    .slice()
    .sort(
      (left, right) =>
        left.startsAt.localeCompare(right.startsAt) ||
        left.classId.localeCompare(right.classId),
    );
}

function hasScheduleVisibility(
  state: DemoState,
  actor: DemoActor,
): DemoCapabilities | undefined {
  const selected = selectDemoCapabilities(state, actor);
  return selected.success &&
    selected.value.capabilities.includes('viewSchedule')
    ? selected.value
    : undefined;
}

function stationLabel(
  state: DemoState,
  stationId: StationId,
): string | undefined {
  const station = state.stations.find((item) => item.stationId === stationId);
  if (station) return station.label;
  const retired = state.retiredStations.find(
    (item) => item.stationId === stationId,
  );
  return retired ? `${retired.label} (removed)` : undefined;
}

function byStationAndMember(
  state: DemoState,
  left: Booking,
  right: Booking,
): number {
  const leftStation = stationLabel(state, left.stationId) ?? '';
  const rightStation = stationLabel(state, right.stationId) ?? '';
  const stationOrder = leftStation.localeCompare(rightStation);
  if (stationOrder !== 0) return stationOrder;
  const leftMember =
    state.members.find((member) => member.memberId === left.memberId)
      ?.displayName ?? '';
  const rightMember =
    state.members.find((member) => member.memberId === right.memberId)
      ?.displayName ?? '';
  return (
    stationOrder ||
    leftMember.localeCompare(rightMember) ||
    left.bookingId.localeCompare(right.bookingId)
  );
}

export function selectClasses(
  state: DemoState,
  filters: ClassFilters,
): readonly ScheduledClass[] {
  const capabilities = hasScheduleVisibility(state, filters.actor);
  if (!capabilities) return [];

  let classes: readonly ScheduledClass[] = state.classes;
  if (filters.actor.kind === 'member') {
    const released = selectReleasedClasses(
      state.classes,
      state.settings.scheduleRelease,
      filters.now,
    );
    if (!released.success) return [];
    classes = released.value;
  } else if (capabilities.classScope.kind === 'assigned') {
    const assignedIds = capabilities.classScope.classIds;
    classes = classes.filter((scheduledClass) =>
      assignedIds.includes(scheduledClass.classId),
    );
  }

  return sortClasses(
    classes.filter((scheduledClass) => {
      if (
        filters.statuses &&
        !filters.statuses.includes(scheduledClass.status)
      ) {
        return false;
      }
      if (
        filters.coachId !== undefined &&
        scheduledClass.coachId !== filters.coachId
      ) {
        return false;
      }
      if (
        filters.from !== undefined &&
        scheduledClass.startsAt < filters.from
      ) {
        return false;
      }
      if (filters.to !== undefined && scheduledClass.startsAt > filters.to) {
        return false;
      }
      return true;
    }),
  );
}

export function selectClassLayout(
  state: DemoState,
  classId: ClassId,
  actor: DemoActor,
  now: import('../domain').UtcInstant,
): LayoutView {
  return selectDomainClassLayout(state, classId, actor, now);
}

export function selectCapabilities(
  state: DemoState,
  actor: DemoActor = state.activeActor,
): DomainResult<DemoCapabilities> {
  return selectDemoCapabilities(state, actor);
}

export function selectActiveActor(state: DemoState): DemoActor {
  return state.activeActor;
}

export function selectClassBookings(
  state: DemoState,
  classId: ClassId,
  options: SelectBookingsOptions = {},
): readonly Booking[] {
  return state.bookings
    .filter((booking) => booking.classId === classId)
    .filter((booking) => options.includeInactive || booking.status === 'booked')
    .slice()
    .sort((left, right) => byStationAndMember(state, left, right));
}

export function selectClassWaitlist(
  state: DemoState,
  classId: ClassId,
): readonly WaitlistEntry[] {
  return state.waitlistEntries
    .filter((entry) => entry.classId === classId && entry.status === 'waiting')
    .slice()
    .sort(
      (left, right) =>
        left.joinOrder - right.joinOrder ||
        left.joinedAt.localeCompare(right.joinedAt) ||
        left.entryId.localeCompare(right.entryId),
    );
}

export function selectMemberBookings(
  state: DemoState,
  memberId: Member['memberId'],
  options: SelectBookingsOptions = { includeInactive: true },
): readonly Booking[] {
  return state.bookings
    .filter((booking) => booking.memberId === memberId)
    .filter((booking) => options.includeInactive || booking.status === 'booked')
    .slice()
    .sort((left, right) => {
      const leftClass =
        state.classes.find(
          (scheduledClass) => scheduledClass.classId === left.classId,
        )?.startsAt ?? '';
      const rightClass =
        state.classes.find(
          (scheduledClass) => scheduledClass.classId === right.classId,
        )?.startsAt ?? '';
      return (
        leftClass.localeCompare(rightClass) ||
        left.classId.localeCompare(right.classId) ||
        left.bookingId.localeCompare(right.bookingId)
      );
    });
}

export function selectMember(
  state: DemoState,
  memberId: Member['memberId'],
  actor: DemoActor = state.activeActor,
): MemberView | undefined {
  return selectMembers(state, actor).find(
    (member) => member.memberId === memberId,
  );
}

export function selectMembers(
  state: DemoState,
  actor: DemoActor = state.activeActor,
): readonly MemberView[] {
  const capabilities = selectDemoCapabilities(state, actor);
  if (!capabilities.success) return [];
  const managesMembers =
    capabilities.value.capabilities.includes('manageMembers');
  const scope = capabilities.value.classScope;
  const rosterIds = new Set(
    actor.kind === 'staff' &&
      capabilities.value.capabilities.includes('viewRoster')
      ? state.bookings
          .filter(
            (booking) =>
              booking.status === 'booked' &&
              (scope.kind === 'all' ||
                (scope.kind === 'assigned' &&
                  scope.classIds.includes(booking.classId))),
          )
          .map((booking) => booking.memberId)
      : [],
  );
  return state.members
    .filter(
      (member) =>
        managesMembers ||
        (actor.kind === 'member' && actor.memberId === member.memberId) ||
        rosterIds.has(member.memberId),
    )
    .map((member): MemberView => ({
      memberId: member.memberId,
      displayName: member.displayName,
      status: member.status,
      ...(managesMembers || actor.kind === 'member'
        ? {
            verifiedEmail: member.verifiedEmail,
            ...(member.contactEmail === undefined
              ? {}
              : { contactEmail: member.contactEmail }),
          }
        : {}),
    }))
    .slice()
    .sort(
      (left, right) =>
        left.displayName.localeCompare(right.displayName) ||
        left.memberId.localeCompare(right.memberId),
    );
}

export function selectClassRosterMembers(
  state: DemoState,
  classId: ClassId,
  actor: DemoActor = state.activeActor,
): readonly Pick<Member, 'memberId' | 'displayName'>[] {
  if (!requireCapability(state, actor, 'viewRoster', { classId }).success) {
    return [];
  }
  const rosterIds = new Set([
    ...state.bookings
      .filter((booking) => booking.classId === classId)
      .map((booking) => booking.memberId),
    ...state.waitlistEntries
      .filter(
        (entry) => entry.classId === classId && entry.status === 'waiting',
      )
      .map((entry) => entry.memberId),
  ]);
  return state.members
    .filter((member) => rosterIds.has(member.memberId))
    .map(({ memberId, displayName }) => ({ memberId, displayName }))
    .sort(
      (left, right) =>
        left.displayName.localeCompare(right.displayName) ||
        left.memberId.localeCompare(right.memberId),
    );
}

export function selectStaffAccounts(
  state: DemoState,
  actor: DemoActor = state.activeActor,
): readonly StaffAccountView[] {
  if (!requireCapability(state, actor, 'manageStaff').success) return [];
  return state.staffAccounts
    .map((staff) => ({
      staffId: staff.staffId,
      active: staff.active,
      assignedRoles: [...staff.assignedRoles],
      assignedClassIds: [...staff.assignedClassIds],
    }))
    .slice()
    .sort((left, right) => left.staffId.localeCompare(right.staffId));
}

export function selectStaff(
  state: DemoState,
  staffId: StaffId,
  actor: DemoActor = state.activeActor,
): StaffAccountView | undefined {
  return selectStaffAccounts(state, actor).find(
    (staff) => staff.staffId === staffId,
  );
}

export function selectInvitations(
  state: DemoState,
  actor: DemoActor = state.activeActor,
): readonly InvitationView[] {
  const capabilities = selectDemoCapabilities(state, actor);
  if (!capabilities.success) return [];
  const managesInvitations =
    capabilities.value.capabilities.includes('manageInvitations');
  return state.invitations
    .filter(
      (invitation) =>
        managesInvitations ||
        (actor.kind === 'invitation' &&
          actor.invitationId === invitation.invitationId),
    )
    .map((invitation) => ({
      invitationId: invitation.invitationId,
      email: invitation.email,
      status: invitation.status,
      issuedAt: invitation.issuedAt,
      expiresAt: invitation.expiresAt,
    }))
    .slice()
    .sort(
      (left, right) =>
        left.issuedAt.localeCompare(right.issuedAt) ||
        left.invitationId.localeCompare(right.invitationId),
    );
}

export function selectWaiverCompliance(
  state: DemoState,
  memberId: Member['memberId'],
): WaiverCompliance {
  return getWaiverCompliance(state, memberId);
}

export function selectNotifications(
  state: DemoState,
): readonly NotificationRecord[] {
  return state.notifications
    .slice()
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.notificationId.localeCompare(right.notificationId),
    );
}

export function selectClassAttendance(
  state: DemoState,
  classId: ClassId,
): readonly DemoState['attendance'][number][] {
  return state.attendance
    .filter((attendance) => attendance.classId === classId)
    .slice()
    .sort((left, right) => {
      const leftBooking =
        left.bookingId === undefined
          ? undefined
          : state.bookings.find(
              (booking) => booking.bookingId === left.bookingId,
            );
      const rightBooking =
        right.bookingId === undefined
          ? undefined
          : state.bookings.find(
              (booking) => booking.bookingId === right.bookingId,
            );
      const leftStation =
        leftBooking === undefined
          ? ''
          : (stationLabel(state, leftBooking.stationId) ?? '');
      const rightStation =
        rightBooking === undefined
          ? ''
          : (stationLabel(state, rightBooking.stationId) ?? '');
      const stationOrder = leftStation.localeCompare(rightStation);
      if (stationOrder !== 0) return stationOrder;
      const leftMember =
        state.members.find((member) => member.memberId === left.memberId)
          ?.displayName ?? '';
      const rightMember =
        state.members.find((member) => member.memberId === right.memberId)
          ?.displayName ?? '';
      return (
        leftMember.localeCompare(rightMember) ||
        left.attendanceId.localeCompare(right.attendanceId)
      );
    });
}

export function selectPrintableRoster(
  state: DemoState,
  classId: ClassId,
  actor: DemoActor = state.activeActor,
): DomainResult<PrintableRoster> {
  const permission = requireCapability(state, actor, 'viewRoster', { classId });
  if (!permission.success) return permission;
  return {
    success: true,
    value: {
      classId,
      entries: selectClassBookings(state, classId)
        .map((booking) => {
          const member = state.members.find(
            (record) => record.memberId === booking.memberId,
          );
          const label = stationLabel(state, booking.stationId);
          return member && label
            ? {
                memberDisplayName: member.displayName,
                stationLabel: label,
              }
            : undefined;
        })
        .filter(
          (entry): entry is PrintableRoster['entries'][number] =>
            entry !== undefined,
        ),
    },
  };
}

export function selectClassSeatSummary(
  state: DemoState,
  classId: ClassId,
): ClassSeatSummary {
  const capacity = state.stations.filter((station) => station.inService).length;
  const booked = selectClassBookings(state, classId).filter((booking) =>
    state.stations.some(
      (station) => station.stationId === booking.stationId && station.inService,
    ),
  ).length;
  return {
    classId,
    capacity,
    booked,
    available: Math.max(capacity - booked, 0),
    waitlist: selectClassWaitlist(state, classId).length,
  };
}

export function selectSettings(state: DemoState): DemoState['settings'] {
  return state.settings;
}

export function selectClock(state: DemoState): DemoState['clock'] {
  return state.clock;
}

export function selectSimulation(state: DemoState): DemoState['simulation'] {
  return state.simulation;
}

export function selectScenarios(state: DemoState): readonly DemoScenario[] {
  void state;
  return getScenarios();
}

export function selectCoachProfile(
  state: DemoState,
  staffId: StaffId,
  actor: DemoActor = state.activeActor,
) {
  return selectDomainCoachProfile(state, staffId, actor);
}

export function selectCoachClassHistory(
  state: DemoState,
  staffId: StaffId,
  actor: DemoActor = state.activeActor,
  now: import('../domain').UtcInstant = state.clock.now,
) {
  return selectDomainCoachClassHistory(state, staffId, actor, now);
}
