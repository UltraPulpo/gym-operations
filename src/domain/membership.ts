import type {
  AcceptedAction,
  ActionOf,
  DemoActor,
  DemoState,
  DemoStateChanges,
  DomainResource,
  DomainResult,
  IneligibilityReason,
  Invitation,
  InvitationAcceptanceInput,
  Member,
  MemberId,
  MemberProfileUpdate,
  MemberStatus,
  StaffId,
  UtcInstant,
  WaiverVersion,
} from './types';

export type MembershipAction = ActionOf<
  | 'createInvitation'
  | 'resendInvitation'
  | 'revokeInvitation'
  | 'expireInvitations'
  | 'acceptInvitation'
  | 'updateMemberProfile'
  | 'setMemberStatus'
>;

const success = <T>(value: T): DomainResult<T> => ({ success: true, value });

function invalid(field: string, message: string): DomainResult<never> {
  return {
    success: false,
    error: {
      category: 'ValidationError',
      message,
      fields: [{ field, message }],
    },
  };
}

function ineligible(
  reason: IneligibilityReason,
  message: string,
  memberId?: MemberId,
): DomainResult<never> {
  return {
    success: false,
    error: { category: 'IneligibleDemoAction', reason, message, memberId },
  };
}

function unavailable(
  resource: DomainResource,
  resourceId?: string,
): DomainResult<never> {
  return {
    success: false,
    error: {
      category: 'DemoUnavailableState',
      resource,
      resourceId,
      stale: false,
      message: `The demo ${resource} is unavailable.`,
    },
  };
}

