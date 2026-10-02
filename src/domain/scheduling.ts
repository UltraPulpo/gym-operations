import { DateTime, IANAZone } from 'luxon';
import { validateClassCapacity } from './stations';
import type {
  ClassChange,
  ClassId,
  ClassType,
  DemoConflict,
  DemoState,
  DomainResult,
  DraftClassInput,
  IanaTimeZone,
  LocalDate,
  LocalSchedule,
  LocalTime,
  NotificationEvent,
  ScheduleReleasePolicy,
  ScheduledClass,
  ScheduledClassUpdate,
  ShortGapWarning,
  TemplateApplication,
  UtcInstant,
  WeeklyTemplate,
  WeeklyTemplateId,
  WeeklyTemplateUpdate,
} from './types';

const timeFormat = 'HH:mm';
const dateFormat = 'yyyy-MM-dd';

export interface ApplyWeeklyTemplateInput {
  readonly template: WeeklyTemplate;
  readonly weekStartsOn: LocalDate;
  readonly timezone: IanaTimeZone;
  readonly classTypes: readonly ClassType[];
  readonly classes: readonly ScheduledClass[];
  readonly targetGapMinutes: number;
}

export interface ScheduledClassEdit {
  readonly scheduledClass: ScheduledClass;
  readonly notification?: NotificationEvent;
}

export interface PublishedClassBatch {
  readonly classes: readonly ScheduledClass[];
  readonly warnings: readonly ShortGapWarning[];
}

function success<T>(value: T): DomainResult<T> {
  return { success: true, value };
}

function invalid(
  message: string,
  fields: readonly { readonly field: string; readonly message: string }[] = [
    { field: 'schedule', message },
  ],
): DomainResult<never> {
  return {
    success: false,
    error: { category: 'ValidationError', message, fields },
  };
}

function scheduleConflict(
  earlierClassId: ClassId,
  laterClassId: ClassId,
): DomainResult<never> {
  const conflict: DemoConflict = {
    category: 'DemoConflict',
    message: 'The proposed class overlaps another scheduled class.',
    conflict: {
      kind: 'schedule',
      classIds: [earlierClassId, laterClassId],
    },
  };
  return { success: false, error: conflict };
}

function validateDate(date: LocalDate): boolean {
  const parsed = DateTime.fromFormat(date, dateFormat, { zone: 'utc' });
  return parsed.isValid && parsed.toFormat(dateFormat) === date;
}

function validateTime(time: LocalTime): boolean {
  const parsed = DateTime.fromFormat(time, timeFormat, { zone: 'utc' });
  return parsed.isValid && parsed.toFormat(timeFormat) === time;
}

function validateUtcInstant(instant: UtcInstant): boolean {
  const parsed = DateTime.fromISO(instant, { setZone: true });
  return (
    parsed.isValid &&
    instant.endsWith('Z') &&
    parsed.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'") === instant
  );
}

function parseSchedule(schedule: LocalSchedule): DateTime | undefined {
  if (!validateDate(schedule.date)) {
    return undefined;
  }
  if (!validateTime(schedule.time)) {
    return undefined;
  }
  if (!IANAZone.isValidZone(schedule.timezone)) {
    return undefined;
  }

  const [year, month, day] = schedule.date.split('-').map(Number);
  const [hour, minute] = schedule.time.split(':').map(Number);
  const parsed = DateTime.fromObject(
    { year, month, day, hour, minute },
    { zone: schedule.timezone },
  );
  return parsed.isValid ? parsed : undefined;
}

function toUtcInstant(value: DateTime): UtcInstant {
  return value.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'") as UtcInstant;
}

function toClass(
  classId: ClassId,
  schedule: LocalSchedule,
  starts: DateTime,
  classType: ClassType,
  coachId?: DraftClassInput['coachId'],
): ScheduledClass {
  return {
    classId,
    schedule,
    startsAt: toUtcInstant(starts),
    endsAt: toUtcInstant(starts.plus({ minutes: classType.durationMinutes })),
    status: 'draft',
    ...(coachId ? { coachId } : {}),
    classTypeSnapshot: { ...classType },
    lateCancelWaived: false,
    reviewFlags: [],
  };
}

function instantMillis(instant: UtcInstant): number {
  return DateTime.fromISO(instant, { setZone: true }).toMillis();
}

function overlaps(first: ScheduledClass, second: ScheduledClass): boolean {
  return (
    instantMillis(first.startsAt) < instantMillis(second.endsAt) &&
    instantMillis(first.endsAt) > instantMillis(second.startsAt)
  );
}

