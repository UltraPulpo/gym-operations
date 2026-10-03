import { completeClass } from './scheduling';
import { checkMemberEligibility } from './membership';
import { requireCapability } from './roles';
import type {
  AttendanceCorrection,
  AttendanceId,
  AttendanceOutcome,
  AttendanceRecord,
  Booking,
  BookingId,
  ClassId,
  DemoActor,
  DemoState,
  DemoStateChanges,
  DomainResource,
  DomainResult,
  IneligibilityReason,
  MemberId,
  ScheduledClass,
  StaffId,
  UtcInstant,
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
  resourceId: string,
): DomainResult<never> {
  return {
    success: false,
    error: {
      category: 'DemoUnavailableState',
      message: `The demo ${resource} is unavailable.`,
      resource,
      resourceId,
      stale: false,
    },
  };
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

function hasValidClassWindow(scheduledClass: ScheduledClass): boolean {
  return (
    validInstant(scheduledClass.startsAt) &&
    validInstant(scheduledClass.endsAt) &&
    Date.parse(scheduledClass.endsAt) > Date.parse(scheduledClass.startsAt)
  );
}

function isAttendanceOutcome(value: string): value is AttendanceOutcome {
  return (
    value === 'booked' ||
    value === 'attended' ||
    value === 'cancelled' ||
    value === 'lateCancel' ||
    value === 'noShow' ||
    value === 'staffRemoved'
  );
}

function findBooking(
  state: DemoState,
  bookingId: BookingId,
): Booking | undefined {
  return state.bookings.find((item) => item.bookingId === bookingId);
}

function findAttendance(
  state: DemoState,
  attendanceId: AttendanceId,
): AttendanceRecord | undefined {
  return state.attendance.find((item) => item.attendanceId === attendanceId);
}

function authorizeStaff(
  state: DemoState,
  actor: DemoActor,
  classId: ClassId,
): DomainResult<StaffId> {
  if (actor.kind !== 'staff') {
    return ineligible(
      'roleDenied',
      'Only authorized staff may manage demo attendance.',
      { classId },
    );
  }
  const permission = requireCapability(state, actor, 'manageAttendance', {
    classId,
  });
  if (!permission.success) return permission;
  return { success: true, value: actor.staffId };
}

function correctionId(
  state: DemoState,
  attendanceId: AttendanceId,
  ordinal: number,
): AttendanceCorrection['correctionId'] {
  const suffix = attendanceId.slice('attendance:'.length);
  let next = ordinal;
  let candidate =
    `correction:${suffix}:${next}` as AttendanceCorrection['correctionId'];
  const used = new Set(
    state.attendance.flatMap((record) =>
      record.corrections.map((correction) => correction.correctionId),
    ),
  );
  while (used.has(candidate)) {
    next += 1;
    candidate =
      `correction:${suffix}:${next}` as AttendanceCorrection['correctionId'];
  }
  return candidate;
}

function makeCorrection(
  state: DemoState,
  record: AttendanceRecord,
  staffId: StaffId,
  previousOutcome: AttendanceOutcome,
  newOutcome: AttendanceOutcome,
  reason: string,
  recordedAt: UtcInstant,
  previousCheckIn?: AttendanceRecord['checkIn'],
  newCheckIn?: AttendanceRecord['checkIn'],
): AttendanceCorrection {
  return {
    correctionId: correctionId(
      state,
      record.attendanceId,
      record.corrections.length + 1,
    ),
    staffId,
    previousOutcome,
    newOutcome,
    recordedAt,
    reason,
    ...(previousCheckIn === undefined ? {} : { previousCheckIn }),
    ...(newCheckIn === undefined ? {} : { newCheckIn }),
  };
}

function appendCorrection(
  record: AttendanceRecord,
  correction: AttendanceCorrection,
): AttendanceRecord {
  return {
    ...record,
    currentOutcome: correction.newOutcome,
    corrections: [...record.corrections, correction],
  };
}

function attendanceForBooking(
  state: DemoState,
  booking: Booking,
): AttendanceRecord | undefined {
  return (
    state.attendance.find(
      (record) =>
        record.attendanceId === booking.attendanceRecordId ||
        record.bookingId === booking.bookingId,
    ) ?? undefined
  );
}

function upsertAttendance(
  state: DemoState,
  updated: AttendanceRecord,
): readonly AttendanceRecord[] {
  const found = state.attendance.some(
    (record) => record.attendanceId === updated.attendanceId,
  );
  return found
    ? state.attendance.map((record) =>
        record.attendanceId === updated.attendanceId ? updated : record,
      )
    : [...state.attendance, updated];
}

export function checkIn(
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
      'Only an active booking can be checked in.',
      { memberId: booking.memberId, classId: booking.classId },
    );
  }
  const scheduledClass = findClass(state, booking.classId);
  if (!scheduledClass) return unavailable('class', booking.classId);
  if (!hasValidClassWindow(scheduledClass)) {
    return invalid(
      'class',
      'The scheduled class requires a valid UTC time window.',
    );
  }
  if (scheduledClass.status === 'cancelled') {
    return ineligible(
      'classCancelled',
      'A cancelled class cannot accept check-ins.',
      { memberId: booking.memberId, classId: booking.classId },
    );
  }

  let staffId: StaffId | undefined;
  if (actor.kind === 'member') {
    if (scheduledClass.status !== 'published') {
      return ineligible(
        scheduledClass.status === 'completed'
          ? 'classCompleted'
          : 'classNotPublished',
        'Members may check in only to a published class.',
        { memberId: booking.memberId, classId: booking.classId },
      );
    }
    const permission = requireCapability(state, actor, 'selfCheckIn', {
      memberId: booking.memberId,
    });
    if (!permission.success) return permission;
    if (actor.memberId !== booking.memberId) {
      return ineligible(
        'roleDenied',
        'Members may check in only for their own booking.',
        { memberId: booking.memberId, classId: booking.classId },
      );
    }
    const eligibility = checkMemberEligibility(state, booking.memberId, now);
    if (!eligibility.success) return eligibility;
    if (
      !Number.isSafeInteger(state.settings.checkInLeadMinutes) ||
      state.settings.checkInLeadMinutes < 0 ||
      !Number.isSafeInteger(state.settings.checkInGraceMinutes) ||
      state.settings.checkInGraceMinutes < 0
    ) {
      return invalid(
        'settings',
        'Check-in lead and grace settings must be nonnegative whole minutes.',
      );
    }
    const openAt =
      Date.parse(scheduledClass.startsAt) -
      state.settings.checkInLeadMinutes * 60_000;
    const closeAt =
      Date.parse(scheduledClass.startsAt) +
      state.settings.checkInGraceMinutes * 60_000;
    const instant = Date.parse(now);
    if (
      instant < openAt ||
      instant > closeAt ||
      instant >= Date.parse(scheduledClass.endsAt)
    ) {
      return ineligible(
        instant < openAt || instant > closeAt
          ? 'outsideCheckInWindow'
          : 'classEnded',
        'Member check-in is available only in the configured class window.',
        { memberId: booking.memberId, classId: booking.classId },
      );
    }
  } else {
    const permission = authorizeStaff(state, actor, booking.classId);
    if (!permission.success) return permission;
    staffId = permission.value;
  }

  const existing = attendanceForBooking(state, booking);
  const atOrAfterEnd =
    scheduledClass.status === 'completed' ||
    Date.parse(now) >= Date.parse(scheduledClass.endsAt);
  const nextCheckIn = atOrAfterEnd
    ? (existing?.checkIn ?? { status: 'notCheckedIn' as const })
    : {
        status: 'checkedIn' as const,
        checkedInAt: now,
        checkedInBy: { ...actor },
      };
  const nextOutcome: AttendanceOutcome = 'attended';

  if (!existing) {
    return {
      success: true,
      value: {
        attendance: [
          {
            attendanceId: booking.attendanceRecordId,
            bookingId: booking.bookingId,
            classId: booking.classId,
            memberId: booking.memberId,
            currentOutcome: nextOutcome,
            checkIn: nextCheckIn,
            source: staffId
              ? { kind: 'staff', staffId, recordedAt: now }
              : { kind: 'booking', bookingId: booking.bookingId },
            corrections: [],
          },
        ],
      },
    };
  }

  if (existing.checkIn.status === 'checkedIn' && !atOrAfterEnd) {
    return invalid('bookingId', 'This booking is already checked in.');
  }
  const source = staffId
    ? { kind: 'staff' as const, staffId, recordedAt: now }
    : existing.source;
  const changesOutcome = existing.currentOutcome !== nextOutcome;
  const changesCheckIn = !atOrAfterEnd;
  if (!changesOutcome && !changesCheckIn) {
    return invalid('bookingId', 'This booking is already checked in.');
  }
  const correction =
    staffId === undefined
      ? undefined
      : makeCorrection(
          state,
          existing,
          staffId,
          existing.currentOutcome,
          nextOutcome,
          atOrAfterEnd
            ? 'Staff check-in recorded after class end.'
            : 'Staff check-in.',
          now,
          changesCheckIn ? existing.checkIn : undefined,
          changesCheckIn ? nextCheckIn : undefined,
        );
  const updated: AttendanceRecord = {
    ...existing,
    currentOutcome: nextOutcome,
    checkIn: nextCheckIn,
    source,
    corrections: correction
      ? [...existing.corrections, correction]
      : existing.corrections,
  };
  return {
    success: true,
    value: { attendance: upsertAttendance(state, updated) },
  };
}

