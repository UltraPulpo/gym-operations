import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FIXTURE_IDS as ids } from '../../demo-fixtures';
import { createDemoStore } from '../../demo-state';
import { DemoStateContext } from '../../demo-state/context';
import type { DemoAction, DemoActor, DemoState } from '../../domain';
import { createDemoTestState, renderWithDemoState } from '../../test-support';
import { BookingsScreen } from './index';

const admin: DemoActor = { kind: 'staff', staffId: ids.staff.admin };
const coach: DemoActor = { kind: 'staff', staffId: ids.staff.coach };
const maple: DemoActor = { kind: 'member', memberId: ids.members.maple };
const juniper: DemoActor = { kind: 'member', memberId: ids.members.juniper };

function renderState(state: DemoState) {
  const store = createDemoStore(state);
  const user = userEvent.setup();
  return {
    ...render(
      <DemoStateContext.Provider value={store}>
        <BookingsScreen />
      </DemoStateContext.Provider>,
    ),
    store,
    user,
  };
}

function submit(store: ReturnType<typeof createDemoStore>, action: DemoAction) {
  act(() => {
    const result = store.submit(action);
    expect(result.success, JSON.stringify(result)).toBe(true);
  });
}

async function chooseClass(
  user: ReturnType<typeof userEvent.setup>,
  classId: string = ids.classes.free,
) {
  await user.selectOptions(screen.getByLabelText('Class'), classId);
}

async function reseat(
  user: ReturnType<typeof userEvent.setup>,
  bookingId: string = ids.bookings.checkInMaple,
  destination: string = ids.stations.east,
) {
  await user.selectOptions(screen.getByLabelText('Booked member'), bookingId);
  await user.selectOptions(
    screen.getByLabelText('Destination station'),
    destination,
  );
  await user.click(screen.getByRole('button', { name: 'Review reseating' }));
}

function confirm(name: string) {
  return within(screen.getByRole('alertdialog')).getByRole('button', {
    name,
  });
}

