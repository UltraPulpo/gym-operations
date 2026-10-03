import { act, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FIXTURE_IDS as ids } from '../../demo-fixtures';
import { SCENARIO_IDS } from '../../demo-scenarios';
import type { DemoAction, DemoActor } from '../../domain';
import { renderWithDemoState } from '../../test-support';
import { WaiversScreen } from './index';

const admin: DemoActor = { kind: 'staff', staffId: ids.staff.admin };
const cedar: DemoActor = { kind: 'member', memberId: ids.members.cedar };

function renderWaivers(actor: DemoActor = admin) {
  return renderWithDemoState(<WaiversScreen />, { actor });
}

async function createDraft(view: ReturnType<typeof renderWaivers>) {
  await view.user.clear(view.getByLabelText('Version number'));
  await view.user.type(view.getByLabelText('Version number'), '4');
  await view.user.type(
    view.getByLabelText('Waiver text'),
    'Fictional version four. Non-legal demonstration only.',
  );
  await view.user.click(view.getByRole('button', { name: 'Create draft' }));
}

function submit(view: ReturnType<typeof renderWaivers>, action: DemoAction) {
  let result: ReturnType<typeof view.store.submit>;
  act(() => {
    result = view.store.submit(action);
  });
  return result!;
}

describe('waiver screens', () => {
  it('creates a draft and confirms publication without altering bookings or signatures', async () => {
    const view = renderWaivers();
    const before = view.store.getSnapshot().state;
    expect(view.getByText(/not legal evidence/i)).toBeVisible();
    await createDraft(view);
    const draft = view.store
      .getSnapshot()
      .state.waivers.find((waiver) => waiver.version === 4);
    expect(draft).toMatchObject({
      status: 'draft',
      createdAt: before.clock.now,
      text: 'Fictional version four. Non-legal demonstration only.',
    });
    expect(view.store.getSnapshot().state.currentWaiverVersionId).toBe(
      ids.waivers.current,
    );
    await view.user.click(
      view.getByRole('button', { name: 'Publish version 4' }),
    );
    const dialog = view.getByRole('alertdialog', {
      name: 'Publish waiver?',
    });
    expect(
      within(dialog).getByText(/existing bookings and signatures remain/i),
    ).toBeVisible();
    await view.user.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );
    expect(view.store.getSnapshot().state.currentWaiverVersionId).toBe(
      ids.waivers.current,
    );
    await view.user.click(
      view.getByRole('button', { name: 'Publish version 4' }),
    );
    await view.user.click(
      within(view.getByRole('alertdialog')).getByRole('button', {
        name: 'Publish version',
      }),
    );
    const after = view.store.getSnapshot().state;
    expect(after.currentWaiverVersionId).toBe(draft?.waiverVersionId);
    expect(after.waivers.find((waiver) => waiver.version === 4)).toMatchObject({
      status: 'published',
      publishedAt: before.clock.now,
    });
    expect(after.bookings).toEqual(before.bookings);
    expect(after.waiverSignatures).toEqual(before.waiverSignatures);
    expect(view.getByText('Published waiver version 4.')).toBeVisible();
    expect(
      view.queryByRole('button', { name: 'Publish version 4' }),
    ).not.toBeInTheDocument();
  });

  it('reports blank text and invalid or duplicate versions without clearing inputs or mutating state', async () => {
    const view = renderWaivers();
    const before = view.store.getSnapshot();
    await view.user.click(view.getByRole('button', { name: 'Create draft' }));
    expect(view.getByLabelText('Waiver text')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(view.store.getSnapshot()).toBe(before);
    await view.user.type(view.getByLabelText('Waiver text'), 'Fictional draft');
    await view.user.clear(view.getByLabelText('Version number'));
    await view.user.type(view.getByLabelText('Version number'), '1.5');
    await view.user.click(view.getByRole('button', { name: 'Create draft' }));
    expect(view.getByLabelText('Version number')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await view.user.clear(view.getByLabelText('Version number'));
    await view.user.type(view.getByLabelText('Version number'), '2');
    await view.user.click(view.getByRole('button', { name: 'Create draft' }));
    expect(view.getByLabelText('Waiver text')).toHaveValue('Fictional draft');
    expect(
      view
        .getAllByRole('alert')
        .some((alert) => /unique/i.test(alert.textContent ?? '')),
    ).toBe(true);
    expect(view.store.getSnapshot()).toBe(before);
  });

  it('rejects publication of an older draft and preserves all state', async () => {
    const view = renderWaivers();
    await view.user.clear(view.getByLabelText('Version number'));
    await view.user.type(view.getByLabelText('Version number'), '4');
    await view.user.type(
      view.getByLabelText('Waiver text'),
      'Fictional newer marker',
    );
    await view.user.click(view.getByRole('button', { name: 'Create draft' }));
    await view.user.click(
      view.getByRole('button', { name: 'Publish version 4' }),
    );
    await view.user.click(
      within(view.getByRole('alertdialog')).getByRole('button', {
        name: 'Publish version',
      }),
    );
    const before = view.store.getSnapshot();
    await view.user.click(
      view.getByRole('button', { name: 'Publish version 3' }),
    );
    expect(
      view
        .getAllByRole('alert')
        .some((alert) =>
          /newer than all published/i.test(alert.textContent ?? ''),
        ),
    ).toBe(true);
    expect(view.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(view.store.getSnapshot()).toBe(before);
  });

  it('shows only the selected member, preserves old evidence, and confirms a typed-name signature with virtual time', async () => {
    const view = renderWithDemoState(<WaiversScreen />, {
      scenarioId: SCENARIO_IDS.waiverAttendance,
    });
    const before = view.store.getSnapshot().state;
    expect(view.getByText('Outdated signature')).toBeVisible();
    expect(
      view.getByRole('table', { name: 'Signature history' }),
    ).toHaveTextContent('Version 1');
    expect(
      view.getByRole('table', { name: 'Existing demo bookings' }),
    ).toHaveTextContent(ids.classes.free);
    expect(view.queryByText('Maya Chen')).not.toBeInTheDocument();
    expect(view.queryByLabelText('Member to inspect')).not.toBeInTheDocument();
    await view.user.type(view.getByLabelText('Typed name'), 'Casey Park');
    await view.user.click(
      view.getByRole('button', { name: 'Sign current waiver' }),
    );
    await view.user.click(
      within(view.getByRole('alertdialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(view.store.getSnapshot().state.waiverSignatures).toEqual(
      before.waiverSignatures,
    );
    expect(view.getByLabelText('Typed name')).toHaveValue('Casey Park');
    await view.user.click(
      view.getByRole('button', { name: 'Sign current waiver' }),
    );
    await view.user.click(
      within(view.getByRole('alertdialog')).getByRole('button', {
        name: 'Record simulated signature',
      }),
    );
    expect(view.store.getSnapshot().state.waiverSignatures).toEqual([
      ...before.waiverSignatures,
      expect.objectContaining({
        memberId: ids.members.aspen,
        waiverVersionId: ids.waivers.current,
        typedName: 'Casey Park',
        signedAt: before.clock.now,
      }),
    ]);
    expect(view.getByText('Current signature')).toBeVisible();
    const history = view.getByRole('table', {
      name: 'Signature history',
    });
    expect(history).toHaveTextContent('Version 1');
    expect(history).toHaveTextContent('Version 2');
    expect(history).toHaveTextContent(before.clock.now);
    expect(
      view.queryByRole('button', { name: 'Sign current waiver' }),
    ).not.toBeInTheDocument();
  });

  it('rejects a whitespace signature with an accessible field error and no state changes', async () => {
    const view = renderWaivers({ kind: 'member', memberId: ids.members.aspen });
    const before = view.store.getSnapshot();
    await view.user.type(view.getByLabelText('Typed name'), '   ');
    await view.user.click(
      view.getByRole('button', { name: 'Sign current waiver' }),
    );
    expect(view.getByLabelText('Typed name')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(view.getByLabelText('Typed name')).toHaveAccessibleDescription(
      /enter a typed name/i,
    );
    expect(view.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(view.store.getSnapshot()).toBe(before);
  });

  it('lets front desk inspect old and current signatures but not publish or sign for a member', async () => {
    const view = renderWaivers({ kind: 'staff', staffId: ids.staff.frontDesk });
    await view.user.selectOptions(
      view.getByLabelText('Member to inspect'),
      ids.members.maple,
    );
    const history = view.getByRole('table', {
      name: 'Signature history',
    });
    expect(history).toHaveTextContent('Version 1');
    expect(history).toHaveTextContent('Version 2');
    expect(history).toHaveTextContent('Maya Chen');
    expect(history).toHaveTextContent('2026-10-04T18:00:00Z');
    expect(view.getByText('Current signature')).toBeVisible();
    await view.user.selectOptions(
      view.getByLabelText('Member to inspect'),
      ids.members.aspen,
    );
    expect(view.getByText('Outdated signature')).toBeVisible();
    expect(
      view.queryByRole('button', { name: /publish version/i }),
    ).not.toBeInTheDocument();
    expect(view.queryByLabelText('Typed name')).not.toBeInTheDocument();
  });

  it('limits coach inspection to members and bookings on assigned classes', async () => {
    const view = renderWaivers({ kind: 'staff', staffId: ids.staff.coach });
    const select = view.getByLabelText('Member to inspect');
    expect(
      within(select).getByRole('option', { name: 'Maya Chen' }),
    ).toBeInTheDocument();
    expect(
      within(select).queryByRole('option', { name: 'Casey Park' }),
    ).not.toBeInTheDocument();
    expect(view.queryByLabelText('Waiver text')).not.toBeInTheDocument();
    await view.user.selectOptions(select, ids.members.maple);
    const bookings = view.getByRole('table', {
      name: 'Existing demo bookings',
    });
    expect(bookings).toHaveTextContent(ids.classes.checkIn);
    expect(bookings).not.toHaveTextContent(ids.classes.full);
  });

  it('explains invitation-persona restrictions rather than exposing member evidence', () => {
    const view = renderWaivers({
      kind: 'invitation',
      invitationId: ids.invitations.outstanding,
    });
    expect(
      view.getByText(/use the invitation acceptance workflow/i),
    ).toBeVisible();
    expect(view.queryByRole('table')).not.toBeInTheDocument();
    expect(view.queryByLabelText('Typed name')).not.toBeInTheDocument();
  });

  it('blocks booking and check-in after publication, then restores both gates after the member signs', async () => {
    const view = renderWaivers();
    const before = view.store.getSnapshot().state;
    await view.user.click(
      view.getByRole('button', { name: 'Publish version 3' }),
    );
    await view.user.click(
      within(view.getByRole('alertdialog')).getByRole('button', {
        name: 'Publish version',
      }),
    );
    expect(view.store.getSnapshot().state.bookings).toEqual(before.bookings);
    expect(view.store.getSnapshot().state.waiverSignatures).toEqual(
      before.waiverSignatures,
    );
    expect(
      submit(view, { type: 'selectActor', payload: { actor: cedar } }).success,
    ).toBe(true);
    expect(view.getByText('Outdated signature')).toBeVisible();
    expect(
      view.getByText(/new bookings and check-in are blocked/i),
    ).toBeVisible();
    const booking: DemoAction = {
      type: 'bookStation',
      payload: {
        memberId: ids.members.cedar,
        classId: ids.classes.free,
        stationId: ids.stations.west,
      },
    };
    const checkIn: DemoAction = {
      type: 'checkIn',
      payload: { bookingId: ids.bookings.checkInCedar },
    };
    const rejected = view.store.getSnapshot();
    for (const action of [booking, checkIn]) {
      expect(submit(view, action)).toMatchObject({
        success: false,
        error: { category: 'IneligibleDemoAction', reason: 'waiverOutdated' },
      });
      expect(view.store.getSnapshot()).toBe(rejected);
    }
    await view.user.type(view.getByLabelText('Typed name'), 'Jordan Brooks');
    await view.user.click(
      view.getByRole('button', { name: 'Sign current waiver' }),
    );
    await view.user.click(
      within(view.getByRole('alertdialog')).getByRole('button', {
        name: 'Record simulated signature',
      }),
    );
    expect(
      view.getByText(/waiver requirement met; other eligibility/i),
    ).toBeVisible();
    expect(submit(view, booking)).toMatchObject({ success: true });
    expect(submit(view, checkIn)).toMatchObject({ success: true });
  });

  it('reports a stale publication confirmation rather than publishing against changed state', async () => {
    const view = renderWaivers();
    await view.user.click(
      view.getByRole('button', { name: 'Publish version 3' }),
    );
    expect(
      submit(view, {
        type: 'advanceClock',
        payload: { to: '2026-10-05T15:46:00Z' },
      }).success,
    ).toBe(true);
    const before = view.store.getSnapshot();
    await view.user.click(
      within(view.getByRole('alertdialog')).getByRole('button', {
        name: 'Publish version',
      }),
    );
    expect(
      view
        .getAllByRole('alert')
        .some((alert) => /state changed/i.test(alert.textContent ?? '')),
    ).toBe(true);
    expect(view.store.getSnapshot()).toBe(before);
  });

  it('rejects a stale signature confirmation and retains the typed input for retry', async () => {
    const view = renderWaivers({ kind: 'member', memberId: ids.members.aspen });
    await view.user.type(view.getByLabelText('Typed name'), 'Casey Park');
    await view.user.click(
      view.getByRole('button', { name: 'Sign current waiver' }),
    );
    expect(
      submit(view, {
        type: 'advanceClock',
        payload: { to: '2026-10-05T15:46:00Z' },
      }),
    ).toMatchObject({ success: true });
    const before = view.store.getSnapshot();
    await view.user.click(
      within(view.getByRole('alertdialog')).getByRole('button', {
        name: 'Record simulated signature',
      }),
    );
    expect(
      view
        .getAllByRole('alert')
        .some((alert) => /state changed/i.test(alert.textContent ?? '')),
    ).toBe(true);
    expect(view.store.getSnapshot()).toBe(before);
    expect(view.getByLabelText('Typed name')).toHaveValue('Casey Park');
    await view.user.click(
      view.getByRole('button', { name: 'Sign current waiver' }),
    );
    await view.user.click(
      within(view.getByRole('alertdialog')).getByRole('button', {
        name: 'Record simulated signature',
      }),
    );
    expect(view.store.getSnapshot().state.waiverSignatures).toContainEqual(
      expect.objectContaining({
        memberId: ids.members.aspen,
        signedAt: '2026-10-05T15:46:00Z',
      }),
    );
  });

  it('clears publication success and refreshes drafts when the same scenario is reloaded', async () => {
    const view = renderWaivers();
    const scenarioId = view.store.getSnapshot().state.scenarioId;
    await view.user.click(
      view.getByRole('button', { name: 'Publish version 3' }),
    );
    await view.user.click(
      within(view.getByRole('alertdialog')).getByRole('button', {
        name: 'Publish version',
      }),
    );
    expect(view.getByText('Published waiver version 3.')).toBeVisible();

    await view.user.clear(view.getByLabelText('Version number'));
    await view.user.type(view.getByLabelText('Version number'), '99');
    await view.user.type(
      view.getByLabelText('Waiver text'),
      'Unpublished local draft',
    );
    act(() => {
      view.store.loadScenario(scenarioId, { confirmed: true });
    });

    expect(view.store.getSnapshot().state.scenarioId).toBe(scenarioId);
    expect(view.store.getSnapshot().state.activeActor).toEqual(admin);
    expect(view.store.getSnapshot().state.currentWaiverVersionId).toBe(
      ids.waivers.current,
    );
    expect(
      view.queryByText('Published waiver version 3.'),
    ).not.toBeInTheDocument();
    expect(view.getByLabelText('Version number')).toHaveValue(4);
    expect(view.getByLabelText('Waiver text')).toHaveValue('');
  });

  it('discards pending publication and draft fields when the same scenario is reloaded', async () => {
    const view = renderWaivers();
    const scenarioId = view.store.getSnapshot().state.scenarioId;
    await view.user.clear(view.getByLabelText('Version number'));
    await view.user.type(view.getByLabelText('Version number'), '99');
    await view.user.type(
      view.getByLabelText('Waiver text'),
      'Draft that must be discarded',
    );
    await view.user.click(
      view.getByRole('button', { name: 'Publish version 3' }),
    );
    expect(view.getByRole('alertdialog')).toBeVisible();

    act(() => {
      view.store.loadScenario(scenarioId, { confirmed: true });
    });

    expect(view.store.getSnapshot().state.scenarioId).toBe(scenarioId);
    expect(view.store.getSnapshot().state.activeActor).toEqual(admin);
    expect(view.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(view.getByLabelText('Version number')).toHaveValue(4);
    expect(view.getByLabelText('Waiver text')).toHaveValue('');
  });

  it('rejects non-admin publication and signing for another member at the actual store boundary', () => {
    const view = renderWaivers({ kind: 'staff', staffId: ids.staff.frontDesk });
    const before = view.store.getSnapshot();
    expect(
      submit(view, {
        type: 'publishWaiver',
        payload: { waiverVersionId: ids.waivers.draft },
      }),
    ).toMatchObject({ success: false, error: { reason: 'roleDenied' } });
    expect(view.store.getSnapshot()).toBe(before);
    expect(
      submit(view, {
        type: 'selectActor',
        payload: { actor: { kind: 'member', memberId: ids.members.aspen } },
      }),
    ).toMatchObject({ success: true });
    const memberBefore = view.store.getSnapshot();
    expect(
      submit(view, {
        type: 'signWaiver',
        payload: {
          memberId: ids.members.cedar,
          waiverVersionId: ids.waivers.current,
          typedName: 'Jordan Brooks',
          signatureId: 'signature:unauthorized-demo',
        },
      }),
    ).toMatchObject({ success: false, error: { reason: 'roleDenied' } });
    expect(view.store.getSnapshot()).toBe(memberBefore);
    expect(view.queryByText('Jordan Brooks')).not.toBeInTheDocument();
  });
});
