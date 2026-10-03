import { describe, expect, it } from 'vitest';
import {
  selectCoachClassHistory,
  selectCoachProfile,
  updateCoachProfile,
  updateOwnCoachProfile,
} from './coaches';
import type {
  AdminCoachProfileUpdate,
  CoachProfile,
  DemoActor,
  DemoState,
  DomainResult,
  OwnCoachProfileUpdate,
  ScheduledClass,
  StaffAccount,
  StaffId,
  UtcInstant,
} from './types';

const now: UtcInstant = '2026-10-02T16:00:00Z';
const coachId: StaffId = 'staff:coach';
const adminActor = {
  kind: 'staff',
  staffId: 'staff:admin',
} satisfies DemoActor;
const coachActor: DemoActor = { kind: 'staff', staffId: coachId };
const deskActor = { kind: 'staff', staffId: 'staff:desk' } satisfies DemoActor;
const memberActor: DemoActor = { kind: 'member', memberId: 'member:demo' };
const invitationActor: DemoActor = {
  kind: 'invitation',
  invitationId: 'invitation:demo',
};

function profile(): CoachProfile {
  return {
    displayName: 'Fictional Coach',
    avatarId: 'avatar:initials',
    biography: 'Fictional rowing coach.',
    certifications: ['Illustrative rowing certification'],
    contact: { email: 'coach@example.invalid', phone: '555-0100' },
  };
}

function scheduled(overrides: Partial<ScheduledClass> = {}): ScheduledClass {
  return {
    classId: 'class:past',
    schedule: {
      date: '2026-10-01',
      time: '09:00',
      timezone: 'America/Los_Angeles',
    },
    startsAt: '2026-10-01T16:00:00Z',
    endsAt: '2026-10-01T16:45:00Z',
    coachId,
    status: 'completed',
    releasedAt: '2026-09-01T16:00:00Z',
    classTypeSnapshot: {
      classTypeId: 'classType:rowing',
      name: 'Fictional Rowing',
      durationMinutes: 45,
      description: 'Fictional class',
      difficulty: 'Illustrative beginner',
    },
    lateCancelWaived: false,
    reviewFlags: [],
    ...overrides,
  };
}

function state(): DemoState {
  const staffAccounts: StaffAccount[] = [
    {
      staffId: adminActor.staffId,
      identitySubject: 'identity:admin',
      active: true,
      assignedRoles: ['admin'],
      assignedClassIds: [],
    },
    {
      staffId: deskActor.staffId,
      identitySubject: 'identity:desk',
      active: true,
      assignedRoles: ['frontDesk'],
      assignedClassIds: [],
    },
    {
      staffId: coachId,
      identitySubject: 'identity:coach',
      active: true,
      assignedRoles: ['coach'],
      assignedClassIds: [],
      coachProfile: profile(),
    },
    {
      staffId: 'staff:other',
      identitySubject: 'identity:other',
      active: true,
      assignedRoles: ['coach'],
      assignedClassIds: [],
      coachProfile: profile(),
    },
  ];
  return {
    revision: 5,
    staffAccounts,
    members: [
      {
        memberId: 'member:demo',
        displayName: 'Fictional Member',
        verifiedEmail: 'member@example.invalid',
        identitySubject: 'identity:member',
        status: 'active',
        invitationId: 'invitation:accepted',
        adultAttestationAt: now,
        adultEligibility: 'attested',
        createdAt: now,
      },
    ],
    invitations: [
      {
        invitationId: 'invitation:demo',
        email: 'invitee@example.invalid',
        issuedAt: now,
        expiresAt: '2026-10-09T16:00:00Z',
        issuedBy: adminActor.staffId,
        status: 'outstanding',
      },
    ],
    waivers: [],
    currentWaiverVersionId: null,
    waiverSignatures: [],
    stations: [],
    retiredStations: [],
    layout: { availability: 'current' },
    classTypes: [],
    weeklyTemplates: [],
    classes: [],
    bookings: [],
    waitlistEntries: [],
    attendance: [],
    notifications: [],
    settings: {
      illustrative: true,
      timezone: 'America/Los_Angeles',
      memberCap: 10,
      invitationExpiryMinutes: 10080,
      scheduleRelease: { mode: 'immediate' },
      targetGapMinutes: 30,
      waitlistCutoffMinutes: 60,
      lateCancelCutoffMinutes: 120,
      checkInLeadMinutes: 30,
      checkInGraceMinutes: 5,
    },
    activeActor: adminActor,
    scenarioId: 'scenario:baseline',
    clock: { now, presetId: null },
    simulation: { delivery: 'success', identity: 'verified' },
  };
}

