import { describe, expect, it } from 'vitest';
import {
  checkMemberEligibility,
  countActiveMembers,
  expireInvitations,
  validateMembershipAction,
} from './membership';
import type { MembershipAction } from './membership';
import type {
  AcceptedAction,
  DemoActor,
  DemoState,
  DomainError,
  DomainResult,
  Invitation,
  InvitationAcceptanceInput,
  Member,
  MemberId,
  MemberProfileUpdate,
  UtcInstant,
} from './types';

const now: UtcInstant = '2026-10-02T16:00:00Z';
const later: UtcInstant = '2026-10-02T17:00:00Z';
const admin: DemoActor = { kind: 'staff', staffId: 'staff:admin' };
const invitee: DemoActor = {
  kind: 'invitation',
  invitationId: 'invitation:new',
};
const invitation: Invitation = {
  invitationId: 'invitation:new',
  email: 'invitee@example.invalid',
  issuedAt: '2026-10-02T15:00:00Z',
  expiresAt: later,
  issuedBy: 'staff:admin',
  status: 'outstanding',
};
const input: InvitationAcceptanceInput = {
  invitationId: invitation.invitationId,
  memberId: 'member:new',
  signatureId: 'signature:new',
  displayName: ' Demo Invitee ',
  adultAttested: true,
  identity: {
    outcome: 'verified',
    subject: 'identity:new',
    verifiedEmail: ' INVITEE@example.invalid ',
  },
  waiver: { waiverVersionId: 'waiver:current', typedName: ' Demo Invitee ' },
};

function member(
  memberId: MemberId = 'member:existing',
  status: Member['status'] = 'active',
): Member {
  return {
    memberId,
    displayName: 'Existing Demo',
    verifiedEmail: `${memberId.slice(7)}@example.invalid`,
    identitySubject: `identity:${memberId.slice(7)}`,
    status,
    invitationId: `invitation:${memberId.slice(7)}`,
    adultAttestationAt: now,
    adultEligibility: 'attested',
    createdAt: now,
  };
}

function state(overrides: Partial<DemoState> = {}): DemoState {
  return {
    revision: 7,
    staffAccounts: [
      {
        staffId: 'staff:admin',
        identitySubject: 'identity:admin',
        active: true,
        assignedRoles: ['admin'],
        assignedClassIds: [],
      },
      {
        staffId: 'staff:desk',
        identitySubject: 'identity:desk',
        active: true,
        assignedRoles: ['frontDesk'],
        assignedClassIds: [],
      },
      {
        staffId: 'staff:coach',
        identitySubject: 'identity:coach',
        active: true,
        assignedRoles: ['coach'],
        assignedClassIds: [],
      },
    ],
    members: [],
    invitations: [invitation],
    waivers: [
      {
        waiverVersionId: 'waiver:current',
        version: 1,
        text: 'Fictional waiver.',
        createdAt: now,
        publishedAt: now,
        status: 'published',
      },
    ],
    currentWaiverVersionId: 'waiver:current',
    waiverSignatures: [],
    stations: [],
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
      memberCap: 2,
      invitationExpiryMinutes: 60,
      scheduleRelease: { mode: 'immediate' },
      targetGapMinutes: 30,
      waitlistCutoffMinutes: 30,
      lateCancelCutoffMinutes: 60,
      checkInLeadMinutes: 30,
      checkInGraceMinutes: 5,
    },
    activeActor: admin,
    scenarioId: 'scenario:membership',
    clock: { now, presetId: null },
    simulation: { delivery: 'success', identity: 'verified' },
    ...overrides,
  };
}

function accepted(result: DomainResult<AcceptedAction>): AcceptedAction {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.error.message);
  return result.value;
}

function error<T>(result: DomainResult<T>): DomainError {
  expect(result.success).toBe(false);
  if (result.success) throw new Error('Expected a rejected transition.');
  return result.error;
}

function apply(snapshot: DemoState, transition: AcceptedAction): DemoState {
  return { ...snapshot, ...transition.changes };
}

function accept(snapshot = state(), payload = input, at = now) {
  return validateMembershipAction(
    snapshot,
    invitee,
    { type: 'acceptInvitation', payload },
    at,
  );
}

