import { describe, expect, it } from 'vitest';
import {
  createStaffAccount,
  deactivateStaffAccount,
  requireCapability,
  selectDemoCapabilities,
  updateStaffAccount,
} from './roles';
import type {
  DemoActor,
  DemoCapability,
  DemoState,
  DomainResult,
  StaffAccount,
  StaffAccountUpdate,
  StaffRole,
  UtcInstant,
} from './types';

const admin: StaffAccount = {
  staffId: 'staff:admin',
  identitySubject: 'identity:admin',
  active: true,
  assignedRoles: ['admin'],
  assignedClassIds: [],
};
const coach: StaffAccount = {
  ...admin,
  staffId: 'staff:coach',
  identitySubject: 'identity:coach',
  assignedRoles: ['coach'],
  assignedClassIds: ['class:own'],
  coachProfile: {
    displayName: 'Fictional Coach',
    avatarId: 'avatar:initials',
    biography: 'Fictional biography',
    certifications: [],
    contact: { email: 'coach@example.invalid' },
  },
};
const desk: StaffAccount = {
  ...admin,
  staffId: 'staff:desk',
  identitySubject: 'identity:desk',
  assignedRoles: ['frontDesk'],
};
const adminActor: DemoActor = { kind: 'staff', staffId: admin.staffId };
const coachActor: DemoActor = { kind: 'staff', staffId: coach.staffId };
const memberActor: DemoActor = { kind: 'member', memberId: 'member:demo' };
const inviteActor: DemoActor = {
  kind: 'invitation',
  invitationId: 'invitation:demo',
};
const now: UtcInstant = '2026-10-02T16:00:00Z';

function state(): DemoState {
  return {
    revision: 4,
    staffAccounts: [admin, desk, coach],
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
        issuedBy: admin.staffId,
        status: 'outstanding',
      },
    ],
    classes: ['class:own', 'class:other'].map((classId) => ({
      classId: classId === 'class:own' ? 'class:own' : 'class:other',
      schedule: {
        date: '2026-10-02',
        time: '09:00',
        timezone: 'America/Los_Angeles',
      },
      startsAt: now,
      endsAt: '2026-10-02T16:45:00Z',
      status: 'published',
      coachId: classId === 'class:own' ? coach.staffId : undefined,
      classTypeSnapshot: {
        classTypeId: 'classType:rowing',
        name: 'Fictional Rowing',
        durationMinutes: 45,
        description: 'Fictional class',
        difficulty: 'Illustrative beginner',
      },
      releasedAt: now,
      lateCancelWaived: false,
      reviewFlags: [],
    })),
    waivers: [],
    currentWaiverVersionId: null,
    waiverSignatures: [],
    stations: [],
    layout: { availability: 'current' },
    classTypes: [],
    weeklyTemplates: [],
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

function value<T>(result: DomainResult<T>): T {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.error.message);
  return result.value;
}

function denied(
  result: DomainResult<unknown>,
  reason: string,
  category = 'IneligibleDemoAction',
) {
  expect(result).toMatchObject({
    success: false,
    error: {
      category,
      ...(category === 'IneligibleDemoAction' ? { reason } : {}),
    },
  });
  if (!result.success) expect(result.error.message.trim()).not.toBe('');
}

const staffCapabilities: readonly DemoCapability[] = [
  'manageStaff',
  'manageSettings',
  'manageWaivers',
  'manageStations',
  'manageClassTypes',
  'manageTemplates',
  'manageSchedule',
  'viewSchedule',
  'manageMembers',
  'manageInvitations',
  'manageBookings',
  'manageWaitlists',
  'manageAttendance',
  'viewRoster',
  'reseatBookings',
  'manageNotifications',
  'manageCoachProfiles',
  'editOwnCoachProfile',
];
const deskCapabilities: readonly DemoCapability[] = [
  'viewSchedule',
  'manageMembers',
  'manageInvitations',
  'manageBookings',
  'manageWaitlists',
  'manageAttendance',
  'viewRoster',
  'reseatBookings',
  'manageNotifications',
];
const coachCapabilities: readonly DemoCapability[] = [
  'viewSchedule',
  'manageAttendance',
  'viewRoster',
  'reseatBookings',
  'editOwnCoachProfile',
];

