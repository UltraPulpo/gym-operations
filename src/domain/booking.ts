import { checkMemberEligibility } from './membership';
import { recordNotification } from './notifications';
import { requireCapability } from './roles';
import { selectReleasedClasses } from './scheduling';
import { selectClassLayout, validateClassCapacity } from './stations';
import { requireCurrentWaiver } from './waivers';
import type {
  AttendanceRecord,
  Booking,
  BookingId,
  ClassId,
  DemoActor,
  DemoState,
  DemoStateChanges,
  DomainError,
  DomainResource,
  DomainResult,
  IneligibilityReason,
  MemberId,
  NotificationId,
  ScheduledClass,
  Station,
  StationId,
  StaffId,
  UtcInstant,
  WaitlistEntry,
  WaitlistEntryId,
  WaitlistReviewFlag,
} from './types';

function invalid(field: string, message: string): DomainResult<never> {
  return {
    success: false,
    error: {
      category: 'ValidationError',
      message,
      fields: [{ field, message }],
    },
  };
}

function ineligible(
  reason: IneligibilityReason,
  message: string,
  options: { readonly memberId?: MemberId; readonly classId?: ClassId } = {},
): DomainResult<never> {
  return {
    success: false,
    error: { category: 'IneligibleDemoAction', reason, message, ...options },
  };
}

function unavailable(
  resource: DomainResource,
  resourceId?: string,
  stale = false,
): DomainResult<never> {
  return {
    success: false,
    error: {
      category: 'DemoUnavailableState',
      message: `The demo ${resource} is unavailable${stale ? ' or stale' : ''}.`,
      resource,
      ...(resourceId === undefined ? {} : { resourceId }),
      stale,
    },
  };
}

function validId(value: string, prefix: string): boolean {
  return (
    value.startsWith(`${prefix}:`) &&
    value.length > prefix.length + 1 &&
    value.trim() === value &&
    !/\s/.test(value)
  );
}

function validInstant(value: string): value is UtcInstant {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().replace('.000Z', 'Z') === value
  );
}

function findClass(
  state: DemoState,
  classId: ClassId,
): ScheduledClass | undefined {
  return state.classes.find((item) => item.classId === classId);
}

function findBooking(
  state: DemoState,
  bookingId: BookingId,
): Booking | undefined {
  return state.bookings.find((item) => item.bookingId === bookingId);
}

function findStation(
  state: DemoState,
  stationId: StationId,
): Station | undefined {
  return state.stations.find((item) => item.stationId === stationId);
}

function classWindow(
  state: DemoState,
  classId: ClassId,
  now: UtcInstant,
): DomainResult<ScheduledClass> {
  if (!validInstant(now)) return invalid('now', 'Provide a valid UTC instant.');
  const scheduledClass = findClass(state, classId);
  if (!scheduledClass) return unavailable('class', classId);
  if (
    !validInstant(scheduledClass.startsAt) ||
    !validInstant(scheduledClass.endsAt) ||
    scheduledClass.endsAt <= scheduledClass.startsAt
  ) {
    return invalid(
      'class',
      'The scheduled class has an invalid UTC time window.',
    );
  }
  if (scheduledClass.status === 'cancelled') {
    return ineligible('classCancelled', 'A cancelled class cannot be booked.', {
      classId,
    });
  }
  if (scheduledClass.status === 'completed') {
    return ineligible('classCompleted', 'A completed class cannot be booked.', {
      classId,
    });
  }
  if (scheduledClass.status !== 'published') {
    return ineligible(
      'classNotPublished',
      'Only published classes can be booked.',
      {
        classId,
      },
    );
  }
  const released = selectReleasedClasses(
    state.classes,
    state.settings.scheduleRelease,
    now,
  );
  if (!released.success) return released;
  if (!released.value.some((item) => item.classId === classId)) {
    return ineligible(
      'classNotReleased',
      'This published class has not been released for booking.',
      { classId },
    );
  }
  return { success: true, value: scheduledClass };
}

function validateBookingAssignments(
  state: DemoState,
  classId: ClassId,
): DomainResult<readonly Booking[]> {
  const active = state.bookings.filter(
    (booking) => booking.classId === classId && booking.status === 'booked',
  );
  const usedStations = new Set<StationId>();
  for (const booking of active) {
    if (!findStation(state, booking.stationId)) {
      return unavailable('station', booking.stationId, true);
    }
    if (usedStations.has(booking.stationId)) {
      return unavailable('layout', classId, true);
    }
    usedStations.add(booking.stationId);
  }
  return { success: true, value: active };
}

function availableStationIds(
  state: DemoState,
  classId: ClassId,
): readonly StationId[] {
  const used = new Set(
    state.bookings
      .filter(
        (booking) => booking.classId === classId && booking.status === 'booked',
      )
      .map((booking) => booking.stationId),
  );
  return state.stations
    .filter((station) => station.inService && !used.has(station.stationId))
    .map((station) => station.stationId);
}

