import type { ReactElement } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInitialDemoState,
  FIXTURE_IDS as ids,
} from '../../demo-fixtures';
import { createDemoStore } from '../../demo-state';
import { DemoStateContext } from '../../demo-state/context';
import type { DemoState, ScheduledClass, StaffId } from '../../domain';
import { renderWithDemoState } from '../../test-support';
import {
  CoachesScreen,
  PublicCoachClassDetails,
  PublicCoachProfile,
} from './index';

const indigo = 'Fictional Coach Indigo';

function coach(state: DemoState, staffId: StaffId = ids.staff.coach) {
  const profile = state.staffAccounts.find(
    (account) => account.staffId === staffId,
  )?.coachProfile;
  if (!profile) throw new Error('Expected a fictional coach profile.');
  return profile;
}

function renderState(ui: ReactElement, state: DemoState) {
  const store = createDemoStore(state);
  return {
    ...render(
      <DemoStateContext.Provider value={store}>{ui}</DemoStateContext.Provider>,
    ),
    store,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Coach profile editing', () => {
  it('explicitly explains a missing own profile without allowing self-initialization or inactive access', () => {
    const view = renderWithDemoState(<CoachesScreen />);
    const staffId = 'staff:profileless';
    act(() => {
      expect(
        view.store.submit({
          type: 'createStaffAccount',
          payload: {
            staff: {
              staffId,
              identitySubject: 'identity:profileless',
              active: true,
              assignedRoles: ['coach'],
              assignedClassIds: [],
            },
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
    expect(
      screen.getByText(
        `Coach profile for ${staffId} has not been initialized.`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ask an active Admin to initialize this coach profile.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    act(() => {
      expect(
        view.store.submit({
          type: 'selectActor',
          payload: { actor: { kind: 'staff', staffId: ids.staff.admin } },
        }).success,
      ).toBe(true);
      expect(
        view.store.submit({
          type: 'deactivateStaffAccount',
          payload: { staffId },
        }).success,
      ).toBe(true);
    });
    expect(
      screen.getByRole('form', { name: `Initialize ${staffId}` }),
    ).toBeInTheDocument();
    act(() => {
      expect(
        view.store.submit({
          type: 'selectActor',
          payload: { actor: { kind: 'staff', staffId } },
        }).success,
      ).toBe(true);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/inactive staff/i);
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        `Coach profile for ${staffId} has not been initialized.`,
      ),
    ).not.toBeInTheDocument();
  });

  it.each([ids.staff.coach, ids.staff.multiRole])(
    'lets an active coach adjust only their own biography and generated avatar: %s',
    async (staffId) => {
      const view = renderWithDemoState(<CoachesScreen />, {
        actor: { kind: 'staff', staffId },
      });
      const before = view.store.getSnapshot().state;
      const name = coach(before, staffId).displayName;
      const form = within(screen.getByRole('form', { name: `Edit ${name}` }));
      expect(screen.getAllByRole('form')).toHaveLength(1);
      expect(form.queryByLabelText('Coach name')).not.toBeInTheDocument();
      expect(form.queryByLabelText('Certifications')).not.toBeInTheDocument();
      expect(form.queryByLabelText('Staff email')).not.toBeInTheDocument();
      expect(form.queryByLabelText('Staff phone')).not.toBeInTheDocument();
      await view.user.clear(form.getByLabelText('Biography'));
      await view.user.type(
        form.getByLabelText('Biography'),
        'A new fictional bio.',
      );
      await view.user.selectOptions(
        form.getByLabelText('Generated avatar'),
        'avatar:local-coral',
      );
      await view.user.click(
        form.getByRole('button', { name: 'Save coach profile' }),
      );
      const after = view.store.getSnapshot().state;
      expect(coach(after, staffId)).toEqual({
        ...coach(before, staffId),
        biography: 'A new fictional bio.',
        avatarId: 'avatar:local-coral',
      });
      expect(
        after.staffAccounts.filter((account) => account.staffId !== staffId),
      ).toEqual(
        before.staffAccounts.filter((account) => account.staffId !== staffId),
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'Coach profile saved',
      );
      expect(screen.getByText(/non-operational/i)).toBeInTheDocument();
    },
  );

  it('lets Admin adjust name, certifications, staff-only contact, bio and avatar', async () => {
    const view = renderWithDemoState(<CoachesScreen />);
    const form = within(screen.getByRole('form', { name: `Edit ${indigo}` }));
    for (const [label, value] of [
      ['Coach name', 'Fictional Coach Violet'],
      ['Biography', 'Updated fictional biography.'],
      ['Certifications', 'Illustrative coaching\nIllustrative first aid'],
      ['Staff email', 'violet@example.invalid'],
      ['Staff phone', '555-0101'],
    ]) {
      await view.user.clear(form.getByLabelText(label));
      await view.user.type(form.getByLabelText(label), value);
    }
    await view.user.selectOptions(
      form.getByLabelText('Generated avatar'),
      'avatar:local-indigo',
    );
    await view.user.click(
      form.getByRole('button', { name: 'Save coach profile' }),
    );
    expect(coach(view.store.getSnapshot().state)).toEqual({
      displayName: 'Fictional Coach Violet',
      biography: 'Updated fictional biography.',
      avatarId: 'avatar:local-indigo',
      certifications: ['Illustrative coaching', 'Illustrative first aid'],
      contact: { email: 'violet@example.invalid', phone: '555-0101' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('Coach profile saved');
  });

  it('allows Admin to remove optional contact and certification entries', async () => {
    const view = renderWithDemoState(<CoachesScreen />);
    const form = within(screen.getByRole('form', { name: `Edit ${indigo}` }));
    await view.user.clear(form.getByLabelText('Staff email'));
    await view.user.clear(form.getByLabelText('Certifications'));
    await view.user.click(
      form.getByRole('button', { name: 'Save coach profile' }),
    );
    expect(coach(view.store.getSnapshot().state)).toMatchObject({
      contact: {},
      certifications: [],
    });
  });

  it.each([
    { kind: 'staff', staffId: ids.staff.frontDesk } as const,
    { kind: 'member', memberId: ids.members.maple } as const,
    { kind: 'invitation', invitationId: ids.invitations.outstanding } as const,
  ])('does not offer writes to a read-only persona: $kind', (actor) => {
    renderWithDemoState(<CoachesScreen />, { actor });
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save coach profile' }),
    ).not.toBeInTheDocument();
  });

  it('shows a permission failure, not profiles or contact, for inactive staff', () => {
    renderWithDemoState(<CoachesScreen />, {
      actor: { kind: 'staff', staffId: ids.staff.inactive },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/inactive staff/i);
    expect(screen.queryByText(indigo)).not.toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(
      'coach-indigo@example.invalid',
    );
  });

  it('keeps the draft and state unchanged after a rejected name and exposes field feedback', async () => {
    const view = renderWithDemoState(<CoachesScreen />);
    const form = within(screen.getByRole('form', { name: `Edit ${indigo}` }));
    const before = view.store.getSnapshot().state;
    await view.user.clear(form.getByLabelText('Coach name'));
    await view.user.type(form.getByLabelText('Biography'), ' Keep this draft.');
    await view.user.click(
      form.getByRole('button', { name: 'Save coach profile' }),
    );
    expect(view.store.getSnapshot().state).toBe(before);
    expect(form.getByLabelText('Coach name')).toHaveValue('');
    expect(form.getByLabelText('Coach name')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(form.getByLabelText('Biography')).toHaveValue(
      `${coach(before).biography} Keep this draft.`,
    );
    expect(form.getAllByRole('alert')[0]).toHaveTextContent(/display name/i);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('rejects stale drafts with visible feedback until the user reloads current fields', async () => {
    const view = renderWithDemoState(<CoachesScreen />, {
      actor: { kind: 'staff', staffId: ids.staff.coach },
    });
    let form = within(screen.getByRole('form', { name: `Edit ${indigo}` }));
    await view.user.clear(form.getByLabelText('Biography'));
    await view.user.type(form.getByLabelText('Biography'), 'Unsaved draft.');
    act(() => {
      expect(view.store.advanceClockBy(1).success).toBe(true);
    });
    const before = view.store.getSnapshot().state;
    await view.user.click(
      form.getByRole('button', { name: 'Save coach profile' }),
    );
    expect(view.store.getSnapshot().state).toBe(before);
    expect(form.getByLabelText('Biography')).toHaveValue('Unsaved draft.');
    expect(form.getByRole('alert')).toHaveTextContent(/state changed/i);
    await view.user.click(form.getByRole('button', { name: 'Reload profile' }));
    form = within(screen.getByRole('form', { name: `Edit ${indigo}` }));
    expect(form.getByLabelText('Biography')).toHaveValue(
      coach(before).biography,
    );
    await view.user.type(form.getByLabelText('Biography'), ' Current edit.');
    await view.user.click(
      form.getByRole('button', { name: 'Save coach profile' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Coach profile saved');
  });

  it('removes an own-profile draft when persona permissions change', async () => {
    const view = renderWithDemoState(<CoachesScreen />, {
      actor: { kind: 'staff', staffId: ids.staff.coach },
    });
    await view.user.type(screen.getByLabelText('Biography'), ' Private draft.');
    act(() => {
      expect(
        view.store.submit({
          type: 'selectActor',
          payload: { actor: { kind: 'member', memberId: ids.members.maple } },
        }).success,
      ).toBe(true);
    });
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('Private draft.');
    expect(document.body.innerHTML).not.toContain(
      'coach-indigo@example.invalid',
    );
  });
});

describe('Public and staff coach projections', () => {
  it('shows public names, certifications, bio and history without contact or identity in the DOM', () => {
    const view = renderWithDemoState(<CoachesScreen />, {
      actor: { kind: 'member', memberId: ids.members.maple },
    });
    expect(screen.getByRole('heading', { name: indigo })).toBeInTheDocument();
    expect(
      screen.getByText('Illustrative rowing certificate'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Fictional technique coach for the demonstration.'),
    ).toBeInTheDocument();
    const history = within(
      screen.getByRole('region', { name: `${indigo} class history` }),
    );
    expect(history.getByText(/Demo Technique/)).toBeInTheDocument();
    for (const account of view.store.getSnapshot().state.staffAccounts) {
      expect(view.container.innerHTML).not.toContain(account.identitySubject);
      if (account.coachProfile?.contact.email) {
        expect(view.container.innerHTML).not.toContain(
          account.coachProfile.contact.email,
        );
      }
    }
    expect(
      view.container.querySelector('a[href^="mailto:"], a[href^="tel:"]'),
    ).toBeNull();
    expect(screen.queryByText('Staff-only contact')).not.toBeInTheDocument();
  });

  it('shows contact only to active staff, without identity-provider subjects', () => {
    const view = renderWithDemoState(<CoachesScreen />, {
      actor: { kind: 'staff', staffId: ids.staff.frontDesk },
    });
    expect(
      screen.getByText('coach-indigo@example.invalid'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Staff-only contact')).toHaveLength(2);
    for (const account of view.store.getSnapshot().state.staffAccounts) {
      expect(view.container.innerHTML).not.toContain(account.identitySubject);
    }
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it.each(['member', 'staff'] as const)(
    'filters history by exact end, release and lifecycle for %s, retaining inactive coach history',
    (audience) => {
      const state = createInitialDemoState();
      const past = state.classes.find(
        (item) => item.classId === ids.classes.history,
      );
      if (!past) throw new Error('Expected a past class fixture.');
      const occurrence = (
        name: string,
        updates: Partial<ScheduledClass> = {},
      ): ScheduledClass => ({
        ...past,
        classId: `class:${name}`,
        classTypeSnapshot: { ...past.classTypeSnapshot, name },
        ...updates,
      });
      const view = renderState(<CoachesScreen />, {
        ...state,
        activeActor:
          audience === 'member'
            ? { kind: 'member', memberId: ids.members.maple }
            : { kind: 'staff', staffId: ids.staff.frontDesk },
        staffAccounts: state.staffAccounts.map((account) =>
          account.staffId === ids.staff.coach
            ? { ...account, active: false }
            : account,
        ),
        settings: { ...state.settings, scheduleRelease: { mode: 'manual' } },
        classes: [
          occurrence('Exact end', {
            endsAt: state.clock.now,
            startsAt: '2026-10-05T15:00:00Z',
          }),
          occurrence('Future end', { endsAt: '2026-10-05T15:46:00Z' }),
          occurrence('Past draft', { status: 'draft' }),
          occurrence('Cancelled past', { status: 'cancelled' }),
          occurrence('Unreleased past', { releasedAt: undefined }),
          occurrence('Future release', { releasedAt: '2026-10-06T00:00:00Z' }),
          occurrence('Old snapshot'),
        ],
      });
      const history = within(
        screen.getByRole('region', { name: `${indigo} class history` }),
      );
      const items = history.getAllByRole('listitem');
      expect(items.at(-1)).toHaveTextContent('Exact end');
      expect(
        history.queryByText(/Future end|Past draft/),
      ).not.toBeInTheDocument();
      expect(history.getByText(/Old snapshot/)).toBeInTheDocument();
      for (const name of [
        'Cancelled past',
        'Unreleased past',
        'Future release',
      ]) {
        if (audience === 'member')
          expect(history.queryByText(new RegExp(name))).not.toBeInTheDocument();
        else expect(history.getByText(new RegExp(name))).toBeInTheDocument();
      }
      expect(view.container.innerHTML).not.toContain('identity:');
    },
  );

  it('offers a reusable class-details projection including public coach history', () => {
    const view = renderWithDemoState(
      <PublicCoachClassDetails classId={ids.classes.checkIn} />,
      {
        actor: { kind: 'member', memberId: ids.members.maple },
      },
    );
    expect(
      screen.getByRole('heading', { name: 'Demo Technique' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: indigo })).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: `${indigo} class history` }),
    ).toHaveTextContent('Demo Technique');
    expect(view.container.innerHTML).not.toMatch(
      /example\.invalid|identity:|mailto:|tel:/,
    );
  });

  it('does not reveal an unreleased class through the reusable class-details component', () => {
    const state = createInitialDemoState();
    renderState(
      <PublicCoachClassDetails classId={ids.classes.laterRelease} />,
      {
        ...state,
        activeActor: { kind: 'member', memberId: ids.members.maple },
        settings: { ...state.settings, scheduleRelease: { mode: 'manual' } },
      },
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/unavailable/i);
    expect(
      screen.queryByRole('heading', { name: indigo }),
    ).not.toBeInTheDocument();
  });

  it('handles classes without coaches and unavailable coach profiles explicitly', () => {
    const view = renderWithDemoState(
      <PublicCoachClassDetails classId={ids.classes.free} />,
      {
        actor: { kind: 'member', memberId: ids.members.maple },
      },
    );
    expect(screen.getByText('No coach assigned.')).toBeInTheDocument();
    view.rerender(<PublicCoachProfile coachId="staff:missing" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/unavailable/i);
  });

  it('never renders staff contact even when the reusable public profile is used by staff', () => {
    const view = renderWithDemoState(
      <PublicCoachProfile coachId={ids.staff.coach} />,
    );
    expect(screen.getByRole('heading', { name: indigo })).toBeInTheDocument();
    expect(view.container.innerHTML).not.toMatch(
      /example\.invalid|identity:|mailto:|tel:/,
    );
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('renders generated SVGs only, with adjustable previews and no external requests', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const view = renderWithDemoState(<CoachesScreen />, {
      actor: { kind: 'staff', staffId: ids.staff.coach },
    });
    const form = within(screen.getByRole('form', { name: `Edit ${indigo}` }));
    const preview = form.getByRole('img', { name: /avatar preview/i });
    const before = preview.innerHTML;
    await view.user.selectOptions(
      form.getByLabelText('Generated avatar'),
      'avatar:local-coral',
    );
    expect(preview.innerHTML).not.toBe(before);
    await view.user.click(
      form.getByRole('button', { name: 'Save coach profile' }),
    );
    const avatars = screen.getAllByRole('img');
    expect(
      avatars.every((avatar) => avatar.tagName.toLowerCase() === 'svg'),
    ).toBe(true);
    expect(
      view.container.querySelector('img, image, iframe, input[type="file"]'),
    ).toBeNull();
    expect(view.container.innerHTML).not.toMatch(/https?:\/\/|data:image/);
    expect(fetch).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
  });

  it('treats an untrusted avatar identifier as an initials placeholder, never an image source', () => {
    const state = createInitialDemoState();
    const view = renderState(<PublicCoachProfile coachId={ids.staff.coach} />, {
      ...state,
      staffAccounts: state.staffAccounts.map((account) =>
        account.coachProfile
          ? {
              ...account,
              coachProfile: {
                ...account.coachProfile,
                avatarId: 'avatar:https://untrusted.invalid/portrait.svg',
              },
            }
          : account,
      ),
    });
    expect(screen.getByRole('img')).toHaveTextContent('FC');
    expect(
      view.container.querySelector('img, image, [href], [src]'),
    ).toBeNull();
    expect(view.container.innerHTML).not.toContain('untrusted.invalid');
  });

  it('omits phone as well as email from member class details while retaining staff contact', () => {
    const state = createInitialDemoState();
    const view = renderState(
      <PublicCoachClassDetails classId={ids.classes.checkIn} />,
      {
        ...state,
        activeActor: { kind: 'member', memberId: ids.members.maple },
        staffAccounts: state.staffAccounts.map((account) =>
          account.coachProfile
            ? {
                ...account,
                coachProfile: {
                  ...account.coachProfile,
                  contact: {
                    email: 'staff-only@example.invalid',
                    phone: '555-0199',
                  },
                },
              }
            : account,
        ),
      },
    );
    expect(view.container.innerHTML).not.toMatch(
      /staff-only@example\.invalid|555-0199|identity:/,
    );
    act(() => {
      expect(
        view.store.submit({
          type: 'selectActor',
          payload: { actor: { kind: 'staff', staffId: ids.staff.frontDesk } },
        }).success,
      ).toBe(true);
    });
    view.rerender(
      <DemoStateContext.Provider value={view.store}>
        <CoachesScreen />
      </DemoStateContext.Provider>,
    );
    expect(screen.getAllByText('555-0199')).toHaveLength(2);
    expect(screen.getAllByText('staff-only@example.invalid')).toHaveLength(2);
  });

  it('surfaces a malformed history failure rather than showing an empty successful history', () => {
    const state = createInitialDemoState();
    renderState(<PublicCoachProfile coachId={ids.staff.coach} />, {
      ...state,
      classes: state.classes.map((scheduled) =>
        scheduled.classId === ids.classes.history
          ? { ...scheduled, endsAt: scheduled.startsAt }
          : scheduled,
      ),
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /valid scheduled UTC end/i,
    );
    expect(
      screen.queryByText('No visible past classes.'),
    ).not.toBeInTheDocument();
  });

  it('shows saved own-profile edits in member class details while retaining staff-only fields', async () => {
    const view = renderWithDemoState(<CoachesScreen />, {
      actor: { kind: 'staff', staffId: ids.staff.coach },
    });
    const before = coach(view.store.getSnapshot().state);
    await view.user.clear(screen.getByLabelText('Biography'));
    await view.user.type(
      screen.getByLabelText('Biography'),
      'Public updated bio.',
    );
    await view.user.click(
      screen.getByRole('button', { name: 'Save coach profile' }),
    );
    await view.user.type(screen.getByLabelText('Biography'), ' A second save.');
    await view.user.click(
      screen.getByRole('button', { name: 'Save coach profile' }),
    );
    expect(coach(view.store.getSnapshot().state)).toEqual({
      ...before,
      biography: 'Public updated bio. A second save.',
    });
    act(() => {
      expect(
        view.store.submit({
          type: 'selectActor',
          payload: { actor: { kind: 'member', memberId: ids.members.maple } },
        }).success,
      ).toBe(true);
    });
    view.rerender(<PublicCoachClassDetails classId={ids.classes.checkIn} />);
    expect(
      screen.getByText('Public updated bio. A second save.'),
    ).toBeInTheDocument();
    expect(view.container.innerHTML).not.toContain(before.contact.email);
  });
});
