import { act, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FIXTURE_IDS as ids } from '../../demo-fixtures';
import { SCENARIO_IDS } from '../../demo-scenarios';
import type { DemoActor } from '../../domain';
import { renderWithDemoState } from '../../test-support';
import { InvitationAcceptanceScreen, MembersScreen } from './index';

const staff: DemoActor = { kind: 'staff', staffId: ids.staff.frontDesk };
const invitee: DemoActor = {
  kind: 'invitation',
  invitationId: ids.invitations.outstanding,
};

function selectActor(
  view: ReturnType<typeof renderWithDemoState>,
  actor: DemoActor,
) {
  act(() => {
    expect(
      view.store.submit({ type: 'selectActor', payload: { actor } }).success,
    ).toBe(true);
  });
}

async function fillAcceptance(view: ReturnType<typeof renderWithDemoState>) {
  await view.user.type(view.getByLabelText('Display name'), 'Fictional Rowan');
  await view.user.click(view.getByLabelText('I attest that I am at least 18'));
  await view.user.type(view.getByLabelText('Typed signature'), 'Rowan Demo');
}

describe('staff member management', () => {
  it('creates arbitrary fictional invitations, shows failed delivery without rollback, resends and revokes', async () => {
    const view = renderWithDemoState(<MembersScreen />, { actor: staff });
    await view.user.selectOptions(
      view.getByLabelText('Simulated email outcome'),
      'failure',
    );
    await view.user.type(
      view.getByLabelText('Invitation email'),
      'rowan@example.invalid',
    );
    await view.user.click(
      view.getByRole('button', { name: 'Create invitation' }),
    );
    const created = view.store
      .getSnapshot()
      .state.invitations.find(
        (invitation) => invitation.email === 'rowan@example.invalid',
      )!;
    expect(created.status).toBe('outstanding');
    expect(view.getByText(/operation remains committed/i)).toBeVisible();
    const before = view.store.getSnapshot().state;
    const row = view.getByRole('row', { name: /rowan@example.invalid/ });
    await view.user.click(within(row).getByRole('button', { name: 'Resend' }));
    const state = view.store.getSnapshot().state;
    expect(
      state.invitations.find((i) => i.invitationId === created.invitationId)
        ?.status,
    ).toBe('superseded');
    const replacement = state.invitations.find(
      (i) => i.email === created.email && i.status === 'outstanding',
    )!;
    expect(replacement.invitationId).not.toBe(created.invitationId);
    expect(replacement.issuedAt).toBe(state.clock.now);
    expect(state.notifications.length).toBe(before.notifications.length + 1);
    await view.user.click(
      within(
        view.getByRole('row', { name: /rowan@example.invalid outstanding/ }),
      ).getByRole('button', { name: 'Revoke' }),
    );
    expect(
      view.store
        .getSnapshot()
        .state.invitations.find(
          (i) => i.invitationId === replacement.invitationId,
        )?.status,
    ).toBe('revoked');
  });

  it('rejects malformed and duplicate invites without mutation or cleared input', async () => {
    const view = renderWithDemoState(<MembersScreen />, { actor: staff });
    for (const email of [
      'not-an-email',
      'invitee@example.invalid',
      'maple@example.invalid',
    ]) {
      const before = view.store.getSnapshot();
      const input = view.getByLabelText('Invitation email');
      await view.user.clear(input);
      await view.user.type(input, email);
      await view.user.click(
        view.getByRole('button', { name: 'Create invitation' }),
      );
      expect(view.getAllByRole('alert').length).toBeGreaterThan(0);
      expect(view.store.getSnapshot()).toBe(before);
      expect(input).toHaveValue(email);
    }
  });

  it('corrects editable profile fields while preserving identity and every history link', async () => {
    const view = renderWithDemoState(<MembersScreen />, { actor: staff });
    const before = view.store.getSnapshot().state;
    await view.user.click(
      within(view.getByRole('row', { name: /Fictional Maple/ })).getByRole(
        'button',
        { name: 'Edit profile' },
      ),
    );
    await view.user.clear(view.getByLabelText('Member display name'));
    await view.user.type(
      view.getByLabelText('Member display name'),
      'Fictional Maple Revised',
    );
    await view.user.clear(view.getByLabelText('Verified profile email'));
    await view.user.type(
      view.getByLabelText('Verified profile email'),
      'maple-revised@example.invalid',
    );
    await view.user.type(
      view.getByLabelText('Contact email'),
      'contact@example.invalid',
    );
    await view.user.click(view.getByRole('button', { name: 'Save profile' }));
    const after = view.store.getSnapshot().state;
    expect(
      after.members.find((m) => m.memberId === ids.members.maple),
    ).toMatchObject({
      displayName: 'Fictional Maple Revised',
      verifiedEmail: 'maple-revised@example.invalid',
      contactEmail: 'contact@example.invalid',
      identitySubject: before.members.find(
        (m) => m.memberId === ids.members.maple,
      )!.identitySubject,
    });
    expect(after.bookings).toEqual(before.bookings);
    expect(after.waiverSignatures).toEqual(before.waiverSignatures);
    expect(after.attendance).toEqual(before.attendance);
    expect(view.queryByText(/identity:/)).not.toBeInTheDocument();
  });

  it('rejects profile corrections without mutation and can deny adult eligibility with retained bookings', async () => {
    const view = renderWithDemoState(<MembersScreen />, { actor: staff });
    await view.user.click(
      within(view.getByRole('row', { name: /Fictional Maple/ })).getByRole(
        'button',
        { name: 'Edit profile' },
      ),
    );
    await view.user.clear(view.getByLabelText('Member display name'));
    const before = view.store.getSnapshot();
    await view.user.click(view.getByRole('button', { name: 'Save profile' }));
    expect(view.store.getSnapshot()).toBe(before);
    expect(view.getByLabelText('Member display name')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await view.user.type(
      view.getByLabelText('Member display name'),
      'Fictional Maple',
    );
    await view.user.selectOptions(
      view.getByLabelText('Adult eligibility correction'),
      'denied',
    );
    await view.user.click(view.getByRole('button', { name: 'Save profile' }));
    const state = view.store.getSnapshot().state;
    expect(
      state.members.find((m) => m.memberId === ids.members.maple)?.status,
    ).toBe('inactive');
    expect(
      state.bookings.filter(
        (b) => b.memberId === ids.members.maple && b.status === 'booked',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reviewFlags: expect.arrayContaining(['memberInactive']),
        }),
      ]),
    );
    expect(state.attendance).toEqual(before.state.attendance);
  });

  it('validates adjustable adult-attestation corrections and retains the requested timestamp', async () => {
    const view = renderWithDemoState(<MembersScreen />, { actor: staff });
    await view.user.click(
      within(view.getByRole('row', { name: /Fictional Maple/ })).getByRole(
        'button',
        { name: 'Edit profile' },
      ),
    );
    const input = view.getByLabelText(
      'Adult attestation UTC timestamp correction',
    );
    for (const timestamp of [
      'invalid',
      '2026-02-30T15:00:00Z',
      '2030-10-01T15:00:00Z',
    ]) {
      await view.user.clear(input);
      await view.user.type(input, timestamp);
      const before = view.store.getSnapshot();
      await view.user.click(view.getByRole('button', { name: 'Save profile' }));
      expect(view.store.getSnapshot()).toBe(before);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveValue(timestamp);
    }
    await view.user.clear(input);
    await view.user.type(input, '2026-10-01T16:00:00Z');
    await view.user.selectOptions(
      view.getByLabelText('Adult eligibility correction'),
      'attested',
    );
    await view.user.click(view.getByRole('button', { name: 'Save profile' }));
    expect(
      view.store
        .getSnapshot()
        .state.members.find((m) => m.memberId === ids.members.maple),
    ).toMatchObject({
      adultEligibility: 'attested',
      adultAttestationAt: '2026-10-01T16:00:00Z',
    });
    await view.user.clear(input);
    await view.user.type(input, 'invalid');
    const beforeRejectedCorrection = view.store.getSnapshot();
    await view.user.click(view.getByRole('button', { name: 'Save profile' }));
    expect(view.store.getSnapshot()).toBe(beforeRejectedCorrection);
    expect(
      view.queryByText(
        'Profile corrected. Stable member ID, identity association, and linked history retained.',
      ),
    ).not.toBeInTheDocument();
  });

  it('enforces the exact active cap, permits pending resolution after deactivation, and preserves queues', async () => {
    const view = renderWithDemoState(<MembersScreen />, {
      scenarioId: SCENARIO_IDS.invitationMemberCap,
      actor: staff,
    });
    const pendingRow = view.getByRole('row', { name: /Fictional Fern/ });
    const before = view.store.getSnapshot();
    await view.user.click(
      within(pendingRow).getByRole('button', { name: 'Activate' }),
    );
    expect(view.store.getSnapshot()).toBe(before);
    expect(
      view.getByText('The active-member cap has been reached.'),
    ).toBeVisible();
    const mapleRow = view.getByRole('row', { name: /Fictional Maple/ });
    await view.user.click(
      within(mapleRow).getByRole('button', { name: 'Deactivate' }),
    );
    const deactivated = view.store.getSnapshot().state;
    expect(deactivated.waitlistEntries).toEqual(before.state.waitlistEntries);
    expect(
      deactivated.bookings
        .filter(
          (b) => b.memberId === ids.members.maple && b.status === 'booked',
        )
        .every((b) => b.reviewFlags.includes('memberInactive')),
    ).toBe(true);
    await view.user.click(
      within(pendingRow).getByRole('button', { name: 'Activate' }),
    );
    expect(
      view.store
        .getSnapshot()
        .state.members.find((m) => m.memberId === ids.members.fern)?.status,
    ).toBe('active');
    const full = view.store.getSnapshot();
    await view.user.click(
      within(view.getByRole('row', { name: /Fictional Maple/ })).getByRole(
        'button',
        { name: 'Activate' },
      ),
    );
    expect(view.store.getSnapshot()).toBe(full);
  });

  it('rejects activation with an outdated waiver and retains inactive queued records for staff review', async () => {
    const view = renderWithDemoState(<MembersScreen />, { actor: staff });
    const aspenRow = view.getByRole('row', { name: /Fictional Aspen/ });
    await view.user.click(
      within(aspenRow).getByRole('button', { name: 'Deactivate' }),
    );
    const before = view.store.getSnapshot();
    expect(
      before.state.waitlistEntries.find(
        (e) => e.entryId === ids.waitlist.aspen,
      ),
    ).toMatchObject({
      status: 'waiting',
      reviewFlags: expect.arrayContaining(['memberInactive']),
    });
    await view.user.click(
      within(aspenRow).getByRole('button', { name: 'Activate' }),
    );
    expect(view.store.getSnapshot()).toBe(before);
    expect(
      view.getByText(
        'A signature for the current published waiver is required.',
      ),
    ).toBeVisible();
  });
});