function stationConflict(
  state: DemoState,
  actor: DemoActor,
  classId: ClassId,
  stationId: StationId,
  now: UtcInstant,
): DomainResult<never> {
  return {
    success: false,
    error: {
      category: 'DemoConflict',
      message:
        'That station is no longer available. Review the current class availability.',
      conflict: {
        kind: 'station',
        classId,
        stationId,
        availableStationIds: availableStationIds(state, classId),
        layout: selectClassLayout(state, classId, actor, now),
      },
    },
  };
}

function requireAvailableStation(
  state: DemoState,
  actor: DemoActor,
  classId: ClassId,
  stationId: StationId,
  now: UtcInstant,
  activeBookings: readonly Booking[],
): DomainResult<Station> {
  const station = findStation(state, stationId);
  if (!station) return unavailable('station', stationId);
  if (!station.inService) {
    return ineligible('stationOutOfService', 'Choose an in-service station.', {
      classId,
    });
  }
  if (activeBookings.some((booking) => booking.stationId === stationId)) {
    return stationConflict(state, actor, classId, stationId, now);
  }
  return { success: true, value: station };
}

function requireEligibleMember(
  state: DemoState,
  memberId: MemberId,
  now: UtcInstant,
): DomainResult<void> {
  const eligibility = checkMemberEligibility(state, memberId, now);
  if (!eligibility.success) return eligibility;
  const waiver = requireCurrentWaiver(state, memberId);
  if (!waiver.success) return waiver;
  return { success: true, value: undefined };
}

function attendanceForBooking(
  state: DemoState,
  booking: Booking,
): AttendanceRecord | undefined {
  return state.attendance.find(
    (item) =>
      item.attendanceId === booking.attendanceRecordId ||
      item.bookingId === booking.bookingId,
  );
}

function upsertAttendance(
  state: DemoState,
  record: AttendanceRecord,
): readonly AttendanceRecord[] {
  return state.attendance.some(
    (item) => item.attendanceId === record.attendanceId,
  )
    ? state.attendance.map((item) =>
        item.attendanceId === record.attendanceId ? record : item,
      )
    : [...state.attendance, record];
}

function attendanceRecord(
  booking: Booking,
  outcome: AttendanceRecord['currentOutcome'],
  now: UtcInstant,
): AttendanceRecord {
  return {
    attendanceId: booking.attendanceRecordId,
    bookingId: booking.bookingId,
    classId: booking.classId,
    memberId: booking.memberId,
    currentOutcome: outcome,
    checkIn: { status: 'notCheckedIn' },
    source:
      outcome === 'booked'
        ? { kind: 'booking', bookingId: booking.bookingId }
        : { kind: 'memberCancellation', recordedAt: now },
    corrections: [],
  };
}

function patchWithNotification(
  state: DemoState,
  changes: DemoStateChanges,
  event:
    | {
        readonly type: 'bookingConfirmed';
        readonly bookingId: BookingId;
        readonly classId: ClassId;
      }
    | {
        readonly type: 'waitlistPromoted';
        readonly bookingId: BookingId;
        readonly entryId: WaitlistEntryId;
        readonly classId: ClassId;
      },
  memberId: MemberId,
  notificationSeed: string,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  const member = state.members.find((item) => item.memberId === memberId);
  if (!member) return unavailable('member', memberId);
  const updatedState = { ...state, ...changes };
  let suffix = 1;
  let notificationId = `notification:${notificationSeed}` as NotificationId;
  while (
    updatedState.notifications.some(
      (item) => item.notificationId === notificationId,
    )
  ) {
    suffix += 1;
    notificationId =
      `notification:${notificationSeed}:${suffix}` as NotificationId;
  }
  const notification = recordNotification(
    updatedState,
    {
      notificationId,
      event,
      recipient: {
        kind: 'member',
        memberId: member.memberId,
        email: member.verifiedEmail,
      },
      scenario: state.simulation.delivery,
    },
    now,
  );
  if (!notification.success) return notification;
  return { success: true, value: { ...changes, ...notification.value } };
}

function nextBookingId(state: DemoState, entryId: WaitlistEntryId): BookingId {
  const seed = entryId.slice('waitlist:'.length);
  let ordinal = 1;
  let bookingId = `booking:promotion:${seed}` as BookingId;
  while (state.bookings.some((booking) => booking.bookingId === bookingId)) {
    ordinal += 1;
    bookingId = `booking:promotion:${seed}:${ordinal}` as BookingId;
  }
  return bookingId;
}

function waitlistReviewFlag(
  error: DomainError,
): WaitlistReviewFlag | undefined {
  if (error.category !== 'IneligibleDemoAction') return undefined;
  switch (error.reason) {
    case 'memberInactive':
      return 'memberInactive';
    case 'invitationNotAccepted':
      return 'invitationNotAccepted';
    case 'waiverMissing':
    case 'waiverOutdated':
      return 'waiverOutdated';
    default:
      return undefined;
  }
}

