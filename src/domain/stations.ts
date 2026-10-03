import type {
  ClassId,
  DemoActor,
  DemoState,
  DomainResult,
  GridPosition,
  LayoutView,
  MemberLayoutStation,
  ScheduledClass,
  StaffLayoutStation,
  Station,
  StationId,
  StationUpdate,
  StationState,
  UtcInstant,
} from './types';

export function getClassCapacity(state: Pick<DemoState, 'stations'>): number {
  return state.stations.filter((station) => station.inService).length;
}

/** Shared publication/booking guard; capacity never cancels an existing class. */
export function validateClassCapacity(
  state: Pick<DemoState, 'stations'>,
  classId?: ClassId,
): DomainResult<number> {
  const capacity = getClassCapacity(state);
  return capacity > 0
    ? { success: true, value: capacity }
    : {
        success: false,
        error: {
          category: 'IneligibleDemoAction',
          reason: 'zeroCapacity',
          message:
            'No stations are in service. Classes cannot be published or booked.',
          ...(classId ? { classId } : {}),
        },
      };
}

function requireAdmin(state: DemoState, actor: DemoActor): DomainResult<true> {
  const staff =
    actor.kind === 'staff'
      ? state.staffAccounts.find((item) => item.staffId === actor.staffId)
      : undefined;
  if (!staff?.active || !staff.assignedRoles.includes('admin')) {
    return {
      success: false,
      error: {
        category: 'IneligibleDemoAction',
        reason: staff && !staff.active ? 'inactiveStaff' : 'roleDenied',
        message: 'An active Admin is required to edit stations or the layout.',
      },
    };
  }
  return { success: true, value: true };
}

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

function missingStation(stationId: StationId): DomainResult<never> {
  return {
    success: false,
    error: {
      category: 'DemoUnavailableState',
      message: 'The station is unavailable. Reload the station list.',
      resource: 'station',
      resourceId: stationId,
      stale: false,
    },
  };
}

function validPosition(row: number, column: number): boolean {
  return (
    Number.isSafeInteger(row) &&
    row >= 0 &&
    Number.isSafeInteger(column) &&
    column >= 0
  );
}

function reconcileServiceState(
  state: DemoState,
  stations: readonly Station[],
): DemoState {
  const capacity = getClassCapacity({ stations });
  return {
    ...state,
    stations,
    classes: state.classes.map((item) => {
      if (item.status === 'completed' || item.status === 'cancelled')
        return item;
      return {
        ...item,
        reviewFlags: capacity === 0 ? ['zeroCapacity'] : [],
      };
    }),
    bookings: state.bookings.map((item) => {
      if (item.status !== 'booked') return item;
      const station = stations.find(
        (station) => station.stationId === item.stationId,
      );
      const flags = item.reviewFlags.filter(
        (flag) => flag !== 'stationOutOfService',
      );
      return {
        ...item,
        reviewFlags:
          station && !station.inService
            ? [...flags, 'stationOutOfService']
            : flags,
      };
    }),
  };
}

export function createStation(
  state: DemoState,
  station: Station,
  actor: DemoActor = state.activeActor,
): DomainResult<DemoState> {
  const permission = requireAdmin(state, actor);
  if (!permission.success) return permission;
  if (state.stations.some((item) => item.stationId === station.stationId)) {
    return invalid('stationId', 'A station with this ID already exists.');
  }
  if (!validPosition(station.row, station.column)) {
    return invalid(
      'position',
      'Grid coordinates must be non-negative whole numbers.',
    );
  }
  if (
    state.stations.some(
      (item) => item.row === station.row && item.column === station.column,
    )
  ) {
    return invalid('position', 'This grid cell already contains a station.');
  }
  if (!station.label.trim())
    return invalid('label', 'A station label is required.');
  return {
    success: true,
    value: reconcileServiceState(state, [...state.stations, { ...station }]),
  };
}

