import { describe, expect, it } from 'vitest';
import type {
  DemoState,
  DomainResult,
  UtcInstant,
  WaiverSignature,
  WaiverVersion,
} from './types';
import {
  createWaiverVersion,
  getCurrentWaiver,
  getWaiverCompliance,
  publishWaiver,
  requireCurrentWaiver,
  signWaiver,
} from './waivers';

const now: UtcInstant = '2026-10-02T16:00:00Z';
const later: UtcInstant = '2026-10-03T16:00:00Z';
const draft: WaiverVersion = {
  waiverVersionId: 'waiver:two',
  version: 2,
  text: 'Fictional demo placeholder only; not a legal waiver.',
  createdAt: now,
  status: 'draft',
};
const first: WaiverVersion = {
  ...draft,
  waiverVersionId: 'waiver:one',
  version: 1,
  status: 'published',
  publishedAt: now,
};
const signature: WaiverSignature = {
  signatureId: 'signature:one',
  memberId: 'member:demo',
  waiverVersionId: first.waiverVersionId,
  typedName: 'Fictional Member',
  signedAt: now,
};

function state(overrides: Partial<DemoState> = {}): DemoState {
  return {
    revision: 0,
    staffAccounts: [],
    members: [
      {
        memberId: 'member:demo',
        displayName: 'Fictional Member',
        verifiedEmail: 'member@example.invalid',
        identitySubject: 'identity:demo',
        status: 'active',
        invitationId: 'invitation:demo',
        adultAttestationAt: now,
        adultEligibility: 'attested',
        createdAt: now,
      },
    ],
    invitations: [],
    waivers: [first, draft],
    currentWaiverVersionId: first.waiverVersionId,
    waiverSignatures: [signature],
    stations: [],
    layout: { availability: 'current' },
    classTypes: [],
    weeklyTemplates: [],
    classes: [],
    bookings: [
      {
        bookingId: 'booking:demo',
        memberId: 'member:demo',
        classId: 'class:demo',
        stationId: 'station:demo',
        bookedAt: now,
        attendanceRecordId: 'attendance:demo',
        reviewFlags: [],
        status: 'booked',
      },
    ],
    waitlistEntries: [],
    attendance: [],
    notifications: [],
    settings: {
      illustrative: true,
      timezone: 'America/Los_Angeles',
      memberCap: 10,
      invitationExpiryMinutes: 60,
      scheduleRelease: { mode: 'immediate' },
      targetGapMinutes: 30,
      waitlistCutoffMinutes: 30,
      lateCancelCutoffMinutes: 30,
      checkInLeadMinutes: 30,
      checkInGraceMinutes: 5,
    },
    activeActor: { kind: 'member', memberId: 'member:demo' },
    scenarioId: 'scenario:demo',
    clock: { now, presetId: null },
    simulation: { delivery: 'success', identity: 'verified' },
    ...overrides,
  };
}

function value<T>(result: DomainResult<T>): T {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.error.message);
  return result.value;
}

function freeze<T>(input: T): T {
  if (input !== null && typeof input === 'object') {
    Object.values(input).forEach(freeze);
    Object.freeze(input);
  }
  return input;
}