function enrolled(status: Member['status'] = 'active'): DemoState {
  const person = member();
  return state({
    members: [{ ...person, status }],
    invitations: [
      {
        ...invitation,
        invitationId: person.invitationId,
        email: person.verifiedEmail,
        status: 'accepted',
        acceptedAt: now,
        memberId: person.memberId,
      },
    ],
    waiverSignatures: [
      {
        signatureId: 'signature:existing',
        memberId: person.memberId,
        waiverVersionId: 'waiver:current',
        typedName: person.displayName,
        signedAt: now,
      },
    ],
    bookings: [
      {
        bookingId: 'booking:existing',
        memberId: person.memberId,
        classId: 'class:future',
        stationId: 'station:one',
        bookedAt: now,
        attendanceRecordId: 'attendance:one',
        status: 'booked',
        reviewFlags: ['stationOutOfService'],
      },
    ],
    waitlistEntries: [
      {
        entryId: 'waitlist:existing',
        memberId: person.memberId,
        classId: 'class:other',
        joinOrder: 4,
        joinedAt: now,
        status: 'waiting',
        reviewFlags: ['waiverOutdated'],
      },
    ],
    attendance: [
      {
        attendanceId: 'attendance:one',
        memberId: person.memberId,
        classId: 'class:future',
        bookingId: 'booking:existing',
        currentOutcome: 'booked',
        checkIn: { status: 'notCheckedIn' },
        source: { kind: 'booking', bookingId: 'booking:existing' },
        corrections: [],
      },
    ],
  });
}