export function updateStation(
  state: DemoState,
  stationId: StationId,
  updates: StationUpdate,
  actor: DemoActor = state.activeActor,
): DomainResult<DemoState> {
  const permission = requireAdmin(state, actor);
  if (!permission.success) return permission;
  const station = state.stations.find((item) => item.stationId === stationId);
  if (!station) return missingStation(stationId);
  if (updates.label !== undefined && !updates.label.trim()) {
    return invalid('label', 'A station label is required.');
  }
  const replacement: Station = {
    ...station,
    label: updates.label ?? station.label,
    pm5Serial:
      updates.pm5Serial === undefined ? station.pm5Serial : updates.pm5Serial,
    inService: updates.inService ?? station.inService,
  };
  const stations = state.stations.map((item) =>
    item.stationId === stationId ? replacement : item,
  );
  return {
    success: true,
    value:
      replacement.inService === station.inService
        ? { ...state, stations }
        : reconcileServiceState(state, stations),
  };
}

export function placeStation(
  state: DemoState,
  stationId: StationId,
  position: GridPosition,
  actor: DemoActor = state.activeActor,
): DomainResult<DemoState> {
  const permission = requireAdmin(state, actor);
  if (!permission.success) return permission;
  const station = state.stations.find((item) => item.stationId === stationId);
  if (!station) return missingStation(stationId);
  if (!validPosition(position.row, position.column)) {
    return invalid(
      'position',
      'Grid coordinates must be non-negative whole numbers.',
    );
  }
  if (station.row === position.row && station.column === position.column) {
    return { success: true, value: state };
  }
  const occupied = state.stations.find(
    (item) => item.row === position.row && item.column === position.column,
  );
  const stations = state.stations.map((item) => {
    if (item.stationId === stationId) {
      return { ...item, row: position.row, column: position.column };
    }
    if (item.stationId === occupied?.stationId) {
      return { ...item, row: station.row, column: station.column };
    }
    return item;
  });
  return { success: true, value: { ...state, stations } };
}

export function setLayoutOrientation(
  state: DemoState,
  orientationLabel: string,
  actor: DemoActor = state.activeActor,
): DomainResult<DemoState> {
  const permission = requireAdmin(state, actor);
  if (!permission.success) return permission;
  const { orientationLabel: previousLabel, ...layout } = state.layout;
  const label = orientationLabel.trim();
  if (label === previousLabel) return { success: true, value: state };
  return {
    success: true,
    value: {
      ...state,
      layout: label ? { ...layout, orientationLabel: label } : layout,
    },
  };
}

const stateLabels: Record<StationState, string> = {
  available: 'Available',
  bookedNotCheckedIn: 'Booked, not checked in',
  bookedCheckedIn: 'Booked, checked in',
  outOfService: 'Out of service',
};

function unavailableLayout(
  message: string,
  classId?: ClassId,
  stale = false,
  resource: 'layout' | 'class' = 'layout',
): LayoutView {
  return {
    status: 'unavailable',
    ...(classId ? { classId } : {}),
    canReseat: false,
    error: {
      category: 'DemoUnavailableState',
      message,
      resource,
      ...(classId && resource === 'class' ? { resourceId: classId } : {}),
      stale,
    },
  };
}

function memberClassVisible(
  state: DemoState,
  scheduledClass: ScheduledClass,
  now: UtcInstant,
): boolean {
  if (scheduledClass.status !== 'published') return false;
  if (scheduledClass.releasedAt && scheduledClass.releasedAt <= now)
    return true;
  const policy = state.settings.scheduleRelease;
  return (
    policy.mode === 'immediate' ||
    (policy.mode === 'rolling' &&
      Date.parse(now) >=
        Date.parse(scheduledClass.startsAt) - policy.advanceMinutes * 60_000)
  );
}

