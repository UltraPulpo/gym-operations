import { useState } from 'react';
import {
  selectClasses,
  selectMemberBookings,
  selectMembers,
  selectWaiverCompliance,
  useDemoState,
} from '../../demo-state';
import { getCurrentWaiver } from '../../domain';
import type { DemoAction, DomainError, WaiverVersionId } from '../../domain';
import {
  Alert,
  Button,
  ConfirmationDialog,
  DataTable,
  InputField,
  SelectField,
  StatusBadge,
  TextareaField,
  UnavailableState,
} from '../../shared';
import styles from './waivers.module.css';

type FormSource = 'create' | 'sign' | 'publish';
interface Failure {
  readonly source: FormSource;
  readonly error: DomainError;
}
interface PendingConfirmation {
  readonly source: 'publish' | 'sign';
  readonly action: DemoAction;
  readonly revision: number;
  readonly description: string;
  readonly successMessage: string;
}

export function WaiversScreen() {
  const { activeActor } = useDemoState();
  const actorKey =
    activeActor.kind === 'staff'
      ? activeActor.staffId
      : activeActor.kind === 'member'
        ? activeActor.memberId
        : activeActor.invitationId;
  return <WaiverWorkspace key={actorKey} />;
}

function WaiverWorkspace() {
  const demo = useDemoState();
  const { state, activeActor, capabilities } = demo;
  const current = getCurrentWaiver(state);
  const members = selectMembers(state, activeActor);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const selectedMember =
    members.find((member) => member.memberId === selectedMemberId) ??
    members[0];
  const nextVersion =
    Math.max(0, ...state.waivers.map((waiver) => waiver.version)) + 1;
  const [version, setVersion] = useState(String(nextVersion));
  const [text, setText] = useState('');
  const [typedName, setTypedName] = useState('');
  const [failure, setFailure] = useState<Failure>();
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<PendingConfirmation>();
  const [observedRevision, setObservedRevision] = useState(demo.revision);
  const canManage =
    capabilities.success &&
    capabilities.value.capabilities.includes('manageWaivers');
  const canInspect =
    capabilities.success &&
    activeActor.kind === 'staff' &&
    capabilities.value.capabilities.includes('viewRoster');
  const canSign =
    capabilities.success &&
    activeActor.kind === 'member' &&
    capabilities.value.capabilities.includes('signWaiver');
  const compliance = selectedMember
    ? selectWaiverCompliance(state, selectedMember.memberId)
    : undefined;

  if (observedRevision !== demo.revision) {
    setObservedRevision(demo.revision);
    if (!demo.hasUnsavedEdits) {
      setSelectedMemberId('');
      setVersion(String(nextVersion));
      setText('');
      setTypedName('');
      setFailure(undefined);
      setMessage('');
      setPending(undefined);
    }
  }

  function fieldError(source: FormSource, field: string) {
    return failure?.source === source &&
      failure.error.category === 'ValidationError'
      ? failure.error.fields.find((entry) => entry.field === field)?.message
      : undefined;
  }

  function prepareConfirmation(
    source: 'publish' | 'sign',
    action: DemoAction,
    description: string,
    successMessage: string,
  ) {
    setFailure(undefined);
    setMessage('');
    const result = demo.validate(action);
    if (!result.success) {
      setFailure({ source, error: result.error });
      return;
    }
    setPending({
      source,
      action,
      revision: demo.revision,
      description,
      successMessage,
    });
  }

  function publish(waiverVersionId: WaiverVersionId, versionNumber: number) {
    prepareConfirmation(
      'publish',
      { type: 'publishWaiver', payload: { waiverVersionId } },
      `Publish version ${versionNumber}? Existing bookings and signatures remain. Members must sign the new current version before new bookings or check-in. This is not a legal publication.`,
      `Published waiver version ${versionNumber}.`,
    );
  }

  function confirm() {
    if (!pending) return;
    const result = demo.submit(pending.action, {
      expectedRevision: pending.revision,
    });
    setPending(undefined);
    if (!result.success) {
      setFailure({ source: pending.source, error: result.error });
      return;
    }
    setFailure(undefined);
    if (pending.source === 'sign') {
      setTypedName('');
    }
    setMessage(pending.successMessage);
  }

  const signatures = selectedMember
    ? state.waiverSignatures
        .filter((signature) => signature.memberId === selectedMember.memberId)
        .map((signature) => ({
          ...signature,
          waiver: state.waivers.find(
            (waiver) => waiver.waiverVersionId === signature.waiverVersionId,
          ),
        }))
        .sort((left, right) => right.signedAt.localeCompare(left.signedAt))
    : [];
  const classes = selectClasses(state, { actor: activeActor, now: demo.now });
  const bookings = selectedMember
    ? selectMemberBookings(state, selectedMember.memberId).filter(
        (booking) =>
          activeActor.kind !== 'staff' ||
          classes.some(
            (scheduledClass) => scheduledClass.classId === booking.classId,
          ),
      )
    : [];

  return (
    <section className={styles.screen} aria-labelledby="waivers-title">
      <h1 id="waivers-title">Waivers</h1>
      <p className={styles.notice}>
        Fictional, non-legal simulation only. Text, typed names and timestamps
        are not legal evidence or credentials. Use fictional names and text; do
        not enter real personal information. Nothing is signed legally, sent or
        persisted. Refresh resets this demonstration.
      </p>
      {!capabilities.success ? (
        <Alert>{capabilities.error.message}</Alert>
      ) : !canManage && !canInspect && !canSign ? (
        <UnavailableState message="Use the invitation acceptance workflow to simulate the initial waiver signature. Select a member or authorized staff persona to inspect waivers here." />
      ) : (
        <>
          {failure && (
            <Alert title="Demo action rejected">{failure.error.message}</Alert>
          )}
          {message && <Alert tone="success">{message}</Alert>}
          <section
            className={styles.panel}
            aria-labelledby="current-waiver-title"
          >
            <h2 id="current-waiver-title">Current waiver</h2>
            {current.success ? (
              <>
                <h3>Version {current.value.version}</h3>
                <p className={styles.waiverText}>{current.value.text}</p>
                <p>
                  Published at{' '}
                  <time dateTime={current.value.publishedAt}>
                    {current.value.publishedAt}
                  </time>{' '}
                  (UTC, frozen demo clock).
                </p>
              </>
            ) : (
              <Alert>{current.error.message}</Alert>
            )}
          </section>
          {canManage && (
            <section className={styles.panel} aria-labelledby="versions-title">
              <h2 id="versions-title">Admin versions</h2>
              <form
                noValidate
                aria-label="Create waiver draft"
                onSubmit={(event) => {
                  event.preventDefault();
                  setMessage('');
                  setFailure(undefined);
                  const result = demo.submit({
                    type: 'createWaiverVersion',
                    payload: {
                      waiver: {
                        waiverVersionId: `waiver:demo-version-${version}-revision-${demo.revision}`,
                        version: Number(version),
                        text,
                        status: 'draft',
                        createdAt: demo.now,
                      },
                    },
                  });
                  if (!result.success) {
                    setFailure({ source: 'create', error: result.error });
                    return;
                  }
                  setMessage(`Created draft version ${Number(version)}.`);
                  setText('');
                  setVersion(
                    String(Math.max(nextVersion, Number(version) + 1)),
                  );
                }}
              >
                <InputField
                  label="Version number"
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                  error={fieldError('create', 'version')}
                />
                <TextareaField
                  label="Waiver text"
                  required
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  hint="Placeholder text only; never enter a real legal waiver."
                  error={fieldError('create', 'text')}
                />
                <Button type="submit">Create draft</Button>
              </form>
              <DataTable
                caption="Waiver versions"
                rows={state.waivers
                  .slice()
                  .sort((left, right) => right.version - left.version)}
                getRowKey={(waiver) => waiver.waiverVersionId}
                columns={[
                  {
                    key: 'version',
                    header: 'Version',
                    render: (waiver) => `Version ${waiver.version}`,
                  },
                  {
                    key: 'text',
                    header: 'Waiver text',
                    render: (waiver) => (
                      <span className={styles.waiverText}>{waiver.text}</span>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (waiver) => (
                      <StatusBadge>
                        {waiver.waiverVersionId === state.currentWaiverVersionId
                          ? 'Current publication'
                          : waiver.status === 'draft'
                            ? 'Draft'
                            : 'Previous publication'}
                      </StatusBadge>
                    ),
                  },
                  {
                    key: 'action',
                    header: 'Publication',
                    render: (waiver) =>
                      waiver.status === 'draft' ? (
                        <Button
                          onClick={() =>
                            publish(waiver.waiverVersionId, waiver.version)
                          }
                        >
                          Publish version {waiver.version}
                        </Button>
                      ) : (
                        <time dateTime={waiver.publishedAt}>
                          {waiver.publishedAt}
                        </time>
                      ),
                  },
                ]}
              />
            </section>
          )}
          {canInspect && (
            <SelectField
              label="Member to inspect"
              value={selectedMember?.memberId ?? ''}
              onChange={(event) => {
                setSelectedMemberId(event.target.value);
                setFailure(undefined);
                setMessage('');
              }}
              disabled={members.length === 0}
            >
              {members.map((member) => (
                <option key={member.memberId} value={member.memberId}>
                  {member.displayName}
                </option>
              ))}
            </SelectField>
          )}
          {selectedMember && compliance ? (
            <section className={styles.panel} aria-labelledby="signature-title">
              <h2 id="signature-title">
                Signature status: {selectedMember.displayName}
              </h2>
              <p>Member status: {selectedMember.status}</p>
              <StatusBadge
                tone={compliance.status === 'current' ? 'success' : 'warning'}
              >
                {compliance.status === 'current'
                  ? 'Current signature'
                  : compliance.status === 'outdated'
                    ? 'Outdated signature'
                    : compliance.status === 'missing'
                      ? 'Missing signature'
                      : 'Waiver unavailable'}
              </StatusBadge>
              {compliance.status === 'current' ? (
                <p>
                  Waiver requirement met; other eligibility, class, station and
                  timing rules still apply. This is not a booking or check-in
                  confirmation.
                </p>
              ) : (
                <Alert tone="warning">
                  {compliance.status === 'unavailable'
                    ? compliance.error.message
                    : 'New bookings and check-in are blocked until this member signs the current waiver. Existing bookings and old signatures are preserved.'}
                </Alert>
              )}
              <DataTable
                caption="Signature history"
                rows={signatures}
                getRowKey={(signature) => signature.signatureId}
                emptyMessage="No simulated signatures for this member."
                columns={[
                  {
                    key: 'version',
                    header: 'Signed version',
                    render: (signature) =>
                      signature.waiver
                        ? `Version ${signature.waiver.version}`
                        : `Unavailable version (${signature.waiverVersionId})`,
                  },
                  {
                    key: 'status',
                    header: 'Requirement',
                    render: (signature) =>
                      signature.waiverVersionId === state.currentWaiverVersionId
                        ? 'Current'
                        : 'Old',
                  },
                  {
                    key: 'name',
                    header: 'Typed name',
                    render: (signature) => signature.typedName,
                  },
                  {
                    key: 'time',
                    header: 'Simulated signed time (UTC)',
                    render: (signature) => (
                      <time dateTime={signature.signedAt}>
                        {signature.signedAt}
                      </time>
                    ),
                  },
                  {
                    key: 'text',
                    header: 'Signed waiver text',
                    render: (signature) => (
                      <span className={styles.waiverText}>
                        {signature.waiver?.text ??
                          'Signed version text unavailable.'}
                      </span>
                    ),
                  },
                ]}
              />
              {canSign && compliance.status !== 'current' && (
                <form
                  noValidate
                  aria-label="Sign waiver"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!current.success) {
                      setFailure({ source: 'sign', error: current.error });
                      return;
                    }
                    prepareConfirmation(
                      'sign',
                      {
                        type: 'signWaiver',
                        payload: {
                          memberId: selectedMember.memberId,
                          waiverVersionId: current.value.waiverVersionId,
                          signatureId: `signature:demo-${selectedMember.memberId}-${demo.revision}`,
                          typedName,
                        },
                      },
                      `Record the typed name "${typedName}" for version ${current.value.version} at ${demo.now} (UTC)? This simulated signature is not legal evidence.`,
                      'Recorded simulated signature for the current waiver.',
                    );
                  }}
                >
                  <InputField
                    label="Typed name"
                    required
                    value={typedName}
                    onChange={(event) => setTypedName(event.target.value)}
                    hint="Enter a fictional name, not a credential or real signature."
                    error={fieldError('sign', 'typedName')}
                  />
                  <Button type="submit" disabled={!current.success}>
                    Sign current waiver
                  </Button>
                </form>
              )}
              <DataTable
                caption="Existing demo bookings"
                rows={bookings}
                getRowKey={(booking) => booking.bookingId}
                emptyMessage="No existing demo bookings for this member."
                columns={[
                  {
                    key: 'class',
                    header: 'Class',
                    render: (booking) => {
                      const scheduledClass = classes.find(
                        (candidate) => candidate.classId === booking.classId,
                      );
                      return scheduledClass
                        ? `${scheduledClass.classTypeSnapshot.name} (${booking.classId})`
                        : booking.classId;
                    },
                  },
                  {
                    key: 'station',
                    header: 'Station identifier',
                    render: (booking) => booking.stationId,
                  },
                  {
                    key: 'status',
                    header: 'Booking status',
                    render: (booking) => booking.status,
                  },
                ]}
              />
            </section>
          ) : (
            <UnavailableState message="No member records are visible to this demo persona. Signature evidence is unavailable." />
          )}
          <ConfirmationDialog
            open={pending !== undefined}
            title={
              pending?.source === 'publish'
                ? 'Publish waiver?'
                : 'Record signature?'
            }
            description={pending?.description ?? ''}
            confirmLabel={
              pending?.source === 'publish'
                ? 'Publish version'
                : 'Record simulated signature'
            }
            onConfirm={confirm}
            onCancel={() => setPending(undefined)}
          />
        </>
      )}
    </section>
  );
}