describe('waiver versions', () => {
  it('creates a fictional version as a draft without changing current compliance', () => {
    const input = freeze(state({ waivers: [first] }));
    const next = value(createWaiverVersion(input, draft));
    expect(next.waivers).toEqual([first, draft]);
    expect(next.currentWaiverVersionId).toBe(first.waiverVersionId);
    expect(next.waiverSignatures).toBe(input.waiverSignatures);
    expect(next.bookings).toBe(input.bookings);
    expect(input.waivers).toEqual([first]);
  });

  it('publishes a new current version while retaining old evidence and bookings', () => {
    const input = freeze(state());
    const next = value(publishWaiver(input, draft.waiverVersionId, later));
    expect(value(getCurrentWaiver(next))).toEqual({
      ...draft,
      status: 'published',
      publishedAt: later,
    });
    expect(next.waivers[0]).toBe(first);
    expect(next.waiverSignatures).toBe(input.waiverSignatures);
    expect(next.bookings).toBe(input.bookings);
    expect(input.currentWaiverVersionId).toBe(first.waiverVersionId);
    expect(getWaiverCompliance(next, 'member:demo')).toEqual({
      status: 'outdated',
      signature,
      currentVersionId: draft.waiverVersionId,
    });
    expect(requireCurrentWaiver(next, 'member:demo')).toMatchObject({
      success: false,
      error: { category: 'IneligibleDemoAction', reason: 'waiverOutdated' },
    });
  });

  it.each([
    { ...draft, text: ' \t ' },
    { ...draft, version: 0 },
    { ...draft, version: 1.5 },
    { ...draft, version: Number.NaN },
    { ...draft, waiverVersionId: first.waiverVersionId },
    { ...draft, version: first.version },
    { ...draft, createdAt: '2026-02-30T16:00:00Z' as UtcInstant },
    { ...draft, status: 'published', publishedAt: now },
  ] satisfies WaiverVersion[])(
    'rejects invalid or duplicate draft evidence: %j',
    (waiver) => {
      const input = freeze(state({ waivers: [first] }));
      const before = structuredClone(input);
      expect(createWaiverVersion(input, waiver)).toMatchObject({
        success: false,
        error: { category: 'ValidationError' },
      });
      expect(input).toEqual(before);
    },
  );

  it('rejects absent versions explicitly', () => {
    expect(
      publishWaiver(freeze(state()), 'waiver:absent', later),
    ).toMatchObject({
      success: false,
      error: { category: 'DemoUnavailableState', resource: 'waiver' },
    });
  });

  it('does not republish an immutable version or roll current policy back', () => {
    const input = freeze(state());
    expect(publishWaiver(input, first.waiverVersionId, later).success).toBe(
      false,
    );
    const next = value(publishWaiver(input, draft.waiverVersionId, later));
    const olderDraft: WaiverVersion = {
      ...draft,
      waiverVersionId: 'waiver:old',
      version: 1,
    };
    expect(
      publishWaiver(
        freeze({ ...next, waivers: [...next.waivers, olderDraft] }),
        olderDraft.waiverVersionId,
        later,
      ).success,
    ).toBe(false);
  });

  it.each([now, '2026-02-30T16:00:00Z' as UtcInstant])(
    'rejects invalid or pre-creation publication times: %s',
    (instant) => {
      const input = freeze(
        state({ waivers: [first, { ...draft, createdAt: later }] }),
      );
      expect(
        publishWaiver(input, draft.waiverVersionId, instant),
      ).toMatchObject({
        success: false,
        error: { category: 'ValidationError' },
      });
      expect(input.waivers[1]?.status).toBe('draft');
    },
  );
});