function duplicateEmail(email: string): DomainResult<never> {
  return {
    success: false,
    error: {
      category: 'DemoConflict',
      message:
        'This email already has an outstanding invitation or pending/active membership.',
      conflict: { kind: 'duplicateEmail', email },
    },
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validInstant(value: string): value is UtcInstant {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false;
  const instant = new Date(value);
  return (
    Number.isFinite(instant.getTime()) &&
    instant.toISOString().replace('.000Z', 'Z') === value
  );
}

function validCap(state: DemoState): boolean {
  return (
    Number.isSafeInteger(state.settings.memberCap) &&
    state.settings.memberCap >= 0
  );
}

export function countActiveMembers(state: DemoState): number {
  return state.members.filter((member) => member.status === 'active').length;
}

function hasMemberEmail(
  state: DemoState,
  email: string,
  excluding?: MemberId,
): boolean {
  return state.members.some(
    (member) =>
      member.memberId !== excluding &&
      member.status !== 'inactive' &&
      normalizeEmail(member.verifiedEmail) === email,
  );
}

function currentWaiver(
  state: DemoState,
  now: UtcInstant,
): DomainResult<Extract<WaiverVersion, { readonly status: 'published' }>> {
  const waiver = state.waivers.find(
    (version) => version.waiverVersionId === state.currentWaiverVersionId,
  );
  if (!waiver || waiver.status !== 'published') {
    return unavailable('waiver', state.currentWaiverVersionId ?? undefined);
  }
  if (!validInstant(waiver.publishedAt) || waiver.publishedAt > now) {
    return invalid(
      'waiverVersionId',
      'The current waiver must already be published.',
    );
  }
  return success(waiver);
}

function memberEvidence(
  state: DemoState,
  member: Member,
  now: UtcInstant,
): DomainResult<Member> {
  if (member.adultEligibility !== 'attested') {
    return ineligible(
      'adultEligibilityDenied',
      'Adult eligibility must be attested.',
      member.memberId,
    );
  }
  if (
    !member.displayName.trim() ||
    !validEmail(normalizeEmail(member.verifiedEmail)) ||
    !member.identitySubject.slice('identity:'.length).trim() ||
    !validInstant(member.adultAttestationAt) ||
    member.adultAttestationAt > now
  ) {
    return invalid(
      'member',
      'The member requires complete identity and adult-attestation evidence.',
    );
  }
  const invitation = state.invitations.find(
    (link) => link.invitationId === member.invitationId,
  );
  if (
    !invitation ||
    invitation.status !== 'accepted' ||
    invitation.memberId !== member.memberId
  ) {
    return ineligible(
      'invitationNotAccepted',
      'An accepted invitation associated with this member is required.',
      member.memberId,
    );
  }
  const waiver = currentWaiver(state, now);
  if (!waiver.success) return waiver;
  const signatures = state.waiverSignatures.filter(
    (signature) => signature.memberId === member.memberId,
  );
  const signed = signatures.some(
    (signature) =>
      signature.waiverVersionId === waiver.value.waiverVersionId &&
      signature.typedName.trim().length > 0 &&
      validInstant(signature.signedAt) &&
      signature.signedAt >= waiver.value.publishedAt &&
      signature.signedAt <= now,
  );
  if (!signed) {
    return ineligible(
      signatures.length ? 'waiverOutdated' : 'waiverMissing',
      'A signature for the current published waiver is required.',
      member.memberId,
    );
  }
  return success(member);
}

/** Shared eligibility for booking/check-in; capacity does not revoke existing membership. */
export function checkMemberEligibility(
  state: DemoState,
  memberId: MemberId,
  now: UtcInstant = state.clock.now,
): DomainResult<Member> {
  if (!validInstant(now))
    return invalid('now', 'A valid UTC instant is required.');
  const member = state.members.find((person) => person.memberId === memberId);
  if (!member) return unavailable('member', memberId);
  if (member.status !== 'active') {
    return ineligible(
      'memberInactive',
      'Only active members may book or check in.',
      memberId,
    );
  }
  return memberEvidence(state, member, now);
}

/** Clock transitions may expire links without requiring a staff persona. */
export function expireInvitations(
  state: DemoState,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  if (!validInstant(now))
    return invalid('now', 'A valid UTC instant is required.');
  if (
    state.invitations.some(
      (invitation) =>
        invitation.status === 'outstanding' &&
        !validInstant(invitation.expiresAt),
    )
  ) {
    return invalid(
      'expiresAt',
      'Outstanding invitations must have valid expiry instants.',
    );
  }
  let changed = false;
  const invitations = state.invitations.map((invitation): Invitation => {
    if (invitation.status !== 'outstanding' || invitation.expiresAt > now)
      return invitation;
    changed = true;
    return { ...invitation, status: 'expired', expiredAt: now };
  });
  return success(changed ? { invitations } : {});
}

function outstandingInvitation(
  state: DemoState,
  invitationId: Invitation['invitationId'],
  now: UtcInstant,
): DomainResult<Invitation & { readonly status: 'outstanding' }> {
  const invitation = state.invitations.find(
    (link) => link.invitationId === invitationId,
  );
  if (!invitation) return unavailable('invitation', invitationId);
  if (invitation.status === 'revoked' || invitation.status === 'superseded') {
    return ineligible(
      'invitationRevoked',
      'This invitation has been revoked or replaced.',
    );
  }
  if (invitation.status === 'expired') {
    return ineligible('invitationExpired', 'This invitation has expired.');
  }
  if (invitation.status !== 'outstanding') {
    return ineligible(
      'invitationNotAccepted',
      'This invitation has already been consumed.',
    );
  }
  if (
    !validInstant(invitation.issuedAt) ||
    !validInstant(invitation.expiresAt) ||
    invitation.issuedAt > now ||
    invitation.expiresAt <= invitation.issuedAt
  ) {
    return invalid(
      'invitationId',
      'The invitation has invalid issue or expiry evidence.',
    );
  }
  if (invitation.expiresAt <= now) {
    return ineligible('invitationExpired', 'This invitation has expired.');
  }
  return success(invitation);
}

function makeInvitation(
  state: DemoState,
  invitationId: Invitation['invitationId'],
  email: string,
  staffId: StaffId,
  now: UtcInstant,
): DomainResult<Invitation> {
  if (
    !invitationId.slice('invitation:'.length).trim() ||
    state.invitations.some((link) => link.invitationId === invitationId)
  ) {
    return invalid('invitationId', 'A new, unique invitation ID is required.');
  }
  if (!validEmail(email))
    return invalid('email', 'A valid invitation email is required.');
  const minutes = state.settings.invitationExpiryMinutes;
  if (
    !Number.isFinite(minutes) ||
    minutes <= 0 ||
    !Number.isSafeInteger(minutes * 60)
  ) {
    return invalid(
      'invitationExpiryMinutes',
      'Invitation expiry must be a positive duration in whole seconds.',
    );
  }
  const deadline = new Date(Date.parse(now) + minutes * 60_000);
  if (!Number.isFinite(deadline.getTime())) {
    return invalid(
      'invitationExpiryMinutes',
      'Invitation expiry exceeds the supported date range.',
    );
  }
  const expiresAt = deadline.toISOString().replace('.000Z', 'Z');
  if (!validInstant(expiresAt)) {
    return invalid(
      'invitationExpiryMinutes',
      'Invitation expiry exceeds the supported UTC format.',
    );
  }
  return success({
    invitationId,
    email,
    issuedAt: now,
    expiresAt,
    issuedBy: staffId,
    status: 'outstanding',
  });
}

function createInvitation(
  state: DemoState,
  payload: ActionOf<'createInvitation'>['payload'],
  staffId: StaffId,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  const email = normalizeEmail(payload.email);
  const created = makeInvitation(
    state,
    payload.invitationId,
    email,
    staffId,
    now,
  );
  if (!created.success) return created;
  const expired = expireInvitations(state, now);
  if (!expired.success) return expired;
  const invitations = expired.value.invitations ?? state.invitations;
  if (
    hasMemberEmail(state, email) ||
    invitations.some(
      (link) =>
        link.status === 'outstanding' && normalizeEmail(link.email) === email,
    )
  ) {
    return duplicateEmail(email);
  }
  return success({ invitations: [...invitations, created.value] });
}

function resendInvitation(
  state: DemoState,
  payload: ActionOf<'resendInvitation'>['payload'],
  staffId: StaffId,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  const current = outstandingInvitation(state, payload.invitationId, now);
  if (!current.success) return current;
  const email = normalizeEmail(current.value.email);
  if (
    hasMemberEmail(state, email) ||
    state.invitations.some(
      (link) =>
        link.invitationId !== payload.invitationId &&
        link.status === 'outstanding' &&
        link.expiresAt > now &&
        normalizeEmail(link.email) === email,
    )
  )
    return duplicateEmail(email);
  const replacement = makeInvitation(
    state,
    payload.replacementId,
    email,
    staffId,
    now,
  );
  if (!replacement.success) return replacement;
  return success({
    invitations: [
      ...state.invitations.map((link): Invitation =>
        link.invitationId === payload.invitationId
          ? {
              ...current.value,
              status: 'superseded',
              supersededAt: now,
              replacementId: payload.replacementId,
            }
          : link,
      ),
      replacement.value,
    ],
  });
}

function acceptInvitation(
  state: DemoState,
  input: InvitationAcceptanceInput,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  const current = outstandingInvitation(state, input.invitationId, now);
  if (!current.success) return current;
  if (!input.displayName.trim())
    return invalid('displayName', 'A display name is required.');
  if (!input.adultAttested) {
    return ineligible(
      'adultEligibilityDenied',
      'An explicit adult attestation is required.',
    );
  }
  if (input.identity.outcome === 'rejected') {
    return ineligible(
      'identityRejected',
      input.identity.message || 'The simulated identity was rejected.',
    );
  }
  const email = normalizeEmail(input.identity.verifiedEmail);
  if (
    input.identity.outcome !== 'verified' ||
    email !== normalizeEmail(current.value.email)
  ) {
    return ineligible(
      'identityMismatch',
      'The verified identity must match the invitation email.',
    );
  }
  if (!validEmail(email))
    return invalid('verifiedEmail', 'A valid verified email is required.');
  if (hasMemberEmail(state, email)) return duplicateEmail(email);
  if (
    !input.memberId.slice('member:'.length).trim() ||
    state.members.some((member) => member.memberId === input.memberId)
  )
    return invalid('memberId', 'A new, unique member ID is required.');
  const subject = input.identity.subject;
  if (
    !subject.slice('identity:'.length).trim() ||
    state.members.some((member) => member.identitySubject === subject)
  )
    return invalid(
      'identity',
      'This identity already belongs to a member; resolve that profile instead.',
    );
  if (
    !input.signatureId.slice('signature:'.length).trim() ||
    state.waiverSignatures.some(
      (signature) => signature.signatureId === input.signatureId,
    )
  )
    return invalid('signatureId', 'A new, unique signature ID is required.');
  const waiver = currentWaiver(state, now);
  if (!waiver.success) return waiver;
  if (input.waiver.waiverVersionId !== waiver.value.waiverVersionId) {
    return ineligible(
      'waiverOutdated',
      'Acceptance requires the current published waiver.',
    );
  }
  if (!input.waiver.typedName.trim())
    return invalid('typedName', 'A typed waiver signature name is required.');
  if (!validCap(state))
    return invalid(
      'memberCap',
      'The member cap must be a nonnegative integer.',
    );
  const member: Member = {
    memberId: input.memberId,
    displayName: input.displayName.trim(),
    verifiedEmail: email,
    identitySubject: subject,
    invitationId: input.invitationId,
    status:
      countActiveMembers(state) < state.settings.memberCap
        ? 'active'
        : 'pending',
    adultAttestationAt: now,
    adultEligibility: 'attested',
    createdAt: now,
  };
  return success({
    members: [...state.members, member],
    invitations: state.invitations.map((link): Invitation =>
      link.invitationId === input.invitationId
        ? {
            ...current.value,
            status: 'accepted',
            acceptedAt: now,
            memberId: input.memberId,
          }
        : link,
    ),
    waiverSignatures: [
      ...state.waiverSignatures,
      {
        signatureId: input.signatureId,
        memberId: input.memberId,
        waiverVersionId: waiver.value.waiverVersionId,
        typedName: input.waiver.typedName.trim(),
        signedAt: now,
      },
    ],
  });
}

function memberChanges(state: DemoState, updated: Member): DemoStateChanges {
  return {
    members: state.members.map((member) =>
      member.memberId === updated.memberId ? updated : member,
    ),
    bookings: state.bookings.map((booking) => {
      if (booking.memberId !== updated.memberId || booking.status !== 'booked')
        return booking;
      const flags = booking.reviewFlags.filter(
        (flag) => flag !== 'memberInactive',
      );
      return {
        ...booking,
        reviewFlags:
          updated.status === 'active' ? flags : [...flags, 'memberInactive'],
      };
    }),
    waitlistEntries: state.waitlistEntries.map((entry) => {
      if (entry.memberId !== updated.memberId || entry.status !== 'waiting')
        return entry;
      const flags = entry.reviewFlags.filter(
        (flag) => flag !== 'memberInactive',
      );
      return {
        ...entry,
        reviewFlags:
          updated.status === 'active' ? flags : [...flags, 'memberInactive'],
      };
    }),
  };
}

function setMemberStatus(
  state: DemoState,
  memberId: MemberId,
  status: MemberStatus,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  const member = state.members.find((person) => person.memberId === memberId);
  if (!member) return unavailable('member', memberId);
  if (status === 'active') {
    const evidence = memberEvidence(state, member, now);
    if (!evidence.success) return evidence;
    if (hasMemberEmail(state, normalizeEmail(member.verifiedEmail), memberId)) {
      return duplicateEmail(normalizeEmail(member.verifiedEmail));
    }
    if (!validCap(state))
      return invalid(
        'memberCap',
        'The member cap must be a nonnegative integer.',
      );
    if (
      member.status !== 'active' &&
      countActiveMembers(state) >= state.settings.memberCap
    ) {
      return ineligible(
        'memberCapReached',
        'The active-member cap has been reached.',
        memberId,
      );
    }
  } else if (
    status === 'pending' &&
    hasMemberEmail(state, normalizeEmail(member.verifiedEmail), memberId)
  ) {
    return duplicateEmail(normalizeEmail(member.verifiedEmail));
  }
  return success(memberChanges(state, { ...member, status }));
}

function updateMemberProfile(
  state: DemoState,
  memberId: MemberId,
  updates: MemberProfileUpdate,
  now: UtcInstant,
): DomainResult<DemoStateChanges> {
  const member = state.members.find((person) => person.memberId === memberId);
  if (!member) return unavailable('member', memberId);
  if (updates.displayName !== undefined && !updates.displayName.trim()) {
    return invalid('displayName', 'A display name is required.');
  }
  if (
    updates.verifiedEmail !== undefined &&
    !validEmail(normalizeEmail(updates.verifiedEmail))
  ) {
    return invalid('verifiedEmail', 'A valid verified email is required.');
  }
  if (
    updates.contactEmail !== undefined &&
    !validEmail(normalizeEmail(updates.contactEmail))
  ) {
    return invalid('contactEmail', 'A valid contact email is required.');
  }
  if (
    updates.adultAttestationAt !== undefined &&
    (!validInstant(updates.adultAttestationAt) ||
      updates.adultAttestationAt > now)
  ) {
    return invalid(
      'adultAttestationAt',
      'Adult attestation requires a valid timestamp not in the future.',
    );
  }
  const updated: Member = {
    ...member,
    displayName: updates.displayName?.trim() ?? member.displayName,
    verifiedEmail:
      updates.verifiedEmail === undefined
        ? member.verifiedEmail
        : normalizeEmail(updates.verifiedEmail),
    ...(updates.contactEmail === undefined
      ? {}
      : { contactEmail: normalizeEmail(updates.contactEmail) }),
    adultAttestationAt: updates.adultAttestationAt ?? member.adultAttestationAt,
    adultEligibility: updates.adultEligibility ?? member.adultEligibility,
  };
  if (
    updated.status !== 'inactive' &&
    hasMemberEmail(state, normalizeEmail(updated.verifiedEmail), memberId)
  ) {
    return duplicateEmail(normalizeEmail(updated.verifiedEmail));
  }
  if (updated.adultEligibility === 'denied' && updated.status === 'active') {
    return success(memberChanges(state, { ...updated, status: 'inactive' }));
  }
  return success({
    members: state.members.map((person) =>
      person.memberId === memberId ? updated : person,
    ),
  });
}

export function validateMembershipAction(
  state: DemoState,
  actor: DemoActor,
  action: MembershipAction,
  now: UtcInstant,
): DomainResult<AcceptedAction> {
  if (!validInstant(now))
    return invalid('now', 'A valid UTC instant is required.');
  let result: DomainResult<DemoStateChanges>;
  if (action.type === 'acceptInvitation') {
    if (
      actor.kind !== 'invitation' ||
      actor.invitationId !== action.payload.invitationId
    ) {
      return ineligible(
        'roleDenied',
        'Select the matching invitation persona to accept this invitation.',
      );
    }
    result = acceptInvitation(state, action.payload, now);
  } else {
    if (actor.kind !== 'staff')
      return ineligible(
        'roleDenied',
        'Only authorized demo staff may manage membership.',
      );
    const staff = state.staffAccounts.find(
      (account) => account.staffId === actor.staffId,
    );
    if (!staff)
      return ineligible(
        'roleDenied',
        'The selected staff account is unavailable.',
      );
    if (!staff.active)
      return ineligible(
        'inactiveStaff',
        'The selected staff account is inactive.',
      );
    if (
      !staff.assignedRoles.some(
        (role) => role === 'admin' || role === 'frontDesk',
      )
    ) {
      return ineligible(
        'roleDenied',
        'Admin or Front Desk membership permissions are required.',
      );
    }
    switch (action.type) {
      case 'createInvitation':
        result = createInvitation(state, action.payload, actor.staffId, now);
        break;
      case 'resendInvitation':
        result = resendInvitation(state, action.payload, actor.staffId, now);
        break;
      case 'revokeInvitation': {
        const current = outstandingInvitation(
          state,
          action.payload.invitationId,
          now,
        );
        if (!current.success) return current;
        result = success({
          invitations: state.invitations.map((link): Invitation =>
            link.invitationId === action.payload.invitationId
              ? {
                  ...current.value,
                  status: 'revoked',
                  revokedAt: now,
                  revokedBy: actor.staffId,
                }
              : link,
          ),
        });
        break;
      }
      case 'expireInvitations':
        result = expireInvitations(state, now);
        break;
      case 'setMemberStatus':
        result = setMemberStatus(
          state,
          action.payload.memberId,
          action.payload.status,
          now,
        );
        break;
      case 'updateMemberProfile':
        result = updateMemberProfile(
          state,
          action.payload.memberId,
          action.payload.updates,
          now,
        );
        break;
    }
  }
  if (!result.success) return result;
  return success({
    type: 'accepted',
    action,
    actor,
    validatedAt: now,
    baseRevision: state.revision,
    changes: result.value,
    warnings: [],
  });
}
