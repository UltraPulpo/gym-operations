import { useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  selectClasses,
  selectClassLayout,
  selectClassSeatSummary,
  useDemoState,
} from '../../demo-state';
import type {
  ClassId,
  DemoAction,
  DemoState,
  DomainResult,
  AcceptedAction,
  LayoutView,
  Station,
  StationId,
  StationState,
} from '../../domain';
import {
  Alert,
  Button,
  CheckboxField,
  InputField,
  SelectField,
  StatusBadge,
  UnavailableState,
} from '../../shared';
import styles from './stations.module.css';

export interface StationLayoutProps {
  /** A fixed overlay; omission offers scoped classes or a service-only base schematic to schedule viewers. */
  readonly classId?: ClassId;
  /** Opt-in station management, still restricted to active Admins. */
  readonly editable?: boolean;
}

type Submit = (
  action: DemoAction,
  revision: number,
) => DomainResult<AcceptedAction>;
type AvailableLayout = Extract<LayoutView, { status: 'available' }>;
type BaseLayout = {
  readonly status: 'available';
  readonly audience: 'base';
  readonly classId?: never;
  readonly orientationLabel?: string;
  readonly canReseat: false;
  readonly stations: readonly (Pick<
    Station,
    'stationId' | 'label' | 'row' | 'column'
  > & {
    readonly state: 'inService' | 'outOfService';
    readonly stateLabel: string;
  })[];
};

const icons: Record<StationState | 'inService', string> = {
  inService: '+',
  available: '+',
  bookedNotCheckedIn: '...',
  bookedCheckedIn: '[x]',
  outOfService: '!',
};

function coordinate(value: string): number {
  return value.trim() ? Number(value) : Number.NaN;
}

function gridAxis(positions: readonly number[]): readonly number[] {
  const values = new Set([0, 1]);
  for (const position of positions) {
    values.add(position);
    if (position > 0) values.add(position - 1);
    if (Number.isSafeInteger(position + 1)) values.add(position + 1);
  }
  return [...values].sort((left, right) => left - right);
}

function nextStationId(state: DemoState): StationId {
  let suffix = 1;
  while (
    state.stations.some(
      (station) => station.stationId === `station:demo-created-${suffix}`,
    )
  ) {
    suffix += 1;
  }
  return `station:demo-created-${suffix}`;
}

function selectBaseLayout(
  state: DemoState,
): BaseLayout | Extract<LayoutView, { status: 'unavailable' }> {
  const inconsistent =
    state.stations.some(
      ({ row, column }) =>
        !Number.isSafeInteger(row) ||
        row < 0 ||
        !Number.isSafeInteger(column) ||
        column < 0,
    ) ||
    new Set(state.stations.map((station) => station.stationId)).size !==
      state.stations.length ||
    new Set(state.stations.map((station) => `${station.row}:${station.column}`))
      .size !== state.stations.length;
  if (state.layout.availability !== 'current' || inconsistent) {
    return {
      status: 'unavailable',
      canReseat: false,
      error: {
        category: 'DemoUnavailableState',
        resource: 'layout',
        stale: state.layout.availability === 'stale' || inconsistent,
        message:
          state.layout.availability === 'stale'
            ? 'Base layout data is stale. Refresh the layout.'
            : state.layout.availability === 'unavailable'
              ? 'Base layout data is unavailable. Refresh the layout.'
              : 'Station positions are inconsistent. Refresh the layout.',
      },
    };
  }
  return {
    status: 'available',
    audience: 'base',
    orientationLabel: state.layout.orientationLabel,
    canReseat: false,
    stations: state.stations.map((station) => ({
      stationId: station.stationId,
      label: station.label,
      row: station.row,
      column: station.column,
      state: station.inService ? 'inService' : 'outOfService',
      stateLabel: station.inService ? 'In service' : 'Out of service',
    })),
  };
}

export function StationsScreen() {
  return (
    <section className={styles.screen}>
      <h1>Stations and layout</h1>
      <p>
        Fictional, non-operational schematic. PM5 associations are data only; no
        device connection or automatic room detection. Layout placement never
        reassigns bookings.
      </p>
      <StationLayout editable />
    </section>
  );
}

