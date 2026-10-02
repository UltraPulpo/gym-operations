import { act, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_IDS as ids } from '../../demo-fixtures';
import type {
  DemoAction,
  DemoActor,
  DemoState,
  NotificationEvent,
} from '../../domain';
import { renderWithDemoState } from '../../test-support';
import { NotificationsScreen } from './index';

const admin: DemoActor = { kind: 'staff', staffId: ids.staff.admin };
type View = ReturnType<typeof renderWithDemoState>;

function submit(view: View, action: DemoAction) {
  act(() => {
    const result = view.store.submit(action);
    expect(result, JSON.stringify(result)).toMatchObject({ success: true });
  });
}

function performOperation(view: View, action: DemoAction) {
  if (action.type === 'bookStation') {
    submit(view, {
      type: 'selectActor',
      payload: {
        actor: { kind: 'member', memberId: action.payload.memberId },
      },
    });
  }
  submit(view, action);
  if (action.type === 'bookStation') {
    submit(view, { type: 'selectActor', payload: { actor: admin } });
  }
}

function operations(state: DemoState) {
  return {
    members: state.members,
    invitations: state.invitations,
    waivers: state.waivers,
    waiverSignatures: state.waiverSignatures,
    stations: state.stations,
    layout: state.layout,
    classes: state.classes,
    classTypes: state.classTypes,
    weeklyTemplates: state.weeklyTemplates,
    bookings: state.bookings,
    waitlistEntries: state.waitlistEntries,
    attendance: state.attendance,
    settings: state.settings,
    staffAccounts: state.staffAccounts,
    clock: state.clock,
  };
}

function expectUnchangedOperations(before: DemoState, after: DemoState) {
  const previous = operations(before);
  const current = operations(after);
  for (const key of Object.keys(previous) as (keyof typeof previous)[]) {
    expect(current[key]).toBe(previous[key]);
  }
}