function freeze<T>(input: T): T {
  if (input !== null && typeof input === 'object') {
    for (const child of Object.values(input)) freeze(child);
    Object.freeze(input);
  }
  return input;
}

function value<T>(result: DomainResult<T>): T {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.error.message);
  return result.value;
}

function failure(
  result: DomainResult<unknown>,
  category: string,
  details: Record<string, unknown> = {},
) {
  expect(result).toMatchObject({
    success: false,
    error: { category, ...details },
  });
  if (!result.success) expect(result.error.message.trim()).not.toBe('');
}

function changedProfile(result: DomainResult<Partial<DemoState>>) {
  const changes = value(result);
  expect(Object.keys(changes)).toEqual(['staffAccounts']);
  const updated = changes.staffAccounts?.find(
    (account) => account.staffId === coachId,
  )?.coachProfile;
  expect(updated).toBeDefined();
  if (!updated) throw new Error('Expected updated coach profile.');
  return updated;
}

describe('coach profile visibility', () => {
  it('projects exactly the public fields for members without a contact key', () => {
    const base = state();
    const input = freeze({
      ...base,
      staffAccounts: base.staffAccounts.map((account) =>
        account.staffId === coachId
          ? {
              ...account,
              coachProfile: { ...profile(), internalNote: 'Staff-only note' },
            }
          : account,
      ),
    });
    const before = structuredClone(input);
    const view = value(selectCoachProfile(input, coachId, memberActor));
    expect(view.audience).toBe('member');
    expect(view.profile).toEqual({
      displayName: profile().displayName,
      avatarId: profile().avatarId,
      biography: profile().biography,
      certifications: profile().certifications,
    });
    expect(Object.keys(view.profile).sort()).toEqual([
      'avatarId',
      'biography',
      'certifications',
      'displayName',
    ]);
    expect(JSON.stringify(view)).not.toContain('coach@example.invalid');
    expect(JSON.stringify(view)).not.toContain('555-0100');
    expect(JSON.stringify(view)).not.toContain('Staff-only note');
    expect(view.profile.certifications).not.toBe(
      input.staffAccounts[2].coachProfile?.certifications,
    );
    expect(input).toEqual(before);
  });

  it.each([adminActor, deskActor, coachActor])(
    'returns staff-only contact details to active staff $staffId',
    (actor) => {
      const input = freeze(state());
      const view = value(selectCoachProfile(input, 'staff:other', actor));
      expect(view.audience).toBe('staff');
      expect(view.profile).toEqual(profile());
      expect(view.profile).not.toBe(input.staffAccounts[3].coachProfile);
      expect(view.profile.contact).not.toBe(
        input.staffAccounts[3].coachProfile?.contact,
      );
      expect(view.profile.certifications).not.toBe(
        input.staffAccounts[3].coachProfile?.certifications,
      );
    },
  );

  it('uses the selected actor by default rather than caller-chosen audience flags', () => {
    const input = freeze({ ...state(), activeActor: memberActor });
    expect(value(selectCoachProfile(input, coachId))).toMatchObject({
      audience: 'member',
    });
    expect(
      value(selectCoachProfile(input, coachId)).profile,
    ).not.toHaveProperty('contact');
  });

  it.each([adminActor, deskActor, coachActor])(
    'does not expose contact details to inactive staff $staffId',
    (actor) => {
      const base = state();
      const input = freeze({
        ...base,
        staffAccounts: base.staffAccounts.map((account) =>
          account.staffId === actor.staffId
            ? { ...account, active: false }
            : account,
        ),
      });
      failure(
        selectCoachProfile(input, coachId, actor),
        'IneligibleDemoAction',
        { reason: 'inactiveStaff' },
      );
    },
  );

  it('denies invitations access to profiles and contact details', () => {
    failure(
      selectCoachProfile(freeze(state()), coachId, invitationActor),
      'IneligibleDemoAction',
      { reason: 'roleDenied' },
    );
  });

  it.each([
    { kind: 'staff', staffId: 'staff:missing' },
    { kind: 'member', memberId: 'member:missing' },
  ] satisfies DemoActor[])(
    'reports an unknown viewing actor $kind',
    (actor) => {
      failure(
        selectCoachProfile(freeze(state()), coachId, actor),
        'DemoUnavailableState',
      );
    },
  );

  it.each(['staff:missing', adminActor.staffId] as const)(
    'reports a missing coach profile for %s',
    (staffId) => {
      failure(
        selectCoachProfile(freeze(state()), staffId, memberActor),
        'DemoUnavailableState',
        { resource: 'staff', resourceId: staffId, stale: false },
      );
    },
  );

  it('preserves access to public historical profiles after coach deactivation', () => {
    const base = state();
    const input = freeze({
      ...base,
      staffAccounts: base.staffAccounts.map((account) =>
        account.staffId === coachId ? { ...account, active: false } : account,
      ),
    });
    const view = value(selectCoachProfile(input, coachId, memberActor));
    expect(view.profile.displayName).toBe(profile().displayName);
    expect(view.profile).not.toHaveProperty('contact');
  });
});