function duplicateOf(
  candidate: ScheduledClass,
  existing: ScheduledClass,
): boolean {
  return (
    existing.status !== 'cancelled' &&
    candidate.schedule.date === existing.schedule.date &&
    candidate.schedule.time === existing.schedule.time &&
    candidate.schedule.timezone === existing.schedule.timezone &&
    candidate.classTypeSnapshot.classTypeId ===
      existing.classTypeSnapshot.classTypeId &&
    candidate.coachId === existing.coachId
  );
}

function isValidTargetGap(minutes: number): boolean {
  return Number.isFinite(minutes) && minutes >= 0;
}

function shortGapWarnings(
  classes: readonly ScheduledClass[],
  targetGapMinutes: number,
  relevantClassIds?: ReadonlySet<ClassId>,
): readonly ShortGapWarning[] {
  const activeClasses = classes
    .filter((scheduledClass) => scheduledClass.status !== 'cancelled')
    .slice()
    .sort(
      (left, right) =>
        instantMillis(left.startsAt) - instantMillis(right.startsAt),
    );
  const warnings: ShortGapWarning[] = [];

  for (let index = 1; index < activeClasses.length; index += 1) {
    const earlier = activeClasses[index - 1];
    const later = activeClasses[index];
    if (
      !earlier ||
      !later ||
      (relevantClassIds &&
        !relevantClassIds.has(earlier.classId) &&
        !relevantClassIds.has(later.classId))
    ) {
      continue;
    }

    const gapMinutes =
      (instantMillis(later.startsAt) - instantMillis(earlier.endsAt)) / 60_000;
    if (gapMinutes >= 0 && gapMinutes < targetGapMinutes) {
      warnings.push({
        category: 'shortGap',
        message: `There is only a ${gapMinutes}-minute gap between classes.`,
        earlierClassId: earlier.classId,
        laterClassId: later.classId,
        actualGapMinutes: gapMinutes,
        targetGapMinutes,
      });
    }
  }

  return warnings;
}

function validateTemplate(
  weeklyTemplate: WeeklyTemplate,
): DomainResult<WeeklyTemplate> {
  const fields: { field: string; message: string }[] = [];
  if (!weeklyTemplate.name.trim()) {
    fields.push({ field: 'name', message: 'Enter a template name.' });
  }
  if (weeklyTemplate.entries.length === 0) {
    fields.push({ field: 'entries', message: 'Add at least one class entry.' });
  }
  const entryIds = new Set<string>();
  weeklyTemplate.entries.forEach((entry, index) => {
    if (entryIds.has(entry.entryId)) {
      fields.push({
        field: `entries.${index}.entryId`,
        message: 'Template entry IDs must be unique.',
      });
    }
    entryIds.add(entry.entryId);
    if (
      !Number.isInteger(entry.weekday) ||
      entry.weekday < 1 ||
      entry.weekday > 7
    ) {
      fields.push({
        field: `entries.${index}.weekday`,
        message: 'Choose a weekday from Monday through Sunday.',
      });
    }
    if (!validateTime(entry.localTime)) {
      fields.push({
        field: `entries.${index}.localTime`,
        message: 'Enter a valid 24-hour local time.',
      });
    }
  });
  if (fields.length > 0) {
    return invalid('The weekly template is not valid.', fields);
  }
  return success(weeklyTemplate);
}

export function createWeeklyTemplate(
  templates: readonly WeeklyTemplate[],
  weeklyTemplate: WeeklyTemplate,
): DomainResult<readonly WeeklyTemplate[]> {
  const validated = validateTemplate(weeklyTemplate);
  if (!validated.success) {
    return validated;
  }
  if (
    templates.some(({ templateId }) => templateId === weeklyTemplate.templateId)
  ) {
    return invalid('A template with this ID already exists.', [
      { field: 'templateId', message: 'Choose a unique template ID.' },
    ]);
  }
  return success([...templates, weeklyTemplate]);
}

export function updateWeeklyTemplate(
  templates: readonly WeeklyTemplate[],
  templateId: WeeklyTemplateId,
  updates: WeeklyTemplateUpdate,
): DomainResult<readonly WeeklyTemplate[]> {
  const index = templates.findIndex((item) => item.templateId === templateId);
  if (index < 0) {
    return invalid('The weekly template could not be found.', [
      { field: 'templateId', message: 'Select an existing template.' },
    ]);
  }
  const current = templates[index];
  if (!current) {
    return invalid('The weekly template could not be found.');
  }
  const updated = { ...current, ...updates };
  const validated = validateTemplate(updated);
  if (!validated.success) {
    return validated;
  }
  return success(
    templates.map((item) => (item.templateId === templateId ? updated : item)),
  );
}

