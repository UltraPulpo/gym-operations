import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_IDS as ids, createInitialDemoState } from '../demo-fixtures';
import { getScenarios, SCENARIO_IDS } from '../demo-scenarios';
import type { DemoActor } from '../domain';
import { renderWithDemoState } from '../test-support';
import { App } from './App';
import { DemoShell } from './DemoShell';

function shell(path = '/', actor?: DemoActor, scenarioId?: string) {
  return renderWithDemoState(
    <MemoryRouter initialEntries={[path]}>
      <DemoShell />
    </MemoryRouter>,
    { actor, scenarioId },
  );
}

const admin: DemoActor = { kind: 'staff', staffId: ids.staff.admin };
const frontDesk: DemoActor = { kind: 'staff', staffId: ids.staff.frontDesk };
const coach: DemoActor = { kind: 'staff', staffId: ids.staff.coach };
const member: DemoActor = { kind: 'member', memberId: ids.members.maple };

beforeEach(() => {
  window.history.replaceState(null, '', '/gym-operations/#/');
});

describe('composed demo shell', () => {
  it('loads under the repository base with one state owner and an unmistakable current notice', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: 'Demo overview' }),
    ).toBeVisible();
    expect(
      screen.getByText('SIMULATED DEMO - NOT FOR OPERATIONS'),
    ).toBeVisible();
    expect(screen.getByText(/No live authentication, email/)).toBeVisible();
    expect(
      screen.getByText(/Demo timezone: America\/Los_Angeles.*illustrative/),
    ).toBeVisible();
    expect(screen.getByLabelText('Fictional persona')).toHaveValue(
      ids.staff.admin,
    );
    expect(
      screen.queryByLabelText(/password|credential/i),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['/staff', 'Staff access'],
    ['/members', 'Members and invitations'],
    ['/invitations', 'Simulated invitation acceptance'],
    ['/waivers', 'Fictional waivers'],
    ['/stations', 'Stations and layout'],
    ['/classes', 'Class types'],
    ['/schedule', 'Schedule'],
    ['/bookings', 'Bookings and waitlists'],
    ['/attendance', 'Attendance and outage roster'],
    ['/notifications', 'Simulated notifications'],
    ['/coaches', 'Coach profiles'],
    ['/settings', 'Illustrative Admin settings'],
  ])('mounts the real exported screen at %s', (path, heading) => {
    window.history.replaceState(null, '', `/gym-operations/#${path}`);
    render(<App />);
    expect(screen.getByRole('heading', { name: heading })).toBeVisible();
    expect(
      screen.getByText('SIMULATED DEMO - NOT FOR OPERATIONS'),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: heading })).toHaveFocus();
  });

  it('uses hash links and moves focus into the new screen without losing controls', async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Schedule' }));
    expect(window.location.pathname).toBe('/gym-operations/');
    expect(window.location.hash).toBe('#/schedule');
    expect(screen.getByRole('heading', { name: 'Schedule' })).toHaveFocus();
    expect(screen.getByLabelText('Fictional persona')).toBeVisible();
    expect(
      screen.getByText('SIMULATED DEMO - NOT FOR OPERATIONS'),
    ).toBeVisible();
  });

  it('offers an explicit unknown-route fallback and accessible overview navigation', async () => {
    window.history.replaceState(null, '', '/gym-operations/#/unknown');
    render(<App />);
    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toHaveFocus();
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Demo overview' }));
    expect(window.location.hash).toBe('#/');
    expect(
      screen.getByRole('heading', { name: 'Demo overview' }),
    ).toHaveFocus();
  });

  it.each([
    [
      frontDesk,
      [
        'Members',
        'Invitations',
        'Schedule',
        'Bookings',
        'Attendance',
        'Notifications',
      ],
      ['Staff access', 'Settings'],
    ],
    [
      coach,
      ['Schedule', 'Bookings', 'Attendance', 'Coaches'],
      ['Staff access', 'Members', 'Invitations', 'Settings'],
    ],
    [
      member,
      [
        'Members',
        'Waivers',
        'Stations',
        'Classes',
        'Schedule',
        'Bookings',
        'Attendance',
        'Coaches',
      ],
      ['Staff access', 'Invitations', 'Settings'],
    ],
  ])(
    'derives persistent navigation from the selected account, not independent role toggles',
    (actor, visible, hidden) => {
      shell('/', actor);
      const nav = within(
        screen.getByRole('navigation', { name: 'Demo navigation' }),
      );
      for (const label of visible)
        expect(nav.getByRole('link', { name: label })).toBeVisible();
      for (const label of hidden)
        expect(
          nav.queryByRole('link', { name: label }),
        ).not.toBeInTheDocument();
    },
  );

  it('explains read-only schedules, assigned-class scope, and direct-route denial', async () => {
    const view = shell('/schedule', frontDesk);
    expect(
      screen.getByText(/Schedule is read-only for this persona/),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Create template/ }),
    ).not.toBeInTheDocument();
    await view.user.selectOptions(
      screen.getByLabelText('Fictional persona'),
      ids.staff.coach,
    );
    expect(
      screen.getByText(/Coach actions are limited to assigned classes/),
    ).toBeVisible();
    await view.user.selectOptions(
      screen.getByLabelText('Fictional persona'),
      ids.staff.inactive,
    );
    expect(
      screen.getByRole('heading', { name: 'Demo access unavailable' }),
    ).toBeVisible();
    expect(
      screen.getAllByText(/Inactive staff cannot perform demo actions/).length,
    ).toBeGreaterThan(0);
    expect(
      within(
        screen.getByRole('navigation', { name: 'Demo navigation' }),
      ).getAllByRole('link'),
    ).toHaveLength(1);
    expect(view.store.getSnapshot().state.activeActor).toEqual({
      kind: 'staff',
      staffId: ids.staff.inactive,
    });
  });

  it('selects all current records including newly created staff and unions multi-role capabilities', async () => {
    const view = shell();
    const newId = 'staff:new-fictional-coach';
    act(() => {
      expect(
        view.store.submit({
          type: 'createStaffAccount',
          payload: {
            staff: {
              staffId: newId,
              identitySubject: 'identity:new-fictional-coach',
              active: true,
              assignedRoles: ['coach', 'frontDesk'],
              assignedClassIds: [ids.classes.checkIn],
            },
          },
        }).success,
      ).toBe(true);
    });
    await view.user.selectOptions(
      screen.getByLabelText('Fictional persona'),
      newId,
    );
    expect(view.store.getSnapshot().state.activeActor).toEqual({
      kind: 'staff',
      staffId: newId,
    });
    expect(screen.getByRole('link', { name: 'Members' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Coaches' })).toBeVisible();
    expect(screen.getByText(/Class action scope: all classes/)).toBeVisible();
    expect(
      screen.getByLabelText('Fictional persona').querySelectorAll('option'),
    ).toHaveLength(
      view.store.getSnapshot().state.staffAccounts.length +
        view.store.getSnapshot().state.members.length +
        view.store.getSnapshot().state.invitations.length,
    );
  });

  it('mounts invitation and pending-member workflows while preserving explicit eligibility explanations', async () => {
    const view = shell('/invitations', {
      kind: 'invitation',
      invitationId: ids.invitations.outstanding,
    });
    expect(screen.getByLabelText('Display name')).toBeVisible();
    expect(screen.getByLabelText('Typed signature')).toBeVisible();
    await view.user.selectOptions(
      screen.getByLabelText('Fictional persona'),
      ids.members.fern,
    );
    expect(
      screen.getByRole('heading', { name: 'Demo access unavailable' }),
    ).toBeVisible();
    await view.user.click(screen.getByRole('link', { name: 'Members' }));
    expect(
      screen.getByRole('heading', { name: 'Your fictional membership' }),
    ).toBeVisible();
    expect(
      screen.getAllByText(/Pending\/inactive members cannot book or check in/)
        .length,
    ).toBeGreaterThan(0);
  });

  it('shows exact scenario catalog metadata and replaces edited state only after confirmation', async () => {
    const view = shell();
    const catalog = getScenarios();
    const picker = screen.getByLabelText('Named scenario');
    expect(
      Array.from(picker.querySelectorAll('option')).map(
        (option) => option.textContent,
      ),
    ).toEqual(catalog.map((item) => item.name));
    await view.user.selectOptions(picker, SCENARIO_IDS.invitationMemberCap);
    const selected = catalog.find(
      (item) => item.scenarioId === SCENARIO_IDS.invitationMemberCap,
    )!;
    expect(screen.getByText(selected.description)).toBeVisible();
    expect(
      screen.getByText(`Scenario clock: ${selected.clockInstant}`),
    ).toBeVisible();
    await view.user.click(screen.getByRole('button', { name: '+1 minute' }));
    const edited = view.store.getSnapshot().state;
    await view.user.click(
      screen.getByRole('button', { name: 'Load scenario' }),
    );
    expect(
      screen.getByRole('alertdialog', { name: 'Replace edited demo state?' }),
    ).toBeVisible();
    expect(view.store.getSnapshot().state).toBe(edited);
    await view.user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(view.store.getSnapshot().state).toBe(edited);
    await view.user.click(
      screen.getByRole('button', { name: 'Load scenario' }),
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Replace demo state' }),
    );
    expect(view.store.getSnapshot().state).toEqual({
      ...selected.snapshot,
      revision: edited.revision + 1,
    });
    expect(screen.getByLabelText('Fictional persona')).toHaveValue(
      ids.invitations.outstanding,
    );
    expect(screen.getByLabelText('Frozen demo clock')).toHaveTextContent(
      selected.clockInstant,
    );
  });

  it('loads an untouched scenario directly and resets actor, clock, and all edits with a cancellable confirmation', async () => {
    const view = shell();
    await view.user.selectOptions(
      screen.getByLabelText('Named scenario'),
      SCENARIO_IDS.capacityWaitlist,
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Load scenario' }),
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(view.store.getSnapshot().state.activeActor).toEqual({
      kind: 'member',
      memberId: ids.members.juniper,
    });
    await view.user.click(screen.getByRole('button', { name: '+1 hour' }));
    const edited = view.store.getSnapshot().state;
    await view.user.click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await view.user.keyboard('{Escape}');
    expect(view.store.getSnapshot().state).toBe(edited);
    expect(screen.getByRole('button', { name: 'Reset demo' })).toHaveFocus();
    await view.user.click(screen.getByRole('button', { name: 'Reset demo' }));
    await view.user.click(
      screen.getByRole('button', { name: 'Reset fictional state' }),
    );
    expect(view.store.getSnapshot().state).toEqual({
      ...createInitialDemoState(),
      revision: edited.revision + 1,
    });
    expect(screen.getByLabelText('Named scenario')).toHaveValue(
      SCENARIO_IDS.baseline,
    );
  });

  it('keeps time frozen, applies named presets and forward steps, and visibly rejects backward presets without mutation', async () => {
    const view = shell('/attendance', admin);
    const initialNow = view.store.getSnapshot().state.clock.now;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(view.store.getSnapshot().state.clock.now).toBe(initialNow);
    await view.user.selectOptions(
      screen.getByLabelText('Clock preset'),
      ids.clockPresets.classEnd,
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Apply clock preset' }),
    );
    expect(view.store.getSnapshot().state.clock.now).toBe(
      '2026-10-05T16:45:00Z',
    );
    expect(
      view.store
        .getSnapshot()
        .state.classes.find((item) => item.classId === ids.classes.checkIn)
        ?.status,
    ).toBe('completed');
    await view.user.click(screen.getByRole('button', { name: '+15 minutes' }));
    const advanced = view.store.getSnapshot().state;
    await view.user.selectOptions(
      screen.getByLabelText('Clock preset'),
      ids.clockPresets.baseline,
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Apply clock preset' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The demo clock moves forward only.',
    );
    expect(view.store.getSnapshot().state).toBe(advanced);
  });

  it('renders typed unavailable clock metadata instead of assuming a preset array', () => {
    const view = shell();
    vi.spyOn(view.store, 'getSnapshot').mockReturnValue({
      state: {
        ...view.store.getSnapshot().state,
        scenarioId: 'scenario:missing',
      },
      hasUnsavedEdits: false,
    });
    act(() => {
      view.store.submit({ type: 'selectActor', payload: { actor: admin } });
    });
    expect(
      screen
        .getAllByRole('alert')
        .some((alert) =>
          alert.textContent?.includes(
            'The requested demo scenario is unavailable.',
          ),
        ),
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Apply clock preset' }),
    ).toBeDisabled();
  });

  it.each(getScenarios())(
    'loads $name with the catalog actor, clock, timezone, and complete snapshot',
    async (scenario) => {
      const view = shell();
      await view.user.selectOptions(
        screen.getByLabelText('Named scenario'),
        scenario.scenarioId,
      );
      expect(screen.getByText(scenario.description)).toBeVisible();
      await view.user.click(
        screen.getByRole('button', { name: 'Load scenario' }),
      );
      expect(view.store.getSnapshot().state).toEqual({
        ...scenario.snapshot,
        revision: 1,
      });
      expect(screen.getByLabelText('Fictional persona')).toHaveValue(
        scenario.defaultActor.kind === 'staff'
          ? scenario.defaultActor.staffId
          : scenario.defaultActor.kind === 'member'
            ? scenario.defaultActor.memberId
            : scenario.defaultActor.invitationId,
      );
      expect(
        screen.getByText(
          `Demo timezone: ${scenario.timezone} (illustrative; not confirmed gym policy).`,
        ),
      ).toBeVisible();
      expect(screen.getByLabelText('Frozen demo clock')).toHaveTextContent(
        scenario.clockInstant,
      );
    },
  );

  it('surfaces typed reset, scenario, and step errors without announcing success', async () => {
    const view = shell();
    const failure = {
      success: false,
      error: {
        category: 'DemoUnavailableState',
        message: 'Requested fictional snapshot unavailable.',
        resource: 'scenario',
        resourceId: 'scenario:missing',
        stale: false,
      },
    } as const;
    vi.spyOn(view.store, 'loadScenario').mockReturnValue(failure);
    vi.spyOn(view.store, 'resetDemo').mockReturnValue(failure);
    vi.spyOn(view.store, 'advanceClockBy').mockReturnValue(failure);
    // The hook exposes method references, so re-render a fresh snapshot after spies.
    act(() => {
      view.store.submit({ type: 'selectActor', payload: { actor: admin } });
    });
    await view.user.click(
      screen.getByRole('button', { name: 'Load scenario' }),
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Replace demo state' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(failure.error.message);
    await view.user.click(screen.getByRole('button', { name: 'Reset demo' }));
    await view.user.click(
      screen.getByRole('button', { name: 'Reset fictional state' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(failure.error.message);
    await view.user.click(screen.getByRole('button', { name: '+1 minute' }));
    expect(screen.getByRole('alert')).toHaveTextContent(failure.error.message);
    expect(
      screen.queryByText(/Fictional state replaced/),
    ).not.toBeInTheDocument();
    expect(view.store.getSnapshot().state.clock.now).toBe(
      createInitialDemoState().clock.now,
    );
  });

  it('clears local feature form drafts on same-scenario replacement', async () => {
    const view = shell('/members');
    await view.user.type(
      screen.getByLabelText('Invitation email'),
      'draft@example.invalid',
    );
    await view.user.click(screen.getByRole('button', { name: 'Reset demo' }));
    await view.user.click(
      screen.getByRole('button', { name: 'Reset fictional state' }),
    );
    expect(screen.getByLabelText('Invitation email')).toHaveValue('');
    expect(
      screen.getByRole('heading', { name: 'Members and invitations' }),
    ).toHaveFocus();
  });

  it('offers a coach created through the real staff form and limits the selected account to its assigned class', async () => {
    const view = shell('/staff');
    await view.user.click(
      screen.getByRole('button', { name: 'Create staff account' }),
    );
    await view.user.type(
      screen.getByLabelText('Staff ID'),
      'staff:fictional-new-coach',
    );
    await view.user.type(
      screen.getByLabelText('Fictional identity subject'),
      'identity:fictional-new-coach',
    );
    await view.user.click(screen.getByLabelText('Coach role'));
    await view.user.click(
      screen.getByLabelText(`Assign to class ${ids.classes.checkIn}`),
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Create account' }),
    );
    await view.user.selectOptions(
      screen.getByLabelText('Fictional persona'),
      'staff:fictional-new-coach',
    );
    expect(
      screen.getByRole('heading', { name: 'Demo access unavailable' }),
    ).toHaveFocus();
    expect(
      screen.getByText(/Coach actions are limited to assigned classes \(1\)/),
    ).toBeVisible();
    await view.user.click(screen.getByRole('link', { name: 'Attendance' }));
    expect(
      screen.getByRole('heading', { name: 'Attendance and outage roster' }),
    ).toBeVisible();
    expect(view.store.getSnapshot().state.activeActor).toEqual({
      kind: 'staff',
      staffId: 'staff:fictional-new-coach',
    });
    const classChoices = screen
      .getByLabelText('Attendance class')
      .querySelectorAll('option');
    expect(Array.from(classChoices).map((option) => option.value)).toEqual([
      ids.classes.checkIn,
    ]);
  });
});
