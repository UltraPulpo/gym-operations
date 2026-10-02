import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FIXTURE_IDS as ids } from '../../demo-fixtures';
import type { DemoAction, DemoActor } from '../../domain';
import { renderWithDemoState } from '../../test-support';
import { ScheduleScreen } from './index';

type View = ReturnType<typeof renderWithDemoState>;
function submit(view: View, action: DemoAction) {
  act(() => {
    expect(view.store.submit(action).success).toBe(true);
  });
}
async function input(view: View, label: string, value: string) {
  await view.user.clear(screen.getByLabelText(label));
  if (value) await view.user.type(screen.getByLabelText(label), value);
}
async function draft(view: View, date = '2026-11-10', time = '14:00') {
  await input(view, 'Class date', date);
  await input(view, 'Class start time', time);
  await view.user.selectOptions(
    screen.getByLabelText('Scheduled class type'),
    ids.classTypes.sprint,
  );
  await view.user.click(
    screen.getByRole('button', { name: 'Save scheduled class' }),
  );
  const result = view.store.getSnapshot().state.classes.at(-1);
  if (!result) throw new Error('Expected a created class.');
  return result;
}
async function template(view: View, name: string, time = '14:00') {
  await view.user.selectOptions(screen.getByLabelText('Template to edit'), '');
  await input(view, 'Template name', name);
  await view.user.selectOptions(screen.getByLabelText('Entry 1 weekday'), '2');
  await input(view, 'Entry 1 time', time);
  await view.user.selectOptions(
    screen.getByLabelText('Entry 1 class type'),
    ids.classTypes.sprint,
  );
  await view.user.click(screen.getByRole('button', { name: 'Save template' }));
  const saved = view.store.getSnapshot().state.weeklyTemplates.at(-1);
  if (!saved) throw new Error('Expected a saved template.');
  return saved;
}
async function apply(view: View, templateId: string, week: string) {
  await view.user.selectOptions(
    screen.getByLabelText('Template to apply'),
    templateId,
  );
  await input(view, 'Week starting Monday', week);
  await view.user.click(screen.getByRole('button', { name: 'Apply template' }));
}
function card(classId: string) {
  return within(screen.getByRole('article', { name: `Class ${classId}` }));
}
function changeActor(view: View, actor: DemoActor) {
  submit(view, { type: 'selectActor', payload: { actor } });
}