export function deleteWeeklyTemplate(
  templates: readonly WeeklyTemplate[],
  templateId: WeeklyTemplateId,
): DomainResult<readonly WeeklyTemplate[]> {
  if (!templates.some((item) => item.templateId === templateId)) {
    return invalid('The weekly template could not be found.', [
      { field: 'templateId', message: 'Select an existing template.' },
    ]);
  }
  return success(templates.filter((item) => item.templateId !== templateId));
}

export function applyWeeklyTemplate(
  input: ApplyWeeklyTemplateInput,
): DomainResult<TemplateApplication> {
  const { template: weeklyTemplate, weekStartsOn, timezone: zone } = input;
  const validatedTemplate = validateTemplate(weeklyTemplate);
  if (!validatedTemplate.success) {
    return validatedTemplate;
  }
  if (!validateDate(weekStartsOn)) {
    return invalid('Choose a valid week start date.', [
      { field: 'weekStartsOn', message: 'Enter a valid calendar date.' },
    ]);
  }
  const weekStart = DateTime.fromISO(weekStartsOn, { zone: 'utc' });
  if (weekStart.weekday !== 1) {
    return invalid('The selected week must start on Monday.', [
      { field: 'weekStartsOn', message: 'Choose a Monday.' },
    ]);
  }
  if (!IANAZone.isValidZone(zone)) {
    return invalid('Choose a valid illustrative timezone.', [
      { field: 'timezone', message: 'Enter a valid IANA timezone.' },
    ]);
  }
  if (!isValidTargetGap(input.targetGapMinutes)) {
    return invalid('The target class gap must be a non-negative number.', [
      {
        field: 'targetGapMinutes',
        message: 'Enter zero or a positive number.',
      },
    ]);
  }

  const proposed: ScheduledClass[] = [];
  const skippedDuplicates: ClassId[] = [];
  for (const entry of weeklyTemplate.entries) {
    const classType = input.classTypes.find(
      ({ classTypeId }) => classTypeId === entry.classTypeId,
    );
    if (!classType) {
      return invalid('A template entry references an unknown class type.', [
        {
          field: 'classTypeId',
          message: `Class type ${entry.classTypeId} was not found.`,
        },
      ]);
    }
    const date = weekStart
      .plus({ days: entry.weekday - 1 })
      .toFormat(dateFormat) as LocalDate;
    const schedule: LocalSchedule = {
      date,
      time: entry.localTime,
      timezone: zone,
    };
    const starts = parseSchedule(schedule);
    if (!starts) {
      return invalid('A template entry has an invalid local schedule.', [
        {
          field: 'entries',
          message: `The ${entry.localTime} class time is invalid.`,
        },
      ]);
    }
    const classId =
      `class:${weeklyTemplate.templateId}:${entry.entryId}:${date}` as ClassId;
    const candidate = toClass(
      classId,
      schedule,
      starts,
      classType,
      entry.coachId,
    );
    const duplicate = input.classes.find((existing) =>
      duplicateOf(candidate, existing),
    );
    if (duplicate) {
      skippedDuplicates.push(duplicate.classId);
      continue;
    }
    if (
      input.classes.some(({ classId: existingId }) => existingId === classId)
    ) {
      return invalid('A generated class ID is already in use.', [
        {
          field: 'classId',
          message: `Generated class ID ${classId} is not unique.`,
        },
      ]);
    }
    proposed.push(candidate);
  }

  const activeExisting = input.classes.filter(
    (scheduledClass) => scheduledClass.status !== 'cancelled',
  );
  const checked: ScheduledClass[] = [];
  for (const candidate of proposed) {
    const conflict = [...activeExisting, ...checked].find((existing) =>
      overlaps(candidate, existing),
    );
    if (conflict) {
      return scheduleConflict(conflict.classId, candidate.classId);
    }
    checked.push(candidate);
  }

  const relevantIds = new Set(proposed.map(({ classId }) => classId));
  const warnings = shortGapWarnings(
    [...activeExisting, ...proposed],
    input.targetGapMinutes,
    relevantIds,
  );
  return success({ classes: proposed, skippedDuplicates, warnings });
}