describe('demo capability selection and guards', () => {
  it.each([
    [admin, staffCapabilities, 'all'],
    [desk, deskCapabilities, 'all'],
    [coach, coachCapabilities, 'assigned'],
  ] as const)(
    'derives the exact fixed-role matrix for %s',
    (account, expected, scope) => {
      const selected = value(
        selectDemoCapabilities(state(), {
          kind: 'staff',
          staffId: account.staffId,
        }),
      );
      expect([...selected.capabilities].sort()).toEqual([...expected].sort());
      expect(selected.classScope.kind).toBe(scope);
      for (const capability of staffCapabilities) {
        const result = requireCapability(
          state(),
          { kind: 'staff', staffId: account.staffId },
          capability,
          { classId: 'class:own', staffId: account.staffId },
        );
        expect(result.success).toBe(expected.includes(capability));
      }
    },
  );

  it('unions roles without duplicates and broadens class scope only for Admin or Front Desk', () => {
    const initial = state();
    const mixed = {
      ...coach,
      assignedRoles: ['coach', 'frontDesk', 'coach'] as const,
    };
    const selected = value(
      selectDemoCapabilities(
        { ...initial, staffAccounts: [mixed] },
        coachActor,
      ),
    );
    expect([...selected.capabilities].sort()).toEqual(
      [...new Set([...deskCapabilities, ...coachCapabilities])].sort(),
    );
    expect(selected.classScope).toEqual({ kind: 'all' });
    expect(
      requireCapability(
        { ...initial, staffAccounts: [mixed] },
        coachActor,
        'manageAttendance',
        {
          classId: 'class:other',
        },
      ).success,
    ).toBe(true);
    const combinedAdmin = {
      ...mixed,
      assignedRoles: ['coach', 'admin'] as const,
    };
    expect(
      value(
        selectDemoCapabilities(
          { ...initial, staffAccounts: [combinedAdmin] },
          coachActor,
        ),
      ).capabilities,
    ).toEqual(expect.arrayContaining([...staffCapabilities]));
  });

  it.each(['manageAttendance', 'viewRoster', 'reseatBookings'] as const)(
    'requires an existing assigned class for Coach %s',
    (capability) => {
      expect(
        requireCapability(state(), coachActor, capability, {
          classId: 'class:own',
        }).success,
      ).toBe(true);
      denied(
        requireCapability(state(), coachActor, capability, {
          classId: 'class:other',
        }),
        'classScopeDenied',
      );
      denied(
        requireCapability(state(), coachActor, capability),
        'classScopeDenied',
      );
      denied(
        requireCapability(state(), coachActor, capability, {
          classId: 'class:missing',
        }),
        '',
        'DemoUnavailableState',
      );
    },
  );

  it('uses only the selected account and does not infer assignments from class coach IDs', () => {
    const initial = state();
    const unassigned = { ...coach, assignedClassIds: [] };
    denied(
      requireCapability(
        { ...initial, staffAccounts: [admin, unassigned] },
        coachActor,
        'viewRoster',
        {
          classId: 'class:own',
        },
      ),
      'classScopeDenied',
    );
    denied(requireCapability(initial, coachActor, 'manageStaff'), 'roleDenied');
    expect(value(selectDemoCapabilities(initial)).capabilities).toEqual(
      staffCapabilities,
    );
  });

  it('restricts own-profile editing to the selected staff account', () => {
    expect(
      requireCapability(state(), coachActor, 'editOwnCoachProfile', {
        staffId: coach.staffId,
      }).success,
    ).toBe(true);
    denied(
      requireCapability(state(), coachActor, 'editOwnCoachProfile', {
        staffId: admin.staffId,
      }),
      'roleDenied',
    );
    denied(
      requireCapability(state(), coachActor, 'editOwnCoachProfile'),
      'roleDenied',
    );
    expect(
      requireCapability(state(), adminActor, 'manageCoachProfiles').success,
    ).toBe(true);
    denied(
      requireCapability(
        state(),
        { kind: 'staff', staffId: desk.staffId },
        'editOwnCoachProfile',
        {
          staffId: desk.staffId,
        },
      ),
      'roleDenied',
    );
  });

  it.each(staffCapabilities)(
    'denies inactive staff capability %s',
    (capability) => {
      const initial = {
        ...state(),
        staffAccounts: [{ ...admin, active: false }],
      };
      denied(selectDemoCapabilities(initial), 'inactiveStaff');
      denied(
        requireCapability(initial, adminActor, capability, {
          classId: 'class:own',
          staffId: admin.staffId,
        }),
        'inactiveStaff',
      );
    },
  );

  it('returns explicit unavailable errors for missing actors', () => {
    denied(
      selectDemoCapabilities(state(), {
        kind: 'staff',
        staffId: 'staff:missing',
      }),
      '',
      'DemoUnavailableState',
    );
    denied(
      selectDemoCapabilities(state(), {
        kind: 'member',
        memberId: 'member:missing',
      }),
      '',
      'DemoUnavailableState',
    );
    denied(
      selectDemoCapabilities(state(), {
        kind: 'invitation',
        invitationId: 'invitation:missing',
      }),
      '',
      'DemoUnavailableState',
    );
  });

  it('exposes member capabilities only to the member persona and protects own targets', () => {
    const expected: readonly DemoCapability[] = [
      'viewSchedule',
      'signWaiver',
      'bookStation',
      'cancelOwnBooking',
      'moveOwnBooking',
      'manageOwnWaitlist',
      'selfCheckIn',
    ];
    expect(
      [
        ...value(selectDemoCapabilities(state(), memberActor)).capabilities,
      ].sort(),
    ).toEqual([...expected].sort());
    expect(
      value(selectDemoCapabilities(state(), memberActor)).classScope,
    ).toEqual({ kind: 'none' });
    for (const capability of expected) {
      expect(requireCapability(state(), memberActor, capability).success).toBe(
        true,
      );
      denied(
        requireCapability(
          state(),
          adminActor,
          capability === 'viewSchedule' ? 'bookStation' : capability,
        ),
        'roleDenied',
      );
      if (capability !== 'viewSchedule') {
        denied(
          requireCapability(state(), memberActor, capability, {
            memberId: 'member:other',
          }),
          'roleDenied',
        );
      }
    }
    denied(
      requireCapability(state(), memberActor, 'manageMembers'),
      'roleDenied',
    );
    denied(
      requireCapability(state(), memberActor, 'acceptInvitation'),
      'roleDenied',
    );
  });

  it.each(['pending', 'inactive'] as const)(
    'withholds booking/check-in capabilities from %s members',
    (status) => {
      const initial = state();
      const changed = {
        ...initial,
        members: initial.members.map((member) => ({ ...member, status })),
      };
      expect(
        value(selectDemoCapabilities(changed, memberActor)).capabilities,
      ).toEqual(['viewSchedule', 'signWaiver']);
      for (const capability of [
        'bookStation',
        'cancelOwnBooking',
        'moveOwnBooking',
        'manageOwnWaitlist',
        'selfCheckIn',
      ] as const) {
        denied(
          requireCapability(changed, memberActor, capability),
          'memberInactive',
        );
      }
    },
  );

  it('limits an outstanding invitation persona to acceptance of that invitation', () => {
    expect(
      value(selectDemoCapabilities(state(), inviteActor)).capabilities,
    ).toEqual(['acceptInvitation']);
    expect(
      requireCapability(state(), inviteActor, 'acceptInvitation').success,
    ).toBe(true);
    denied(
      requireCapability(state(), inviteActor, 'acceptInvitation', {
        invitationId: 'invitation:other',
      }),
      'roleDenied',
    );
    denied(
      requireCapability(state(), inviteActor, 'bookStation'),
      'roleDenied',
    );
  });

  it('rejects revoked, accepted, superseded and expired invitation personas, including exact expiry', () => {
    const initial = state();
    const base = initial.invitations[0];
    for (const invitation of [
      {
        ...base,
        status: 'revoked' as const,
        revokedAt: now,
        revokedBy: admin.staffId,
      },
      {
        ...base,
        status: 'accepted' as const,
        acceptedAt: now,
        memberId: 'member:demo' as const,
      },
      {
        ...base,
        status: 'superseded' as const,
        supersededAt: now,
        replacementId: 'invitation:replacement' as const,
      },
      { ...base, status: 'expired' as const, expiredAt: now },
      { ...base, expiresAt: now },
    ]) {
      expect(
        selectDemoCapabilities(
          { ...initial, invitations: [invitation] },
          inviteActor,
        ).success,
      ).toBe(false);
    }
  });

  it('surfaces invalid invitation expiry or demo clock instead of allowing acceptance', () => {
    const initial = state();
    const invalidInstant = '2026-99-99T16:00:00Z';
    denied(
      selectDemoCapabilities(
        {
          ...initial,
          invitations: initial.invitations.map((invitation) => ({
            ...invitation,
            expiresAt: invalidInstant,
          })),
        },
        inviteActor,
      ),
      '',
      'ValidationError',
    );
    denied(
      selectDemoCapabilities(
        {
          ...initial,
          clock: { ...initial.clock, now: invalidInstant },
        },
        inviteActor,
      ),
      '',
      'ValidationError',
    );
  });

  it('fails closed for a malformed fixed role in a selected account', () => {
    const initial = state();
    for (const assignedRoles of [
      [],
      ['custom'],
    ] as unknown as readonly (readonly StaffRole[])[]) {
      denied(
        selectDemoCapabilities({
          ...initial,
          staffAccounts: [{ ...admin, assignedRoles }],
        }),
        '',
        'ValidationError',
      );
    }
  });

  it('does not leak mutable selector arrays into state', () => {
    const initial = state();
    const selected = value(selectDemoCapabilities(initial, coachActor));
    if (selected.classScope.kind !== 'assigned')
      throw new Error('Expected assigned scope');
    expect(selected.classScope.classIds).not.toBe(coach.assignedClassIds);
    expect(
      value(selectDemoCapabilities(initial, coachActor)).capabilities,
    ).not.toBe(selected.capabilities);
  });
});

