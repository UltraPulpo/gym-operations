import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FIXTURE_IDS as ids } from '../../demo-fixtures';
import { createDemoStore } from '../../demo-state';
import { DemoStateContext } from '../../demo-state/context';
import type {
  AttendanceId,
  DemoActor,
  DemoState,
  UtcInstant,
} from '../../domain';
import { createDemoTestState, renderWithDemoState } from '../../test-support';
import { AttendanceScreen } from './index';

const admin: DemoActor = { kind: 'staff', staffId: ids.staff.admin };
const cedar: DemoActor = { kind: 'member', memberId: ids.members.cedar };

function renderState(state: DemoState) {
  const store = createDemoStore(state);
  const user = userEvent.setup();
  return {
    ...render(
      <DemoStateContext.Provider value={store}>
        <AttendanceScreen />
      </DemoStateContext.Provider>,
    ),
    store,
    user,
  };
}

function attendanceRow(name: string) {
  return within(
    screen.getByRole('table', { name: 'Class attendance roster' }),
  ).getByRole('row', { name: new RegExp(name) });
}

function record(
  state: DemoState,
  attendanceId: AttendanceId = ids.attendance.checkInCedar,
) {
  return state.attendance.find((item) => item.attendanceId === attendanceId)!;
}

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
) {
  const field = screen.getByLabelText(label);
  await user.clear(field);
  if (value) await user.type(field, value);
}