function updateWaitlistFlags(
  entry: WaitlistEntry,
  reason: WaitlistReviewFlag | undefined,
): WaitlistEntry {
  const reviewFlags = reason ? [reason] : [];
  return entry.reviewFlags.length === reviewFlags.length &&
    entry.reviewFlags.every((flag, index) => flag === reviewFlags[index])
    ? entry
    : { ...entry, reviewFlags };
}

function beforePromotionCutoff(
  state: DemoState,
  scheduledClass: ScheduledClass,
  now: UtcInstant,
): DomainResult<boolean> {
  const minutes = state.settings.waitlistCutoffMinutes;
  if (!Number.isSafeInteger(minutes) || minutes < 0) {
    return invalid(
      'waitlistCutoffMinutes',
      'The waitlist cutoff must be a non-negative whole number of minutes.',
    );
  }
  return {
    success: true,
    value:
      Date.parse(now) < Date.parse(scheduledClass.startsAt) - minutes * 60_000,
  };
}

function promoteNextEligible(
  state: DemoState,
  scheduledClass: ScheduledClass,
  station: Station,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  if (!station.inService) return { success: true, value: {} };
  const cutoff = beforePromotionCutoff(state, scheduledClass, now);
  if (!cutoff.success) return cutoff;
  if (!cutoff.value) return { success: true, value: {} };
  const assignments = validateBookingAssignments(state, scheduledClass.classId);
  if (!assignments.success) return assignments;
  if (
    assignments.value.some((booking) => booking.stationId === station.stationId)
  ) {
    return { success: true, value: {} };
  }

  const waiting = state.waitlistEntries
    .filter(
      (entry) =>
        entry.classId === scheduledClass.classId && entry.status === 'waiting',
    )
    .slice()
    .sort(
      (left, right) =>
        left.joinOrder - right.joinOrder ||
        left.joinedAt.localeCompare(right.joinedAt) ||
        left.entryId.localeCompare(right.entryId),
    );
  const changedFlags = new Map<WaitlistEntryId, WaitlistEntry>();
  for (const entry of waiting) {
    if (!Number.isSafeInteger(entry.joinOrder) || entry.joinOrder < 0) {
      return invalid('waitlistEntries.joinOrder', 'Waitlist order is invalid.');
    }
    if (
      state.bookings.some(
        (booking) =>
          booking.classId === scheduledClass.classId &&
          booking.memberId === entry.memberId &&
          booking.status === 'booked',
      )
    ) {
      changedFlags.set(entry.entryId, updateWaitlistFlags(entry, undefined));
      continue;
    }
    const eligibility = checkMemberEligibility(state, entry.memberId, now);
    if (!eligibility.success) {
      if (eligibility.error.category === 'DemoUnavailableState') {
        return eligibility;
      }
      changedFlags.set(
        entry.entryId,
        updateWaitlistFlags(entry, waitlistReviewFlag(eligibility.error)),
      );
      continue;
    }
    const waiver = requireCurrentWaiver(state, entry.memberId);
    if (!waiver.success) {
      if (waiver.error.category === 'DemoUnavailableState') return waiver;
      changedFlags.set(
        entry.entryId,
        updateWaitlistFlags(entry, waitlistReviewFlag(waiver.error)),
      );
      continue;
    }

    const bookingId = nextBookingId(state, entry.entryId);
    const attendanceId =
      `attendance:${bookingId.slice('booking:'.length)}` as Booking['attendanceRecordId'];
    if (state.attendance.some((item) => item.attendanceId === attendanceId)) {
      return invalid(
        'attendanceRecordId',
        'A promotion would reuse an existing attendance identifier.',
      );
    }
    const booking: Booking = {
      bookingId,
      memberId: entry.memberId,
      classId: scheduledClass.classId,
      stationId: station.stationId,
      bookedAt: now,
      attendanceRecordId: attendanceId,
      reviewFlags: [],
      promotedFromEntryId: entry.entryId,
      status: 'booked',
    };
    const promotedEntry: WaitlistEntry = {
      ...entry,
      status: 'promoted',
      promotedAt: now,
      bookingId,
      reviewFlags: [],
    };
    const waitlistEntries = state.waitlistEntries.map(
      (item) => changedFlags.get(item.entryId) ?? item,
    );
    const changes: DemoStateChanges = {
      bookings: [...state.bookings, booking],
      attendance: [
        ...state.attendance,
        attendanceRecord(booking, 'booked', now),
      ],
      waitlistEntries: waitlistEntries.map((item) =>
        item.entryId === promotedEntry.entryId ? promotedEntry : item,
      ),
    };
    return patchWithNotification(
      state,
      changes,
      {
        type: 'waitlistPromoted',
        bookingId,
        entryId: entry.entryId,
        classId: scheduledClass.classId,
      },
      entry.memberId,
      `promotion:${bookingId.slice('booking:'.length)}`,
      now,
    );
  }

  if (changedFlags.size === 0) return { success: true, value: {} };
  return {
    success: true,
    value: {
      waitlistEntries: state.waitlistEntries.map(
        (entry) => changedFlags.get(entry.entryId) ?? entry,
      ),
    },
  };
}

