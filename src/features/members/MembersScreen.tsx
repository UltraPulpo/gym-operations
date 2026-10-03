import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  selectInvitations,
  selectMembers,
  selectNotifications,
  selectSettings,
  selectSimulation,
  selectWaiverCompliance,
  useDemoState,
} from '../../demo-state';
import type { InvitationView, MemberView } from '../../demo-state';
import { getCurrentWaiver } from '../../domain';
import type {
  AdultEligibility,
  DemoAction,
  DeliveryScenario,
  DomainError,
  IdentityOutcome,
  IdentityScenario,
  MemberProfileUpdate,
  UtcInstant,
  WaiverVersionId,
} from '../../domain';
import {
  Alert,
  Button,
  CheckboxField,
  DataTable,
  InputField,
  SelectField,
  StatusBadge,
} from '../../shared';
import styles from './members.module.css';

function useActionFeedback() {
  const demo = useDemoState();
  const [error, setError] = useState<DomainError>();
  const [message, setMessage] = useState('');
  function submit(action: DemoAction, successMessage: string) {
    const result = demo.submit(action);
    setError(result.success ? undefined : result.error);
    setMessage(result.success ? successMessage : '');
    return result;
  }
  function fieldError(field: string) {
    return error?.category === 'ValidationError'
      ? error.fields.find((entry) => entry.field === field)?.message
      : undefined;
  }
  function reject(error: DomainError) {
    setError(error);
    setMessage('');
  }
  return { error, message, submit, fieldError, reject };
}

function Feedback({
  error,
  message,
}: Pick<ReturnType<typeof useActionFeedback>, 'error' | 'message'>) {
  return (
    <>
      {error && <Alert>{error.message}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}
    </>
  );
}

function BoundaryNotice() {
  return (
    <p className={styles.notice}>
      SIMULATED DEMO - NOT FOR OPERATIONS. Fictional data resets on refresh.
      Identity verification and email delivery are local simulations. No email
      is sent, no live authentication occurs, and no credentials are requested.
      Use fictional names and example.invalid addresses only.
    </p>
  );
}

function WaiverText() {
  const demo = useDemoState();
  const waiver = getCurrentWaiver(demo.state);
  if (!waiver.success) return <Alert>{waiver.error.message}</Alert>;
  return (
    <section aria-label="Current fictional waiver">
      <h3>Current waiver version {waiver.value.version}</h3>
      <p>Fictional, non-legal waiver and signature evidence only.</p>
      <p className={styles.waiver}>{waiver.value.text}</p>
      <p>
        Signature and adult-attestation timestamp (frozen demo clock):{' '}
        {demo.now}
      </p>
    </section>
  );
}

function SignatureStatus({ member }: { member: MemberView }) {
  const demo = useDemoState();
  const compliance = selectWaiverCompliance(demo.state, member.memberId);
  if (compliance.status === 'unavailable') {
    return <Alert>{compliance.error.message}</Alert>;
  }
  return (
    <div>
      <span>Waiver: {compliance.status}</span>
      {'signature' in compliance && (
        <small className={styles.evidence}>
          {compliance.signature.waiverVersionId}; typed name:{' '}
          {compliance.signature.typedName}; signed at:{' '}
          {compliance.signature.signedAt}
        </small>
      )}
    </div>
  );
}

