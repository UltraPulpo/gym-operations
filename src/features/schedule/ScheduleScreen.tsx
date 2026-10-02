import { useId, useState } from 'react';
import { DateTime } from 'luxon';
import { PublicCoachProfile } from '../coaches';
import {
  selectClasses,
  selectCoachProfile,
  selectSettings,
  selectStaffAccounts,
  useDemoState,
} from '../../demo-state';
import type {
  AcceptedAction,
  ClassId,
  DemoAction,
  DomainError,
  LocalDate,
  LocalTime,
  ScheduleReleasePolicy,
  ScheduledClass,
  TemplateEntry,
} from '../../domain';
import {
  Alert,
  Button,
  CheckboxField,
  InputField,
  SelectField,
  StatusBadge,
} from '../../shared';
import styles from './schedule.module.css';

type RunAction = (
  action: DemoAction,
  message: string | ((accepted: AcceptedAction) => string),
) => boolean;
type FieldError = (field: string) => string | undefined;
type InvalidField = (field: string, message: string) => void;
type EntryDraft = Omit<TemplateEntry, 'localTime' | 'classTypeId'> & {
  readonly localTime: string;
  readonly classTypeId: string;
};
function isDate(value: string): value is LocalDate {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function isTime(value: string): value is LocalTime {
  return /^\d{2}:\d{2}$/.test(value);
}

function CoachOptions() {
  const { state } = useDemoState();
  return (
    <>
      <option value="">No coach assigned</option>
      {selectStaffAccounts(state)
        .filter(
          (staff) => staff.active && staff.assignedRoles.includes('coach'),
        )
        .map((staff) => {
          const profile = selectCoachProfile(state, staff.staffId);
          return (
            <option key={staff.staffId} value={staff.staffId}>
              {profile.success
                ? profile.value.profile.displayName
                : `${staff.staffId} (profile unavailable)`}
            </option>
          );
        })}
    </>
  );
}

function ClassTypeOptions() {
  const { state } = useDemoState();
  return (
    <>
      {state.classTypes.map((item) => (
        <option key={item.classTypeId} value={item.classTypeId}>
          {item.name} ({item.durationMinutes} min)
        </option>
      ))}
    </>
  );
}

function TemplateEditor({
  run,
  error,
  invalid,
}: {
  run: RunAction;
  error: FieldError;
  invalid: InvalidField;
}) {
  const { state, revision } = useDemoState();
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const entriesErrorId = useId();
  const newEntry = (index: number): EntryDraft => ({
    entryId: `templateEntry:screen-${revision}-${index}`,
    weekday: 1,
    localTime: '09:00',
    classTypeId: state.classTypes[0]?.classTypeId ?? '',
  });
  const [entries, setEntries] = useState<readonly EntryDraft[]>(() => [
    newEntry(0),
  ]);
  const update = (index: number, changes: Partial<EntryDraft>) => {
    setEntries(
      entries.map((entry, position) =>
        position === index ? { ...entry, ...changes } : entry,
      ),
    );
  };
  return (
    <form
      aria-label="Weekly template editor"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const existing = state.weeklyTemplates.find(
          (item) => item.templateId === selected,
        );
        if (selected && !existing)
          return invalid(
            'templateId',
            'The selected template is no longer available.',
          );
        const validEntries: TemplateEntry[] = [];
        for (const [index, entry] of entries.entries()) {
          if (!isTime(entry.localTime))
            return invalid(
              `entries.${index}.localTime`,
              'Enter a valid 24-hour local time.',
            );
          const classType = state.classTypes.find(
            (item) => item.classTypeId === entry.classTypeId,
          );
          if (!classType)
            return invalid(
              'classTypeId',
              'Choose an available class type for every entry.',
            );
          validEntries.push({
            ...entry,
            localTime: entry.localTime,
            classTypeId: classType.classTypeId,
          });
        }
        run(
          existing
            ? {
                type: 'updateWeeklyTemplate',
                payload: {
                  templateId: existing.templateId,
                  updates: { name, entries: validEntries },
                },
              }
            : {
                type: 'createWeeklyTemplate',
                payload: {
                  template: {
                    templateId: `template:screen-${revision}-${state.weeklyTemplates.length}`,
                    name,
                    entries: validEntries,
                  },
                },
              },
          existing ? 'Template updated' : 'Template created',
        );
      }}
    >
      <h2>Weekly templates</h2>
      <SelectField
        label="Template to edit"
        value={selected}
        onChange={(event) => {
          setSelected(event.target.value);
          const template = state.weeklyTemplates.find(
            (item) => item.templateId === event.target.value,
          );
          setName(template?.name ?? '');
          setEntries(template?.entries ?? [newEntry(0)]);
        }}
      >
        <option value="">New template</option>
        {state.weeklyTemplates.map((item) => (
          <option key={item.templateId} value={item.templateId}>
            {item.name}
          </option>
        ))}
      </SelectField>
      <InputField
        label="Template name"
        value={name}
        error={error('name')}
        onChange={(event) => setName(event.target.value)}
      />
      <fieldset
        aria-invalid={error('entries') ? true : undefined}
        aria-describedby={error('entries') ? entriesErrorId : undefined}
      >
        <legend>Template entries</legend>
        {entries.map((entry, index) => (
          <fieldset key={entry.entryId}>
            <legend>Entry {index + 1}</legend>
            <SelectField
              label={`Entry ${index + 1} weekday`}
              value={entry.weekday}
              error={error(`entries.${index}.weekday`)}
              onChange={(event) => {
                const weekday = Number(event.target.value);
                if (
                  weekday === 1 ||
                  weekday === 2 ||
                  weekday === 3 ||
                  weekday === 4 ||
                  weekday === 5 ||
                  weekday === 6 ||
                  weekday === 7
                )
                  update(index, { weekday });
              }}
            >
              {[
                'Monday',
                'Tuesday',
                'Wednesday',
                'Thursday',
                'Friday',
                'Saturday',
                'Sunday',
              ].map((day, position) => (
                <option key={day} value={position + 1}>
                  {day}
                </option>
              ))}
            </SelectField>
            <InputField
              label={`Entry ${index + 1} time`}
              type="time"
              value={entry.localTime}
              error={error(`entries.${index}.localTime`)}
              onChange={(event) => {
                update(index, { localTime: event.target.value });
              }}
            />
            <SelectField
              label={`Entry ${index + 1} class type`}
              value={entry.classTypeId}
              error={error('classTypeId')}
              onChange={(event) => {
                const type = state.classTypes.find(
                  (item) => item.classTypeId === event.target.value,
                );
                if (type) update(index, { classTypeId: type.classTypeId });
              }}
            >
              <ClassTypeOptions />
            </SelectField>
            <SelectField
              label={`Entry ${index + 1} coach`}
              value={entry.coachId ?? ''}
              onChange={(event) => {
                const coach = selectStaffAccounts(state).find(
                  (item) => item.staffId === event.target.value,
                );
                const { coachId: previousCoach, ...withoutCoach } = entry;
                void previousCoach;
                setEntries(
                  entries.map((item, position) =>
                    position === index
                      ? {
                          ...withoutCoach,
                          ...(coach ? { coachId: coach.staffId } : {}),
                        }
                      : item,
                  ),
                );
              }}
            >
              <CoachOptions />
            </SelectField>
            <Button
              onClick={() =>
                setEntries(entries.filter((_, position) => position !== index))
              }
            >
              Remove entry {index + 1}
            </Button>
          </fieldset>
        ))}
        {error('entries') && (
          <p id={entriesErrorId} role="alert">
            {error('entries')}
          </p>
        )}
        <Button
          onClick={() => {
            let index = entries.length;
            while (
              entries.some(
                (entry) =>
                  entry.entryId === `templateEntry:screen-${revision}-${index}`,
              )
            )
              index += 1;
            setEntries([...entries, newEntry(index)]);
          }}
        >
          Add template entry
        </Button>
      </fieldset>
      <Button type="submit">Save template</Button>
    </form>
  );
}