export function createDraftClass(
  input: DraftClassInput,
  classTypes: readonly ClassType[],
  classes: readonly ScheduledClass[],
): DomainResult<ScheduledClass> {
  if (classes.some(({ classId }) => classId === input.classId)) {
    return invalid('A class with this ID already exists.', [
      { field: 'classId', message: 'Choose a unique class ID.' },
    ]);
  }
  const classType = classTypes.find(
    ({ classTypeId }) => classTypeId === input.classTypeId,
  );
  if (!classType) {
    return invalid('The selected class type could not be found.', [
      { field: 'classTypeId', message: 'Select an existing class type.' },
    ]);
  }
  const starts = parseSchedule(input.schedule);
  if (!starts) {
    return invalid('Enter a valid local date, time, and IANA timezone.', [
      { field: 'schedule', message: 'Check the local class date and time.' },
    ]);
  }
  const scheduledClass = toClass(
    input.classId,
    input.schedule,
    starts,
    classType,
    input.coachId,
  );
  const conflict = classes
    .filter((existing) => existing.status !== 'cancelled')
    .find((existing) => overlaps(scheduledClass, existing));
  if (conflict) {
    return scheduleConflict(conflict.classId, scheduledClass.classId);
  }
  return success(scheduledClass);
}

function findClass(
  classes: readonly ScheduledClass[],
  classId: ClassId,
): ScheduledClass | undefined {
  return classes.find((scheduledClass) => scheduledClass.classId === classId);
}

export function editScheduledClass(
  classes: readonly ScheduledClass[],
  classId: ClassId,
  updates: ScheduledClassUpdate,
  classTypes: readonly ClassType[],
): DomainResult<ScheduledClassEdit> {
  const existing = findClass(classes, classId);
  if (!existing) {
    return invalid('The scheduled class could not be found.', [
      { field: 'classId', message: 'Select an existing class.' },
    ]);
  }
  if (existing.status === 'cancelled' || existing.status === 'completed') {
    return invalid('Cancelled or completed classes cannot be edited.', [
      { field: 'classId', message: 'Select a draft or published class.' },
    ]);
  }
  if (existing.status === 'published' && updates.classTypeId !== undefined) {
    return invalid('A published class type cannot be changed.', [
      {
        field: 'classTypeId',
        message: 'Edit class types on draft classes only.',
      },
    ]);
  }

  const nextSchedule = updates.schedule ?? existing.schedule;
  if (nextSchedule.timezone !== existing.schedule.timezone) {
    return invalid('A class timezone cannot be changed during an edit.', [
      {
        field: 'schedule.timezone',
        message: 'Keep the configured gym timezone.',
      },
    ]);
  }
  const starts = updates.schedule ? parseSchedule(nextSchedule) : undefined;
  if (updates.schedule && !starts) {
    return invalid('Enter a valid local date and time.', [
      { field: 'schedule', message: 'Check the local class date and time.' },
    ]);
  }
  const classType = updates.classTypeId
    ? classTypes.find(({ classTypeId }) => classTypeId === updates.classTypeId)
    : existing.classTypeSnapshot;
  if (!classType) {
    return invalid('The selected class type could not be found.', [
      { field: 'classTypeId', message: 'Select an existing class type.' },
    ]);
  }
  const { coachId: currentCoachId, ...classWithoutCoach } = existing;
  const nextCoachId =
    updates.coachId === null
      ? undefined
      : updates.coachId === undefined
        ? currentCoachId
        : updates.coachId;
  const scheduledClass: ScheduledClass = {
    ...classWithoutCoach,
    schedule: nextSchedule,
    startsAt: starts ? toUtcInstant(starts) : existing.startsAt,
    endsAt: starts
      ? toUtcInstant(starts.plus({ minutes: classType.durationMinutes }))
      : updates.classTypeId
        ? toUtcInstant(
            DateTime.fromISO(existing.startsAt, { setZone: true }).plus({
              minutes: classType.durationMinutes,
            }),
          )
        : existing.endsAt,
    ...(nextCoachId ? { coachId: nextCoachId } : {}),
    classTypeSnapshot: { ...classType },
  };
  const conflict = classes
    .filter((item) => item.classId !== classId && item.status !== 'cancelled')
    .find((item) => overlaps(scheduledClass, item));
  if (conflict) {
    return scheduleConflict(conflict.classId, scheduledClass.classId);
  }

  const changes: ClassChange[] = [];
  if (nextSchedule.date !== existing.schedule.date) {
    changes.push('date');
  }
  if (nextSchedule.time !== existing.schedule.time) {
    changes.push('startTime');
  }
  if (nextCoachId !== currentCoachId) {
    changes.push('coach');
  }
  const editedClass: ScheduledClass = {
    ...scheduledClass,
    lateCancelWaived:
      existing.lateCancelWaived ||
      (existing.status === 'published' && changes.includes('startTime')),
  };
  const notification: NotificationEvent | undefined =
    existing.status === 'published' && changes.length > 0
      ? { type: 'classChanged', classId, changes }
      : undefined;
  return success({
    scheduledClass: editedClass,
    ...(notification ? { notification } : {}),
  });
}