export function StationLayout({
  classId,
  editable = false,
}: StationLayoutProps) {
  const demo = useDemoState();
  const [chosenClassId, setChosenClassId] = useState<ClassId>();
  const [chosenStationId, setChosenStationId] = useState<StationId>();
  const [feedback, setFeedback] = useState<{
    message: string;
    failed: boolean;
  }>();
  const unavailableId = useId();
  if (!demo.capabilities.success) {
    return <UnavailableState message={demo.capabilities.error.message} />;
  }
  if (!demo.capabilities.value.capabilities.includes('viewSchedule')) {
    return <UnavailableState message="This actor cannot view class layouts." />;
  }
  const classes = selectClasses(demo.state, {
    actor: demo.activeActor,
    now: demo.now,
  }).filter(
    (item) =>
      item.status !== 'cancelled' &&
      item.status !== 'completed' &&
      item.endsAt > demo.now,
  );
  const defaultClass =
    classes.find((item) => item.startsAt <= demo.now) ?? classes[0];
  const selectedClass =
    classId !== undefined
      ? classes.find((item) => item.classId === classId)
      : (classes.find((item) => item.classId === chosenClassId) ??
        defaultClass);
  const layout: LayoutView | BaseLayout = selectedClass
    ? selectClassLayout(
        demo.state,
        selectedClass.classId,
        demo.activeActor,
        demo.now,
      )
    : classId === undefined
      ? selectBaseLayout(demo.state)
      : {
          status: 'unavailable',
          canReseat: false,
          error: {
            category: 'DemoUnavailableState',
            resource: 'class',
            stale: false,
            message:
              'This class overlay is not available to this persona, or is no longer current or future.',
          },
        };
  const canManage =
    editable &&
    demo.capabilities.success &&
    demo.capabilities.value.capabilities.includes('manageStations');
  // Only Admin station metadata is projected from the validation snapshot.
  const stations: readonly Station[] = canManage
    ? demo.state.stations.map((station) => ({ ...station }))
    : [];
  const station =
    stations.find((item) => item.stationId === chosenStationId) ?? stations[0];
  const mapAvailable = layout.status === 'available';
  const capacity = selectedClass
    ? selectClassSeatSummary(demo.state, selectedClass.classId).capacity
    : undefined;
  const submit: Submit = (action, revision) => {
    const result = demo.submit(action, { expectedRevision: revision });
    setFeedback({
      failed: !result.success,
      message: result.success
        ? 'Station change saved in this demo only.'
        : result.error.message,
    });
    return result;
  };

  return (
    <div className={styles.layout}>
      {classId === undefined && classes.length > 0 && (
        <SelectField
          label="Class overlay"
          value={selectedClass?.classId ?? ''}
          onChange={(event) => {
            const selected = classes.find(
              (item) => item.classId === event.target.value,
            );
            if (selected) setChosenClassId(selected.classId);
            setFeedback(undefined);
          }}
        >
          {classes.map((item) => (
            <option key={item.classId} value={item.classId}>
              {item.classTypeSnapshot.name} - {item.schedule.date}{' '}
              {item.schedule.time} ({item.status})
            </option>
          ))}
        </SelectField>
      )}
      {selectedClass && (
        <p>
          {selectedClass.startsAt <= demo.now ? 'Current' : 'Upcoming'} class.
          Times shown in {selectedClass.schedule.timezone}, illustrative demo
          timezone.
        </p>
      )}
      {layout.status === 'available' && layout.audience === 'base' && (
        <p>
          Base station arrangement. Service states only; no class overlay or
          booking availability is shown.
        </p>
      )}
      {capacity !== undefined && (
        <p>Capacity: {capacity} in-service stations</p>
      )}
      {selectedClass?.reviewFlags.includes('zeroCapacity') && (
        <StatusBadge tone="warning">
          Zero capacity: staff review required
        </StatusBadge>
      )}
      {layout.status === 'unavailable' ? (
        <div id={unavailableId}>
          <UnavailableState
            title="Station map disabled"
            message={`${layout.error.message} Map-based operations are disabled.`}
          />
        </div>
      ) : (
        <>
          {layout.orientationLabel && <p>{layout.orientationLabel}</p>}
          <LayoutGrid
            key={`${layout.classId ?? 'base'}:${JSON.stringify(demo.activeActor)}:${canManage}`}
            view={layout}
            editable={canManage}
            submit={submit}
          />
        </>
      )}
      {feedback && (
        <Alert tone={feedback.failed ? 'danger' : 'success'}>
          {feedback.message}
        </Alert>
      )}
      {canManage && (
        <section
          className={styles.management}
          aria-label="Admin station management"
        >
          <h2>Admin station management</h2>
          <p>
            Coordinates start at zero. An occupied destination swaps visual
            positions only. Service changes flag bookings; they never cancel or
            move them.
          </p>
          {stations.length > 0 && (
            <SelectField
              label="Station to edit"
              value={station?.stationId}
              onChange={(event) => {
                const selected = stations.find(
                  (item) => item.stationId === event.target.value,
                );
                if (selected) setChosenStationId(selected.stationId);
                setFeedback(undefined);
              }}
            >
              {stations.map((item) => (
                <option key={item.stationId} value={item.stationId}>
                  {item.label}
                </option>
              ))}
            </SelectField>
          )}
          {station && (
            <>
              <StationDetailsForm
                key={`details:${station.stationId}`}
                station={station}
                revision={demo.revision}
                submit={submit}
              />
              <PlacementForm
                key={`position:${station.stationId}`}
                station={station}
                revision={demo.revision}
                submit={submit}
                disabled={!mapAvailable}
                reasonId={mapAvailable ? undefined : unavailableId}
              />
            </>
          )}
          <NewStationForm
            stationId={nextStationId(demo.state)}
            nextRow={Math.max(-1, ...stations.map((item) => item.row)) + 1}
            revision={demo.revision}
            submit={submit}
            disabled={!mapAvailable}
            reasonId={mapAvailable ? undefined : unavailableId}
          />
          <OrientationForm
            label={demo.state.layout.orientationLabel ?? ''}
            revision={demo.revision}
            submit={submit}
            disabled={!mapAvailable}
            reasonId={mapAvailable ? undefined : unavailableId}
          />
        </section>
      )}
    </div>
  );
}

