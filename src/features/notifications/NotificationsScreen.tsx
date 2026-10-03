import { useState } from 'react';
import {
  selectClasses,
  selectMembers,
  selectNotifications,
  useDemoState,
} from '../../demo-state';
import type {
  DeliveryScenario,
  DomainError,
  NotificationEvent,
  NotificationRecord,
} from '../../domain';
import {
  Alert,
  Button,
  DataTable,
  SelectField,
  StatusBadge,
  UnavailableState,
} from '../../shared';
import styles from './notifications.module.css';

const eventLabels: Record<NotificationEvent['type'], string> = {
  invitation: 'Invitation',
  bookingConfirmed: 'Booking confirmation',
  waitlistPromoted: 'Waitlist promotion',
  classCancelled: 'Class cancellation',
  classChanged: 'Class change',
};

const changeLabels = {
  date: 'Date',
  startTime: 'start time',
  coach: 'coach',
};

interface NotificationView extends Omit<NotificationRecord, 'recipient'> {
  readonly recipientLabel: string;
}

interface Failure {
  readonly source: 'delivery' | 'resend';
  readonly error: DomainError;
}

export function NotificationsScreen() {
  const { activeActor, state } = useDemoState();
  const actorId =
    activeActor.kind === 'staff'
      ? activeActor.staffId
      : activeActor.kind === 'member'
        ? activeActor.memberId
        : activeActor.invitationId;
  return <NotificationWorkspace key={`${actorId}:${state.scenarioId}`} />;
}

function OperationReferences({ event }: { readonly event: NotificationEvent }) {
  return (
    <dl className={styles.references}>
      {event.type === 'invitation' ? (
        <>
          <dt>Invitation reference</dt>
          <dd>{event.invitationId}</dd>
        </>
      ) : (
        <>
          <dt>Class reference</dt>
          <dd>{event.classId}</dd>
          {(event.type === 'bookingConfirmed' ||
            event.type === 'waitlistPromoted') && (
            <>
              <dt>Confirmed booking reference</dt>
              <dd>{event.bookingId}</dd>
            </>
          )}
          {event.type === 'waitlistPromoted' && (
            <>
              <dt>Promoted waitlist entry</dt>
              <dd>{event.entryId}</dd>
            </>
          )}
          {event.type === 'classChanged' && (
            <>
              <dt>Changed fields</dt>
              <dd>
                {event.changes.map((change) => changeLabels[change]).join(', ')}
              </dd>
            </>
          )}
        </>
      )}
    </dl>
  );
}

function DeliveryOptions() {
  return (
    <>
      <option value="success">Simulated success (no email sent)</option>
      <option value="failure">Simulated failure (no email sent)</option>
    </>
  );
}