export function reverseCheckIn(
  state: DemoState,
  actor: DemoActor,
  attendanceId: AttendanceId,
  reason: string,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  if (!validInstant(now)) return invalid('now', 'Provide a valid UTC instant.');
  if (!reason.trim())
    return invalid('reason', 'Explain why check-in is reversed.');
  const existing = findAttendance(state, attendanceId);
  if (!existing) return unavailable('attendance', attendanceId);
  const permission = authorizeStaff(state, actor, existing.classId);
  if (!permission.success) return permission;
  const scheduledClass = findClass(state, existing.classId);
  if (!scheduledClass) return unavailable('class', existing.classId);
  if (!hasValidClassWindow(scheduledClass)) {
    return invalid(
      'class',
      'The scheduled class requires a valid UTC time window.',
    );
  }
  if (scheduledClass.status === 'cancelled') {
    return ineligible('classCancelled', 'A cancelled class has no check-in.', {
      classId: existing.classId,
    });
  }
  if (existing.checkIn.status !== 'checkedIn') {
    return invalid('attendanceId', 'This attendance record is not checked in.');
  }

  const afterEnd =
    scheduledClass.status === 'completed' ||
    Date.parse(now) >= Date.parse(scheduledClass.endsAt);
  const nextOutcome: AttendanceOutcome = afterEnd ? 'noShow' : 'booked';
  const nextCheckIn = afterEnd
    ? existing.checkIn
    : { status: 'notCheckedIn' as const };
  const correction = makeCorrection(
    state,
    existing,
    permission.value,
    existing.currentOutcome,
    nextOutcome,
    reason.trim(),
    now,
    afterEnd ? undefined : existing.checkIn,
    afterEnd ? undefined : nextCheckIn,
  );
  const updated = {
    ...appendCorrection(existing, correction),
    checkIn: nextCheckIn,
    source: {
      kind: 'staff' as const,
      staffId: permission.value,
      recordedAt: now,
    },
  };
  return {
    success: true,
    value: { attendance: upsertAttendance(state, updated) },
  };
}