describe('invitation lifecycle', () => {
  it('creates normalized invitations without reserving capacity in an accepted envelope', () => {
    const snapshot = state();
    const action = {
      type: 'createInvitation',
      payload: {
        invitationId: 'invitation:another',
        email: ' NEW@example.invalid ',
      },
    } satisfies Parameters<typeof validateMembershipAction>[2];
    const result = accepted(
      validateMembershipAction(snapshot, admin, action, now),
    );
    expect(result).toMatchObject({
      type: 'accepted',
      action,
      actor: admin,
      validatedAt: now,
      baseRevision: 7,
      warnings: [],
    });
    expect(result.changes.invitations?.at(-1)).toEqual({
      invitationId: 'invitation:another',
      email: 'new@example.invalid',
      issuedAt: now,
      expiresAt: later,
      issuedBy: 'staff:admin',
      status: 'outstanding',
    });
    expect(result.changes.members).toBeUndefined();
    expect(snapshot.invitations).toEqual([invitation]);
  });

  it('resends by superseding the old link and restarting expiration', () => {
    const snapshot = state();
    const at: UtcInstant = '2026-10-02T16:30:00Z';
    const result = accepted(
      validateMembershipAction(
        snapshot,
        admin,
        {
          type: 'resendInvitation',
          payload: {
            invitationId: invitation.invitationId,
            replacementId: 'invitation:replacement',
          },
        },
        at,
      ),
    );
    expect(result.changes.invitations).toEqual([
      {
        ...invitation,
        status: 'superseded',
        supersededAt: at,
        replacementId: 'invitation:replacement',
      },
      {
        invitationId: 'invitation:replacement',
        email: invitation.email,
        issuedAt: at,
        expiresAt: '2026-10-02T17:30:00Z',
        issuedBy: 'staff:admin',
        status: 'outstanding',
      },
    ]);
    expect(error(accept(apply(snapshot, result)))).toMatchObject({
      reason: 'invitationRevoked',
    });
  });

  it('revokes an outstanding invitation with staff evidence', () => {
    const snapshot = state();
    const result = accepted(
      validateMembershipAction(
        snapshot,
        admin,
        {
          type: 'revokeInvitation',
          payload: { invitationId: invitation.invitationId },
        },
        now,
      ),
    );
    expect(result.changes.invitations?.[0]).toEqual({
      ...invitation,
      status: 'revoked',
      revokedAt: now,
      revokedBy: 'staff:admin',
    });
    expect(error(accept(apply(snapshot, result)))).toMatchObject({
      reason: 'invitationRevoked',
    });
  });

  it('expires exactly at the deadline, preserves terminal history, and is idempotent', () => {
    const snapshot = state({
      invitations: [
        invitation,
        {
          ...invitation,
          invitationId: 'invitation:revoked',
          status: 'revoked',
          revokedAt: now,
          revokedBy: 'staff:admin',
        },
      ],
    });
    const result = expireInvitations(snapshot, later);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error.message);
    expect(result.value.invitations?.[0]).toEqual({
      ...invitation,
      status: 'expired',
      expiredAt: later,
    });
    expect(result.value.invitations?.[1]).toBe(snapshot.invitations[1]);
    expect(expireInvitations({ ...snapshot, ...result.value }, later)).toEqual({
      success: true,
      value: {},
    });
    expect(error(accept(snapshot, input, later))).toMatchObject({
      reason: 'invitationExpired',
    });
  });

  it.each(['accepted', 'revoked', 'expired', 'superseded'] as const)(
    'does not resend or revoke a %s link',
    (status) => {
      const terminal: Invitation =
        status === 'accepted'
          ? { ...invitation, status, acceptedAt: now, memberId: 'member:old' }
          : status === 'revoked'
            ? {
                ...invitation,
                status,
                revokedAt: now,
                revokedBy: 'staff:admin',
              }
            : status === 'expired'
              ? { ...invitation, status, expiredAt: now }
              : {
                  ...invitation,
                  status,
                  supersededAt: now,
                  replacementId: 'invitation:other',
                };
      const snapshot = state({ invitations: [terminal] });
      for (const action of [
        {
          type: 'resendInvitation',
          payload: {
            invitationId: invitation.invitationId,
            replacementId: 'invitation:replacement',
          },
        },
        {
          type: 'revokeInvitation',
          payload: { invitationId: invitation.invitationId },
        },
      ] satisfies MembershipAction[]) {
        expect(
          error(validateMembershipAction(snapshot, admin, action, now))
            .category,
        ).toBe('IneligibleDemoAction');
      }
    },
  );

  it('rejects expired resend/revoke and permits a fresh invitation after expiry', () => {
    const snapshot = state();
    for (const action of [
      {
        type: 'resendInvitation',
        payload: {
          invitationId: invitation.invitationId,
          replacementId: 'invitation:replacement',
        },
      },
      {
        type: 'revokeInvitation',
        payload: { invitationId: invitation.invitationId },
      },
    ] satisfies MembershipAction[]) {
      expect(
        error(validateMembershipAction(snapshot, admin, action, later)),
      ).toMatchObject({ reason: 'invitationExpired' });
    }
    const result = accepted(
      validateMembershipAction(
        snapshot,
        admin,
        {
          type: 'createInvitation',
          payload: {
            invitationId: 'invitation:fresh',
            email: invitation.email,
          },
        },
        later,
      ),
    );
    expect(result.changes.invitations?.[0].status).toBe('expired');
    expect(result.changes.invitations?.at(-1)?.status).toBe('outstanding');
  });

  it.each(['pending', 'active'] as const)(
    'rejects duplicate email for a %s member',
    (status) => {
      const snapshot = state({
        members: [
          { ...member('member:old', status), verifiedEmail: invitation.email },
        ],
      });
      expect(
        error(
          validateMembershipAction(
            snapshot,
            admin,
            {
              type: 'createInvitation',
              payload: {
                invitationId: 'invitation:another',
                email: ' INVITEE@example.invalid ',
              },
            },
            now,
          ),
        ),
      ).toMatchObject({
        category: 'DemoConflict',
        conflict: { kind: 'duplicateEmail' },
      });
      expect(error(accept(snapshot))).toMatchObject({
        category: 'DemoConflict',
      });
    },
  );

  it('rejects duplicate outstanding email and IDs, but inactive profiles do not reserve email', () => {
    const snapshot = state();
    expect(
      error(
        validateMembershipAction(
          snapshot,
          admin,
          {
            type: 'createInvitation',
            payload: {
              invitationId: 'invitation:another',
              email: invitation.email.toUpperCase(),
            },
          },
          now,
        ),
      ),
    ).toMatchObject({ conflict: { kind: 'duplicateEmail' } });
    expect(
      error(
        validateMembershipAction(
          snapshot,
          admin,
          {
            type: 'resendInvitation',
            payload: {
              invitationId: invitation.invitationId,
              replacementId: invitation.invitationId,
            },
          },
          now,
        ),
      ),
    ).toMatchObject({ category: 'ValidationError' });
    const inactive = state({
      members: [
        {
          ...member('member:old', 'inactive'),
          verifiedEmail: 'other@example.invalid',
        },
      ],
    });
    expect(
      validateMembershipAction(
        inactive,
        admin,
        {
          type: 'createInvitation',
          payload: {
            invitationId: 'invitation:other',
            email: 'other@example.invalid',
          },
        },
        now,
      ).success,
    ).toBe(true);
  });
});

