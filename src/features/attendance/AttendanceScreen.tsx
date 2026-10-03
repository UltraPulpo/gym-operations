import { useState } from 'react';
import {
  selectClassAttendance,
  selectClassBookings,
  selectClasses,
  selectClassLayout,
  selectMemberBookings,
  selectMembers,
  selectPrintableRoster,
  useDemoState,
} from '../../demo-state';
import type {
  AttendanceRecord,
  AttendanceOutcome,
  Booking,
  DemoAction,
} from '../../domain';
import { requireCapability } from '../../domain';
import {
  Alert,
  Button,
  DataTable,
  InputField,
  SelectField,
  TextareaField,
  UnavailableState,
} from '../../shared';
import styles from './attendance.module.css';

const outcomes: Readonly<Record<AttendanceOutcome, string>> = {
  booked: 'Booked',
  attended: 'Attended',
  cancelled: 'Cancelled',
  lateCancel: 'Late cancel',
  noShow: 'No-show',
  staffRemoved: 'Staff removal',
};
const outcomeOptions = Object.entries(outcomes);

function outcomeValue(value: string): AttendanceOutcome | undefined {
  return value === 'booked' ||
    value === 'attended' ||
    value === 'cancelled' ||
    value === 'lateCancel' ||
    value === 'noShow' ||
    value === 'staffRemoved'
    ? value
    : undefined;
}

interface RosterRow {
  readonly key: string;
  readonly memberName: string;
  readonly stationLabel: string;
  readonly booking?: Booking;
  readonly attendance?: AttendanceRecord;
}

export function AttendanceScreen() {
  const { activeActor, state } = useDemoState();
  const actorId =
    activeActor.kind === 'staff'
      ? activeActor.staffId
      : activeActor.kind === 'member'
        ? activeActor.memberId
        : activeActor.invitationId;
  return (
    <AttendanceWorkspace
      key={`${activeActor.kind}:${actorId}:${state.scenarioId}`}
    />
  );
}