function InvitationManagement() {
  const demo = useDemoState();
  const feedback = useActionFeedback();
  const [email, setEmail] = useState('');
  const invitations = selectInvitations(demo.state);
  const simulation = selectSimulation(demo.state);
  const notifications = selectNotifications(demo.state).filter(
    (notification) =>
      notification.event.type === 'invitation' &&
      invitations.some(
        (invitation) =>
          notification.event.type === 'invitation' &&
          invitation.invitationId === notification.event.invitationId,
      ),
  );
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = feedback.submit(
      {
        type: 'createInvitation',
        payload: {
          invitationId: `invitation:members-${demo.revision}`,
          email,
        },
      },
      'Invitation created in local demo state.',
    );
    if (result.success) setEmail('');
  }
  function isUsable(invitation: InvitationView) {
    return (
      invitation.status === 'outstanding' && invitation.expiresAt > demo.now
    );
  }
  return (
    <section className={styles.section} aria-labelledby="invitations-heading">
      <h2 id="invitations-heading">Invitations</h2>
      <p>
        Outstanding invitations do not reserve member capacity. Resend replaces
        the old invitation and restarts its expiration period. Select an
        outstanding invitation persona in the demo shell to demonstrate
        acceptance.
      </p>
      <Feedback {...feedback} />
      <form noValidate onSubmit={create} className={styles.form}>
        <InputField
          label="Invitation email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={feedback.fieldError('email')}
          hint="Fictional address only; no message is transmitted."
        />
        <SelectField
          label="Simulated email outcome"
          value={simulation.delivery}
          onChange={(event) => {
            const delivery: DeliveryScenario =
              event.target.value === 'failure' ? 'failure' : 'success';
            feedback.submit(
              { type: 'setSimulation', payload: { delivery } },
              'Local email simulation updated.',
            );
          }}
        >
          <option value="success">Reported success (simulated)</option>
          <option value="failure">Reported failure (simulated)</option>
        </SelectField>
        <Button type="submit">Create invitation</Button>
      </form>
      <DataTable
        caption="Fictional invitations"
        rows={invitations}
        getRowKey={(invitation) => invitation.invitationId}
        columns={[
          { key: 'email', header: 'Email', render: (i) => i.email },
          {
            key: 'status',
            header: 'Status',
            render: (i) => (
              <StatusBadge>
                {i.status === 'outstanding' && i.expiresAt <= demo.now
                  ? 'expired (clock)'
                  : i.status}
              </StatusBadge>
            ),
          },
          {
            key: 'expires',
            header: 'Expires at (UTC)',
            render: (i) => i.expiresAt,
          },
          {
            key: 'actions',
            header: 'Actions',
            render: (i) =>
              isUsable(i) ? (
                <div className={styles.actions}>
                  <Button
                    onClick={() =>
                      feedback.submit(
                        {
                          type: 'resendInvitation',
                          payload: {
                            invitationId: i.invitationId,
                            replacementId: `invitation:members-${demo.revision}`,
                          },
                        },
                        'Invitation replaced; expiration restarted in local demo state.',
                      )
                    }
                  >
                    Resend
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() =>
                      feedback.submit(
                        {
                          type: 'revokeInvitation',
                          payload: { invitationId: i.invitationId },
                        },
                        'Invitation revoked in local demo state.',
                      )
                    }
                  >
                    Revoke
                  </Button>
                </div>
              ) : (
                <span>No outstanding invitation action</span>
              ),
          },
        ]}
      />
      <h3>Simulated invitation email outcomes</h3>
      {notifications.some(
        (notification) => notification.status === 'failed',
      ) && (
        <Alert tone="warning">
          Simulated email delivery failed. The underlying operation remains
          committed; staff can replace an outstanding invitation with Resend.
          Notification-only resend is available on the notifications screen.
        </Alert>
      )}
      <ul>
        {notifications.map((notification) => (
          <li key={notification.notificationId}>
            {notification.recipient.email}: simulated {notification.status};
            attempts: {notification.attempts.length}
          </li>
        ))}
      </ul>
    </section>
  );
}

function isUtcInstant(value: string): value is UtcInstant {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value);
}