describe('attendance role and privacy projections', () => {
  it('shows only the member own booking and no staff roster, exports or manual controls', () => {
    const { container } = renderWithDemoState(<AttendanceScreen />, {
      actor: cedar,
    });
    expect(attendanceRow('Fictional Cedar')).toHaveTextContent(
      'Not checked in',
    );
    expect(screen.queryByText('Fictional Maple')).not.toBeInTheDocument();
    expect(screen.queryByText('Fictional Moss')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Download|Print|Reverse|Correct/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Manual member')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('@example.invalid');
    expect(screen.getByText(/offline booking is unsupported/i)).toBeVisible();
    expect(screen.getByText(/refresh resets/i)).toBeVisible();
  });

  it.each([ids.staff.admin, ids.staff.frontDesk, ids.staff.multiRole])(
    'allows all-class staff attendance and exports for %s',
    (staffId) => {
      renderWithDemoState(<AttendanceScreen />, {
        actor: { kind: 'staff', staffId },
      });
      expect(
        screen.getByRole('button', { name: 'Download roster' }),
      ).toBeEnabled();
      expect(
        screen.getByRole('button', { name: 'Print roster' }),
      ).toBeEnabled();
      expect(screen.getByLabelText('Attendance class')).toContainHTML(
        ids.classes.full,
      );
      expect(attendanceRow('Fictional Maple')).toHaveTextContent('Checked in');
      expect(screen.getByLabelText('Manual member')).toBeEnabled();
    },
  );

  it('limits coach classes and manual members to existing role projections', () => {
    renderWithDemoState(<AttendanceScreen />, {
      actor: { kind: 'staff', staffId: ids.staff.coach },
    });
    const classes = screen.getByLabelText('Attendance class');
    expect(classes).toContainHTML(ids.classes.checkIn);
    expect(classes).not.toContainHTML(ids.classes.full);
    expect(screen.getByLabelText('Manual class')).not.toContainHTML(
      ids.classes.free,
    );
    expect(screen.getByLabelText('Manual member')).not.toContainHTML(
      ids.members.aspen,
    );
  });

  it.each([
    { kind: 'staff', staffId: ids.staff.inactive },
    { kind: 'invitation', invitationId: ids.invitations.outstanding },
    { kind: 'staff', staffId: 'staff:missing' },
  ] satisfies DemoActor[])(
    'denies inaccessible personas without data leakage',
    (activeActor) => {
      const initial = createDemoTestState();
      const { store } = renderState({ ...initial, activeActor });
      const before = store.getSnapshot();
      expect(screen.getByRole('alert')).toBeVisible();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText('Attendance class'),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Fictional Maple')).not.toBeInTheDocument();
      expect(store.getSnapshot()).toBe(before);
    },
  );

  it('clears staff forms, notices and print data immediately when switching to a member', async () => {
    const { store, user, container } = renderWithDemoState(
      <AttendanceScreen />,
      {
        actor: admin,
      },
    );
    await fill(user, 'Correction reason', 'Staff-only private note');
    act(() => {
      store.submit({ type: 'selectActor', payload: { actor: cedar } });
    });
    expect(
      screen.queryByLabelText('Correction reason'),
    ).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('Staff-only private note');
    expect(screen.queryByText('Printable roster')).not.toBeInTheDocument();
    expect(screen.queryByText('Fictional Maple')).not.toBeInTheDocument();
  });
});

describe('member self-check-in boundaries', () => {
  it.each([
    ['2026-10-05T15:29:59Z', false],
    ['2026-10-05T15:30:00Z', true],
    ['2026-10-05T16:05:00Z', true],
    ['2026-10-05T16:05:01Z', false],
  ] satisfies [UtcInstant, boolean][])(
    'uses the frozen clock at %s with allowed=%s',
    async (now, allowed) => {
      const state = createDemoTestState({ actor: cedar });
      const { store, user } = renderState({
        ...state,
        clock: { now, presetId: null },
      });
      const before = store.getSnapshot();
      const button = screen.getByRole('button', {
        name: 'Check in Fictional Cedar',
      });
      expect(
        screen.getByText(/30 minutes before.*5 minutes after/i),
      ).toBeVisible();
      if (allowed) {
        await user.click(button);
        expect(record(store.getSnapshot().state)).toMatchObject({
          currentOutcome: 'attended',
          checkIn: { status: 'checkedIn', checkedInAt: now },
        });
        expect(screen.getByRole('status')).toHaveTextContent(
          'Simulated check-in recorded',
        );
      } else {
        expect(button).toBeDisabled();
        expect(screen.getByText(/configured class window/i)).toBeVisible();
        expect(store.getSnapshot()).toBe(before);
      }
    },
  );

  it('uses adjusted lead/grace values and allows an earlier class still in progress', async () => {
    const state = createDemoTestState({ actor: cedar });
    const { store, user } = renderState({
      ...state,
      settings: {
        ...state.settings,
        checkInLeadMinutes: 10,
        checkInGraceMinutes: 2,
      },
      clock: { now: '2026-10-05T15:50:00Z', presetId: null },
      classes: [
        ...state.classes,
        {
          ...state.classes.find(
            (item) => item.classId === ids.classes.checkIn,
          )!,
          classId: 'class:earlier-overlap',
          startsAt: '2026-10-05T15:15:00Z',
          endsAt: '2026-10-05T16:00:00Z',
        },
      ],
    });
    expect(
      screen.getByText(/10 minutes before.*2 minutes after/i),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Check in Fictional Cedar' }),
    );
    expect(record(store.getSnapshot().state).currentOutcome).toBe('attended');
  });

  it.each(['outdated', 'missing', 'inactive', 'pending'] as const)(
    'disables self-check-in for %s eligibility without mutating state',
    (condition) => {
      const state = createDemoTestState({ actor: cedar });
      const { store } = renderState({
        ...state,
        members: state.members.map((member) =>
          member.memberId === ids.members.cedar &&
          (condition === 'inactive' || condition === 'pending')
            ? { ...member, status: condition }
            : member,
        ),
        waiverSignatures: state.waiverSignatures.filter(
          (signature) =>
            signature.memberId !== ids.members.cedar ||
            (condition !== 'missing' &&
              (condition !== 'outdated' ||
                signature.waiverVersionId === ids.waivers.old)),
        ),
      });
      const before = store.getSnapshot();
      expect(
        screen.getByRole('button', { name: 'Check in Fictional Cedar' }),
      ).toBeDisabled();
      expect(
        screen.getByText(
          condition === 'inactive' || condition === 'pending'
            ? /Only active members/
            : /current waiver/i,
        ),
      ).toBeVisible();
      expect(store.getSnapshot()).toBe(before);
    },
  );
});

describe('staff attendance and history', () => {
  it('checks in before the member window, then reverses with a reason without changing bookings', async () => {
    const state = createDemoTestState({ actor: admin });
    const { store, user } = renderState({
      ...state,
      clock: { now: '2026-10-05T14:00:00Z', presetId: null },
    });
    const bookings = store.getSnapshot().state.bookings;
    await user.click(
      screen.getByRole('button', { name: 'Check in Fictional Cedar' }),
    );
    expect(record(store.getSnapshot().state).checkIn.status).toBe('checkedIn');
    await user.selectOptions(
      screen.getByLabelText('Attendance record'),
      ids.attendance.checkInCedar,
    );
    await fill(user, 'Correction reason', 'Fictional check-in mistake');
    await user.click(screen.getByRole('button', { name: 'Reverse check-in' }));
    const after = record(store.getSnapshot().state);
    expect(after.checkIn.status).toBe('notCheckedIn');
    expect(after.currentOutcome).toBe('booked');
    expect(after.corrections).toHaveLength(2);
    expect(attendanceRow('Fictional Cedar')).toHaveTextContent(
      'Fictional check-in mistake',
    );
    expect(store.getSnapshot().state.bookings).toEqual(bookings);
  });

  it('shows exact-end no-shows and treats post-end check-in/reversal as outcome corrections only', async () => {
    const { store, user } = renderWithDemoState(<AttendanceScreen />, {
      actor: admin,
    });
    act(() => {
      store.advanceClock('2026-10-05T16:45:00Z');
    });
    expect(attendanceRow('Fictional Cedar')).toHaveTextContent('No-show');
    expect(
      screen.getByText(/after class end.*do not create or reopen/i),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', {
        name: 'Correct to attended for Fictional Cedar',
      }),
    );
    const corrected = record(store.getSnapshot().state);
    expect(corrected.checkIn.status).toBe('notCheckedIn');
    expect(corrected.currentOutcome).toBe('attended');
    expect(corrected.corrections).toHaveLength(1);
    const mapleCheckIn = record(
      store.getSnapshot().state,
      ids.attendance.checkInMaple,
    ).checkIn;
    await user.selectOptions(
      screen.getByLabelText('Attendance record'),
      ids.attendance.checkInMaple,
    );
    await fill(user, 'Correction reason', 'Fictional post-end reconciliation');
    await user.click(
      screen.getByRole('button', { name: 'Correct to no-show' }),
    );
    expect(
      record(store.getSnapshot().state, ids.attendance.checkInMaple).checkIn,
    ).toEqual(mapleCheckIn);
    expect(
      record(store.getSnapshot().state, ids.attendance.checkInMaple)
        .currentOutcome,
    ).toBe('noShow');
    act(() => {
      store.advanceClock('2026-10-05T16:46:00Z');
      store.advanceClock('2026-10-05T16:47:00Z');
    });
    expect(record(store.getSnapshot().state)).toEqual(corrected);
  });

  it('rejects blank reasons and unchanged outcomes without mutation or success', async () => {
    const { store, user } = renderWithDemoState(<AttendanceScreen />, {
      actor: admin,
    });
    await user.selectOptions(
      screen.getByLabelText('Attendance record'),
      ids.attendance.checkInCedar,
    );
    const before = store.getSnapshot();
    await user.click(
      screen.getByRole('button', { name: 'Save attendance correction' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Explain the attendance correction',
    );
    expect(store.getSnapshot()).toBe(before);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await fill(user, 'Correction reason', 'Fictional review');
    await user.selectOptions(
      screen.getByLabelText('Corrected outcome'),
      'booked',
    );
    await user.click(
      screen.getByRole('button', { name: 'Save attendance correction' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'different from the current',
    );
    expect(store.getSnapshot()).toBe(before);
  });

  it('retains prior correction history and distinguishes late cancellation and staff removal', async () => {
    const { store, user } = renderWithDemoState(<AttendanceScreen />, {
      actor: admin,
    });
    await user.selectOptions(
      screen.getByLabelText('Attendance class'),
      ids.classes.history,
    );
    expect(attendanceRow('Fictional Willow')).toHaveTextContent('Late cancel');
    expect(attendanceRow('Fictional Juniper')).toHaveTextContent(
      'Staff removal',
    );
    const previous = record(
      store.getSnapshot().state,
      ids.attendance.historyCorrected,
    );
    await user.selectOptions(
      screen.getByLabelText('Attendance record'),
      ids.attendance.historyCorrected,
    );
    await user.selectOptions(
      screen.getByLabelText('Corrected outcome'),
      'noShow',
    );
    await fill(user, 'Correction reason', 'Fictional second review');
    await user.click(
      screen.getByRole('button', { name: 'Save attendance correction' }),
    );
    const after = record(
      store.getSnapshot().state,
      ids.attendance.historyCorrected,
    );
    expect(after.corrections.slice(0, -1)).toEqual(previous.corrections);
    expect(after.currentOutcome).toBe('noShow');
    expect(attendanceRow('Fictional Birch')).toHaveTextContent(
      'Fictional second review',
    );
  });

  it('rejects a correction form made stale by clock advancement instead of overwriting', async () => {
    const { store, user } = renderWithDemoState(<AttendanceScreen />, {
      actor: admin,
    });
    await user.selectOptions(
      screen.getByLabelText('Attendance record'),
      ids.attendance.checkInCedar,
    );
    await fill(user, 'Correction reason', 'Old form');
    act(() => {
      store.advanceClock('2026-10-05T16:45:00Z');
    });
    const before = store.getSnapshot();
    await user.click(
      screen.getByRole('button', { name: 'Save attendance correction' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('state changed');
    expect(store.getSnapshot()).toBe(before);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await fill(user, 'Correction reason', 'Reviewed current no-show');
    await user.click(
      screen.getByRole('button', { name: 'Save attendance correction' }),
    );
    expect(record(store.getSnapshot().state).currentOutcome).toBe('attended');
  });

  it('shows coach historical names for scoped attendance, including no-longer-booked members', async () => {
    const { user } = renderWithDemoState(<AttendanceScreen />, {
      actor: { kind: 'staff', staffId: ids.staff.coach },
    });
    await user.selectOptions(
      screen.getByLabelText('Attendance class'),
      ids.classes.history,
    );
    expect(attendanceRow('Fictional Willow')).toHaveTextContent('Late cancel');
    expect(attendanceRow('Fictional Juniper')).toHaveTextContent(
      'Staff removal',
    );
  });

  it('rejects a blank reversal reason and keeps the original check-in', async () => {
    const { store, user } = renderWithDemoState(<AttendanceScreen />, {
      actor: admin,
    });
    const before = store.getSnapshot();
    await user.selectOptions(
      screen.getByLabelText('Attendance record'),
      ids.attendance.checkInMaple,
    );
    await user.click(screen.getByRole('button', { name: 'Reverse check-in' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Explain why check-in is reversed',
    );
    expect(store.getSnapshot()).toBe(before);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('manual outage reconciliation and roster artifacts', () => {
  it('allows a coach to reconcile an unbooked member by identifier without exposing a global member directory', async () => {
    const state = createDemoTestState({
      actor: { kind: 'staff', staffId: ids.staff.coach },
    });
    const { store, user, container } = renderState({
      ...state,
      bookings: [],
      attendance: [],
    });
    expect(container.textContent).not.toContain('Fictional Juniper');
    await fill(user, 'Manual member identifier', ids.members.juniper);
    await fill(user, 'Manual entry reason', 'Fictional paper attendance');
    await user.click(
      screen.getByRole('button', { name: 'Record manual attendance' }),
    );
    expect(store.getSnapshot().state.bookings).toEqual([]);
    expect(attendanceRow('Fictional Juniper')).toHaveTextContent(
      'Manual outage',
    );
    expect(store.getSnapshot().state.attendance[0]).toMatchObject({
      classId: ids.classes.checkIn,
      memberId: ids.members.juniper,
      currentOutcome: 'attended',
      checkIn: { status: 'notCheckedIn' },
    });
    expect(container.textContent).not.toContain('Fictional Aspen');
  });

  it('rejects an unknown manually entered member identifier without mutation or success', async () => {
    const { store, user } = renderWithDemoState(<AttendanceScreen />, {
      actor: admin,
    });
    await fill(user, 'Manual member identifier', 'member:missing');
    await fill(user, 'Manual entry reason', 'Fictional paper attendance');
    const before = store.getSnapshot();
    await user.click(
      screen.getByRole('button', { name: 'Record manual attendance' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'member is unavailable',
    );
    expect(store.getSnapshot()).toBe(before);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Manual member identifier')).toHaveValue(
      'member:missing',
    );
    expect(screen.getByLabelText('Manual entry reason')).toHaveValue(
      'Fictional paper attendance',
    );
  });

  it('records an adjustable class/member/outcome without requiring or changing a booking', async () => {
    const { store, user } = renderWithDemoState(<AttendanceScreen />, {
      actor: admin,
    });
    const bookings = store.getSnapshot().state.bookings;
    await user.selectOptions(
      screen.getByLabelText('Manual class'),
      ids.classes.free,
    );
    await user.selectOptions(
      screen.getByLabelText('Manual member'),
      ids.members.juniper,
    );
    await user.selectOptions(
      screen.getByLabelText('Manual outcome'),
      'attended',
    );
    await fill(
      user,
      'Manual entry reason',
      'Fictional paper roster reconciliation',
    );
    await user.click(
      screen.getByRole('button', { name: 'Record manual attendance' }),
    );
    const after = store.getSnapshot().state;
    expect(after.bookings).toEqual(bookings);
    expect(
      after.attendance.find(
        (item) =>
          item.memberId === ids.members.juniper &&
          item.classId === ids.classes.free,
      ),
    ).toMatchObject({
      currentOutcome: 'attended',
      source: { kind: 'manualOutage' },
      checkIn: { status: 'notCheckedIn' },
    });
    await user.selectOptions(
      screen.getByLabelText('Attendance class'),
      ids.classes.free,
    );
    expect(attendanceRow('Fictional Juniper')).toHaveTextContent(
      'No assigned station',
    );
    expect(attendanceRow('Fictional Juniper')).toHaveTextContent(
      'Manual outage',
    );
    expect(
      screen.getByText('Printable roster').closest('table'),
    ).not.toHaveTextContent('Fictional Juniper');
  });

  it('reconciles an existing booking, preserves check-in and retains history', async () => {
    const { store, user } = renderWithDemoState(<AttendanceScreen />, {
      actor: admin,
    });
    const before = store.getSnapshot().state;
    await user.selectOptions(
      screen.getByLabelText('Manual member'),
      ids.members.maple,
    );
    await user.selectOptions(screen.getByLabelText('Manual outcome'), 'noShow');
    await fill(user, 'Manual entry reason', 'Fictional outage review');
    await user.click(
      screen.getByRole('button', { name: 'Record manual attendance' }),
    );
    expect(store.getSnapshot().state.bookings).toEqual(before.bookings);
    const after = record(
      store.getSnapshot().state,
      ids.attendance.checkInMaple,
    );
    expect(after.checkIn).toEqual(
      record(before, ids.attendance.checkInMaple).checkIn,
    );
    expect(after.corrections.at(-1)?.reason).toBe('Fictional outage review');
    expect(after.currentOutcome).toBe('noShow');
  });

  it('rejects blank manual reasons and cancelled classes without changing any state', async () => {
    const { store, user } = renderWithDemoState(<AttendanceScreen />, {
      actor: admin,
    });
    const before = store.getSnapshot();
    await user.click(
      screen.getByRole('button', { name: 'Record manual attendance' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Explain the manual attendance entry',
    );
    expect(store.getSnapshot()).toBe(before);
    await fill(user, 'Manual entry reason', 'Fictional entry');
    await user.selectOptions(
      screen.getByLabelText('Manual class'),
      ids.classes.cancelled,
    );
    await user.click(
      screen.getByRole('button', { name: 'Record manual attendance' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('cancelled class');
    expect(store.getSnapshot()).toBe(before);
  });

  it.each(['stale', 'unavailable'] as const)(
    'explicitly disables map reseating and exports for %s layout while allowing local manual reconciliation',
    async (availability) => {
      const state = createDemoTestState({ actor: admin });
      const { store, user } = renderState({
        ...state,
        layout: { ...state.layout, availability },
      });
      expect(screen.getByRole('alert')).toHaveTextContent(
        new RegExp(availability, 'i'),
      );
      expect(
        screen.getByRole('button', { name: 'Map-based reseating unavailable' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Download roster' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Print roster' }),
      ).toBeDisabled();
      const bookings = store.getSnapshot().state.bookings;
      await fill(user, 'Manual entry reason', 'Fictional local reconciliation');
      await user.click(
        screen.getByRole('button', { name: 'Record manual attendance' }),
      );
      expect(store.getSnapshot().state.bookings).toEqual(bookings);
      expect(screen.getByText(/offline booking is unsupported/i)).toBeVisible();
    },
  );

  it('resets obsolete selections and feedback on scenario replacement', async () => {
    const { store, user } = renderWithDemoState(<AttendanceScreen />, {
      actor: admin,
    });
    await user.selectOptions(
      screen.getByLabelText('Attendance class'),
      ids.classes.full,
    );
    act(() => {
      store.loadScenario('scenario:schedule-conflict', { confirmed: true });
    });
    expect(screen.getByLabelText('Attendance class')).toBeVisible();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('clears success and refreshes attendance drafts after resetting the same scenario', async () => {
    const { store, user } = renderWithDemoState(<AttendanceScreen />, {
      actor: admin,
    });
    const before = store.getSnapshot().state;
    const initialValues = {
      attendanceClass:
        screen.getByLabelText<HTMLSelectElement>('Attendance class').value,
      attendanceRecord:
        screen.getByLabelText<HTMLSelectElement>('Attendance record').value,
      outcome:
        screen.getByLabelText<HTMLSelectElement>('Corrected outcome').value,
      manualClass:
        screen.getByLabelText<HTMLSelectElement>('Manual class').value,
      manualMember:
        screen.getByLabelText<HTMLSelectElement>('Manual member').value,
      manualOutcome:
        screen.getByLabelText<HTMLSelectElement>('Manual outcome').value,
    };

    await user.click(
      screen.getByRole('button', { name: 'Check in Fictional Cedar' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Simulated check-in recorded.',
    );
    expect(record(store.getSnapshot().state)).toMatchObject({
      currentOutcome: 'attended',
      checkIn: { status: 'checkedIn' },
    });

    await user.selectOptions(
      screen.getByLabelText('Attendance class'),
      ids.classes.full,
    );
    await fill(user, 'Correction reason', 'Draft correction reason');
    await user.selectOptions(
      screen.getByLabelText('Corrected outcome'),
      'noShow',
    );
    await user.selectOptions(
      screen.getByLabelText('Manual class'),
      ids.classes.free,
    );
    await user.selectOptions(
      screen.getByLabelText('Manual member'),
      ids.members.aspen,
    );
    await user.selectOptions(screen.getByLabelText('Manual outcome'), 'noShow');
    await fill(user, 'Manual member identifier', ids.members.juniper);
    await fill(user, 'Manual entry reason', 'Draft manual reason');

    act(() => {
      store.resetDemo({ confirmed: true });
    });

    expect(store.getSnapshot().state.scenarioId).toBe(before.scenarioId);
    expect(store.getSnapshot().state.activeActor).toEqual(admin);
    expect(record(store.getSnapshot().state)).toMatchObject({
      currentOutcome: 'booked',
      checkIn: { status: 'notCheckedIn' },
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Attendance class')).toHaveValue(
      initialValues.attendanceClass,
    );
    expect(screen.getByLabelText('Attendance record')).toHaveValue(
      initialValues.attendanceRecord,
    );
    expect(screen.getByLabelText('Corrected outcome')).toHaveValue(
      initialValues.outcome,
    );
    expect(screen.getByLabelText('Correction reason')).toHaveValue('');
    expect(screen.getByLabelText('Manual class')).toHaveValue(
      initialValues.manualClass,
    );
    expect(screen.getByLabelText('Manual member')).toHaveValue(
      initialValues.manualMember,
    );
    expect(screen.getByLabelText('Manual outcome')).toHaveValue(
      initialValues.manualOutcome,
    );
    expect(screen.getByLabelText('Manual member identifier')).toHaveValue('');
    expect(screen.getByLabelText('Manual entry reason')).toHaveValue('');
  });

  it('reports unavailable classes explicitly and exposes no roster or action success', () => {
    const state = createDemoTestState({ actor: admin });
    const { store } = renderState({ ...state, classes: [] });
    const before = store.getSnapshot();
    expect(screen.getByRole('alert')).toHaveTextContent('class is unavailable');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Download roster' }),
    ).not.toBeInTheDocument();
    expect(store.getSnapshot()).toBe(before);
  });

  it('does not refresh a pending manual form revision when a different attendance action succeeds', async () => {
    const { store, user } = renderWithDemoState(<AttendanceScreen />, {
      actor: admin,
    });
    await fill(user, 'Manual entry reason', 'Unreviewed manual entry');
    await user.click(
      screen.getByRole('button', { name: 'Check in Fictional Cedar' }),
    );
    const before = store.getSnapshot();
    await user.click(
      screen.getByRole('button', { name: 'Record manual attendance' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('state changed');
    expect(store.getSnapshot()).toBe(before);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('rejects manual form submission made stale at exact class end', async () => {
    const { store, user } = renderWithDemoState(<AttendanceScreen />, {
      actor: admin,
    });
    await user.selectOptions(
      screen.getByLabelText('Manual member'),
      ids.members.cedar,
    );
    await fill(user, 'Manual entry reason', 'Paper record before class end');
    act(() => {
      store.advanceClock('2026-10-05T16:45:00Z');
    });
    const before = store.getSnapshot();
    await user.click(
      screen.getByRole('button', { name: 'Record manual attendance' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('state changed');
    expect(store.getSnapshot()).toBe(before);
  });

  it('reports unsupported browser download APIs explicitly without a success or domain mutation', async () => {
    const unsupportedURL = class extends URL {};
    Object.defineProperties(unsupportedURL, {
      createObjectURL: { value: undefined },
      revokeObjectURL: { value: undefined },
    });
    vi.stubGlobal('URL', unsupportedURL);
    const { store, user } = renderWithDemoState(<AttendanceScreen />, {
      actor: admin,
    });
    const before = store.getSnapshot();
    await user.click(screen.getByRole('button', { name: 'Download roster' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'download is unavailable',
    );
    expect(store.getSnapshot()).toBe(before);
    vi.unstubAllGlobals();
  });

  it('print payload contains only member and station and print invokes the browser', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const { container, user } = renderWithDemoState(<AttendanceScreen />, {
      actor: admin,
    });
    const table = screen.getByText('Printable roster').closest('table')!;
    expect(within(table).getAllByRole('columnheader')).toHaveLength(2);
    expect(table).toHaveTextContent('Fictional Cedar');
    expect(table).toHaveTextContent('Demo West');
    expect(table.textContent).not.toMatch(
      /@|waiver|Checked in|booked|correction|staff:/i,
    );
    expect(container.textContent).not.toContain('@example.invalid');
    await user.click(screen.getByRole('button', { name: 'Print roster' }));
    expect(print).toHaveBeenCalledOnce();
  });
});