describe('coach profile updates', () => {
  function profileless(active = true): DemoState {
    const base = state();
    return freeze({
      ...base,
      staffAccounts: base.staffAccounts.map((account) => {
        if (account.staffId !== coachId) return account;
        return { ...account, coachProfile: undefined, active };
      }),
    });
  }

  it.each([true, false])(
    'allows Admin to initialize a complete profile without changing access or activity: %s',
    (active) => {
      const input = profileless(active);
      const before = structuredClone(input);
      const updates = profile();
      const changes = value(
        updateCoachProfile(input, adminActor, coachId, updates),
      );
      expect(changes.staffAccounts?.[2]).toEqual({
        ...input.staffAccounts[2],
        coachProfile: updates,
      });
      expect(changes.staffAccounts?.[0]).toBe(input.staffAccounts[0]);
      expect(
        changedProfile({ success: true, value: changes }).contact,
      ).not.toBe(updates.contact);
      expect(
        changedProfile({ success: true, value: changes }).certifications,
      ).not.toBe(updates.certifications);
      expect(input).toEqual(before);
    },
  );

  it.each([
    'displayName',
    'biography',
    'avatarId',
    'certifications',
    'contact',
  ] as const)(
    'requires an explicit %s when Admin initializes a profile',
    (field) => {
      const updates: AdminCoachProfileUpdate = {
        ...profile(),
        [field]: undefined,
      };
      failure(
        updateCoachProfile(profileless(), adminActor, coachId, updates),
        'ValidationError',
        { fields: [{ field }] },
      );
    },
  );

  it('does not let a coach initialize their own profile even with a complete runtime payload', () => {
    failure(
      updateOwnCoachProfile(profileless(), coachActor, coachId, profile()),
      'DemoUnavailableState',
    );
  });

  it.each([coachActor, deskActor, memberActor, invitationActor])(
    'denies complete initialization to a non-admin $kind',
    (actor) => {
      failure(
        updateCoachProfile(profileless(), actor, coachId, profile()),
        'IneligibleDemoAction',
        { reason: 'roleDenied' },
      );
    },
  );

  it('denies initialization by inactive Admin and rejects non-coach targets', () => {
    const base = profileless();
    const input = freeze({
      ...base,
      staffAccounts: base.staffAccounts.map((account) =>
        account.staffId === adminActor.staffId
          ? { ...account, active: false }
          : account,
      ),
    });
    failure(
      updateCoachProfile(input, adminActor, coachId, profile()),
      'IneligibleDemoAction',
      { reason: 'inactiveStaff' },
    );
    failure(
      updateCoachProfile(base, adminActor, deskActor.staffId, profile()),
      'DemoUnavailableState',
    );
    failure(
      updateCoachProfile(base, adminActor, 'staff:missing', profile()),
      'DemoUnavailableState',
    );
  });

  it('reports malformed update payloads explicitly instead of throwing', () => {
    const input = freeze(state());
    failure(
      // @ts-expect-error Runtime payloads can bypass the typed action contract.
      updateOwnCoachProfile(input, coachActor, coachId, null),
      'ValidationError',
      { fields: [{ field: 'updates' }] },
    );
    failure(
      // @ts-expect-error Runtime payloads can bypass the typed action contract.
      updateCoachProfile(input, adminActor, coachId, []),
      'ValidationError',
      { fields: [{ field: 'updates' }] },
    );
  });

  it('allows only the own biography and bundled avatar to change immutably', () => {
    const input = freeze(state());
    const before = structuredClone(input);
    const updates: OwnCoachProfileUpdate = freeze({
      biography: 'Updated fictional biography.',
      avatarId: 'avatar:rowing',
    });
    const result = updateOwnCoachProfile(input, coachActor, coachId, updates);
    const updated = changedProfile(result);
    expect(updated).toEqual({ ...profile(), ...updates });
    const changes = value(result);
    expect(changes.staffAccounts).not.toBe(input.staffAccounts);
    expect(changes.staffAccounts?.[0]).toBe(input.staffAccounts[0]);
    expect(changes.staffAccounts?.[2]).not.toBe(input.staffAccounts[2]);
    expect(changes.staffAccounts?.[2]).toMatchObject({
      staffId: coachId,
      identitySubject: 'identity:coach',
      active: true,
      assignedRoles: ['coach'],
      assignedClassIds: [],
    });
    expect(updated.contact).not.toBe(
      input.staffAccounts[2].coachProfile?.contact,
    );
    expect(updated.certifications).not.toBe(
      input.staffAccounts[2].coachProfile?.certifications,
    );
    expect(input).toEqual(before);
  });

  it('allows clearing an own biography without changing admin-owned details', () => {
    expect(
      changedProfile(
        updateOwnCoachProfile(state(), coachActor, coachId, { biography: '' }),
      ),
    ).toEqual({ ...profile(), biography: '' });
  });

  it('denies another coach profile even for a coach with Front Desk role', () => {
    const base = state();
    const input = freeze({
      ...base,
      staffAccounts: base.staffAccounts.map((account) =>
        account.staffId === coachId
          ? { ...account, assignedRoles: ['coach', 'frontDesk'] as const }
          : account,
      ),
    });
    failure(
      updateOwnCoachProfile(input, coachActor, 'staff:other', {
        biography: 'Not mine.',
      }),
      'IneligibleDemoAction',
      { reason: 'roleDenied' },
    );
  });

  it.each(['displayName', 'certifications', 'contact', 'staffId'])(
    'rejects the extra own-update field %s at runtime',
    (field) => {
      const input = freeze(state());
      const before = structuredClone(input);
      const updates = { biography: 'Changed', [field]: 'Forbidden' };
      failure(
        updateOwnCoachProfile(input, coachActor, coachId, updates),
        'ValidationError',
        { fields: [{ field }] },
      );
      expect(input).toEqual(before);
    },
  );

  it.each([deskActor, memberActor, invitationActor])(
    'denies own edits for a non-coach actor $kind',
    (actor) => {
      failure(
        updateOwnCoachProfile(freeze(state()), actor, coachId, {
          biography: 'Denied',
        }),
        'IneligibleDemoAction',
        { reason: 'roleDenied' },
      );
    },
  );

  it('allows Admin to change all profile details with detached input collections', () => {
    const input = freeze(state());
    const before = structuredClone(input);
    const updates: AdminCoachProfileUpdate = {
      displayName: 'Another Fictional Name',
      avatarId: 'avatar:rowing',
      biography: 'Admin correction.',
      certifications: ['Illustrative instructor'],
      contact: { email: 'updated@example.invalid' },
    };
    const updated = changedProfile(
      updateCoachProfile(input, adminActor, coachId, updates),
    );
    expect(updated).toEqual(updates);
    expect(updated.contact).not.toBe(updates.contact);
    expect(updated.certifications).not.toBe(updates.certifications);
    expect(input).toEqual(before);
  });

  it('lets Admin replace or clear contact fields without merging old private data', () => {
    expect(
      changedProfile(
        updateCoachProfile(state(), adminActor, coachId, { contact: {} }),
      ).contact,
    ).toEqual({});
  });

  it.each([coachActor, deskActor, memberActor, invitationActor])(
    'denies admin-owned profile updates for a non-admin actor $kind',
    (actor) => {
      failure(
        updateCoachProfile(freeze(state()), actor, coachId, {
          displayName: 'Denied',
        }),
        'IneligibleDemoAction',
        { reason: 'roleDenied' },
      );
    },
  );

  it.each([adminActor, coachActor])(
    'denies all profile updates from inactive staff $staffId',
    (actor) => {
      const base = state();
      const input = freeze({
        ...base,
        staffAccounts: base.staffAccounts.map((account) =>
          account.staffId === actor.staffId
            ? { ...account, active: false }
            : account,
        ),
      });
      const before = structuredClone(input);
      const result =
        actor.staffId === coachId
          ? updateOwnCoachProfile(input, actor, coachId, {
              biography: 'Denied',
            })
          : updateCoachProfile(input, actor, coachId, {
              displayName: 'Denied',
            });
      failure(result, 'IneligibleDemoAction', { reason: 'inactiveStaff' });
      expect(input).toEqual(before);
    },
  );

  it('allows Admin corrections to an inactive coach without reactivating it', () => {
    const base = state();
    const input = freeze({
      ...base,
      staffAccounts: base.staffAccounts.map((account) =>
        account.staffId === coachId ? { ...account, active: false } : account,
      ),
    });
    const changes = value(
      updateCoachProfile(input, adminActor, coachId, {
        displayName: 'Corrected',
      }),
    );
    expect(changes.staffAccounts?.[2]).toMatchObject({
      active: false,
      coachProfile: { displayName: 'Corrected' },
    });
  });

  it('returns an unavailable result for a missing coach or missing profile', () => {
    for (const staffId of ['staff:missing', adminActor.staffId] as const) {
      failure(
        updateCoachProfile(freeze(state()), adminActor, staffId, {
          biography: 'Unavailable',
        }),
        'DemoUnavailableState',
        { resource: 'staff', resourceId: staffId, stale: false },
      );
    }
  });

  it('returns an unavailable result for an unknown acting staff account', () => {
    failure(
      updateCoachProfile(
        freeze(state()),
        { kind: 'staff', staffId: 'staff:missing' },
        coachId,
        { biography: 'Unavailable' },
      ),
      'DemoUnavailableState',
      { resource: 'staff', resourceId: 'staff:missing' },
    );
  });

  it.each([
    { field: 'displayName', updates: { displayName: '   ' } },
    { field: 'avatarId', updates: { avatarId: 'avatar:' } },
    {
      field: 'avatarId',
      updates: { avatarId: 'https://example.invalid/photo' },
    },
    { field: 'biography', updates: { biography: undefined } },
    { field: 'certifications', updates: { certifications: [''] } },
    { field: 'certifications', updates: { certifications: undefined } },
    { field: 'contact', updates: { contact: undefined } },
    { field: 'contact.email', updates: { contact: { email: '' } } },
    { field: 'contact.phone', updates: { contact: { phone: ' ' } } },
    { field: 'contact.secret', updates: { contact: { secret: 'private' } } },
    { field: 'staffId', updates: { staffId: 'staff:changed' } },
  ])(
    'rejects invalid profile field $field without mutation',
    ({ field, updates }) => {
      const input = freeze(state());
      const before = structuredClone(input);
      // Runtime form payloads may bypass the compile-time action contract.
      failure(
        updateCoachProfile(
          input,
          adminActor,
          coachId,
          updates as AdminCoachProfileUpdate,
        ),
        'ValidationError',
        { fields: [{ field }] },
      );
      expect(input).toEqual(before);
    },
  );
});

