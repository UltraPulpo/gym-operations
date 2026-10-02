import { requireCapability } from './roles';
import type {
  AdminCoachProfileUpdate,
  CoachProfile,
  DemoActor,
  DemoState,
  DemoStateChanges,
  DomainResult,
  OwnCoachProfileUpdate,
  PublicCoachProfile,
  ScheduledClass,
  StaffId,
  UtcInstant,
} from './types';

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

function unavailable(staffId: StaffId): DomainResult<never> {
  return {
    success: false,
    error: {
      category: 'DemoUnavailableState',
      resource: 'staff',
      resourceId: staffId,
      stale: false,
      message: 'The fictional coach profile is unavailable.',
    },
  };
}

function validateProfile(profile: CoachProfile): DomainResult<void> {
  if (typeof profile.displayName !== 'string' || !profile.displayName.trim()) {
    return invalid('displayName', 'A coach display name is required.');
  }
  if (
    typeof profile.avatarId !== 'string' ||
    !profile.avatarId.startsWith('avatar:') ||
    !profile.avatarId.slice(7).trim()
  ) {
    return invalid('avatarId', 'Select a fictional local avatar identifier.');
  }
  if (typeof profile.biography !== 'string') {
    return invalid('biography', 'The biography must be text.');
  }
  if (
    !Array.isArray(profile.certifications) ||
    !profile.certifications.every(
      (item: unknown) => typeof item === 'string' && item.trim(),
    )
  ) {
    return invalid(
      'certifications',
      'Certifications must be nonempty text entries.',
    );
  }
  if (
    profile.contact === null ||
    typeof profile.contact !== 'object' ||
    Array.isArray(profile.contact)
  ) {
    return invalid(
      'contact',
      'Contact details must be a staff-only contact object.',
    );
  }
  for (const field of Object.keys(profile.contact)) {
    if (field !== 'email' && field !== 'phone') {
      return invalid(
        `contact.${field}`,
        'Only email and phone contact fields are supported.',
      );
    }
    const entry = profile.contact[field];
    if (typeof entry !== 'string' || !entry.trim()) {
      return invalid(
        `contact.${field}`,
        'Supply nonempty contact text or omit the field.',
      );
    }
  }
  return { success: true, value: undefined };
}

function copyProfile(profile: CoachProfile): CoachProfile {
  return {
    ...publicProfile(profile),
    contact: { ...profile.contact },
  };
}

function publicProfile(profile: CoachProfile): PublicCoachProfile {
  return {
    displayName: profile.displayName,
    avatarId: profile.avatarId,
    biography: profile.biography,
    certifications: [...profile.certifications],
  };
}

function updateProfile(
  state: DemoState,
  staffId: StaffId,
  updates: AdminCoachProfileUpdate,
  allowedFields: readonly string[],
): DomainResult<DemoStateChanges> {
  const staff = state.staffAccounts.find(
    (account) => account.staffId === staffId,
  );
  if (!staff?.coachProfile) return unavailable(staffId);
  if (
    updates === null ||
    typeof updates !== 'object' ||
    Array.isArray(updates)
  ) {
    return invalid('updates', 'Profile updates must be a field object.');
  }
  const unknownField = Object.keys(updates).find(
    (field) => !allowedFields.includes(field),
  );
  if (unknownField) {
    return invalid(
      unknownField,
      'This field cannot be edited through this profile action.',
    );
  }
  const updated = { ...staff.coachProfile, ...updates };
  const validation = validateProfile(updated);
  if (!validation.success) return validation;
  return {
    success: true,
    value: {
      staffAccounts: state.staffAccounts.map((account) =>
        account.staffId === staffId
          ? { ...account, coachProfile: copyProfile(updated) }
          : account,
      ),
    },
  };
}

/** Returns collection replacements; the reducer owns revision advancement. */
export function updateOwnCoachProfile(
  state: DemoState,
  actor: DemoActor,
  staffId: StaffId,
  updates: OwnCoachProfileUpdate,
): DomainResult<DemoStateChanges> {
  const permission = requireCapability(state, actor, 'editOwnCoachProfile', {
    staffId,
  });
  if (!permission.success) return permission;
  return updateProfile(state, staffId, updates, ['avatarId', 'biography']);
}

