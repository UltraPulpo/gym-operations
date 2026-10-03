import { act, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DemoActor } from '../domain';
import { createInitialDemoState, FIXTURE_IDS } from '../demo-fixtures';
import { getScenarios, SCENARIO_IDS } from '../demo-scenarios';
import { useDemoState } from '../demo-state';
import { createDemoTestState, renderWithDemoState } from './index';

function Consumer({ label = 'Demo' }: { readonly label?: string }) {
  const demo = useDemoState();
  return (
    <section aria-label={label}>
      <output aria-label="Actor">{JSON.stringify(demo.activeActor)}</output>
      <output aria-label="Scenario">{demo.state.scenarioId}</output>
      <output aria-label="Delivery">{demo.state.simulation.delivery}</output>
      <output aria-label="Revision">{demo.revision}</output>
      <button
        onClick={() =>
          demo.submit({
            type: 'setSimulation',
            payload: { delivery: 'failure' },
          })
        }
      >
        Fail delivery
      </button>
    </section>
  );
}

describe('createDemoTestState', () => {
  it('creates fresh default fixtures without duplicating fixture records', () => {
    const first = createDemoTestState();
    const second = createDemoTestState();

    expect(first).toEqual(createInitialDemoState());
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.members).not.toBe(first.members);
    expect(second.members[0]).not.toBe(first.members[0]);
    expect(second.layout).not.toBe(first.layout);
  });

  it.each(getScenarios())(
    'uses the snapshot, actor and frozen clock for $name',
    (scenario) => {
      const first = createDemoTestState({
        scenarioId: scenario.scenarioId,
      });
      const second = createDemoTestState({
        scenarioId: scenario.scenarioId,
      });

      expect(first).toEqual(scenario.snapshot);
      expect(first.activeActor).toEqual(scenario.defaultActor);
      expect(first.clock.now).toBe(scenario.clockInstant);
      expect(second).toEqual(first);
      expect(second).not.toBe(first);
      expect(second.classes).not.toBe(first.classes);
      expect(second.weeklyTemplates[0]?.entries).not.toBe(
        first.weeklyTemplates[0]?.entries,
      );
    },
  );

  it.each<DemoActor>([
    { kind: 'staff', staffId: FIXTURE_IDS.staff.frontDesk },
    { kind: 'staff', staffId: FIXTURE_IDS.staff.coach },
    { kind: 'staff', staffId: FIXTURE_IDS.staff.multiRole },
    { kind: 'staff', staffId: FIXTURE_IDS.staff.inactive },
    { kind: 'member', memberId: FIXTURE_IDS.members.willow },
    {
      kind: 'invitation',
      invitationId: FIXTURE_IDS.invitations.outstanding,
    },
  ])('sets an existing $kind actor without recording an edit', (actor) => {
    const state = createDemoTestState({
      scenarioId: SCENARIO_IDS.capacityWaitlist,
      actor,
    });

    expect(state.activeActor).toEqual(actor);
    expect(state.activeActor).not.toBe(actor);
    expect(state.revision).toBe(0);
    expect(state.scenarioId).toBe(SCENARIO_IDS.capacityWaitlist);
  });

  it('reports an unknown scenario explicitly instead of falling back', () => {
    expect(() =>
      createDemoTestState({ scenarioId: 'scenario:missing' }),
    ).toThrow(/scenario:missing.*unavailable/i);
  });

  it.each<DemoActor>([
    { kind: 'staff', staffId: 'staff:missing' },
    { kind: 'member', memberId: 'member:missing' },
    { kind: 'invitation', invitationId: 'invitation:missing' },
  ])('reports an unknown $kind actor explicitly', (actor) => {
    expect(() => createDemoTestState({ actor })).toThrow(/actor.*unavailable/i);
  });
});