describe('atomic invitation acceptance', () => {
  it('creates the stable profile and current waiver evidence while consuming the link once', () => {
    const snapshot = state();
    const result = accepted(accept(snapshot));
    expect(result.changes.members).toEqual([
      {
        memberId: input.memberId,
        displayName: 'Demo Invitee',
        verifiedEmail: invitation.email,
        identitySubject: 'identity:new',
        status: 'active',
        invitationId: invitation.invitationId,
        adultAttestationAt: now,
        adultEligibility: 'attested',
        createdAt: now,
      },
    ]);
    expect(result.changes.waiverSignatures).toEqual([
      {
        signatureId: input.signatureId,
        memberId: input.memberId,
        waiverVersionId: 'waiver:current',
        typedName: 'Demo Invitee',
        signedAt: now,
      },
    ]);
    expect(result.changes.invitations?.[0]).toEqual({
      ...invitation,
      status: 'accepted',
      acceptedAt: now,
      memberId: input.memberId,
    });
    expect(error(accept(apply(snapshot, result)))).toMatchObject({
      reason: 'invitationNotAccepted',
    });
  });

  it('retains acceptance as pending at cap and counts only active profiles', () => {
    const snapshot = state({
      members: [
        member(),
        member('member:pending', 'pending'),
        member('member:inactive', 'inactive'),
      ],
    });
    const atCap = {
      ...snapshot,
      settings: { ...snapshot.settings, memberCap: 1 },
    };
    expect(countActiveMembers(atCap)).toBe(1);
    const result = accepted(accept(atCap));
    expect(result.changes.members?.at(-1)?.status).toBe('pending');
    expect(result.changes.waiverSignatures).toHaveLength(1);
    expect(result.changes.invitations?.[0].status).toBe('accepted');
    expect(
      error(checkMemberEligibility(apply(atCap, result), input.memberId)),
    ).toMatchObject({ reason: 'memberInactive' });
    expect(accepted(accept(snapshot)).changes.members?.at(-1)?.status).toBe(
      'active',
    );
    expect(
      accepted(
        accept({
          ...snapshot,
          settings: { ...snapshot.settings, memberCap: 0 },
        }),
      ).changes.members?.at(-1)?.status,
    ).toBe('pending');
  });

  it.each([
    { ...input, displayName: ' ' },
    { ...input, adultAttested: false },
    { ...input, waiver: { ...input.waiver, typedName: ' ' } },
    { ...input, identity: { outcome: 'rejected', message: 'Demo rejection.' } },
    {
      ...input,
      identity: {
        outcome: 'mismatched',
        subject: 'identity:new',
        verifiedEmail: invitation.email,
      },
    },
    {
      ...input,
      identity: {
        outcome: 'verified',
        subject: 'identity:new',
        verifiedEmail: 'wrong@example.invalid',
      },
    },
    { ...input, waiver: { ...input.waiver, waiverVersionId: 'waiver:old' } },
  ] satisfies InvitationAcceptanceInput[])(
    'rejects incomplete or mismatched evidence without changing state: %j',
    (payload) => {
      const snapshot = state();
      const before = structuredClone(snapshot);
      expect(accept(snapshot, payload).success).toBe(false);
      expect(snapshot).toEqual(before);
    },
  );

  it('returns distinct identity and adult/waiver errors', () => {
    expect(
      error(accept(state(), { ...input, adultAttested: false })),
    ).toMatchObject({ reason: 'adultEligibilityDenied' });
    expect(
      error(
        accept(state(), {
          ...input,
          identity: { outcome: 'rejected', message: 'Rejected.' },
        }),
      ),
    ).toMatchObject({ reason: 'identityRejected' });
    expect(
      error(
        accept(state(), {
          ...input,
          identity: {
            outcome: 'mismatched',
            subject: 'identity:new',
            verifiedEmail: invitation.email,
          },
        }),
      ),
    ).toMatchObject({ reason: 'identityMismatch' });
    expect(
      error(
        accept(state(), {
          ...input,
          waiver: { ...input.waiver, waiverVersionId: 'waiver:old' },
        }),
      ),
    ).toMatchObject({ reason: 'waiverOutdated' });
  });

  it('requires an available published current waiver', () => {
    for (const snapshot of [
      state({ currentWaiverVersionId: null }),
      state({ waivers: [] }),
      state({
        waivers: [
          {
            waiverVersionId: 'waiver:current',
            version: 1,
            text: 'Draft',
            createdAt: now,
            status: 'draft',
          },
        ],
      }),
    ]) {
      expect(error(accept(snapshot))).toMatchObject({
        category: 'DemoUnavailableState',
        resource: 'waiver',
      });
    }
  });

  it('rejects reused member IDs, signature IDs, and identity subjects', () => {
    expect(
      error(accept(state({ members: [member(input.memberId, 'inactive')] }))),
    ).toMatchObject({ category: 'ValidationError' });
    const snapshot = enrolled();
    expect(
      error(
        accept(
          state({
            waiverSignatures: [
              {
                ...snapshot.waiverSignatures[0],
                signatureId: input.signatureId,
              },
            ],
          }),
        ),
      ),
    ).toMatchObject({ category: 'ValidationError' });
    expect(
      error(
        accept(
          state({
            members: [
              {
                ...member('member:old', 'inactive'),
                identitySubject: 'identity:new',
              },
            ],
          }),
        ),
      ),
    ).toMatchObject({ category: 'ValidationError' });
  });

  it('rejects future-issued invitations and future-published waiver evidence', () => {
    expect(
      accept(state({ invitations: [{ ...invitation, issuedAt: later }] }))
        .success,
    ).toBe(false);
    expect(
      accept(
        state({
          waivers: [
            {
              waiverVersionId: 'waiver:current',
              version: 1,
              text: 'Future',
              createdAt: now,
              publishedAt: later,
              status: 'published',
            },
          ],
        }),
      ).success,
    ).toBe(false);
  });
});