function TemplateApplication({
  run,
  error,
  invalid,
}: {
  run: RunAction;
  error: FieldError;
  invalid: (field: string, message: string) => void;
}) {
  const { state } = useDemoState();
  const [selected, setSelected] = useState('');
  const [week, setWeek] = useState('');
  return (
    <form
      aria-label="Apply a weekly template"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const template = state.weeklyTemplates.find(
          (item) => item.templateId === selected,
        );
        if (!template)
          return invalid('templateId', 'Choose a template to apply.');
        if (!isDate(week))
          return invalid('weekStartsOn', 'Enter a valid Monday date.');
        const beforeCount = state.classes.length;
        run(
          {
            type: 'applyWeeklyTemplate',
            payload: { templateId: template.templateId, weekStartsOn: week },
          },
          (accepted) => {
            if (!accepted.changes.classes) {
              throw new Error(
                'Accepted template application did not include scheduled classes.',
              );
            }
            const added = accepted.changes.classes.length - beforeCount;
            const skipped = template.entries.length - added;
            return `${added} draft${added === 1 ? '' : 's'} created; ${skipped} exact duplicate${skipped === 1 ? '' : 's'} skipped`;
          },
        );
      }}
    >
      <h2>Apply to a chosen week</h2>
      <p>
        Choose any saved template for each week to build alternating schedules.
        Applications create drafts only and never replace existing classes.
      </p>
      <SelectField
        label="Template to apply"
        value={selected}
        error={error('templateId')}
        onChange={(event) => setSelected(event.target.value)}
      >
        <option value="">Choose a template</option>
        {state.weeklyTemplates.map((item) => (
          <option key={item.templateId} value={item.templateId}>
            {item.name}
          </option>
        ))}
      </SelectField>
      <InputField
        label="Week starting Monday"
        type="date"
        value={week}
        error={error('weekStartsOn')}
        onChange={(event) => setWeek(event.target.value)}
      />
      <Button type="submit">Apply template</Button>
    </form>
  );
}

