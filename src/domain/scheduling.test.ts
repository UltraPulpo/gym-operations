import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type {
  ClassType,
  DomainResult,
  IanaTimeZone,
  LocalDate,
  LocalSchedule,
  LocalTime,
  ScheduledClass,
  Station,
  TemplateEntry,
  UtcInstant,
  WeeklyTemplate,
} from './types';
import {
  applyWeeklyTemplate,
  cancelClass,
  completeClass,
  createDraftClass,
  createWeeklyTemplate,
  deleteDraftClass,
  deleteWeeklyTemplate,
  editScheduledClass,
  publishClasses,
  releaseClasses,
  selectReleasedClasses,
  updateWeeklyTemplate,
} from './scheduling';

const timezone: IanaTimeZone = 'America/Los_Angeles';
const classType: ClassType = {
  classTypeId: 'classType:rowing',
  name: 'Illustrative Rowing',
  durationMinutes: 30,
  description: 'Fictional class.',
  difficulty: 'Beginner',
};
const classTypes = [classType];
const now: UtcInstant = '2026-02-01T08:00:00Z';
const station: Station = {
  stationId: 'station:one',
  label: 'Station One',
  pm5Serial: null,
  inService: true,
  row: 0,
  column: 0,
};
const capacityState = { stations: [station] };

function localSchedule(
  date: LocalDate,
  time: LocalTime,
  zone: IanaTimeZone = timezone,
): LocalSchedule {
  return { date, time, timezone: zone };
}

function at(date: LocalDate, time: LocalTime): UtcInstant {
  const instant = DateTime.fromISO(`${date}T${time}`, { zone: timezone });
  return instant.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'") as UtcInstant;
}

function makeClass(
  classId: ScheduledClass['classId'],
  date: LocalDate,
  time: LocalTime,
  options: {
    durationMinutes?: 30 | 45 | 60;
    status?: ScheduledClass['status'];
    coachId?: ScheduledClass['coachId'];
    timezone?: IanaTimeZone;
    releasedAt?: UtcInstant;
    lateCancelWaived?: boolean;
  } = {},
): ScheduledClass {
  const durationMinutes = options.durationMinutes ?? 30;
  const zone = options.timezone ?? timezone;
  const starts = DateTime.fromISO(`${date}T${time}`, { zone });
  return {
    classId,
    schedule: localSchedule(date, time, zone),
    startsAt: starts.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'") as UtcInstant,
    endsAt: starts
      .plus({ minutes: durationMinutes })
      .toUTC()
      .toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'") as UtcInstant,
    status: options.status ?? 'draft',
    ...(options.coachId ? { coachId: options.coachId } : {}),
    classTypeSnapshot: classType,
    ...(options.releasedAt ? { releasedAt: options.releasedAt } : {}),
    ...(options.status === 'published' ? { publishedAt: now } : {}),
    lateCancelWaived: options.lateCancelWaived ?? false,
    reviewFlags: [],
  };
}

function entry(
  entryId: string,
  weekday: TemplateEntry['weekday'],
  localTime: LocalTime,
): TemplateEntry {
  return {
    entryId: `templateEntry:${entryId}`,
    weekday,
    localTime,
    classTypeId: classType.classTypeId,
  };
}

function template(entries: readonly TemplateEntry[]): WeeklyTemplate {
  return { templateId: 'template:weekly', name: 'Illustrative week', entries };
}

function valueOf<T>(result: DomainResult<T>): T {
  if (!result.success) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (!item) {
    throw new Error('Expected at least one item.');
  }
  return item;
}

describe('weekly template management', () => {
  it('creates, updates, and deletes templates without mutating the source collection', () => {
    const first = template([entry('monday', 1, '08:00')]);
    const created = valueOf(createWeeklyTemplate([], first));
    expect(created).toEqual([first]);

    const updated = valueOf(
      updateWeeklyTemplate(created, first.templateId, {
        name: 'Updated week',
        entries: [entry('tuesday', 2, '09:30')],
      }),
    );
    expect(updated[0]).toEqual({
      ...first,
      name: 'Updated week',
      entries: [entry('tuesday', 2, '09:30')],
    });
    expect(created[0]).toEqual(first);
    expect(valueOf(deleteWeeklyTemplate(updated, first.templateId))).toEqual(
      [],
    );
  });

  it('rejects duplicate template ids, empty names, and invalid entry times', () => {
    const first = template([entry('monday', 1, '08:00')]);
    expect(createWeeklyTemplate([first], first).success).toBe(false);
    expect(createWeeklyTemplate([], { ...first, name: '   ' }).success).toBe(
      false,
    );
    expect(
      createWeeklyTemplate([], {
        ...first,
        entries: [entry('bad-time', 1, '25:30')],
      }).success,
    ).toBe(false);
  });

  it('rejects edits and deletes for unknown templates', () => {
    expect(
      updateWeeklyTemplate([], 'template:missing', { name: 'Missing' }).success,
    ).toBe(false);
    expect(deleteWeeklyTemplate([], 'template:missing').success).toBe(false);
  });
});