describe('member booking workflows', () => {
  it('lets the user select a simulated email outcome rather than relying on a fixture shortcut', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: juniper,
    });
    await chooseClass(user);
    await user.selectOptions(
      screen.getByLabelText('Simulated email result'),
      'failure',
    );
    await user.selectOptions(
      screen.getByLabelText('Free station'),
      ids.stations.west,
    );
    await user.click(screen.getByRole('button', { name: 'Book station' }));
    expect(store.getSnapshot().state.notifications.at(-1)?.status).toBe(
      'failed',
    );
    expect(
      screen.getByRole('status', { name: 'Booking result' }),
    ).toHaveTextContent('Booking confirmed');
  });

  it('requires an accepted invitation even for an active member with a current waiver', async () => {
    const initial = createDemoTestState({ actor: juniper });
    const { store, user } = renderState({
      ...initial,
      invitations: initial.invitations.map((invitation) =>
        invitation.invitationId === ids.invitations.juniper
          ? { ...invitation, status: 'outstanding' as const }
          : invitation,
      ),
    });
    await chooseClass(user);
    const before = store.getSnapshot();
    expect(screen.getByRole('button', { name: 'Book station' })).toBeDisabled();
    expect(
      screen
        .getAllByRole('alert')
        .some((alert) => /accepted invitation/i.test(alert.textContent ?? '')),
    ).toBe(true);
    expect(store.getSnapshot()).toBe(before);
  });

  it('keeps cancellation available when a new waiver blocks further booking and moving', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: { kind: 'member', memberId: ids.members.aspen },
    });
    await chooseClass(user);
    expect(screen.getByRole('button', { name: 'Review move' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Cancel booking' }),
    ).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Cancel booking' }));
    await user.click(confirm('Confirm cancellation'));
    expect(
      store
        .getSnapshot()
        .state.bookings.find(
          (item) => item.bookingId === ids.bookings.outdatedWaiver,
        )?.status,
    ).toBe('cancelled');
  });

  it('blocks zero-capacity booking and queue join without cancelling existing reservations', async () => {
    const initial = createDemoTestState({ actor: juniper });
    const { store, user } = renderState({
      ...initial,
      stations: initial.stations.map((station) => ({
        ...station,
        inService: false,
      })),
    });
    await chooseClass(user);
    expect(screen.getByRole('button', { name: 'Book station' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Join waitlist' }),
    ).toBeDisabled();
    expect(store.getSnapshot().state.bookings).toEqual(initial.bookings);
  });

  it('explains an unavailable role or empty released schedule instead of silently rendering an empty page', () => {
    const initial = createDemoTestState({ actor: juniper });
    renderState({ ...initial, classes: [] });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No classes are available',
    );
    expect(
      screen.queryByRole('button', { name: 'Book station' }),
    ).not.toBeInTheDocument();
  });

  it('shows invited personas an explicit shell selection explanation without booking actions', () => {
    renderWithDemoState(<BookingsScreen />, {
      actor: { kind: 'invitation', invitationId: ids.invitations.outstanding },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Select a fictional member or active staff persona',
    );
    expect(screen.queryByLabelText('Class')).not.toBeInTheDocument();
  });

  it.each([false, true])(
    'distinguishes late cancellation and waived late cancellation with waiver marker %s',
    async (lateCancelWaived) => {
      const initial = createDemoTestState({ actor: maple });
      const { store, user } = renderState({
        ...initial,
        clock: { now: '2026-10-05T18:30:00Z', presetId: null },
        classes: initial.classes.map((item) =>
          item.classId === ids.classes.full
            ? { ...item, lateCancelWaived }
            : item,
        ),
      });
      await chooseClass(user, ids.classes.full);
      await user.click(screen.getByRole('button', { name: 'Cancel booking' }));
      await user.click(confirm('Confirm cancellation'));
      expect(
        store
          .getSnapshot()
          .state.attendance.find(
            (record) => record.attendanceId === ids.attendance.fullMaple,
          )?.currentOutcome,
      ).toBe(lateCancelWaived ? 'cancelled' : 'lateCancel');
    },
  );
  it('lets a queued member book a newly free station at cutoff without separate promotion acceptance', async () => {
    const initial = createDemoTestState({
      actor: { kind: 'member', memberId: ids.members.willow },
    });
    const { store, user } = renderState({
      ...initial,
      clock: { now: '2026-10-05T18:00:00Z', presetId: null },
      stations: [
        ...initial.stations,
        {
          stationId: 'station:extra',
          label: 'Extra station',
          row: 3,
          column: 0,
          pm5Serial: null,
          inService: true,
        },
      ],
    });
    await chooseClass(user, ids.classes.full);
    await user.selectOptions(
      screen.getByLabelText('Free station'),
      'station:extra',
    );
    await user.click(screen.getByRole('button', { name: 'Book station' }));
    expect(store.getSnapshot().state.bookings).toContainEqual(
      expect.objectContaining({
        memberId: ids.members.willow,
        classId: ids.classes.full,
        stationId: 'station:extra',
        status: 'booked',
      }),
    );
  });

  it.each([
    [ids.members.fern, /Only active members|active member/i],
    [ids.members.moss, /Only active members|active member/i],
    [ids.members.aspen, /current.*waiver/i],
  ] as const)(
    'blocks new bookings and queue joins for ineligible member %s with an explicit reason',
    async (memberId, message) => {
      const { store, user } = renderWithDemoState(<BookingsScreen />, {
        actor: { kind: 'member', memberId },
      });
      await chooseClass(user, ids.classes.full);
      const before = store.getSnapshot();
      expect(
        screen
          .getAllByRole('alert')
          .some((alert) => message.test(alert.textContent ?? '')),
      ).toBe(true);
      const join = screen.queryByRole('button', { name: 'Join waitlist' });
      if (join) expect(join).toBeDisabled();
      await chooseClass(user);
      const book = screen.queryByRole('button', { name: 'Book station' });
      if (book) expect(book).toBeDisabled();
      expect(store.getSnapshot()).toBe(before);
    },
  );

  it('validates missing station selection accessibly without mutation', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: juniper,
    });
    await chooseClass(user);
    const before = store.getSnapshot();
    await user.click(screen.getByRole('button', { name: 'Book station' }));
    expect(
      screen.getByRole('alert', { name: 'Booking error' }),
    ).toHaveTextContent('Choose a free in-service station');
    expect(store.getSnapshot()).toBe(before);
  });

  it('refreshes a station claimed after selection and retains state on failed submission', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: juniper,
    });
    await chooseClass(user);
    await user.selectOptions(
      screen.getByLabelText('Free station'),
      ids.stations.east,
    );
    act(() => {
      for (const action of [
        { type: 'selectActor', payload: { actor: maple } },
        {
          type: 'bookStation',
          payload: {
            memberId: ids.members.maple,
            classId: ids.classes.free,
            stationId: ids.stations.east,
          },
        },
        { type: 'selectActor', payload: { actor: juniper } },
      ] satisfies DemoAction[]) {
        expect(store.submit(action).success).toBe(true);
      }
    });
    const before = store.getSnapshot();
    await user.click(screen.getByRole('button', { name: 'Book station' }));
    expect(store.getSnapshot()).toBe(before);
    expect(
      screen.getByRole('alert', { name: 'Booking error' }),
    ).toHaveTextContent(/current availability/i);
    expect(
      screen.queryByRole('status', { name: 'Booking result' }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Free station')).queryByRole('option', {
        name: /Rower 03/,
      }),
    ).not.toBeInTheDocument();
  });

  it('has no booking-count cap across arbitrary classes and never offers occupied or out-of-service stations', async () => {
    const initial = createDemoTestState({ actor: juniper });
    const template = initial.classes.find(
      (item) => item.classId === ids.classes.free,
    )!;
    const { store, user } = renderState({
      ...initial,
      classes: [
        ...initial.classes,
        ...Array.from({ length: 7 }, (_, index) => ({
          ...template,
          classId: `class:additional-${index}` as const,
          schedule: {
            ...template.schedule,
            date: `2026-10-${13 + index}` as const,
          },
          startsAt: `2026-10-${13 + index}T17:15:00Z` as const,
          endsAt: `2026-10-${13 + index}T17:45:00Z` as const,
        })),
      ],
    });
    for (let index = 0; index < 7; index += 1) {
      await chooseClass(user, `class:additional-${index}`);
      await user.selectOptions(
        screen.getByLabelText('Free station'),
        ids.stations.west,
      );
      await user.click(screen.getByRole('button', { name: 'Book station' }));
    }
    expect(
      store
        .getSnapshot()
        .state.bookings.filter(
          (item) =>
            item.memberId === ids.members.juniper && item.status === 'booked',
        ),
    ).toHaveLength(7);
    await chooseClass(user);
    const options = within(screen.getByLabelText('Free station'))
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value);
    expect(options).not.toContain(ids.stations.north);
    expect(options).not.toContain(ids.stations.outage);
  });

  it.each(['2026-10-05T16:00:00Z', '2026-10-05T16:00:01Z'] as const)(
    'closes member moves at %s and cancellation only after start',
    async (now) => {
      const initial = createDemoTestState({ actor: maple });
      const { store, user } = renderState({
        ...initial,
        clock: { now, presetId: null },
      });
      await chooseClass(user, ids.classes.checkIn);
      const before = store.getSnapshot();
      expect(
        screen.getByRole('button', { name: 'Review move' }),
      ).toBeDisabled();
      expect(
        screen
          .getByRole('button', { name: 'Cancel booking' })
          .hasAttribute('disabled'),
      ).toBe(now > '2026-10-05T16:00:00Z');
      expect(store.getSnapshot()).toBe(before);
    },
  );

  it('promotes the first eligible FIFO waiter on member cancellation strictly before cutoff', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: maple,
    });
    await chooseClass(user, ids.classes.full);
    await user.click(screen.getByRole('button', { name: 'Cancel booking' }));
    await user.click(confirm('Confirm cancellation'));
    const after = store.getSnapshot().state;
    expect(
      after.bookings.find((item) => item.bookingId === ids.bookings.fullMaple)
        ?.status,
    ).toBe('cancelled');
    expect(
      after.waitlistEntries.find(
        (entry) => entry.entryId === ids.waitlist.willow,
      )?.status,
    ).toBe('promoted');
    expect(
      after.attendance.find(
        (item) => item.attendanceId === ids.attendance.fullMaple,
      )?.currentOutcome,
    ).toBe('cancelled');
  });

  it('discards confirmation on class or persona change and never applies the previous member action', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: maple,
    });
    await chooseClass(user, ids.classes.checkIn);
    await user.click(screen.getByRole('button', { name: 'Cancel booking' }));
    submit(store, { type: 'selectActor', payload: { actor: juniper } });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(
      store
        .getSnapshot()
        .state.bookings.find(
          (item) => item.bookingId === ids.bookings.checkInMaple,
        )?.status,
    ).toBe('booked');
  });
  it('shows only published released classes and hides other members and staff controls', async () => {
    const initial = createDemoTestState({ actor: juniper });
    renderState({
      ...initial,
      settings: { ...initial.settings, scheduleRelease: { mode: 'manual' } },
    });
    const picker = screen.getByLabelText('Class');
    const values = within(picker)
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value);
    expect(values).toEqual([
      ids.classes.checkIn,
      ids.classes.free,
      ids.classes.full,
    ]);
    expect(screen.queryByLabelText('Booked member')).not.toBeInTheDocument();
    expect(screen.queryByText('Maya Chen')).not.toBeInTheDocument();
    expect(
      screen.queryByText('maya.chen@example.invalid'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Reservations are local simulations/),
    ).toBeVisible();
  });

  it('books an explicitly chosen free station and retains the confirmed booking on simulated email failure', async () => {
    const initial = createDemoTestState({ actor: juniper });
    const { store, user } = renderState({
      ...initial,
      simulation: { ...initial.simulation, delivery: 'failure' },
    });
    await chooseClass(user);
    await user.selectOptions(
      screen.getByLabelText('Free station'),
      ids.stations.east,
    );
    await user.click(screen.getByRole('button', { name: 'Book station' }));
    expect(store.getSnapshot().state.bookings).toContainEqual(
      expect.objectContaining({
        classId: ids.classes.free,
        memberId: ids.members.juniper,
        stationId: ids.stations.east,
        status: 'booked',
      }),
    );
    expect(
      screen.getByRole('status', { name: 'Booking result' }),
    ).toHaveTextContent('Booking confirmed in this demo');
    expect(
      screen.getByRole('region', { name: 'Simulated email outcomes' }),
    ).toHaveTextContent('Failed');
  });

  it('rejects a stale booking selection, refreshes availability, and never shows success', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: juniper,
    });
    await chooseClass(user);
    await user.selectOptions(
      screen.getByLabelText('Free station'),
      ids.stations.east,
    );
    submit(store, { type: 'selectActor', payload: { actor: maple } });
    submit(store, {
      type: 'bookStation',
      payload: {
        memberId: ids.members.maple,
        classId: ids.classes.free,
        stationId: ids.stations.east,
      },
    });
    submit(store, { type: 'selectActor', payload: { actor: juniper } });
    await chooseClass(user);
    await user.selectOptions(
      screen.getByLabelText('Free station'),
      ids.stations.west,
    );
    submit(store, { type: 'setSimulation', payload: { delivery: 'failure' } });
    const before = store.getSnapshot();
    await user.click(screen.getByRole('button', { name: 'Book station' }));
    expect(store.getSnapshot()).toBe(before);
    expect(
      screen.getByRole('alert', { name: 'Booking error' }),
    ).toHaveTextContent(/state changed.*current availability/i);
    expect(screen.getByLabelText('Free station')).toHaveValue('');
    expect(
      screen.queryByRole('status', { name: 'Booking result' }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Free station')).queryByRole('option', {
        name: /Rower 03/,
      }),
    ).not.toBeInTheDocument();
  });

  it('moves only its own booking to a chosen free station before start, retaining check-in and corrections', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: maple,
    });
    await chooseClass(user, ids.classes.checkIn);
    const before = store.getSnapshot().state;
    await user.selectOptions(
      screen.getByLabelText('Destination station'),
      ids.stations.east,
    );
    await user.click(screen.getByRole('button', { name: 'Review move' }));
    expect(store.getSnapshot().state).toBe(before);
    await user.click(confirm('Confirm move'));
    const after = store.getSnapshot().state;
    expect(
      after.bookings.find(
        (item) => item.bookingId === ids.bookings.checkInMaple,
      )?.stationId,
    ).toBe(ids.stations.east);
    expect(after.attendance).toEqual(before.attendance);
    expect(after.notifications).toEqual(before.notifications);
    expect(
      after.bookings.find(
        (item) => item.bookingId === ids.bookings.checkInCedar,
      ),
    ).toEqual(
      before.bookings.find(
        (item) => item.bookingId === ids.bookings.checkInCedar,
      ),
    );
  });

  it('joins, leaves, and rejoins the full class at the FIFO tail with retained history', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: juniper,
    });
    await chooseClass(user, ids.classes.full);
    await user.click(screen.getByRole('button', { name: 'Join waitlist' }));
    const joined = store.getSnapshot().state.waitlistEntries.at(-1)!;
    expect(joined).toMatchObject({
      memberId: ids.members.juniper,
      joinOrder: 6,
      status: 'waiting',
    });
    await user.click(screen.getByRole('button', { name: 'Leave waitlist' }));
    await user.click(screen.getByRole('button', { name: 'Join waitlist' }));
    const entries = store.getSnapshot().state.waitlistEntries;
    expect(
      entries.find((entry) => entry.entryId === joined.entryId)?.status,
    ).toBe('left');
    expect(entries.at(-1)).toMatchObject({
      memberId: ids.members.juniper,
      joinOrder: 7,
      status: 'waiting',
    });
    expect(entries.at(-1)?.entryId).not.toBe(joined.entryId);
    expect(screen.queryByText('Taylor Reed')).not.toBeInTheDocument();
  });

  it('cancels through exact class start as late cancellation without automatic promotion at cutoff', async () => {
    const initial = createDemoTestState({ actor: maple });
    const { store, user } = renderState({
      ...initial,
      clock: { now: '2026-10-05T19:00:00Z', presetId: null },
    });
    await chooseClass(user, ids.classes.full);
    await user.click(screen.getByRole('button', { name: 'Cancel booking' }));
    await user.click(confirm('Confirm cancellation'));
    expect(
      store
        .getSnapshot()
        .state.bookings.find(
          (item) => item.bookingId === ids.bookings.fullMaple,
        )?.status,
    ).toBe('cancelled');
    expect(
      store
        .getSnapshot()
        .state.attendance.find(
          (item) => item.attendanceId === ids.attendance.fullMaple,
        )?.currentOutcome,
    ).toBe('lateCancel');
    expect(store.getSnapshot().state.waitlistEntries).toEqual(
      initial.waitlistEntries,
    );
    expect(
      screen.getByRole('table', { name: 'Your bookings' }),
    ).toHaveTextContent('Late cancel');
  });
});