describe('membership status and stable history', () => {
  it('deactivates without cancelling, reassigning, or deleting bookings, queues, and attendance', () => {
    const snapshot = enrolled();
    const before = structuredClone(snapshot);
    const result = accepted(
      validateMembershipAction(
        snapshot,
        admin,
        {
          type: 'setMemberStatus',
          payload: { memberId: 'member:existing', status: 'inactive' },
        },
        now,
      ),
    );
    const changed = apply(snapshot, result);
    expect(changed.members[0].status).toBe('inactive');
    expect(changed.bookings[0]).toEqual({
      ...snapshot.bookings[0],
      reviewFlags: ['stationOutOfService', 'memberInactive'],
    });
    expect(changed.waitlistEntries[0]).toEqual({
      ...snapshot.waitlistEntries[0],
      reviewFlags: ['waiverOutdated', 'memberInactive'],
    });
    expect(changed.attendance).toBe(snapshot.attendance);
    expect(changed.waiverSignatures).toBe(snapshot.waiverSignatures);
    expect(snapshot).toEqual(before);
    const repeated = accepted(
      validateMembershipAction(
        changed,
        admin,
        {
          type: 'setMemberStatus',
          payload: { memberId: 'member:existing', status: 'inactive' },
        },
        now,
      ),
    );
    expect(
      repeated.changes.bookings?.[0].reviewFlags.filter(
        (flag) => flag === 'memberInactive',
      ),
    ).toHaveLength(1);
    expect(
      error(checkMemberEligibility(changed, 'member:existing')),
    ).toMatchObject({ reason: 'memberInactive' });
  });

  it.each(['pending', 'inactive'] as const)(
    'activates %s after cap and current waiver checks',
    (status) => {
      const snapshot = enrolled(status);
      const atCap = {
        ...snapshot,
        members: [...snapshot.members, member('member:other')],
        settings: { ...snapshot.settings, memberCap: 1 },
      };
      expect(
        error(
          validateMembershipAction(
            atCap,
            admin,
            {
              type: 'setMemberStatus',
              payload: { memberId: 'member:existing', status: 'active' },
            },
            now,
          ),
        ),
      ).toMatchObject({ reason: 'memberCapReached' });
      const result = accepted(
        validateMembershipAction(
          snapshot,
          admin,
          {
            type: 'setMemberStatus',
            payload: { memberId: 'member:existing', status: 'active' },
          },
          now,
        ),
      );
      expect(result.changes.members?.[0].status).toBe('active');
      expect(
        checkMemberEligibility(apply(snapshot, result), 'member:existing')
          .success,
      ).toBe(true);
      expect(
        error(
          validateMembershipAction(
            { ...snapshot, waiverSignatures: [] },
            admin,
            {
              type: 'setMemberStatus',
              payload: { memberId: 'member:existing', status: 'active' },
            },
            now,
          ),
        ),
      ).toMatchObject({ reason: 'waiverMissing' });
    },
  );

  it('does not count the already active member twice, even after lowering the cap', () => {
    const snapshot = enrolled();
    for (const memberCap of [1, 0]) {
      expect(
        validateMembershipAction(
          { ...snapshot, settings: { ...snapshot.settings, memberCap } },
          admin,
          {
            type: 'setMemberStatus',
            payload: { memberId: 'member:existing', status: 'active' },
          },
          now,
        ).success,
      ).toBe(true);
    }
  });

  it('removes only live member-inactive flags on reactivation and preserves terminal history', () => {
    const snapshot = enrolled('inactive');
    const flagged = {
      ...snapshot,
      bookings: snapshot.bookings.map((booking) => ({
        ...booking,
        reviewFlags: ['stationOutOfService', 'memberInactive'] as const,
      })),
      waitlistEntries: snapshot.waitlistEntries.map((entry) => ({
        ...entry,
        reviewFlags: ['waiverOutdated', 'memberInactive'] as const,
      })),
    };
    const result = accepted(
      validateMembershipAction(
        flagged,
        admin,
        {
          type: 'setMemberStatus',
          payload: { memberId: 'member:existing', status: 'active' },
        },
        now,
      ),
    );
    expect(result.changes.bookings?.[0].reviewFlags).toEqual([
      'stationOutOfService',
    ]);
    expect(result.changes.waitlistEntries?.[0].reviewFlags).toEqual([
      'waiverOutdated',
    ]);
    const historical = state({
      ...flagged,
      bookings: [
        {
          ...flagged.bookings[0],
          status: 'cancelled',
          cancelledAt: now,
          cancellationReason: 'member',
        },
      ],
      waitlistEntries: [
        { ...flagged.waitlistEntries[0], status: 'left', leftAt: now },
      ],
    });
    const historyResult = accepted(
      validateMembershipAction(
        historical,
        admin,
        {
          type: 'setMemberStatus',
          payload: { memberId: 'member:existing', status: 'active' },
        },
        now,
      ),
    );
    expect(historyResult.changes.bookings?.[0]).toBe(historical.bookings[0]);
    expect(historyResult.changes.waitlistEntries?.[0]).toBe(
      historical.waitlistEntries[0],
    );
  });

  it('corrects profile fields while preserving identity and all associations', () => {
    const snapshot = enrolled();
    const result = accepted(
      validateMembershipAction(
        snapshot,
        admin,
        {
          type: 'updateMemberProfile',
          payload: {
            memberId: 'member:existing',
            updates: {
              displayName: ' Corrected Name ',
              verifiedEmail: ' CORRECTED@example.invalid ',
              contactEmail: ' CONTACT@example.invalid ',
            },
          },
        },
        now,
      ),
    );
    expect(result.changes.members?.[0]).toEqual({
      ...snapshot.members[0],
      displayName: 'Corrected Name',
      verifiedEmail: 'corrected@example.invalid',
      contactEmail: 'contact@example.invalid',
    });
    const changed = apply(snapshot, result);
    expect(changed.invitations).toBe(snapshot.invitations);
    expect(changed.bookings).toBe(snapshot.bookings);
    expect(changed.waitlistEntries).toBe(snapshot.waitlistEntries);
    expect(changed.attendance).toBe(snapshot.attendance);
    expect(changed.waiverSignatures).toBe(snapshot.waiverSignatures);
    expect(checkMemberEligibility(changed, 'member:existing').success).toBe(
      true,
    );
  });

  it('blocks duplicate profile email and duplicate email on reactivation', () => {
    const snapshot = enrolled('inactive');
    const other = {
      ...member('member:other'),
      verifiedEmail: snapshot.members[0].verifiedEmail.toUpperCase(),
    };
    const conflict = { ...snapshot, members: [...snapshot.members, other] };
    expect(
      error(
        validateMembershipAction(
          conflict,
          admin,
          {
            type: 'setMemberStatus',
            payload: { memberId: 'member:existing', status: 'active' },
          },
          now,
        ),
      ),
    ).toMatchObject({ conflict: { kind: 'duplicateEmail' } });
    expect(
      error(
        validateMembershipAction(
          {
            ...enrolled(),
            members: [...enrolled().members, member('member:other', 'pending')],
          },
          admin,
          {
            type: 'updateMemberProfile',
            payload: {
              memberId: 'member:existing',
              updates: { verifiedEmail: ' OTHER@example.invalid ' },
            },
          },
          now,
        ),
      ),
    ).toMatchObject({ conflict: { kind: 'duplicateEmail' } });
  });

  it('denying adult eligibility deactivates and flags an active member; correction never auto-reactivates', () => {
    const snapshot = enrolled();
    const result = accepted(
      validateMembershipAction(
        snapshot,
        admin,
        {
          type: 'updateMemberProfile',
          payload: {
            memberId: 'member:existing',
            updates: { adultEligibility: 'denied' },
          },
        },
        now,
      ),
    );
    expect(result.changes.members?.[0]).toMatchObject({
      status: 'inactive',
      adultEligibility: 'denied',
    });
    expect(result.changes.bookings?.[0].reviewFlags).toContain(
      'memberInactive',
    );
    const denied = apply(snapshot, result);
    expect(
      error(
        validateMembershipAction(
          denied,
          admin,
          {
            type: 'setMemberStatus',
            payload: { memberId: 'member:existing', status: 'active' },
          },
          now,
        ),
      ),
    ).toMatchObject({ reason: 'adultEligibilityDenied' });
    const corrected = accepted(
      validateMembershipAction(
        denied,
        admin,
        {
          type: 'updateMemberProfile',
          payload: {
            memberId: 'member:existing',
            updates: { adultEligibility: 'attested', adultAttestationAt: now },
          },
        },
        now,
      ),
    );
    expect(corrected.changes.members?.[0].status).toBe('inactive');
  });

  it('checks accepted-link association and current waiver for member actions and activation', () => {
    const snapshot = enrolled();
    expect(
      error(
        checkMemberEligibility(
          { ...snapshot, invitations: [] },
          'member:existing',
        ),
      ),
    ).toMatchObject({ reason: 'invitationNotAccepted' });
    expect(
      error(
        checkMemberEligibility(
          { ...snapshot, waiverSignatures: [] },
          'member:existing',
        ),
      ),
    ).toMatchObject({ reason: 'waiverMissing' });
    expect(
      error(
        checkMemberEligibility(
          {
            ...snapshot,
            waiverSignatures: snapshot.waiverSignatures.map((signature) => ({
              ...signature,
              waiverVersionId: 'waiver:old',
            })),
          },
          'member:existing',
        ),
      ),
    ).toMatchObject({ reason: 'waiverOutdated' });
    expect(
      error(
        checkMemberEligibility(
          {
            ...snapshot,
            invitations: snapshot.invitations.map((link) => ({
              ...link,
              status: 'accepted',
              acceptedAt: now,
              memberId: 'member:wrong',
            })),
          },
          'member:existing',
        ),
      ),
    ).toMatchObject({ reason: 'invitationNotAccepted' });
  });
});