describe('complete local invitation acceptance', () => {
  it.each([
    [undefined, 'active'],
    [SCENARIO_IDS.invitationMemberCap, 'pending'],
  ] as const)(
    'accepts once with the current waiver and timestamp (%s)',
    async (scenarioId, status) => {
      const view = renderWithDemoState(<InvitationAcceptanceScreen />, {
        scenarioId,
        actor: invitee,
      });
      const before = view.store.getSnapshot().state;
      expect(view.getByText(/fictional.*non-legal/i)).toBeVisible();
      expect(view.getByText(/timestamp.*frozen/i)).toHaveTextContent(
        before.clock.now,
      );
      await fillAcceptance(view);
      await view.user.click(
        view.getByRole('button', { name: 'Complete acceptance' }),
      );
      const after = view.store.getSnapshot().state;
      expect(after.revision).toBe(before.revision + 1);
      const member = after.members.find(
        (m) => m.displayName === 'Fictional Rowan',
      )!;
      expect(member).toMatchObject({
        status,
        verifiedEmail: 'invitee@example.invalid',
        adultAttestationAt: before.clock.now,
      });
      expect(after.waiverSignatures).toHaveLength(
        before.waiverSignatures.length + 1,
      );
      expect(after.waiverSignatures.at(-1)).toMatchObject({
        memberId: member.memberId,
        typedName: 'Rowan Demo',
        signedAt: before.clock.now,
        waiverVersionId: before.currentWaiverVersionId,
      });
      expect(
        after.invitations.find(
          (i) => i.invitationId === ids.invitations.outstanding,
        )?.status,
      ).toBe('accepted');
      expect(view.getByRole('status')).toHaveTextContent(status);
      if (status === 'pending')
        expect(view.getByText(/cannot book or check in/i)).toBeVisible();
      expect(
        view.queryByRole('button', { name: 'Complete acceptance' }),
      ).not.toBeInTheDocument();
      expect(view.queryByText('maple@example.invalid')).not.toBeInTheDocument();
    },
  );

  it.each(['rejected', 'mismatched'])(
    'preserves the snapshot and filled inputs for %s identity',
    async (identity) => {
      const view = renderWithDemoState(<MembersScreen />, { actor: invitee });
      await fillAcceptance(view);
      await view.user.selectOptions(
        view.getByLabelText('Simulated identity outcome'),
        identity,
      );
      const before = view.store.getSnapshot();
      await view.user.click(
        view.getByRole('button', { name: 'Complete acceptance' }),
      );
      expect(view.store.getSnapshot()).toBe(before);
      expect(view.getByRole('alert')).toHaveTextContent(
        identity === 'rejected' ? /rejected/ : /match/,
      );
      expect(view.getByLabelText('Display name')).toHaveValue(
        'Fictional Rowan',
      );
      expect(view.getByLabelText('Typed signature')).toHaveValue('Rowan Demo');
      await view.user.selectOptions(
        view.getByLabelText('Simulated identity outcome'),
        'verified',
      );
      await view.user.click(
        view.getByRole('button', { name: 'Complete acceptance' }),
      );
      expect(view.store.getSnapshot().state.revision).toBe(
        before.state.revision + 1,
      );
    },
  );

  it('requires display name, explicit adult attestation, and a typed signature without partial acceptance', async () => {
    const view = renderWithDemoState(<MembersScreen />, { actor: invitee });
    const before = view.store.getSnapshot();
    const complete = view.getByRole('button', { name: 'Complete acceptance' });
    await view.user.click(complete);
    expect(view.store.getSnapshot()).toBe(before);
    expect(view.getByLabelText('Display name')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await view.user.type(
      view.getByLabelText('Display name'),
      'Fictional Rowan',
    );
    await view.user.click(complete);
    expect(
      view
        .getAllByRole('alert')
        .some((alert) => alert.textContent?.includes('adult attestation')),
    ).toBe(true);
    expect(view.store.getSnapshot()).toBe(before);
    await view.user.click(
      view.getByLabelText('I attest that I am at least 18'),
    );
    await view.user.click(complete);
    expect(view.getByLabelText('Typed signature')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(view.store.getSnapshot()).toBe(before);
  });

  it.each([
    ids.invitations.expired,
    ids.invitations.revoked,
    ids.invitations.superseded,
    ids.invitations.maple,
  ])(
    'does not permit acceptance of an unusable invitation %s',
    (invitationId) => {
      const view = renderWithDemoState(<InvitationAcceptanceScreen />, {
        actor: { kind: 'invitation', invitationId },
      });
      expect(view.getAllByRole('alert').length).toBeGreaterThan(0);
      expect(
        view.queryByRole('button', { name: 'Complete acceptance' }),
      ).not.toBeInTheDocument();
    },
  );

  it('requires the waiver actually displayed if another actor publishes a new version before completion', async () => {
    const view = renderWithDemoState(<MembersScreen />, { actor: invitee });
    await fillAcceptance(view);
    act(() => {
      expect(
        view.store.submit({
          type: 'selectActor',
          payload: { actor: { kind: 'staff', staffId: ids.staff.admin } },
        }).success,
      ).toBe(true);
      expect(
        view.store.submit({
          type: 'publishWaiver',
          payload: { waiverVersionId: ids.waivers.draft },
        }).success,
      ).toBe(true);
      expect(
        view.store.submit({ type: 'selectActor', payload: { actor: invitee } })
          .success,
      ).toBe(true);
    });
    expect(view.getByText(/Current waiver version 3/)).toBeVisible();
    expect(view.getByLabelText('Typed signature')).toHaveValue('');
    const beforeCompletion = view.store.getSnapshot();
    await view.user.click(
      view.getByRole('button', { name: 'Complete acceptance' }),
    );
    expect(view.store.getSnapshot()).toBe(beforeCompletion);
    await fillAcceptance(view);
    await view.user.click(
      view.getByRole('button', { name: 'Complete acceptance' }),
    );
    expect(
      view.store.getSnapshot().state.waiverSignatures.at(-1)?.waiverVersionId,
    ).toBe(ids.waivers.draft);
  });

  it('does not let staff accept on behalf of the selected invitee', () => {
    const view = renderWithDemoState(<InvitationAcceptanceScreen />, {
      actor: staff,
    });
    expect(view.getByRole('alert')).toHaveTextContent(
      /cannot accept on an invitee/,
    );
    expect(
      view.queryByRole('button', { name: 'Complete acceptance' }),
    ).not.toBeInTheDocument();
  });

  it('makes no provider request for adjustable invitation, identity, or signing flows', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    try {
      const view = renderWithDemoState(<MembersScreen />, { actor: staff });
      await view.user.type(
        view.getByLabelText('Invitation email'),
        'different@example.invalid',
      );
      await view.user.click(
        view.getByRole('button', { name: 'Create invitation' }),
      );
      const invitation = view.store
        .getSnapshot()
        .state.invitations.find(
          (i) => i.email === 'different@example.invalid',
        )!;
      selectActor(view, {
        kind: 'invitation',
        invitationId: invitation.invitationId,
      });
      await fillAcceptance(view);
      await view.user.click(
        view.getByRole('button', { name: 'Complete acceptance' }),
      );
      expect(
        view.store
          .getSnapshot()
          .state.members.find((m) => m.displayName === 'Fictional Rowan')
          ?.verifiedEmail,
      ).toBe('different@example.invalid');
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });

  it('keeps a cap-full accepted member unable to book or check in until staff resolves membership', async () => {
    const view = renderWithDemoState(<MembersScreen />, {
      scenarioId: SCENARIO_IDS.invitationMemberCap,
      actor: invitee,
    });
    await fillAcceptance(view);
    await view.user.click(
      view.getByRole('button', { name: 'Complete acceptance' }),
    );
    const member = view.store
      .getSnapshot()
      .state.members.find((m) => m.displayName === 'Fictional Rowan')!;
    selectActor(view, { kind: 'member', memberId: member.memberId });
    expect(view.getByText(/cannot book or check in/i)).toBeVisible();
    const before = view.store.getSnapshot();
    const rejected = view.store.submit({
      type: 'bookStation',
      payload: {
        memberId: member.memberId,
        classId: ids.classes.free,
        stationId: ids.stations.west,
      },
    });
    expect(rejected).toMatchObject({
      success: false,
      error: { reason: 'memberInactive' },
    });
    expect(view.store.getSnapshot()).toBe(before);
    expect(
      view.store.validate({
        type: 'checkIn',
        payload: { bookingId: ids.bookings.checkInMaple },
      }),
    ).toMatchObject({ success: false });
    expect(view.store.getSnapshot()).toBe(before);
  });
});

describe('role-scoped presentation and own signing', () => {
  it.each([ids.staff.admin, ids.staff.frontDesk, ids.staff.multiRole])(
    'offers management to authorized staff %s',
    (staffId) => {
      const view = renderWithDemoState(<MembersScreen />, {
        actor: { kind: 'staff', staffId },
      });
      expect(
        view.getByRole('button', { name: 'Create invitation' }),
      ).toBeVisible();
      expect(view.getByText(/simulated.*not for operations/i)).toBeVisible();
      expect(
        view.queryByLabelText(/password|credential/i),
      ).not.toBeInTheDocument();
    },
  );

  it('limits Coach to assigned roster name/status, with no contacts, invitations, or edit controls', () => {
    const view = renderWithDemoState(<MembersScreen />, {
      actor: { kind: 'staff', staffId: ids.staff.coach },
    });
    expect(
      view.queryByRole('button', { name: 'Create invitation' }),
    ).not.toBeInTheDocument();
    expect(
      view.queryByRole('button', { name: 'Edit profile' }),
    ).not.toBeInTheDocument();
    expect(view.container.textContent).not.toContain('@');
    expect(view.container.textContent).not.toContain('identity:');
    expect(view.queryByText('Fictional Fern')).not.toBeInTheDocument();
  });

  it('shows explicit inactive-staff denial with no directory or management controls', () => {
    const view = renderWithDemoState(<MembersScreen />, {
      actor: { kind: 'staff', staffId: ids.staff.inactive },
    });
    expect(view.getByRole('alert')).toHaveTextContent(/inactive/i);
    expect(view.queryByText('Fictional Maple')).not.toBeInTheDocument();
    expect(
      view.queryByRole('button', { name: 'Create invitation' }),
    ).not.toBeInTheDocument();
  });

  it.each([ids.members.fern, ids.members.moss])(
    'shows own pending/inactive gates, never another member',
    (memberId) => {
      const view = renderWithDemoState(<MembersScreen />, {
        actor: { kind: 'member', memberId },
      });
      expect(view.getByText(/cannot book or check in/i)).toBeVisible();
      expect(view.queryByText('Fictional Maple')).not.toBeInTheDocument();
      expect(
        view.queryByText('invitee@example.invalid'),
      ).not.toBeInTheDocument();
      expect(
        view.queryByRole('button', { name: 'Activate' }),
      ).not.toBeInTheDocument();
    },
  );

  it('lets a member sign their own current waiver without exposing any other signing evidence', async () => {
    const view = renderWithDemoState(<MembersScreen />, {
      actor: { kind: 'member', memberId: ids.members.aspen },
    });
    expect(view.getByText(/outdated/i)).toBeVisible();
    expect(view.queryByText('maple@example.invalid')).not.toBeInTheDocument();
    const before = view.store.getSnapshot();
    await view.user.click(
      view.getByRole('button', { name: 'Sign current waiver' }),
    );
    expect(view.store.getSnapshot()).toBe(before);
    expect(view.getByLabelText('Typed signature')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await view.user.type(view.getByLabelText('Typed signature'), 'Aspen Demo');
    await view.user.click(
      view.getByRole('button', { name: 'Sign current waiver' }),
    );
    expect(
      view.store.getSnapshot().state.waiverSignatures.at(-1),
    ).toMatchObject({
      memberId: ids.members.aspen,
      typedName: 'Aspen Demo',
      signedAt: before.state.clock.now,
    });
    expect(view.getByText('Waiver: current')).toBeVisible();
  });

  it('clears persona-specific drafts and success when the shell changes actor', async () => {
    const view = renderWithDemoState(<MembersScreen />, { actor: invitee });
    await fillAcceptance(view);
    selectActor(view, { kind: 'member', memberId: ids.members.maple });
    expect(view.queryByDisplayValue('Fictional Rowan')).not.toBeInTheDocument();
    expect(view.queryByText('invitee@example.invalid')).not.toBeInTheDocument();
    selectActor(view, invitee);
    expect(view.getByLabelText('Display name')).toHaveValue('');
  });

  it('clears staff feedback and drafts when the shell resets the same scenario and actor', async () => {
    const view = renderWithDemoState(<MembersScreen />, {
      actor: { kind: 'staff', staffId: ids.staff.admin },
    });
    await view.user.type(
      view.getByLabelText('Invitation email'),
      'rowan@example.invalid',
    );
    await view.user.click(
      view.getByRole('button', { name: 'Create invitation' }),
    );
    expect(
      view.getByText('Invitation created in local demo state.'),
    ).toBeVisible();
    await view.user.type(
      view.getByLabelText('Invitation email'),
      'unsaved@example.invalid',
    );
    act(() => {
      expect(view.store.resetDemo({ confirmed: true }).success).toBe(true);
    });
    expect(
      view.queryByText('Invitation created in local demo state.'),
    ).not.toBeInTheDocument();
    expect(view.getByLabelText('Invitation email')).toHaveValue('');
  });

  it('clears completed acceptance after reloading the same invitation scenario', async () => {
    const view = renderWithDemoState(<InvitationAcceptanceScreen />, {
      scenarioId: SCENARIO_IDS.invitationMemberCap,
      actor: invitee,
    });
    await fillAcceptance(view);
    await view.user.click(
      view.getByRole('button', { name: 'Complete acceptance' }),
    );
    expect(view.getByRole('status')).toHaveTextContent('pending');
    act(() => {
      expect(
        view.store.loadScenario(SCENARIO_IDS.invitationMemberCap, {
          confirmed: true,
        }).success,
      ).toBe(true);
    });
    expect(view.queryByRole('status')).not.toBeInTheDocument();
    expect(view.getByLabelText('Display name')).toHaveValue('');
    expect(
      view.getByRole('button', { name: 'Complete acceptance' }),
    ).toBeVisible();
  });
});
