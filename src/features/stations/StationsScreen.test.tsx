import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FIXTURE_IDS as ids } from '../../demo-fixtures';
import { createDemoStore, selectClasses } from '../../demo-state';
import { DemoStateContext } from '../../demo-state/context';
import type { DemoActor, DemoState } from '../../domain';
import { createDemoTestState, renderWithDemoState } from '../../test-support';
import { StationLayout, StationsScreen } from './index';

const admin: DemoActor = { kind: 'staff', staffId: ids.staff.admin };
const member: DemoActor = { kind: 'member', memberId: ids.members.maple };

function cell(row: number, column: number) {
  return within(screen.getByRole('grid', { name: 'Station layout' })).getByRole(
    'button',
    { name: new RegExp(`^Row ${row}, column ${column}:`) },
  );
}

function renderState(state: DemoState, ui = <StationsScreen />) {
  const store = createDemoStore(state);
  const user = userEvent.setup();
  const result = render(
    <DemoStateContext.Provider value={store}>{ui}</DemoStateContext.Provider>,
  );
  return { ...result, store, user };
}

async function fill(
  label: string,
  value: string,
  user: ReturnType<typeof userEvent.setup>,
) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  if (value) await user.type(input, value);
}

describe('station management', () => {
  it('rejects a blank station update and empty destination without changing any state', async () => {
    const { store, user } = renderWithDemoState(<StationsScreen />, {
      actor: admin,
    });
    const before = store.getSnapshot();
    await fill('Station label', '   ', user);
    await user.click(screen.getByRole('button', { name: 'Save station' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A station label is required.',
    );
    expect(store.getSnapshot()).toBe(before);
    await fill('Destination row', '', user);
    await user.click(screen.getByRole('button', { name: 'Place station' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'non-negative whole numbers',
    );
    expect(store.getSnapshot()).toBe(before);
  });

  it('creates a station with label, data-only PM5, service status and coordinates', async () => {
    const { store, user } = renderWithDemoState(<StationsScreen />, {
      actor: admin,
    });
    const before = store.getSnapshot().state;
    await fill('New station label', 'Demo South', user);
    await fill('New PM5 association', 'DEMO-PM5-SOUTH', user);
    await fill('New row', '2', user);
    await fill('New column', '1', user);
    await user.click(screen.getByRole('button', { name: 'Create station' }));
    const after = store.getSnapshot().state;
    expect(after.stations).toHaveLength(before.stations.length + 1);
    expect(after.stations.at(-1)).toMatchObject({
      label: 'Demo South',
      pm5Serial: 'DEMO-PM5-SOUTH',
      inService: true,
      row: 2,
      column: 1,
    });
    expect(after.bookings).toEqual(before.bookings);
    expect(screen.getByText('Capacity: 4 in-service stations')).toBeVisible();
    expect(screen.getByText(/data only; no device connection/i)).toBeVisible();
  });

  it('rejects occupied creation and blank labels without any state mutation', async () => {
    const { store, user } = renderWithDemoState(<StationsScreen />, {
      actor: admin,
    });
    const before = store.getSnapshot();
    await fill('New station label', 'Duplicate cell', user);
    await fill('New row', '0', user);
    await fill('New column', '0', user);
    await user.click(screen.getByRole('button', { name: 'Create station' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This grid cell already contains a station.',
    );
    expect(store.getSnapshot()).toBe(before);
    await fill('New row', '2', user);
    await fill('New station label', '   ', user);
    await user.click(screen.getByRole('button', { name: 'Create station' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A station label is required.',
    );
    expect(store.getSnapshot()).toBe(before);
  });

  it('updates label and PM5, flags an outage without moving or cancelling bookings', async () => {
    const { store, user } = renderWithDemoState(<StationsScreen />, {
      actor: admin,
    });
    const before = store.getSnapshot().state;
    await fill('Station label', 'Demo renamed North', user);
    await fill('PM5 association', '', user);
    await user.click(screen.getByLabelText('In service'));
    await user.click(screen.getByRole('button', { name: 'Save station' }));
    const after = store.getSnapshot().state;
    expect(
      after.stations.find(
        (station) => station.stationId === ids.stations.north,
      ),
    ).toEqual({
      ...before.stations[0],
      label: 'Demo renamed North',
      pm5Serial: null,
      inService: false,
    });
    for (const booking of before.bookings) {
      const updated = after.bookings.find(
        (item) => item.bookingId === booking.bookingId,
      );
      expect(updated).toMatchObject({
        bookingId: booking.bookingId,
        stationId: booking.stationId,
        memberId: booking.memberId,
        status: booking.status,
      });
    }
    expect(
      after.bookings.find(
        (booking) => booking.bookingId === ids.bookings.checkInMaple,
      )?.reviewFlags,
    ).toContain('stationOutOfService');
    expect(screen.getByText('Capacity: 2 in-service stations')).toBeVisible();
    expect(
      screen.getAllByText('Station outage: staff review required').length,
    ).toBeGreaterThan(0);
  });

  it('shows zero capacity and review flags while preserving existing bookings', async () => {
    const { store, user } = renderWithDemoState(<StationsScreen />, {
      actor: admin,
      scenarioId: 'scenario:service-unavailable',
    });
    const before = store.getSnapshot().state;
    expect(screen.getByText('Capacity: 0 in-service stations')).toBeVisible();
    expect(
      screen.getByText('Zero capacity: staff review required'),
    ).toBeVisible();
    await user.click(screen.getByLabelText('In service'));
    await user.click(screen.getByRole('button', { name: 'Save station' }));
    expect(screen.getByText('Capacity: 1 in-service stations')).toBeVisible();
    expect(
      screen.queryByText('Zero capacity: staff review required'),
    ).not.toBeInTheDocument();
    expect(
      store.getSnapshot().state.bookings.map((booking, index) => ({
        ...booking,
        reviewFlags: before.bookings[index].reviewFlags,
      })),
    ).toEqual(before.bookings);
  });

  it('updates orientation and swaps via coordinate inputs without changing station metadata', async () => {
    const { store, user } = renderWithDemoState(<StationsScreen />, {
      actor: admin,
    });
    await fill('Orientation label', 'Demo entrance on the left', user);
    await user.click(screen.getByRole('button', { name: 'Save orientation' }));
    expect(store.getSnapshot().state.layout.orientationLabel).toBe(
      'Demo entrance on the left',
    );
    const before = store.getSnapshot().state;
    await fill('Destination row', '1', user);
    await fill('Destination column', '0', user);
    await user.click(screen.getByRole('button', { name: 'Place station' }));
    const after = store.getSnapshot().state;
    expect(after.stations[0]).toEqual({
      ...before.stations[0],
      row: 1,
      column: 0,
    });
    expect(after.stations[1]).toEqual({
      ...before.stations[1],
      row: 0,
      column: 0,
    });
    expect(after.bookings).toEqual(before.bookings);
    expect(after.classes).toEqual(before.classes);
  });

  it('rejects negative and fractional coordinates without dispatching', async () => {
    const { store, user } = renderWithDemoState(<StationsScreen />, {
      actor: admin,
    });
    const before = store.getSnapshot();
    for (const value of ['-1', '1.5']) {
      await fill('Destination row', value, user);
      await user.click(screen.getByRole('button', { name: 'Place station' }));
      expect(screen.getByRole('alert')).toHaveTextContent(
        'non-negative whole numbers',
      );
      expect(store.getSnapshot()).toBe(before);
    }
  });

  it('rejects stale form submission explicitly instead of overwriting newer state', async () => {
    const { store, user } = renderWithDemoState(<StationsScreen />, {
      actor: admin,
    });
    await fill('Station label', 'Old form value', user);
    act(() => {
      const result = store.submit({
        type: 'updateStation',
        payload: {
          stationId: ids.stations.north,
          updates: { label: 'Newer value' },
        },
      });
      expect(result.success).toBe(true);
    });
    const before = store.getSnapshot();
    await user.click(screen.getByRole('button', { name: 'Save station' }));
    expect(screen.getByRole('alert')).toHaveTextContent('demo state changed');
    expect(store.getSnapshot()).toBe(before);
  });
});

describe('keyboard layout placement', () => {
  it('swaps an in-service station with an outage without swapping service state, PM5 data or booking ownership', async () => {
    const { store, user } = renderWithDemoState(<StationsScreen />, {
      actor: admin,
    });
    const before = store.getSnapshot().state;
    cell(1, 1).focus();
    await user.keyboard('{Enter}{ArrowRight}{ArrowRight} ');
    const after = store.getSnapshot().state;
    expect(after.revision).toBe(before.revision + 1);
    expect(after.stations[0]).toEqual({
      ...before.stations[0],
      row: before.stations[3].row,
      column: before.stations[3].column,
    });
    expect(after.stations[3]).toEqual({
      ...before.stations[3],
      row: before.stations[0].row,
      column: before.stations[0].column,
    });
    expect(after.stations.slice(1, 3)).toEqual(before.stations.slice(1, 3));
    expect(after.bookings).toBe(before.bookings);
    expect(after.classes).toBe(before.classes);
    expect(cell(1, 1)).toHaveTextContent('Out of service');
    expect(cell(1, 3)).toHaveTextContent('Booked, checked in');
    expect(screen.getByText('Capacity: 3 in-service stations')).toBeVisible();
    expect(
      screen.queryByRole('button', { pressed: true }),
    ).not.toBeInTheDocument();
  });

  it.each([20, 100000, Number.MAX_SAFE_INTEGER])(
    'keeps coordinate %s sparse and navigable without changing metadata or bookings',
    async (position) => {
      const { store, user } = renderWithDemoState(<StationsScreen />, {
        actor: admin,
      });
      const before = store.getSnapshot().state;
      await fill('Destination row', String(position), user);
      await fill('Destination column', String(position), user);
      await user.click(screen.getByRole('button', { name: 'Place station' }));
      expect(store.getSnapshot().state.stations[0]).toEqual({
        ...before.stations[0],
        row: position,
        column: position,
      });
      expect(store.getSnapshot().state.bookings).toBe(before.bookings);
      expect(cell(position + 1, position + 1)).toHaveTextContent('Demo North');
      expect(screen.getAllByRole('gridcell').length).toBeLessThan(100);
      const after = store.getSnapshot();
      cell(position + 1, position + 1).focus();
      await user.keyboard('{ArrowUp}{ArrowLeft}');
      expect(cell(position, position)).toHaveFocus();
      expect(store.getSnapshot()).toBe(after);
    },
  );

  it('uses arrow navigation and Enter/Space to swap occupied cells, preserving every non-position field', async () => {
    const { store, user } = renderWithDemoState(<StationsScreen />, {
      actor: admin,
    });
    const before = store.getSnapshot().state;
    cell(1, 1).focus();
    await user.keyboard('{Enter}{ArrowDown}');
    expect(cell(2, 1)).toHaveFocus();
    expect(store.getSnapshot().state).toBe(before);
    await user.keyboard(' ');
    const after = store.getSnapshot().state;
    expect(after.stations[0]).toEqual({
      ...before.stations[0],
      row: 1,
      column: 0,
    });
    expect(after.stations[1]).toEqual({
      ...before.stations[1],
      row: 0,
      column: 0,
    });
    expect(after.stations.slice(2)).toEqual(before.stations.slice(2));
    expect(after.bookings).toBe(before.bookings);
    expect(after.classes).toBe(before.classes);
    expect(after.attendance).toBe(before.attendance);
    expect(after.waitlistEntries).toBe(before.waitlistEntries);
    expect(after.layout).toBe(before.layout);
    expect(screen.getByText('Capacity: 3 in-service stations')).toBeVisible();
    expect(cell(2, 1)).toHaveFocus();
    expect(
      screen.getByRole('status', { name: 'Layout interaction' }),
    ).toHaveTextContent(/placed/i);
  });

  it('moves into an empty cell and supports all arrows with boundary-safe focus', async () => {
    const { store, user } = renderWithDemoState(<StationsScreen />, {
      actor: admin,
    });
    const before = store.getSnapshot().state;
    cell(1, 1).focus();
    await user.keyboard('{ArrowLeft}{ArrowUp}');
    expect(cell(1, 1)).toHaveFocus();
    await user.keyboard(' {ArrowRight}{Enter}');
    expect(store.getSnapshot().state.stations[0]).toEqual({
      ...before.stations[0],
      column: 1,
    });
    expect(store.getSnapshot().state.bookings).toBe(before.bookings);
    await user.keyboard('{ArrowDown}{ArrowLeft}{ArrowUp}');
    expect(cell(1, 1)).toHaveFocus();
    expect(cell(1, 1)).toHaveTextContent('Empty cell');
  });

  it('cancels a pick with Escape and never mutates on navigation, empty-cell activation or cancellation', async () => {
    const { store, user } = renderWithDemoState(<StationsScreen />, {
      actor: admin,
    });
    const before = store.getSnapshot();
    cell(1, 1).focus();
    await user.keyboard('{Enter}{ArrowRight}{Escape}{Enter}');
    expect(store.getSnapshot()).toBe(before);
    expect(
      screen.getByRole('status', { name: 'Layout interaction' }),
    ).toHaveTextContent(/empty cell/i);
    expect(
      screen.queryByRole('button', { pressed: true }),
    ).not.toBeInTheDocument();
  });

  it('rejects a stale keyboard drop with no failed-action mutation', async () => {
    const { store, user } = renderWithDemoState(<StationsScreen />, {
      actor: admin,
    });
    cell(1, 1).focus();
    await user.keyboard('{Enter}{ArrowDown}');
    act(() => {
      store.submit({
        type: 'setLayoutOrientation',
        payload: { orientationLabel: 'Changed elsewhere' },
      });
    });
    const before = store.getSnapshot();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('demo state changed');
    expect(store.getSnapshot()).toBe(before);
  });
});

describe('role-aware class overlays', () => {
  it('removes authorized names and pending picks immediately when switching to a member persona', async () => {
    const { store, user, container } = renderWithDemoState(<StationsScreen />, {
      actor: admin,
    });
    expect(cell(1, 1)).toHaveTextContent('Fictional Maple');
    cell(1, 1).focus();
    await user.keyboard('{Enter}');
    act(() => {
      expect(
        store.submit({ type: 'selectActor', payload: { actor: member } })
          .success,
      ).toBe(true);
    });
    const afterSwitch = store.getSnapshot();
    for (const record of afterSwitch.state.members) {
      expect(container).not.toHaveTextContent(record.displayName);
    }
    for (const station of afterSwitch.state.stations) {
      if (station.pm5Serial) {
        expect(container).not.toHaveTextContent(station.pm5Serial);
      }
    }
    expect(screen.queryByLabelText('Station label')).not.toBeInTheDocument();
    cell(1, 1).focus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(store.getSnapshot()).toBe(afterSwitch);
  });

  it('renders textual states, icons and authorized staff names from the selected overlay', async () => {
    renderWithDemoState(<StationsScreen />, { actor: admin });
    expect(cell(1, 1)).toHaveTextContent('Booked, checked in');
    expect(cell(2, 1)).toHaveTextContent('Booked, not checked in');
    expect(cell(2, 3)).toHaveTextContent('Available');
    expect(cell(1, 3)).toHaveTextContent('Out of service');
    expect(cell(1, 1)).toHaveTextContent('Fictional Maple');
    expect(cell(1, 3)).toHaveTextContent('Fictional Moss');
    expect(cell(1, 3)).toHaveAccessibleName(
      /Station outage: staff review required/,
    );
    expect(cell(1, 1).querySelector('[aria-hidden="true"]')).not.toBeNull();
    const options = within(screen.getByLabelText('Class overlay')).getAllByRole(
      'option',
    );
    expect(options.map((option) => option.getAttribute('value'))).not.toContain(
      ids.classes.history,
    );
    expect(options.map((option) => option.getAttribute('value'))).not.toContain(
      ids.classes.cancelled,
    );
  });

  it('defaults to the in-progress class and uses one roving tab stop in the grid', () => {
    const initial = createDemoTestState({ actor: admin });
    renderState({
      ...initial,
      clock: { ...initial.clock, now: '2026-10-05T16:30:00Z' },
    });
    expect(screen.getByLabelText('Class overlay')).toHaveValue(
      ids.classes.checkIn,
    );
    expect(screen.getByText(/Current class/)).toBeVisible();
    expect(
      within(screen.getByRole('grid'))
        .getAllByRole('button')
        .filter((button) => button.tabIndex === 0),
    ).toHaveLength(1);
  });

  it('applies member release rules and cannot leak an explicitly requested unreleased overlay', () => {
    const initial = createDemoTestState({ actor: member });
    const { container } = renderState(
      {
        ...initial,
        settings: {
          ...initial.settings,
          scheduleRelease: { mode: 'manual' },
        },
      },
      <StationLayout classId={ids.classes.laterRelease} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /not available to this persona/,
    );
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    for (const record of initial.members) {
      expect(container).not.toHaveTextContent(record.displayName);
    }
  });

  it('selects future overlays and defaults to the current class after the clock advances', async () => {
    const { store, user } = renderWithDemoState(<StationsScreen />, {
      actor: admin,
    });
    expect(screen.getByLabelText('Class overlay')).toHaveValue(
      ids.classes.checkIn,
    );
    await user.selectOptions(
      screen.getByLabelText('Class overlay'),
      ids.classes.full,
    );
    expect(cell(2, 3)).toHaveTextContent('Fictional Birch');
    const before = store.getSnapshot();
    expect(before.hasUnsavedEdits).toBe(false);
    act(() => {
      store.advanceClock('2026-10-05T20:00:00Z');
    });
    expect(screen.getByLabelText('Class overlay')).toHaveValue(
      ids.classes.draft,
    );
    expect(cell(1, 1)).toHaveTextContent('Available');
  });

  it('never renders any assigned name or private member data for members, and has no editing controls', async () => {
    const { store, container, user } = renderWithDemoState(<StationsScreen />, {
      actor: member,
    });
    const before = store.getSnapshot();
    for (const record of before.state.members) {
      expect(container).not.toHaveTextContent(record.displayName);
      expect(container).not.toHaveTextContent(record.verifiedEmail);
      expect(container).not.toHaveTextContent(record.memberId);
      expect(container).not.toHaveTextContent(record.identitySubject);
    }
    expect(screen.queryByLabelText('Station label')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create station' }),
    ).not.toBeInTheDocument();
    cell(1, 1).focus();
    await user.keyboard('{Enter}{ArrowDown} ');
    expect(store.getSnapshot()).toBe(before);
    expect(cell(1, 1)).toHaveTextContent('Booked, checked in');
    expect(
      screen.getByRole('status', { name: 'Layout interaction' }),
    ).toHaveTextContent(/read-only/i);
    expect(
      within(screen.getByLabelText('Class overlay')).queryByRole('option', {
        name: /draft/i,
      }),
    ).not.toBeInTheDocument();
  });

  it.each([ids.staff.frontDesk, ids.staff.coach])(
    'keeps non-admin staff placement read-only for %s',
    async (staffId) => {
      const { store, user } = renderWithDemoState(<StationsScreen />, {
        actor: { kind: 'staff', staffId },
      });
      const before = store.getSnapshot();
      expect(cell(1, 1)).toHaveTextContent('Fictional Maple');
      expect(screen.queryByLabelText('Station label')).not.toBeInTheDocument();
      cell(1, 1).focus();
      await user.keyboard('{Enter}{ArrowDown}{Enter}');
      expect(store.getSnapshot()).toBe(before);
    },
  );

  it('limits coach class choices and rejects an explicitly requested out-of-scope overlay without names', () => {
    const actor: DemoActor = { kind: 'staff', staffId: ids.staff.coach };
    const { unmount } = renderWithDemoState(<StationsScreen />, { actor });
    expect(
      Array.from(
        screen.getByLabelText('Class overlay').querySelectorAll('option'),
      ).map((option) => option.value),
    ).toEqual([ids.classes.checkIn, ids.classes.laterRelease]);
    unmount();
    const { container } = renderWithDemoState(
      <StationLayout classId={ids.classes.full} />,
      { actor },
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /not available to this persona/i,
    );
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('Fictional Birch');
  });

  it('exports a read-only reusable layout even for an admin unless editing is explicitly enabled', async () => {
    const { store, user } = renderWithDemoState(
      <StationLayout classId={ids.classes.checkIn} />,
      { actor: admin },
    );
    const before = store.getSnapshot();
    cell(1, 1).focus();
    await user.keyboard('{Enter}{ArrowDown}{Enter}');
    expect(store.getSnapshot()).toBe(before);
    expect(screen.queryByLabelText('Class overlay')).not.toBeInTheDocument();
  });

  it('denies inactive staff explicitly with no layout or editable station data', () => {
    const state = createDemoTestState();
    renderState({
      ...state,
      activeActor: { kind: 'staff', staffId: ids.staff.inactive },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/inactive staff/i);
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Station label')).not.toBeInTheDocument();
  });
});

describe('unavailable layouts', () => {
  it('discards an active pick when layout data becomes stale and leaves the replacement snapshot unchanged', async () => {
    const { store, user } = renderWithDemoState(<StationsScreen />, {
      actor: admin,
    });
    cell(1, 1).focus();
    await user.keyboard('{Enter}{ArrowDown}');
    act(() => {
      expect(
        store.loadScenario('scenario:layout-stale', { confirmed: true })
          .success,
      ).toBe(true);
      expect(
        store.submit({ type: 'selectActor', payload: { actor: admin } })
          .success,
      ).toBe(true);
    });
    const afterLoad = store.getSnapshot();
    expect(screen.getByRole('alert')).toHaveTextContent(/stale/i);
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Place station' }));
    expect(store.getSnapshot()).toBe(afterLoad);
  });

  it.each([
    ['scenario:layout-stale', /stale/i],
    ['scenario:layout-unavailable', /unavailable/i],
  ] as const)(
    'disables map-based operations with an explicit reason for %s',
    async (scenarioId, reason) => {
      const { store, user } = renderWithDemoState(<StationsScreen />, {
        actor: admin,
        scenarioId,
      });
      const before = store.getSnapshot();
      expect(screen.getByRole('alert')).toHaveTextContent(reason);
      expect(screen.queryByRole('grid')).not.toBeInTheDocument();
      for (const name of [
        'Create station',
        'Place station',
        'Save orientation',
      ]) {
        const button = screen.getByRole('button', { name });
        expect(button).toBeDisabled();
        await user.click(button);
      }
      expect(store.getSnapshot()).toBe(before);
      expect(
        screen.getByRole('button', { name: 'Save station' }),
      ).toBeEnabled();
    },
  );

  it('rejects inconsistent station positions without rendering an actionable map', () => {
    const initial = createDemoTestState({ actor: admin });
    renderState({
      ...initial,
      stations: initial.stations.map((station) => ({
        ...station,
        row: 0,
        column: 0,
      })),
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /positions are inconsistent/i,
    );
    expect(
      screen.getByRole('button', { name: 'Place station' }),
    ).toBeDisabled();
  });
});

describe('base schematic without a class overlay', () => {
  it('denies an outstanding invitation with no scoped classes without exposing the base schematic or station data', () => {
    const { store, container } = renderWithDemoState(<StationsScreen />, {
      actor: admin,
    });
    expect(screen.getByRole('grid')).toBeInTheDocument();
    act(() => {
      expect(
        store.submit({
          type: 'selectActor',
          payload: {
            actor: {
              kind: 'invitation',
              invitationId: ids.invitations.outstanding,
            },
          },
        }).success,
      ).toBe(true);
    });
    const { state } = store.getSnapshot();
    expect(
      selectClasses(state, {
        actor: state.activeActor,
        now: state.clock.now,
      }),
    ).toEqual([]);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This actor cannot view class layouts.',
    );
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Base station arrangement/),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Class overlay')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Admin station management' }),
    ).not.toBeInTheDocument();
    for (const station of state.stations) {
      expect(container).not.toHaveTextContent(station.label);
      expect(container).not.toHaveTextContent(station.stationId);
      if (station.pm5Serial) {
        expect(container).not.toHaveTextContent(station.pm5Serial);
      }
    }
    if (state.layout.orientationLabel) {
      expect(container).not.toHaveTextContent(state.layout.orientationLabel);
    }
    for (const record of state.members) {
      for (const value of [
        record.displayName,
        record.verifiedEmail,
        record.memberId,
        record.identitySubject,
      ]) {
        expect(container).not.toHaveTextContent(value);
      }
    }
  });

  function advancePastClasses(store: ReturnType<typeof createDemoStore>) {
    act(() => {
      expect(store.advanceClock('2026-12-01T00:00:00Z').success).toBe(true);
    });
    expect(
      store
        .getSnapshot()
        .state.classes.some(
          (item) =>
            item.status !== 'cancelled' &&
            item.status !== 'completed' &&
            item.endsAt > store.getSnapshot().state.clock.now,
        ),
    ).toBe(false);
  }

  it('keeps the current base arrangement and real Admin creation, placement and orientation usable after all classes end', async () => {
    const { store, user, container } = renderWithDemoState(<StationsScreen />, {
      actor: admin,
    });
    advancePastClasses(store);
    const before = store.getSnapshot().state;
    expect(before.layout.availability).toBe('current');
    expect(screen.getByText(/Base station arrangement/)).toBeVisible();
    expect(screen.queryByLabelText('Class overlay')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    for (const station of before.stations) {
      expect(cell(station.row + 1, station.column + 1)).toHaveTextContent(
        station.label,
      );
      expect(cell(station.row + 1, station.column + 1)).toHaveTextContent(
        station.inService ? 'In service' : 'Out of service',
      );
    }
    for (const record of before.members) {
      expect(container).not.toHaveTextContent(record.displayName);
    }
    const grid = screen.getByRole('grid');
    expect(grid).not.toHaveTextContent(/Available|Booked|checked in/i);

    await fill('New station label', 'Demo after schedule', user);
    await fill('New row', '2', user);
    await fill('New column', '1', user);
    await user.click(screen.getByRole('button', { name: 'Create station' }));
    expect(store.getSnapshot().state.stations).toHaveLength(
      before.stations.length + 1,
    );
    expect(cell(3, 2)).toHaveTextContent('Demo after schedule');
    await fill('Destination row', '1', user);
    await fill('Destination column', '0', user);
    await user.click(screen.getByRole('button', { name: 'Place station' }));
    expect(store.getSnapshot().state.stations[0]).toEqual({
      ...before.stations[0],
      row: 1,
      column: 0,
    });
    expect(store.getSnapshot().state.stations[1]).toEqual({
      ...before.stations[1],
      row: 0,
      column: 0,
    });
    cell(2, 1).focus();
    await user.keyboard('{Enter}{ArrowRight}{Enter}');
    expect(store.getSnapshot().state.stations[0]).toEqual({
      ...before.stations[0],
      row: 1,
      column: 1,
    });
    await fill('Orientation label', 'Demo base entrance', user);
    await user.click(screen.getByRole('button', { name: 'Save orientation' }));
    expect(store.getSnapshot().state.layout.orientationLabel).toBe(
      'Demo base entrance',
    );
    expect(screen.getByText('Demo base entrance')).toBeVisible();
    const after = store.getSnapshot().state;
    expect(after.bookings).toEqual(before.bookings);
    expect(after.classes).toEqual(before.classes);
    expect(after.attendance).toEqual(before.attendance);
    expect(after.waitlistEntries).toEqual(before.waitlistEntries);
  });

  it.each([
    { kind: 'staff', staffId: ids.staff.frontDesk },
    { kind: 'staff', staffId: ids.staff.coach },
    member,
  ] satisfies DemoActor[])(
    'keeps the base schematic private and placement read-only for $kind $staffId',
    async (actor) => {
      const { store, user, container } = renderWithDemoState(
        <StationsScreen />,
        { actor },
      );
      advancePastClasses(store);
      const before = store.getSnapshot();
      expect(screen.getByText(/Base station arrangement/)).toBeVisible();
      expect(cell(1, 1)).toHaveTextContent('In service');
      expect(cell(1, 3)).toHaveTextContent('Out of service');
      expect(screen.getByRole('grid')).not.toHaveTextContent(
        /Available|Booked|checked in/i,
      );
      for (const record of before.state.members) {
        for (const value of [
          record.displayName,
          record.verifiedEmail,
          record.memberId,
          record.identitySubject,
        ]) {
          expect(container).not.toHaveTextContent(value);
        }
      }
      for (const station of before.state.stations) {
        if (station.pm5Serial) {
          expect(container).not.toHaveTextContent(station.pm5Serial);
        }
      }
      expect(
        screen.queryByRole('region', { name: 'Admin station management' }),
      ).not.toBeInTheDocument();
      cell(1, 1).focus();
      await user.keyboard('{Enter}{ArrowDown} ');
      expect(store.getSnapshot()).toBe(before);
      expect(
        screen.getByRole('status', { name: 'Layout interaction' }),
      ).toHaveTextContent(/read-only/i);
    },
  );

  it('keeps the reusable base layout read-only even for an Admin without the editing opt-in', async () => {
    const { store, user } = renderWithDemoState(<StationLayout />, {
      actor: admin,
    });
    advancePastClasses(store);
    const before = store.getSnapshot();
    expect(cell(1, 1)).toHaveTextContent('In service');
    expect(
      screen.queryByRole('button', { name: 'Create station' }),
    ).not.toBeInTheDocument();
    cell(1, 1).focus();
    await user.keyboard('{Enter}{ArrowDown}{Enter}');
    expect(store.getSnapshot()).toBe(before);
  });

  it('discards a base pick when switching from Admin to a member without exposing names or changing positions', async () => {
    const { store, user, container } = renderWithDemoState(<StationsScreen />, {
      actor: admin,
    });
    advancePastClasses(store);
    cell(1, 1).focus();
    await user.keyboard('{Enter}');
    act(() => {
      expect(
        store.submit({ type: 'selectActor', payload: { actor: member } })
          .success,
      ).toBe(true);
    });
    const before = store.getSnapshot();
    expect(
      screen.queryByRole('button', { pressed: true }),
    ).not.toBeInTheDocument();
    for (const record of before.state.members) {
      expect(container).not.toHaveTextContent(record.displayName);
    }
    cell(1, 1).focus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(store.getSnapshot()).toBe(before);
  });

  it('does not replace an explicitly requested expired class overlay with an actionable base map', () => {
    const { store } = renderWithDemoState(
      <StationLayout classId={ids.classes.checkIn} editable />,
      { actor: admin },
    );
    advancePastClasses(store);
    expect(screen.getByRole('alert')).toHaveTextContent(
      /class overlay is not available/i,
    );
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Place station' }),
    ).toBeDisabled();
  });

  it.each([
    ['scenario:layout-stale', /stale/i],
    ['scenario:layout-unavailable', /unavailable/i],
  ] as const)(
    'does not mistake %s for a current base when no classes remain',
    async (scenarioId, reason) => {
      const { store, user } = renderWithDemoState(<StationsScreen />, {
        actor: admin,
        scenarioId,
      });
      advancePastClasses(store);
      const before = store.getSnapshot();
      expect(screen.getByRole('alert')).toHaveTextContent(reason);
      expect(screen.queryByRole('grid')).not.toBeInTheDocument();
      for (const name of [
        'Create station',
        'Place station',
        'Save orientation',
      ]) {
        const button = screen.getByRole('button', { name });
        expect(button).toBeDisabled();
        await user.click(button);
      }
      expect(store.getSnapshot()).toBe(before);
    },
  );

  it('still rejects inconsistent base positions after the real clock advances', () => {
    const initial = createDemoTestState({ actor: admin });
    const { store } = renderState({
      ...initial,
      stations: initial.stations.map((station) => ({
        ...station,
        row: 0,
        column: 0,
      })),
    });
    advancePastClasses(store);
    expect(screen.getByRole('alert')).toHaveTextContent(
      /positions are inconsistent/i,
    );
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Place station' }),
    ).toBeDisabled();
  });
});
