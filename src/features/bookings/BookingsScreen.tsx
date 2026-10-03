import { useState } from 'react';
import {
  selectClassAttendance,
  selectClassBookings,
  selectClasses,
  selectClassLayout,
  selectClassRosterMembers,
  selectClassSeatSummary,
  selectClassWaitlist,
  selectMemberBookings,
  selectMembers,
  selectNotifications,
  useDemoState,
} from '../../demo-state';
import {
  checkMemberEligibility,
  requireCapability,
  requireCurrentWaiver,
} from '../../domain';
import type {
  BookingId,
  ClassId,
  DemoAction,
  DomainError,
  LayoutStation,
  ScheduledClass,
  StationId,
} from '../../domain';
import {
  Alert,
  Button,
  ConfirmationDialog,
  DataTable,
  InputField,
  SelectField,
  UnavailableState,
} from '../../shared';
import { StationLayout } from '../stations';
import styles from './bookings.module.css';

type Selection = {
  readonly revision: number;
  readonly bookingId?: BookingId;
  readonly stationId?: StationId;
  readonly reason: string;
};

type PendingConfirmation = {
  readonly action: DemoAction;
  readonly revision: number;
  readonly title: string;
  readonly description: string;
  readonly label: string;
  readonly successMessage: string;
};

const outcomes = {
  booked: 'Booked',
  attended: 'Attended',
  cancelled: 'Cancelled',
  lateCancel: 'Late cancel',
  noShow: 'No-show',
  staffRemoved: 'Staff removal',
} as const;

const reviewLabels = {
  memberInactive: 'Inactive member: staff review required',
  stationOutOfService: 'Station out of service: staff review required',
  waiverOutdated: 'Current waiver required',
  invitationNotAccepted: 'Accepted invitation required',
} as const;

/** Compose under DemoStateProvider; persona and clock controls belong to the shell. */
export function BookingsScreen() {
  const demo = useDemoState();
  return (
    <section className={styles.screen}>
      <h1>Bookings and waitlists</h1>
      <p>
        Fictional, non-operational demo only. Reservations are local
        simulations, not authoritative bookings. No email is sent; refresh
        resets all data. Offline booking is unsupported.
      </p>
      <BookingsWorkspace
        key={`${JSON.stringify(demo.activeActor)}:${demo.state.scenarioId}`}
      />
    </section>
  );
}

function BookingsWorkspace() {
  const demo = useDemoState();
  const [chosenClassId, setChosenClassId] = useState<ClassId>();
  const classes = selectClasses(demo.state, {
    actor: demo.activeActor,
    now: demo.now,
  });
  const defaultClass =
    classes.find(
      (item) =>
        item.status === 'published' &&
        item.startsAt <= demo.now &&
        item.endsAt >= demo.now,
    ) ??
    classes.find(
      (item) => item.status === 'published' && item.startsAt > demo.now,
    ) ??
    classes[0];
  const selected =
    classes.find((item) => item.classId === chosenClassId) ?? defaultClass;

  if (!demo.capabilities.success) {
    return <UnavailableState message={demo.capabilities.error.message} />;
  }
  if (!demo.capabilities.value.capabilities.includes('viewSchedule')) {
    return (
      <UnavailableState message="Select a fictional member or active staff persona in the demo shell to view bookings." />
    );
  }
  if (!selected) {
    return (
      <UnavailableState message="No classes are available to this persona under the current publication and release policy." />
    );
  }
  return (
    <>
      <SelectField
        label="Class"
        value={selected.classId}
        onChange={(event) => {
          const item = classes.find(
            (item) => item.classId === event.target.value,
          );
          if (item) setChosenClassId(item.classId);
        }}
      >
        {classes.map((item) => (
          <option key={item.classId} value={item.classId}>
            {item.classTypeSnapshot.name} - {item.schedule.date}{' '}
            {item.schedule.time} ({item.status})
          </option>
        ))}
      </SelectField>
      <ClassBookings key={selected.classId} scheduledClass={selected} />
    </>
  );
}