describe('staff roster and confirmed reseating', () => {
  it('shows authorized historical and queue-only member names without contacts', async () => {
    const initial = createDemoTestState({ actor: coach });
    const { user } = renderState({
      ...initial,
      members: initial.members.map((member) => ({
        ...member,
        contactEmail: 'private.contact@example.invalid',
      })),
      waitlistEntries: [
        ...initial.waitlistEntries,
        {
          ...initial.waitlistEntries[0]!,
          entryId: 'waitlist:history-only-aspen' as const,
          memberId: ids.members.aspen,
          classId: ids.classes.history,
          joinOrder: 1,
          status: 'waiting',
          reviewFlags: [],
        },
      ],
    });
    await chooseClass(user, ids.classes.history);
    const roster = screen.getByRole('table', {
      name: 'Class roster and booking history',
    });
    expect(roster).toHaveTextContent('Taylor Reed');
    expect(roster).toHaveTextContent('Late cancel');
    expect(roster).toHaveTextContent('Riley Morgan');
    expect(roster).toHaveTextContent('Staff removal');
    expect(roster).toHaveTextContent('Sam Patel');
    expect(roster).toHaveTextContent('No-show to Attended');
    expect(
      screen.getByRole('table', { name: 'FIFO waitlist' }),
    ).toHaveTextContent('Casey Park');
    expect(screen.queryByText('private.contact@example.invalid')).toBeNull();
    expect(
      screen.queryByText('member:aspen (name unavailable to this persona)'),
    ).toBeNull();
  });

  it('keeps friendly station labels in history when the live map overlay is unavailable', async () => {
    const { user } = renderWithDemoState(<BookingsScreen />, { actor: admin });
    await chooseClass(user, ids.classes.history);
    const roster = screen.getByRole('table', {
      name: 'Class roster and booking history',
    });
    expect(roster).toHaveTextContent('Rower 01');
    expect(roster).toHaveTextContent('Rower 02');
    expect(roster).toHaveTextContent('Rower 03');
    expect(
      screen.getByRole('button', { name: 'Review reseating' }),
    ).toBeDisabled();
  });

  it('rejects an occupied swap from an out-of-service source with an accessible error and preserves both assignments and attendance', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: admin,
    });
    await chooseClass(user, ids.classes.checkIn);
    await reseat(user, ids.bookings.outage, ids.stations.north);
    const before = store.getSnapshot();
    await user.click(confirm('Confirm swap'));
    expect(store.getSnapshot()).toBe(before);
    expect(
      screen.getByRole('alert', { name: 'Booking error' }),
    ).toHaveTextContent('Both stations in a swap must be in service');
    expect(
      screen.queryByRole('status', { name: 'Booking result' }),
    ).not.toBeInTheDocument();
  });

  it('supports keyboard confirmation with safe initial focus and restores focus after Escape', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: admin,
    });
    await chooseClass(user, ids.classes.checkIn);
    const before = store.getSnapshot();
    await reseat(user);
    expect(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Cancel',
      }),
    ).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(
      screen.getByRole('button', { name: 'Review reseating' }),
    ).toHaveFocus();
    expect(store.getSnapshot()).toBe(before);
    await user.click(screen.getByRole('button', { name: 'Review reseating' }));
    await user.keyboard('{Tab}{Enter}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(
      store
        .getSnapshot()
        .state.bookings.find(
          (item) => item.bookingId === ids.bookings.checkInMaple,
        )?.stationId,
    ).toBe(ids.stations.east);
  });
  it('allows only roster moves or swaps at exact end reached through the clock while preserving class-end processing', async () => {
    const initial = createDemoTestState({ actor: admin });
    const correction = {
      correctionId: 'correction:before-class-end-reseat' as const,
      staffId: ids.staff.admin,
      previousOutcome: 'booked' as const,
      newOutcome: 'attended' as const,
      recordedAt: initial.clock.now,
      reason: 'Fictional correction to preserve.',
    };
    const state = {
      ...initial,
      attendance: initial.attendance.map((record) =>
        record.attendanceId === ids.attendance.checkInMaple
          ? { ...record, corrections: [correction] }
          : record,
      ),
    };
    const { store, user } = renderState(state);
    await chooseClass(user, ids.classes.checkIn);
    expect(
      store
        .getSnapshot()
        .state.attendance.find(
          (record) => record.attendanceId === ids.attendance.checkInCedar,
        )?.currentOutcome,
    ).toBe('booked');
    act(() => {
      const result = store.advanceClock('2026-10-05T16:44:59Z');
      expect(result.success, JSON.stringify(result)).toBe(true);
    });
    expect(
      store
        .getSnapshot()
        .state.classes.find((item) => item.classId === ids.classes.checkIn)
        ?.status,
    ).toBe('published');
    expect(
      store
        .getSnapshot()
        .state.attendance.find(
          (record) => record.attendanceId === ids.attendance.checkInCedar,
        )?.currentOutcome,
    ).toBe('booked');
    expect(
      screen.getByRole('button', { name: 'Review reseating' }),
    ).toBeEnabled();
    act(() => {
      const result = store.advanceClock('2026-10-05T16:45:00Z');
      expect(result.success, JSON.stringify(result)).toBe(true);
    });
    const atEnd = store.getSnapshot().state;
    expect(
      atEnd.classes.find((item) => item.classId === ids.classes.checkIn)
        ?.status,
    ).toBe('completed');
    expect(
      atEnd.attendance.find(
        (record) => record.attendanceId === ids.attendance.checkInCedar,
      )?.currentOutcome,
    ).toBe('noShow');
    expect(
      atEnd.attendance.find(
        (record) => record.attendanceId === ids.attendance.checkInMaple,
      )?.corrections,
    ).toEqual([correction]);
    expect(
      screen.queryByRole('grid', { name: 'Station layout' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Review reseating' }),
    ).toBeEnabled();
    const notificationsAtEnd = atEnd.notifications;
    await reseat(user, ids.bookings.checkInMaple, ids.stations.west);
    await user.click(confirm('Confirm swap'));
    const afterReseat = store.getSnapshot().state;
    expect(
      afterReseat.bookings.find(
        (item) => item.bookingId === ids.bookings.checkInMaple,
      )?.stationId,
    ).toBe(ids.stations.west);
    expect(
      afterReseat.bookings.find(
        (item) => item.bookingId === ids.bookings.checkInCedar,
      )?.stationId,
    ).toBe(ids.stations.north);
    expect(afterReseat.classes).toEqual(atEnd.classes);
    expect(afterReseat.attendance).toEqual(atEnd.attendance);
    expect(afterReseat.notifications).toEqual(notificationsAtEnd);

    act(() => {
      const result = store.advanceClock('2026-10-05T16:45:01Z');
      expect(result.success, JSON.stringify(result)).toBe(true);
    });
    expect(
      screen.getByRole('button', { name: 'Review reseating' }),
    ).toBeDisabled();
    const afterEnd = store.getSnapshot().state;
    const denied = store.submit({
      type: 'moveBooking',
      payload: {
        bookingId: ids.bookings.checkInMaple,
        destinationStationId: ids.stations.north,
        confirmed: true,
      },
    });
    expect(denied.success).toBe(false);
    expect(store.getSnapshot().state.bookings).toEqual(afterEnd.bookings);
    expect(store.getSnapshot().state.notifications).toEqual(
      afterEnd.notifications,
    );
  });

  it('labels a directly seeded exact-end published snapshot as a defensive timing case', async () => {
    const initial = createDemoTestState({ actor: admin });
    const { store, user } = renderState({
      ...initial,
      clock: { now: '2026-10-05T16:45:00Z', presetId: null },
    });
    await chooseClass(user, ids.classes.checkIn);
    expect(
      screen.getByRole('button', { name: 'Review reseating' }),
    ).toBeEnabled();
    const before = store.getSnapshot().state;
    await reseat(user);
    await user.click(confirm('Confirm move'));
    expect(
      store
        .getSnapshot()
        .state.bookings.find(
          (item) => item.bookingId === ids.bookings.checkInMaple,
        )?.stationId,
    ).toBe(ids.stations.east);
    expect(store.getSnapshot().state.attendance).toEqual(before.attendance);
    expect(
      screen.queryByRole('grid', { name: 'Station layout' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('grid', { name: 'Station layout' }),
    ).not.toBeInTheDocument();
  });

  it('disables roster-only end-time reseating if the layout is actually stale', async () => {
    const initial = createDemoTestState({ actor: admin });
    const { user } = renderState({
      ...initial,
      clock: { now: '2026-10-05T16:45:00Z', presetId: null },
      layout: { ...initial.layout, availability: 'stale' },
    });
    await chooseClass(user, ids.classes.checkIn);
    expect(
      screen.getByRole('button', { name: 'Review reseating' }),
    ).toBeDisabled();
  });

  it('never reseats after end even if class completion has not been processed', async () => {
    const initial = createDemoTestState({ actor: admin });
    const { user } = renderState({
      ...initial,
      clock: { now: '2026-10-05T16:45:01Z', presetId: null },
    });
    await chooseClass(user, ids.classes.checkIn);
    expect(
      screen.getByRole('button', { name: 'Review reseating' }),
    ).toBeDisabled();
  });

  it('class cancellation cancels queued records without promotion and makes the selected roster read-only', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: admin,
    });
    await chooseClass(user, ids.classes.full);
    const before = store.getSnapshot().state;
    submit(store, {
      type: 'cancelClass',
      payload: { classId: ids.classes.full, reason: 'Fictional cancellation' },
    });
    const after = store.getSnapshot().state;
    expect(after.bookings).toHaveLength(before.bookings.length);
    expect(
      after.waitlistEntries.filter(
        (entry) =>
          entry.classId === ids.classes.full && entry.status === 'waiting',
      ),
    ).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'Review reseating' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('status', { name: 'Booking result' }),
    ).not.toBeInTheDocument();
  });

  it('retains all ineligible waiters and shows refreshed review flags when no waiter can be promoted', async () => {
    const initial = createDemoTestState({ actor: admin });
    const { store, user } = renderState({
      ...initial,
      waitlistEntries: initial.waitlistEntries
        .filter((entry) => entry.entryId !== ids.waitlist.willow)
        .map((entry) => ({ ...entry, reviewFlags: [] })),
    });
    await chooseClass(user, ids.classes.full);
    await user.selectOptions(
      screen.getByLabelText('Booked member'),
      ids.bookings.fullMaple,
    );
    await user.type(screen.getByLabelText('Removal reason'), 'Demo removal');
    await user.click(screen.getByRole('button', { name: 'Remove booking' }));
    await user.click(confirm('Confirm removal'));
    expect(
      store
        .getSnapshot()
        .state.waitlistEntries.find(
          (entry) => entry.entryId === ids.waitlist.moss,
        ),
    ).toMatchObject({ status: 'waiting', reviewFlags: ['memberInactive'] });
    expect(
      store
        .getSnapshot()
        .state.waitlistEntries.find(
          (entry) => entry.entryId === ids.waitlist.aspen,
        ),
    ).toMatchObject({ status: 'waiting', reviewFlags: ['waiverOutdated'] });
    expect(
      screen.getByRole('table', { name: 'FIFO waitlist' }),
    ).toHaveTextContent('Inactive member: staff review required');
  });
  it.each([ids.staff.frontDesk, ids.staff.multiRole, ids.staff.coach] as const)(
    'provides permitted current-class reseating for staff %s',
    async (staffId) => {
      const initial = createDemoTestState({
        actor: { kind: 'staff', staffId },
      });
      const { user } = renderState({
        ...initial,
        clock: { now: '2026-10-05T16:30:00Z', presetId: null },
      });
      await chooseClass(user, ids.classes.checkIn);
      expect(
        screen.getByRole('button', { name: 'Review reseating' }),
      ).toBeEnabled();
      expect(
        screen.getByRole('table', { name: 'Class roster and booking history' }),
      ).toHaveTextContent('Checked in');
      expect(
        screen.queryByText('maya.chen@example.invalid'),
      ).not.toBeInTheDocument();
    },
  );

  it('retains full correction history and every attendance record on staff reseating after start', async () => {
    const initial = createDemoTestState({ actor: admin });
    const corrected = initial.attendance.map((record) =>
      record.attendanceId !== ids.attendance.checkInMaple
        ? record
        : {
            ...record,
            corrections: [
              {
                correctionId: 'correction:test' as const,
                staffId: ids.staff.admin,
                previousOutcome: 'booked' as const,
                newOutcome: 'attended' as const,
                recordedAt: initial.clock.now,
                reason: 'Fictional correction retained',
              },
            ],
          },
    );
    const { store, user } = renderState({
      ...initial,
      attendance: corrected,
      clock: { now: '2026-10-05T16:30:00Z', presetId: null },
    });
    await chooseClass(user, ids.classes.checkIn);
    await reseat(user);
    await user.click(confirm('Confirm move'));
    expect(store.getSnapshot().state.attendance).toEqual(corrected);
    expect(
      screen.getByRole('table', { name: 'Class roster and booking history' }),
    ).toHaveTextContent('Fictional correction retained');
  });

  it.each([
    ids.classes.history,
    ids.classes.cancelled,
    ids.classes.draft,
  ] as const)(
    'shows non-actionable history/lifecycle records without offering reseating in %s',
    async (classId) => {
      const { user } = renderWithDemoState(<BookingsScreen />, {
        actor: admin,
      });
      await chooseClass(user, classId);
      expect(
        screen.getByRole('button', { name: 'Review reseating' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Remove booking' }),
      ).toBeDisabled();
    },
  );

  it('supports any selected roster member and a station rescued from outage without changing identity or attendance', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: admin,
    });
    await chooseClass(user, ids.classes.checkIn);
    const before = store.getSnapshot().state;
    await reseat(user, ids.bookings.outage, ids.stations.east);
    await user.click(confirm('Confirm move'));
    expect(
      store
        .getSnapshot()
        .state.bookings.find((item) => item.bookingId === ids.bookings.outage),
    ).toEqual({
      ...before.bookings.find((item) => item.bookingId === ids.bookings.outage),
      stationId: ids.stations.east,
    });
    expect(store.getSnapshot().state.attendance).toEqual(before.attendance);
    expect(store.getSnapshot().state.stations).toEqual(before.stations);
  });

  it('validates staff removal reason and selection without silently ignoring invalid input', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: admin,
    });
    await chooseClass(user, ids.classes.full);
    const before = store.getSnapshot();
    await user.click(screen.getByRole('button', { name: 'Review reseating' }));
    expect(
      screen.getByRole('alert', { name: 'Booking error' }),
    ).toHaveTextContent('Choose a booked member');
    await user.selectOptions(
      screen.getByLabelText('Booked member'),
      ids.bookings.fullMaple,
    );
    await user.click(screen.getByRole('button', { name: 'Remove booking' }));
    expect(screen.getByLabelText('Removal reason')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(store.getSnapshot()).toBe(before);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it.each([
    ['2026-10-05T17:59:59Z', true],
    ['2026-10-05T18:00:00Z', false],
    ['2026-10-05T18:00:01Z', false],
  ] as const)(
    'uses a strict cutoff for automatic FIFO promotion at %s',
    async (now, promoted) => {
      const initial = createDemoTestState({ actor: admin });
      const { store, user } = renderState({
        ...initial,
        clock: { now, presetId: null },
      });
      await chooseClass(user, ids.classes.full);
      await user.selectOptions(
        screen.getByLabelText('Booked member'),
        ids.bookings.fullMaple,
      );
      await user.type(screen.getByLabelText('Removal reason'), 'Demo removal');
      await user.click(screen.getByRole('button', { name: 'Remove booking' }));
      await user.click(confirm('Confirm removal'));
      if (promoted) {
        expect(
          store
            .getSnapshot()
            .state.waitlistEntries.find(
              (item) => item.entryId === ids.waitlist.willow,
            )?.status,
        ).toBe('promoted');
      } else {
        expect(store.getSnapshot().state.waitlistEntries).toEqual(
          initial.waitlistEntries,
        );
      }
      expect(
        store
          .getSnapshot()
          .state.bookings.filter(
            (item) =>
              item.classId === ids.classes.full && item.status === 'booked',
          ),
      ).toHaveLength(promoted ? 3 : 2);
    },
  );

  it('does not promote to a freed out-of-service station or reverse removal when there are no eligible waiters', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: admin,
    });
    await chooseClass(user, ids.classes.checkIn);
    const before = store.getSnapshot().state;
    await user.selectOptions(
      screen.getByLabelText('Booked member'),
      ids.bookings.outage,
    );
    await user.type(
      screen.getByLabelText('Removal reason'),
      'Resolve station outage',
    );
    await user.click(screen.getByRole('button', { name: 'Remove booking' }));
    await user.click(confirm('Confirm removal'));
    expect(store.getSnapshot().state.waitlistEntries).toEqual(
      before.waitlistEntries,
    );
    expect(store.getSnapshot().state.notifications).toEqual(
      before.notifications,
    );
    expect(
      store
        .getSnapshot()
        .state.attendance.find(
          (item) => item.attendanceId === ids.attendance.outage,
        )?.currentOutcome,
    ).toBe('staffRemoved');
  });

  it('a free staff move promotes into the vacated station and displays failed promotion email without reseat email', async () => {
    const initial = createDemoTestState({ actor: admin });
    const { store, user } = renderState({
      ...initial,
      simulation: { ...initial.simulation, delivery: 'failure' },
      stations: [
        ...initial.stations,
        {
          stationId: 'station:extra',
          label: 'Extra station',
          row: 3,
          column: 0,
          pm5Serial: null,
          inService: true,
        },
      ],
    });
    await chooseClass(user, ids.classes.full);
    const before = store.getSnapshot().state;
    await reseat(user, ids.bookings.fullCedar, 'station:extra');
    await user.click(confirm('Confirm move'));
    const after = store.getSnapshot().state;
    expect(
      after.bookings.find((item) => item.bookingId === ids.bookings.fullCedar)
        ?.stationId,
    ).toBe('station:extra');
    expect(after.bookings).toContainEqual(
      expect.objectContaining({
        memberId: ids.members.willow,
        stationId: ids.stations.west,
        status: 'booked',
      }),
    );
    expect(after.notifications).toHaveLength(before.notifications.length + 1);
    expect(after.notifications.at(-1)).toMatchObject({
      event: { type: 'waitlistPromoted' },
      status: 'failed',
    });
    expect(
      screen.getByRole('region', { name: 'Simulated email outcomes' }),
    ).toHaveTextContent('Failed - operation retained');
  });

  it('occupied swaps do not promote a queued member or send emails', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: admin,
    });
    await chooseClass(user, ids.classes.full);
    const before = store.getSnapshot().state;
    await reseat(user, ids.bookings.fullCedar, ids.stations.north);
    await user.click(confirm('Confirm swap'));
    expect(store.getSnapshot().state.waitlistEntries).toEqual(
      before.waitlistEntries,
    );
    expect(store.getSnapshot().state.notifications).toEqual(
      before.notifications,
    );
  });
  it('moves to a free station only after confirmation and preserves canonical attendance', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: admin,
    });
    await chooseClass(user, ids.classes.checkIn);
    const before = store.getSnapshot().state;
    await reseat(user);
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName(
      'Confirm station move',
    );
    expect(store.getSnapshot().state).toBe(before);
    await user.click(confirm('Confirm move'));
    const after = store.getSnapshot().state;
    expect(
      after.bookings.find(
        (item) => item.bookingId === ids.bookings.checkInMaple,
      )?.stationId,
    ).toBe(ids.stations.east);
    expect(after.attendance).toEqual(before.attendance);
    expect(after.notifications).toEqual(before.notifications);
  });

  it('requires explicit occupied swap confirmation; Escape cancels without mutation or success', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: admin,
    });
    await chooseClass(user, ids.classes.checkIn);
    const before = store.getSnapshot();
    await reseat(user, ids.bookings.checkInMaple, ids.stations.west);
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName(
      'Confirm occupied-station swap',
    );
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Jordan Brooks');
    await user.keyboard('{Escape}');
    expect(store.getSnapshot()).toBe(before);
    expect(
      screen.queryByRole('status', { name: 'Booking result' }),
    ).not.toBeInTheDocument();
    await reseat(user, ids.bookings.checkInMaple, ids.stations.west);
    await user.click(confirm('Confirm swap'));
    const after = store.getSnapshot().state;
    expect(
      after.bookings.find(
        (item) => item.bookingId === ids.bookings.checkInMaple,
      )?.stationId,
    ).toBe(ids.stations.west);
    expect(
      after.bookings.find(
        (item) => item.bookingId === ids.bookings.checkInCedar,
      )?.stationId,
    ).toBe(ids.stations.north);
    expect(after.attendance).toEqual(before.state.attendance);
    expect(after.waitlistEntries).toEqual(before.state.waitlistEntries);
    expect(after.notifications).toEqual(before.state.notifications);
  });

  it('rejects a revision change during confirmation without changing either assignment or announcing success', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: admin,
    });
    await chooseClass(user, ids.classes.checkIn);
    await reseat(user, ids.bookings.checkInMaple, ids.stations.west);
    submit(store, {
      type: 'updateStation',
      payload: { stationId: ids.stations.west, updates: { inService: false } },
    });
    const beforeConfirmation = store.getSnapshot();
    await user.click(confirm('Confirm swap'));
    expect(store.getSnapshot()).toBe(beforeConfirmation);
    expect(
      screen.getByRole('alert', { name: 'Booking error' }),
    ).toHaveTextContent(/state changed.*current availability/i);
    expect(
      screen.queryByRole('status', { name: 'Booking result' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Destination station')).toHaveValue('');
  });

  it.each(['stale', 'unavailable'] as const)(
    'disables reseating and shows an explicit error for %s layouts',
    async (availability) => {
      const initial = createDemoTestState({ actor: admin });
      const { store, user } = renderState({
        ...initial,
        layout: { ...initial.layout, availability },
      });
      await chooseClass(user, ids.classes.checkIn);
      const before = store.getSnapshot();
      expect(
        screen.getByRole('button', { name: 'Review reseating' }),
      ).toBeDisabled();
      expect(screen.getByLabelText('Destination station')).toBeDisabled();
      expect(
        screen
          .getAllByRole('alert')
          .some((alert) => /disabled/i.test(alert.textContent ?? '')),
      ).toBe(true);
      expect(store.getSnapshot()).toBe(before);
    },
  );

  it('scopes coach roster and controls to assigned classes and denies inactive staff', async () => {
    const { store } = renderWithDemoState(<BookingsScreen />, {
      actor: { kind: 'staff', staffId: ids.staff.coach },
    });
    const values = within(screen.getByLabelText('Class'))
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value);
    expect(values).not.toContain(ids.classes.full);
    expect(values).not.toContain(ids.classes.free);
    expect(values).toContain(ids.classes.checkIn);
    submit(store, {
      type: 'selectActor',
      payload: { actor: { kind: 'staff', staffId: ids.staff.inactive } },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Inactive staff');
    expect(screen.queryByLabelText('Booked member')).not.toBeInTheDocument();
  });

  it('retains skipped ineligible waiters and promotes the first eligible member on staff removal', async () => {
    const { store, user } = renderWithDemoState(<BookingsScreen />, {
      actor: admin,
    });
    await chooseClass(user, ids.classes.full);
    await user.selectOptions(
      screen.getByLabelText('Booked member'),
      ids.bookings.fullMaple,
    );
    await user.type(
      screen.getByLabelText('Removal reason'),
      'Demo roster resolution',
    );
    await user.click(screen.getByRole('button', { name: 'Remove booking' }));
    await user.click(confirm('Confirm removal'));
    const after = store.getSnapshot().state;
    expect(
      after.waitlistEntries.find(
        (entry) => entry.entryId === ids.waitlist.willow,
      )?.status,
    ).toBe('promoted');
    expect(
      after.waitlistEntries.find(
        (entry) => entry.entryId === ids.waitlist.moss,
      ),
    ).toMatchObject({ status: 'waiting', reviewFlags: ['memberInactive'] });
    expect(
      after.waitlistEntries.find(
        (entry) => entry.entryId === ids.waitlist.aspen,
      ),
    ).toMatchObject({ status: 'waiting', reviewFlags: ['waiverOutdated'] });
    expect(
      after.attendance.find(
        (record) => record.attendanceId === ids.attendance.fullMaple,
      )?.currentOutcome,
    ).toBe('staffRemoved');
    expect(
      screen.getByRole('table', { name: 'FIFO waitlist' }),
    ).toHaveTextContent('Current waiver required');
    expect(
      screen.getByRole('region', { name: 'Simulated email outcomes' }),
    ).toHaveTextContent('Waitlist promotion');
  });
});
