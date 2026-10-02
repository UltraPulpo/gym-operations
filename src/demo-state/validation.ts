import { DateTime, IANAZone } from 'luxon';
import {
  advanceAttendanceClock,
  applyWeeklyTemplate,
  cancelBooking,
  cancelClass,
  cancelClassReservations,
  checkIn,
  correctAttendance,
  createClassType,
  createDraftClass,
  createStaffAccount,
  createStation,
  createWaiverVersion,
  createWeeklyTemplate,
  deleteDraftClass,
  deleteWeeklyTemplate,
  editScheduledClass,
  moveBooking,
  moveOwnBooking,
  publishClasses,
  publishWaiver,
  recordManualAttendance,
  recordNotification,
  releaseClasses,
  removeBooking,
  requireCapability,
  reverseCheckIn,
  setLayoutOrientation,
  signWaiver,
  swapBookings,
  updateClassType,
  updateCoachProfile,
  updateOwnCoachProfile,
  updateStaffAccount,
  updateStation,
  updateWeeklyTemplate,
  validateMembershipAction,
  validateNotificationAction,
  bookStation,
  joinWaitlist,
  leaveWaitlist,
  placeStation,
  promoteWaitlist,
} from '../domain';
import { getScenarioClockPresets, loadScenario } from '../demo-scenarios';
import type {
  AcceptedAction,
  BookingId,
  ClassId,
  DemoAction,
  DemoActionPayloads,
  DemoActor,
  DemoState,
  DemoStateChanges,
  DemoUnavailableState,
  DomainResource,
  DomainResult,
  IneligibilityReason,
  MemberId,
  NotificationId,
  ScheduledClass,
  SystemSettings,
  UtcInstant,
  ValidateAction,
  WaitlistEntryId,
} from '../domain';
import { createInitialDemoState } from '../demo-fixtures';

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