function ClassBookings({
  scheduledClass,
}: {
  readonly scheduledClass: ScheduledClass;
}) {
  const demo = useDemoState();
  const [selection, setSelection] = useState<Selection>();
  const [pending, setPending] = useState<PendingConfirmation>();
  const [feedback, setFeedback] = useState<{
    readonly revision: number;
    readonly message: string;
    readonly error?: DomainError;
  }>();
  const actor = demo.activeActor;
  const classId = scheduledClass.classId;
  const isMember = actor.kind === 'member';
  const rosterPermission = requireCapability(demo.state, actor, 'viewRoster', {
    classId,
  });
  const canViewRoster = actor.kind === 'staff' && rosterPermission.success;
  const members = canViewRoster
    ? selectClassRosterMembers(demo.state, classId, actor)
    : selectMembers(demo.state, actor);
  const memberName = (memberId: string) =>
    members.find((item) => item.memberId === memberId)?.displayName ??
    `${memberId} (name unavailable to this persona)`;
  const bookings = isMember
    ? selectMemberBookings(demo.state, actor.memberId).filter(
        (item) => item.classId === classId,
      )
    : canViewRoster
      ? selectClassBookings(demo.state, classId, { includeInactive: true })
      : [];
  const activeBookings = bookings.filter((item) => item.status === 'booked');
  const source = isMember
    ? activeBookings[0]
    : activeBookings.find((item) => item.bookingId === selection?.bookingId);
  const attendance = selectClassAttendance(demo.state, classId).filter(
    (item) => canViewRoster || (isMember && item.memberId === actor.memberId),
  );
  const queue = selectClassWaitlist(demo.state, classId).filter(
    (item) => canViewRoster || (isMember && item.memberId === actor.memberId),
  );
  const ownQueue = isMember ? queue[0] : undefined;
  const summary = selectClassSeatSummary(demo.state, classId);
  const layout = selectClassLayout(demo.state, classId, actor, demo.now);
  const activeClass = scheduledClass.status === 'published';
  const beforeStart = activeClass && demo.now < scheduledClass.startsAt;
  const throughStart = activeClass && demo.now <= scheduledClass.startsAt;
  const throughEnd = activeClass && demo.now <= scheduledClass.endsAt;
  const staffReseat =
    canViewRoster &&
    requireCapability(demo.state, actor, 'reseatBookings', { classId }).success;
  // The map closes at end equality; staff rules still permit current roster actions.
  const rosterAtEnd =
    staffReseat &&
    Date.parse(demo.now) === Date.parse(scheduledClass.endsAt) &&
    (scheduledClass.status === 'published' ||
      (scheduledClass.status === 'completed' &&
        scheduledClass.completedAt === scheduledClass.endsAt)) &&
    demo.state.layout.availability === 'current' &&
    layout.status === 'unavailable' &&
    layout.error.resource === 'class' &&
    !layout.error.stale;
  const stations: readonly LayoutStation[] =
    layout.status === 'available'
      ? layout.stations
      : rosterAtEnd
        ? demo.state.stations.map((station): LayoutStation => ({
            stationId: station.stationId,
            label: station.label,
            row: station.row,
            column: station.column,
            state: !station.inService
              ? 'outOfService'
              : activeBookings.some(
                    (item) => item.stationId === station.stationId,
                  )
                ? 'bookedNotCheckedIn'
                : 'available',
            stateLabel: !station.inService
              ? 'Out of service'
              : activeBookings.some(
                    (item) => item.stationId === station.stationId,
                  )
                ? 'Occupied (see roster for check-in)'
                : 'Available',
          }))
        : [];
  const freeStations = stations.filter(
    (station) => station.state === 'available',
  );
  const destinations = stations.filter(
    (station) =>
      station.state !== 'outOfService' &&
      station.stationId !== source?.stationId &&
      (!isMember || station.state === 'available'),
  );
  const stationName = (stationId: string) =>
    stations.find((item) => item.stationId === stationId)?.label ??
    demo.state.stations.find((item) => item.stationId === stationId)?.label ??
    `${stationId} (station label unavailable)`;
  const eligible = isMember
    ? checkMemberEligibility(demo.state, actor.memberId, demo.now)
    : undefined;
  const waiver = isMember
    ? requireCurrentWaiver(demo.state, actor.memberId)
    : undefined;
  const memberError =
    eligible && !eligible.success
      ? eligible.error
      : waiver && !waiver.success
        ? waiver.error
        : undefined;
  const canReseat =
    (layout.status === 'available' || rosterAtEnd) &&
    (isMember
      ? beforeStart && !memberError
      : staffReseat &&
        (rosterAtEnd ||
          (throughEnd && layout.status === 'available' && layout.canReseat)));
  const value: Selection = selection ?? {
    revision: demo.revision,
    reason: '',
  };
  const edit = (updates: Partial<Omit<Selection, 'revision'>>) => {
    setSelection({ ...value, ...updates });
    setFeedback(undefined);
  };

  const execute = (
    action: DemoAction,
    revision: number,
    successMessage: string,
  ) => {
    const result = demo.submit(action, { expectedRevision: revision });
    setPending(undefined);
    if (!result.success) {
      setFeedback({
        revision: demo.state.revision,
        message:
          result.error.message +
          (result.error.category === 'DemoConflict'
            ? ' Review current availability and make a new selection.'
            : ''),
        error: result.error,
      });
      if (result.error.category === 'DemoConflict') setSelection(undefined);
      return;
    }
    setSelection(undefined);
    setFeedback({
      revision: result.value.baseRevision + 1,
      message: [
        successMessage,
        ...result.value.warnings.map((warning) => warning.message),
      ].join(' '),
    });
  };
  const failSelection = (field: string, message: string) =>
    setFeedback({
      revision: demo.revision,
      message,
      error: {
        category: 'ValidationError',
        message,
        fields: [{ field, message }],
      },
    });
  const reviewReseat = () => {
    if (!source || !value.stationId) {
      failSelection(
        'selection',
        'Choose a booked member and a destination station.',
      );
      return;
    }
    const other = canViewRoster
      ? activeBookings.find((item) => item.stationId === value.stationId)
      : undefined;
    const swapping = other?.bookingId !== undefined;
    const action: DemoAction =
      swapping && other.bookingId
        ? {
            type: 'swapBookings',
            payload: {
              bookingId: source.bookingId,
              otherBookingId: other.bookingId,
              confirmed: true,
            },
          }
        : {
            type: 'moveBooking',
            payload: {
              bookingId: source.bookingId,
              destinationStationId: value.stationId,
              confirmed: true,
            },
          };
    setFeedback(undefined);
    setPending({
      action,
      revision: value.revision,
      title: swapping
        ? 'Confirm occupied-station swap'
        : 'Confirm station move',
      description: swapping
        ? `Swap ${memberName(source.memberId)} at ${stationName(source.stationId)} with ${memberName(other.memberId)} at ${stationName(value.stationId)}? Neither assignment changes until confirmation. Check-in and attendance history are retained. No reseat email is sent.`
        : `Move ${memberName(source.memberId)} from ${stationName(source.stationId)} to ${stationName(value.stationId)}? Check-in and attendance history are retained. No reseat email is sent.`,
      label: swapping ? 'Confirm swap' : 'Confirm move',
      successMessage: swapping
        ? 'Station swap confirmed in this demo.'
        : 'Station move confirmed in this demo.',
    });
  };
  const reviewRemoval = (memberCancellation: boolean) => {
    if (!source) {
      failSelection('bookingId', 'Choose a booked member.');
      return;
    }
    if (!memberCancellation && !value.reason.trim()) {
      failSelection('reason', 'Explain why the booking is removed.');
      return;
    }
    setFeedback(undefined);
    setPending({
      action: memberCancellation
        ? { type: 'cancelBooking', payload: { bookingId: source.bookingId } }
        : {
            type: 'removeBooking',
            payload: { bookingId: source.bookingId, reason: value.reason },
          },
      revision: value.revision,
      title: memberCancellation
        ? 'Confirm cancellation'
        : 'Confirm staff removal',
      description: memberCancellation
        ? 'Cancel your booking? Late-cancel policy applies unless waived. A qualifying free station promotes the first eligible FIFO waiter strictly before cutoff.'
        : `Remove ${memberName(source.memberId)}? This records staff removal, not a member late cancellation or no-show. A qualifying free station may promote an eligible waiter.`,
      label: memberCancellation ? 'Confirm cancellation' : 'Confirm removal',
      successMessage: memberCancellation
        ? 'Cancellation confirmed in this demo.'
        : 'Staff removal confirmed in this demo.',
    });
  };
  const notifications = selectNotifications(demo.state).filter(
    (record) =>
      record.event.type !== 'invitation' &&
      record.event.classId === classId &&
      (canViewRoster ||
        (isMember &&
          record.recipient.kind === 'member' &&
          record.recipient.memberId === actor.memberId)),
  );
  const shownFeedback =
    feedback &&
    (feedback.error !== undefined || feedback.revision === demo.revision)
      ? feedback
      : undefined;

  return (
    <div className={styles.workspace}>
      <h2>{scheduledClass.classTypeSnapshot.name}</h2>
      <p>
        {scheduledClass.schedule.date} {scheduledClass.schedule.time} in{' '}
        {scheduledClass.schedule.timezone} (illustrative timezone).{' '}
        {scheduledClass.classTypeSnapshot.durationMinutes} minutes. Class
        status: {scheduledClass.status}.
      </p>
      <p>{scheduledClass.classTypeSnapshot.description}</p>
      <p>
        Difficulty: {scheduledClass.classTypeSnapshot.difficulty}.{' '}
        {scheduledClass.classTypeSnapshot.whatToBring}
      </p>
      <p>
        Capacity: {summary.capacity}; free in-service stations:{' '}
        {summary.available}; waiting: {summary.waitlist}. No per-member
        booking-count limit.
      </p>
      <p>
        Illustrative policy: automatic FIFO promotion is strictly before{' '}
        {demo.state.settings.waitlistCutoffMinutes} minutes before start.
        Ineligible waiters are skipped and retained for staff review. No
        promotion to an out-of-service station, on class cancellation, or on
        occupied swaps. Freed stations at or after cutoff remain available for
        ordinary booking. Late-cancel cutoff:{' '}
        {demo.state.settings.lateCancelCutoffMinutes} minutes before start. No
        automatic penalties.
      </p>
      <StationLayout classId={classId} />
      {memberError && <Alert>{memberError.message}</Alert>}
      {layout.status === 'unavailable' && (
        <Alert>
          {layout.error.message}{' '}
          {rosterAtEnd
            ? 'The map is disabled at class end. Authorized roster-only reseating remains available at the scheduled end, including after class-end processing.'
            : 'Station selection and map-based reseating are disabled.'}
        </Alert>
      )}
      {!beforeStart && isMember && (
        <p>
          Booking and free-station moves close at start. Cancellation is
          available through start only.
        </p>
      )}
      {!throughEnd && !rosterAtEnd && canViewRoster && (
        <p>
          This class is history or not published. Reseating and removal are
          unavailable.
        </p>
      )}
      <DataTable
        caption={
          isMember ? 'Your bookings' : 'Class roster and booking history'
        }
        rows={bookings}
        getRowKey={(item) => item.bookingId}
        columns={[
          {
            key: 'member',
            header: 'Member',
            render: (item) => memberName(item.memberId),
          },
          {
            key: 'station',
            header: 'Station',
            render: (item) => stationName(item.stationId),
          },
          {
            key: 'status',
            header: 'Booking status',
            render: (item) =>
              item.status === 'staffRemoved' ? 'Staff removal' : item.status,
          },
          {
            key: 'attendance',
            header: 'Attendance',
            render: (item) => {
              const record = attendance.find(
                (record) => record.attendanceId === item.attendanceRecordId,
              );
              return record
                ? `${outcomes[record.currentOutcome]}; ${record.checkIn.status === 'checkedIn' ? 'Checked in' : 'Not checked in'}`
                : 'Attendance record unavailable';
            },
          },
          {
            key: 'corrections',
            header: 'Corrections',
            render: (item) =>
              attendance
                .find(
                  (record) => record.attendanceId === item.attendanceRecordId,
                )
                ?.corrections.map(
                  (correction) =>
                    `${outcomes[correction.previousOutcome]} to ${outcomes[correction.newOutcome]}: ${correction.reason}`,
                )
                .join('; ') || 'None',
          },
          {
            key: 'review',
            header: 'Staff review',
            render: (item) =>
              item.reviewFlags.map((flag) => reviewLabels[flag]).join('; ') ||
              'None',
          },
        ]}
      />
      {isMember && (
        <section
          className={styles.controls}
          aria-label="Member booking controls"
        >
          {!source && (
            <>
              <SelectField
                label="Free station"
                value={value.stationId ?? ''}
                disabled={
                  !beforeStart ||
                  Boolean(memberError) ||
                  layout.status === 'unavailable'
                }
                onChange={(event) =>
                  edit({
                    stationId: freeStations.find(
                      (item) => item.stationId === event.target.value,
                    )?.stationId,
                  })
                }
              >
                <option value="">Choose a free station</option>
                {freeStations.map((item) => (
                  <option key={item.stationId} value={item.stationId}>
                    {item.label} - {item.stateLabel}
                  </option>
                ))}
              </SelectField>
              <Button
                disabled={
                  !beforeStart ||
                  Boolean(memberError) ||
                  layout.status === 'unavailable' ||
                  freeStations.length === 0
                }
                onClick={() => {
                  if (!value.stationId) {
                    failSelection(
                      'stationId',
                      'Choose a free in-service station.',
                    );
                    return;
                  }
                  execute(
                    {
                      type: 'bookStation',
                      payload: {
                        memberId: actor.memberId,
                        classId,
                        stationId: value.stationId,
                      },
                    },
                    value.revision,
                    'Booking confirmed in this demo.',
                  );
                }}
              >
                Book station
              </Button>
              {!ownQueue && (
                <Button
                  disabled={
                    !beforeStart ||
                    Boolean(memberError) ||
                    summary.capacity === 0 ||
                    summary.available > 0
                  }
                  onClick={() =>
                    execute(
                      {
                        type: 'joinWaitlist',
                        payload: { memberId: actor.memberId, classId },
                      },
                      demo.revision,
                      'Joined the FIFO waitlist in this demo.',
                    )
                  }
                >
                  Join waitlist
                </Button>
              )}
            </>
          )}
          {source && (
            <>
              <SelectField
                label="Destination station"
                value={value.stationId ?? ''}
                disabled={!canReseat}
                onChange={(event) =>
                  edit({
                    stationId: destinations.find(
                      (item) => item.stationId === event.target.value,
                    )?.stationId,
                  })
                }
              >
                <option value="">Choose a free destination</option>
                {destinations.map((item) => (
                  <option key={item.stationId} value={item.stationId}>
                    {item.label} - {item.stateLabel}
                  </option>
                ))}
              </SelectField>
              <Button disabled={!canReseat} onClick={reviewReseat}>
                Review move
              </Button>
              <Button
                variant="danger"
                disabled={
                  !throughStart ||
                  !demo.capabilities.success ||
                  !demo.capabilities.value.capabilities.includes(
                    'cancelOwnBooking',
                  )
                }
                onClick={() => reviewRemoval(true)}
              >
                Cancel booking
              </Button>
            </>
          )}
          {ownQueue && (
            <>
              <p>
                Your FIFO join order: {ownQueue.joinOrder}. Leaving and
                rejoining puts you at the tail.
              </p>
              <Button
                disabled={
                  !throughEnd ||
                  !demo.capabilities.success ||
                  !demo.capabilities.value.capabilities.includes(
                    'manageOwnWaitlist',
                  )
                }
                onClick={() =>
                  execute(
                    {
                      type: 'leaveWaitlist',
                      payload: { entryId: ownQueue.entryId },
                    },
                    demo.revision,
                    'Left the waitlist in this demo. History retained.',
                  )
                }
              >
                Leave waitlist
              </Button>
            </>
          )}
        </section>
      )}
      {canViewRoster && (
        <section
          className={styles.controls}
          aria-label="Staff booking controls"
        >
          <p>
            Choose any booked member and destination. A free destination moves
            after confirmation; an occupied destination requires explicit swap
            confirmation. No reseat email is sent.
          </p>
          <SelectField
            label="Booked member"
            value={source?.bookingId ?? ''}
            onChange={(event) => {
              const booking = activeBookings.find(
                (item) => item.bookingId === event.target.value,
              );
              setSelection({
                revision: demo.revision,
                bookingId: booking?.bookingId,
                reason: '',
              });
              setFeedback(undefined);
            }}
          >
            <option value="">Choose a booked member</option>
            {activeBookings.map((item) => (
              <option key={item.bookingId} value={item.bookingId}>
                {memberName(item.memberId)} - {stationName(item.stationId)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Destination station"
            value={value.stationId ?? ''}
            disabled={!canReseat}
            onChange={(event) =>
              edit({
                stationId: destinations.find(
                  (item) => item.stationId === event.target.value,
                )?.stationId,
              })
            }
          >
            <option value="">Choose a destination</option>
            {destinations.map((item) => (
              <option key={item.stationId} value={item.stationId}>
                {item.label} - {item.stateLabel}
              </option>
            ))}
          </SelectField>
          <Button disabled={!canReseat} onClick={reviewReseat}>
            Review reseating
          </Button>
          <InputField
            label="Removal reason"
            value={value.reason}
            error={
              shownFeedback?.error?.category === 'ValidationError'
                ? shownFeedback.error.fields.find(
                    (field) => field.field === 'reason',
                  )?.message
                : undefined
            }
            onChange={(event) => edit({ reason: event.target.value })}
          />
          <Button
            variant="danger"
            disabled={!staffReseat || !throughEnd}
            onClick={() => reviewRemoval(false)}
          >
            Remove booking
          </Button>
        </section>
      )}
      <DataTable
        caption={isMember ? 'Your waitlist' : 'FIFO waitlist'}
        rows={queue}
        getRowKey={(item) => item.entryId}
        columns={[
          {
            key: 'order',
            header: 'Join order',
            render: (item) => item.joinOrder,
          },
          {
            key: 'member',
            header: 'Member',
            render: (item) => memberName(item.memberId),
          },
          { key: 'status', header: 'Status', render: (item) => item.status },
          {
            key: 'flags',
            header: 'Staff review',
            render: (item) =>
              item.reviewFlags.map((flag) => reviewLabels[flag]).join('; ') ||
              'None',
          },
        ]}
      />
      <section aria-label="Simulated email outcomes">
        <h3>Simulated email outcomes</h3>
        <p>
          Email is never transmitted. Reported failure does not reverse a
          confirmed booking or promotion. Staff resend is available on the
          notifications screen.
        </p>
        <SelectField
          label="Simulated email result"
          hint="Applies to subsequent booking or promotion emails only. Reseating itself never sends email."
          value={demo.state.simulation.delivery}
          onChange={(event) => {
            const delivery = event.target.value;
            if (delivery === 'success' || delivery === 'failure') {
              execute(
                { type: 'setSimulation', payload: { delivery } },
                demo.revision,
                'Simulated email outcome selected. No email was sent.',
              );
            }
          }}
        >
          <option value="success">Reported success (simulated)</option>
          <option value="failure">Reported failure (simulated)</option>
        </SelectField>
        <DataTable
          caption="Email simulation records"
          rows={notifications}
          getRowKey={(record) => record.notificationId}
          columns={[
            {
              key: 'event',
              header: 'Event',
              render: (record) =>
                record.event.type === 'bookingConfirmed'
                  ? 'Booking confirmation'
                  : record.event.type === 'waitlistPromoted'
                    ? 'Waitlist promotion'
                    : record.event.type === 'classCancelled'
                      ? 'Class cancellation'
                      : 'Class change',
            },
            {
              key: 'status',
              header: 'Simulated delivery',
              render: (record) =>
                record.status === 'failed'
                  ? 'Failed - operation retained'
                  : 'Sent (simulated only)',
            },
          ]}
        />
      </section>
      {shownFeedback && (
        <div
          className={shownFeedback.error ? styles.error : styles.success}
          role={shownFeedback.error ? 'alert' : 'status'}
          aria-label={shownFeedback.error ? 'Booking error' : 'Booking result'}
        >
          {shownFeedback.message}
        </div>
      )}
      <ConfirmationDialog
        open={pending !== undefined}
        title={pending?.title ?? ''}
        description={pending?.description ?? ''}
        confirmLabel={pending?.label ?? 'Confirm'}
        onCancel={() => setPending(undefined)}
        onConfirm={() => {
          if (pending)
            execute(pending.action, pending.revision, pending.successMessage);
        }}
      />
    </div>
  );
}
