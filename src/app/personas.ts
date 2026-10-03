import type { DemoActor, DemoState, StaffRole } from '../domain';

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'Admin',
  frontDesk: 'Front Desk',
  coach: 'Coach',
};

export function actorId(actor: DemoActor): string {
  switch (actor.kind) {
    case 'staff':
      return actor.staffId;
    case 'member':
      return actor.memberId;
    case 'invitation':
      return actor.invitationId;
  }
}

export function getPersonas(state: DemoState) {
  const staffNames: Record<string, string> = {
    'staff:demo-admin': 'Chris Sullivan',
    'staff:demo-front-desk': 'Dana Lee',
    'staff:demo-inactive': 'Robin Hayes',
  };
  return [
    ...state.staffAccounts.map((staff) => ({
      actor: { kind: 'staff', staffId: staff.staffId } satisfies DemoActor,
      label: `${staff.coachProfile?.displayName ?? staffNames[staff.staffId] ?? staff.staffId.slice(6)} - ${staff.assignedRoles.map((role) => ROLE_LABELS[role]).join(' + ')}${staff.active ? '' : ' (inactive)'}`,
    })),
    ...state.members.map((member) => ({
      actor: { kind: 'member', memberId: member.memberId } satisfies DemoActor,
      label: `${member.displayName} - Member (${member.status})`,
    })),
    ...state.invitations.map((invitation) => ({
      actor: {
        kind: 'invitation',
        invitationId: invitation.invitationId,
      } satisfies DemoActor,
      label: `Invitation: ${invitation.email} (${invitation.status}; ${invitation.invitationId})`,
    })),
  ];
}