function changeAfterFreeingStation(
  state: DemoState,
  changes: DemoStateChanges,
  scheduledClass: ScheduledClass,
  stationId: StationId,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  const station = findStation(state, stationId);
  if (!station?.inService) return { success: true, value: changes };
  const updatedState = { ...state, ...changes };
  const promotion = promoteNextEligible(
    updatedState,
    scheduledClass,
    station,
    now,
  );
  if (!promotion.success) return promotion;
  return { success: true, value: { ...changes, ...promotion.value } };
}

function requireUniqueBookingId(
  state: DemoState,
  bookingId: BookingId,
): DomainResult<void> {
  if (!validId(bookingId, 'booking')) {
    return invalid('bookingId', 'Supply a valid booking identifier.');
  }
  if (state.bookings.some((booking) => booking.bookingId === bookingId)) {
    return invalid('bookingId', 'This booking identifier is already in use.');
  }
  return { success: true, value: undefined };
}

function requireMemberActor(
  state: DemoState,
  actor: DemoActor,
  capability:
    'bookStation' | 'cancelOwnBooking' | 'moveOwnBooking' | 'manageOwnWaitlist',
  memberId: MemberId,
  classId: ClassId,
): DomainResult<void> {
  if (actor.kind !== 'member') {
    return ineligible(
      'roleDenied',
      'Select the member persona for this action.',
      {
        memberId,
        classId,
      },
    );
  }
  return requireCapability(state, actor, capability, { memberId, classId });
}

export function bookStation(
  state: DemoState,
  actor: DemoActor,
  memberId: MemberId,
  classId: ClassId,
  stationId: StationId,
  bookingId: BookingId,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  if (
    !validId(memberId, 'member') ||
    !validId(classId, 'class') ||
    !validId(stationId, 'station')
  ) {
    return invalid('selection', 'Choose a valid member, class, and station.');
  }
  const permission = requireMemberActor(
    state,
    actor,
    'bookStation',
    memberId,
    classId,
  );
  if (!permission.success) return permission;
  const eligibility = requireEligibleMember(state, memberId, now);
  if (!eligibility.success) return eligibility;
  const scheduledClass = classWindow(state, classId, now);
  if (!scheduledClass.success) return scheduledClass;
  if (Date.parse(now) >= Date.parse(scheduledClass.value.startsAt)) {
    return ineligible(
      'classStarted',
      'Members cannot book a station after class has started.',
      { memberId, classId },
    );
  }
  const capacity = validateClassCapacity(state, classId);
  if (!capacity.success) return capacity;
  const assignments = validateBookingAssignments(state, classId);
  if (!assignments.success) return assignments;
  if (assignments.value.some((booking) => booking.memberId === memberId)) {
    return ineligible(
      'alreadyBooked',
      'This member already has a booking in the selected class.',
      { memberId, classId },
    );
  }
  const station = requireAvailableStation(
    state,
    actor,
    classId,
    stationId,
    now,
    assignments.value,
  );
  if (!station.success) return station;
  const uniqueId = requireUniqueBookingId(state, bookingId);
  if (!uniqueId.success) return uniqueId;
  const attendanceId =
    `attendance:${bookingId.slice('booking:'.length)}` as Booking['attendanceRecordId'];
  if (state.attendance.some((item) => item.attendanceId === attendanceId)) {
    return invalid(
      'attendanceRecordId',
      'This booking would reuse an existing attendance identifier.',
    );
  }
  const booking: Booking = {
    bookingId,
    memberId,
    classId,
    stationId: station.value.stationId,
    bookedAt: now,
    attendanceRecordId: attendanceId,
    reviewFlags: [],
    status: 'booked',
  };
  return patchWithNotification(
    state,
    {
      bookings: [...state.bookings, booking],
      attendance: [
        ...state.attendance,
        attendanceRecord(booking, 'booked', now),
      ],
    },
    { type: 'bookingConfirmed', bookingId, classId },
    memberId,
    `booking:${bookingId.slice('booking:'.length)}`,
    now,
  );
}

