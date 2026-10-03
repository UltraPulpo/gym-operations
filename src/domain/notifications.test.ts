import { describe, expect, it, vi } from 'vitest';
import type {
  DemoActor,
  DemoState,
  DeliveryScenario,
  DomainResult,
  NotificationEvent,
  NotificationRecipient,
  StaffRole,
  UtcInstant,
} from './types';
import {
  createNotificationRecord,
  recordNotification,
  resendNotification,
  validateNotificationAction,
} from './notifications';
import type { NotificationInput } from './notifications';

const now: UtcInstant = '2026-10-02T16:00:00Z';
const later: UtcInstant = '2026-10-02T16:01:00Z';
const staff: DemoActor = { kind: 'staff', staffId: 'staff:demo' };
const memberRecipient: NotificationRecipient = {
  kind: 'member',
  memberId: 'member:demo',
  email: 'member@example.invalid',
};
const events: readonly NotificationEvent[] = [
  { type: 'invitation', invitationId: 'invitation:demo' },
  {
    type: 'bookingConfirmed',
    bookingId: 'booking:demo',
    classId: 'class:demo',
  },
  {
    type: 'waitlistPromoted',
    bookingId: 'booking:demo',
    entryId: 'waitlist:demo',
    classId: 'class:demo',
  },
  { type: 'classCancelled', classId: 'class:demo' },
  {
    type: 'classChanged',
    classId: 'class:demo',
    changes: ['date', 'startTime', 'coach'],
  },
];

function input(
  event: NotificationEvent = events[1],
  scenario: DeliveryScenario = 'success',
): NotificationInput {
  return {
    notificationId: 'notification:demo',
    event,
    recipient:
      event.type === 'invitation'
        ? { kind: 'invitee', email: 'invitee@example.invalid' }
        : memberRecipient,
    scenario,
  };
}

function state(overrides: Partial<DemoState> = {}): DemoState {
  return {
    revision: 7,
    staffAccounts: [
      {
        staffId: 'staff:demo',
        identitySubject: 'identity:staff',
        active: true,
        assignedRoles: ['frontDesk'],
        assignedClassIds: [],
      },
    ],
    members: [],
    invitations: [],
    waivers: [],
    currentWaiverVersionId: null,
    waiverSignatures: [],
    stations: [],
    layout: { availability: 'current' },
    classTypes: [],
    weeklyTemplates: [],
    classes: [],
    bookings: [
      {
        bookingId: 'booking:demo',
        memberId: 'member:demo',
        classId: 'class:demo',
        stationId: 'station:demo',
        bookedAt: now,
        status: 'booked',
        attendanceRecordId: 'attendance:demo',
        reviewFlags: [],
      },
    ],
    waitlistEntries: [],
    attendance: [],
    notifications: [],
    settings: {
      illustrative: true,
      timezone: 'America/Los_Angeles',
      memberCap: 10,
      invitationExpiryMinutes: 60,
      scheduleRelease: { mode: 'immediate' },
      targetGapMinutes: 30,
      waitlistCutoffMinutes: 30,
      lateCancelCutoffMinutes: 30,
      checkInLeadMinutes: 30,
      checkInGraceMinutes: 5,
    },
    activeActor: staff,
    scenarioId: 'scenario:demo',
    clock: { now, presetId: null },
    simulation: { delivery: 'success', identity: 'verified' },
    ...overrides,
  };
}

function value<T>(result: DomainResult<T>): T {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.error.message);
  return result.value;
}

function freeze<T>(object: T): T {
  if (object !== null && typeof object === 'object') {
    Object.values(object).forEach(freeze);
    Object.freeze(object);
  }
  return object;
}

