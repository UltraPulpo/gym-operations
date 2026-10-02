import { describe, expect, it, vi } from 'vitest';
import { FIXTURE_IDS as ids, createInitialDemoState } from '../demo-fixtures';
import { SCENARIO_IDS } from '../demo-scenarios';
import { DemoReducerError } from './reducer';
import { createDemoStore } from './store';
import { setClockPresetAction } from './clock';
import { expectSuccess, withActor } from './test-helpers';

describe('demo-state store', () => {
  it.each(['success', 'failure'] as const)(
    'commits full-class cancellation and all six notifications despite delivery %s',
    (delivery) => {
      const initial = createInitialDemoState();
      const state = {
        ...initial,
        simulation: { ...initial.simulation, delivery },
      };
      const store = createDemoStore(state);
      const before = store.getSnapshot();
      const activeBookings = before.state.bookings.filter(
        (booking) =>
          booking.classId === ids.classes.full && booking.status === 'booked',
      );
      const activeWaiters = before.state.waitlistEntries.filter(
        (entry) =>
          entry.classId === ids.classes.full && entry.status === 'waiting',
      );
      const listener = vi.fn();
      store.subscribe(listener);
      expectSuccess(
        store.submit({
          type: 'cancelClass',
          payload: {
            classId: ids.classes.full,
            reason: 'Fictional room closure',
          },
        }),
      );
      const after = store.getSnapshot().state;
      expect(after.bookings).toEqual(
        before.state.bookings.map((booking) =>
          activeBookings.includes(booking)
            ? {
                ...booking,
                status: 'cancelled',
                cancelledAt: before.state.clock.now,
                cancellationReason: 'classCancelled',
              }
            : booking,
        ),
      );
      expect(after.waitlistEntries).toEqual(
        before.state.waitlistEntries.map((entry) =>
          activeWaiters.includes(entry)
            ? {
                ...entry,
                status: 'cancelled',
                cancelledAt: before.state.clock.now,
                reason: 'classCancelled',
              }
            : entry,
        ),
      );
      expect(
        after.notifications.slice(before.state.notifications.length),
      ).toEqual(
        expect.arrayContaining(
          [
            ids.members.maple,
            ids.members.cedar,
            ids.members.birch,
            ids.members.moss,
            ids.members.aspen,
            ids.members.willow,
          ].map((memberId) =>
            expect.objectContaining({
              event: { type: 'classCancelled', classId: ids.classes.full },
              recipient: expect.objectContaining({ memberId }),
              status: delivery === 'success' ? 'sent' : 'failed',
            }),
          ),
        ),
      );
      expect(after.notifications).toHaveLength(
        before.state.notifications.length + 6,
      );
      expect(
        after.classes.find((item) => item.classId === ids.classes.full),
      ).toMatchObject({ status: 'cancelled' });
      for (const booking of activeBookings) {
        expect(
          after.bookings.find((item) => item.bookingId === booking.bookingId),
        ).toMatchObject({
          status: 'cancelled',
          cancellationReason: 'classCancelled',
        });
        expect(
          after.attendance.find(
            (item) => item.attendanceId === booking.attendanceRecordId,
          ),
        ).toMatchObject({ currentOutcome: 'cancelled' });
      }
      for (const entry of activeWaiters) {
        expect(
          after.waitlistEntries.find((item) => item.entryId === entry.entryId),
        ).toMatchObject({
          status: 'cancelled',
          reason: 'classCancelled',
          reviewFlags: entry.reviewFlags,
        });
      }
      expect(after.bookings).toHaveLength(before.state.bookings.length);
      expect(after.attendance).toHaveLength(before.state.attendance.length);
      expect(
        after.notifications.slice(0, before.state.notifications.length),
      ).toEqual(before.state.notifications);
      expect(after.revision).toBe(before.state.revision + 1);
      expect(listener).toHaveBeenCalledOnce();
      expect(before.state).toEqual(state);
      const cancelledClass = after.classes.find(
        (item) => item.classId === ids.classes.full,
      )!;
      expectSuccess(store.advanceClock(cancelledClass.endsAt));
      expect(
        store
          .getSnapshot()
          .state.attendance.filter(
            (record) => record.classId === ids.classes.full,
          ),
      ).toEqual(
        after.attendance.filter(
          (record) => record.classId === ids.classes.full,
        ),
      );
      expect(store.getSnapshot().state.notifications).toEqual(
        after.notifications,
      );
    },
  );

  it('rejects cancellation with an unavailable waiting recipient without committing a partial transition', () => {
    const initial = createInitialDemoState();
    const store = createDemoStore({
      ...initial,
      members: initial.members.filter(
        (member) => member.memberId !== ids.members.moss,
      ),
    });
    const before = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(
      store.submit({
        type: 'cancelClass',
        payload: {
          classId: ids.classes.full,
          reason: 'Fictional room closure',
        },
      }),
    ).toMatchObject({
      success: false,
      error: {
        category: 'DemoUnavailableState',
        resource: 'member',
        resourceId: ids.members.moss,
      },
    });
    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it.each(['actor', 'time', 'changes', 'warnings'] as const)(
    'rejects a tampered %s envelope without notifying or changing the snapshot',
    (field) => {
      const store = createDemoStore();
      const listener = vi.fn();
      store.subscribe(listener);
      const before = store.getSnapshot();
      const accepted = expectSuccess(
        store.validate({
          type: 'setSimulation',
          payload: { delivery: 'failure' },
        }),
      );
      const tampered = {
        ...accepted,
        ...(field === 'actor'
          ? { actor: { kind: 'member' as const, memberId: ids.members.maple } }
          : {}),
        ...(field === 'time'
          ? { validatedAt: '2026-10-05T15:46:00Z' as const }
          : {}),
        ...(field === 'changes'
          ? { changes: { ...accepted.changes, members: [] } }
          : {}),
        ...(field === 'warnings' ? { warnings: [{ kind: 'invented' }] } : {}),
      };
      // Runtime callers can supply malformed envelopes regardless of TypeScript.
      expect(() => store.dispatch(tampered as typeof accepted)).toThrow(
        DemoReducerError,
      );
      expect(store.getSnapshot()).toBe(before);
      expect(listener).not.toHaveBeenCalled();
    },
  );

  it('revalidates a fabricated action against the current actor', () => {
    const store = createDemoStore(
      withActor(createInitialDemoState(), {
        kind: 'member',
        memberId: ids.members.maple,
      }),
    );
    const before = store.getSnapshot();
    expect(() =>
      store.dispatch({
        type: 'accepted',
        action: {
          type: 'deactivateStaffAccount',
          payload: { staffId: ids.staff.frontDesk },
        },
        actor: before.state.activeActor,
        validatedAt: before.state.clock.now,
        baseRevision: before.state.revision,
        changes: {
          staffAccounts: before.state.staffAccounts.map((staff) => ({
            ...staff,
            active: false,
          })),
        },
        warnings: [],
      }),
    ).toThrow(DemoReducerError);
    expect(store.getSnapshot()).toBe(before);
  });

  it('accepts an independently cloned valid direct-dispatch envelope', () => {
    const store = createDemoStore();
    const accepted = expectSuccess(
      store.validate({
        type: 'setSimulation',
        payload: { delivery: 'failure' },
      }),
    );
    store.dispatch(structuredClone(accepted));
    expect(store.getSnapshot().state.simulation.delivery).toBe('failure');
    expect(store.getSnapshot().state.revision).toBe(1);
  });

  it('rejects a sparse warnings array instead of treating it as empty', () => {
    const store = createDemoStore();
    const accepted = expectSuccess(
      store.validate({
        type: 'setSimulation',
        payload: { delivery: 'failure' },
      }),
    );
    const before = store.getSnapshot();
    expect(() =>
      store.dispatch({ ...accepted, warnings: new Array(1) }),
    ).toThrow(DemoReducerError);
    expect(store.getSnapshot()).toBe(before);
  });

  it('accepts valid replacement fields regardless of property insertion order', () => {
    const store = createDemoStore();
    const accepted = expectSuccess(
      store.validate({
        type: 'setSimulation',
        payload: { delivery: 'failure', identity: 'rejected' },
      }),
    );
    store.dispatch({
      ...accepted,
      changes: { simulation: { identity: 'rejected', delivery: 'failure' } },
    });
    expect(store.getSnapshot().state.simulation).toEqual({
      identity: 'rejected',
      delivery: 'failure',
    });
  });

  it.each([
    new Error('subscriber failed'),
    new RangeError('subscriber range failed'),
  ])(
    'propagates subscriber exceptions after a committed clock step: %s',
    (error) => {
      const store = createDemoStore();
      store.subscribe(() => {
        throw error;
      });
      expect(() => store.advanceClockBy(1)).toThrow(error);
      expect(store.getSnapshot().state.clock.now).toBe('2026-10-05T15:46:00Z');
      expect(store.getSnapshot().state.revision).toBe(1);
    },
  );

  it('propagates reducer errors instead of reporting invalid clock minutes', () => {
    const store = createDemoStore({
      ...createInitialDemoState(),
      revision: Number.MAX_SAFE_INTEGER,
    });
    expect(() => store.advanceClockBy(1)).toThrow(DemoReducerError);
    expect(store.getSnapshot().state.revision).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([0, -1, 1.5, Infinity])(
    'reports invalid clock minutes %s without mutation',
    (minutes) => {
      const store = createDemoStore();
      const before = store.getSnapshot();
      expect(store.advanceClockBy(minutes)).toMatchObject({
        success: false,
        error: { category: 'ValidationError' },
      });
      expect(store.getSnapshot()).toBe(before);
    },
  );

  it('propagates scenario preset errors through the store', () => {
    const store = createDemoStore({
      ...createInitialDemoState(),
      scenarioId: 'scenario:missing',
    });
    const before = store.getSnapshot();
    expect(store.setClockPreset(ids.clockPresets.classEnd)).toMatchObject({
      success: false,
      error: {
        category: 'DemoUnavailableState',
        resource: 'scenario',
        resourceId: 'scenario:missing',
      },
    });
    expect(store.getSnapshot()).toBe(before);
  });
  it('provides a stable snapshot reference until state changes', () => {
    const store = createDemoStore();
    const first = store.getSnapshot();
    const second = store.getSnapshot();
    expect(second).toBe(first);
  });

  it('validates and submits against the latest state within the same tick', () => {
    const store = createDemoStore();

    expectSuccess(
      store.submit({ type: 'setSimulation', payload: { delivery: 'failure' } }),
    );
    const result = expectSuccess(
      store.submit({
        type: 'createInvitation',
        payload: {
          invitationId: 'invitation:store-latest',
          email: 'store.latest@example.invalid',
        },
      }),
    );

    const next = store.getSnapshot().state;
    expect(result.changes.notifications?.at(-1)?.status).toBe('failed');
    expect(next.notifications.at(-1)?.status).toBe('failed');
  });

  it('throws on stale accepted dispatch and leaves state unchanged', () => {
    const store = createDemoStore();
    const first = expectSuccess(
      store.validate({
        type: 'setSimulation',
        payload: { delivery: 'failure' },
      }),
    );
    store.dispatch(first);

    const before = store.getSnapshot().state;
    expect(() => store.dispatch(first)).toThrow(DemoReducerError);
    expect(store.getSnapshot().state).toEqual(before);
  });

  it('returns a revision conflict instead of dispatching when expectedRevision is stale', () => {
    const store = createDemoStore();
    expectSuccess(
      store.submit({ type: 'setSimulation', payload: { delivery: 'failure' } }),
    );

    const result = store.submit(
      { type: 'setSimulation', payload: { identity: 'mismatched' } },
      { expectedRevision: 0 },
    );

    expect(result).toMatchObject({
      success: false,
      error: {
        category: 'DemoConflict',
        conflict: { kind: 'revision', expectedRevision: 0, currentRevision: 1 },
      },
    });
    expect(store.getSnapshot().state.simulation.identity).toBe('verified');
  });

  it('tracks unsaved edits and requires confirmation for reset and scenario load after edits', () => {
    const store = createDemoStore();
    expect(store.getSnapshot().hasUnsavedEdits).toBe(false);
    expectSuccess(
      store.submit({ type: 'setSimulation', payload: { delivery: 'failure' } }),
    );
    expect(store.getSnapshot().hasUnsavedEdits).toBe(true);

    expect(store.resetDemo()).toMatchObject({
      success: false,
      error: {
        category: 'IneligibleDemoAction',
        reason: 'confirmationRequired',
      },
    });
    expect(store.loadScenario(SCENARIO_IDS.waiverAttendance)).toMatchObject({
      success: false,
      error: {
        category: 'IneligibleDemoAction',
        reason: 'confirmationRequired',
      },
    });

    expectSuccess(store.resetDemo({ confirmed: true }));
    expect(store.getSnapshot().hasUnsavedEdits).toBe(false);
    expectSuccess(
      store.submit({ type: 'setSimulation', payload: { delivery: 'failure' } }),
    );
    expectSuccess(
      store.loadScenario(SCENARIO_IDS.waiverAttendance, { confirmed: true }),
    );
    expect(store.getSnapshot().hasUnsavedEdits).toBe(false);
  });

  it('returns scenario load errors and allows reset with a stale active actor', () => {
    const store = createDemoStore({
      ...createInitialDemoState(),
      activeActor: { kind: 'staff', staffId: 'staff:missing' },
    });

    expect(store.loadScenario('scenario:missing')).toMatchObject({
      success: false,
      error: { category: 'DemoUnavailableState', resource: 'scenario' },
    });
    expectSuccess(store.resetDemo());
    expect(store.getSnapshot().state.activeActor).toEqual({
      kind: 'staff',
      staffId: ids.staff.admin,
    });
  });

  it('notifies subscribers only when state changes', () => {
    const store = createDemoStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    expectSuccess(
      store.submit({ type: 'setSimulation', payload: { delivery: 'failure' } }),
    );
    unsubscribe();
    expectSuccess(
      store.submit({
        type: 'setSimulation',
        payload: { identity: 'mismatched' },
      }),
    );

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not use browser storage or network APIs', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    const store = createDemoStore();
    expectSuccess(
      store.submit({ type: 'setSimulation', payload: { delivery: 'failure' } }),
    );
    expectSuccess(store.advanceClock('2026-10-05T16:45:00Z'));
    expectSuccess(store.setClockPreset(ids.clockPresets.classEnd));
    expectSuccess(store.advanceClockBy(15));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('exposes clock helpers and validated dispatch helpers', () => {
    const store = createDemoStore();
    expectSuccess(store.advanceClock('2026-10-05T16:44:59Z'));
    expectSuccess(store.setClockPreset(ids.clockPresets.classEnd));
    expect(store.getSnapshot().state.clock.presetId).toBe(
      ids.clockPresets.classEnd,
    );
    const accepted = expectSuccess(
      store.validate(setClockPresetAction(ids.clockPresets.classEnd)),
    );
    expect(accepted.action.type).toBe('setClockPreset');
  });

  it('supports a custom initial state', () => {
    const initial = withActor(createInitialDemoState(), {
      kind: 'member',
      memberId: ids.members.willow,
    });
    const store = createDemoStore(initial);
    expect(store.getSnapshot().state.activeActor).toEqual(initial.activeActor);
  });
});