describe('renderWithDemoState', () => {
  it('renders a default fresh store and exposes real user interactions', async () => {
    const view = renderWithDemoState(<Consumer />);

    expect(view.store.getSnapshot()).toEqual({
      state: createInitialDemoState(),
      hasUnsavedEdits: false,
      workspaceVersion: 0,
    });
    expect(view.getByLabelText('Delivery')).toHaveTextContent('success');

    await view.user.click(view.getByRole('button', { name: 'Fail delivery' }));

    expect(view.getByLabelText('Delivery')).toHaveTextContent('failure');
    expect(view.getByLabelText('Revision')).toHaveTextContent('1');
    expect(view.store.getSnapshot().state.simulation.delivery).toBe('failure');
    expect(view.store.getSnapshot().hasUnsavedEdits).toBe(true);
  });

  it('renders the selected scenario and actor as pristine setup', () => {
    const actor: DemoActor = {
      kind: 'staff',
      staffId: FIXTURE_IDS.staff.frontDesk,
    };
    const view = renderWithDemoState(<Consumer />, {
      scenarioId: SCENARIO_IDS.layoutUnavailable,
      actor,
    });

    expect(view.getByLabelText('Actor')).toHaveTextContent(
      JSON.stringify(actor),
    );
    expect(view.getByLabelText('Scenario')).toHaveTextContent(
      SCENARIO_IDS.layoutUnavailable,
    );
    expect(view.store.getSnapshot().state.layout.availability).toBe(
      'unavailable',
    );
    expect(view.store.getSnapshot().hasUnsavedEdits).toBe(false);
  });

  it('exposes the same store consumed by the UI for accepted and rejected actions', () => {
    const view = renderWithDemoState(<Consumer />);

    act(() => {
      expect(
        view.store.submit({
          type: 'setSimulation',
          payload: { delivery: 'failure' },
        }).success,
      ).toBe(true);
    });
    expect(view.getByLabelText('Delivery')).toHaveTextContent('failure');
    const before = view.store.getSnapshot();
    expect(
      view.store.submit({
        type: 'bookStation',
        payload: {
          memberId: FIXTURE_IDS.members.maple,
          classId: FIXTURE_IDS.classes.free,
          stationId: FIXTURE_IDS.stations.east,
        },
      }),
    ).toMatchObject({
      success: false,
      error: { reason: 'roleDenied' },
    });
    expect(view.store.getSnapshot()).toBe(before);
    expect(view.getByLabelText('Revision')).toHaveTextContent('1');
  });

  it('isolates simultaneous renders and new renders after unmount', async () => {
    const first = renderWithDemoState(<Consumer />);
    const second = renderWithDemoState(<Consumer />);
    const firstQueries = within(first.container);
    const secondQueries = within(second.container);
    expect(first.store).not.toBe(second.store);
    expect(first.user).not.toBe(second.user);
    expect(first.store.getSnapshot().state.members).not.toBe(
      second.store.getSnapshot().state.members,
    );

    await first.user.click(
      firstQueries.getByRole('button', { name: 'Fail delivery' }),
    );

    expect(firstQueries.getByLabelText('Delivery')).toHaveTextContent(
      'failure',
    );
    expect(secondQueries.getByLabelText('Delivery')).toHaveTextContent(
      'success',
    );
    expect(second.store.getSnapshot().state.revision).toBe(0);
    first.unmount();
    const third = renderWithDemoState(<Consumer />);
    expect(third.store.getSnapshot().state).toEqual(createInitialDemoState());
    expect(
      within(third.container).getByLabelText('Delivery'),
    ).toHaveTextContent('success');
  });

  it('preserves its store on rerender and forwards render options', async () => {
    const view = renderWithDemoState(<Consumer />, {
      container: document.body.appendChild(document.createElement('div')),
    });
    await view.user.click(view.getByRole('button', { name: 'Fail delivery' }));
    const snapshot = view.store.getSnapshot();

    view.rerender(<Consumer label="Updated" />);

    expect(view.getByRole('region', { name: 'Updated' })).toBeInTheDocument();
    expect(view.store.getSnapshot()).toBe(snapshot);
    expect(view.getByLabelText('Delivery')).toHaveTextContent('failure');
  });

  it('uses real reset semantics: confirmation, fresh baseline actor and data', async () => {
    const view = renderWithDemoState(<Consumer />, {
      scenarioId: SCENARIO_IDS.layoutUnavailable,
      actor: { kind: 'member', memberId: FIXTURE_IDS.members.willow },
    });
    const initial = view.store.getSnapshot().state;
    await view.user.click(view.getByRole('button', { name: 'Fail delivery' }));
    const edited = view.store.getSnapshot();
    expect(view.store.resetDemo()).toMatchObject({
      success: false,
      error: { reason: 'confirmationRequired' },
    });
    expect(view.store.getSnapshot()).toBe(edited);

    act(() => {
      expect(view.store.resetDemo({ confirmed: true }).success).toBe(true);
    });

    const reset = view.store.getSnapshot();
    const baseline = createInitialDemoState();
    expect(reset.state).toEqual({
      ...baseline,
      revision: edited.state.revision + 1,
    });
    expect(reset.state.members).not.toBe(initial.members);
    expect(reset.hasUnsavedEdits).toBe(false);
    expect(view.getByLabelText('Actor')).toHaveTextContent(
      JSON.stringify(baseline.activeActor),
    );
    expect(view.getByLabelText('Scenario')).toHaveTextContent(
      SCENARIO_IDS.baseline,
    );
    expect(view.getByLabelText('Delivery')).toHaveTextContent('success');
  });

  it('rejects an unknown render scenario before mounting a component', () => {
    const mounted = vi.fn();
    function Probe() {
      mounted();
      return null;
    }
    expect(() =>
      renderWithDemoState(<Probe />, { scenarioId: 'scenario:missing' }),
    ).toThrow(/scenario:missing.*unavailable/i);
    expect(mounted).not.toHaveBeenCalled();
  });

  it('does not access browser storage or contact external services', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    const clear = vi.spyOn(Storage.prototype, 'clear');
    const fetch = vi.spyOn(globalThis, 'fetch');
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const view = renderWithDemoState(<Consumer />);
    await view.user.click(view.getByRole('button', { name: 'Fail delivery' }));
    act(() => {
      expect(view.store.resetDemo({ confirmed: true }).success).toBe(true);
    });
    view.unmount();

    for (const spy of [getItem, setItem, removeItem, clear, fetch, xhr]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