export function deleteDraftClass(
  classes: readonly ScheduledClass[],
  classId: ClassId,
): DomainResult<readonly ScheduledClass[]> {
  const scheduledClass = findClass(classes, classId);
  if (!scheduledClass) {
    return invalid('The scheduled class could not be found.', [
      { field: 'classId', message: 'Select an existing class.' },
    ]);
  }
  if (scheduledClass.status !== 'draft') {
    return invalid('Only draft classes can be deleted.', [
      {
        field: 'classId',
        message: 'Published classes remain in schedule history.',
      },
    ]);
  }
  return success(classes.filter((item) => item.classId !== classId));
}

function validateSelectedDrafts(
  classes: readonly ScheduledClass[],
  classIds: readonly ClassId[],
): DomainResult<readonly ScheduledClass[]> {
  if (classIds.length === 0) {
    return invalid('Select at least one class.', [
      { field: 'classIds', message: 'Select one or more classes.' },
    ]);
  }
  if (new Set(classIds).size !== classIds.length) {
    return invalid('A class can only appear once in the selection.', [
      { field: 'classIds', message: 'Remove duplicate class IDs.' },
    ]);
  }
  const selected: ScheduledClass[] = [];
  for (const classId of classIds) {
    const scheduledClass = findClass(classes, classId);
    if (!scheduledClass) {
      return invalid('A selected class could not be found.', [
        { field: 'classIds', message: `Class ${classId} was not found.` },
      ]);
    }
    if (scheduledClass.status !== 'draft') {
      return invalid('Only draft classes can be published.', [
        { field: 'classIds', message: `Class ${classId} is not a draft.` },
      ]);
    }
    selected.push(scheduledClass);
  }
  return success(selected);
}

/** Requires current stations; zero in-service capacity rejects the entire batch. */
export function publishClasses(
  classes: readonly ScheduledClass[],
  classIds: readonly ClassId[],
  publishedAt: UtcInstant,
  targetGapMinutes: number,
  capacityState: Pick<DemoState, 'stations'>,
): DomainResult<PublishedClassBatch> {
  const selected = validateSelectedDrafts(classes, classIds);
  if (!selected.success) {
    return selected;
  }
  if (!validateUtcInstant(publishedAt)) {
    return invalid('Enter a valid UTC publication time.', [
      { field: 'publishedAt', message: 'Use a UTC instant ending in Z.' },
    ]);
  }
  if (!isValidTargetGap(targetGapMinutes)) {
    return invalid('The target class gap must be a non-negative number.', [
      {
        field: 'targetGapMinutes',
        message: 'Enter zero or a positive number.',
      },
    ]);
  }
  const capacity = validateClassCapacity(capacityState, classIds[0]);
  if (!capacity.success) {
    return capacity;
  }

  const selectedIds = new Set(classIds);
  const selectedClasses = selected.value;
  const activeOtherClasses = classes.filter(
    (scheduledClass) =>
      scheduledClass.status !== 'cancelled' &&
      !selectedIds.has(scheduledClass.classId),
  );
  const proposed: ScheduledClass[] = [];
  for (const candidate of selectedClasses) {
    const conflict = [...activeOtherClasses, ...proposed].find((existing) =>
      overlaps(candidate, existing),
    );
    if (conflict) {
      return scheduleConflict(conflict.classId, candidate.classId);
    }
    proposed.push(candidate);
  }

  const published = proposed.map((scheduledClass): ScheduledClass => ({
    ...scheduledClass,
    status: 'published',
    publishedAt,
  }));
  const warnings = shortGapWarnings(
    [...activeOtherClasses, ...published],
    targetGapMinutes,
    selectedIds,
  );
  return success({ classes: published, warnings });
}