export function joinWaitlist(
  state: DemoState,
  actor: DemoActor,
  memberId: MemberId,
  classId: ClassId,
  entryId: WaitlistEntryId,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  if (!validId(entryId, 'waitlist')) {
    return invalid('entryId', 'Supply a valid waitlist entry identifier.');
  }
  if (state.waitlistEntries.some((entry) => entry.entryId === entryId)) {
    return invalid(
      'entryId',
      'This waitlist entry identifier is already in use.',
    );
  }
  const permission = requireMemberActor(
    state,
    actor,
    'manageOwnWaitlist',
    memberId,
    classId,
  );
  if (!permission.success) return permission;
  const eligibility = requireEligibleMember(state, memberId, now);
  if (!eligibility.success) return eligibility;
  const scheduledClass = classWindow(state, classId, now);
  if (!scheduledClass.success) return scheduledClass;
  if (Date.parse(now) >= Date.parse(scheduledClass.value.startsAt)) {
    return ineligible(
      'classStarted',
      'Members cannot join a waitlist after class has started.',
      { memberId, classId },
    );
  }
  const capacity = validateClassCapacity(state, classId);
  if (!capacity.success) return capacity;
  const assignments = validateBookingAssignments(state, classId);
  if (!assignments.success) return assignments;
  if (assignments.value.some((booking) => booking.memberId === memberId)) {
    return ineligible(
      'alreadyBooked',
      'A booked member cannot join the same class waitlist.',
      { memberId, classId },
    );
  }
  if (
    state.waitlistEntries.some(
      (entry) =>
        entry.classId === classId &&
        entry.memberId === memberId &&
        entry.status === 'waiting',
    )
  ) {
    return ineligible(
      'alreadyWaitlisted',
      'This member is already waiting for the selected class.',
      { memberId, classId },
    );
  }
  const full =
    assignments.value.filter(
      (booking) => findStation(state, booking.stationId)?.inService,
    ).length >= capacity.value;
  if (!full) {
    return ineligible(
      'classNotFull',
      'Join the waitlist only after all in-service stations are booked.',
      { memberId, classId },
    );
  }
  const priorOrders = state.waitlistEntries
    .filter((entry) => entry.classId === classId)
    .map((entry) => entry.joinOrder);
  if (priorOrders.some((order) => !Number.isSafeInteger(order) || order < 0)) {
    return invalid('waitlistEntries.joinOrder', 'Waitlist order is invalid.');
  }
  const joinOrder = Math.max(0, ...priorOrders) + 1;
  if (!Number.isSafeInteger(joinOrder)) {
    return invalid('joinOrder', 'No further waitlist position is available.');
  }
  const entry: WaitlistEntry = {
    entryId,
    memberId,
    classId,
    joinOrder,
    joinedAt: now,
    reviewFlags: [],
    status: 'waiting',
  };
  return {
    success: true,
    value: { waitlistEntries: [...state.waitlistEntries, entry] },
  };
}

export function leaveWaitlist(
  state: DemoState,
  actor: DemoActor,
  entryId: WaitlistEntryId,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  if (!validInstant(now)) return invalid('now', 'Provide a valid UTC instant.');
  const entry = state.waitlistEntries.find((item) => item.entryId === entryId);
  if (!entry) return unavailable('waitlist', entryId);
  if (entry.status !== 'waiting') {
    return ineligible(
      'waitlistNotActive',
      'Only an active waitlist entry can be left.',
      { memberId: entry.memberId, classId: entry.classId },
    );
  }
  const permission = requireMemberActor(
    state,
    actor,
    'manageOwnWaitlist',
    entry.memberId,
    entry.classId,
  );
  if (!permission.success) return permission;
  const scheduledClass = findClass(state, entry.classId);
  if (!scheduledClass) return unavailable('class', entry.classId);
  if (
    scheduledClass.status === 'cancelled' ||
    scheduledClass.status === 'completed' ||
    scheduledClass.endsAt <= now
  ) {
    return ineligible(
      scheduledClass.status === 'cancelled'
        ? 'classCancelled'
        : 'classCompleted',
      'The selected class is no longer active.',
      { memberId: entry.memberId, classId: entry.classId },
    );
  }
  return {
    success: true,
    value: {
      waitlistEntries: state.waitlistEntries.map((item) =>
        item.entryId === entryId
          ? { ...entry, status: 'left', leftAt: now }
          : item,
      ),
    },
  };
}

function lateCancelOutcome(
  state: DemoState,
  scheduledClass: ScheduledClass,
  now: UtcInstant,
): DomainResult<'cancelled' | 'lateCancel'> {
  const minutes = state.settings.lateCancelCutoffMinutes;
  if (!Number.isSafeInteger(minutes) || minutes < 0) {
    return invalid(
      'lateCancelCutoffMinutes',
      'The late-cancel cutoff must be a non-negative whole number of minutes.',
    );
  }
  return {
    success: true,
    value:
      !scheduledClass.lateCancelWaived &&
      Date.parse(now) > Date.parse(scheduledClass.startsAt) - minutes * 60_000
        ? 'lateCancel'
        : 'cancelled',
  };
}