function NotificationWorkspace() {
  const demo = useDemoState();
  const { state, activeActor, capabilities } = demo;
  const [selectedId, setSelectedId] = useState('');
  const [resendOutcome, setResendOutcome] =
    useState<DeliveryScenario>('success');
  const [failure, setFailure] = useState<Failure>();
  const [message, setMessage] = useState<{
    readonly text: string;
    readonly notificationId: NotificationRecord['notificationId'];
    readonly attemptCount: number;
  }>();
  const canManage =
    capabilities.success &&
    activeActor.kind === 'staff' &&
    capabilities.value.capabilities.includes('manageNotifications');
  const canInspect =
    capabilities.success &&
    (canManage ||
      (activeActor.kind === 'member' &&
        capabilities.value.capabilities.includes('viewSchedule')) ||
      (activeActor.kind === 'staff' &&
        capabilities.value.capabilities.includes('viewRoster')));
  const classes = selectClasses(state, { actor: activeActor, now: demo.now });
  const members = selectMembers(state, activeActor);
  // The existing notification selector is unscoped; project before rendering.
  const records: readonly NotificationView[] = canInspect
    ? selectNotifications(state)
        .filter((record) => {
          if (canManage) return true;
          if (activeActor.kind === 'member') {
            return (
              record.recipient.kind === 'member' &&
              record.recipient.memberId === activeActor.memberId
            );
          }
          return (
            activeActor.kind === 'staff' &&
            record.event.type !== 'invitation' &&
            classes.some(
              (scheduledClass) =>
                record.event.type !== 'invitation' &&
                scheduledClass.classId === record.event.classId,
            )
          );
        })
        .map(({ recipient, ...record }) => ({
          ...record,
          recipientLabel:
            canManage || activeActor.kind === 'member'
              ? recipient.email
              : recipient.kind === 'member'
                ? (members.find(
                    (member) => member.memberId === recipient.memberId,
                  )?.displayName ?? 'Fictional member')
                : 'Fictional invitee',
        }))
    : [];
  const selected =
    records.find((record) => record.notificationId === selectedId) ??
    records[0];
  const failedAttempts = selected?.attempts.filter(
    (attempt) => attempt.status === 'failed',
  );

  function fieldError(source: Failure['source'], field: string) {
    return failure?.source === source &&
      failure.error.category === 'ValidationError'
      ? failure.error.fields.find((entry) => entry.field === field)?.message
      : undefined;
  }

  function chooseOutcome(value: string, source: Failure['source']) {
    setMessage(undefined);
    setFailure(undefined);
    if (value !== 'success' && value !== 'failure') {
      setFailure({
        source,
        error: {
          category: 'ValidationError',
          message: 'Select a supported simulated delivery outcome.',
          fields: [
            {
              field: source === 'delivery' ? 'payload.delivery' : 'scenario',
              message: 'Choose simulated success or failure.',
            },
          ],
        },
      });
      return;
    }
    if (source === 'resend') {
      setResendOutcome(value);
      return;
    }
    const result = demo.submit({
      type: 'setSimulation',
      payload: { delivery: value },
    });
    if (!result.success) {
      setFailure({ source, error: result.error });
    }
  }

  function resend() {
    setMessage(undefined);
    setFailure(undefined);
    if (!selected) {
      setFailure({
        source: 'resend',
        error: {
          category: 'DemoUnavailableState',
          resource: 'notification',
          stale: false,
          message: 'Select an available simulated notification to resend.',
        },
      });
      return;
    }
    const result = demo.submit({
      type: 'resendNotification',
      payload: {
        notificationId: selected.notificationId,
        scenario: resendOutcome,
      },
    });
    if (!result.success) {
      setFailure({ source: 'resend', error: result.error });
      return;
    }
    const updated = result.value.changes.notifications?.find(
      (record) => record.notificationId === selected.notificationId,
    );
    if (!updated) {
      setFailure({
        source: 'resend',
        error: {
          category: 'DemoUnavailableState',
          resource: 'notification',
          stale: true,
          message: 'The simulated resend attempt history is unavailable.',
        },
      });
      return;
    }
    if (resendOutcome === 'success') {
      setMessage({
        text: 'Simulated resend succeeded; no email was transmitted. The original operation and all earlier attempts are unchanged.',
        notificationId: updated.notificationId,
        attemptCount: updated.attempts.length,
      });
    }
  }

  return (
    <section className={styles.screen} aria-labelledby="notifications-title">
      <h1 id="notifications-title">Simulated notifications</h1>
      <p className={styles.notice}>
        Fictional, non-operational demonstration only. No email is transmitted
        and no email or identity provider is contacted. Delivery is
        deterministic and local, not evidence of delivery. Failure never
        reverses a committed invitation, booking, promotion, cancellation or
        class change. State is in memory only; refresh resets the demo.
      </p>
      {!capabilities.success ? (
        <Alert>{capabilities.error.message}</Alert>
      ) : !canInspect ? (
        <UnavailableState message="Select a member or authorized staff persona to inspect simulated notifications." />
      ) : (
        <>
          {failure && (
            <Alert title="Demo action rejected">{failure.error.message}</Alert>
          )}
          {message &&
            records.some(
              (record) =>
                record.notificationId === message.notificationId &&
                record.status === 'sent' &&
                record.attempts.length === message.attemptCount,
            ) && <Alert tone="success">{message.text}</Alert>}
          {canManage && (
            <SelectField
              label="Simulated email outcome"
              hint="Applies to future accepted operations, not existing records. Changing this does not resend anything."
              value={state.simulation.delivery}
              onChange={(event) =>
                chooseOutcome(event.target.value, 'delivery')
              }
              error={fieldError('delivery', 'payload.delivery')}
            >
              <DeliveryOptions />
            </SelectField>
          )}
          <DataTable
            caption="Simulated delivery records"
            rows={records}
            getRowKey={(record) => record.notificationId}
            emptyMessage="No notifications are visible to this persona."
            columns={[
              {
                key: 'event',
                header: 'Committed operation',
                render: (record) => eventLabels[record.event.type],
              },
              {
                key: 'recipient',
                header: 'Fictional recipient',
                render: (record) => record.recipientLabel,
              },
              {
                key: 'status',
                header: 'Latest simulated outcome',
                render: (record) => (
                  <StatusBadge
                    tone={record.status === 'failed' ? 'danger' : 'success'}
                  >
                    {record.status === 'failed'
                      ? 'Simulated failure'
                      : 'Simulated success'}
                  </StatusBadge>
                ),
              },
              {
                key: 'attempts',
                header: 'Attempts',
                render: (record) => record.attempts.length,
              },
              {
                key: 'created',
                header: 'Created (UTC)',
                render: (record) => (
                  <time dateTime={record.createdAt}>{record.createdAt}</time>
                ),
              },
            ]}
          />
          {selected && (
            <>
              <SelectField
                label="Notification to inspect"
                value={selected.notificationId}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  setFailure(undefined);
                  setMessage(undefined);
                }}
              >
                {records.map((record) => (
                  <option
                    key={record.notificationId}
                    value={record.notificationId}
                  >
                    {eventLabels[record.event.type]}: {record.recipientLabel} (
                    {record.notificationId})
                  </option>
                ))}
              </SelectField>
              <section
                className={styles.panel}
                aria-labelledby="notification-detail-title"
              >
                <h2 id="notification-detail-title">Selected notification</h2>
                <h3>{eventLabels[selected.event.type]}</h3>
                <p>Notification reference: {selected.notificationId}</p>
                <p>Fictional recipient: {selected.recipientLabel}</p>
                <OperationReferences event={selected.event} />
                {failedAttempts && failedAttempts.length > 0 && (
                  <Alert title="Retained simulated delivery failure">
                    <p>{failedAttempts.at(-1)?.error.message}</p>
                    <p>
                      The operation remains committed. Earlier failed attempts
                      remain attached to this record even after a successful
                      simulated resend. Nothing retries automatically.
                    </p>
                  </Alert>
                )}
                <DataTable
                  caption="Delivery attempt history"
                  rows={selected.attempts}
                  getRowKey={(attempt) => attempt.attemptId}
                  columns={[
                    {
                      key: 'attempt',
                      header: 'Attempt reference',
                      render: (attempt) => attempt.attemptId,
                    },
                    {
                      key: 'time',
                      header: 'Attempted (UTC, frozen demo clock)',
                      render: (attempt) => (
                        <time dateTime={attempt.attemptedAt}>
                          {attempt.attemptedAt}
                        </time>
                      ),
                    },
                    {
                      key: 'status',
                      header: 'Simulated outcome',
                      render: (attempt) =>
                        attempt.status === 'failed'
                          ? 'Simulated failure'
                          : 'Simulated success',
                    },
                    {
                      key: 'source',
                      header: 'Attempt source',
                      render: (attempt) =>
                        attempt.resentBy
                          ? `Explicit staff resend (${attempt.resentBy})`
                          : 'Initial post-operation simulation',
                    },
                    {
                      key: 'failure',
                      header: 'Reported failure',
                      render: (attempt) =>
                        attempt.status === 'failed'
                          ? attempt.error.message
                          : 'None (simulated only; no email sent)',
                    },
                  ]}
                />
                {canManage && (
                  <form
                    aria-label="Resend simulated notification"
                    onSubmit={(event) => {
                      event.preventDefault();
                      resend();
                    }}
                  >
                    <SelectField
                      label="Resend outcome"
                      hint="Select a deterministic outcome, then explicitly resend the selected record. The committed operation is not repeated."
                      value={resendOutcome}
                      onChange={(event) =>
                        chooseOutcome(event.target.value, 'resend')
                      }
                      error={fieldError('resend', 'scenario')}
                    >
                      <DeliveryOptions />
                    </SelectField>
                    <Button type="submit">Resend simulated notification</Button>
                  </form>
                )}
              </section>
            </>
          )}
        </>
      )}
    </section>
  );
}