describe('weekly template expansion', () => {
  it('keeps the configured local wall time while UTC offsets change at daylight saving boundaries', () => {
    const weekly = template([entry('sunday', 7, '06:30')]);
    const beforeSpring = valueOf(
      applyWeeklyTemplate({
        template: weekly,
        weekStartsOn: '2026-02-23',
        timezone,
        classTypes,
        classes: [],
        targetGapMinutes: 30,
      }),
    );
    const afterSpring = valueOf(
      applyWeeklyTemplate({
        template: weekly,
        weekStartsOn: '2026-03-02',
        timezone,
        classTypes,
        classes: [],
        targetGapMinutes: 30,
      }),
    );
    const beforeFall = valueOf(
      applyWeeklyTemplate({
        template: weekly,
        weekStartsOn: '2026-10-19',
        timezone,
        classTypes,
        classes: [],
        targetGapMinutes: 30,
      }),
    );
    const afterFall = valueOf(
      applyWeeklyTemplate({
        template: weekly,
        weekStartsOn: '2026-10-26',
        timezone,
        classTypes,
        classes: [],
        targetGapMinutes: 30,
      }),
    );
    const beforeSpringClass = first(beforeSpring.classes);
    const afterSpringClass = first(afterSpring.classes);
    const beforeFallClass = first(beforeFall.classes);
    const afterFallClass = first(afterFall.classes);

    expect(beforeSpringClass.schedule).toEqual(
      localSchedule('2026-03-01', '06:30'),
    );
    expect(afterSpringClass.schedule).toEqual(
      localSchedule('2026-03-08', '06:30'),
    );
    expect(beforeSpringClass.startsAt).toBe('2026-03-01T14:30:00Z');
    expect(afterSpringClass.startsAt).toBe('2026-03-08T13:30:00Z');
    expect(beforeFallClass.startsAt).toBe('2026-10-25T13:30:00Z');
    expect(afterFallClass.schedule).toEqual(
      localSchedule('2026-11-01', '06:30'),
    );
    expect(afterFallClass.startsAt).toBe('2026-11-01T14:30:00Z');
    expect(afterSpringClass.status).toBe('draft');
    expect(afterSpringClass.coachId).toBeUndefined();
  });

  it('supports applying alternating weekly templates to separate weeks', () => {
    const mondayTemplate = template([entry('early', 1, '07:00')]);
    const eveningTemplate: WeeklyTemplate = {
      templateId: 'template:alternate',
      name: 'Alternate week',
      entries: [entry('late', 3, '18:00')],
    };
    const early = valueOf(
      applyWeeklyTemplate({
        template: mondayTemplate,
        weekStartsOn: '2026-04-06',
        timezone,
        classTypes,
        classes: [],
        targetGapMinutes: 30,
      }),
    );
    const late = valueOf(
      applyWeeklyTemplate({
        template: eveningTemplate,
        weekStartsOn: '2026-04-20',
        timezone,
        classTypes,
        classes: early.classes,
        targetGapMinutes: 30,
      }),
    );
    expect(first(early.classes).schedule.date).toBe('2026-04-06');
    expect(first(late.classes).schedule).toEqual(
      localSchedule('2026-04-22', '18:00'),
    );
    expect(first(late.classes).status).toBe('draft');
  });

  it('skips exact existing duplicates while leaving existing classes unchanged', () => {
    const duplicate = makeClass('class:existing', '2026-04-06', '08:00');
    const result = valueOf(
      applyWeeklyTemplate({
        template: template([entry('monday', 1, '08:00')]),
        weekStartsOn: '2026-04-06',
        timezone,
        classTypes,
        classes: [duplicate],
        targetGapMinutes: 30,
      }),
    );
    expect(result.classes).toEqual([]);
    expect(result.skippedDuplicates).toEqual(['class:existing']);
    expect(duplicate.status).toBe('draft');
  });

  it('allocates deterministic distinct occurrences after editing an applied entry and skips unchanged reapplications', () => {
    const weekly = template([entry('tuesday', 2, '10:00')]);
    const input = {
      template: weekly,
      weekStartsOn: '2026-11-16' as const,
      timezone,
      classTypes,
      classes: [],
      targetGapMinutes: 30,
    };
    const original = valueOf(applyWeeklyTemplate(input)).classes;
    const before = structuredClone(original);
    const edited = first(
      valueOf(
        updateWeeklyTemplate([weekly], weekly.templateId, {
          entries: [entry('tuesday', 2, '10:30')],
        }),
      ),
    );
    const reapplication = { ...input, template: edited, classes: original };
    const result = valueOf(applyWeeklyTemplate(reapplication));
    const occurrence = first(result.classes);

    expect(occurrence.classId).toBe(`${first(original).classId}:occurrence:2`);
    expect(occurrence.schedule).toEqual(localSchedule('2026-11-17', '10:30'));
    expect(occurrence.status).toBe('draft');
    expect(result.skippedDuplicates).toEqual([]);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        earlierClassId: first(original).classId,
        laterClassId: occurrence.classId,
        actualGapMinutes: 0,
      }),
    ]);
    expect(applyWeeklyTemplate(reapplication)).toEqual({
      success: true,
      value: result,
    });
    expect(original).toEqual(before);

    const retained = [...original, occurrence];
    const duplicate = valueOf(
      applyWeeklyTemplate({ ...reapplication, classes: retained }),
    );
    expect(duplicate).toEqual({
      classes: [],
      skippedDuplicates: [occurrence.classId],
      warnings: [],
    });
    expect(
      valueOf(applyWeeklyTemplate({ ...input, classes: retained })),
    ).toEqual({
      classes: [],
      skippedDuplicates: [first(original).classId],
      warnings: [],
    });
    expect(retained[0]).toBe(original[0]);
    expect(original).toEqual(before);
  });

  it('rejects all edited occurrences on a real overlap rather than an ID collision', () => {
    const weekly = template([
      entry('tuesday', 2, '10:00'),
      entry('thursday', 4, '10:00'),
    ]);
    const input = {
      template: weekly,
      weekStartsOn: '2026-11-16' as const,
      timezone,
      classTypes,
      classes: [],
      targetGapMinutes: 30,
    };
    const original = valueOf(applyWeeklyTemplate(input)).classes;
    const before = structuredClone(original);
    const edited = first(
      valueOf(
        updateWeeklyTemplate([weekly], weekly.templateId, {
          entries: [
            entry('tuesday', 2, '10:30'),
            entry('thursday', 4, '10:15'),
          ],
        }),
      ),
    );
    const result = applyWeeklyTemplate({
      ...input,
      template: edited,
      classes: original,
    });
    expect(result).toMatchObject({
      success: false,
      error: {
        category: 'DemoConflict',
        message: 'The proposed class overlaps another scheduled class.',
        conflict: {
          kind: 'schedule',
          classIds: [original[1]?.classId, expect.any(String)],
        },
      },
    });
    if (!result.success && result.error.category === 'DemoConflict') {
      if (result.error.conflict.kind === 'schedule') {
        expect(result.error.conflict.classIds[1]).not.toBe(
          original[1]?.classId,
        );
      }
    }
    expect(original).toEqual(before);
  });

  it('reserves generated IDs against retained cancelled occurrences and other proposals', () => {
    const weekly = template([
      entry('tuesday', 2, '10:00'),
      entry('thursday', 4, '10:00'),
    ]);
    const input = {
      template: weekly,
      weekStartsOn: '2026-11-16' as const,
      timezone,
      classTypes,
      classes: [],
      targetGapMinutes: 30,
    };
    const original = valueOf(applyWeeklyTemplate(input)).classes;
    const baseId = first(original).classId;
    const retained: ScheduledClass[] = [
      { ...first(original), status: 'cancelled' },
      {
        ...first(original),
        classId: `${baseId}:occurrence:2`,
        status: 'cancelled',
      },
      {
        ...first(original),
        classId: `${baseId}:occurrence:4`,
        status: 'cancelled',
      },
    ];
    const before = structuredClone(retained);
    const result = valueOf(
      applyWeeklyTemplate({ ...input, classes: retained }),
    );
    expect(first(result.classes).classId).toBe(`${baseId}:occurrence:3`);
    expect(result.classes[1]?.classId).toBe(original[1]?.classId);
    expect(
      new Set([...retained, ...result.classes].map((item) => item.classId))
        .size,
    ).toBe(retained.length + result.classes.length);
    expect(retained).toEqual(before);
  });

  it('rejects the complete proposal when any proposed class overlaps', () => {
    const result = applyWeeklyTemplate({
      template: template([
        entry('first', 1, '08:00'),
        entry('overlapping', 1, '08:15'),
      ]),
      weekStartsOn: '2026-04-06',
      timezone,
      classTypes,
      classes: [],
      targetGapMinutes: 30,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.category).toBe('DemoConflict');
      if (result.error.category === 'DemoConflict') {
        expect(result.error.conflict.kind).toBe('schedule');
        if (result.error.conflict.kind === 'schedule') {
          expect(result.error.conflict.classIds).toHaveLength(2);
        }
      }
    }
  });

  it('rejects a proposal that overlaps an existing class by resolved UTC time', () => {
    const existing = makeClass('class:eastern', '2026-04-06', '11:00', {
      timezone: 'America/New_York',
    });
    const result = applyWeeklyTemplate({
      template: template([entry('west-coast', 1, '08:00')]),
      weekStartsOn: '2026-04-06',
      timezone,
      classTypes,
      classes: [existing],
      targetGapMinutes: 30,
    });
    expect(existing.startsAt).toBe('2026-04-06T15:00:00Z');
    expect(result.success).toBe(false);
    if (!result.success && result.error.category === 'DemoConflict') {
      expect(result.error.conflict).toMatchObject({
        kind: 'schedule',
        classIds: ['class:eastern', expect.stringContaining('class:template:')],
      });
    }
  });

  it('reports short-gap warnings including a zero-minute gap without shifting times', () => {
    const result = valueOf(
      applyWeeklyTemplate({
        template: template([
          entry('first', 1, '08:00'),
          entry('zero-gap', 1, '08:30'),
          entry('short-gap', 1, '09:10'),
        ]),
        weekStartsOn: '2026-04-06',
        timezone,
        classTypes,
        classes: [],
        targetGapMinutes: 30,
      }),
    );
    expect(
      result.warnings.map(({ actualGapMinutes }) => actualGapMinutes),
    ).toEqual([0, 10]);
    expect(result.classes.map(({ schedule }) => schedule.time)).toEqual([
      '08:00',
      '08:30',
      '09:10',
    ]);
  });

  it('rejects an invalid week start, timezone, or missing class type', () => {
    const weekly = template([entry('monday', 1, '08:00')]);
    expect(
      applyWeeklyTemplate({
        template: weekly,
        weekStartsOn: '2026-04-07',
        timezone,
        classTypes,
        classes: [],
        targetGapMinutes: 30,
      }).success,
    ).toBe(false);
    expect(
      applyWeeklyTemplate({
        template: weekly,
        weekStartsOn: '2026-04-06',
        timezone: 'Mars/Olympus',
        classTypes,
        classes: [],
        targetGapMinutes: 30,
      }).success,
    ).toBe(false);
    expect(
      applyWeeklyTemplate({
        template: weekly,
        weekStartsOn: '2026-04-06',
        timezone,
        classTypes: [],
        classes: [],
        targetGapMinutes: 30,
      }).success,
    ).toBe(false);
  });
});