export function cancelBooking(
  state: DemoState,
  actor: DemoActor,
  bookingId: BookingId,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  if (!validInstant(now)) return invalid('now', 'Provide a valid UTC instant.');
  const booking = findBooking(state, bookingId);
  if (!booking) return unavailable('booking', bookingId);
  if (booking.status !== 'booked') {
    return ineligible(
      'bookingNotActive',
      'Only an active booking can be cancelled.',
      { memberId: booking.memberId, classId: booking.classId },
    );
  }
  const permission = requireMemberActor(
    state,
    actor,
    'cancelOwnBooking',
    booking.memberId,
    booking.classId,
  );
  if (!permission.success) return permission;
  const scheduledClass = findClass(state, booking.classId);
  if (!scheduledClass) return unavailable('class', booking.classId);
  if (scheduledClass.status === 'cancelled') {
    return ineligible('classCancelled', 'The class has been cancelled.', {
      classId: booking.classId,
    });
  }
  if (scheduledClass.status === 'completed') {
    return ineligible(
      'classCompleted',
      'A completed class cannot be cancelled.',
      {
        classId: booking.classId,
      },
    );
  }
  if (Date.parse(now) > Date.parse(scheduledClass.startsAt)) {
    return ineligible(
      'classStarted',
      'Member cancellation is available only through the class start time.',
      { memberId: booking.memberId, classId: booking.classId },
    );
  }
  const outcome = lateCancelOutcome(state, scheduledClass, now);
  if (!outcome.success) return outcome;
  const cancelled: Booking = {
    ...booking,
    status: 'cancelled',
    cancelledAt: now,
    cancellationReason: 'member',
  };
  const existingAttendance = attendanceForBooking(state, booking);
  const updatedAttendance: AttendanceRecord = existingAttendance
    ? {
        ...existingAttendance,
        currentOutcome: outcome.value,
        source: { kind: 'memberCancellation', recordedAt: now },
      }
    : {
        ...attendanceRecord(booking, outcome.value, now),
        source: { kind: 'memberCancellation', recordedAt: now },
      };
  const changes: DemoStateChanges = {
    bookings: state.bookings.map((item) =>
      item.bookingId === bookingId ? cancelled : item,
    ),
    attendance: upsertAttendance(state, updatedAttendance),
  };
  return changeAfterFreeingStation(
    state,
    changes,
    scheduledClass,
    booking.stationId,
    now,
  );
}

function requireStaffBookingAction(
  state: DemoState,
  actor: DemoActor,
  capability: 'manageBookings' | 'reseatBookings',
  booking: Booking,
): DomainResult<StaffId> {
  if (actor.kind !== 'staff') {
    return ineligible(
      'roleDenied',
      'Only authorized staff may change this booking.',
      {
        memberId: booking.memberId,
        classId: booking.classId,
      },
    );
  }
  const permission = requireCapability(state, actor, capability, {
    classId: booking.classId,
  });
  if (
    !permission.success &&
    capability === 'manageBookings' &&
    actor.kind === 'staff'
  ) {
    const reseatPermission = requireCapability(state, actor, 'reseatBookings', {
      classId: booking.classId,
    });
    if (!reseatPermission.success) return reseatPermission;
    return { success: true, value: actor.staffId };
  }
  if (!permission.success) return permission;
  return { success: true, value: actor.staffId };
}

function actionableStaffClass(
  state: DemoState,
  booking: Booking,
  now: UtcInstant,
): DomainResult<ScheduledClass> {
  if (!validInstant(now)) return invalid('now', 'Provide a valid UTC instant.');
  const scheduledClass = findClass(state, booking.classId);
  if (!scheduledClass) return unavailable('class', booking.classId);
  if (
    !validInstant(scheduledClass.startsAt) ||
    !validInstant(scheduledClass.endsAt) ||
    scheduledClass.endsAt <= scheduledClass.startsAt
  ) {
    return invalid(
      'class',
      'The scheduled class has an invalid UTC time window.',
    );
  }
  if (scheduledClass.status === 'cancelled') {
    return ineligible('classCancelled', 'The class has been cancelled.', {
      classId: booking.classId,
    });
  }
  if (scheduledClass.status === 'completed') {
    return ineligible('classCompleted', 'The class is already complete.', {
      classId: booking.classId,
    });
  }
  if (scheduledClass.status !== 'published') {
    return ineligible('classNotPublished', 'The class is not published.', {
      classId: booking.classId,
    });
  }
  if (Date.parse(now) > Date.parse(scheduledClass.endsAt)) {
    return ineligible('classEnded', 'The class has ended.', {
      classId: booking.classId,
    });
  }
  return { success: true, value: scheduledClass };
}