export function correctAttendance(
  state: DemoState,
  actor: DemoActor,
  attendanceId: AttendanceId,
  outcome: AttendanceOutcome,
  reason: string,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  if (!validInstant(now)) return invalid('now', 'Provide a valid UTC instant.');
  if (!reason.trim())
    return invalid('reason', 'Explain the attendance correction.');
  if (!isAttendanceOutcome(outcome)) {
    return invalid('outcome', 'Choose a supported attendance outcome.');
  }
  const existing = findAttendance(state, attendanceId);
  if (!existing) return unavailable('attendance', attendanceId);
  const permission = authorizeStaff(state, actor, existing.classId);
  if (!permission.success) return permission;
  if (existing.currentOutcome === outcome) {
    return invalid(
      'outcome',
      'Choose an outcome different from the current one.',
    );
  }
  const correction = makeCorrection(
    state,
    existing,
    permission.value,
    existing.currentOutcome,
    outcome,
    reason.trim(),
    now,
  );
  const updated = {
    ...appendCorrection(existing, correction),
    source: {
      kind: 'staff' as const,
      staffId: permission.value,
      recordedAt: now,
    },
  };
  return {
    success: true,
    value: { attendance: upsertAttendance(state, updated) },
  };
}

export function recordManualAttendance(
  state: DemoState,
  actor: DemoActor,
  classId: ClassId,
  memberId: MemberId,
  outcome: AttendanceOutcome,
  reason: string,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  if (!validInstant(now)) return invalid('now', 'Provide a valid UTC instant.');
  if (!reason.trim())
    return invalid('reason', 'Explain the manual attendance entry.');
  if (!isAttendanceOutcome(outcome)) {
    return invalid('outcome', 'Choose a supported attendance outcome.');
  }
  const scheduledClass = findClass(state, classId);
  if (!scheduledClass) return unavailable('class', classId);
  if (!hasValidClassWindow(scheduledClass)) {
    return invalid(
      'class',
      'The scheduled class requires a valid UTC time window.',
    );
  }
  if (scheduledClass.status === 'cancelled') {
    return ineligible(
      'classCancelled',
      'A cancelled class cannot have attendance.',
      {
        classId,
      },
    );
  }
  if (!state.members.some((member) => member.memberId === memberId)) {
    return unavailable('member', memberId);
  }
  const permission = authorizeStaff(state, actor, classId);
  if (!permission.success) return permission;
  const booking = state.bookings.find(
    (item) => item.classId === classId && item.memberId === memberId,
  );
  const existing =
    (booking &&
      state.attendance.find(
        (record) =>
          record.attendanceId === booking.attendanceRecordId ||
          record.bookingId === booking.bookingId,
      )) ||
    state.attendance.find(
      (record) => record.classId === classId && record.memberId === memberId,
    );
  const attendanceId =
    existing?.attendanceId ??
    booking?.attendanceRecordId ??
    (`attendance:${classId}:${memberId}` as AttendanceId);
  const correction =
    existing && existing.currentOutcome !== outcome
      ? makeCorrection(
          state,
          existing,
          permission.value,
          existing.currentOutcome,
          outcome,
          reason.trim(),
          now,
        )
      : undefined;
  const updated: AttendanceRecord = existing
    ? {
        ...existing,
        currentOutcome: outcome,
        source: {
          kind: 'manualOutage',
          staffId: permission.value,
          recordedAt: now,
        },
        corrections: correction
          ? [...existing.corrections, correction]
          : existing.corrections,
      }
    : {
        attendanceId,
        ...(booking ? { bookingId: booking.bookingId } : {}),
        classId,
        memberId,
        currentOutcome: outcome,
        checkIn: { status: 'notCheckedIn' },
        source: {
          kind: 'manualOutage',
          staffId: permission.value,
          recordedAt: now,
        },
        corrections: [],
      };
  return {
    success: true,
    value: { attendance: upsertAttendance(state, updated) },
  };
}