function unavailable(
  resource: DomainResource,
  resourceId: string,
  message = `The demo ${resource} is unavailable.`,
): DomainResult<never> {
  const error: DemoUnavailableState = {
    category: 'DemoUnavailableState',
    resource,
    resourceId,
    stale: false,
    message,
  };
  return { success: false, error };
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

function success(value: AcceptedAction): DomainResult<AcceptedAction> {
  return { success: true, value };
}

function validUtcInstant(value: string): value is UtcInstant {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false;
  const parsed = DateTime.fromISO(value, { setZone: true });
  return (
    parsed.isValid &&
    value.endsWith('Z') &&
    parsed.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'") === value
  );
}

function classById(
  state: DemoState,
  classId: ClassId,
): ScheduledClass | undefined {
  return state.classes.find((record) => record.classId === classId);
}

function suffix(id: string, prefix: string): string {
  return id.startsWith(`${prefix}:`) ? id.slice(prefix.length + 1) : id;
}

function mergeChanges(state: DemoState, changes: DemoStateChanges): DemoState {
  return { ...state, ...changes };
}

function stateChangesFromNextState(
  state: DemoState,
  nextState: DemoState,
): DemoStateChanges {
  return {
    ...(state.staffAccounts !== nextState.staffAccounts
      ? { staffAccounts: nextState.staffAccounts }
      : {}),
    ...(state.members !== nextState.members
      ? { members: nextState.members }
      : {}),
    ...(state.invitations !== nextState.invitations
      ? { invitations: nextState.invitations }
      : {}),
    ...(state.waivers !== nextState.waivers
      ? { waivers: nextState.waivers }
      : {}),
    ...(state.currentWaiverVersionId !== nextState.currentWaiverVersionId
      ? { currentWaiverVersionId: nextState.currentWaiverVersionId }
      : {}),
    ...(state.waiverSignatures !== nextState.waiverSignatures
      ? { waiverSignatures: nextState.waiverSignatures }
      : {}),
    ...(state.stations !== nextState.stations
      ? { stations: nextState.stations }
      : {}),
    ...(state.layout !== nextState.layout ? { layout: nextState.layout } : {}),
    ...(state.classTypes !== nextState.classTypes
      ? { classTypes: nextState.classTypes }
      : {}),
    ...(state.weeklyTemplates !== nextState.weeklyTemplates
      ? { weeklyTemplates: nextState.weeklyTemplates }
      : {}),
    ...(state.classes !== nextState.classes
      ? { classes: nextState.classes }
      : {}),
    ...(state.bookings !== nextState.bookings
      ? { bookings: nextState.bookings }
      : {}),
    ...(state.waitlistEntries !== nextState.waitlistEntries
      ? { waitlistEntries: nextState.waitlistEntries }
      : {}),
    ...(state.attendance !== nextState.attendance
      ? { attendance: nextState.attendance }
      : {}),
    ...(state.notifications !== nextState.notifications
      ? { notifications: nextState.notifications }
      : {}),
    ...(state.settings !== nextState.settings
      ? { settings: nextState.settings }
      : {}),
    ...(state.activeActor !== nextState.activeActor
      ? { activeActor: nextState.activeActor }
      : {}),
    ...(state.scenarioId !== nextState.scenarioId
      ? { scenarioId: nextState.scenarioId }
      : {}),
    ...(state.clock !== nextState.clock ? { clock: nextState.clock } : {}),
    ...(state.simulation !== nextState.simulation
      ? { simulation: nextState.simulation }
      : {}),
  };
}

function fullStateChanges(state: DemoState): DemoStateChanges {
  return {
    staffAccounts: state.staffAccounts,
    members: state.members,
    invitations: state.invitations,
    waivers: state.waivers,
    currentWaiverVersionId: state.currentWaiverVersionId,
    waiverSignatures: state.waiverSignatures,
    stations: state.stations,
    layout: state.layout,
    classTypes: state.classTypes,
    weeklyTemplates: state.weeklyTemplates,
    classes: state.classes,
    bookings: state.bookings,
    waitlistEntries: state.waitlistEntries,
    attendance: state.attendance,
    notifications: state.notifications,
    settings: state.settings,
    activeActor: state.activeActor,
    scenarioId: state.scenarioId,
    clock: state.clock,
    simulation: state.simulation,
  };
}

function accepted(
  state: DemoState,
  actor: DemoActor,
  action: DemoAction,
  now: UtcInstant,
  changes: DemoStateChanges,
  warnings: readonly import('../domain').DomainWarning[] = [],
): DomainResult<AcceptedAction> {
  return success({
    type: 'accepted',
    action,
    actor,
    validatedAt: now,
    baseRevision: state.revision,
    changes,
    warnings,
  });
}

function nextNotificationId(state: DemoState, seed: string): NotificationId {
  let ordinal = 1;
  let notificationId = `notification:${seed}` as NotificationId;
  while (
    state.notifications.some(
      (record) => record.notificationId === notificationId,
    )
  ) {
    ordinal += 1;
    notificationId = `notification:${seed}:${ordinal}` as NotificationId;
  }
  return notificationId;
}

function composeNotification(
  state: DemoState,
  changes: DemoStateChanges,
  input: Parameters<typeof recordNotification>[1],
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  const updatedState = mergeChanges(state, changes);
  const notification = recordNotification(updatedState, input, now);
  if (!notification.success) return notification;
  return {
    success: true,
    value: { ...changes, notifications: notification.value.notifications },
  };
}

function nextBookingId(
  state: DemoState,
  memberId: string,
  classId: string,
): BookingId {
  const classSuffix = suffix(classId, 'class');
  const memberSuffix = suffix(memberId, 'member');
  let ordinal = 1;
  let bookingId = `booking:${classSuffix}:${memberSuffix}` as BookingId;
  let attendanceId = `attendance:${suffix(bookingId, 'booking')}`;
  while (
    state.bookings.some((booking) => booking.bookingId === bookingId) ||
    state.attendance.some(
      (attendance) => attendance.attendanceId === attendanceId,
    )
  ) {
    ordinal += 1;
    bookingId =
      `booking:${classSuffix}:${memberSuffix}:${ordinal}` as BookingId;
    attendanceId = `attendance:${suffix(bookingId, 'booking')}`;
  }
  return bookingId;
}

function nextWaitlistEntryId(
  state: DemoState,
  memberId: string,
  classId: string,
): WaitlistEntryId {
  const classSuffix = suffix(classId, 'class');
  const memberSuffix = suffix(memberId, 'member');
  let ordinal = 1;
  let entryId = `waitlist:${classSuffix}:${memberSuffix}` as WaitlistEntryId;
  while (state.waitlistEntries.some((entry) => entry.entryId === entryId)) {
    ordinal += 1;
    entryId =
      `waitlist:${classSuffix}:${memberSuffix}:${ordinal}` as WaitlistEntryId;
  }
  return entryId;
}

function replaceClasses(
  classes: readonly ScheduledClass[],
  replacements: readonly ScheduledClass[],
): readonly ScheduledClass[] {
  const replacementById = new Map(
    replacements.map((scheduledClass) => [
      scheduledClass.classId,
      scheduledClass,
    ]),
  );
  return classes.map(
    (scheduledClass) =>
      replacementById.get(scheduledClass.classId) ?? scheduledClass,
  );
}

function requireScheduleActionTime(
  state: DemoState,
  classId: ClassId,
  now: UtcInstant,
  mode: 'edit' | 'cancel',
): DomainResult<void> {
  const scheduledClass = classById(state, classId);
  if (!scheduledClass) return unavailable('class', classId);
  if (
    !validUtcInstant(scheduledClass.startsAt) ||
    !validUtcInstant(scheduledClass.endsAt)
  ) {
    return invalid('class', 'The scheduled class requires valid UTC instants.');
  }
  if (
    mode === 'edit' &&
    scheduledClass.status === 'published' &&
    Date.parse(now) >= Date.parse(scheduledClass.startsAt)
  ) {
    return ineligible(
      'classStarted',
      'Published classes cannot be edited after they start.',
      { classId },
    );
  }
  if (
    mode === 'cancel' &&
    scheduledClass.status === 'published' &&
    Date.parse(now) >= Date.parse(scheduledClass.endsAt)
  ) {
    return ineligible(
      'classEnded',
      'Published classes cannot be cancelled after they end.',
      { classId },
    );
  }
  return { success: true, value: undefined };
}

function validateWholeNumber(
  field: string,
  value: number,
): DomainResult<number> {
  return Number.isSafeInteger(value) && value >= 0
    ? { success: true, value }
    : invalid(field, 'Use a whole number greater than or equal to zero.');
}

function validateSettingsUpdate(
  state: DemoState,
  updates: DemoActionPayloads['updateSettings']['updates'],
): DomainResult<SystemSettings> {
  if (Object.keys(updates).length === 0) {
    return invalid('updates', 'Provide at least one settings field to update.');
  }
  if (updates.memberCap !== undefined) {
    const result = validateWholeNumber('updates.memberCap', updates.memberCap);
    if (!result.success) return result;
  }
  if (updates.invitationExpiryMinutes !== undefined) {
    const result = validateWholeNumber(
      'updates.invitationExpiryMinutes',
      updates.invitationExpiryMinutes,
    );
    if (!result.success) return result;
  }
  if (updates.targetGapMinutes !== undefined) {
    const result = validateWholeNumber(
      'updates.targetGapMinutes',
      updates.targetGapMinutes,
    );
    if (!result.success) return result;
  }
  if (updates.waitlistCutoffMinutes !== undefined) {
    const result = validateWholeNumber(
      'updates.waitlistCutoffMinutes',
      updates.waitlistCutoffMinutes,
    );
    if (!result.success) return result;
  }
  if (updates.lateCancelCutoffMinutes !== undefined) {
    const result = validateWholeNumber(
      'updates.lateCancelCutoffMinutes',
      updates.lateCancelCutoffMinutes,
    );
    if (!result.success) return result;
  }
  if (updates.checkInLeadMinutes !== undefined) {
    const result = validateWholeNumber(
      'updates.checkInLeadMinutes',
      updates.checkInLeadMinutes,
    );
    if (!result.success) return result;
  }
  if (updates.checkInGraceMinutes !== undefined) {
    const result = validateWholeNumber(
      'updates.checkInGraceMinutes',
      updates.checkInGraceMinutes,
    );
    if (!result.success) return result;
  }
  if (updates.timezone !== undefined) {
    if (!IANAZone.isValidZone(updates.timezone)) {
      return invalid(
        'updates.timezone',
        'Use a valid IANA timezone identifier.',
      );
    }
    if (updates.timezone !== state.settings.timezone) {
      return invalid(
        'updates.timezone',
        'The demo timezone cannot be changed through this state action.',
      );
    }
  }
  if (updates.scheduleRelease !== undefined) {
    if (updates.scheduleRelease.mode === 'rolling') {
      const result = validateWholeNumber(
        'updates.scheduleRelease.advanceMinutes',
        updates.scheduleRelease.advanceMinutes,
      );
      if (!result.success) return result;
    }
  }
  return { success: true, value: { ...state.settings, ...updates } };
}

function composeInvitationNotification(
  state: DemoState,
  changes: DemoStateChanges,
  invitationId: DemoActionPayloads['createInvitation']['invitationId'],
  seed: string,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  const updatedState = mergeChanges(state, changes);
  const invitation = updatedState.invitations.find(
    (record) => record.invitationId === invitationId,
  );
  if (!invitation) return unavailable('invitation', invitationId);
  return composeNotification(
    state,
    changes,
    {
      notificationId: nextNotificationId(updatedState, seed),
      event: { type: 'invitation', invitationId },
      recipient: { kind: 'invitee', email: invitation.email },
      scenario: state.simulation.delivery,
    },
    now,
  );
}

function composeClassChangeNotifications(
  state: DemoState,
  changes: DemoStateChanges,
  event: Extract<
    import('../domain').NotificationEvent,
    { readonly type: 'classChanged' }
  >,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  let mergedChanges = changes;
  const bookings = state.bookings.filter(
    (booking) =>
      booking.classId === event.classId && booking.status === 'booked',
  );
  for (const booking of bookings) {
    const member = state.members.find(
      (record) => record.memberId === booking.memberId,
    );
    if (!member) return unavailable('member', booking.memberId);
    const updatedState = mergeChanges(state, mergedChanges);
    const notification = composeNotification(
      state,
      mergedChanges,
      {
        notificationId: nextNotificationId(
          updatedState,
          `classChanged:${suffix(event.classId, 'class')}:${suffix(member.memberId, 'member')}`,
        ),
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
    mergedChanges = notification.value;
  }
  return { success: true, value: mergedChanges };
}

function composeClassCancellationNotifications(
  state: DemoState,
  changes: DemoStateChanges,
  classId: ClassId,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  let mergedChanges = changes;
  const bookedMembers = state.bookings.filter(
    (booking) => booking.classId === classId && booking.status === 'booked',
  );
  for (const booking of bookedMembers) {
    const member = state.members.find(
      (record) => record.memberId === booking.memberId,
    );
    if (!member) return unavailable('member', booking.memberId);
    const updatedState = mergeChanges(state, mergedChanges);
    const notification = composeNotification(
      state,
      mergedChanges,
      {
        notificationId: nextNotificationId(
          updatedState,
          `classCancelled:${suffix(classId, 'class')}:${suffix(member.memberId, 'member')}`,
        ),
        event: { type: 'classCancelled', classId },
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
    mergedChanges = notification.value;
  }
  return { success: true, value: mergedChanges };
}

export const validateAction: ValidateAction = (state, actor, action, now) => {
  if (!validUtcInstant(now)) {
    return invalid('now', 'A valid UTC instant is required.');
  }

  switch (action.type) {
    case 'createStaffAccount': {
      const changes = createStaffAccount(state, actor, action.payload.staff);
      return changes.success
        ? accepted(state, actor, action, now, changes.value)
        : changes;
    }
    case 'updateStaffAccount': {
      const changes = updateStaffAccount(
        state,
        actor,
        action.payload.staffId,
        action.payload.updates,
      );
      return changes.success
        ? accepted(state, actor, action, now, changes.value)
        : changes;
    }
    case 'deactivateStaffAccount': {
      const changes = updateStaffAccount(state, actor, action.payload.staffId, {
        active: false,
      });
      return changes.success
        ? accepted(state, actor, action, now, changes.value)
        : changes;
    }
    case 'createInvitation':
    case 'resendInvitation':
    case 'revokeInvitation':
    case 'expireInvitations':
    case 'acceptInvitation':
    case 'updateMemberProfile':
    case 'setMemberStatus': {
      const membership = validateMembershipAction(state, actor, action, now);
      if (!membership.success) return membership;
      if (action.type === 'createInvitation') {
        const composed = composeInvitationNotification(
          state,
          membership.value.changes,
          action.payload.invitationId,
          `invitation:${suffix(action.payload.invitationId, 'invitation')}`,
          now,
        );
        return composed.success
          ? accepted(state, actor, action, now, composed.value)
          : composed;
      }
      if (action.type === 'resendInvitation') {
        const composed = composeInvitationNotification(
          state,
          membership.value.changes,
          action.payload.replacementId,
          `invitation:${suffix(action.payload.replacementId, 'invitation')}`,
          now,
        );
        return composed.success
          ? accepted(state, actor, action, now, composed.value)
          : composed;
      }
      return success(membership.value);
    }
    case 'createWaiverVersion': {
      const permission = requireCapability(state, actor, 'manageWaivers');
      if (!permission.success) return permission;
      const result = createWaiverVersion(state, action.payload.waiver);
      return result.success
        ? accepted(
            state,
            actor,
            action,
            now,
            stateChangesFromNextState(state, result.value),
          )
        : result;
    }
    case 'publishWaiver': {
      const permission = requireCapability(state, actor, 'manageWaivers');
      if (!permission.success) return permission;
      const result = publishWaiver(state, action.payload.waiverVersionId, now);
      return result.success
        ? accepted(
            state,
            actor,
            action,
            now,
            stateChangesFromNextState(state, result.value),
          )
        : result;
    }
    case 'signWaiver': {
      const permission = requireCapability(state, actor, 'signWaiver', {
        memberId: action.payload.memberId,
      });
      if (!permission.success) return permission;
      const result = signWaiver(state, action.payload, now);
      return result.success
        ? accepted(
            state,
            actor,
            action,
            now,
            stateChangesFromNextState(state, result.value),
          )
        : result;
    }
    case 'createStation': {
      const permission = requireCapability(state, actor, 'manageStations');
      if (!permission.success) return permission;
      const result = createStation(state, action.payload.station, actor);
      return result.success
        ? accepted(
            state,
            actor,
            action,
            now,
            stateChangesFromNextState(state, result.value),
          )
        : result;
    }
    case 'updateStation': {
      const permission = requireCapability(state, actor, 'manageStations');
      if (!permission.success) return permission;
      const result = updateStation(
        state,
        action.payload.stationId,
        action.payload.updates,
        actor,
      );
      return result.success
        ? accepted(
            state,
            actor,
            action,
            now,
            stateChangesFromNextState(state, result.value),
          )
        : result;
    }
    case 'placeStation': {
      const permission = requireCapability(state, actor, 'manageStations');
      if (!permission.success) return permission;
      const result = placeStation(
        state,
        action.payload.stationId,
        { row: action.payload.row, column: action.payload.column },
        actor,
      );
      return result.success
        ? accepted(
            state,
            actor,
            action,
            now,
            stateChangesFromNextState(state, result.value),
          )
        : result;
    }
    case 'setLayoutOrientation': {
      const permission = requireCapability(state, actor, 'manageStations');
      if (!permission.success) return permission;
      const result = setLayoutOrientation(
        state,
        action.payload.orientationLabel,
        actor,
      );
      return result.success
        ? accepted(
            state,
            actor,
            action,
            now,
            stateChangesFromNextState(state, result.value),
          )
        : result;
    }
    case 'createClassType': {
      const permission = requireCapability(state, actor, 'manageClassTypes');
      if (!permission.success) return permission;
      const result = createClassType(state, action.payload.classType);
      return result.success
        ? accepted(
            state,
            actor,
            action,
            now,
            stateChangesFromNextState(state, result.value),
          )
        : result;
    }
    case 'updateClassType': {
      const permission = requireCapability(state, actor, 'manageClassTypes');
      if (!permission.success) return permission;
      const result = updateClassType(
        state,
        action.payload.classTypeId,
        action.payload.updates,
      );
      return result.success
        ? accepted(
            state,
            actor,
            action,
            now,
            stateChangesFromNextState(state, result.value),
          )
        : result;
    }
    case 'createWeeklyTemplate': {
      const permission = requireCapability(state, actor, 'manageTemplates');
      if (!permission.success) return permission;
      const result = createWeeklyTemplate(
        state.weeklyTemplates,
        action.payload.template,
      );
      return result.success
        ? accepted(state, actor, action, now, { weeklyTemplates: result.value })
        : result;
    }
    case 'updateWeeklyTemplate': {
      const permission = requireCapability(state, actor, 'manageTemplates');
      if (!permission.success) return permission;
      const result = updateWeeklyTemplate(
        state.weeklyTemplates,
        action.payload.templateId,
        action.payload.updates,
      );
      return result.success
        ? accepted(state, actor, action, now, { weeklyTemplates: result.value })
        : result;
    }
    case 'deleteWeeklyTemplate': {
      const permission = requireCapability(state, actor, 'manageTemplates');
      if (!permission.success) return permission;
      const result = deleteWeeklyTemplate(
        state.weeklyTemplates,
        action.payload.templateId,
      );
      return result.success
        ? accepted(state, actor, action, now, { weeklyTemplates: result.value })
        : result;
    }
    case 'applyWeeklyTemplate': {
      const permission = requireCapability(state, actor, 'manageSchedule');
      if (!permission.success) return permission;
      const template = state.weeklyTemplates.find(
        (record) => record.templateId === action.payload.templateId,
      );
      if (!template) return unavailable('template', action.payload.templateId);
      const result = applyWeeklyTemplate({
        template,
        weekStartsOn: action.payload.weekStartsOn,
        timezone: state.settings.timezone,
        classTypes: state.classTypes,
        classes: state.classes,
        targetGapMinutes: state.settings.targetGapMinutes,
      });
      return result.success
        ? accepted(
            state,
            actor,
            action,
            now,
            { classes: [...state.classes, ...result.value.classes] },
            result.value.warnings,
          )
        : result;
    }
    case 'createDraftClass': {
      const permission = requireCapability(state, actor, 'manageSchedule');
      if (!permission.success) return permission;
      const result = createDraftClass(
        action.payload,
        state.classTypes,
        state.classes,
      );
      return result.success
        ? accepted(state, actor, action, now, {
            classes: [...state.classes, result.value],
          })
        : result;
    }
    case 'editScheduledClass': {
      const permission = requireCapability(state, actor, 'manageSchedule');
      if (!permission.success) return permission;
      const timeCheck = requireScheduleActionTime(
        state,
        action.payload.classId,
        now,
        'edit',
      );
      if (!timeCheck.success) return timeCheck;
      const result = editScheduledClass(
        state.classes,
        action.payload.classId,
        action.payload.updates,
        state.classTypes,
      );
      if (!result.success) return result;
      let changes: DemoStateChanges = {
        classes: replaceClasses(state.classes, [result.value.scheduledClass]),
      };
      if (
        result.value.notification &&
        result.value.notification.type === 'classChanged'
      ) {
        const composed = composeClassChangeNotifications(
          state,
          changes,
          result.value.notification,
          now,
        );
        if (!composed.success) return composed;
        changes = composed.value;
      }
      return accepted(state, actor, action, now, changes);
    }
    case 'deleteDraftClass': {
      const permission = requireCapability(state, actor, 'manageSchedule');
      if (!permission.success) return permission;
      const result = deleteDraftClass(state.classes, action.payload.classId);
      return result.success
        ? accepted(state, actor, action, now, { classes: result.value })
        : result;
    }
    case 'publishClasses': {
      const permission = requireCapability(state, actor, 'manageSchedule');
      if (!permission.success) return permission;
      const result = publishClasses(
        state.classes,
        action.payload.classIds,
        now,
        state.settings.targetGapMinutes,
        state,
      );
      return result.success
        ? accepted(
            state,
            actor,
            action,
            now,
            { classes: replaceClasses(state.classes, result.value.classes) },
            result.value.warnings,
          )
        : result;
    }
    case 'releaseClasses': {
      const permission = requireCapability(state, actor, 'manageSchedule');
      if (!permission.success) return permission;
      const result = releaseClasses(
        state.classes,
        action.payload.classIds,
        now,
      );
      return result.success
        ? accepted(state, actor, action, now, { classes: result.value })
        : result;
    }
    case 'cancelClass': {
      const permission = requireCapability(state, actor, 'manageSchedule');
      if (!permission.success) return permission;
      const timeCheck = requireScheduleActionTime(
        state,
        action.payload.classId,
        now,
        'cancel',
      );
      if (!timeCheck.success) return timeCheck;
      const result = cancelClass(
        state.classes,
        action.payload.classId,
        action.payload.reason,
        now,
      );
      if (!result.success) return result;
      const classes = replaceClasses(state.classes, [
        result.value.scheduledClass,
      ]);
      const reservationChanges = cancelClassReservations(
        { ...state, classes },
        action.payload.classId,
        now,
      );
      if (!reservationChanges.success) return reservationChanges;
      const baseChanges: DemoStateChanges = {
        classes,
        ...reservationChanges.value,
      };
      const composed = composeClassCancellationNotifications(
        state,
        baseChanges,
        action.payload.classId,
        now,
      );
      return composed.success
        ? accepted(state, actor, action, now, composed.value)
        : composed;
    }
    case 'bookStation': {
      const bookingId = nextBookingId(
        state,
        action.payload.memberId,
        action.payload.classId,
      );
      const result = bookStation(
        state,
        actor,
        action.payload.memberId,
        action.payload.classId,
        action.payload.stationId,
        bookingId,
        now,
      );
      return result.success
        ? accepted(state, actor, action, now, result.value)
        : result;
    }
    case 'cancelBooking': {
      const result = cancelBooking(state, actor, action.payload.bookingId, now);
      return result.success
        ? accepted(state, actor, action, now, result.value)
        : result;
    }
    case 'removeBooking': {
      const result = removeBooking(
        state,
        actor,
        action.payload.bookingId,
        action.payload.reason,
        now,
      );
      return result.success
        ? accepted(state, actor, action, now, result.value)
        : result;
    }
    case 'moveBooking': {
      if (
        (action.payload as { readonly confirmed?: true }).confirmed !== true
      ) {
        return ineligible(
          'confirmationRequired',
          'Confirm the destination before moving a booking.',
        );
      }
      const result =
        actor.kind === 'member'
          ? moveOwnBooking(
              state,
              actor,
              action.payload.bookingId,
              action.payload.destinationStationId,
              now,
            )
          : moveBooking(
              state,
              actor,
              action.payload.bookingId,
              action.payload.destinationStationId,
              now,
            );
      return result.success
        ? accepted(state, actor, action, now, result.value)
        : result;
    }
    case 'swapBookings': {
      if (
        (action.payload as { readonly confirmed?: true }).confirmed !== true
      ) {
        return ineligible(
          'confirmationRequired',
          'Confirm the occupied-station swap before changing either booking.',
        );
      }
      const result = swapBookings(
        state,
        actor,
        action.payload.bookingId,
        action.payload.otherBookingId,
        now,
        true,
      );
      return result.success
        ? accepted(state, actor, action, now, result.value)
        : result;
    }
    case 'joinWaitlist': {
      const entryId = nextWaitlistEntryId(
        state,
        action.payload.memberId,
        action.payload.classId,
      );
      const result = joinWaitlist(
        state,
        actor,
        action.payload.memberId,
        action.payload.classId,
        entryId,
        now,
      );
      return result.success
        ? accepted(state, actor, action, now, result.value)
        : result;
    }
    case 'leaveWaitlist': {
      const result = leaveWaitlist(state, actor, action.payload.entryId, now);
      return result.success
        ? accepted(state, actor, action, now, result.value)
        : result;
    }
    case 'promoteWaitlist': {
      const result = promoteWaitlist(
        state,
        actor,
        action.payload.classId,
        action.payload.stationId,
        now,
      );
      return result.success
        ? accepted(
            state,
            actor,
            action,
            now,
            result.value.changes,
            result.value.warnings,
          )
        : result;
    }
    case 'checkIn': {
      const result = checkIn(state, actor, action.payload.bookingId, now);
      return result.success
        ? accepted(state, actor, action, now, result.value)
        : result;
    }
    case 'reverseCheckIn': {
      const result = reverseCheckIn(
        state,
        actor,
        action.payload.attendanceId,
        action.payload.reason,
        now,
      );
      return result.success
        ? accepted(state, actor, action, now, result.value)
        : result;
    }
    case 'correctAttendance': {
      const result = correctAttendance(
        state,
        actor,
        action.payload.attendanceId,
        action.payload.outcome,
        action.payload.reason,
        now,
      );
      return result.success
        ? accepted(state, actor, action, now, result.value)
        : result;
    }
    case 'recordManualAttendance': {
      const result = recordManualAttendance(
        state,
        actor,
        action.payload.classId,
        action.payload.memberId,
        action.payload.outcome,
        action.payload.reason,
        now,
      );
      return result.success
        ? accepted(state, actor, action, now, result.value)
        : result;
    }
    case 'resendNotification': {
      return validateNotificationAction(state, actor, action, now);
    }
    case 'updateOwnCoachProfile': {
      const result = updateOwnCoachProfile(
        state,
        actor,
        action.payload.staffId,
        action.payload.updates,
      );
      return result.success
        ? accepted(state, actor, action, now, result.value)
        : result;
    }
    case 'updateCoachProfile': {
      const result = updateCoachProfile(
        state,
        actor,
        action.payload.staffId,
        action.payload.updates,
      );
      return result.success
        ? accepted(state, actor, action, now, result.value)
        : result;
    }
    case 'updateSettings': {
      const permission = requireCapability(state, actor, 'manageSettings');
      if (!permission.success) return permission;
      const result = validateSettingsUpdate(state, action.payload.updates);
      return result.success
        ? accepted(state, actor, action, now, { settings: result.value })
        : result;
    }
    case 'selectActor': {
      const selectedActor = action.payload.actor;
      switch (selectedActor.kind) {
        case 'staff':
          if (
            !state.staffAccounts.some(
              (record) => record.staffId === selectedActor.staffId,
            )
          ) {
            return unavailable('staff', selectedActor.staffId);
          }
          break;
        case 'member':
          if (
            !state.members.some(
              (record) => record.memberId === selectedActor.memberId,
            )
          ) {
            return unavailable('member', selectedActor.memberId);
          }
          break;
        case 'invitation':
          if (
            !state.invitations.some(
              (record) => record.invitationId === selectedActor.invitationId,
            )
          ) {
            return unavailable('invitation', selectedActor.invitationId);
          }
          break;
      }
      return accepted(state, actor, action, now, {
        activeActor: selectedActor,
      });
    }
    case 'setSimulation': {
      if (Object.keys(action.payload).length === 0) {
        return invalid(
          'payload',
          'Provide at least one simulation field to update.',
        );
      }
      if (
        action.payload.delivery !== undefined &&
        action.payload.delivery !== 'success' &&
        action.payload.delivery !== 'failure'
      ) {
        return invalid(
          'payload.delivery',
          'Use a supported delivery simulation.',
        );
      }
      if (
        action.payload.identity !== undefined &&
        action.payload.identity !== 'verified' &&
        action.payload.identity !== 'rejected' &&
        action.payload.identity !== 'mismatched'
      ) {
        return invalid(
          'payload.identity',
          'Use a supported identity simulation.',
        );
      }
      return accepted(state, actor, action, now, {
        simulation: { ...state.simulation, ...action.payload },
      });
    }
    case 'advanceClock': {
      if (!validUtcInstant(state.clock.now)) {
        return invalid(
          'clock.now',
          'The current demo clock must be a valid UTC instant.',
        );
      }
      if (!validUtcInstant(action.payload.to)) {
        return invalid(
          'payload.to',
          'Advance the clock to a valid UTC instant.',
        );
      }
      if (Date.parse(action.payload.to) < Date.parse(state.clock.now)) {
        return ineligible(
          'backwardClock',
          'The demo clock moves forward only.',
        );
      }
      if (action.payload.to === state.clock.now) {
        return invalid('payload.to', 'Advance the clock to a later instant.');
      }
      const result = advanceAttendanceClock(state, action.payload.to);
      return result.success
        ? accepted(state, actor, action, now, result.value)
        : result;
    }
    case 'setClockPreset': {
      if (!validUtcInstant(state.clock.now)) {
        return invalid(
          'clock.now',
          'The current demo clock must be a valid UTC instant.',
        );
      }
      const presets = getScenarioClockPresets(state.scenarioId);
      if (!presets.success) return presets;
      const preset = presets.value.find(
        (record) => record.presetId === action.payload.presetId,
      );
      if (!preset) return unavailable('clockPreset', action.payload.presetId);
      if (Date.parse(preset.instant) < Date.parse(state.clock.now)) {
        return ineligible(
          'backwardClock',
          'The demo clock moves forward only.',
        );
      }
      if (preset.instant === state.clock.now) {
        return accepted(state, actor, action, now, {
          clock: { now: state.clock.now, presetId: action.payload.presetId },
        });
      }
      const result = advanceAttendanceClock(state, preset.instant);
      if (!result.success) return result;
      return accepted(state, actor, action, now, {
        ...result.value,
        clock: { now: preset.instant, presetId: action.payload.presetId },
      });
    }
    case 'resetDemo': {
      if (
        (action.payload as { readonly confirmed?: true }).confirmed !== true
      ) {
        return ineligible(
          'confirmationRequired',
          'Confirm resetting local demo state.',
        );
      }
      return accepted(
        state,
        actor,
        action,
        now,
        fullStateChanges(createInitialDemoState()),
      );
    }
    case 'loadScenario': {
      if (
        (action.payload as { readonly confirmed?: true }).confirmed !== true
      ) {
        return ineligible(
          'confirmationRequired',
          'Confirm replacing local demo state.',
        );
      }
      const scenario = loadScenario(action.payload.scenarioId);
      return scenario.success
        ? accepted(
            state,
            actor,
            action,
            now,
            fullStateChanges(scenario.value.snapshot),
          )
        : scenario;
    }
    case 'unsupportedOperation': {
      return {
        success: false,
        error: {
          category: 'UnsupportedPrototypeOperation',
          message: `The simulated demo does not implement ${action.payload.operation}.`,
          operation: action.payload.operation,
        },
      };
    }
    default: {
      const exhaustive: never = action;
      void exhaustive;
      return invalid('action.type', 'Unsupported demo action type.');
    }
  }
};