function ScheduledClassEditor({
  classes,
  run,
  error,
  invalid,
}: {
  classes: readonly ScheduledClass[];
  run: RunAction;
  error: FieldError;
  invalid: (field: string, message: string) => void;
}) {
  const { state, revision } = useDemoState();
  const [selected, setSelected] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [typeId, setTypeId] = useState<string>(
    state.classTypes[0]?.classTypeId ?? '',
  );
  const [coachId, setCoachId] = useState('');
  const [reason, setReason] = useState('');
  const editable = classes.filter(
    (item) => item.status === 'draft' || item.status === 'published',
  );
  const existing = editable.find((item) => item.classId === selected);
  return (
    <form
      aria-label="Scheduled class editor"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!isDate(date))
          return invalid('schedule', 'Enter a valid class date.');
        if (!isTime(time))
          return invalid('schedule', 'Enter a valid class start time.');
        const classType = state.classTypes.find(
          (item) => item.classTypeId === typeId,
        );
        if (!classType)
          return invalid('classTypeId', 'Choose an available class type.');
        const coach = selectStaffAccounts(state).find(
          (item) => item.staffId === coachId,
        );
        const schedule = { date, time, timezone: state.settings.timezone };
        if (selected && !existing)
          return invalid(
            'classId',
            'The selected class can no longer be edited.',
          );
        run(
          existing
            ? {
                type: 'editScheduledClass',
                payload: {
                  classId: existing.classId,
                  updates: {
                    schedule,
                    coachId: coach?.staffId ?? null,
                    ...(existing.status === 'draft' &&
                    classType.classTypeId !==
                      existing.classTypeSnapshot.classTypeId
                      ? { classTypeId: classType.classTypeId }
                      : {}),
                  },
                },
              }
            : {
                type: 'createDraftClass',
                payload: {
                  classId: `class:screen-${revision}-${state.classes.length}`,
                  classTypeId: classType.classTypeId,
                  schedule,
                  ...(coach ? { coachId: coach.staffId } : {}),
                },
              },
          existing ? 'Scheduled class updated' : 'Draft class created',
        );
      }}
    >
      <h2>Create or edit a scheduled class</h2>
      <SelectField
        label="Class to edit"
        value={selected}
        error={error('classId')}
        onChange={(event) => {
          setSelected(event.target.value);
          const item = editable.find(
            (candidate) => candidate.classId === event.target.value,
          );
          setDate(item?.schedule.date ?? '');
          setTime(item?.schedule.time ?? '');
          setTypeId(
            item?.classTypeSnapshot.classTypeId ??
              state.classTypes[0]?.classTypeId ??
              '',
          );
          setCoachId(item?.coachId ?? '');
          setReason('');
        }}
      >
        <option value="">New draft</option>
        {editable.map((item) => (
          <option key={item.classId} value={item.classId}>
            {item.schedule.date} {item.schedule.time}{' '}
            {item.classTypeSnapshot.name} ({item.classId})
          </option>
        ))}
      </SelectField>
      <InputField
        label="Class date"
        type="date"
        value={date}
        error={error('schedule')}
        onChange={(event) => setDate(event.target.value)}
      />
      <InputField
        label="Class start time"
        type="time"
        value={time}
        error={error('schedule')}
        onChange={(event) => setTime(event.target.value)}
      />
      <SelectField
        label="Scheduled class type"
        value={typeId}
        disabled={existing?.status === 'published'}
        error={error('classTypeId')}
        onChange={(event) => setTypeId(event.target.value)}
      >
        <ClassTypeOptions />
      </SelectField>
      <SelectField
        label="Class coach"
        value={coachId}
        onChange={(event) => setCoachId(event.target.value)}
      >
        <CoachOptions />
      </SelectField>
      {existing?.status === 'published' && (
        <p>
          Published date, start-time and coach changes notify booked members
          locally. Only a start-time change waives late-cancel status. Published
          class types cannot change.
        </p>
      )}
      <Button type="submit">Save scheduled class</Button>
      {existing?.status === 'published' && (
        <>
          <InputField
            label="Cancellation reason"
            value={reason}
            error={error('reason')}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button
            variant="danger"
            onClick={() =>
              run(
                {
                  type: 'cancelClass',
                  payload: { classId: existing.classId, reason },
                },
                'Published class cancelled; booked and waitlisted members notified locally',
              )
            }
          >
            Cancel published class
          </Button>
        </>
      )}
    </form>
  );
}