function ProfileEditor({
  member,
  onClose,
}: {
  member: MemberView;
  onClose: () => void;
}) {
  const demo = useDemoState();
  const feedback = useActionFeedback();
  const [displayName, setDisplayName] = useState(member.displayName);
  const [verifiedEmail, setVerifiedEmail] = useState(
    member.verifiedEmail ?? '',
  );
  const [contactEmail, setContactEmail] = useState(member.contactEmail ?? '');
  const [eligibility, setEligibility] = useState<AdultEligibility | ''>('');
  const [attestationAt, setAttestationAt] = useState('');
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (attestationAt && !isUtcInstant(attestationAt)) {
      feedback.reject({
        category: 'ValidationError',
        message:
          'Enter an adult-attestation timestamp in UTC, such as 2026-10-01T15:00:00Z.',
        fields: [
          { field: 'adultAttestationAt', message: 'Use YYYY-MM-DDTHH:mm:ssZ.' },
        ],
      });
      return;
    }
    const updates: MemberProfileUpdate = {
      displayName,
      verifiedEmail,
      ...(contactEmail ? { contactEmail } : {}),
      ...(eligibility ? { adultEligibility: eligibility } : {}),
      ...(isUtcInstant(attestationAt)
        ? { adultAttestationAt: attestationAt }
        : {}),
    };
    feedback.submit(
      {
        type: 'updateMemberProfile',
        payload: { memberId: member.memberId, updates },
      },
      'Profile corrected. Stable member ID, identity association, and linked history retained.',
    );
  }
  return (
    <section className={styles.section} aria-label="Member profile correction">
      <h3>Correct profile: {member.displayName}</h3>
      <p>Stable member ID: {member.memberId}</p>
      <p>
        Demo staff correction only; this does not reverify email or change a
        real provider account. Denying adult eligibility deactivates an active
        member. Blank optional corrections retain the existing evidence.
      </p>
      <Feedback {...feedback} />
      <form className={styles.form} noValidate onSubmit={save}>
        <InputField
          label="Member display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          error={feedback.fieldError('displayName')}
        />
        <InputField
          label="Verified profile email"
          type="email"
          value={verifiedEmail}
          onChange={(e) => setVerifiedEmail(e.target.value)}
          error={feedback.fieldError('verifiedEmail')}
        />
        <InputField
          label="Contact email"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          error={feedback.fieldError('contactEmail')}
        />
        <SelectField
          label="Adult eligibility correction"
          value={eligibility}
          onChange={(e) =>
            setEligibility(
              e.target.value === 'denied'
                ? 'denied'
                : e.target.value === 'attested'
                  ? 'attested'
                  : '',
            )
          }
        >
          <option value="">Retain existing eligibility</option>
          <option value="attested">Attested adult</option>
          <option value="denied">Deny adult eligibility</option>
        </SelectField>
        <InputField
          label="Adult attestation UTC timestamp correction"
          value={attestationAt}
          onChange={(e) => setAttestationAt(e.target.value)}
          error={feedback.fieldError('adultAttestationAt')}
          hint={`Optional correction; frozen clock now: ${demo.now}`}
        />
        <div className={styles.actions}>
          <Button type="submit">Save profile</Button>
          <Button onClick={onClose}>Close profile</Button>
        </div>
      </form>
    </section>
  );
}

