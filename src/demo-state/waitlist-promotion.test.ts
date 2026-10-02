import { describe, expect, it } from 'vitest';
import { createInitialDemoState, FIXTURE_IDS as ids } from '../demo-fixtures';
import type { DemoState } from '../domain';
import { createDemoStore } from './store';
import { expectSuccess } from './test-helpers';

function promotionState(): DemoState {
  const seed = createInitialDemoState();
  return {
    ...seed,
    bookings: seed.bookings.filter(
      (booking) => booking.bookingId !== ids.bookings.fullMaple,
    ),
    attendance: seed.attendance.filter(
      (record) => record.bookingId !== ids.bookings.fullMaple,
    ),
  };
}

const action = {
  type: 'promoteWaitlist',
  payload: { classId: ids.classes.full, stationId: ids.stations.north },
} as const;

describe('manual and automated promotion state coordination', () => {
  it('accepts only a review patch with a warning when every waiter is ineligible', () => {
    const seed = promotionState();
    const initial = {
      ...seed,
      waitlistEntries: seed.waitlistEntries.filter(
        (entry) => entry.entryId !== ids.waitlist.willow,
      ),
    };
    const before = structuredClone(initial);
    const store = createDemoStore(initial);
    const accepted = expectSuccess(store.submit(action));
    expect(accepted.warnings).toEqual([
      expect.objectContaining({
        category: 'waitlistNotPromoted',
        reason: 'noEligibleWaiter',
        classId: ids.classes.full,
      }),
    ]);
    expect(Object.keys(accepted.changes)).toEqual(['waitlistEntries']);
    const next = store.getSnapshot().state;
    expect(next.revision).toBe(1);
    expect(next.bookings).toBe(initial.bookings);
    expect(next.attendance).toBe(initial.attendance);
    expect(next.notifications).toBe(initial.notifications);
    expect(
      next.waitlistEntries.find((entry) => entry.entryId === ids.waitlist.moss),
    ).toMatchObject({
      status: 'waiting',
      reviewFlags: ['memberInactive'],
    });
    expect(
      next.waitlistEntries.find(
        (entry) => entry.entryId === ids.waitlist.aspen,
      ),
    ).toMatchObject({
      status: 'waiting',
      reviewFlags: ['waiverOutdated'],
    });
    expect(initial).toEqual(before);
  });

  it.each(['manual', 'automatic'] as const)(
    'commits skipped flags, eligible promotion and failed delivery together on %s path',
    (path) => {
      const initial =
        path === 'manual' ? promotionState() : createInitialDemoState();
      const store = createDemoStore({
        ...initial,
        simulation: { ...initial.simulation, delivery: 'failure' },
      });
      const transitions: DemoState[] = [];
      store.subscribe(() => transitions.push(store.getSnapshot().state));
      expectSuccess(
        store.submit(
          path === 'manual'
            ? action
            : {
                type: 'removeBooking',
                payload: {
                  bookingId: ids.bookings.fullMaple,
                  reason: 'Fictional removal',
                },
              },
        ),
      );
      expect(transitions).toHaveLength(1);
      const next = transitions[0]!;
      const promoted = next.bookings.find(
        (booking) => booking.promotedFromEntryId === ids.waitlist.willow,
      )!;
      expect(promoted).toMatchObject({
        status: 'booked',
        memberId: ids.members.willow,
        stationId: ids.stations.north,
      });
      expect(
        next.attendance.find(
          (record) => record.bookingId === promoted.bookingId,
        ),
      ).toMatchObject({ currentOutcome: 'booked' });
      expect(
        next.waitlistEntries.find(
          (entry) => entry.entryId === ids.waitlist.willow,
        ),
      ).toMatchObject({ status: 'promoted', bookingId: promoted.bookingId });
      expect(
        next.waitlistEntries.find(
          (entry) => entry.entryId === ids.waitlist.moss,
        )?.reviewFlags,
      ).toEqual(['memberInactive']);
      expect(
        next.waitlistEntries.find(
          (entry) => entry.entryId === ids.waitlist.aspen,
        )?.reviewFlags,
      ).toEqual(['waiverOutdated']);
      expect(next.notifications.at(-1)).toMatchObject({
        status: 'failed',
        event: { type: 'waitlistPromoted', bookingId: promoted.bookingId },
      });
      expect(next.revision).toBe(1);
    },
  );

  it.each(['manual', 'automatic'] as const)(
    'does not commit %s promotion or flags when notification construction fails',
    (path) => {
      const seed =
        path === 'manual' ? promotionState() : createInitialDemoState();
      const store = createDemoStore({
        ...seed,
        simulation: {
          ...seed.simulation,
          delivery: 'invalid' as DemoState['simulation']['delivery'],
        },
      });
      const before = store.getSnapshot();
      expect(
        store.submit(
          path === 'manual'
            ? action
            : {
                type: 'removeBooking',
                payload: {
                  bookingId: ids.bookings.fullMaple,
                  reason: 'Fictional removal',
                },
              },
        ),
      ).toMatchObject({
        success: false,
        error: { category: 'ValidationError' },
      });
      expect(store.getSnapshot()).toBe(before);
    },
  );
});