function ReleasePolicyEditor({
  run,
  error,
}: {
  run: RunAction;
  error: FieldError;
}) {
  const { state } = useDemoState();
  const policy = selectSettings(state).scheduleRelease;
  const [mode, setMode] = useState<ScheduleReleasePolicy['mode']>(policy.mode);
  const [minutes, setMinutes] = useState(
    policy.mode === 'rolling' ? String(policy.advanceMinutes) : '10080',
  );
  return (
    <form
      aria-label="Schedule release policy"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        run(
          {
            type: 'updateSettings',
            payload: {
              updates: {
                scheduleRelease:
                  mode === 'rolling'
                    ? {
                        mode,
                        advanceMinutes: minutes.trim()
                          ? Number(minutes)
                          : Number.NaN,
                      }
                    : { mode },
              },
            },
          },
          'Release policy saved',
        );
      }}
    >
      <h2>Schedule release</h2>
      <p>
        Illustrative policy only. Immediate has no advance limit; rolling uses
        the frozen clock; manual requires an explicit published-class release.
      </p>
      <SelectField
        label="Release mode"
        value={mode}
        onChange={(event) => {
          const value = event.target.value;
          if (
            value === 'manual' ||
            value === 'rolling' ||
            value === 'immediate'
          )
            setMode(value);
        }}
      >
        <option value="immediate">Immediate</option>
        <option value="rolling">Rolling window</option>
        <option value="manual">Manual / batch</option>
      </SelectField>
      {mode === 'rolling' && (
        <InputField
          label="Rolling window (minutes)"
          type="number"
          value={minutes}
          error={error('updates.scheduleRelease.advanceMinutes')}
          onChange={(event) => setMinutes(event.target.value)}
        />
      )}
      <Button type="submit">Save release policy</Button>
    </form>
  );
}