function StaffMembers({ managesMembers }: { managesMembers: boolean }) {
  const demo = useDemoState();
  const feedback = useActionFeedback();
  const members = selectMembers(demo.state);
  const settings = selectSettings(demo.state);
  const [editingId, setEditingId] = useState<MemberView['memberId']>();
  const editingMember = members.find((member) => member.memberId === editingId);
  return (
    <section className={styles.section}>
      <h2>
        {managesMembers ? 'Member management' : 'Assigned-class member summary'}
      </h2>
      <p>
        {managesMembers
          ? 'Admin and Front Desk can manage members. Pending/inactive members cannot book or check in. Deactivation retains bookings and waitlist entries, flagged for staff resolution; it does not cancel or reassign them.'
          : 'Coach view is limited to names and statuses on assigned-class rosters; member and invitation management require Admin or Front Desk.'}
      </p>
      {managesMembers && (
        <p>
          Active members: {members.filter((m) => m.status === 'active').length}{' '}
          / {settings.memberCap}. Member cap and invitation expiry (
          {settings.invitationExpiryMinutes} minutes) are illustrative, not
          approved gym policy. Pending members do not count toward the cap.
          Activate resolves a pending member only when capacity, adult
          eligibility, accepted invitation, and current waiver allow it.
        </p>
      )}
      <Feedback {...feedback} />
      <DataTable
        caption={
          managesMembers
            ? 'Fictional gym members'
            : 'Assigned-class members (redacted)'
        }
        rows={members}
        getRowKey={(member) => member.memberId}
        columns={[
          { key: 'name', header: 'Display name', render: (m) => m.displayName },
          {
            key: 'status',
            header: 'Status',
            render: (m) => <StatusBadge>{m.status}</StatusBadge>,
          },
          ...(managesMembers
            ? [
                {
                  key: 'email',
                  header: 'Verified email',
                  render: (m: MemberView) => m.verifiedEmail,
                },
                {
                  key: 'waiver',
                  header: 'Waiver evidence',
                  render: (m: MemberView) => <SignatureStatus member={m} />,
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  render: (m: MemberView) => (
                    <div className={styles.actions}>
                      <Button onClick={() => setEditingId(m.memberId)}>
                        Edit profile
                      </Button>
                      <Button
                        onClick={() =>
                          feedback.submit(
                            {
                              type: 'setMemberStatus',
                              payload: {
                                memberId: m.memberId,
                                status:
                                  m.status === 'active' ? 'inactive' : 'active',
                              },
                            },
                            m.status === 'active'
                              ? 'Member deactivated; existing bookings and queues retained for staff review.'
                              : 'Member activated in local demo state.',
                          )
                        }
                      >
                        {m.status === 'active' ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
      {managesMembers && editingMember && (
        <ProfileEditor
          key={editingMember.memberId}
          member={editingMember}
          onClose={() => setEditingId(undefined)}
        />
      )}
    </section>
  );
}

function AcceptanceForm({
  invitation,
  waiverVersionId,
  onComplete,
}: {
  invitation: InvitationView;
  waiverVersionId: WaiverVersionId;
  onComplete: (message: string) => void;
}) {
  const demo = useDemoState();
  const feedback = useActionFeedback();
  const [displayName, setDisplayName] = useState('');
  const [adultAttested, setAdultAttested] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [identityScenario, setIdentityScenario] = useState<IdentityScenario>(
    selectSimulation(demo.state).identity,
  );
  function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const identity: IdentityOutcome =
      identityScenario === 'rejected'
        ? {
            outcome: 'rejected',
            message: 'The local simulated identity was rejected.',
          }
        : {
            outcome: identityScenario,
            subject: `identity:invitation-${invitation.invitationId}`,
            verifiedEmail:
              identityScenario === 'verified'
                ? invitation.email
                : 'mismatched@example.invalid',
          };
    const memberId = `member:accept-${invitation.invitationId}` as const;
    const result = feedback.submit(
      {
        type: 'acceptInvitation',
        payload: {
          invitationId: invitation.invitationId,
          memberId,
          signatureId: `signature:accept-${invitation.invitationId}`,
          displayName,
          adultAttested,
          identity,
          waiver: { waiverVersionId, typedName },
        },
      },
      '',
    );
    if (result.success) {
      // Render only the validated outcome, not a raw member record.
      const outcome = result.value.changes.members?.find(
        (member) => member.memberId === memberId,
      )?.status;
      if (!outcome)
        throw new Error('Accepted invitation is missing its member outcome.');
      onComplete(
        `Invitation accepted: ${outcome}. ${outcome === 'pending' ? 'The active cap is full; pending members cannot book or check in and require staff resolution.' : 'Active membership recorded with current waiver evidence.'}`,
      );
    }
  }
  return (
    <>
      <Feedback {...feedback} />
      <form noValidate onSubmit={accept} className={styles.form}>
        <SelectField
          label="Simulated identity outcome"
          value={identityScenario}
          onChange={(e) =>
            setIdentityScenario(
              e.target.value === 'rejected'
                ? 'rejected'
                : e.target.value === 'mismatched'
                  ? 'mismatched'
                  : 'verified',
            )
          }
          hint="Local demo subject only. No credentials, email verification, or ongoing session."
        >
          <option value="verified">Verified matching fictional identity</option>
          <option value="rejected">Rejected fictional identity</option>
          <option value="mismatched">Mismatched fictional identity</option>
        </SelectField>
        <InputField
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          error={feedback.fieldError('displayName')}
        />
        <CheckboxField
          label="I attest that I am at least 18"
          checked={adultAttested}
          onChange={(e) => setAdultAttested(e.target.checked)}
          error={
            feedback.error?.category === 'IneligibleDemoAction' &&
            feedback.error.reason === 'adultEligibilityDenied'
              ? feedback.error.message
              : undefined
          }
        />
        <WaiverText />
        <InputField
          label="Typed signature"
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          error={feedback.fieldError('typedName')}
          hint="Type a fictional name to sign the displayed current version."
        />
        <Button type="submit">Complete acceptance</Button>
      </form>
    </>
  );
}

function InvitationJourney() {
  const demo = useDemoState();
  const invitations = selectInvitations(demo.state);
  const invitation = invitations[0];
  const waiver = getCurrentWaiver(demo.state);
  const [completion, setCompletion] = useState('');
  if (completion) return <Alert tone="success">{completion}</Alert>;
  if (demo.capabilities.success && invitation && waiver.success) {
    return (
      <section className={styles.section}>
        <h2>Invitation acceptance</h2>
        <p>
          Selected fictional invitation: {invitation.email}; expires at{' '}
          {invitation.expiresAt} (UTC).
        </p>
        <AcceptanceForm
          key={waiver.value.waiverVersionId}
          invitation={invitation}
          waiverVersionId={waiver.value.waiverVersionId}
          onComplete={setCompletion}
        />
      </section>
    );
  }
  return (
    <Alert>
      {!demo.capabilities.success
        ? demo.capabilities.error.message
        : !waiver.success
          ? waiver.error.message
          : 'Select a valid outstanding invitation in the demo shell.'}
    </Alert>
  );
}

function OwnSignatureForm({
  member,
  waiverVersionId,
}: {
  member: MemberView;
  waiverVersionId: WaiverVersionId;
}) {
  const demo = useDemoState();
  const feedback = useActionFeedback();
  const [typedName, setTypedName] = useState('');
  function sign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    feedback.submit(
      {
        type: 'signWaiver',
        payload: {
          memberId: member.memberId,
          signatureId: `signature:members-${demo.revision}`,
          waiverVersionId,
          typedName,
        },
      },
      'Current waiver signed in local demo state.',
    );
  }
  return (
    <form className={styles.form} noValidate onSubmit={sign}>
      <Feedback {...feedback} />
      <WaiverText />
      <InputField
        label="Typed signature"
        value={typedName}
        onChange={(e) => setTypedName(e.target.value)}
        error={feedback.fieldError('typedName')}
      />
      <Button type="submit">Sign current waiver</Button>
    </form>
  );
}

function OwnMember() {
  const demo = useDemoState();
  const member = selectMembers(demo.state)[0];
  if (!member)
    return <Alert>The selected fictional member is unavailable.</Alert>;
  const compliance = selectWaiverCompliance(demo.state, member.memberId);
  const waiver = getCurrentWaiver(demo.state);
  return (
    <section className={styles.section}>
      <h2>Your fictional membership</h2>
      <p>
        {member.displayName}; {member.verifiedEmail}; status: {member.status}
      </p>
      {member.status !== 'active' && (
        <p>
          Pending/inactive members cannot book or check in. Authorized staff
          must resolve eligibility and capacity.
        </p>
      )}
      <SignatureStatus member={member} />
      {compliance.status !== 'current' && (
        <>
          <p>
            Sign the current waiver before new booking or check-in; existing
            bookings are retained.
          </p>
          {waiver.success ? (
            <OwnSignatureForm
              key={waiver.value.waiverVersionId}
              member={member}
              waiverVersionId={waiver.value.waiverVersionId}
            />
          ) : (
            <Alert>{waiver.error.message}</Alert>
          )}
        </>
      )}
    </section>
  );
}

function MembersWorkspace() {
  const demo = useDemoState();
  if (demo.activeActor.kind === 'invitation') return <InvitationJourney />;
  if (!demo.capabilities.success)
    return <Alert>{demo.capabilities.error.message}</Alert>;
  if (demo.activeActor.kind === 'member') return <OwnMember />;
  const managesMembers =
    demo.capabilities.value.capabilities.includes('manageMembers');
  const managesInvitations =
    demo.capabilities.value.capabilities.includes('manageInvitations');
  return (
    <>
      <StaffMembers managesMembers={managesMembers} />
      {managesInvitations && <InvitationManagement />}
    </>
  );
}

function actorKey(actor: ReturnType<typeof useDemoState>['activeActor']) {
  return actor.kind === 'staff'
    ? actor.staffId
    : actor.kind === 'member'
      ? actor.memberId
      : actor.invitationId;
}

function useWorkspaceKey(demo: ReturnType<typeof useDemoState>) {
  const [replacementRevision, setReplacementRevision] = useState(demo.revision);
  if (!demo.hasUnsavedEdits && replacementRevision !== demo.revision) {
    setReplacementRevision(demo.revision);
  }
  return `${demo.state.scenarioId}:${actorKey(demo.activeActor)}:${replacementRevision}`;
}

export function MembersScreen() {
  const demo = useDemoState();
  const workspaceKey = useWorkspaceKey(demo);
  return (
    <main className={styles.screen}>
      <h1>Members and invitations</h1>
      <BoundaryNotice />
      <MembersWorkspace key={workspaceKey} />
    </main>
  );
}

export function InvitationAcceptanceScreen() {
  const demo = useDemoState();
  const workspaceKey = useWorkspaceKey(demo);
  return (
    <main className={styles.screen}>
      <h1>Simulated invitation acceptance</h1>
      <BoundaryNotice />
      {demo.activeActor.kind === 'invitation' ? (
        <InvitationJourney key={workspaceKey} />
      ) : (
        <Alert>
          Select an outstanding fictional invitation persona in the demo shell.
          Staff cannot accept on an invitee's behalf.
        </Alert>
      )}
    </main>
  );
}
