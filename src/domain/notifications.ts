import { requireCapability } from './roles';
import type {
  AcceptedAction,
  ActionOf,
  DemoActor,
  DemoState,
  DemoStateChanges,
  DeliveryScenario,
  DomainResult,
  NotificationAttempt,
  NotificationAttemptId,
  NotificationEvent,
  NotificationId,
  NotificationRecipient,
  NotificationRecord,
  StaffId,
  UtcInstant,
} from './types';

export interface NotificationInput {
  readonly notificationId: NotificationId;
  readonly event: NotificationEvent;
  readonly recipient: NotificationRecipient;
  readonly scenario: DeliveryScenario;
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

function validId(id: string, prefix: string): boolean {
  return (
    id.startsWith(`${prefix}:`) &&
    id.length > prefix.length + 1 &&
    id.trim() === id
  );
}

function validInstant(instant: UtcInstant): boolean {
  const parsed = new Date(instant);
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(instant) &&
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().replace('.000Z', 'Z') === instant
  );
}

function hasAttempt(
  state: DemoState,
  attemptId: NotificationAttemptId,
): boolean {
  return state.notifications.some((record) =>
    record.attempts.some((attempt) => attempt.attemptId === attemptId),
  );
}

function validEvent(event: NotificationEvent): boolean {
  switch (event.type) {
    case 'invitation':
      return validId(event.invitationId, 'invitation');
    case 'bookingConfirmed':
      return (
        validId(event.bookingId, 'booking') && validId(event.classId, 'class')
      );
    case 'waitlistPromoted':
      return (
        validId(event.bookingId, 'booking') &&
        validId(event.entryId, 'waitlist') &&
        validId(event.classId, 'class')
      );
    case 'classCancelled':
      return validId(event.classId, 'class');
    case 'classChanged':
      return (
        validId(event.classId, 'class') &&
        event.changes.length > 0 &&
        new Set(event.changes).size === event.changes.length &&
        event.changes.every(
          (change) =>
            change === 'date' || change === 'startTime' || change === 'coach',
        )
      );
    default:
      return false;
  }
}

function createAttempt(
  notificationId: NotificationId,
  sequence: number,
  scenario: DeliveryScenario,
  now: UtcInstant,
  resentBy?: StaffId,
): DomainResult<NotificationAttempt> {
  if (!validInstant(now)) {
    return invalid('now', 'Supply a valid UTC demo instant.');
  }
  const attemptId: NotificationAttemptId = `notificationAttempt:${notificationId.slice('notification:'.length)}:${sequence}`;
  const base = {
    attemptId,
    attemptedAt: now,
    ...(resentBy === undefined ? {} : { resentBy }),
  };
  switch (scenario) {
    case 'success':
      return { success: true, value: { ...base, status: 'sent', scenario } };
    case 'failure':
      return {
        success: true,
        value: {
          ...base,
          status: 'failed',
          scenario,
          error: {
            category: 'SimulatedDeliveryFailure',
            scenario,
            notificationId,
            message:
              'Simulated email delivery failed; no email was transmitted.',
          },
        },
      };
    default:
      return invalid(
        'scenario',
        'Select a supported simulated delivery outcome.',
      );
  }
}

/** Event metadata describes an already accepted operation, not an email request. */
export function createNotificationRecord(
  input: NotificationInput,
  now: UtcInstant,
): DomainResult<NotificationRecord> {
  if (!validId(input.notificationId, 'notification')) {
    return invalid(
      'notificationId',
      'Supply a stable notification identifier.',
    );
  }
  if (!validEvent(input.event)) {
    return invalid(
      'event',
      'Supply a supported notification event and its metadata.',
    );
  }
  const recipient = input.recipient;
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email) ||
    (input.event.type === 'invitation'
      ? recipient.kind !== 'invitee'
      : recipient.kind !== 'member' || !validId(recipient.memberId, 'member'))
  ) {
    return invalid(
      'recipient',
      'Supply the event recipient and a valid demo email.',
    );
  }
  const attempt = createAttempt(input.notificationId, 1, input.scenario, now);
  if (!attempt.success) return attempt;
  const event: NotificationEvent =
    input.event.type === 'classChanged'
      ? { ...input.event, changes: [...input.event.changes] }
      : { ...input.event };
  return {
    success: true,
    value: {
      notificationId: input.notificationId,
      simulated: true,
      event,
      recipient: { ...recipient },
      createdAt: now,
      status: attempt.value.status,
      attempts: [attempt.value],
    },
  };
}

/** Compose this notifications-only patch with the accepted business changes once. */
export function recordNotification(
  state: DemoState,
  input: NotificationInput,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  if (
    state.notifications.some(
      (record) => record.notificationId === input.notificationId,
    )
  ) {
    return invalid(
      'notificationId',
      'This notification already exists; resend explicitly.',
    );
  }
  const record = createNotificationRecord(input, now);
  if (!record.success) return record;
  if (hasAttempt(state, record.value.attempts[0].attemptId)) {
    return invalid(
      'attemptId',
      'This notification attempt identifier already exists.',
    );
  }
  return {
    success: true,
    value: { notifications: [...state.notifications, record.value] },
  };
}

export function resendNotification(
  state: DemoState,
  actor: DemoActor,
  notificationId: NotificationId,
  scenario: DeliveryScenario,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  if (actor.kind !== 'staff') {
    return {
      success: false,
      error: {
        category: 'IneligibleDemoAction',
        reason: 'roleDenied',
        message:
          'Only permitted demo staff may resend simulated notifications.',
      },
    };
  }
  const permission = requireCapability(state, actor, 'manageNotifications');
  if (!permission.success) return permission;
  const record = state.notifications.find(
    (notification) => notification.notificationId === notificationId,
  );
  if (!record) {
    return {
      success: false,
      error: {
        category: 'DemoUnavailableState',
        resource: 'notification',
        resourceId: notificationId,
        stale: false,
        message: 'The simulated notification is unavailable.',
      },
    };
  }
  const latest = record.attempts.at(-1);
  if (
    !latest ||
    !validInstant(record.createdAt) ||
    !validInstant(latest.attemptedAt) ||
    !validInstant(now) ||
    now < latest.attemptedAt ||
    now < record.createdAt
  ) {
    return invalid(
      'now',
      'Resend requires retained attempt history and a non-earlier valid demo instant.',
    );
  }
  const attempt = createAttempt(
    notificationId,
    record.attempts.length + 1,
    scenario,
    now,
    actor.staffId,
  );
  if (!attempt.success) return attempt;
  if (hasAttempt(state, attempt.value.attemptId)) {
    return invalid(
      'attemptId',
      'This notification attempt identifier already exists.',
    );
  }
  const updated: NotificationRecord = {
    ...record,
    status: attempt.value.status,
    attempts: [...record.attempts, attempt.value],
  };
  return {
    success: true,
    value: {
      notifications: state.notifications.map((notification) =>
        notification.notificationId === notificationId ? updated : notification,
      ),
    },
  };
}

export function validateNotificationAction(
  state: DemoState,
  actor: DemoActor,
  action: ActionOf<'resendNotification'>,
  now: UtcInstant,
): DomainResult<AcceptedAction> {
  const changes = resendNotification(
    state,
    actor,
    action.payload.notificationId,
    action.payload.scenario,
    now,
  );
  if (!changes.success) return changes;
  return {
    success: true,
    value: {
      type: 'accepted',
      action,
      actor,
      validatedAt: now,
      baseRevision: state.revision,
      changes: changes.value,
      warnings: [],
    },
  };
}