describe('waiver signature evidence and eligibility', () => {
  const signing = {
    memberId: 'member:demo',
    signatureId: 'signature:two',
    waiverVersionId: draft.waiverVersionId,
    typedName: '  Fictional New Name  ',
  } as const;

  it('records the exact typed name, member, current version, and supplied timestamp', () => {
    const input = freeze(
      value(publishWaiver(state(), draft.waiverVersionId, later)),
    );
    const next = value(signWaiver(input, signing, later));
    const evidence = { ...signing, signedAt: later };
    expect(next.waiverSignatures).toEqual([signature, evidence]);
    expect(next.bookings).toBe(input.bookings);
    expect(input.waiverSignatures).toEqual([signature]);
    expect(getWaiverCompliance(next, signing.memberId)).toEqual({
      status: 'current',
      signature: evidence,
    });
    expect(requireCurrentWaiver(next, signing.memberId)).toEqual({
      success: true,
      value: evidence,
    });
  });

  it('uses current-version evidence even when old evidence occurs later in the array', () => {
    const current = {
      ...signature,
      signatureId: 'signature:two' as const,
      waiverVersionId: draft.waiverVersionId,
      signedAt: later,
    };
    const input = state({
      waivers: [first, { ...draft, status: 'published', publishedAt: later }],
      currentWaiverVersionId: draft.waiverVersionId,
      waiverSignatures: [current, signature],
    });
    expect(getWaiverCompliance(input, 'member:demo')).toEqual({
      status: 'current',
      signature: current,
    });
  });

  it('reports missing evidence and blocks the shared booking/check-in gate', () => {
    const input = freeze(
      state({ waiverSignatures: [{ ...signature, memberId: 'member:other' }] }),
    );
    expect(getWaiverCompliance(input, 'member:demo')).toEqual({
      status: 'missing',
      currentVersionId: first.waiverVersionId,
    });
    expect(requireCurrentWaiver(input, 'member:demo')).toMatchObject({
      success: false,
      error: {
        category: 'IneligibleDemoAction',
        reason: 'waiverMissing',
        memberId: 'member:demo',
      },
    });
  });

  it.each([
    { currentWaiverVersionId: null },
    { currentWaiverVersionId: 'waiver:absent' as const },
    { currentWaiverVersionId: draft.waiverVersionId },
  ])('reports unavailable current publication explicitly: %j', (overrides) => {
    const input = freeze(state(overrides));
    expect(getCurrentWaiver(input)).toMatchObject({
      success: false,
      error: { category: 'DemoUnavailableState', resource: 'waiver' },
    });
    expect(getWaiverCompliance(input, 'member:demo')).toMatchObject({
      status: 'unavailable',
    });
    expect(requireCurrentWaiver(input, 'member:demo')).toMatchObject({
      success: false,
      error: { category: 'DemoUnavailableState' },
    });
    expect(signWaiver(input, signing, later).success).toBe(false);
  });

  it.each([
    { ...signing, typedName: ' \n ' },
    { ...signing, signatureId: signature.signatureId },
  ])(
    'rejects missing name or duplicate signature IDs without mutation: %j',
    (request) => {
      const input = freeze(
        value(publishWaiver(state(), draft.waiverVersionId, later)),
      );
      const before = structuredClone(input);
      expect(signWaiver(input, request, later)).toMatchObject({
        success: false,
        error: { category: 'ValidationError' },
      });
      expect(input).toEqual(before);
    },
  );

  it('rejects signing an old version and an absent member', () => {
    const input = freeze(
      value(publishWaiver(state(), draft.waiverVersionId, later)),
    );
    expect(
      signWaiver(
        input,
        { ...signing, waiverVersionId: first.waiverVersionId },
        later,
      ),
    ).toMatchObject({
      success: false,
      error: { category: 'IneligibleDemoAction', reason: 'waiverOutdated' },
    });
    expect(
      signWaiver(input, { ...signing, memberId: 'member:absent' }, later),
    ).toMatchObject({
      success: false,
      error: { category: 'DemoUnavailableState', resource: 'member' },
    });
  });

  it('preserves evidence rather than overwriting a repeat signature for the same version', () => {
    const input = freeze(state());
    expect(
      signWaiver(
        input,
        { ...signing, waiverVersionId: first.waiverVersionId },
        later,
      ),
    ).toMatchObject({
      success: false,
      error: { category: 'ValidationError' },
    });
    expect(input.waiverSignatures).toEqual([signature]);
  });

  it.each([now, '2026-02-30T16:00:00Z' as UtcInstant])(
    'rejects invalid or pre-publication signature timestamps: %s',
    (instant) => {
      const input = freeze(
        value(publishWaiver(state(), draft.waiverVersionId, later)),
      );
      expect(signWaiver(input, signing, instant)).toMatchObject({
        success: false,
        error: { category: 'ValidationError' },
      });
      expect(input.waiverSignatures).toEqual([signature]);
    },
  );
});