function ScheduleWorkspace() {
  const demo = useDemoState();
  const classes = selectClasses(demo.state, {
    actor: demo.activeActor,
    now: demo.now,
  });
  const settings = selectSettings(demo.state);
  const canManage =
    demo.capabilities.success &&
    demo.capabilities.value.capabilities.includes('manageSchedule');
  const [feedback, setFeedback] = useState<{
    revision: number;
    error?: DomainError;
    message?: string;
    warnings?: readonly string[];
  }>();
  const current = feedback?.revision === demo.revision ? feedback : undefined;
  const error: FieldError = (field) =>
    current?.error?.category === 'ValidationError'
      ? current.error.fields.find((item) => item.field === field)?.message
      : undefined;
  const invalid = (field: string, message: string) =>
    setFeedback({
      revision: demo.revision,
      error: {
        category: 'ValidationError',
        message,
        fields: [{ field, message }],
      },
    });
  const run: RunAction = (action, message) => {
    const result = demo.submit(action, { expectedRevision: demo.revision });
    if (!result.success) {
      setFeedback({ revision: demo.revision, error: result.error });
      return false;
    }
    const oldIds = new Set(
      demo.state.notifications.map((item) => item.notificationId),
    );
    const newNotifications =
      result.value.changes.notifications?.filter(
        (item) => !oldIds.has(item.notificationId),
      ) ?? [];
    const delivery = newNotifications.length
      ? [
          `Simulated notifications: ${newNotifications.filter((item) => item.status === 'sent').length} sent, ${newNotifications.filter((item) => item.status === 'failed').length} failed. No email transmitted.`,
        ]
      : [];
    setFeedback({
      revision: result.value.baseRevision + 1,
      message: typeof message === 'function' ? message(result.value) : message,
      warnings: [
        ...result.value.warnings.map((warning) => warning.message),
        ...delivery,
      ],
    });
    return true;
  };
  const [publishIds, setPublishIds] = useState<readonly ClassId[]>([]);
  const [releaseIds, setReleaseIds] = useState<readonly ClassId[]>([]);
  const toggle = (ids: readonly ClassId[], id: ClassId) =>
    ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
  const drafts = publishIds;
  const published = releaseIds;
  return (
    <main className={styles.screen}>
      <h1>Schedule</h1>
      <p>
        Fictional, non-operational demonstration. Refresh resets data. No live
        authentication, shared persistence or real email.
      </p>
      <p>
        America/Los_Angeles is illustrative, not approved gym policy. Recurring
        wall-clock times remain stable across DST; displayed offsets use Luxon
        zone behavior.
      </p>
      <p>
        Current release: {settings.scheduleRelease.mode}
        {settings.scheduleRelease.mode === 'rolling'
          ? ` (${settings.scheduleRelease.advanceMinutes} minutes)`
          : ''}
        . Target gap: {settings.targetGapMinutes} minutes (illustrative).
      </p>
      {!demo.capabilities.success && (
        <Alert>{demo.capabilities.error.message}</Alert>
      )}
      {!canManage && (
        <p>
          Read-only schedule: only an active Admin can change templates, classes
          or release policy. Coach views are limited by assigned-class
          selectors; members see published, released classes only. These are
          simulated permissions.
        </p>
      )}
      {current?.error && (
        <Alert>
          {current.error.message}
          {current.error.category === 'DemoConflict' &&
            current.error.conflict.kind === 'schedule' && (
              <p>
                Conflicting classes:{' '}
                {current.error.conflict.classIds.join(', ')}. Entire proposal
                rejected; no classes changed.
              </p>
            )}
        </Alert>
      )}
      {current?.message && (
        <Alert tone="success">{current.message} in the local demo.</Alert>
      )}
      {current?.warnings && current.warnings.length > 0 && (
        <Alert tone="warning">
          {current.warnings.map((warning, index) => (
            <p key={index}>{warning}</p>
          ))}
        </Alert>
      )}
      {canManage && (
        <div className={styles.editors}>
          <TemplateEditor run={run} error={error} invalid={invalid} />
          <TemplateApplication run={run} error={error} invalid={invalid} />
          <ScheduledClassEditor
            classes={classes}
            run={run}
            error={error}
            invalid={invalid}
          />
          <ReleasePolicyEditor run={run} error={error} />
        </div>
      )}
      <section aria-label="Scheduled classes">
        <h2>Classes and retained history</h2>
        {classes.length === 0 && (
          <p>
            No schedule classes are visible to this persona under the current
            release policy.
          </p>
        )}
        {classes.map((item, index) => {
          const localStart = DateTime.fromISO(item.startsAt, {
            setZone: true,
          }).setZone(settings.timezone);
          const localEnd = DateTime.fromISO(item.endsAt, {
            setZone: true,
          }).setZone(settings.timezone);
          const coach = item.coachId
            ? selectCoachProfile(demo.state, item.coachId)
            : undefined;
          const previous = classes
            .slice(0, index)
            .filter((candidate) => candidate.status !== 'cancelled')
            .at(-1);
          const gap = previous
            ? (DateTime.fromISO(item.startsAt).toMillis() -
                DateTime.fromISO(previous.endsAt).toMillis()) /
              60000
            : undefined;
          return (
            <article
              aria-label={`Class ${item.classId}`}
              key={item.classId}
              className={styles.classCard}
            >
              <h3>{item.classTypeSnapshot.name}</h3>
              <p>
                {localStart.toFormat('yyyy-MM-dd HH:mm ZZZZ')} -{' '}
                {localEnd.toFormat('HH:mm ZZZZ')}
              </p>
              <StatusBadge>{item.status}</StatusBadge>
              <p>
                {item.classTypeSnapshot.durationMinutes} minutes -{' '}
                {item.classTypeSnapshot.difficulty}
              </p>
              <p>{item.classTypeSnapshot.description}</p>
              {item.classTypeSnapshot.alias && (
                <p>Alias: {item.classTypeSnapshot.alias}</p>
              )}
              {item.classTypeSnapshot.whatToBring && (
                <p>What to bring: {item.classTypeSnapshot.whatToBring}</p>
              )}
              <p>
                Coach:{' '}
                {coach?.success
                  ? coach.value.profile.displayName
                  : (item.coachId ?? 'No coach assigned')}
              </p>
              {coach && !coach.success && <Alert>{coach.error.message}</Alert>}
              {coach?.success &&
                item.coachId &&
                (demo.activeActor.kind === 'member' ? (
                  <PublicCoachProfile coachId={item.coachId} headingLevel={4} />
                ) : (
                  <p>
                    {coach.value.profile.biography}{' '}
                    {coach.value.profile.certifications.join(', ')}
                  </p>
                ))}
              {canManage && (
                <>
                  <p>
                    Late-cancel waiver: {item.lateCancelWaived ? 'yes' : 'no'}
                  </p>
                  {item.reviewFlags.includes('zeroCapacity') && (
                    <p>Review required: zero capacity.</p>
                  )}
                  {gap !== undefined &&
                    gap >= 0 &&
                    gap < settings.targetGapMinutes &&
                    item.status !== 'cancelled' && (
                      <p className={styles.warning}>
                        Warning: {gap}-minute gap; below the illustrative{' '}
                        {settings.targetGapMinutes}-minute target. Times were
                        not shifted.
                      </p>
                    )}
                  {item.status === 'draft' && (
                    <>
                      <CheckboxField
                        label="Select draft for publication"
                        checked={drafts.includes(item.classId)}
                        onChange={() =>
                          setPublishIds(toggle(drafts, item.classId))
                        }
                      />
                      <Button
                        variant="danger"
                        onClick={() =>
                          run(
                            {
                              type: 'deleteDraftClass',
                              payload: { classId: item.classId },
                            },
                            'Draft deleted',
                          )
                        }
                      >
                        Delete draft
                      </Button>
                    </>
                  )}
                  {item.status === 'published' && (
                    <>
                      <p>
                        Manual release:{' '}
                        {item.releasedAt ? 'released' : 'not released'}
                      </p>
                      <CheckboxField
                        label="Select published class for release"
                        checked={published.includes(item.classId)}
                        onChange={() =>
                          setReleaseIds(toggle(published, item.classId))
                        }
                      />
                    </>
                  )}
                </>
              )}
              {item.cancellationReason && (
                <p>Cancellation reason: {item.cancellationReason}</p>
              )}
            </article>
          );
        })}
        {canManage && (
          <div className={styles.actions}>
            <Button
              onClick={() => {
                if (
                  run(
                    { type: 'publishClasses', payload: { classIds: drafts } },
                    `${drafts.length} selected drafts published`,
                  )
                )
                  setPublishIds([]);
              }}
            >
              Publish selected drafts
            </Button>
            <Button variant="secondary" onClick={() => setPublishIds([])}>
              Clear publication selection
            </Button>
            <Button
              onClick={() => {
                if (
                  run(
                    {
                      type: 'releaseClasses',
                      payload: { classIds: published },
                    },
                    `${published.length} selected classes released`,
                  )
                )
                  setReleaseIds([]);
              }}
            >
              Release selected classes
            </Button>
            <Button variant="secondary" onClick={() => setReleaseIds([])}>
              Clear release selection
            </Button>
            {error('classIds') && <Alert>{error('classIds')}</Alert>}
          </div>
        )}
      </section>
    </main>
  );
}

export function ScheduleScreen() {
  const { activeActor, state } = useDemoState();
  return (
    <ScheduleWorkspace
      key={`${state.scenarioId}:${JSON.stringify(activeActor)}`}
    />
  );
}