const eventCases: readonly {
  event: NotificationEvent['type'];
  label: string;
  action: DemoAction;
}[] = [
  {
    event: 'invitation',
    label: 'Invitation',
    action: {
      type: 'createInvitation',
      payload: {
        invitationId: 'invitation:notifications-new',
        email: 'new-notification@example.invalid',
      },
    },
  },
  {
    event: 'bookingConfirmed',
    label: 'Booking confirmation',
    action: {
      type: 'bookStation',
      payload: {
        memberId: ids.members.juniper,
        classId: ids.classes.free,
        stationId: ids.stations.west,
      },
    },
  },
  {
    event: 'waitlistPromoted',
    label: 'Waitlist promotion',
    action: {
      type: 'removeBooking',
      payload: {
        bookingId: ids.bookings.fullMaple,
        reason: 'Fictional vacancy for promotion',
      },
    },
  },
  {
    event: 'classCancelled',
    label: 'Class cancellation',
    action: {
      type: 'cancelClass',
      payload: {
        classId: ids.classes.full,
        reason: 'Fictional cancellation',
      },
    },
  },
  {
    event: 'classChanged',
    label: 'Class change',
    action: {
      type: 'editScheduledClass',
      payload: {
        classId: ids.classes.free,
        updates: { coachId: ids.staff.multiRole },
      },
    },
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('simulated notification outcomes', () => {
  it.each(eventCases)(
    'shows adjustable success and failure after real $event operations, without rollback or network calls',
    async ({ event, label, action }) => {
      const fetch = vi.spyOn(globalThis, 'fetch');
      const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
      const view = renderWithDemoState(<NotificationsScreen />, {
        actor: admin,
      });
      const pristine = view.store.getSnapshot().state;
      await view.user.selectOptions(
        view.getByLabelText('Simulated email outcome'),
        'failure',
      );
      const configured = view.store.getSnapshot().state;
      expect(configured.simulation.delivery).toBe('failure');
      expectUnchangedOperations(pristine, configured);
      expect(configured.notifications).toBe(pristine.notifications);
      performOperation(view, action);
      const committed = view.store.getSnapshot().state;
      const record = committed.notifications.at(-1)!;
      expect(record.event.type).toBe(event);
      expect(record.status).toBe('failed');
      expect(operations(committed)).not.toEqual(operations(configured));
      await view.user.selectOptions(
        view.getByLabelText('Notification to inspect'),
        record.notificationId,
      );
      const detail = within(
        view.getByRole('region', { name: 'Selected notification' }),
      );
      expect(detail.getByText(label)).toBeVisible();
      if (record.event.type === 'invitation') {
        expect(detail.getByText(record.event.invitationId)).toBeVisible();
      } else {
        expect(detail.getByText(record.event.classId)).toBeVisible();
        if (
          record.event.type === 'bookingConfirmed' ||
          record.event.type === 'waitlistPromoted'
        ) {
          expect(detail.getByText(record.event.bookingId)).toBeVisible();
        }
        if (record.event.type === 'waitlistPromoted') {
          expect(detail.getByText(record.event.entryId)).toBeVisible();
        }
      }
      expect(detail.getByRole('alert')).toHaveTextContent(
        /simulated email delivery failed/i,
      );
      expect(detail.getByRole('alert')).toHaveTextContent(
        /operation remains committed/i,
      );
      expect(view.getByText(/no email is transmitted/i)).toBeVisible();
      await view.user.selectOptions(
        view.getByLabelText('Resend outcome'),
        'failure',
      );
      expect(view.store.getSnapshot().state).toBe(committed);
      await view.user.click(
        view.getByRole('button', { name: 'Resend simulated notification' }),
      );
      const failedAgain = view.store.getSnapshot().state;
      expect(failedAgain.notifications.at(-1)?.attempts).toHaveLength(2);
      expect(failedAgain.notifications.at(-1)?.status).toBe('failed');
      expectUnchangedOperations(committed, failedAgain);
      await view.user.selectOptions(
        view.getByLabelText('Resend outcome'),
        'success',
      );
      await view.user.click(
        view.getByRole('button', { name: 'Resend simulated notification' }),
      );
      const resent = view.store.getSnapshot().state;
      const updated = resent.notifications.at(-1)!;
      expect(updated.status).toBe('sent');
      expect(updated.attempts).toHaveLength(3);
      expect(updated.attempts.slice(0, 2)).toEqual(
        failedAgain.notifications.at(-1)?.attempts,
      );
      expect(updated.attempts[2]).toMatchObject({
        scenario: 'success',
        attemptedAt: resent.clock.now,
        resentBy: ids.staff.admin,
      });
      expect(updated.event).toEqual(record.event);
      expect(updated.recipient).toEqual(record.recipient);
      expect(updated.createdAt).toBe(record.createdAt);
      expectUnchangedOperations(committed, resent);
      expect(
        detail.getByRole('table', { name: 'Delivery attempt history' }),
      ).toHaveTextContent('Simulated failure');
      expect(
        detail.getByRole('table', { name: 'Delivery attempt history' }),
      ).toHaveTextContent('Simulated success');
      expect(detail.getByRole('alert')).toHaveTextContent(
        /earlier failed attempts remain/i,
      );
      expect(view.getByRole('status')).toHaveTextContent(
        /simulated resend succeeded.*no email was transmitted/i,
      );
      view.rerender(<NotificationsScreen key="retained-history" />);
      await view.user.selectOptions(
        view.getByLabelText('Notification to inspect'),
        record.notificationId,
      );
      expect(
        within(
          view.getByRole('region', { name: 'Selected notification' }),
        ).getByRole('alert'),
      ).toHaveTextContent(/earlier failed attempts remain/i);
      expect(view.store.getSnapshot().state).toBe(resent);
      view.unmount();

      const successView = renderWithDemoState(<NotificationsScreen />, {
        actor: admin,
      });
      await successView.user.selectOptions(
        successView.getByLabelText('Simulated email outcome'),
        'failure',
      );
      const unchangedRecords =
        successView.store.getSnapshot().state.notifications;
      await successView.user.selectOptions(
        successView.getByLabelText('Simulated email outcome'),
        'success',
      );
      expect(successView.store.getSnapshot().state.notifications).toBe(
        unchangedRecords,
      );
      performOperation(successView, action);
      const successRecord = successView.store
        .getSnapshot()
        .state.notifications.at(-1)!;
      expect(successRecord).toMatchObject({
        event: { type: event },
        status: 'sent',
      });
      await successView.user.selectOptions(
        successView.getByLabelText('Notification to inspect'),
        successRecord.notificationId,
      );
      expect(
        within(
          successView.getByRole('region', { name: 'Selected notification' }),
        ).getByText('Simulated success'),
      ).toBeVisible();
      expect(fetch).not.toHaveBeenCalled();
      expect(xhr).not.toHaveBeenCalled();
    },
  );

  it('shows all class-change fields and stable operation links', async () => {
    const view = renderWithDemoState(<NotificationsScreen />, {
      actor: admin,
    });
    submit(view, {
      type: 'editScheduledClass',
      payload: {
        classId: ids.classes.free,
        updates: {
          schedule: {
            date: '2026-10-06',
            time: '10:30',
            timezone: 'America/Los_Angeles',
          },
          coachId: ids.staff.multiRole,
        },
      },
    });
    const record = view.store.getSnapshot().state.notifications.at(-1)!;
    await view.user.selectOptions(
      view.getByLabelText('Notification to inspect'),
      record.notificationId,
    );
    const detail = within(
      view.getByRole('region', { name: 'Selected notification' }),
    );
    expect(detail.getByText(/Date, start time, coach/i)).toBeVisible();
    expect(detail.getByText(ids.classes.free)).toBeVisible();
  });

  it('does not retain a resend success announcement after resetting the demo', async () => {
    const view = renderWithDemoState(<NotificationsScreen />, {
      actor: admin,
    });
    await view.user.selectOptions(
      view.getByLabelText('Notification to inspect'),
      ids.notifications.invitationFailed,
    );
    await view.user.click(
      view.getByRole('button', { name: 'Resend simulated notification' }),
    );
    expect(view.getByRole('status')).toHaveTextContent(
      /simulated resend succeeded/i,
    );
    act(() => {
      expect(view.store.resetDemo({ confirmed: true }).success).toBe(true);
    });
    expect(
      view.queryByText(/simulated resend succeeded/i),
    ).not.toBeInTheDocument();
    const invitation = view.store
      .getSnapshot()
      .state.notifications.find(
        (record) =>
          record.notificationId === ids.notifications.invitationFailed,
      )!;
    expect(invitation.status).toBe('failed');
    expect(invitation.attempts).toHaveLength(1);
  });

  it('surfaces rejected resend and delivery-control errors without changing state', async () => {
    const view = renderWithDemoState(<NotificationsScreen />, {
      actor: admin,
    });
    await view.user.selectOptions(
      view.getByLabelText('Notification to inspect'),
      ids.notifications.invitationFailed,
    );
    vi.spyOn(view.store, 'submit').mockReturnValue({
      success: false,
      error: {
        category: 'ValidationError',
        message: 'The resend outcome was rejected.',
        fields: [{ field: 'scenario', message: 'Choose an allowed outcome.' }],
      },
    });
    act(() => {
      expect(view.store.advanceClockBy(1).success).toBe(true);
    });
    const before = view.store.getSnapshot();
    await view.user.click(
      view.getByRole('button', { name: 'Resend simulated notification' }),
    );
    expect(view.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(view.getByText('The resend outcome was rejected.')).toBeVisible();
    expect(view.getByLabelText('Resend outcome')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(view.store.getSnapshot()).toBe(before);
    await view.user.selectOptions(
      view.getByLabelText('Simulated email outcome'),
      'failure',
    );
    expect(view.getByText('The resend outcome was rejected.')).toBeVisible();
    expect(view.store.getSnapshot()).toBe(before);
  });
});

describe('notification role boundaries', () => {
  it.each([ids.staff.admin, ids.staff.frontDesk, ids.staff.multiRole])(
    'permits authorized staff %s to inspect all records and resend explicitly',
    (staffId) => {
      const view = renderWithDemoState(<NotificationsScreen />, {
        actor: { kind: 'staff', staffId },
      });
      expect(
        within(view.getByLabelText('Notification to inspect')).getAllByRole(
          'option',
        ),
      ).toHaveLength(view.store.getSnapshot().state.notifications.length);
      expect(
        view.getByRole('button', { name: 'Resend simulated notification' }),
      ).toBeEnabled();
      expect(view.getByText('invitee@example.invalid')).toBeVisible();
    },
  );

  it('shows members only their own records and contact, with no resend or delivery controls', async () => {
    const view = renderWithDemoState(<NotificationsScreen />, {
      actor: { kind: 'member', memberId: ids.members.maple },
    });
    const options = within(
      view.getByLabelText('Notification to inspect'),
    ).getAllByRole('option');
    expect(options.map((option) => option.getAttribute('value'))).toEqual([
      ids.notifications.bookingConfirmed,
      ids.notifications.classCancelled,
    ]);
    expect(view.container).not.toHaveTextContent('invitee@example.invalid');
    expect(view.container).not.toHaveTextContent('birch@example.invalid');
    expect(view.container).not.toHaveTextContent('aspen@example.invalid');
    expect(
      view.queryByRole('button', { name: 'Resend simulated notification' }),
    ).not.toBeInTheDocument();
    expect(
      view.queryByLabelText('Simulated email outcome'),
    ).not.toBeInTheDocument();
    await view.user.selectOptions(
      view.getByLabelText('Notification to inspect'),
      ids.notifications.classCancelled,
    );
    expect(
      within(
        view.getByRole('region', { name: 'Selected notification' }),
      ).getByText(ids.classes.cancelled),
    ).toBeVisible();
  });

  it('limits coaches to assigned classes and never exposes recipient contacts', async () => {
    const view = renderWithDemoState(<NotificationsScreen />, {
      actor: admin,
    });
    await view.user.selectOptions(
      view.getByLabelText('Simulated email outcome'),
      'failure',
    );
    performOperation(view, {
      type: 'bookStation',
      payload: {
        memberId: ids.members.juniper,
        classId: ids.classes.checkIn,
        stationId: ids.stations.east,
      },
    });
    submit(view, {
      type: 'selectActor',
      payload: { actor: { kind: 'staff', staffId: ids.staff.coach } },
    });
    const state = view.store.getSnapshot().state;
    const assigned = state.staffAccounts.find(
      (staff) => staff.staffId === ids.staff.coach,
    )!.assignedClassIds;
    const expected = state.notifications.filter(
      (record) =>
        record.event.type !== 'invitation' &&
        assigned.includes(record.event.classId),
    );
    expect(expected).toHaveLength(1);
    const options = within(
      view.getByLabelText('Notification to inspect'),
    ).getAllByRole('option');
    expect(
      options.map((option) => option.getAttribute('value')).sort(),
    ).toEqual(expected.map((record) => record.notificationId).sort());
    expect(view.container).not.toHaveTextContent('@');
    expect(view.container).not.toHaveTextContent(
      ids.notifications.classChanged,
    );
    expect(
      view.queryByRole('button', { name: 'Resend simulated notification' }),
    ).not.toBeInTheDocument();
    expect(view.queryByLabelText('Resend outcome')).not.toBeInTheDocument();
    expect(
      view.queryByLabelText('Simulated email outcome'),
    ).not.toBeInTheDocument();
  });

  it.each([
    { kind: 'staff', staffId: ids.staff.inactive },
    { kind: 'invitation', invitationId: ids.invitations.outstanding },
  ] satisfies readonly DemoActor[])(
    'does not expose records or controls to a denied persona $kind',
    (actor) => {
      const view = renderWithDemoState(<NotificationsScreen />, { actor });
      expect(view.getByRole('alert')).toBeVisible();
      expect(
        view.queryByLabelText('Notification to inspect'),
      ).not.toBeInTheDocument();
      expect(view.container).not.toHaveTextContent('@');
      expect(
        view.queryByLabelText('Simulated email outcome'),
      ).not.toBeInTheDocument();
    },
  );

  it('clears staff detail and feedback when switching personas, and handles empty own records', async () => {
    const view = renderWithDemoState(<NotificationsScreen />, {
      actor: admin,
    });
    await view.user.selectOptions(
      view.getByLabelText('Notification to inspect'),
      ids.notifications.invitationFailed,
    );
    await view.user.click(
      view.getByRole('button', { name: 'Resend simulated notification' }),
    );
    submit(view, {
      type: 'selectActor',
      payload: { actor: { kind: 'member', memberId: ids.members.fern } },
    });
    expect(
      view.getByText('No notifications are visible to this persona.'),
    ).toBeVisible();
    expect(
      view.queryByRole('region', { name: 'Selected notification' }),
    ).not.toBeInTheDocument();
    expect(view.container).not.toHaveTextContent('invitee@example.invalid');
    expect(
      view.queryByText(/simulated resend succeeded/i),
    ).not.toBeInTheDocument();
  });
});