export function removeBooking(
  state: DemoState,
  actor: DemoActor,
  bookingId: BookingId,
  reason: string,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  if (!reason.trim())
    return invalid('reason', 'Explain why the booking is removed.');
  const booking = findBooking(state, bookingId);
  if (!booking) return unavailable('booking', bookingId);
  if (booking.status !== 'booked') {
    return ineligible(
      'bookingNotActive',
      'Only an active booking can be removed.',
      { memberId: booking.memberId, classId: booking.classId },
    );
  }
  const permission = requireStaffBookingAction(
    state,
    actor,
    'manageBookings',
    booking,
  );
  if (!permission.success) return permission;
  const scheduledClass = actionableStaffClass(state, booking, now);
  if (!scheduledClass.success) return scheduledClass;
  const staffId = permission.value;
  const removed: Booking = {
    ...booking,
    status: 'staffRemoved',
    removedAt: now,
    removedBy: staffId,
    removalReason: reason.trim(),
  };
  const existingAttendance = attendanceForBooking(state, booking);
  const updatedAttendance: AttendanceRecord = existingAttendance
    ? {
        ...existingAttendance,
        currentOutcome: 'staffRemoved',
        source: { kind: 'staff', staffId, recordedAt: now },
      }
    : {
        ...attendanceRecord(booking, 'staffRemoved', now),
        source: { kind: 'staff', staffId, recordedAt: now },
      };
  const changes: DemoStateChanges = {
    bookings: state.bookings.map((item) =>
      item.bookingId === bookingId ? removed : item,
    ),
    attendance: upsertAttendance(state, updatedAttendance),
    waitlistEntries: state.waitlistEntries.map((entry) =>
      entry.classId === booking.classId &&
      entry.memberId === booking.memberId &&
      entry.status === 'waiting'
        ? {
            ...entry,
            status: 'cancelled',
            cancelledAt: now,
            reason: 'staffRemoval',
          }
        : entry,
    ),
  };
  return changeAfterFreeingStation(
    state,
    changes,
    scheduledClass.value,
    booking.stationId,
    now,
  );
}

export function cancelClassReservations(
  state: DemoState,
  classId: ClassId,
  cancelledAt: UtcInstant,
): DomainResult<DemoStateChanges> {
  if (!validInstant(cancelledAt)) {
    return invalid('cancelledAt', 'Provide a valid UTC cancellation instant.');
  }
  const scheduledClass = findClass(state, classId);
  if (!scheduledClass) return unavailable('class', classId);
  if (
    scheduledClass.status !== 'cancelled' ||
    !scheduledClass.cancelledAt ||
    scheduledClass.cancelledAt !== cancelledAt
  ) {
    return invalid(
      'classId',
      'Apply class cancellation bookkeeping after the class is cancelled.',
    );
  }
  return {
    success: true,
    value: {
      bookings: state.bookings.map((booking): Booking =>
        booking.classId === classId && booking.status === 'booked'
          ? {
              ...booking,
              status: 'cancelled',
              cancelledAt,
              cancellationReason: 'classCancelled',
            }
          : booking,
      ),
      waitlistEntries: state.waitlistEntries.map((entry): WaitlistEntry =>
        entry.classId === classId && entry.status === 'waiting'
          ? {
              ...entry,
              status: 'cancelled',
              cancelledAt,
              reason: 'classCancelled',
            }
          : entry,
      ),
    },
  };
}

function requireMemberBooking(
  state: DemoState,
  actor: DemoActor,
  bookingId: BookingId,
  capability: 'moveOwnBooking',
  now: UtcInstant,
): DomainResult<{
  readonly booking: Booking;
  readonly scheduledClass: ScheduledClass;
}> {
  const booking = findBooking(state, bookingId);
  if (!booking) return unavailable('booking', bookingId);
  if (booking.status !== 'booked') {
    return ineligible(
      'bookingNotActive',
      'Only an active booking can be moved.',
      { memberId: booking.memberId, classId: booking.classId },
    );
  }
  const permission = requireMemberActor(
    state,
    actor,
    capability,
    booking.memberId,
    booking.classId,
  );
  if (!permission.success) return permission;
  const eligibility = requireEligibleMember(state, booking.memberId, now);
  if (!eligibility.success) return eligibility;
  const scheduledClass = classWindow(state, booking.classId, now);
  if (!scheduledClass.success) return scheduledClass;
  if (Date.parse(now) >= Date.parse(scheduledClass.value.startsAt)) {
    return ineligible(
      'classStarted',
      'Members may move a booking only before class starts.',
      { memberId: booking.memberId, classId: booking.classId },
    );
  }
  return {
    success: true,
    value: { booking, scheduledClass: scheduledClass.value },
  };
}

function moveBookingToFreeStation(
  state: DemoState,
  booking: Booking,
  destination: Station,
): DemoStateChanges {
  return {
    bookings: state.bookings.map((item) =>
      item.bookingId === booking.bookingId
        ? { ...item, stationId: destination.stationId }
        : item,
    ),
  };
}

export function moveOwnBooking(
  state: DemoState,
  actor: DemoActor,
  bookingId: BookingId,
  destinationStationId: StationId,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  const selected = requireMemberBooking(
    state,
    actor,
    bookingId,
    'moveOwnBooking',
    now,
  );
  if (!selected.success) return selected;
  const assignments = validateBookingAssignments(
    state,
    selected.value.booking.classId,
  );
  if (!assignments.success) return assignments;
  const destination = requireAvailableStation(
    state,
    actor,
    selected.value.booking.classId,
    destinationStationId,
    now,
    assignments.value.filter(
      (item) => item.bookingId !== selected.value.booking.bookingId,
    ),
  );
  if (!destination.success) return destination;
  if (destination.value.stationId === selected.value.booking.stationId) {
    return invalid('destinationStationId', 'Choose a different station.');
  }
  return {
    success: true,
    value: moveBookingToFreeStation(
      state,
      selected.value.booking,
      destination.value,
    ),
  };
}

