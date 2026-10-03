import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FIXTURE_IDS as ids } from '../../demo-fixtures';
import { renderWithDemoState } from '../../test-support';
import { ClassesScreen } from './index';
import { ScheduleScreen } from '../schedule';

describe('Class types', () => {
  it.each([ids.staff.frontDesk, ids.staff.coach, ids.staff.inactive])(
    'does not expose class-type writes to %s',
    (staffId) => {
      renderWithDemoState(<ClassesScreen />, {
        actor: { kind: 'staff', staffId },
      });
      expect(
        screen.queryByRole('button', { name: 'Save class type' }),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    },
  );

  it('shows public details to a member without administration controls', () => {
    renderWithDemoState(<ClassesScreen />, {
      actor: { kind: 'member', memberId: ids.members.maple },
    });
    expect(screen.getByText('Power Intervals')).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Existing scheduled snapshots remain unchanged/),
    ).toBeInTheDocument();
  });

  it.each(['30', '45', '60'])(
    'creates an adjustable %s-minute type with all details',
    async (duration) => {
      const view = renderWithDemoState(<ClassesScreen />);
      await view.user.type(screen.getByLabelText('Name'), `Custom ${duration}`);
      await view.user.selectOptions(
        screen.getByLabelText('Duration (minutes)'),
        duration,
      );
      await view.user.type(
        screen.getByLabelText('Description'),
        'A fictional custom class.',
      );
      await view.user.type(screen.getByLabelText('Difficulty'), 'Beginner');
      await view.user.type(screen.getByLabelText('Alias'), 'Custom alias');
      await view.user.type(screen.getByLabelText('What to bring'), 'Water');
      await view.user.click(
        screen.getByRole('button', { name: 'Save class type' }),
      );
      expect(view.store.getSnapshot().state.classTypes.at(-1)).toMatchObject({
        name: `Custom ${duration}`,
        durationMinutes: Number(duration),
        description: 'A fictional custom class.',
        difficulty: 'Beginner',
        alias: 'Custom alias',
        whatToBring: 'Water',
      });
      expect(screen.getByRole('status')).toHaveTextContent(
        'Class type created',
      );
    },
  );

  it('preserves inputs and state on validation errors and shows field feedback', async () => {
    const view = renderWithDemoState(<ClassesScreen />);
    const before = view.store.getSnapshot().state;
    await view.user.type(screen.getByLabelText('Name'), 'Kept name');
    await view.user.click(
      screen.getByRole('button', { name: 'Save class type' }),
    );
    expect(view.store.getSnapshot().state).toBe(before);
    expect(screen.getByLabelText('Name')).toHaveValue('Kept name');
    expect(screen.getByLabelText('Description')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('edits future definitions but retains every existing occurrence snapshot', async () => {
    const view = renderWithDemoState(<ClassesScreen />);
    const before = view.store.getSnapshot().state.classes;
    await view.user.selectOptions(
      screen.getByLabelText('Class type to edit'),
      ids.classTypes.sprint,
    );
    await view.user.clear(screen.getByLabelText('Name'));
    await view.user.type(screen.getByLabelText('Name'), 'Future Sprint');
    await view.user.selectOptions(
      screen.getByLabelText('Duration (minutes)'),
      '60',
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Save class type' }),
    );
    expect(view.store.getSnapshot().state.classes).toEqual(before);
    expect(
      view.store
        .getSnapshot()
        .state.classTypes.find(
          (item) => item.classTypeId === ids.classTypes.sprint,
        ),
    ).toMatchObject({ name: 'Future Sprint', durationMinutes: 60 });
    const snapshots = within(
      screen.getByRole('region', { name: 'Scheduled snapshots' }),
    );
    expect(
      snapshots.getAllByText(/Power Intervals.*30 minutes/).length,
    ).toBeGreaterThan(0);
    view.rerender(<ScheduleScreen />);
    await view.user.type(screen.getByLabelText('Class date'), '2026-11-10');
    await view.user.type(screen.getByLabelText('Class start time'), '14:00');
    await view.user.selectOptions(
      screen.getByLabelText('Scheduled class type'),
      ids.classTypes.sprint,
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Save scheduled class' }),
    );
    const newClass = view.store.getSnapshot().state.classes.at(-1);
    expect(newClass).toMatchObject({
      classTypeSnapshot: { name: 'Future Sprint', durationMinutes: 60 },
      startsAt: '2026-11-10T22:00:00Z',
      endsAt: '2026-11-10T23:00:00Z',
    });
    view.rerender(<ClassesScreen />);
    expect(
      within(
        screen.getByRole('region', { name: 'Scheduled snapshots' }),
      ).getByText(/Future Sprint.*60 minutes/),
    ).toBeInTheDocument();
  });
});
