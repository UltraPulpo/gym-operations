import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FIXTURE_IDS } from '../../demo-fixtures';
import { renderWithDemoState } from '../../test-support';
import { StaffAccessScreen } from './StaffAccessScreen';
import { CoachesScreen, PublicCoachClassDetails } from '../coaches';
import type { StaffId } from '../../domain';

describe('StaffAccessScreen', () => {
  it.each(['create', 'add role'] as const)(
    'initializes a profile through Admin controls after %s through staff access, then permits own edits and private-contact-free class details',
    async (journey) => {
      const view = renderWithDemoState(<StaffAccessScreen />);
      const staffId: StaffId =
        journey === 'create'
          ? 'staff:created-coach'
          : FIXTURE_IDS.staff.frontDesk;
      await view.user.click(
        screen.getByRole('button', {
          name:
            journey === 'create' ? 'Create staff account' : `Edit ${staffId}`,
        }),
      );
      const dialog = within(screen.getByRole('dialog'));
      if (journey === 'create') {
        await view.user.click(dialog.getByLabelText('Staff ID'));
        await view.user.paste(staffId);
        await view.user.click(
          dialog.getByLabelText('Fictional identity subject'),
        );
        await view.user.paste('identity:created-coach');
      }
      await view.user.click(dialog.getByLabelText('Coach role'));
      await view.user.click(
        dialog.getByRole('button', {
          name: journey === 'create' ? 'Create account' : 'Save account',
        }),
      );
      const account = view.store
        .getSnapshot()
        .state.staffAccounts.find((item) => item.staffId === staffId);
      expect(account?.coachProfile).toBeUndefined();
      expect(account?.assignedRoles).toEqual(
        journey === 'create' ? ['coach'] : ['frontDesk', 'coach'],
      );

      view.rerender(<CoachesScreen />);
      const form = within(
        screen.getByRole('form', {
          name: `Initialize ${staffId}`,
        }),
      );
      expect(
        screen.getByText(
          `Coach profile for ${staffId} has not been initialized.`,
        ),
      ).toBeInTheDocument();
      expect(form.getByLabelText('Coach name')).toHaveValue('');
      const before = view.store.getSnapshot().state;
      await view.user.click(
        form.getByRole('button', { name: 'Initialize coach profile' }),
      );
      expect(view.store.getSnapshot().state).toBe(before);
      expect(form.getByLabelText('Coach name')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      for (const [label, text] of [
        ['Coach name', 'Fictional New Coach'],
        ['Biography', 'Admin-entered introduction.'],
        ['Certifications', 'Illustrative new certification'],
        ['Staff email', 'new-coach@example.invalid'],
        ['Staff phone', '555-0188'],
      ]) {
        await view.user.click(form.getByLabelText(label));
        await view.user.paste(text);
      }
      await view.user.selectOptions(
        form.getByLabelText('Generated avatar'),
        'avatar:local-indigo',
      );
      await view.user.click(
        form.getByRole('button', { name: 'Initialize coach profile' }),
      );
      const initialized = view.store
        .getSnapshot()
        .state.staffAccounts.find((item) => item.staffId === staffId);
      expect(initialized).toEqual({
        ...account,
        coachProfile: {
          displayName: 'Fictional New Coach',
          biography: 'Admin-entered introduction.',
          avatarId: 'avatar:local-indigo',
          certifications: ['Illustrative new certification'],
          contact: { email: 'new-coach@example.invalid', phone: '555-0188' },
        },
      });
      act(() => {
        expect(
          view.store.submit({
            type: 'editScheduledClass',
            payload: {
              classId: FIXTURE_IDS.classes.free,
              updates: { coachId: staffId },
            },
          }).success,
        ).toBe(true);
        expect(
          view.store.submit({
            type: 'selectActor',
            payload: { actor: { kind: 'staff', staffId } },
          }).success,
        ).toBe(true);
      });
      const own = within(
        screen.getByRole('form', { name: 'Edit Fictional New Coach' }),
      );
      expect(screen.getAllByRole('form')).toHaveLength(1);
      for (const label of [
        'Coach name',
        'Certifications',
        'Staff email',
        'Staff phone',
      ])
        expect(own.queryByLabelText(label)).not.toBeInTheDocument();
      await view.user.clear(own.getByLabelText('Biography'));
      await view.user.paste('New coach own biography.');
      await view.user.selectOptions(
        own.getByLabelText('Generated avatar'),
        'avatar:local-coral',
      );
      await view.user.click(
        own.getByRole('button', { name: 'Save coach profile' }),
      );
      expect(
        view.store
          .getSnapshot()
          .state.staffAccounts.find((item) => item.staffId === staffId)
          ?.coachProfile,
      ).toEqual({
        ...initialized?.coachProfile,
        biography: 'New coach own biography.',
        avatarId: 'avatar:local-coral',
      });
      act(() => {
        expect(
          view.store.submit({
            type: 'selectActor',
            payload: {
              actor: { kind: 'member', memberId: FIXTURE_IDS.members.maple },
            },
          }).success,
        ).toBe(true);
      });
      view.rerender(
        <PublicCoachClassDetails classId={FIXTURE_IDS.classes.free} />,
      );
      expect(
        screen.getByRole('heading', { name: 'Fictional New Coach' }),
      ).toBeInTheDocument();
      expect(screen.getByText('New coach own biography.')).toBeInTheDocument();
      expect(
        screen.getByText('Illustrative new certification'),
      ).toBeInTheDocument();
      expect(
        screen
          .getByRole('img', { name: 'Fictional New Coach generated avatar' })
          .querySelector('rect'),
      ).toHaveAttribute('fill', '#9f1239');
      expect(view.container.innerHTML).not.toMatch(
        /new-coach@example\.invalid|555-0188|identity:|mailto:|tel:/,
      );
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
    },
  );

  it('shows fictional staff accounts, selected-account capabilities, and the non-authentication boundary', () => {
    renderWithDemoState(<StaffAccessScreen />);

    expect(
      screen.getByRole('heading', { name: 'Staff access' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(FIXTURE_IDS.staff.admin, { exact: true }),
    ).toHaveLength(2);
    expect(screen.getByText('Manage staff access')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Fictional demo only: this screen does not authenticate anyone, issue credentials, or enforce production security.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('identity:demo-admin', { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/password|credential/i),
    ).not.toBeInTheDocument();
  });

  it('creates an account from user-entered details with multiple fixed roles and assigned classes', async () => {
    const view = renderWithDemoState(<StaffAccessScreen />);
    await view.user.click(
      screen.getByRole('button', { name: 'Create staff account' }),
    );

    const dialog = screen.getByRole('dialog', { name: 'Create staff account' });
    await view.user.type(
      within(dialog).getByRole('textbox', { name: 'Staff ID' }),
      'staff:demo-new-coach',
    );
    await view.user.type(
      within(dialog).getByRole('textbox', {
        name: 'Fictional identity subject',
      }),
      'identity:demo-new-coach',
    );
    await view.user.click(
      within(dialog).getByRole('checkbox', { name: 'Front Desk role' }),
    );
    await view.user.click(
      within(dialog).getByRole('checkbox', { name: 'Coach role' }),
    );
    const classAssignment = within(dialog).getByRole('checkbox', {
      name: `Assign to class ${view.store.getSnapshot().state.classes[0].classId}`,
    });
    await view.user.click(classAssignment);
    await view.user.click(
      within(dialog).getByRole('button', { name: 'Create account' }),
    );

    const account = view.store
      .getSnapshot()
      .state.staffAccounts.find(
        (staff) => staff.staffId === 'staff:demo-new-coach',
      );
    expect(account).toMatchObject({
      identitySubject: 'identity:demo-new-coach',
      active: true,
      assignedRoles: ['frontDesk', 'coach'],
      assignedClassIds: [view.store.getSnapshot().state.classes[0].classId],
    });
    expect(screen.getByText('Manage members')).toBeInTheDocument();
    expect(screen.getByText('View class rosters')).toBeInTheDocument();
    expect(screen.queryByText('Manage the schedule')).not.toBeInTheDocument();
    expect(screen.queryByText('Manage staff access')).not.toBeInTheDocument();
    expect(
      screen.getByText('Staff account created in this demo.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Staff account created in this demo.'),
    ).toHaveAttribute('role', 'status');
  });

  it('shows a selected coach only the assigned-class capability scope', async () => {
    const view = renderWithDemoState(<StaffAccessScreen />);
    const coach = view.store
      .getSnapshot()
      .state.staffAccounts.find(
        (staff) => staff.staffId === FIXTURE_IDS.staff.coach,
      );
    expect(coach).toBeDefined();

    await view.user.click(
      screen.getByRole('button', { name: `Select ${FIXTURE_IDS.staff.coach}` }),
    );

    expect(screen.getByText('Manage attendance')).toBeInTheDocument();
    expect(screen.queryByText('Manage members')).not.toBeInTheDocument();
    expect(screen.queryByText('Manage the schedule')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        `Class access is limited to: ${coach?.assignedClassIds.join(', ')}`,
      ),
    ).toBeInTheDocument();
  });

  it('updates an existing account status, role set, class assignments, and fictional subject', async () => {
    const view = renderWithDemoState(<StaffAccessScreen />);
    await view.user.click(
      screen.getByRole('button', {
        name: `Edit ${FIXTURE_IDS.staff.frontDesk}`,
      }),
    );

    const dialog = screen.getByRole('dialog', { name: 'Edit staff account' });
    const roles = within(dialog).getByRole('checkbox', {
      name: 'Coach role',
    });
    await view.user.click(roles);
    await view.user.click(
      within(dialog).getByRole('checkbox', { name: 'Active account' }),
    );
    const assignedClassId = view.store.getSnapshot().state.classes[0].classId;
    await view.user.click(
      within(dialog).getByRole('checkbox', {
        name: `Assign to class ${assignedClassId}`,
      }),
    );
    await view.user.clear(
      within(dialog).getByRole('textbox', {
        name: 'Fictional identity subject',
      }),
    );
    await view.user.type(
      within(dialog).getByRole('textbox', {
        name: 'Fictional identity subject',
      }),
      'identity:demo-front-desk-coach-updated',
    );
    await view.user.click(
      within(dialog).getByRole('button', { name: 'Save account' }),
    );

    expect(
      view.store
        .getSnapshot()
        .state.staffAccounts.find(
          (staff) => staff.staffId === FIXTURE_IDS.staff.frontDesk,
        ),
    ).toMatchObject({
      identitySubject: 'identity:demo-front-desk-coach-updated',
      active: false,
      assignedRoles: ['frontDesk', 'coach'],
      assignedClassIds: [assignedClassId],
    });
    expect(
      screen.getByText('Staff account updated in this demo.'),
    ).toHaveAttribute('role', 'status');
  });

  it('requires a keyboard-accessible confirmation before deactivation and explains inactive denial', async () => {
    const view = renderWithDemoState(<StaffAccessScreen />);
    await view.user.click(
      screen.getByRole('button', {
        name: `Deactivate ${FIXTURE_IDS.staff.frontDesk}`,
      }),
    );

    const confirmation = screen.getByRole('alertdialog', {
      name: 'Deactivate staff account?',
    });
    expect(
      within(confirmation).getByRole('button', { name: 'Cancel' }),
    ).toHaveFocus();
    await view.user.keyboard('{Escape}');
    expect(
      screen.queryByRole('alertdialog', {
        name: 'Deactivate staff account?',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: `Deactivate ${FIXTURE_IDS.staff.frontDesk}`,
      }),
    ).toHaveFocus();

    await view.user.click(
      screen.getByRole('button', {
        name: `Deactivate ${FIXTURE_IDS.staff.frontDesk}`,
      }),
    );
    await view.user.click(
      within(
        screen.getByRole('alertdialog', {
          name: 'Deactivate staff account?',
        }),
      ).getByRole('button', { name: 'Deactivate account' }),
    );

    expect(
      view.store
        .getSnapshot()
        .state.staffAccounts.find(
          (staff) => staff.staffId === FIXTURE_IDS.staff.frontDesk,
        )?.active,
    ).toBe(false);
    await view.user.click(
      screen.getByRole('button', {
        name: `Select ${FIXTURE_IDS.staff.frontDesk}`,
      }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Inactive staff cannot perform demo actions.',
    );
  });

  it('shows an explicit denial to non-admin personas without exposing staff records', () => {
    renderWithDemoState(<StaffAccessScreen />, {
      actor: { kind: 'staff', staffId: FIXTURE_IDS.staff.frontDesk },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Only an active Admin persona can manage fictional staff access in this demo.',
    );
    expect(screen.queryByText(FIXTURE_IDS.staff.admin)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create staff account' }),
    ).not.toBeInTheDocument();
  });

  it('shows validation feedback and preserves state when create input is rejected', async () => {
    const view = renderWithDemoState(<StaffAccessScreen />);
    const before = view.store.getSnapshot().state.staffAccounts;
    await view.user.click(
      screen.getByRole('button', { name: 'Create staff account' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Create staff account' });
    await view.user.type(
      within(dialog).getByRole('textbox', { name: 'Staff ID' }),
      'staff:invalid-no-role',
    );
    await view.user.type(
      within(dialog).getByRole('textbox', {
        name: 'Fictional identity subject',
      }),
      'identity:invalid-no-role',
    );
    await view.user.click(
      within(dialog).getByRole('button', { name: 'Create account' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Assign a nonempty set of unique fixed staff roles.',
    );
    expect(view.store.getSnapshot().state.staffAccounts).toEqual(before);
    expect(dialog).toBeInTheDocument();
  });
});