describe('class scheduling and lifecycle', () => {
  it('creates draft classes with a class-type snapshot and optional coach', () => {
    const draft = valueOf(
      createDraftClass(
        {
          classId: 'class:new',
          schedule: localSchedule('2026-04-06', '08:00'),
          classTypeId: classType.classTypeId,
        },
        classTypes,
        [],
      ),
    );
    expect(draft.status).toBe('draft');
    expect(draft.startsAt).toBe(at('2026-04-06', '08:00'));
    expect(draft.coachId).toBeUndefined();
    expect(draft.classTypeSnapshot).toEqual(classType);
    const coachedDraft = valueOf(
      createDraftClass(
        {
          classId: 'class:coached',
          schedule: localSchedule('2026-04-06', '10:00'),
          classTypeId: classType.classTypeId,
          coachId: 'staff:coach',
        },
        classTypes,
        [draft],
      ),
    );
    expect(coachedDraft.coachId).toBe('staff:coach');
    expect(
      createDraftClass(
        {
          classId: 'class:conflict',
          schedule: localSchedule('2026-04-06', '08:15'),
          classTypeId: classType.classTypeId,
          coachId: 'staff:coach',
        },
        classTypes,
        [draft],
      ).success,
    ).toBe(false);
  });

  it('edits and deletes drafts while rejecting deletion of published classes', () => {
    const draft = makeClass('class:draft', '2026-04-06', '08:00');
    const edited = valueOf(
      editScheduledClass(
        [draft],
        draft.classId,
        {
          schedule: localSchedule('2026-04-06', '09:00'),
          coachId: 'staff:coach',
        },
        classTypes,
      ),
    );
    expect(edited.scheduledClass.schedule.time).toBe('09:00');
    expect(edited.scheduledClass.coachId).toBe('staff:coach');
    expect(edited.notification).toBeUndefined();
    expect(valueOf(deleteDraftClass([draft], draft.classId))).toEqual([]);
    expect(
      deleteDraftClass(
        [
          makeClass('class:published', '2026-04-06', '08:00', {
            status: 'published',
          }),
        ],
        'class:published',
      ).success,
    ).toBe(false);
  });

  it('publishes multiple draft classes together and rejects the batch on overlap', () => {
    const first = makeClass('class:first', '2026-04-06', '08:00');
    const second = makeClass('class:second', '2026-04-06', '09:00');
    const published = valueOf(
      publishClasses(
        [first, second],
        [first.classId, second.classId],
        now,
        30,
        capacityState,
      ),
    );
    expect(published.classes.map(({ status }) => status)).toEqual([
      'published',
      'published',
    ]);
    expect(published.classes.map(({ publishedAt }) => publishedAt)).toEqual([
      now,
      now,
    ]);

    const overlapping = makeClass('class:overlap', '2026-04-06', '08:15');
    const failed = publishClasses(
      [first, overlapping],
      [first.classId, overlapping.classId],
      now,
      30,
      capacityState,
    );
    expect(failed.success).toBe(false);
    expect(first.status).toBe('draft');
    expect(overlapping.status).toBe('draft');
  });

  it.each([
    { service: 'no stations', stations: [], batch: false },
    { service: 'no stations', stations: [], batch: true },
    {
      service: 'only out-of-service stations',
      stations: [{ ...station, inService: false }],
      batch: false,
    },
    {
      service: 'only out-of-service stations',
      stations: [{ ...station, inService: false }],
      batch: true,
    },
  ])(
    'rejects publication with $service (batch: $batch) without changing inputs',
    ({ stations, batch }) => {
      const first = makeClass('class:first', '2026-04-06', '08:00');
      const second = makeClass('class:second', '2026-04-06', '09:00');
      const classes = [first, second];
      const capacity = { stations };
      const originalClasses = structuredClone(classes);
      const originalCapacity = structuredClone(capacity);

      const classIds = batch
        ? [first.classId, second.classId]
        : [first.classId];
      expect(publishClasses(classes, classIds, now, 30, capacity)).toEqual({
        success: false,
        error: {
          category: 'IneligibleDemoAction',
          reason: 'zeroCapacity',
          message:
            'No stations are in service. Classes cannot be published or booked.',
          classId: first.classId,
        },
      });
      expect(classes).toEqual(originalClasses);
      expect(capacity).toEqual(originalCapacity);
    },
  );

  it('publishes a full batch with one in-service station despite out-of-service stations', () => {
    const classes = [
      makeClass('class:first', '2026-04-06', '08:00'),
      makeClass('class:second', '2026-04-06', '08:30'),
    ];
    const capacity = {
      stations: [
        station,
        { ...station, stationId: 'station:offline' as const, inService: false },
      ],
    };
    const originalClasses = structuredClone(classes);
    const originalCapacity = structuredClone(capacity);
    const published = valueOf(
      publishClasses(
        classes,
        classes.map(({ classId }) => classId),
        now,
        30,
        capacity,
      ),
    );

    expect(published.classes).toEqual(
      classes.map((scheduledClass) => ({
        ...scheduledClass,
        status: 'published',
        publishedAt: now,
      })),
    );
    expect(published.warnings).toEqual([
      {
        category: 'shortGap',
        earlierClassId: 'class:first',
        laterClassId: 'class:second',
        actualGapMinutes: 0,
        targetGapMinutes: 30,
        message: 'There is only a 0-minute gap between classes.',
      },
    ]);
    expect(classes).toEqual(originalClasses);
    expect(capacity).toEqual(originalCapacity);
  });

  it('notifies booked members of published date, start-time, and coach changes', () => {
    const published = makeClass('class:published', '2026-04-06', '08:00', {
      status: 'published',
    });
    const changed = valueOf(
      editScheduledClass(
        [published],
        published.classId,
        {
          schedule: localSchedule('2026-04-07', '09:00'),
          coachId: 'staff:coach',
        },
        classTypes,
      ),
    );
    expect(changed.notification).toEqual({
      type: 'classChanged',
      classId: published.classId,
      changes: ['date', 'startTime', 'coach'],
    });
    expect(changed.scheduledClass.lateCancelWaived).toBe(true);
    expect(changed.scheduledClass.startsAt).toBe(at('2026-04-07', '09:00'));
  });

  it('does not waive late-cancel status for date-only or coach-only published edits', () => {
    const published = makeClass('class:published', '2026-04-06', '08:00', {
      status: 'published',
    });
    const dateOnly = valueOf(
      editScheduledClass(
        [published],
        published.classId,
        { schedule: localSchedule('2026-04-07', '08:00') },
        classTypes,
      ),
    );
    expect(dateOnly.notification).toEqual({
      type: 'classChanged',
      classId: published.classId,
      changes: ['date'],
    });
    expect(dateOnly.scheduledClass.lateCancelWaived).toBe(false);

    const coachOnly = valueOf(
      editScheduledClass(
        [published],
        published.classId,
        { coachId: 'staff:coach' },
        classTypes,
      ),
    );
    expect(coachOnly.notification).toEqual({
      type: 'classChanged',
      classId: published.classId,
      changes: ['coach'],
    });
    expect(coachOnly.scheduledClass.lateCancelWaived).toBe(false);
  });

  it('cancels published classes with a notification and completes only at or after end time', () => {
    const published = makeClass('class:published', '2026-04-06', '08:00', {
      status: 'published',
    });
    const cancelled = valueOf(
      cancelClass(
        [published],
        published.classId,
        'Instructor unavailable',
        now,
      ),
    );
    expect(cancelled.scheduledClass.status).toBe('cancelled');
    expect(cancelled.scheduledClass.cancellationReason).toBe(
      'Instructor unavailable',
    );
    expect(cancelled.scheduledClass.cancelledAt).toBe(now);
    expect(cancelled.notification).toEqual({
      type: 'classCancelled',
      classId: published.classId,
    });
    expect(completeClass([published], published.classId, now).success).toBe(
      false,
    );
    const completed = valueOf(
      completeClass([published], published.classId, published.endsAt),
    );
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBe(published.endsAt);
  });

  it('releases selected published classes and selects immediate, rolling, or manual visibility', () => {
    const immediate = makeClass('class:immediate', '2026-04-06', '08:00', {
      status: 'published',
    });
    const rollingInside = makeClass(
      'class:rolling-inside',
      '2026-04-06',
      '08:00',
      { status: 'published' },
    );
    const rollingOutside = makeClass(
      'class:rolling-outside',
      '2026-04-06',
      '09:00',
      { status: 'published' },
    );
    const manual = makeClass('class:manual', '2026-04-06', '08:00', {
      status: 'published',
    });
    const released = valueOf(releaseClasses([manual], [manual.classId], now));
    expect(first(released).releasedAt).toBe(now);
    expect(
      valueOf(
        selectReleasedClasses(
          [immediate],
          { mode: 'immediate' },
          '2026-04-06T14:00:00Z',
        ),
      ),
    ).toEqual([immediate]);
    expect(
      valueOf(
        selectReleasedClasses(
          [rollingInside, rollingOutside],
          { mode: 'rolling', advanceMinutes: 60 },
          '2026-04-06T14:00:00Z',
        ),
      ).map(({ classId }) => classId),
    ).toEqual(['class:rolling-inside']);
    expect(
      valueOf(selectReleasedClasses([manual], { mode: 'manual' }, now)),
    ).toEqual([]);
    expect(
      valueOf(selectReleasedClasses(released, { mode: 'manual' }, now)),
    ).toEqual(released);
    expect(
      releaseClasses(
        [makeClass('class:draft', '2026-04-06', '08:00')],
        ['class:draft'],
        now,
      ).success,
    ).toBe(false);
  });
});