function staffReseatContext(
  state: DemoState,
  actor: DemoActor,
  bookingId: BookingId,
  now: UtcInstant,
): DomainResult<{
  readonly booking: Booking;
  readonly scheduledClass: ScheduledClass;
}> {
  const booking = findBooking(state, bookingId);
  if (!booking) return unavailable('booking', bookingId);
  if (booking.status !== 'booked') {
    return ineligible(
      'bookingNotActive',
      'Only an active booking can be reseated.',
      { memberId: booking.memberId, classId: booking.classId },
    );
  }
  const permission = requireStaffBookingAction(
    state,
    actor,
    'reseatBookings',
    booking,
  );
  if (!permission.success) return permission;
  const scheduledClass = actionableStaffClass(state, booking, now);
  if (!scheduledClass.success) return scheduledClass;
  if (state.layout.availability !== 'current') {
    return unavailable(
      'layout',
      booking.classId,
      state.layout.availability === 'stale',
    );
  }
  const assignments = validateBookingAssignments(state, booking.classId);
  if (!assignments.success) return assignments;
  return {
    success: true,
    value: { booking, scheduledClass: scheduledClass.value },
  };
}

export function moveBooking(
  state: DemoState,
  actor: DemoActor,
  bookingId: BookingId,
  destinationStationId: StationId,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  const selected = staffReseatContext(state, actor, bookingId, now);
  if (!selected.success) return selected;
  const assignments = validateBookingAssignments(
    state,
    selected.value.booking.classId,
  );
  if (!assignments.success) return assignments;
  const destination = findStation(state, destinationStationId);
  if (!destination) return unavailable('station', destinationStationId);
  if (!destination.inService) {
    return ineligible(
      'stationOutOfService',
      'Move only to an in-service station.',
      {
        classId: selected.value.booking.classId,
      },
    );
  }
  if (destination.stationId === selected.value.booking.stationId) {
    return invalid('destinationStationId', 'Choose a different station.');
  }
  if (
    assignments.value.some(
      (booking) =>
        booking.bookingId !== selected.value.booking.bookingId &&
        booking.stationId === destination.stationId,
    )
  ) {
    return ineligible(
      'confirmationRequired',
      'The destination is occupied. Confirm a swap before changing either booking.',
      { classId: selected.value.booking.classId },
    );
  }
  const changes = moveBookingToFreeStation(
    state,
    selected.value.booking,
    destination,
  );
  return changeAfterFreeingStation(
    state,
    changes,
    selected.value.scheduledClass,
    selected.value.booking.stationId,
    now,
  );
}

export function swapBookings(
  state: DemoState,
  actor: DemoActor,
  bookingId: BookingId,
  otherBookingId: BookingId,
  now: UtcInstant,
  confirmed: boolean,
): DomainResult<DemoStateChanges> {
  if (!confirmed) {
    return ineligible(
      'confirmationRequired',
      'Confirm the occupied-station swap before changing either booking.',
    );
  }
  if (bookingId === otherBookingId) {
    return invalid('otherBookingId', 'Choose a different booking to swap.');
  }
  const first = staffReseatContext(state, actor, bookingId, now);
  if (!first.success) return first;
  const secondBooking = findBooking(state, otherBookingId);
  if (!secondBooking) return unavailable('booking', otherBookingId);
  if (secondBooking.status !== 'booked') {
    return ineligible(
      'bookingNotActive',
      'Both bookings must be active to swap stations.',
      { memberId: secondBooking.memberId, classId: secondBooking.classId },
    );
  }
  if (secondBooking.classId !== first.value.booking.classId) {
    return invalid('otherBookingId', 'Swap bookings from the same class only.');
  }
  const second = staffReseatContext(state, actor, otherBookingId, now);
  if (!second.success) return second;
  const firstStation = findStation(state, first.value.booking.stationId);
  const secondStation = findStation(state, secondBooking.stationId);
  if (!firstStation || !secondStation) {
    return unavailable(
      'station',
      !firstStation ? first.value.booking.stationId : secondBooking.stationId,
      true,
    );
  }
  if (!firstStation.inService || !secondStation.inService) {
    return ineligible(
      'stationOutOfService',
      'Both stations in a swap must be in service.',
      { classId: first.value.booking.classId },
    );
  }
  const assignments = validateBookingAssignments(
    state,
    first.value.booking.classId,
  );
  if (!assignments.success) return assignments;
  return {
    success: true,
    value: {
      bookings: state.bookings.map((booking) => {
        if (booking.bookingId === first.value.booking.bookingId) {
          return { ...booking, stationId: secondStation.stationId };
        }
        if (booking.bookingId === secondBooking.bookingId) {
          return { ...booking, stationId: firstStation.stationId };
        }
        return booking;
      }),
    },
  };
}