describe('Schedule workflows', () => {
  it.each([
    ids.staff.frontDesk,
    ids.staff.coach,
    ids.staff.multiRole,
    ids.staff.inactive,
  ])('keeps the schedule read-only for %s', (staffId) => {
    renderWithDemoState(<ScheduleScreen />, {
      actor: { kind: 'staff', staffId },
    });
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save scheduled class' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save template' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save release policy' }),
    ).not.toBeInTheDocument();
  });

  it('creates, edits and deletes adjustable drafts with optional coach', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    const created = await draft(view);
    expect(created).toMatchObject({
      status: 'draft',
      schedule: { date: '2026-11-10', time: '14:00' },
    });
    expect(created.coachId).toBeUndefined();
    await view.user.selectOptions(
      screen.getByLabelText('Class to edit'),
      created.classId,
    );
    await input(view, 'Class start time', '15:30');
    await view.user.selectOptions(
      screen.getByLabelText('Class coach'),
      ids.staff.coach,
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Save scheduled class' }),
    );
    expect(
      view.store
        .getSnapshot()
        .state.classes.find((item) => item.classId === created.classId),
    ).toMatchObject({ coachId: ids.staff.coach, schedule: { time: '15:30' } });
    await view.user.click(
      card(created.classId).getByRole('button', { name: 'Delete draft' }),
    );
    expect(
      view.store
        .getSnapshot()
        .state.classes.some((item) => item.classId === created.classId),
    ).toBe(false);
  });

  it('rejects an overlapping draft without announcing success or discarding inputs', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    await draft(view);
    await view.user.selectOptions(screen.getByLabelText('Class to edit'), '');
    const before = view.store.getSnapshot().state;
    await draft(view, '2026-11-10', '14:15');
    expect(view.store.getSnapshot().state).toBe(before);
    expect(screen.getByRole('alert')).toHaveTextContent(/overlaps/);
    expect(screen.getByLabelText('Class start time')).toHaveValue('14:15');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('creates and edits multi-entry templates and applies alternating weeks', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    const a = await template(view, 'Custom A');
    await view.user.selectOptions(
      screen.getByLabelText('Template to edit'),
      a.templateId,
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Add template entry' }),
    );
    await view.user.selectOptions(
      screen.getByLabelText('Entry 2 weekday'),
      '4',
    );
    await input(view, 'Entry 2 time', '17:00');
    await view.user.selectOptions(
      screen.getByLabelText('Entry 2 class type'),
      ids.classTypes.endurance,
    );
    await view.user.selectOptions(
      screen.getByLabelText('Entry 2 coach'),
      ids.staff.multiRole,
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Save template' }),
    );
    expect(
      view.store
        .getSnapshot()
        .state.weeklyTemplates.find((item) => item.templateId === a.templateId)
        ?.entries,
    ).toHaveLength(2);
    const b = await template(view, 'Custom B', '09:00');
    await apply(view, a.templateId, '2026-11-09');
    await apply(view, b.templateId, '2026-11-16');
    const classes = view.store
      .getSnapshot()
      .state.classes.filter((item) => item.classId.includes('template:screen'));
    expect(classes.map((item) => item.schedule.date)).toEqual([
      '2026-11-10',
      '2026-11-12',
      '2026-11-17',
    ]);
    expect(classes.every((item) => item.status === 'draft')).toBe(true);
    expect(classes[1]?.coachId).toBe(ids.staff.multiRole);
    await view.user.selectOptions(
      screen.getByLabelText('Template to edit'),
      a.templateId,
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Remove entry 2' }),
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Save template' }),
    );
    expect(
      view.store
        .getSnapshot()
        .state.weeklyTemplates.find((item) => item.templateId === a.templateId)
        ?.entries,
    ).toHaveLength(1);
  });

  it('reports exact duplicate skips without adding classes', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    const a = await template(view, 'Repeatable');
    await apply(view, a.templateId, '2026-11-09');
    const before = view.store.getSnapshot().state.classes;
    await apply(view, a.templateId, '2026-11-09');
    expect(view.store.getSnapshot().state.classes).toEqual(before);
    expect(screen.getByRole('status')).toHaveTextContent(
      '0 drafts created; 1 exact duplicate skipped',
    );
  });

  it('reapplies an edited entry as an adjacent distinct draft with a zero-gap warning and skips unchanged occurrences', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    const saved = await template(view, 'Editable same week', '10:00');
    await apply(view, saved.templateId, '2026-11-16');
    const original = view.store.getSnapshot().state.classes.at(-1);
    if (!original) throw new Error('Expected the original template class.');
    await view.user.selectOptions(
      screen.getByLabelText('Template to edit'),
      saved.templateId,
    );
    await input(view, 'Entry 1 time', '10:30');
    await view.user.click(
      screen.getByRole('button', { name: 'Save template' }),
    );
    const before = view.store.getSnapshot().state;
    const retained = structuredClone(before.classes);

    await apply(view, saved.templateId, '2026-11-16');
    const after = view.store.getSnapshot().state;
    const occurrence = after.classes.at(-1);
    if (!occurrence) throw new Error('Expected the edited template class.');
    expect(after.classes).toHaveLength(before.classes.length + 1);
    expect(occurrence.classId).toBe(`${original.classId}:occurrence:2`);
    expect(occurrence).toMatchObject({
      status: 'draft',
      schedule: { date: '2026-11-17', time: '10:30' },
    });
    expect(after.classes.slice(0, -1)).toEqual(retained);
    before.classes.forEach((item, index) => {
      expect(after.classes[index]).toBe(item);
    });
    expect(after.bookings).toEqual(before.bookings);
    expect(after.notifications).toEqual(before.notifications);
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 draft created; 0 exact duplicates skipped',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      '0-minute gap between classes',
    );
    expect(card(original.classId).getByText(/10:00/)).toBeInTheDocument();
    expect(card(occurrence.classId).getByText(/10:30/)).toBeInTheDocument();

    const applied = structuredClone(after.classes);
    await apply(view, saved.templateId, '2026-11-16');
    expect(view.store.getSnapshot().state.classes).toEqual(applied);
    expect(screen.getByRole('status')).toHaveTextContent(
      '0 drafts created; 1 exact duplicate skipped',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    after.classes.forEach((item, index) => {
      expect(view.store.getSnapshot().state.classes[index]).toBe(item);
    });
  });

  it('rejects every edited-template proposal on overlap and identifies the actual conflict without changing prior classes', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    const saved = await template(view, 'Edited conflict', '10:00');
    await view.user.selectOptions(
      screen.getByLabelText('Template to edit'),
      saved.templateId,
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Add template entry' }),
    );
    await view.user.selectOptions(
      screen.getByLabelText('Entry 2 weekday'),
      '4',
    );
    await input(view, 'Entry 2 time', '10:00');
    await view.user.selectOptions(
      screen.getByLabelText('Entry 2 class type'),
      ids.classTypes.sprint,
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Save template' }),
    );
    await apply(view, saved.templateId, '2026-11-16');
    const conflicting = view.store.getSnapshot().state.classes.at(-1);
    if (!conflicting) throw new Error('Expected the Thursday template class.');

    await input(view, 'Entry 1 time', '10:30');
    await input(view, 'Entry 2 time', '10:15');
    await view.user.click(
      screen.getByRole('button', { name: 'Save template' }),
    );
    const before = view.store.getSnapshot().state;
    const retained = structuredClone(before.classes);
    await apply(view, saved.templateId, '2026-11-16');

    expect(view.store.getSnapshot().state).toBe(before);
    expect(before.classes).toEqual(retained);
    const alerts = screen
      .getAllByRole('alert')
      .map((alert) => alert.textContent)
      .join(' ');
    expect(alerts).toContain(
      'The proposed class overlaps another scheduled class.',
    );
    expect(alerts).toContain(conflicting.classId);
    expect(alerts).toContain(`${conflicting.classId}:occurrence:2`);
    expect(alerts).toContain('Entire proposal rejected; no classes changed.');
    expect(alerts).not.toContain('A generated class ID is already in use.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('rejects the entire template proposal and identifies the overlap', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    await draft(view);
    const a = await template(view, 'Conflicting', '14:15');
    await view.user.selectOptions(
      screen.getByLabelText('Template to edit'),
      a.templateId,
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Add template entry' }),
    );
    await view.user.selectOptions(
      screen.getByLabelText('Entry 2 weekday'),
      '4',
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Save template' }),
    );
    const before = view.store.getSnapshot().state;
    await apply(view, a.templateId, '2026-11-09');
    expect(view.store.getSnapshot().state).toBe(before);
    expect(screen.getByRole('alert')).toHaveTextContent(/overlaps/);
    expect(screen.getByRole('alert')).toHaveTextContent('class:screen');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each(['14:30', '14:45'])(
    'accepts and warns about a short gap at %s without moving times',
    async (time) => {
      const view = renderWithDemoState(<ScheduleScreen />);
      await draft(view);
      const a = await template(view, 'Short gap', time);
      await apply(view, a.templateId, '2026-11-09');
      expect(screen.getByRole('alert')).toHaveTextContent(/minute gap/);
      expect(screen.getByRole('status')).toHaveTextContent('1 draft');
      expect(view.store.getSnapshot().state.classes.at(-1)?.schedule.time).toBe(
        time,
      );
    },
  );

  it('shows invalid template and week fields without state changes', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    const before = view.store.getSnapshot().state;
    await view.user.click(
      screen.getByRole('button', { name: 'Save template' }),
    );
    expect(view.store.getSnapshot().state).toBe(before);
    expect(screen.getByLabelText('Template name')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await apply(view, ids.templates.weekA, '2026-11-10');
    expect(view.store.getSnapshot().state).toBe(before);
    expect(screen.getByLabelText('Week starting Monday')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('publishes a selected batch and rejects zero-capacity publication atomically', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    const a = await draft(view);
    await view.user.selectOptions(screen.getByLabelText('Class to edit'), '');
    const b = await draft(view, '2026-11-11');
    await view.user.click(
      card(a.classId).getByRole('checkbox', {
        name: 'Select draft for publication',
      }),
    );
    await view.user.click(
      card(b.classId).getByRole('checkbox', {
        name: 'Select draft for publication',
      }),
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Publish selected drafts' }),
    );
    expect(
      view.store
        .getSnapshot()
        .state.classes.filter((item) =>
          [a.classId, b.classId].includes(item.classId),
        )
        .every((item) => item.status === 'published'),
    ).toBe(true);
    for (const station of view.store.getSnapshot().state.stations) {
      submit(view, {
        type: 'updateStation',
        payload: {
          stationId: station.stationId,
          updates: { inService: false },
        },
      });
    }
    await view.user.click(
      card(ids.classes.draft).getByRole('checkbox', {
        name: 'Select draft for publication',
      }),
    );
    const before = view.store.getSnapshot().state;
    await view.user.click(
      screen.getByRole('button', { name: 'Publish selected drafts' }),
    );
    expect(view.store.getSnapshot().state).toBe(before);
    expect(screen.getByRole('alert')).toHaveTextContent(/in service|capacity/i);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each([
    ['Class date', '2026-10-07', 'date', false],
    ['Class start time', '09:15', 'startTime', true],
    ['Class coach', '', 'coach', false],
  ] as const)(
    'notifies for published %s edits and only waives start-time changes',
    async (label, value, change, waived) => {
      const view = renderWithDemoState(<ScheduleScreen />);
      submit(view, { type: 'setSimulation', payload: { delivery: 'failure' } });
      const count = view.store.getSnapshot().state.notifications.length;
      await view.user.selectOptions(
        screen.getByLabelText('Class to edit'),
        ids.classes.checkIn,
      );
      if (label === 'Class coach')
        await view.user.selectOptions(screen.getByLabelText(label), value);
      else await input(view, label, value);
      await view.user.click(
        screen.getByRole('button', { name: 'Save scheduled class' }),
      );
      const state = view.store.getSnapshot().state;
      expect(
        state.classes.find((item) => item.classId === ids.classes.checkIn)
          ?.lateCancelWaived,
      ).toBe(waived);
      const notifications = state.notifications.slice(count);
      expect(notifications.length).toBeGreaterThan(0);
      expect(notifications.every((item) => item.status === 'failed')).toBe(
        true,
      );
      expect(notifications[0]?.event).toMatchObject({
        type: 'classChanged',
        changes: [change],
      });
      expect(screen.getByRole('status')).toHaveTextContent(
        'Scheduled class updated',
      );
      expect(screen.getByRole('alert')).toHaveTextContent(/simulated.*failed/i);
      expect(
        card(ids.classes.checkIn).getByText(
          waived ? /Late-cancel waiver: yes/ : /Late-cancel waiver: no/,
        ),
      ).toBeInTheDocument();
    },
  );

  it('cancels a published class with a reason, retained history and notifications without promotion', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    await view.user.selectOptions(
      screen.getByLabelText('Class to edit'),
      ids.classes.full,
    );
    const before = view.store.getSnapshot().state;
    await view.user.click(
      screen.getByRole('button', { name: 'Cancel published class' }),
    );
    expect(view.store.getSnapshot().state).toBe(before);
    expect(screen.getByLabelText('Cancellation reason')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await input(view, 'Cancellation reason', 'Fictional closure');
    await view.user.click(
      screen.getByRole('button', { name: 'Cancel published class' }),
    );
    const state = view.store.getSnapshot().state;
    expect(
      state.classes.find((item) => item.classId === ids.classes.full),
    ).toMatchObject({
      status: 'cancelled',
      cancellationReason: 'Fictional closure',
    });
    expect(
      state.bookings.filter(
        (item) => item.classId === ids.classes.full && item.status === 'booked',
      ),
    ).toHaveLength(0);
    expect(
      state.waitlistEntries.filter(
        (item) =>
          item.classId === ids.classes.full && item.status === 'waiting',
      ),
    ).toHaveLength(0);
    expect(state.bookings).toHaveLength(before.bookings.length);
    expect(
      state.notifications
        .slice(before.notifications.length)
        .every((item) => item.event.type === 'classCancelled'),
    ).toBe(true);
    expect(card(ids.classes.full).getByText('cancelled')).toBeInTheDocument();
  });

  it('shows completed history after a clock transition and forbids editing it', () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    act(() => {
      expect(view.store.advanceClock('2026-10-05T16:45:00Z').success).toBe(
        true,
      );
    });
    expect(
      card(ids.classes.checkIn).getByText('completed'),
    ).toBeInTheDocument();
    expect(
      screen
        .getByLabelText('Class to edit')
        .querySelector(`option[value="${ids.classes.checkIn}"]`),
    ).toBeNull();
  });

  it('supports immediate, rolling and manual batch release with member-only visibility', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    await view.user.selectOptions(
      screen.getByLabelText('Release mode'),
      'manual',
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Save release policy' }),
    );
    changeActor(view, { kind: 'member', memberId: ids.members.maple });
    expect(
      screen.queryByRole('article', {
        name: `Class ${ids.classes.laterRelease}`,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('article', { name: `Class ${ids.classes.draft}` }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('article', { name: `Class ${ids.classes.cancelled}` }),
    ).not.toBeInTheDocument();
    changeActor(view, { kind: 'staff', staffId: ids.staff.admin });
    await view.user.click(
      card(ids.classes.laterRelease).getByRole('checkbox', {
        name: 'Select published class for release',
      }),
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Release selected classes' }),
    );
    changeActor(view, { kind: 'member', memberId: ids.members.maple });
    expect(
      card(ids.classes.laterRelease).getByText('published'),
    ).toBeInTheDocument();
    changeActor(view, { kind: 'staff', staffId: ids.staff.admin });
    await view.user.selectOptions(
      screen.getByLabelText('Release mode'),
      'rolling',
    );
    await input(view, 'Rolling window (minutes)', '75');
    await view.user.click(
      screen.getByRole('button', { name: 'Save release policy' }),
    );
    changeActor(view, { kind: 'member', memberId: ids.members.maple });
    expect(
      card(ids.classes.checkIn).getByText('published'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('article', { name: `Class ${ids.classes.full}` }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('article', {
        name: `Class ${ids.classes.laterRelease}`,
      }),
    ).not.toBeInTheDocument();
    changeActor(view, { kind: 'staff', staffId: ids.staff.admin });
    await view.user.selectOptions(
      screen.getByLabelText('Release mode'),
      'immediate',
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Save release policy' }),
    );
    changeActor(view, { kind: 'member', memberId: ids.members.maple });
    expect(
      card(ids.classes.laterRelease).getByText('published'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save release policy' }),
    ).not.toBeInTheDocument();
  });

  it('rejects an invalid rolling window with associated feedback', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    await view.user.selectOptions(
      screen.getByLabelText('Release mode'),
      'rolling',
    );
    await input(view, 'Rolling window (minutes)', '-1');
    const before = view.store.getSnapshot().state;
    await view.user.click(
      screen.getByRole('button', { name: 'Save release policy' }),
    );
    expect(view.store.getSnapshot().state).toBe(before);
    expect(screen.getByLabelText('Rolling window (minutes)')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('retains local times across the illustrative Los Angeles DST transition', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    const a = await template(view, 'DST pattern', '09:00');
    await apply(view, a.templateId, '2026-10-26');
    await apply(view, a.templateId, '2026-11-02');
    const classes = view.store
      .getSnapshot()
      .state.classes.filter((item) => item.classId.includes(a.templateId));
    expect(classes.map((item) => item.schedule.time)).toEqual([
      '09:00',
      '09:00',
    ]);
    expect(classes.map((item) => item.startsAt)).toEqual([
      '2026-10-27T16:00:00Z',
      '2026-11-03T17:00:00Z',
    ]);
    expect(
      card(classes[0]!.classId).getByText(/09:00 PDT/),
    ).toBeInTheDocument();
    expect(
      card(classes[1]!.classId).getByText(/09:00 PST/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/America\/Los_Angeles.*illustrative/),
    ).toBeInTheDocument();
  });

  it('rejects a conflicting published edit without notifications or a waiver marker', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    await view.user.selectOptions(
      screen.getByLabelText('Class to edit'),
      ids.classes.checkIn,
    );
    await input(view, 'Class start time', '10:00');
    const before = view.store.getSnapshot().state;
    await view.user.click(
      screen.getByRole('button', { name: 'Save scheduled class' }),
    );
    expect(view.store.getSnapshot().state).toBe(before);
    expect(screen.getByRole('alert')).toHaveTextContent(/overlaps/);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Class start time')).toHaveValue('10:00');
    expect(
      card(ids.classes.checkIn).getByText('Late-cancel waiver: no'),
    ).toBeInTheDocument();
  });

  it('reports warnings on direct draft creation and selected batch publication without shifting times', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    const a = await draft(view);
    await view.user.selectOptions(screen.getByLabelText('Class to edit'), '');
    const b = await draft(view, '2026-11-10', '14:30');
    expect(
      card(b.classId).getByText(/Warning: 0-minute gap/),
    ).toBeInTheDocument();
    await view.user.click(
      card(a.classId).getByRole('checkbox', {
        name: 'Select draft for publication',
      }),
    );
    await view.user.click(
      card(b.classId).getByRole('checkbox', {
        name: 'Select draft for publication',
      }),
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Publish selected drafts' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('0-minute gap');
    expect(card(b.classId).getByText(/14:30 PST/)).toBeInTheDocument();
  });

  it('rejects empty entry time and no-entry templates with associated accessible errors', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    await input(view, 'Template name', 'Valid name');
    await input(view, 'Entry 1 time', '');
    const before = view.store.getSnapshot().state;
    await view.user.click(
      screen.getByRole('button', { name: 'Save template' }),
    );
    expect(view.store.getSnapshot().state).toBe(before);
    expect(screen.getByLabelText('Entry 1 time')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Remove entry 1' }),
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Save template' }),
    );
    expect(view.store.getSnapshot().state).toBe(before);
    expect(
      screen.getByRole('group', { name: 'Template entries' }),
    ).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Template name')).toHaveValue('Valid name');
  });

  it('releases a chosen published batch and includes exact rolling-window equality', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    const a = await draft(view);
    await view.user.selectOptions(screen.getByLabelText('Class to edit'), '');
    const b = await draft(view, '2026-11-11');
    for (const item of [a, b])
      await view.user.click(
        card(item.classId).getByRole('checkbox', {
          name: 'Select draft for publication',
        }),
      );
    await view.user.click(
      screen.getByRole('button', { name: 'Publish selected drafts' }),
    );
    await view.user.selectOptions(
      screen.getByLabelText('Release mode'),
      'manual',
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Save release policy' }),
    );
    for (const item of [a, b])
      await view.user.click(
        card(item.classId).getByRole('checkbox', {
          name: 'Select published class for release',
        }),
      );
    await view.user.click(
      screen.getByRole('button', { name: 'Release selected classes' }),
    );
    changeActor(view, { kind: 'member', memberId: ids.members.maple });
    for (const item of [a, b])
      expect(card(item.classId).getByText('published')).toBeInTheDocument();
    expect(
      screen.queryByText(/coach-indigo@example.invalid/),
    ).not.toBeInTheDocument();
    changeActor(view, { kind: 'staff', staffId: ids.staff.admin });
    await view.user.selectOptions(
      screen.getByLabelText('Release mode'),
      'rolling',
    );
    await input(view, 'Rolling window (minutes)', '90');
    await view.user.click(
      screen.getByRole('button', { name: 'Save release policy' }),
    );
    changeActor(view, { kind: 'member', memberId: ids.members.maple });
    expect(card(ids.classes.free).getByText('published')).toBeInTheDocument();
    expect(
      screen.queryByRole('article', { name: `Class ${a.classId}` }),
    ).not.toBeInTheDocument();
  });

  it('rejects an empty publication or release selection rather than reporting success', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    const before = view.store.getSnapshot().state;
    await view.user.click(
      screen.getByRole('button', { name: 'Publish selected drafts' }),
    );
    expect(view.store.getSnapshot().state).toBe(before);
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(/Select/);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await view.user.click(
      screen.getByRole('button', { name: 'Release selected classes' }),
    );
    expect(view.store.getSnapshot().state).toBe(before);
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(/Select/);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('rejects a stale publication batch as a whole instead of silently publishing its remaining drafts', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    const a = await draft(view);
    await view.user.selectOptions(screen.getByLabelText('Class to edit'), '');
    const b = await draft(view, '2026-11-11');
    for (const item of [a, b]) {
      await view.user.click(
        card(item.classId).getByRole('checkbox', {
          name: 'Select draft for publication',
        }),
      );
    }
    submit(view, {
      type: 'publishClasses',
      payload: { classIds: [a.classId] },
    });
    const before = view.store.getSnapshot().state;
    await view.user.click(
      screen.getByRole('button', { name: 'Publish selected drafts' }),
    );
    expect(view.store.getSnapshot().state).toBe(before);
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(/draft/);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(
      card(b.classId).getByRole('checkbox', {
        name: 'Select draft for publication',
      }),
    ).toBeChecked();
    await view.user.click(
      screen.getByRole('button', { name: 'Clear publication selection' }),
    );
    await view.user.click(
      card(b.classId).getByRole('checkbox', {
        name: 'Select draft for publication',
      }),
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Publish selected drafts' }),
    );
    expect(card(b.classId).getByText('published')).toBeInTheDocument();
  });

  it('rejects a stale release batch without partially releasing the remaining classes', async () => {
    const view = renderWithDemoState(<ScheduleScreen />);
    for (const classId of [ids.classes.full, ids.classes.laterRelease]) {
      await view.user.click(
        card(classId).getByRole('checkbox', {
          name: 'Select published class for release',
        }),
      );
    }
    submit(view, {
      type: 'cancelClass',
      payload: {
        classId: ids.classes.full,
        reason: 'Fictional change before release',
      },
    });
    const before = view.store.getSnapshot().state;
    await view.user.click(
      screen.getByRole('button', { name: 'Release selected classes' }),
    );
    expect(view.store.getSnapshot().state).toBe(before);
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(/published/);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await view.user.click(
      screen.getByRole('button', { name: 'Clear release selection' }),
    );
    await view.user.click(
      card(ids.classes.laterRelease).getByRole('checkbox', {
        name: 'Select published class for release',
      }),
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Release selected classes' }),
    );
    expect(
      card(ids.classes.laterRelease).getByText('Manual release: released'),
    ).toBeInTheDocument();
  });
});