describe('typed failures and pure transitions', () => {
  it('allows admin/front desk but rejects coaches, missing/inactive staff, and wrong invitation personas', () => {
    const snapshot = state();
    const action = {
      type: 'createInvitation',
      payload: {
        invitationId: 'invitation:other',
        email: 'other@example.invalid',
      },
    } satisfies Parameters<typeof validateMembershipAction>[2];
    expect(
      validateMembershipAction(
        snapshot,
        { kind: 'staff', staffId: 'staff:desk' },
        action,
        now,
      ).success,
    ).toBe(true);
    for (const actor of [
      { kind: 'staff', staffId: 'staff:coach' },
      { kind: 'staff', staffId: 'staff:missing' },
      { kind: 'member', memberId: 'member:existing' },
    ] satisfies DemoActor[]) {
      expect(
        error(validateMembershipAction(snapshot, actor, action, now)),
      ).toMatchObject({ reason: 'roleDenied' });
    }
    expect(
      error(
        validateMembershipAction(
          {
            ...snapshot,
            staffAccounts: snapshot.staffAccounts.map((staff) => ({
              ...staff,
              active: false,
            })),
          },
          admin,
          action,
          now,
        ),
      ),
    ).toMatchObject({ reason: 'inactiveStaff' });
    for (const actor of [
      admin,
      { kind: 'invitation', invitationId: 'invitation:wrong' },
    ] satisfies DemoActor[]) {
      expect(
        error(
          validateMembershipAction(
            snapshot,
            actor,
            { type: 'acceptInvitation', payload: input },
            now,
          ),
        ),
      ).toMatchObject({ reason: 'roleDenied' });
    }
  });

  it('returns typed unavailable failures for unknown IDs', () => {
    expect(
      error(
        validateMembershipAction(
          state(),
          admin,
          {
            type: 'revokeInvitation',
            payload: { invitationId: 'invitation:missing' },
          },
          now,
        ),
      ),
    ).toMatchObject({
      category: 'DemoUnavailableState',
      resource: 'invitation',
    });
    expect(
      error(
        validateMembershipAction(
          state(),
          admin,
          {
            type: 'updateMemberProfile',
            payload: {
              memberId: 'member:missing',
              updates: { displayName: 'Corrected' },
            },
          },
          now,
        ),
      ),
    ).toMatchObject({ category: 'DemoUnavailableState', resource: 'member' });
    expect(
      error(checkMemberEligibility(state(), 'member:missing')),
    ).toMatchObject({ category: 'DemoUnavailableState', resource: 'member' });
  });

  it('rejects invalid email, expiry, cap, dates, and profile fields atomically', () => {
    const snapshot = state();
    const create = {
      type: 'createInvitation',
      payload: { invitationId: 'invitation:other', email: 'bad email' },
    } satisfies Parameters<typeof validateMembershipAction>[2];
    expect(
      error(validateMembershipAction(snapshot, admin, create, now)),
    ).toMatchObject({ category: 'ValidationError' });
    for (const invitationExpiryMinutes of [
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(
        error(
          validateMembershipAction(
            {
              ...snapshot,
              settings: { ...snapshot.settings, invitationExpiryMinutes },
            },
            admin,
            {
              ...create,
              payload: { ...create.payload, email: 'valid@example.invalid' },
            },
            now,
          ),
        ),
      ).toMatchObject({ category: 'ValidationError' });
    }
    for (const memberCap of [-1, 1.5, Number.NaN]) {
      expect(
        error(
          accept({
            ...snapshot,
            settings: { ...snapshot.settings, memberCap },
          }),
        ),
      ).toMatchObject({ category: 'ValidationError' });
    }
    expect(
      error(accept(snapshot, input, '2026-02-30T16:00:00Z')),
    ).toMatchObject({ category: 'ValidationError' });
    const enrolledState = enrolled();
    for (const updates of [
      { displayName: ' ' },
      { verifiedEmail: 'invalid' },
      { contactEmail: 'invalid' },
      { adultAttestationAt: later },
      { adultAttestationAt: '2026-02-30T16:00:00Z' },
    ] satisfies MemberProfileUpdate[]) {
      const before = structuredClone(enrolledState);
      expect(
        error(
          validateMembershipAction(
            enrolledState,
            admin,
            {
              type: 'updateMemberProfile',
              payload: { memberId: 'member:existing', updates },
            },
            now,
          ),
        ),
      ).toMatchObject({ category: 'ValidationError' });
      expect(enrolledState).toEqual(before);
    }
  });
});
