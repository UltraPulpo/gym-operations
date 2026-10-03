import type {
  ClassId,
  DemoActor,
  DemoCapabilities,
  DemoCapability,
  DemoState,
  DemoStateChanges,
  DomainResult,
  IneligibilityReason,
  InvitationId,
  MemberId,
  StaffAccount,
  StaffAccountUpdate,
  StaffId,
  StaffRole,
} from './types';

const roleCapabilities: Readonly<Record<StaffRole, readonly DemoCapability[]>> =
  {
    admin: [
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
    ],
    frontDesk: [
      'viewSchedule',
      'manageMembers',
      'manageInvitations',
      'manageBookings',
      'manageWaitlists',
      'manageAttendance',
      'viewRoster',
      'reseatBookings',
      'manageNotifications',
    ],
    coach: [
      'viewSchedule',
      'manageAttendance',
      'viewRoster',
      'reseatBookings',
      'editOwnCoachProfile',
    ],
  };

const memberOperations: readonly DemoCapability[] = [
  'bookStation',
  'cancelOwnBooking',
  'moveOwnBooking',
  'manageOwnWaitlist',
  'selfCheckIn',
];
const classOperations: readonly DemoCapability[] = [
  'manageBookings',
  'manageWaitlists',
  'manageAttendance',
  'viewRoster',
  'reseatBookings',
];

export interface CapabilityTarget {
  readonly classId?: ClassId;
  readonly staffId?: StaffId;
  readonly memberId?: MemberId;
  readonly invitationId?: InvitationId;
}

function ineligible(
  reason: IneligibilityReason,
  message: string,
): DomainResult<never> {
  return {
    success: false,
    error: { category: 'IneligibleDemoAction', reason, message },
  };
}

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

function unavailable(
  resource: 'staff' | 'member' | 'invitation' | 'class',
  resourceId: string,
): DomainResult<never> {
  return {
    success: false,
    error: {
      category: 'DemoUnavailableState',
      resource,
      resourceId,
      stale: false,
      message: `The fictional ${resource} record is unavailable.`,
    },
  };
}

function isFixedRole(role: string): role is StaffRole {
  return role === 'admin' || role === 'frontDesk' || role === 'coach';
}

/** Visibility is simulated; operation-specific eligibility remains in its rule module. */
export function selectDemoCapabilities(
  state: DemoState,
  actor: DemoActor = state.activeActor,
): DomainResult<DemoCapabilities> {
  if (actor.kind === 'staff') {
    const staff = state.staffAccounts.find(
      (account) => account.staffId === actor.staffId,
    );
    if (!staff) return unavailable('staff', actor.staffId);
    if (!staff.active) {
      return ineligible(
        'inactiveStaff',
        'Inactive staff cannot perform demo actions.',
      );
    }
    if (
      !Array.isArray(staff.assignedRoles) ||
      staff.assignedRoles.length === 0 ||
      !staff.assignedRoles.every(isFixedRole)
    ) {
      return invalid('assignedRoles', 'Assign at least one fixed staff role.');
    }
    const capabilities = [
      ...new Set(staff.assignedRoles.flatMap((role) => roleCapabilities[role])),
    ];
    const allClasses =
      staff.assignedRoles.includes('admin') ||
      staff.assignedRoles.includes('frontDesk');
    return {
      success: true,
      value: {
        capabilities,
        classScope: allClasses
          ? { kind: 'all' }
          : { kind: 'assigned', classIds: [...staff.assignedClassIds] },
      },
    };
  }

  if (actor.kind === 'member') {
    const member = state.members.find(
      (record) => record.memberId === actor.memberId,
    );
    if (!member) return unavailable('member', actor.memberId);
    return {
      success: true,
      value: {
        capabilities: [
          'viewSchedule',
          'signWaiver',
          ...(member.status === 'active' ? memberOperations : []),
        ],
        classScope: { kind: 'none' },
      },
    };
  }

  const invitation = state.invitations.find(
    (record) => record.invitationId === actor.invitationId,
  );
  if (!invitation) return unavailable('invitation', actor.invitationId);
  if (invitation.status === 'revoked') {
    return ineligible('invitationRevoked', 'This invitation has been revoked.');
  }
  const now = Date.parse(state.clock.now);
  const expiresAt = Date.parse(invitation.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(expiresAt)) {
    return invalid(
      !Number.isFinite(now) ? 'clock.now' : 'expiresAt',
      'A valid demo clock and invitation expiry instant are required.',
    );
  }
  if (
    invitation.status === 'expired' ||
    (invitation.status === 'outstanding' && now >= expiresAt)
  ) {
    return ineligible('invitationExpired', 'This invitation has expired.');
  }
  if (invitation.status !== 'outstanding') {
    return ineligible(
      'roleDenied',
      'Select an outstanding invitation to accept it.',
    );
  }
  return {
    success: true,
    value: {
      capabilities: ['acceptInvitation'],
      classScope: { kind: 'none' },
    },
  };
}