/** Omit classId to select the in-progress class, otherwise the next future class. */
export function selectClassLayout(
  state: DemoState,
  classId?: ClassId,
  actor: DemoActor = state.activeActor,
  now: UtcInstant = state.clock.now,
): LayoutView {
  if (state.layout.availability !== 'current') {
    return unavailableLayout(
      state.layout.availability === 'stale'
        ? 'Class layout data is stale. Refresh before changing assignments.'
        : 'Class layout data is unavailable. Map-based reseating is disabled.',
      classId,
      state.layout.availability === 'stale',
    );
  }
  const staff =
    actor.kind === 'staff'
      ? state.staffAccounts.find((item) => item.staffId === actor.staffId)
      : undefined;
  const knownMember =
    actor.kind === 'member' &&
    state.members.some((item) => item.memberId === actor.memberId);
  if (!knownMember && (!staff?.active || staff.assignedRoles.length === 0)) {
    return unavailableLayout('This actor cannot view class layouts.', classId);
  }
  if (
    state.stations.some(
      (station) => !validPosition(station.row, station.column),
    ) ||
    new Set(state.stations.map((station) => station.stationId)).size !==
      state.stations.length ||
    new Set(state.stations.map((station) => `${station.row}:${station.column}`))
      .size !== state.stations.length
  ) {
    return unavailableLayout(
      'Station positions are inconsistent. Refresh the layout.',
      classId,
      true,
    );
  }
  const selectable = (item: ScheduledClass) =>
    item.status !== 'cancelled' &&
    item.status !== 'completed' &&
    item.endsAt > now &&
    (actor.kind !== 'member' || memberClassVisible(state, item, now));
  const selected = classId
    ? state.classes.find((item) => item.classId === classId && selectable(item))
    : state.classes
        .filter(selectable)
        .sort(
          (left, right) =>
            left.startsAt.localeCompare(right.startsAt) ||
            left.classId.localeCompare(right.classId),
        )[0];
  if (!selected) {
    return unavailableLayout(
      'No selectable current or future class is available.',
      classId,
      false,
      'class',
    );
  }
  const canViewNames = Boolean(
    staff &&
    (staff.assignedRoles.includes('admin') ||
      staff.assignedRoles.includes('frontDesk') ||
      (staff.assignedRoles.includes('coach') &&
        staff.assignedClassIds.includes(selected.classId))),
  );
  const bookings = state.bookings.filter(
    (item) => item.classId === selected.classId && item.status === 'booked',
  );
  if (
    bookings.some(
      (booking) =>
        !state.stations.some(
          (station) => station.stationId === booking.stationId,
        ),
    ) ||
    new Set(bookings.map((item) => item.stationId)).size !== bookings.length
  ) {
    return unavailableLayout(
      'Station assignments are inconsistent. Refresh the layout.',
      selected.classId,
      true,
    );
  }
  const stations: StaffLayoutStation[] = [];
  for (const station of state.stations) {
    const booking = bookings.find(
      (item) => item.stationId === station.stationId,
    );
    const attendance = booking
      ? state.attendance.find(
          (item) => item.attendanceId === booking.attendanceRecordId,
        )
      : undefined;
    const assignedMember = booking
      ? state.members.find((item) => item.memberId === booking.memberId)
      : undefined;
    if (
      booking &&
      (!assignedMember ||
        !attendance ||
        attendance.bookingId !== booking.bookingId ||
        attendance.classId !== selected.classId ||
        attendance.memberId !== booking.memberId)
    ) {
      return unavailableLayout(
        'Reservation details are incomplete. Refresh the layout.',
        selected.classId,
        true,
      );
    }
    const stationState: StationState = !station.inService
      ? 'outOfService'
      : !booking
        ? 'available'
        : attendance?.checkIn.status === 'checkedIn'
          ? 'bookedCheckedIn'
          : 'bookedNotCheckedIn';
    stations.push({
      stationId: station.stationId,
      label: station.label,
      row: station.row,
      column: station.column,
      state: stationState,
      stateLabel: stateLabels[stationState],
      reviewFlags: canViewNames && booking ? [...booking.reviewFlags] : [],
      ...(canViewNames && booking && assignedMember
        ? {
            bookingId: booking.bookingId,
            assignedMember: {
              memberId: assignedMember.memberId,
              displayName: assignedMember.displayName,
            },
          }
        : {}),
    });
  }
  const orientation =
    state.layout.orientationLabel === undefined
      ? {}
      : { orientationLabel: state.layout.orientationLabel };
  if (actor.kind === 'member') {
    const memberStations: MemberLayoutStation[] = stations.map((station) => ({
      stationId: station.stationId,
      label: station.label,
      row: station.row,
      column: station.column,
      state: station.state,
      stateLabel: station.stateLabel,
    }));
    return {
      status: 'available',
      audience: 'member',
      classId: selected.classId,
      ...orientation,
      canReseat: false,
      stations: memberStations,
    };
  }
  return {
    status: 'available',
    audience: 'staff',
    classId: selected.classId,
    ...orientation,
    canReseat: canViewNames && selected.status === 'published',
    stations,
  };
}