describe('Admin staff-account transitions', () => {
  const newStaff: StaffAccount = {
    ...coach,
    staffId: 'staff:new',
    identitySubject: 'identity:new',
    assignedRoles: ['coach', 'frontDesk'],
  };

  it('creates a fictional fixed-role account as collection replacements without touching input', () => {
    const initial = state();
    const before = structuredClone(initial);
    const changes = value(createStaffAccount(initial, adminActor, newStaff));
    expect(changes).toEqual({
      staffAccounts: [...initial.staffAccounts, newStaff],
    });
    expect(changes.staffAccounts).not.toBe(initial.staffAccounts);
    expect(changes.staffAccounts?.[3]).not.toBe(newStaff);
    expect(changes.staffAccounts?.[3].assignedRoles).not.toBe(
      newStaff.assignedRoles,
    );
    expect(changes.staffAccounts?.[3].coachProfile?.contact).not.toBe(
      newStaff.coachProfile?.contact,
    );
    expect(initial).toEqual(before);
  });

  it('updates roles, assignments, identity and activation while preserving stable ID and profile', () => {
    const initial = state();
    const before = structuredClone(initial);
    const changes = value(
      updateStaffAccount(initial, adminActor, coach.staffId, {
        assignedRoles: ['frontDesk', 'coach'],
        assignedClassIds: ['class:other'],
        identitySubject: 'identity:updated',
        active: false,
      }),
    );
    expect(changes.staffAccounts?.[2]).toEqual({
      ...coach,
      assignedRoles: ['frontDesk', 'coach'],
      assignedClassIds: ['class:other'],
      identitySubject: 'identity:updated',
      active: false,
    });
    expect(changes.staffAccounts?.[0]).toBe(admin);
    expect(initial).toEqual(before);
    const applied = { ...initial, ...changes };
    denied(
      requireCapability(applied, coachActor, 'viewSchedule'),
      'inactiveStaff',
    );
    expect(
      value(
        updateStaffAccount(applied, adminActor, coach.staffId, {
          active: true,
        }),
      ).staffAccounts?.[2].active,
    ).toBe(true);
  });

  it('deactivates without deleting assignments, profile or linked history, and allows repeat deactivation', () => {
    const initial = state();
    const changes = value(
      deactivateStaffAccount(initial, adminActor, coach.staffId),
    );
    expect(changes).toEqual({
      staffAccounts: [admin, desk, { ...coach, active: false }],
    });
    const applied = { ...initial, ...changes };
    expect(applied.classes).toBe(initial.classes);
    expect(applied.attendance).toBe(initial.attendance);
    expect(
      value(deactivateStaffAccount(applied, adminActor, coach.staffId)),
    ).toEqual(changes);
  });

  it.each([
    coachActor,
    { kind: 'staff', staffId: desk.staffId } as const,
    memberActor,
    inviteActor,
  ])(
    'rejects all staff management by a non-Admin actor %s without mutation',
    (actor) => {
      const initial = state();
      const before = structuredClone(initial);
      denied(createStaffAccount(initial, actor, newStaff), 'roleDenied');
      denied(
        updateStaffAccount(initial, actor, coach.staffId, { active: false }),
        'roleDenied',
      );
      denied(
        deactivateStaffAccount(initial, actor, coach.staffId),
        'roleDenied',
      );
      expect(initial).toEqual(before);
    },
  );

  it('denies inactive Admins even when managing their own activation', () => {
    const initial = {
      ...state(),
      staffAccounts: [{ ...admin, active: false }, coach],
    };
    denied(createStaffAccount(initial, adminActor, newStaff), 'inactiveStaff');
    denied(
      updateStaffAccount(initial, adminActor, admin.staffId, { active: true }),
      'inactiveStaff',
    );
    denied(
      deactivateStaffAccount(initial, adminActor, coach.staffId),
      'inactiveStaff',
    );
  });

  it('rejects duplicate staff IDs and identity subjects on creation/update', () => {
    const initial = state();
    denied(
      createStaffAccount(initial, adminActor, admin),
      '',
      'ValidationError',
    );
    denied(
      createStaffAccount(initial, adminActor, {
        ...newStaff,
        identitySubject: admin.identitySubject,
      }),
      '',
      'ValidationError',
    );
    denied(
      updateStaffAccount(initial, adminActor, coach.staffId, {
        identitySubject: desk.identitySubject,
      }),
      '',
      'ValidationError',
    );
    expect(
      updateStaffAccount(initial, adminActor, coach.staffId, {
        identitySubject: coach.identitySubject,
      }).success,
    ).toBe(true);
  });

  it('reports missing staff and invalid class assignments explicitly', () => {
    denied(
      updateStaffAccount(state(), adminActor, 'staff:missing', {}),
      '',
      'DemoUnavailableState',
    );
    denied(
      deactivateStaffAccount(state(), adminActor, 'staff:missing'),
      '',
      'DemoUnavailableState',
    );
    denied(
      createStaffAccount(state(), adminActor, {
        ...newStaff,
        assignedClassIds: ['class:missing'],
      }),
      '',
      'DemoUnavailableState',
    );
    denied(
      updateStaffAccount(state(), adminActor, coach.staffId, {
        assignedClassIds: ['class:missing'],
      }),
      '',
      'DemoUnavailableState',
    );
  });

  it('validates a nonempty fixed role set, unique roles/assignments, identity and activation', () => {
    const invalidUpdates: readonly StaffAccountUpdate[] = [
      { assignedRoles: [] },
      { assignedRoles: ['coach', 'coach'] },
      { assignedClassIds: ['class:own', 'class:own'] },
      { identitySubject: 'identity:' },
      { identitySubject: 'identity:   ' },
      { assignedRoles: ['custom'] as unknown as readonly StaffRole[] },
      { active: 'yes' as unknown as boolean },
    ];
    const initial = state();
    const before = structuredClone(initial);
    for (const updates of invalidUpdates) {
      denied(
        createStaffAccount(initial, adminActor, { ...newStaff, ...updates }),
        '',
        'ValidationError',
      );
      denied(
        updateStaffAccount(initial, adminActor, coach.staffId, updates),
        '',
        'ValidationError',
      );
    }
    denied(
      createStaffAccount(initial, adminActor, {
        ...newStaff,
        staffId: 'staff:',
      }),
      '',
      'ValidationError',
    );
    expect(initial).toEqual(before);
  });

  it('rejects out-of-contract update fields instead of rewriting stable ID or coach profile', () => {
    const updates = {
      active: true,
      staffId: 'staff:hijacked',
      coachProfile: undefined,
    };
    denied(
      updateStaffAccount(state(), adminActor, coach.staffId, updates),
      '',
      'ValidationError',
    );
  });

  it('reports explicitly supplied undefined access fields as validation failures', () => {
    const updates: readonly StaffAccountUpdate[] = [
      { identitySubject: undefined },
      { active: undefined },
      { assignedRoles: undefined },
      { assignedClassIds: undefined },
    ];
    for (const update of updates) {
      denied(
        updateStaffAccount(state(), adminActor, coach.staffId, update),
        '',
        'ValidationError',
      );
    }
  });

  it('does not retain writable request arrays or profile objects in accepted changes', () => {
    const roles: StaffRole[] = ['coach'];
    const classes: StaffAccount['assignedClassIds'][number][] = ['class:own'];
    const updates = value(
      updateStaffAccount(state(), adminActor, coach.staffId, {
        assignedRoles: roles,
        assignedClassIds: classes,
      }),
    );
    roles.push('admin');
    classes.push('class:other');
    expect(updates.staffAccounts?.[2].assignedRoles).toEqual(['coach']);
    expect(updates.staffAccounts?.[2].assignedClassIds).toEqual(['class:own']);
  });
});