export function releaseClasses(
  classes: readonly ScheduledClass[],
  classIds: readonly ClassId[],
  releasedAt: UtcInstant,
): DomainResult<readonly ScheduledClass[]> {
  if (classIds.length === 0 || new Set(classIds).size !== classIds.length) {
    return invalid('Select one or more unique classes to release.', [
      { field: 'classIds', message: 'Select one or more unique classes.' },
    ]);
  }
  if (!validateUtcInstant(releasedAt)) {
    return invalid('Enter a valid UTC release time.', [
      { field: 'releasedAt', message: 'Use a UTC instant ending in Z.' },
    ]);
  }
  const selected: ScheduledClass[] = [];
  for (const classId of classIds) {
    const scheduledClass = findClass(classes, classId);
    if (!scheduledClass || scheduledClass.status !== 'published') {
      return invalid('Only existing published classes can be released.', [
        { field: 'classIds', message: `Class ${classId} is not published.` },
      ]);
    }
    selected.push({ ...scheduledClass, releasedAt });
  }
  const selectedById = new Map(
    selected.map((scheduledClass) => [scheduledClass.classId, scheduledClass]),
  );
  return success(
    classes.map(
      (scheduledClass) =>
        selectedById.get(scheduledClass.classId) ?? scheduledClass,
    ),
  );
}

export function selectReleasedClasses(
  classes: readonly ScheduledClass[],
  policy: ScheduleReleasePolicy,
  now: UtcInstant,
): DomainResult<readonly ScheduledClass[]> {
  if (!validateUtcInstant(now)) {
    return invalid('Enter a valid UTC selection time.', [
      { field: 'now', message: 'Use a UTC instant ending in Z.' },
    ]);
  }
  if (
    policy.mode === 'rolling' &&
    (!Number.isFinite(policy.advanceMinutes) || policy.advanceMinutes < 0)
  ) {
    return invalid('The rolling release window must be non-negative.', [
      { field: 'advanceMinutes', message: 'Enter zero or a positive number.' },
    ]);
  }
  const nowMillis = instantMillis(now);
  const latestRollingStart =
    policy.mode === 'rolling'
      ? DateTime.fromISO(now, { setZone: true })
          .plus({ minutes: policy.advanceMinutes })
          .toMillis()
      : Number.POSITIVE_INFINITY;
  return success(
    classes.filter((scheduledClass) => {
      if (scheduledClass.status !== 'published') {
        return false;
      }
      if (policy.mode === 'immediate') {
        return true;
      }
      if (policy.mode === 'rolling') {
        return instantMillis(scheduledClass.startsAt) <= latestRollingStart;
      }
      if (!scheduledClass.releasedAt) {
        return false;
      }
      return instantMillis(scheduledClass.releasedAt) <= nowMillis;
    }),
  );
}

export function cancelClass(
  classes: readonly ScheduledClass[],
  classId: ClassId,
  reason: string,
  cancelledAt: UtcInstant,
): DomainResult<ScheduledClassEdit> {
  const scheduledClass = findClass(classes, classId);
  if (!scheduledClass || scheduledClass.status !== 'published') {
    return invalid('Only existing published classes can be cancelled.', [
      { field: 'classId', message: 'Select a published class.' },
    ]);
  }
  if (!reason.trim()) {
    return invalid('Enter a cancellation reason.', [
      { field: 'reason', message: 'Explain why the class is cancelled.' },
    ]);
  }
  if (!validateUtcInstant(cancelledAt)) {
    return invalid('Enter a valid UTC cancellation time.', [
      { field: 'cancelledAt', message: 'Use a UTC instant ending in Z.' },
    ]);
  }
  return success({
    scheduledClass: {
      ...scheduledClass,
      status: 'cancelled',
      cancelledAt,
      cancellationReason: reason.trim(),
    },
    notification: { type: 'classCancelled', classId },
  });
}

export function completeClass(
  classes: readonly ScheduledClass[],
  classId: ClassId,
  completedAt: UtcInstant,
): DomainResult<ScheduledClass> {
  const scheduledClass = findClass(classes, classId);
  if (!scheduledClass || scheduledClass.status !== 'published') {
    return invalid('Only existing published classes can be completed.', [
      { field: 'classId', message: 'Select a published class.' },
    ]);
  }
  if (!validateUtcInstant(completedAt)) {
    return invalid('Enter a valid UTC completion time.', [
      { field: 'completedAt', message: 'Use a UTC instant ending in Z.' },
    ]);
  }
  if (instantMillis(completedAt) < instantMillis(scheduledClass.endsAt)) {
    return invalid('A class cannot complete before its scheduled end.', [
      { field: 'completedAt', message: 'Wait until the class end time.' },
    ]);
  }
  return success({ ...scheduledClass, status: 'completed', completedAt });
}