export function updateCoachProfile(
  state: DemoState,
  actor: DemoActor,
  staffId: StaffId,
  updates: AdminCoachProfileUpdate,
): DomainResult<DemoStateChanges> {
  const permission = requireCapability(state, actor, 'manageCoachProfiles', {
    staffId,
  });
  if (!permission.success) return permission;
  return updateProfile(state, staffId, updates, [
    'displayName',
    'avatarId',
    'biography',
    'certifications',
    'contact',
  ]);
}

export type CoachProfileView =
  | { readonly audience: 'member'; readonly profile: PublicCoachProfile }
  | { readonly audience: 'staff'; readonly profile: CoachProfile };

/** Public projections use an allowlist, never a spread of a staff record. */
export function selectCoachProfile(
  state: DemoState,
  staffId: StaffId,
  actor: DemoActor = state.activeActor,
): DomainResult<CoachProfileView> {
  const permission = requireCapability(state, actor, 'viewSchedule');
  if (!permission.success) return permission;
  const profile = state.staffAccounts.find(
    (account) => account.staffId === staffId,
  )?.coachProfile;
  if (!profile) return unavailable(staffId);
  return {
    success: true,
    value:
      actor.kind === 'staff'
        ? { audience: 'staff', profile: copyProfile(profile) }
        : { audience: 'member', profile: publicProfile(profile) },
  };
}

function validInstant(instant: UtcInstant): boolean {
  const millis = Date.parse(instant);
  return (
    Number.isFinite(millis) &&
    new Date(millis).toISOString().replace('.000Z', 'Z') === instant
  );
}

/**
 * History begins at endsAt and is ordered by UTC start, then stable class ID.
 * Staff retain cancelled occurrences; members see only released, non-draft,
 * non-cancelled occurrences. Deactivation never erases scheduled history.
 */
export function selectCoachClassHistory(
  state: DemoState,
  staffId: StaffId,
  actor: DemoActor = state.activeActor,
  now: UtcInstant = state.clock.now,
): DomainResult<readonly ScheduledClass[]> {
  const permission = requireCapability(state, actor, 'viewSchedule');
  if (!permission.success) return permission;
  if (
    !state.staffAccounts.some(
      (account) => account.staffId === staffId && account.coachProfile,
    )
  ) {
    return unavailable(staffId);
  }
  const nowMillis = Date.parse(now);
  if (!validInstant(now)) {
    return invalid('now', 'A valid demo clock instant is required.');
  }
  const history: ScheduledClass[] = [];
  for (const scheduledClass of state.classes) {
    if (
      scheduledClass.coachId !== staffId ||
      scheduledClass.status === 'draft' ||
      (actor.kind === 'member' && scheduledClass.status === 'cancelled')
    ) {
      continue;
    }
    const startsAt = Date.parse(scheduledClass.startsAt);
    const endsAt = Date.parse(scheduledClass.endsAt);
    if (!validInstant(scheduledClass.startsAt)) {
      return invalid(
        'startsAt',
        'A valid scheduled UTC start instant is required.',
      );
    }
    if (!validInstant(scheduledClass.endsAt) || endsAt <= startsAt) {
      return invalid(
        'endsAt',
        'A valid scheduled UTC end after the start is required.',
      );
    }
    if (endsAt > nowMillis) continue;
    if (
      actor.kind === 'member' &&
      state.settings.scheduleRelease.mode === 'manual'
    ) {
      if (scheduledClass.releasedAt === undefined) continue;
      const releasedAt = Date.parse(scheduledClass.releasedAt);
      if (!validInstant(scheduledClass.releasedAt)) {
        return invalid(
          'releasedAt',
          'A valid scheduled release instant is required.',
        );
      }
      if (releasedAt > nowMillis) continue;
    }
    history.push(scheduledClass);
  }
  return {
    success: true,
    value: history.sort(
      (left, right) =>
        Date.parse(left.startsAt) - Date.parse(right.startsAt) ||
        left.classId.localeCompare(right.classId),
    ),
  };
}