function AttendanceWorkspace() {
  const demo = useDemoState();
  const { state, activeActor, capabilities, now } = demo;
  const isMember = activeActor.kind === 'member';
  const canStaff =
    activeActor.kind === 'staff' &&
    capabilities.success &&
    capabilities.value.capabilities.includes('viewRoster') &&
    capabilities.value.capabilities.includes('manageAttendance');
  const visibleClasses = selectClasses(state, { actor: activeActor, now });
  const ownBookings = isMember
    ? selectMemberBookings(state, activeActor.memberId)
    : [];
  const classes = isMember
    ? visibleClasses.filter((item) =>
        ownBookings.some((booking) => booking.classId === item.classId),
      )
    : visibleClasses;
  const initialClassId =
    classes.find((item) => item.status === 'published' && item.endsAt > now)
      ?.classId ??
    classes[0]?.classId ??
    '';
  const [classId, setClassId] = useState<string>(initialClassId);
  const selectedClass = classes.find((item) => item.classId === classId);
  const members = selectMembers(state, activeActor);
  const attendance = selectedClass
    ? selectClassAttendance(state, selectedClass.classId).filter(
        (item) => !isMember || item.memberId === activeActor.memberId,
      )
    : [];
  const bookings = selectedClass
    ? isMember
      ? ownBookings.filter((item) => item.classId === selectedClass.classId)
      : selectClassBookings(state, selectedClass.classId, {
          includeInactive: true,
        })
    : [];
  const rosterPermission =
    canStaff && selectedClass
      ? requireCapability(state, activeActor, 'viewRoster', {
          classId: selectedClass.classId,
        })
      : undefined;
  const rosterMemberIds = new Set([
    ...bookings.map((item) => item.memberId),
    ...attendance.map((item) => item.memberId),
  ]);
  const rosterMembers = rosterPermission?.success
    ? state.members
        .filter((item) => rosterMemberIds.has(item.memberId))
        .map((item) => ({
          memberId: item.memberId,
          displayName: item.displayName,
        }))
    : members;
  const memberName = (memberId: AttendanceRecord['memberId']) =>
    rosterMembers.find((item) => item.memberId === memberId)?.displayName ??
    'Member unavailable';
  const stationName = (booking: Booking | undefined) => {
    if (!booking) return 'No assigned station';
    const station = state.stations.find(
      (item) => item.stationId === booking.stationId,
    );
    if (station) return station.label;
    const retired = state.retiredStations.find(
      (item) => item.stationId === booking.stationId,
    );
    return retired ? `${retired.label} (removed)` : 'Station unavailable';
  };
  const rows: RosterRow[] = [
    ...bookings.map((booking) => ({
      key: booking.bookingId,
      memberName: memberName(booking.memberId),
      stationLabel: stationName(booking),
      booking,
      attendance: attendance.find(
        (item) =>
          item.attendanceId === booking.attendanceRecordId ||
          item.bookingId === booking.bookingId,
      ),
    })),
    ...attendance
      .filter(
        (item) =>
          !bookings.some(
            (booking) =>
              booking.attendanceRecordId === item.attendanceId ||
              booking.bookingId === item.bookingId,
          ),
      )
      .map((item) => ({
        key: item.attendanceId,
        memberName: memberName(item.memberId),
        stationLabel: 'No assigned station',
        attendance: item,
      })),
  ];
  const ended =
    selectedClass !== undefined &&
    (selectedClass.status === 'completed' || selectedClass.endsAt <= now);
  const layout = selectedClass
    ? selectClassLayout(state, selectedClass.classId, activeActor, now)
    : undefined;
  const layoutFailure =
    layout?.status === 'unavailable' &&
    !(ended && layout.error.resource === 'class')
      ? layout.error
      : undefined;
  const printable =
    canStaff && selectedClass
      ? selectPrintableRoster(state, selectedClass.classId, activeActor)
      : undefined;
  const canExport =
    printable?.success === true &&
    layoutFailure === undefined &&
    state.layout.availability === 'current' &&
    bookings
      .filter((booking) => booking.status === 'booked')
      .every(
        (booking) =>
          rosterMembers.some(
            (member) => member.memberId === booking.memberId,
          ) &&
          state.stations.some(
            (station) => station.stationId === booking.stationId,
          ),
      );

  const [failure, setFailure] = useState<string>();
  const [message, setMessage] = useState('');
  const [recordId, setRecordId] = useState('');
  const selectedRecord =
    attendance.find((item) => item.attendanceId === recordId) ??
    (recordId === '' ? attendance[0] : undefined);
  const [outcome, setOutcome] = useState<AttendanceOutcome>('attended');
  const [reason, setReason] = useState('');
  const [correctionRevision, setCorrectionRevision] = useState<number>();
  const [manualClassId, setManualClassId] = useState(classId);
  const [manualMemberId, setManualMemberId] = useState('');
  const [manualIdentifier, setManualIdentifier] = useState('');
  const manualClass = classes.find((item) => item.classId === manualClassId);
  const manualMember =
    members.find((item) => item.memberId === manualMemberId) ??
    (manualMemberId === '' ? members[0] : undefined);
  const [manualOutcome, setManualOutcome] =
    useState<AttendanceOutcome>('attended');
  const [manualReason, setManualReason] = useState('');
  const [manualRevision, setManualRevision] = useState<number>();
  const [observedRevision, setObservedRevision] = useState(demo.revision);

  if (observedRevision !== demo.revision) {
    setObservedRevision(demo.revision);
    if (!demo.hasUnsavedEdits) {
      setClassId(initialClassId);
      setRecordId('');
      setOutcome('attended');
      setReason('');
      setCorrectionRevision(undefined);
      setManualClassId(initialClassId);
      setManualMemberId('');
      setManualIdentifier('');
      setManualOutcome('attended');
      setManualReason('');
      setManualRevision(undefined);
      setFailure(undefined);
      setMessage('');
    }
  }

  function clearFeedback() {
    setFailure(undefined);
    setMessage('');
  }

  function submit(
    action: DemoAction,
    successMessage: string,
    revision = demo.revision,
  ) {
    clearFeedback();
    const result = demo.submit(action, { expectedRevision: revision });
    if (!result.success) {
      setFailure(result.error.message);
      return false;
    }
    setMessage(successMessage);
    return true;
  }

  function downloadRoster() {
    clearFeedback();
    if (!printable?.success || !canExport) {
      setFailure('A current, authorized roster is required before download.');
      return;
    }
    if (
      typeof URL.createObjectURL !== 'function' ||
      typeof URL.revokeObjectURL !== 'function'
    ) {
      setFailure('Roster download is unavailable in this browser.');
      return;
    }
    const quote = (value: string) =>
      `"${(/^[\s]*[=+\-@]/.test(value) ? "'" : '') + value.replaceAll('"', '""')}"`;
    const csv = [
      'Member,Station',
      ...printable.value.entries.map(
        (entry) =>
          `${quote(entry.memberDisplayName)},${quote(entry.stationLabel)}`,
      ),
    ].join('\r\n');
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'demo-roster.csv';
    document.body.append(link);
    link.click();
    link.remove();
    // Keep the URL alive until the browser has started consuming the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className={styles.screen} aria-labelledby="attendance-title">
      <h1 id="attendance-title">Attendance and outage roster</h1>
      <p className={styles.notice}>
        Manual reconciliation changes attendance only, never bookings. Offline
        booking is unsupported.
      </p>
      {!capabilities.success ? (
        <Alert>{capabilities.error.message}</Alert>
      ) : !canStaff && !isMember ? (
        <UnavailableState message="Select a member or authorized staff persona to view attendance." />
      ) : (
        <>
          {failure && <Alert title="Demo action rejected">{failure}</Alert>}
          {message && <Alert tone="success">{message}</Alert>}
          <SelectField
            label="Attendance class"
            value={selectedClass?.classId ?? ''}
            disabled={classes.length === 0}
            onChange={(event) => {
              setClassId(event.target.value);
              setRecordId('');
              setReason('');
              setCorrectionRevision(demo.revision);
              clearFeedback();
            }}
          >
            {!selectedClass && <option value="">Class unavailable</option>}
            {classes.map((item) => (
              <option key={item.classId} value={item.classId}>
                {item.classTypeSnapshot.name} - {item.schedule.date}{' '}
                {item.schedule.time} ({item.schedule.timezone}, {item.status})
              </option>
            ))}
          </SelectField>
          {!selectedClass ? (
            <UnavailableState message="The selected attendance class is unavailable or outside this persona's scope. Select a currently visible class." />
          ) : (
            <>
              <p>
                Frozen demo clock: <time dateTime={now}>{now}</time> (UTC).
                Schedule timezone: {selectedClass.schedule.timezone}{' '}
                (illustrative).
              </p>
              <p>
                Illustrative member self-check-in window:{' '}
                {state.settings.checkInLeadMinutes} minutes before through{' '}
                {state.settings.checkInGraceMinutes} minutes after class start,
                strictly before class end. Active membership, own booking and
                current waiver are required; no location verification.
              </p>
              {canStaff && (
                <p>
                  Staff may check in or reverse at any time. After class end,
                  actions correct outcomes only and do not create or reopen a
                  check-in event. Use the shared demo clock controls to
                  demonstrate exact-end no-shows. History is retained; no
                  automatic penalties.
                </p>
              )}
              {layoutFailure && (
                <Alert
                  title={
                    layoutFailure.stale
                      ? 'Stale class state'
                      : 'Class state unavailable'
                  }
                >
                  {layoutFailure.message} Map-based reseating is disabled.
                  Manual entries below are local simulated reconciliation, not
                  offline service or booking.
                </Alert>
              )}
              {canStaff && (layoutFailure || ended) && (
                <Button disabled>Map-based reseating unavailable</Button>
              )}
              <DataTable
                caption="Class attendance roster"
                rows={rows}
                getRowKey={(row) => row.key}
                emptyMessage="No booking or manual attendance records for this class."
                columns={[
                  {
                    key: 'member',
                    header: 'Member',
                    render: (row) => row.memberName,
                  },
                  {
                    key: 'station',
                    header: 'Assigned station',
                    render: (row) => row.stationLabel,
                  },
                  {
                    key: 'checkIn',
                    header: 'Check-in',
                    render: (row) =>
                      row.attendance?.checkIn.status === 'checkedIn'
                        ? `Checked in at ${row.attendance.checkIn.checkedInAt} (UTC)`
                        : row.attendance
                          ? 'Not checked in'
                          : 'Attendance unavailable',
                  },
                  {
                    key: 'outcome',
                    header: 'Attendance outcome',
                    render: (row) =>
                      row.attendance
                        ? outcomes[row.attendance.currentOutcome]
                        : 'Outcome unavailable',
                  },
                  {
                    key: 'source',
                    header: 'Source',
                    render: (row) =>
                      row.attendance?.source.kind === 'manualOutage'
                        ? 'Manual outage'
                        : row.attendance?.source.kind === 'classEnd'
                          ? 'Class-end transition'
                          : 'Demo attendance',
                  },
                  ...(canStaff
                    ? [
                        {
                          key: 'history',
                          header: 'Correction history',
                          render: (row: RosterRow) =>
                            row.attendance?.corrections.length ? (
                              <ol>
                                {row.attendance.corrections.map(
                                  (correction) => (
                                    <li key={correction.correctionId}>
                                      {outcomes[correction.previousOutcome]} to{' '}
                                      {outcomes[correction.newOutcome]}
                                      {' - '}
                                      {correction.reason} ({correction.staffId},{' '}
                                      {correction.recordedAt} UTC)
                                    </li>
                                  ),
                                )}
                              </ol>
                            ) : (
                              'No corrections'
                            ),
                        },
                      ]
                    : []),
                  {
                    key: 'actions',
                    header: 'Check-in action',
                    render: (row) => {
                      if (!row.booking || row.booking.status !== 'booked')
                        return 'No active booking';
                      const action: DemoAction = {
                        type: 'checkIn',
                        payload: { bookingId: row.booking.bookingId },
                      };
                      const allowed = demo.validate(action);
                      return (
                        <div>
                          <Button
                            disabled={!allowed.success}
                            onClick={() =>
                              submit(
                                action,
                                ended
                                  ? 'Simulated attendance corrected; check-in event unchanged.'
                                  : 'Simulated check-in recorded.',
                              )
                            }
                          >
                            {ended && canStaff
                              ? 'Correct to attended for'
                              : 'Check in'}{' '}
                            {row.memberName}
                          </Button>
                          {!allowed.success && <p>{allowed.error.message}</p>}
                        </div>
                      );
                    },
                  },
                ]}
              />
              {canStaff && (
                <>
                  <section
                    className={styles.panel}
                    aria-labelledby="correction-title"
                  >
                    <h2 id="correction-title">Staff attendance correction</h2>
                    <form
                      noValidate
                      aria-label="Correct attendance"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!selectedRecord) {
                          setFailure(
                            'Select a currently available attendance record.',
                          );
                          return;
                        }
                        if (
                          submit(
                            {
                              type: 'correctAttendance',
                              payload: {
                                attendanceId: selectedRecord.attendanceId,
                                outcome,
                                reason,
                              },
                            },
                            'Simulated attendance correction recorded; history retained.',
                            correctionRevision,
                          )
                        ) {
                          setReason('');
                          setCorrectionRevision(undefined);
                        }
                      }}
                    >
                      <SelectField
                        label="Attendance record"
                        value={selectedRecord?.attendanceId ?? ''}
                        disabled={!attendance.length}
                        onChange={(event) => {
                          setRecordId(event.target.value);
                          setCorrectionRevision(demo.revision);
                          clearFeedback();
                        }}
                      >
                        {!selectedRecord && (
                          <option value="">Attendance unavailable</option>
                        )}
                        {attendance.map((item) => (
                          <option
                            key={item.attendanceId}
                            value={item.attendanceId}
                          >
                            {memberName(item.memberId)}
                          </option>
                        ))}
                      </SelectField>
                      <SelectField
                        label="Corrected outcome"
                        value={outcome}
                        onChange={(event) => {
                          const value = outcomeValue(event.target.value);
                          if (value) setOutcome(value);
                          setCorrectionRevision(demo.revision);
                        }}
                      >
                        {outcomeOptions.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </SelectField>
                      <TextareaField
                        label="Correction reason"
                        required
                        value={reason}
                        onChange={(event) => {
                          setReason(event.target.value);
                          setCorrectionRevision(demo.revision);
                        }}
                      />
                      <div className={styles.actions}>
                        <Button type="submit" disabled={!selectedRecord}>
                          Save attendance correction
                        </Button>
                        <Button
                          disabled={
                            selectedRecord?.checkIn.status !== 'checkedIn' ||
                            selectedClass.status === 'cancelled'
                          }
                          onClick={() => {
                            if (!selectedRecord) {
                              setFailure(
                                'Select a currently available attendance record.',
                              );
                              return;
                            }
                            if (
                              submit(
                                {
                                  type: 'reverseCheckIn',
                                  payload: {
                                    attendanceId: selectedRecord.attendanceId,
                                    reason,
                                  },
                                },
                                ended
                                  ? 'Simulated no-show correction recorded; check-in event unchanged.'
                                  : 'Simulated check-in reversed; history retained.',
                                correctionRevision,
                              )
                            ) {
                              setReason('');
                              setCorrectionRevision(undefined);
                            }
                          }}
                        >
                          {ended ? 'Correct to no-show' : 'Reverse check-in'}
                        </Button>
                      </div>
                    </form>
                  </section>
                  <section
                    className={styles.panel}
                    aria-labelledby="manual-title"
                  >
                    <h2 id="manual-title">Manual outage reconciliation</h2>
                    <p>
                      No booking is required. This records a simulated
                      attendance outcome, not a booking, station assignment or
                      new check-in event.
                    </p>
                    <form
                      noValidate
                      aria-label="Record manual outage attendance"
                      onSubmit={(event) => {
                        event.preventDefault();
                        clearFeedback();
                        const enteredId = manualIdentifier.trim();
                        const memberId = enteredId
                          ? state.members.find(
                              (member) => member.memberId === enteredId,
                            )?.memberId
                          : manualMember?.memberId;
                        if (!memberId) {
                          setFailure('The fictional member is unavailable.');
                          return;
                        }
                        if (!manualClass) {
                          setFailure(
                            'Select a currently available class for manual reconciliation.',
                          );
                          return;
                        }
                        if (
                          submit(
                            {
                              type: 'recordManualAttendance',
                              payload: {
                                classId: manualClass.classId,
                                memberId,
                                outcome: manualOutcome,
                                reason: manualReason,
                              },
                            },
                            'Simulated manual attendance recorded; bookings unchanged.',
                            manualRevision,
                          )
                        ) {
                          setManualReason('');
                          setManualIdentifier('');
                          setManualRevision(undefined);
                        }
                      }}
                    >
                      <SelectField
                        label="Manual class"
                        value={manualClass?.classId ?? ''}
                        onChange={(event) => {
                          setManualClassId(event.target.value);
                          setManualRevision(demo.revision);
                        }}
                      >
                        {!manualClass && (
                          <option value="">Class unavailable</option>
                        )}
                        {classes.map((item) => (
                          <option key={item.classId} value={item.classId}>
                            {item.classTypeSnapshot.name} - {item.schedule.date}{' '}
                            {item.schedule.time} ({item.status})
                          </option>
                        ))}
                      </SelectField>
                      <SelectField
                        label="Manual member"
                        value={manualMember?.memberId ?? ''}
                        disabled={!members.length}
                        onChange={(event) => {
                          setManualMemberId(event.target.value);
                          setManualRevision(demo.revision);
                        }}
                      >
                        {!manualMember && (
                          <option value="">Member unavailable</option>
                        )}
                        {members.map((item) => (
                          <option key={item.memberId} value={item.memberId}>
                            {item.displayName}
                          </option>
                        ))}
                      </SelectField>
                      <InputField
                        label="Manual member identifier"
                        value={manualIdentifier}
                        hint="Optional fictional member ID from a paper roster; overrides the list. This allows reconciliation without a booking or exposing an out-of-scope member directory."
                        onChange={(event) => {
                          setManualIdentifier(event.target.value);
                          setManualRevision(demo.revision);
                        }}
                      />
                      <SelectField
                        label="Manual outcome"
                        value={manualOutcome}
                        onChange={(event) => {
                          const value = outcomeValue(event.target.value);
                          if (value) setManualOutcome(value);
                          setManualRevision(demo.revision);
                        }}
                      >
                        {outcomeOptions.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </SelectField>
                      <TextareaField
                        label="Manual entry reason"
                        required
                        value={manualReason}
                        onChange={(event) => {
                          setManualReason(event.target.value);
                          setManualRevision(demo.revision);
                        }}
                      />
                      <Button
                        type="submit"
                        disabled={
                          !manualClass ||
                          (!manualMember && !manualIdentifier.trim())
                        }
                      >
                        Record manual attendance
                      </Button>
                    </form>
                  </section>
                  {printable && !printable.success && (
                    <Alert>{printable.error.message}</Alert>
                  )}
                  <div className={styles.actions}>
                    <Button disabled={!canExport} onClick={downloadRoster}>
                      Download roster
                    </Button>
                    <Button
                      disabled={!canExport}
                      onClick={() => {
                        clearFeedback();
                        window.print();
                      }}
                    >
                      Print roster
                    </Button>
                  </div>
                  {canExport && printable?.success && (
                    <section
                      className={styles.printRoster}
                      aria-label="Printable member and station roster"
                    >
                      <DataTable
                        caption="Printable roster"
                        rows={printable.value.entries}
                        getRowKey={(entry) => entry.stationLabel}
                        columns={[
                          {
                            key: 'member',
                            header: 'Member',
                            render: (entry) => entry.memberDisplayName,
                          },
                          {
                            key: 'station',
                            header: 'Station',
                            render: (entry) => entry.stationLabel,
                          },
                        ]}
                      />
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