describe('local notification outcomes', () => {
  it.each(
    events.flatMap((event) =>
      (['success', 'failure'] as const).map((scenario) => ({
        event,
        scenario,
      })),
    ),
  )(
    'retains supported $event.type metadata with a $scenario outcome',
    ({ event, scenario }) => {
      const request = freeze(input(event, scenario));
      const record = value(createNotificationRecord(request, now));
      const status = scenario === 'success' ? 'sent' : 'failed';
      expect(record).toEqual({
        notificationId: request.notificationId,
        simulated: true,
        event,
        recipient: request.recipient,
        createdAt: now,
        status,
        attempts: [
          {
            attemptId: 'notificationAttempt:demo:1',
            attemptedAt: now,
            scenario,
            status,
            ...(scenario === 'failure'
              ? {
                  error: {
                    category: 'SimulatedDeliveryFailure',
                    scenario: 'failure',
                    notificationId: request.notificationId,
                    message: expect.stringMatching(/simulated/i),
                  },
                }
              : {}),
          },
        ],
      });
      expect(record.event).not.toBe(request.event);
      expect(record.recipient).not.toBe(request.recipient);
      if (
        record.event.type === 'classChanged' &&
        event.type === 'classChanged'
      ) {
        expect(record.event.changes).not.toBe(event.changes);
      }
    },
  );

  it('is deterministic without network, random identifiers, or wall-clock reads', () => {
    const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('No network is allowed.');
    });
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Only the supplied virtual time is allowed.');
    });
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Only deterministic IDs are allowed.');
    });
    const first = createNotificationRecord(input(events[4], 'failure'), now);
    expect(createNotificationRecord(input(events[4], 'failure'), now)).toEqual(
      first,
    );
    const snapshot = freeze(state({ notifications: [value(first)] }));
    expect(
      resendNotification(
        snapshot,
        staff,
        'notification:demo',
        'success',
        later,
      ),
    ).toEqual(
      resendNotification(
        snapshot,
        staff,
        'notification:demo',
        'success',
        later,
      ),
    );
    expect(network).not.toHaveBeenCalled();
    expect(clock).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
  });

  it('composes a failed delivery with committed business changes without rollback', () => {
    const before = freeze(state());
    const changes = value(
      recordNotification(before, input(events[1], 'failure'), now),
    );
    expect(Object.keys(changes)).toEqual(['notifications']);
    const committed = { ...before, ...changes };
    expect(committed.bookings).toBe(before.bookings);
    expect(committed.bookings[0].status).toBe('booked');
    expect(committed.notifications[0].status).toBe('failed');
    expect(before.notifications).toEqual([]);
    expect(
      value(recordNotification(before, input(events[1], 'failure'), now)),
    ).toEqual(changes);
  });

  it.each([
    { ...input(), notificationId: 'notification:' },
    { ...input(), recipient: { ...memberRecipient, email: 'bad-email' } },
    {
      ...input(),
      recipient: { kind: 'invitee', email: 'demo@example.invalid' },
    },
    { ...input(events[0]), recipient: memberRecipient },
    {
      ...input(),
      event: { type: 'classChanged', classId: 'class:demo', changes: [] },
    },
    {
      ...input(),
      event: {
        type: 'classChanged',
        classId: 'class:demo',
        changes: ['coach', 'coach'],
      },
    },
    {
      ...input(),
      event: {
        type: 'bookingConfirmed',
        bookingId: 'booking:',
        classId: 'class:demo',
      },
    },
  ] satisfies NotificationInput[])(
    'rejects malformed event/recipient metadata: %j',
    (request) => {
      const snapshot = freeze(state());
      const before = structuredClone(snapshot);
      expect(recordNotification(snapshot, request, now)).toMatchObject({
        success: false,
        error: { category: 'ValidationError', fields: expect.any(Array) },
      });
      expect(snapshot).toEqual(before);
    },
  );

  it.each([
    '2026-02-30T16:00:00Z',
    '2026-10-02T25:00:00Z',
  ] satisfies UtcInstant[])(
    'rejects invalid virtual time %s',
    (invalidTime) => {
      expect(createNotificationRecord(input(), invalidTime)).toMatchObject({
        success: false,
        error: { category: 'ValidationError' },
      });
    },
  );

  it('rejects duplicate records instead of silently resending or replacing history', () => {
    const record = value(createNotificationRecord(input(), now));
    const snapshot = freeze(state({ notifications: [record] }));
    expect(
      recordNotification(snapshot, input(events[4], 'failure'), later),
    ).toMatchObject({
      success: false,
      error: { category: 'ValidationError' },
    });
    expect(snapshot.notifications).toEqual([record]);
  });

  it('rejects an attempt identifier already retained by another fixture record', () => {
    const original = value(createNotificationRecord(input(), now));
    const retained = {
      ...original,
      notificationId: 'notification:other' as const,
    };
    const snapshot = freeze(state({ notifications: [retained] }));
    expect(recordNotification(snapshot, input(), later)).toMatchObject({
      success: false,
      error: { category: 'ValidationError' },
    });
    expect(snapshot.notifications).toEqual([retained]);
  });

  it.each(events)(
    'keeps the committed operation intact on $type delivery failure',
    (event) => {
      const snapshot = freeze(
        state({
          invitations: [
            {
              invitationId: 'invitation:demo',
              email: 'invitee@example.invalid',
              issuedAt: now,
              expiresAt: later,
              issuedBy: 'staff:demo',
              status: 'outstanding',
            },
          ],
          classes: [
            {
              classId: 'class:demo',
              schedule: {
                date: '2026-10-02',
                time: '09:00',
                timezone: 'America/Los_Angeles',
              },
              startsAt: now,
              endsAt: '2026-10-02T17:00:00Z',
              status:
                event.type === 'classCancelled' ? 'cancelled' : 'published',
              classTypeSnapshot: {
                classTypeId: 'classType:demo',
                name: 'Fictional Row',
                description: 'Illustrative demo class',
                difficulty: 'All levels',
                durationMinutes: 60,
              },
              lateCancelWaived: event.type === 'classChanged',
              reviewFlags: [],
            },
          ],
          waitlistEntries: [
            {
              entryId: 'waitlist:demo',
              classId: 'class:demo',
              memberId: 'member:demo',
              joinOrder: 1,
              joinedAt: now,
              status: 'promoted',
              promotedAt: now,
              bookingId: 'booking:demo',
              reviewFlags: [],
            },
          ],
        }),
      );
      const before = structuredClone(snapshot);
      const changes = value(
        recordNotification(snapshot, input(event, 'failure'), now),
      );
      const committed = { ...snapshot, ...changes };
      expect(Object.keys(changes)).toEqual(['notifications']);
      expect(committed.invitations).toBe(snapshot.invitations);
      expect(committed.classes).toBe(snapshot.classes);
      expect(committed.bookings).toBe(snapshot.bookings);
      expect(committed.waitlistEntries).toBe(snapshot.waitlistEntries);
      expect(committed.notifications[0].status).toBe('failed');
      expect(snapshot).toEqual(before);
    },
  );

  it('reports unsupported event, change and scenario rather than treating them as success', () => {
    expect(
      createNotificationRecord(
        {
          ...input(),
          // @ts-expect-error Runtime validation also rejects unsupported event requests.
          event: { type: 'reseated', classId: 'class:demo' },
        },
        now,
      ),
    ).toMatchObject({
      success: false,
      error: { category: 'ValidationError' },
    });
    expect(
      createNotificationRecord(
        {
          ...input(),
          event: {
            type: 'classChanged',
            classId: 'class:demo',
            // @ts-expect-error Duration is not a supported notification change.
            changes: ['duration'],
          },
        },
        now,
      ),
    ).toMatchObject({
      success: false,
      error: { category: 'ValidationError' },
    });
    expect(
      createNotificationRecord(
        {
          ...input(),
          // @ts-expect-error Runtime validation rejects outcomes outside the contract.
          scenario: 'unknown',
        },
        now,
      ),
    ).toMatchObject({
      success: false,
      error: { category: 'ValidationError' },
    });
  });
});