function LayoutGrid({
  view,
  editable,
  submit,
}: {
  view: AvailableLayout | BaseLayout;
  editable: boolean;
  submit: Submit;
}) {
  const demo = useDemoState();
  const [focusPosition, setFocusPosition] = useState({ row: 0, column: 0 });
  const [picked, setPicked] = useState<{
    stationId: StationId;
    revision: number;
  }>();
  const [announcement, setAnnouncement] = useState(
    editable
      ? 'Use arrows to navigate, Enter or Space to pick and drop, Escape to cancel.'
      : 'Read-only layout. Use arrows to inspect station states.',
  );
  const instructionsId = useId();
  const cells = useRef(new Map<string, HTMLButtonElement>());
  const rows = gridAxis([
    focusPosition.row,
    ...view.stations.map((item) => item.row),
  ]);
  const columns = gridAxis([
    focusPosition.column,
    ...view.stations.map((item) => item.column),
  ]);
  const rowCount = rows[rows.length - 1] + 1;
  const columnCount = columns[columns.length - 1] + 1;
  const activate = (row: number, column: number) => {
    if (!editable) {
      setAnnouncement(
        'Read-only layout. Only an active Admin can edit positions.',
      );
      return;
    }
    const station = view.stations.find(
      (item) => item.row === row && item.column === column,
    );
    if (!picked) {
      if (!station) {
        setAnnouncement('Empty cell. Pick a station first.');
        return;
      }
      setPicked({ stationId: station.stationId, revision: demo.revision });
      setAnnouncement(
        `Picked ${station.label}. Navigate to a destination and press Enter or Space; Escape cancels.`,
      );
      return;
    }
    const result = submit(
      {
        type: 'placeStation',
        payload: { stationId: picked.stationId, row, column },
      },
      picked.revision,
    );
    setPicked(undefined);
    setAnnouncement(
      result.success
        ? 'Station placed. Only layout positions changed.'
        : 'Placement rejected. No layout positions changed.',
    );
  };
  const navigate = (
    event: KeyboardEvent<HTMLButtonElement>,
    row: number,
    column: number,
  ) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setPicked(undefined);
      setAnnouncement(
        'Station selection cancelled. No layout positions changed.',
      );
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate(row, column);
      return;
    }
    const steps: Record<string, readonly [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    const next = {
      row: rows[
        Math.max(0, Math.min(rows.length - 1, rows.indexOf(row) + step[0]))
      ],
      column:
        columns[
          Math.max(
            0,
            Math.min(columns.length - 1, columns.indexOf(column) + step[1]),
          )
        ],
    };
    setFocusPosition(next);
    cells.current.get(`${next.row}:${next.column}`)?.focus();
  };

  return (
    <>
      <p id={instructionsId}>{announcement}</p>
      {(rows.length < rowCount || columns.length < columnCount) && (
        <p>
          Large empty gaps are compacted. Coordinates remain unchanged; arrows
          navigate displayed cells.
        </p>
      )}
      <div className={styles.gridScroll}>
        <div
          role="grid"
          aria-label="Station layout"
          aria-describedby={instructionsId}
          aria-rowcount={rowCount}
          aria-colcount={columnCount}
          className={styles.grid}
        >
          {rows.map((row) => (
            <div
              key={row}
              role="row"
              aria-rowindex={row + 1}
              className={styles.gridRow}
              style={{
                gridTemplateColumns: `repeat(${columns.length}, minmax(10rem, 1fr))`,
              }}
            >
              {columns.map((column) => {
                const station = view.stations.find(
                  (item) => item.row === row && item.column === column,
                );
                const assigned =
                  view.audience === 'staff' &&
                  station &&
                  'assignedMember' in station
                    ? station.assignedMember?.displayName
                    : undefined;
                const outage =
                  view.audience === 'staff' &&
                  station &&
                  'reviewFlags' in station &&
                  station.reviewFlags.includes('stationOutOfService');
                const inactive =
                  view.audience === 'staff' &&
                  station &&
                  'reviewFlags' in station &&
                  station.reviewFlags.includes('memberInactive');
                return (
                  <div key={column} role="gridcell" aria-colindex={column + 1}>
                    <button
                      type="button"
                      ref={(element) => {
                        const key = `${row}:${column}`;
                        if (element) cells.current.set(key, element);
                        else cells.current.delete(key);
                      }}
                      tabIndex={
                        focusPosition.row === row &&
                        focusPosition.column === column
                          ? 0
                          : -1
                      }
                      aria-label={`Row ${row + 1}, column ${column + 1}: ${station ? `${station.label}, ${station.stateLabel}${assigned ? `, ${assigned}` : ''}${outage ? ', Station outage: staff review required' : ''}${inactive ? ', Inactive member: staff review required' : ''}` : 'Empty cell'}`}
                      aria-pressed={Boolean(
                        picked && station?.stationId === picked.stationId,
                      )}
                      className={`${styles.cell} ${station ? styles[station.state] : styles.empty}`}
                      onFocus={() => setFocusPosition({ row, column })}
                      onClick={() => activate(row, column)}
                      onKeyDown={(event) => navigate(event, row, column)}
                    >
                      {station ? (
                        <>
                          <strong>{station.label}</strong>
                          <span>
                            <span aria-hidden="true">
                              {icons[station.state]}{' '}
                            </span>
                            {station.stateLabel}
                          </span>
                          {assigned && <span>{assigned}</span>}
                          {outage && (
                            <span>Station outage: staff review required</span>
                          )}
                          {inactive && (
                            <span>Inactive member: staff review required</span>
                          )}
                        </>
                      ) : (
                        <span>Empty cell</span>
                      )}
                      <small>
                        Position: row {row}, column {column}
                      </small>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p role="status" aria-label="Layout interaction" className={styles.live}>
        {announcement}
      </p>
    </>
  );
}

function StationDetailsForm({
  station,
  revision,
  submit,
}: {
  station: Station;
  revision: number;
  submit: Submit;
}) {
  const [draft, setDraft] = useState<{ station: Station; revision: number }>();
  const value = draft?.station ?? station;
  const edit = (updates: Partial<Station>) =>
    setDraft({
      station: { ...value, ...updates },
      revision: draft?.revision ?? revision,
    });
  return (
    <form
      noValidate
      className={styles.form}
      aria-label="Station details"
      onSubmit={(event) => {
        event.preventDefault();
        const result = submit(
          {
            type: 'updateStation',
            payload: {
              stationId: station.stationId,
              updates: {
                label: value.label,
                pm5Serial: value.pm5Serial?.trim() || null,
                inService: value.inService,
              },
            },
          },
          draft?.revision ?? revision,
        );
        if (result.success) setDraft(undefined);
      }}
    >
      <InputField
        label="Station label"
        required
        value={value.label}
        onChange={(event) => edit({ label: event.target.value })}
      />
      <InputField
        label="PM5 association"
        hint="Optional fictional serial; data only."
        value={value.pm5Serial ?? ''}
        onChange={(event) => edit({ pm5Serial: event.target.value })}
      />
      <CheckboxField
        label="In service"
        checked={value.inService}
        onChange={(event) => edit({ inService: event.target.checked })}
      />
      <Button type="submit">Save station</Button>
      {draft && (
        <Button variant="secondary" onClick={() => setDraft(undefined)}>
          Reload station details
        </Button>
      )}
    </form>
  );
}

interface MapFormProps {
  readonly revision: number;
  readonly submit: Submit;
  readonly disabled: boolean;
  readonly reasonId?: string;
}

function PlacementForm({
  station,
  revision,
  submit,
  disabled,
  reasonId,
}: MapFormProps & { station: Station }) {
  const [draft, setDraft] = useState<{
    row: string;
    column: string;
    revision: number;
  }>();
  const value = draft ?? {
    row: String(station.row),
    column: String(station.column),
    revision,
  };
  return (
    <form
      noValidate
      className={styles.form}
      aria-label="Station placement"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        const result = submit(
          {
            type: 'placeStation',
            payload: {
              stationId: station.stationId,
              row: coordinate(value.row),
              column: coordinate(value.column),
            },
          },
          value.revision,
        );
        if (result.success) setDraft(undefined);
      }}
    >
      <fieldset disabled={disabled} aria-describedby={reasonId}>
        <legend>Place selected station</legend>
        <InputField
          label="Destination row"
          type="number"
          min={0}
          step={1}
          required
          value={value.row}
          onChange={(event) => setDraft({ ...value, row: event.target.value })}
        />
        <InputField
          label="Destination column"
          type="number"
          min={0}
          step={1}
          required
          value={value.column}
          onChange={(event) =>
            setDraft({ ...value, column: event.target.value })
          }
        />
        <Button type="submit">Place station</Button>
        {draft && (
          <Button variant="secondary" onClick={() => setDraft(undefined)}>
            Reload position
          </Button>
        )}
      </fieldset>
    </form>
  );
}

function NewStationForm({
  stationId,
  nextRow,
  revision,
  submit,
  disabled,
  reasonId,
}: MapFormProps & { stationId: StationId; nextRow: number }) {
  const [draft, setDraft] = useState<{
    label: string;
    pm5Serial: string;
    inService: boolean;
    row: string;
    column: string;
    revision: number;
  }>();
  const value = draft ?? {
    label: '',
    pm5Serial: '',
    inService: true,
    row: String(nextRow),
    column: '0',
    revision,
  };
  return (
    <form
      noValidate
      className={styles.form}
      aria-label="Create station"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        const result = submit(
          {
            type: 'createStation',
            payload: {
              station: {
                stationId,
                label: value.label,
                pm5Serial: value.pm5Serial.trim() || null,
                inService: value.inService,
                row: coordinate(value.row),
                column: coordinate(value.column),
              },
            },
          },
          value.revision,
        );
        if (result.success) setDraft(undefined);
      }}
    >
      <fieldset disabled={disabled} aria-describedby={reasonId}>
        <legend>New station</legend>
        <InputField
          label="New station label"
          required
          value={value.label}
          onChange={(event) =>
            setDraft({ ...value, label: event.target.value })
          }
        />
        <InputField
          label="New PM5 association"
          value={value.pm5Serial}
          onChange={(event) =>
            setDraft({ ...value, pm5Serial: event.target.value })
          }
        />
        <CheckboxField
          label="New station in service"
          checked={value.inService}
          onChange={(event) =>
            setDraft({ ...value, inService: event.target.checked })
          }
        />
        <InputField
          label="New row"
          type="number"
          min={0}
          step={1}
          required
          value={value.row}
          onChange={(event) => setDraft({ ...value, row: event.target.value })}
        />
        <InputField
          label="New column"
          type="number"
          min={0}
          step={1}
          required
          value={value.column}
          onChange={(event) =>
            setDraft({ ...value, column: event.target.value })
          }
        />
        <Button type="submit">Create station</Button>
        {draft && (
          <Button variant="secondary" onClick={() => setDraft(undefined)}>
            Reload new station form
          </Button>
        )}
      </fieldset>
    </form>
  );
}

function OrientationForm({
  label,
  revision,
  submit,
  disabled,
  reasonId,
}: MapFormProps & { label: string }) {
  const [draft, setDraft] = useState<{ label: string; revision: number }>();
  const value = draft ?? { label, revision };
  return (
    <form
      noValidate
      className={styles.form}
      aria-label="Layout orientation"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        const result = submit(
          {
            type: 'setLayoutOrientation',
            payload: { orientationLabel: value.label },
          },
          value.revision,
        );
        if (result.success) setDraft(undefined);
      }}
    >
      <fieldset disabled={disabled} aria-describedby={reasonId}>
        <legend>Optional orientation</legend>
        <InputField
          label="Orientation label"
          value={value.label}
          onChange={(event) =>
            setDraft({ ...value, label: event.target.value })
          }
        />
        <Button type="submit">Save orientation</Button>
        {draft && (
          <Button variant="secondary" onClick={() => setDraft(undefined)}>
            Reload orientation
          </Button>
        )}
      </fieldset>
    </form>
  );
}