describe('coach class history', () => {
  it('rejects normalized nonexistent calendar dates rather than inventing a time', () => {
    failure(
      selectCoachClassHistory(
        freeze(state()),
        coachId,
        memberActor,
        '2026-02-30T16:00:00Z',
      ),
      'ValidationError',
      { fields: [{ field: 'now' }] },
    );
  });

  it('derives chronological history from scheduled coach IDs, not assignment lists', () => {
    const input = freeze({
      ...state(),
      classes: [
        scheduled({
          classId: 'class:later',
          startsAt: '2026-10-01T18:00:00Z',
          endsAt: '2026-10-01T18:45:00Z',
        }),
        scheduled({ classId: 'class:draft', status: 'draft' }),
        scheduled({ classId: 'class:other', coachId: 'staff:other' }),
        scheduled({ classId: 'class:unassigned', coachId: undefined }),
        scheduled({ classId: 'class:cancelled', status: 'cancelled' }),
        scheduled({ classId: 'class:published', status: 'published' }),
        scheduled({
          classId: 'class:ongoing',
          startsAt: '2026-10-02T15:45:00Z',
          endsAt: '2026-10-02T16:30:00Z',
        }),
        scheduled({
          classId: 'class:future',
          startsAt: '2026-10-03T16:00:00Z',
          endsAt: '2026-10-03T16:45:00Z',
        }),
      ],
    });
    const before = structuredClone(input);
    const history = value(
      selectCoachClassHistory(input, coachId, deskActor, now),
    );
    expect(history.map((item) => item.classId)).toEqual([
      'class:cancelled',
      'class:published',
      'class:later',
    ]);
    expect(history).not.toBe(input.classes);
    expect(input).toEqual(before);
  });

  it('includes a class at its exact UTC end, not while it is still in progress', () => {
    const input = freeze({
      ...state(),
      classes: [
        scheduled({
          status: 'published',
          startsAt: '2026-10-02T15:15:00Z',
          endsAt: now,
          schedule: {
            date: '2030-01-01',
            time: '09:00',
            timezone: 'America/Los_Angeles',
          },
        }),
      ],
    });
    expect(
      value(
        selectCoachClassHistory(
          input,
          coachId,
          memberActor,
          '2026-10-02T15:59:59Z',
        ),
      ),
    ).toEqual([]);
    expect(
      value(selectCoachClassHistory(input, coachId, memberActor, now)),
    ).toEqual(input.classes);
  });

  it('does not expose drafts or cancellations in member history', () => {
    const input = freeze({
      ...state(),
      classes: [
        scheduled({ classId: 'class:published', status: 'published' }),
        scheduled({ classId: 'class:completed' }),
        scheduled({ classId: 'class:draft', status: 'draft' }),
        scheduled({ classId: 'class:cancelled', status: 'cancelled' }),
      ],
    });
    const history = value(
      selectCoachClassHistory(input, coachId, memberActor, now),
    );
    expect(history.map((item) => item.classId)).toEqual([
      'class:completed',
      'class:published',
    ]);
    expect(JSON.stringify(history)).not.toContain('coach@example.invalid');
  });

  it.each(['immediate', 'rolling', 'manual'] as const)(
    'respects %s release policy in member history',
    (mode) => {
      const base = state();
      const input = freeze({
        ...base,
        settings: {
          ...base.settings,
          scheduleRelease:
            mode === 'rolling' ? { mode, advanceMinutes: 60 } : { mode },
        },
        classes: [
          scheduled({ classId: 'class:released' }),
          scheduled({ classId: 'class:unreleased', releasedAt: undefined }),
          scheduled({
            classId: 'class:later-release',
            releasedAt: '2026-10-03T16:00:00Z',
          }),
        ],
      });
      const history = value(
        selectCoachClassHistory(input, coachId, memberActor, now),
      );
      expect(history.map((item) => item.classId)).toEqual(
        mode === 'manual'
          ? ['class:released']
          : ['class:later-release', 'class:released', 'class:unreleased'],
      );
      expect(
        value(selectCoachClassHistory(input, coachId, adminActor, now)),
      ).toHaveLength(3);
    },
  );

  it('returns empty history rather than inventing entries from assigned class IDs', () => {
    const base = state();
    const input = freeze({
      ...base,
      staffAccounts: base.staffAccounts.map((account) =>
        account.staffId === coachId
          ? { ...account, assignedClassIds: ['class:missing'] as const }
          : account,
      ),
    });
    expect(
      value(selectCoachClassHistory(input, coachId, coachActor, now)),
    ).toEqual([]);
  });

  it('uses the frozen state clock and selected actor by default', () => {
    const input = freeze({
      ...state(),
      activeActor: memberActor,
      classes: [
        scheduled(),
        scheduled({ classId: 'class:cancelled', status: 'cancelled' }),
      ],
    });
    expect(
      value(selectCoachClassHistory(input, coachId)).map(
        (item) => item.classId,
      ),
    ).toEqual(['class:past']);
  });

  it('retains historical schedule links after coach deactivation', () => {
    const base = state();
    const input = freeze({
      ...base,
      staffAccounts: base.staffAccounts.map((account) =>
        account.staffId === coachId
          ? { ...account, active: false, assignedClassIds: [] }
          : account,
      ),
      classes: [scheduled()],
    });
    expect(
      value(selectCoachClassHistory(input, coachId, memberActor, now)),
    ).toEqual(input.classes);
  });

  it('denies history access for inactive staff and invitation actors', () => {
    const base = state();
    const input = freeze({
      ...base,
      staffAccounts: base.staffAccounts.map((account) =>
        account.staffId === coachId ? { ...account, active: false } : account,
      ),
    });
    failure(
      selectCoachClassHistory(input, coachId, coachActor, now),
      'IneligibleDemoAction',
      { reason: 'inactiveStaff' },
    );
    failure(
      selectCoachClassHistory(input, coachId, invitationActor, now),
      'IneligibleDemoAction',
      { reason: 'roleDenied' },
    );
  });

  it('reports a missing coach instead of returning an empty successful history', () => {
    failure(
      selectCoachClassHistory(
        freeze(state()),
        'staff:missing',
        memberActor,
        now,
      ),
      'DemoUnavailableState',
      { resource: 'staff', resourceId: 'staff:missing' },
    );
  });

  it('reports invalid time inputs rather than silently dropping history', () => {
    const input = freeze({ ...state(), classes: [scheduled()] });
    failure(
      selectCoachClassHistory(
        input,
        coachId,
        memberActor,
        '2026-13-01T16:00:00Z',
      ),
      'ValidationError',
      { fields: [{ field: 'now' }] },
    );
    for (const overrides of [
      { startsAt: '2026-13-01T16:00:00Z' },
      { endsAt: '2026-13-01T16:00:00Z' },
      { endsAt: '2026-10-01T15:00:00Z' },
    ] satisfies Partial<ScheduledClass>[]) {
      const invalid = freeze({ ...state(), classes: [scheduled(overrides)] });
      failure(
        selectCoachClassHistory(invalid, coachId, memberActor, now),
        'ValidationError',
      );
    }
  });
});