describe('explicit notification resend', () => {
  it('appends failed/successful attempts and preserves original metadata and failures', () => {
    const original = value(
      createNotificationRecord(input(events[4], 'failure'), now),
    );
    let snapshot = freeze(state({ notifications: [original] }));
    for (const scenario of ['failure', 'success', 'failure'] as const) {
      const changes = value(
        resendNotification(
          snapshot,
          staff,
          original.notificationId,
          scenario,
          later,
        ),
      );
      expect(Object.keys(changes)).toEqual(['notifications']);
      snapshot = freeze({ ...snapshot, ...changes });
    }
    const record = snapshot.notifications[0];
    expect(record).toMatchObject({
      event: original.event,
      recipient: original.recipient,
      createdAt: now,
      simulated: true,
      status: 'failed',
    });
    expect(record.attempts.map((attempt) => attempt.status)).toEqual([
      'failed',
      'failed',
      'sent',
      'failed',
    ]);
    expect(record.attempts.map((attempt) => attempt.attemptId)).toEqual([
      'notificationAttempt:demo:1',
      'notificationAttempt:demo:2',
      'notificationAttempt:demo:3',
      'notificationAttempt:demo:4',
    ]);
    expect(record.attempts.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resentBy: 'staff:demo', attemptedAt: later }),
      ]),
    );
    expect(record.attempts[0]).toBe(original.attempts[0]);
    expect(original.attempts).toHaveLength(1);
    expect(snapshot.bookings[0].status).toBe('booked');
  });

  it.each(['admin', 'frontDesk'] satisfies StaffRole[])(
    'accepts %s resend once for validation-before-dispatch composition',
    (role) => {
      const original = value(createNotificationRecord(input(), now));
      const snapshot = freeze(
        state({
          notifications: [original],
          staffAccounts: [
            { ...state().staffAccounts[0], assignedRoles: [role] },
          ],
        }),
      );
      const action = {
        type: 'resendNotification',
        payload: {
          notificationId: original.notificationId,
          scenario: 'failure',
        },
      } as const;
      const accepted = value(
        validateNotificationAction(snapshot, staff, action, later),
      );
      expect(accepted).toEqual({
        type: 'accepted',
        action,
        actor: staff,
        validatedAt: later,
        baseRevision: 7,
        changes: {
          notifications: [
            expect.objectContaining({
              status: 'failed',
              attempts: [
                original.attempts[0],
                expect.objectContaining({
                  attemptId: 'notificationAttempt:demo:2',
                  resentBy: 'staff:demo',
                }),
              ],
            }),
          ],
        },
        warnings: [],
      });
      expect(snapshot.notifications[0].attempts).toHaveLength(1);
    },
  );

  it.each([
    { actor: staff, active: false, role: 'frontDesk', reason: 'inactiveStaff' },
    { actor: staff, active: true, role: 'coach', reason: 'roleDenied' },
    {
      actor: { kind: 'member', memberId: 'member:demo' },
      active: true,
      role: 'admin',
      reason: 'roleDenied',
    },
    {
      actor: { kind: 'invitation', invitationId: 'invitation:demo' },
      active: true,
      role: 'admin',
      reason: 'roleDenied',
    },
  ] satisfies {
    actor: DemoActor;
    active: boolean;
    role: StaffRole;
    reason: string;
  }[])(
    'rejects disallowed resend with $reason without mutation',
    ({ actor, active, role, reason }) => {
      const snapshot = freeze(
        state({
          notifications: [value(createNotificationRecord(input(), now))],
          staffAccounts: [
            { ...state().staffAccounts[0], active, assignedRoles: [role] },
          ],
        }),
      );
      const before = structuredClone(snapshot);
      expect(
        resendNotification(
          snapshot,
          actor,
          'notification:demo',
          'success',
          later,
        ),
      ).toMatchObject({
        success: false,
        error: { category: 'IneligibleDemoAction', reason },
      });
      expect(snapshot).toEqual(before);
    },
  );

  it('reports missing notification or staff explicitly', () => {
    expect(
      resendNotification(
        state(),
        staff,
        'notification:missing',
        'success',
        now,
      ),
    ).toMatchObject({
      success: false,
      error: { category: 'DemoUnavailableState', resource: 'notification' },
    });
    expect(
      resendNotification(
        state(),
        { kind: 'staff', staffId: 'staff:missing' },
        'notification:demo',
        'success',
        now,
      ),
    ).toMatchObject({
      success: false,
      error: { category: 'DemoUnavailableState', resource: 'staff' },
    });
  });

  it('preserves unrelated records and rejects time before the latest attempt', () => {
    const original = value(createNotificationRecord(input(), later));
    const other = value(
      createNotificationRecord(
        {
          ...input(events[0]),
          notificationId: 'notification:other',
        },
        now,
      ),
    );
    const snapshot = freeze(state({ notifications: [other, original] }));
    const before = structuredClone(snapshot);
    expect(
      resendNotification(
        snapshot,
        staff,
        original.notificationId,
        'success',
        now,
      ),
    ).toMatchObject({ success: false, error: { category: 'ValidationError' } });
    expect(snapshot).toEqual(before);
    const changes = value(
      resendNotification(
        snapshot,
        staff,
        original.notificationId,
        'success',
        later,
      ),
    );
    expect(changes.notifications?.[0]).toBe(other);
    expect(changes.notifications?.[1].attempts).toHaveLength(2);
  });

  it('rejects missing attempt history or colliding attempt identifiers', () => {
    const original = value(createNotificationRecord(input(), now));
    const empty = freeze(
      state({ notifications: [{ ...original, attempts: [] }] }),
    );
    expect(
      resendNotification(
        empty,
        staff,
        original.notificationId,
        'success',
        later,
      ),
    ).toMatchObject({ success: false, error: { category: 'ValidationError' } });
    const other = value(
      createNotificationRecord(
        {
          ...input(events[0]),
          notificationId: 'notification:other',
        },
        now,
      ),
    );
    const snapshot = freeze(
      state({
        notifications: [
          original,
          {
            ...other,
            attempts: [
              {
                ...other.attempts[0],
                attemptId: 'notificationAttempt:demo:2',
              },
            ],
          },
        ],
      }),
    );
    const before = structuredClone(snapshot);
    expect(
      resendNotification(
        snapshot,
        staff,
        original.notificationId,
        'success',
        later,
      ),
    ).toMatchObject({ success: false, error: { category: 'ValidationError' } });
    expect(snapshot).toEqual(before);
  });
});