/** Pass resolved target IDs when acting on records; omitted member/invitation IDs mean self. */
export function requireCapability(
  state: DemoState,
  actor: DemoActor,
  capability: DemoCapability,
  target: CapabilityTarget = {},
): DomainResult<void> {
  const selected = selectDemoCapabilities(state, actor);
  if (!selected.success) return selected;
  if (!selected.value.capabilities.includes(capability)) {
    if (actor.kind === 'member' && memberOperations.includes(capability)) {
      return ineligible(
        'memberInactive',
        'Only active members may perform this action.',
      );
    }
    return ineligible(
      'roleDenied',
      'The selected actor does not have this demo capability.',
    );
  }

  if (
    actor.kind === 'member' &&
    capability !== 'viewSchedule' &&
    target.memberId !== undefined &&
    target.memberId !== actor.memberId
  ) {
    return ineligible(
      'roleDenied',
      'Members may act only on their own records.',
    );
  }
  if (
    actor.kind === 'invitation' &&
    target.invitationId !== undefined &&
    target.invitationId !== actor.invitationId
  ) {
    return ineligible(
      'roleDenied',
      'Only the selected invitation may be accepted.',
    );
  }
  if (
    capability === 'editOwnCoachProfile' &&
    (actor.kind !== 'staff' || target.staffId !== actor.staffId)
  ) {
    return ineligible(
      'roleDenied',
      'Staff may edit only their own coach biography and photo.',
    );
  }

  if (actor.kind === 'staff' && classOperations.includes(capability)) {
    if (!target.classId) {
      return ineligible(
        'classScopeDenied',
        'Select a class for this staff action.',
      );
    }
    if (!state.classes.some((record) => record.classId === target.classId)) {
      return unavailable('class', target.classId);
    }
    const scope = selected.value.classScope;
    if (
      scope.kind !== 'all' &&
      (scope.kind !== 'assigned' || !scope.classIds.includes(target.classId))
    ) {
      return ineligible(
        'classScopeDenied',
        'Coaches may act only on their assigned classes.',
      );
    }
  }
  return { success: true, value: undefined };
}

function validateStaffAccount(
  state: DemoState,
  staff: StaffAccount,
): DomainResult<void> {
  if (
    typeof staff.staffId !== 'string' ||
    !staff.staffId.startsWith('staff:') ||
    !staff.staffId.slice(6).trim()
  ) {
    return invalid(
      'staffId',
      'A nonempty stable staff identifier is required.',
    );
  }
  if (
    typeof staff.identitySubject !== 'string' ||
    !staff.identitySubject.startsWith('identity:') ||
    !staff.identitySubject.slice(9).trim()
  ) {
    return invalid(
      'identitySubject',
      'A nonempty fictional identity subject is required.',
    );
  }
  if (typeof staff.active !== 'boolean') {
    return invalid('active', 'Staff active status must be true or false.');
  }
  if (
    !Array.isArray(staff.assignedRoles) ||
    staff.assignedRoles.length === 0 ||
    !staff.assignedRoles.every(isFixedRole) ||
    new Set(staff.assignedRoles).size !== staff.assignedRoles.length
  ) {
    return invalid(
      'assignedRoles',
      'Assign a nonempty set of unique fixed staff roles.',
    );
  }
  if (
    !Array.isArray(staff.assignedClassIds) ||
    new Set(staff.assignedClassIds).size !== staff.assignedClassIds.length
  ) {
    return invalid(
      'assignedClassIds',
      'Assigned class identifiers must be unique.',
    );
  }
  if (
    state.staffAccounts.some(
      (record) =>
        record.staffId !== staff.staffId &&
        record.identitySubject === staff.identitySubject,
    )
  ) {
    return invalid(
      'identitySubject',
      'This identity subject already belongs to another staff account.',
    );
  }
  for (const classId of staff.assignedClassIds) {
    if (!state.classes.some((record) => record.classId === classId)) {
      return unavailable('class', classId);
    }
  }
  return { success: true, value: undefined };
}

function copyStaff(staff: StaffAccount): StaffAccount {
  return {
    ...staff,
    assignedRoles: [...staff.assignedRoles],
    assignedClassIds: [...staff.assignedClassIds],
    ...(staff.coachProfile
      ? {
          coachProfile: {
            ...staff.coachProfile,
            certifications: [...staff.coachProfile.certifications],
            contact: { ...staff.coachProfile.contact },
          },
        }
      : {}),
  };
}

/** Only collection replacements are returned; the reducer owns revision advancement. */
export function createStaffAccount(
  state: DemoState,
  actor: DemoActor,
  staff: StaffAccount,
): DomainResult<DemoStateChanges> {
  const permission = requireCapability(state, actor, 'manageStaff');
  if (!permission.success) return permission;
  if (state.staffAccounts.some((record) => record.staffId === staff.staffId)) {
    return invalid(
      'staffId',
      'This stable staff identifier is already in use.',
    );
  }
  const validation = validateStaffAccount(state, staff);
  if (!validation.success) return validation;
  return {
    success: true,
    value: { staffAccounts: [...state.staffAccounts, copyStaff(staff)] },
  };
}

export function updateStaffAccount(
  state: DemoState,
  actor: DemoActor,
  staffId: StaffId,
  updates: StaffAccountUpdate,
): DomainResult<DemoStateChanges> {
  const permission = requireCapability(state, actor, 'manageStaff');
  if (!permission.success) return permission;
  const staff = state.staffAccounts.find(
    (record) => record.staffId === staffId,
  );
  if (!staff) return unavailable('staff', staffId);
  const allowedFields = [
    'active',
    'assignedRoles',
    'assignedClassIds',
    'identitySubject',
  ];
  const unknownField = Object.keys(updates).find(
    (field) => !allowedFields.includes(field),
  );
  if (unknownField) {
    return invalid(
      unknownField,
      'Only staff access fields may be updated here.',
    );
  }
  const updated = { ...staff, ...updates };
  const validation = validateStaffAccount(state, updated);
  if (!validation.success) return validation;
  return {
    success: true,
    value: {
      staffAccounts: state.staffAccounts.map((record) =>
        record.staffId === staffId ? copyStaff(updated) : record,
      ),
    },
  };
}

export function deactivateStaffAccount(
  state: DemoState,
  actor: DemoActor,
  staffId: StaffId,
): DomainResult<DemoStateChanges> {
  return updateStaffAccount(state, actor, staffId, { active: false });
}