export function advanceAttendanceClock(
  state: DemoState,
  to: UtcInstant,
): DomainResult<DemoStateChanges> {
  const from = state.clock.now;
  if (!validInstant(from))
    return invalid('clock.now', 'Provide a valid current UTC instant.');
  if (!validInstant(to))
    return invalid('to', 'Provide a valid target UTC instant.');
  if (Date.parse(to) < Date.parse(from)) {
    return ineligible(
      'backwardClock',
      'The demo clock moves forward only; load a scenario to return to an earlier time.',
    );
  }
  if (to === from) return { success: true, value: {} };

  const classes = [...state.classes];
  const attendance = [...state.attendance];
  let classesChanged = false;
  let attendanceChanged = false;
  for (const scheduledClass of state.classes) {
    if (
      scheduledClass.status !== 'cancelled' &&
      scheduledClass.status !== 'draft' &&
      !hasValidClassWindow(scheduledClass)
    ) {
      return invalid(
        'class.endsAt',
        'Every scheduled class requires a valid UTC time window.',
      );
    }
    const endMillis = Date.parse(scheduledClass.endsAt);
    if (
      scheduledClass.status === 'cancelled' ||
      scheduledClass.status === 'draft' ||
      Date.parse(from) >= endMillis ||
      endMillis > Date.parse(to)
    ) {
      continue;
    }
    if (scheduledClass.status === 'published') {
      const completed = completeClass(
        classes,
        scheduledClass.classId,
        scheduledClass.endsAt,
      );
      if (!completed.success) return completed;
      const classIndex = classes.findIndex(
        (item) => item.classId === scheduledClass.classId,
      );
      classes[classIndex] = completed.value;
      classesChanged = true;
    }
    for (const booking of state.bookings) {
      if (
        booking.classId !== scheduledClass.classId ||
        booking.status !== 'booked'
      ) {
        continue;
      }
      const index = attendance.findIndex(
        (record) =>
          record.attendanceId === booking.attendanceRecordId ||
          record.bookingId === booking.bookingId,
      );
      const existing = index < 0 ? undefined : attendance[index];
      if (
        existing &&
        (existing.currentOutcome !== 'booked' ||
          existing.checkIn.status !== 'notCheckedIn')
      ) {
        continue;
      }
      const noShow: AttendanceRecord = existing
        ? {
            ...existing,
            currentOutcome: 'noShow',
            source: { kind: 'classEnd', recordedAt: scheduledClass.endsAt },
          }
        : {
            attendanceId: booking.attendanceRecordId,
            bookingId: booking.bookingId,
            classId: booking.classId,
            memberId: booking.memberId,
            currentOutcome: 'noShow',
            checkIn: { status: 'notCheckedIn' },
            source: { kind: 'classEnd', recordedAt: scheduledClass.endsAt },
            corrections: [],
          };
      if (index < 0) attendance.push(noShow);
      else attendance[index] = noShow;
      attendanceChanged = true;
    }
  }

  return {
    success: true,
    value: {
      clock: { now: to, presetId: null },
      ...(classesChanged ? { classes } : {}),
      ...(attendanceChanged ? { attendance } : {}),
    },
  };
}
