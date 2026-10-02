import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FIXTURE_IDS as ids } from '../../demo-fixtures';
import { SCENARIO_IDS } from '../../demo-scenarios';
import type { DemoActor } from '../../domain';
import { renderWithDemoState } from '../../test-support';
import { SettingsScreen } from './index';

const fields = [
  ['memberCap', 'Member cap'],
  ['invitationExpiryMinutes', 'Invitation expiry (minutes)'],
  ['targetGapMinutes', 'Inter-class target gap (minutes)'],
  ['waitlistCutoffMinutes', 'Waitlist cutoff before class (minutes)'],
  ['lateCancelCutoffMinutes', 'Late-cancel cutoff before class (minutes)'],
  ['checkInLeadMinutes', 'Self-check-in lead (minutes before start)'],
  ['checkInGraceMinutes', 'Self-check-in grace (minutes after start)'],
] as const;

describe('Illustrative settings', () => {
  it('shows every current policy value and the frozen illustrative timezone', () => {
    const view = renderWithDemoState(<SettingsScreen />);
    const settings = view.store.getSnapshot().state.settings;
    for (const [key, label] of fields) {
      expect(screen.getByLabelText(label)).toHaveValue(settings[key]);
    }
    expect(screen.getByLabelText('Schedule release policy')).toHaveValue(
      settings.scheduleRelease.mode,
    );
    expect(screen.getByLabelText('Demo timezone')).toHaveValue(
      'America/Los_Angeles',
    );
    expect(screen.getByLabelText('Demo timezone')).toHaveAttribute('readonly');
    expect(screen.getByText(/not approved gym policy/i)).toBeInTheDocument();
    expect(
      screen.getByText(/unresolved launch values.*illustrative/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/non-operational/i)).toBeInTheDocument();
    expect(screen.getByText(/refresh.*reset/i)).toBeInTheDocument();
  });

  describe('Admin settings changes', () => {
    it.each(fields)(
      'submits an adjustable %s through real demo state',
      async (key, label) => {
        const view = renderWithDemoState(<SettingsScreen />);
        const before = view.store.getSnapshot().state;
        const input = screen.getByLabelText(label);
        await view.user.clear(input);
        await view.user.type(input, '42');
        expect(view.store.getSnapshot().state).toBe(before);
        await view.user.click(
          screen.getByRole('button', { name: 'Save demo settings' }),
        );
        const after = view.store.getSnapshot().state;
        expect(after.settings).toEqual({ ...before.settings, [key]: 42 });
        expect(after.revision).toBe(before.revision + 1);
        expect(after.members).toBe(before.members);
        expect(after.invitations).toBe(before.invitations);
        expect(after.classes).toBe(before.classes);
        expect(after.settings.illustrative).toBe(true);
        expect(after.settings.timezone).toBe(before.settings.timezone);
        expect(screen.getByRole('status')).toHaveTextContent(
          'Demo settings updated in memory only.',
        );
      },
    );

    it('changes rolling, manual and immediate policies without leaking rolling fields', async () => {
      const view = renderWithDemoState(<SettingsScreen />);
      await view.user.selectOptions(
        screen.getByLabelText('Schedule release policy'),
        'rolling',
      );
      const advance = screen.getByLabelText(
        'Rolling release advance (minutes)',
      );
      await view.user.clear(advance);
      await view.user.type(advance, '2880');
      await view.user.click(
        screen.getByRole('button', { name: 'Save demo settings' }),
      );
      expect(view.store.getSnapshot().state.settings.scheduleRelease).toEqual({
        mode: 'rolling',
        advanceMinutes: 2880,
      });
      expect(
        screen.getByLabelText('Rolling release advance (minutes)'),
      ).toHaveValue(2880);
      for (const mode of ['manual', 'immediate']) {
        await view.user.selectOptions(
          screen.getByLabelText('Schedule release policy'),
          mode,
        );
        expect(
          screen.queryByLabelText('Rolling release advance (minutes)'),
        ).not.toBeInTheDocument();
        await view.user.click(
          screen.getByRole('button', { name: 'Save demo settings' }),
        );
        expect(view.store.getSnapshot().state.settings.scheduleRelease).toEqual(
          { mode },
        );
      }
    });

    it.each(
      fields.flatMap(([key, label]) =>
        ['-1', '1.5', '9007199254740992'].map((value) => ({
          key,
          label,
          value,
        })),
      ),
    )(
      'preserves $key=$value and displays its actual validator error',
      async ({ key, label, value }) => {
        const view = renderWithDemoState(<SettingsScreen />);
        const before = view.store.getSnapshot();
        const validation = view.store.validate({
          type: 'updateSettings',
          payload: { updates: { [key]: Number(value) } },
        });
        expect(validation.success).toBe(false);
        if (
          validation.success ||
          validation.error.category !== 'ValidationError'
        ) {
          throw new Error(
            'Expected the settings validator to reject this number.',
          );
        }
        await view.user.clear(screen.getByLabelText(label));
        await view.user.type(screen.getByLabelText(label), value);
        await view.user.click(
          screen.getByRole('button', { name: 'Save demo settings' }),
        );
        expect(view.store.getSnapshot()).toBe(before);
        expect(screen.getByLabelText(label)).toHaveValue(Number(value));
        expect(screen.getByLabelText(label)).toHaveAttribute(
          'aria-invalid',
          'true',
        );
        expect(
          screen.getByText(validation.error.fields[0].message),
        ).toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      },
    );

    it.each(fields)(
      'does not coerce a blank %s into zero',
      async (_key, label) => {
        const view = renderWithDemoState(<SettingsScreen />);
        const before = view.store.getSnapshot();
        await view.user.clear(screen.getByLabelText(label));
        await view.user.click(
          screen.getByRole('button', { name: 'Save demo settings' }),
        );
        expect(view.store.getSnapshot()).toBe(before);
        expect(screen.getByLabelText(label)).toHaveValue(null);
        expect(screen.getByLabelText(label)).toHaveAttribute(
          'aria-invalid',
          'true',
        );
        expect(screen.getByText('Enter a whole number.')).toBeInTheDocument();
      },
    );

    it.each(fields.slice(0, 2))(
      'requires a positive %s',
      async (_key, label) => {
        const view = renderWithDemoState(<SettingsScreen />);
        const before = view.store.getSnapshot();
        await view.user.clear(screen.getByLabelText(label));
        await view.user.type(screen.getByLabelText(label), '0');
        await view.user.click(
          screen.getByRole('button', { name: 'Save demo settings' }),
        );
        expect(view.store.getSnapshot()).toBe(before);
        expect(screen.getByLabelText(label)).toHaveValue(0);
        expect(screen.getByLabelText(label)).toHaveAttribute(
          'aria-invalid',
          'true',
        );
        expect(
          screen.getByText('Use a whole number greater than zero.'),
        ).toBeInTheDocument();
      },
    );

    it('accepts positive minimums and zero gaps, cutoffs, check-in windows and rolling advance', async () => {
      const view = renderWithDemoState(<SettingsScreen />);
      for (const [key, label] of fields) {
        const input = screen.getByLabelText(label);
        await view.user.clear(input);
        await view.user.type(
          input,
          key === 'memberCap' || key === 'invitationExpiryMinutes' ? '1' : '0',
        );
      }
      await view.user.selectOptions(
        screen.getByLabelText('Schedule release policy'),
        'rolling',
      );
      await view.user.type(
        screen.getByLabelText('Rolling release advance (minutes)'),
        '0',
      );
      await view.user.click(
        screen.getByRole('button', { name: 'Save demo settings' }),
      );
      expect(view.store.getSnapshot().state.settings).toMatchObject({
        memberCap: 1,
        invitationExpiryMinutes: 1,
        targetGapMinutes: 0,
        waitlistCutoffMinutes: 0,
        lateCancelCutoffMinutes: 0,
        checkInLeadMinutes: 0,
        checkInGraceMinutes: 0,
        scheduleRelease: { mode: 'rolling', advanceMinutes: 0 },
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it.each(['', '-1', '1.5', '9007199254740992'])(
      'rejects invalid rolling advance "%s" without changing policy',
      async (value) => {
        const view = renderWithDemoState(<SettingsScreen />);
        const before = view.store.getSnapshot();
        await view.user.selectOptions(
          screen.getByLabelText('Schedule release policy'),
          'rolling',
        );
        if (value)
          await view.user.type(
            screen.getByLabelText('Rolling release advance (minutes)'),
            value,
          );
        await view.user.click(
          screen.getByRole('button', { name: 'Save demo settings' }),
        );
        expect(view.store.getSnapshot()).toBe(before);
        expect(screen.getByLabelText('Schedule release policy')).toHaveValue(
          'rolling',
        );
        expect(
          screen.getByLabelText('Rolling release advance (minutes)'),
        ).toHaveValue(value ? Number(value) : null);
        expect(
          screen.getByLabelText('Rolling release advance (minutes)'),
        ).toHaveAttribute('aria-invalid', 'true');
        expect(
          screen.getByText(
            value
              ? 'Use a whole number greater than or equal to zero.'
              : 'Enter a whole number.',
          ),
        ).toBeInTheDocument();
      },
    );

    it('retains unrelated draft fields on rejection and clears errors when corrected', async () => {
      const view = renderWithDemoState(<SettingsScreen />);
      const before = view.store.getSnapshot();
      await view.user.clear(screen.getByLabelText('Member cap'));
      await view.user.type(screen.getByLabelText('Member cap'), '24');
      await view.user.clear(
        screen.getByLabelText('Invitation expiry (minutes)'),
      );
      await view.user.type(
        screen.getByLabelText('Invitation expiry (minutes)'),
        '-1',
      );
      await view.user.click(
        screen.getByRole('button', { name: 'Save demo settings' }),
      );
      expect(view.store.getSnapshot()).toBe(before);
      expect(screen.getByLabelText('Member cap')).toHaveValue(24);
      await view.user.clear(
        screen.getByLabelText('Invitation expiry (minutes)'),
      );
      await view.user.type(
        screen.getByLabelText('Invitation expiry (minutes)'),
        '60',
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await view.user.click(
        screen.getByRole('button', { name: 'Save demo settings' }),
      );
      expect(view.store.getSnapshot().state.settings).toMatchObject({
        memberCap: 24,
        invitationExpiryMinutes: 60,
      });
    });

    it('reflects external settings, scenario loading and reset without stale drafts', async () => {
      const view = renderWithDemoState(<SettingsScreen />);
      await view.user.clear(screen.getByLabelText('Member cap'));
      await view.user.type(screen.getByLabelText('Member cap'), '24');
      act(() => {
        expect(
          view.store.submit({
            type: 'updateSettings',
            payload: {
              updates: {
                memberCap: 12,
                scheduleRelease: { mode: 'rolling', advanceMinutes: 60 },
              },
            },
          }).success,
        ).toBe(true);
      });
      expect(screen.getByLabelText('Member cap')).toHaveValue(12);
      expect(
        screen.getByLabelText('Rolling release advance (minutes)'),
      ).toHaveValue(60);
      act(() => {
        expect(
          view.store.loadScenario(SCENARIO_IDS.invitationMemberCap, {
            confirmed: true,
          }).success,
        ).toBe(true);
      });
      expect(screen.getByLabelText('Member cap')).toHaveValue(
        view.store.getSnapshot().state.settings.memberCap,
      );
      act(() => {
        expect(
          view.store.submit({
            type: 'selectActor',
            payload: { actor: { kind: 'staff', staffId: ids.staff.admin } },
          }).success,
        ).toBe(true);
      });
      await view.user.clear(screen.getByLabelText('Member cap'));
      await view.user.type(screen.getByLabelText('Member cap'), '24');
      act(() => {
        expect(view.store.resetDemo({ confirmed: true }).success).toBe(true);
      });
      expect(screen.getByLabelText('Member cap')).toHaveValue(8);
    });

    it('removes writes immediately on actor change and the real action denies a nonadmin', async () => {
      const view = renderWithDemoState(<SettingsScreen />);
      await view.user.clear(screen.getByLabelText('Member cap'));
      await view.user.type(screen.getByLabelText('Member cap'), '24');
      act(() => {
        expect(
          view.store.submit({
            type: 'selectActor',
            payload: { actor: { kind: 'staff', staffId: ids.staff.frontDesk } },
          }).success,
        ).toBe(true);
      });
      const before = view.store.getSnapshot();
      expect(
        screen.queryByRole('button', { name: 'Save demo settings' }),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText('Member cap')).toHaveValue(8);
      expect(screen.getByText(/read-only.*active admin/i)).toBeInTheDocument();
      expect(
        view.store.submit({
          type: 'updateSettings',
          payload: { updates: { memberCap: 24 } },
        }).success,
      ).toBe(false);
      expect(view.store.getSnapshot()).toBe(before);
    });

    it('never persists settings and a fresh demo restores fixtures', async () => {
      const writes = vi.spyOn(Storage.prototype, 'setItem');
      try {
        const view = renderWithDemoState(<SettingsScreen />);
        await view.user.clear(screen.getByLabelText('Member cap'));
        await view.user.type(screen.getByLabelText('Member cap'), '24');
        await view.user.click(
          screen.getByRole('button', { name: 'Save demo settings' }),
        );
        expect(view.store.getSnapshot().state.settings.memberCap).toBe(24);
        expect(writes).not.toHaveBeenCalled();
        view.unmount();
        renderWithDemoState(<SettingsScreen />);
        expect(screen.getByLabelText('Member cap')).toHaveValue(8);
      } finally {
        writes.mockRestore();
      }
    });
  });

  it.each<DemoActor>([
    { kind: 'staff', staffId: ids.staff.frontDesk },
    { kind: 'staff', staffId: ids.staff.coach },
    { kind: 'staff', staffId: ids.staff.multiRole },
    { kind: 'staff', staffId: ids.staff.inactive },
    { kind: 'member', memberId: ids.members.maple },
    { kind: 'member', memberId: ids.members.moss },
    { kind: 'invitation', invitationId: ids.invitations.outstanding },
  ])(
    'explains read-only access for $kind $staffId $memberId $invitationId',
    (actor) => {
      const view = renderWithDemoState(<SettingsScreen />, { actor });
      const before = view.store.getSnapshot();
      for (const [, label] of fields) {
        expect(screen.getByLabelText(label)).toHaveAttribute('readonly');
      }
      expect(screen.getByLabelText('Schedule release policy')).toBeDisabled();
      expect(
        screen.queryByRole('button', { name: 'Save demo settings' }),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/read-only.*active admin/i)).toBeInTheDocument();
      if (actor.kind === 'staff' && actor.staffId === ids.staff.inactive) {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Inactive staff cannot perform demo actions.',
        );
      }
      expect(view.store.getSnapshot()).toBe(before);
    },
  );
});
