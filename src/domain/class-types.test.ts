import { describe, expect, it } from 'vitest';
import type {
  ClassStatus,
  ClassType,
  DemoState,
  DomainResult,
  ScheduledClass,
} from './types';
import {
  createClassType,
  createClassTypeSnapshot,
  updateClassType,
  validateClassType,
} from './class-types';

const classType: ClassType = {
  classTypeId: 'classType:rowing',
  name: 'Demo rowing',
  durationMinutes: 45,
  description: 'Fictional rowing session.',
  difficulty: 'All levels',
};

function value<T>(result: DomainResult<T>): T {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.error.message);
  return result.value;
}

function expectInvalid<T>(result: DomainResult<T>, field: string): void {
  expect(result.success).toBe(false);
  if (result.success) throw new Error('Expected a validation failure.');
  expect(result.error.category).toBe('ValidationError');
  expect(result.error.message.trim()).not.toBe('');
  if (result.error.category !== 'ValidationError') {
    throw new Error('Expected field-level validation feedback.');
  }
  expect(result.error.fields).toEqual(
    expect.arrayContaining([{ field, message: expect.stringMatching(/\S/) }]),
  );
}

function freeze<T>(input: T): T {
  if (input !== null && typeof input === 'object') {
    Object.values(input).forEach(freeze);
    Object.freeze(input);
  }
  return input;
}

const otherType: ClassType = {
  ...classType,
  classTypeId: 'classType:other',
  name: 'Other demo class',
};

function scheduledClass(
  status: ClassStatus,
  period: 'past' | 'future',
): ScheduledClass {
  return {
    classId: `class:${period}-${status}`,
    schedule: {
      date: period === 'past' ? '2026-10-01' : '2026-10-03',
      time: '09:00',
      timezone: 'America/Los_Angeles',
    },
    startsAt:
      period === 'past' ? '2026-10-01T16:00:00Z' : '2026-10-03T16:00:00Z',
    endsAt: period === 'past' ? '2026-10-01T16:45:00Z' : '2026-10-03T16:45:00Z',
    status,
    classTypeSnapshot: classType,
    lateCancelWaived: false,
    reviewFlags: [],
  };
}

function state(overrides: Partial<DemoState> = {}): DemoState {
  const statuses: readonly ClassStatus[] = [
    'draft',
    'published',
    'cancelled',
    'completed',
  ];
  return {
    revision: 7,
    staffAccounts: [],
    members: [],
    invitations: [],
    waivers: [],
    currentWaiverVersionId: null,
    waiverSignatures: [],
    stations: [],
    retiredStations: [],
    layout: { availability: 'current' },
    classTypes: [classType, otherType],
    weeklyTemplates: [
      {
        templateId: 'template:rowing',
        name: 'Demo week',
        entries: [
          {
            entryId: 'templateEntry:rowing',
            weekday: 1,
            localTime: '09:00',
            classTypeId: classType.classTypeId,
          },
        ],
      },
    ],
    classes: statuses.flatMap((status) => [
      scheduledClass(status, 'past'),
      scheduledClass(status, 'future'),
    ]),
    bookings: [
      {
        bookingId: 'booking:demo',
        memberId: 'member:demo',
        classId: 'class:future-published',
        stationId: 'station:demo',
        bookedAt: '2026-10-02T16:00:00Z',
        attendanceRecordId: 'attendance:demo',
        reviewFlags: [],
        status: 'booked',
      },
    ],
    waitlistEntries: [],
    attendance: [],
    notifications: [],
    settings: {
      illustrative: true,
      timezone: 'America/Los_Angeles',
      memberCap: 10,
      invitationExpiryMinutes: 60,
      scheduleRelease: { mode: 'immediate' },
      targetGapMinutes: 30,
      waitlistCutoffMinutes: 30,
      lateCancelCutoffMinutes: 30,
      checkInLeadMinutes: 30,
      checkInGraceMinutes: 5,
    },
    activeActor: { kind: 'staff', staffId: 'staff:demo' },
    scenarioId: 'scenario:demo',
    clock: { now: '2026-10-02T16:00:00Z', presetId: null },
    simulation: { delivery: 'success', identity: 'verified' },
    ...overrides,
  };
}

function expectOnlyCatalogChanged(input: DemoState, next: DemoState): void {
  expect(next).not.toBe(input);
  expect(next.classTypes).not.toBe(input.classTypes);
  for (const key of Object.keys(input) as (keyof DemoState)[]) {
    if (key !== 'classTypes') expect(next[key]).toBe(input[key]);
  }
}

describe('class type validation', () => {
  it.each([30, 45, 60])('accepts a %i-minute class', (durationMinutes) => {
    const input = Object.freeze({ ...classType, durationMinutes });
    const validated = value(validateClassType(input));
    expect(validated).toEqual(input);
    expect(validated).not.toBe(input);
  });

  it.each([0, -30, 15, 31, 44, 46, 59, 61, 90, 45.5, NaN, Infinity])(
    'rejects an unsupported duration of %s',
    (durationMinutes) => {
      expectInvalid(
        validateClassType({ ...classType, durationMinutes }),
        'durationMinutes',
      );
    },
  );

  it.each(['name', 'description', 'difficulty'] as const)(
    'requires a nonblank %s',
    (field) => {
      for (const blank of ['', ' \t\n ']) {
        const input = Object.freeze({ ...classType, [field]: blank });
        expectInvalid(validateClassType(input), field);
        expect(input[field]).toBe(blank);
      }
    },
  );

  it('returns field feedback for all invalid required details', () => {
    const result = validateClassType({
      ...classType,
      name: '',
      description: '',
      difficulty: '',
      durationMinutes: 20,
    });
    expect(result.success).toBe(false);
    if (result.success || result.error.category !== 'ValidationError') {
      throw new Error('Expected field-level validation feedback.');
    }
    expect(result.error.fields.map(({ field }) => field)).toEqual([
      'name',
      'description',
      'difficulty',
      'durationMinutes',
    ]);
  });

  it('preserves optional alias and free-text what-to-bring details', () => {
    const input = Object.freeze({
      ...classType,
      alias: 'Row',
      whatToBring: 'Bring water.\nExpect an introductory warm-up.',
    });
    expect(value(validateClassType(input))).toEqual(input);
  });

  it('allows omitted or blank optional details without inventing defaults', () => {
    expect(value(validateClassType(classType))).toEqual(classType);
    const input = { ...classType, alias: '', whatToBring: '' };
    expect(value(validateClassType(input))).toEqual(input);
  });

  it('rejects missing required text rather than throwing', () => {
    // @ts-expect-error Unvalidated callers may omit a required field.
    expectInvalid(validateClassType({ ...classType, name: undefined }), 'name');
  });

  it('rejects non-text optional details rather than throwing', () => {
    expectInvalid(
      // @ts-expect-error Unvalidated callers may supply a non-text note.
      validateClassType({ ...classType, whatToBring: 42 }),
      'whatToBring',
    );
    // @ts-expect-error Unvalidated callers may supply a non-text alias.
    expectInvalid(validateClassType({ ...classType, alias: 42 }), 'alias');
  });
});

describe('class type creation', () => {
  it('adds a detached class type and leaves all other state untouched', () => {
    const input = freeze(state({ classTypes: [otherType] }));
    const proposed = Object.freeze({
      ...classType,
      alias: 'Row',
      whatToBring: 'Bring water.',
    });
    const next = value(createClassType(input, proposed));
    expectOnlyCatalogChanged(input, next);
    expect(next.classTypes).toEqual([otherType, proposed]);
    expect(next.classTypes[0]).toBe(otherType);
    expect(next.classTypes[1]).not.toBe(proposed);
    expect(input.classTypes).toEqual([otherType]);
  });

  it('rejects a duplicate ID without overwriting existing details', () => {
    const input = freeze(state());
    const before = structuredClone(input);
    expectInvalid(
      createClassType(input, { ...classType, name: 'Replacement' }),
      'classTypeId',
    );
    expect(input).toEqual(before);
  });

  it('allows separate stable IDs to share a display name', () => {
    const input = freeze(state());
    const proposed: ClassType = {
      ...classType,
      classTypeId: 'classType:another',
    };
    expect(value(createClassType(input, proposed)).classTypes).toEqual([
      ...input.classTypes,
      proposed,
    ]);
  });

  it('does not retain a mutable reference to caller-owned details', () => {
    const proposed = { ...classType };
    const next = value(createClassType(state({ classTypes: [] }), proposed));
    proposed.name = 'Changed outside the domain';
    expect(next.classTypes[0].name).toBe(classType.name);
  });
});

describe('class type updates and scheduled snapshots', () => {
  it('updates all catalog fields while preserving existing past and future classes', () => {
    const input = freeze(state());
    const before = structuredClone(input);
    const updates = Object.freeze({
      name: 'Updated demo rowing',
      durationMinutes: 60,
      description: 'Updated fictional session.',
      difficulty: 'Intermediate',
      alias: 'New row',
      whatToBring: 'Bring a towel.',
    });
    const next = value(updateClassType(input, classType.classTypeId, updates));
    expectOnlyCatalogChanged(input, next);
    expect(next.classTypes).toEqual([{ ...classType, ...updates }, otherType]);
    expect(next.classTypes[1]).toBe(input.classTypes[1]);
    expect(next.classes).toBe(input.classes);
    for (const scheduled of next.classes) {
      expect(scheduled.classTypeSnapshot).toBe(classType);
      expect(scheduled.classTypeSnapshot.durationMinutes).toBe(45);
      expect(scheduled.endsAt).toBe(
        scheduled.startsAt.replace('16:00:00', '16:45:00'),
      );
    }
    expect(input).toEqual(before);
  });

  it('merges partial edits without changing identity or omitted fields', () => {
    const input = freeze(state());
    const next = value(
      updateClassType(input, classType.classTypeId, { name: 'New name' }),
    );
    expect(next.classTypes[0]).toEqual({ ...classType, name: 'New name' });
    expect(next.classTypes[0].classTypeId).toBe(classType.classTypeId);
    expectOnlyCatalogChanged(input, next);
  });

  it('allows explicitly clearing optional fields', () => {
    const withNotes = { ...classType, alias: 'Row', whatToBring: 'Water' };
    const input = freeze(state({ classTypes: [withNotes] }));
    const next = value(
      updateClassType(input, classType.classTypeId, {
        alias: undefined,
        whatToBring: undefined,
      }),
    );
    expect(next.classTypes[0]).toStrictEqual(classType);
    expect(input.classTypes[0]).toEqual(withNotes);
  });

  it('accepts an empty edit without dropping details or optional notes', () => {
    const withNotes = { ...classType, alias: 'Row', whatToBring: 'Water' };
    const input = freeze(state({ classTypes: [withNotes] }));
    const next = value(updateClassType(input, classType.classTypeId, {}));
    expect(next.classTypes).toEqual([withNotes]);
    expectOnlyCatalogChanged(input, next);
  });

  it('uses edited details only for snapshots created after the edit', () => {
    const input = freeze(state());
    const original = value(
      createClassTypeSnapshot(input, classType.classTypeId),
    );
    const next = value(
      updateClassType(input, classType.classTypeId, {
        durationMinutes: 30,
        description: 'New fictional description.',
      }),
    );
    const future = value(createClassTypeSnapshot(next, classType.classTypeId));
    expect(original).toEqual(classType);
    expect(future).toEqual({
      ...classType,
      durationMinutes: 30,
      description: 'New fictional description.',
    });
    expect(original).not.toBe(future);
    expect(next.classes).toBe(input.classes);
    expect(next.weeklyTemplates).toBe(input.weeklyTemplates);
  });

  it('keeps snapshots unchanged through repeated edits', () => {
    const input = freeze(state());
    const firstEdit = value(
      updateClassType(input, classType.classTypeId, { durationMinutes: 30 }),
    );
    const firstSnapshot = value(
      createClassTypeSnapshot(firstEdit, classType.classTypeId),
    );
    const secondEdit = value(
      updateClassType(firstEdit, classType.classTypeId, {
        durationMinutes: 60,
        name: 'Later name',
      }),
    );
    expect(firstSnapshot).toEqual({ ...classType, durationMinutes: 30 });
    expect(
      value(createClassTypeSnapshot(secondEdit, classType.classTypeId)),
    ).toEqual({ ...classType, durationMinutes: 60, name: 'Later name' });
    expect(secondEdit.classes).toBe(input.classes);
  });
});

describe('class type snapshots', () => {
  it('creates independent immutable copies including optional member-facing details', () => {
    const withNotes = { ...classType, alias: 'Row', whatToBring: 'Water' };
    const input = state({ classTypes: [withNotes] });
    const before = structuredClone(input);
    const first = value(createClassTypeSnapshot(input, classType.classTypeId));
    const second = value(createClassTypeSnapshot(input, classType.classTypeId));
    expect(first).toEqual(withNotes);
    expect(first).not.toBe(withNotes);
    expect(second).not.toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(withNotes)).toBe(false);
    expect(Reflect.set(first, 'name', 'Attempted mutation')).toBe(false);
    expect(input).toEqual(before);
    withNotes.whatToBring = 'Changed outside the domain';
    expect(first.whatToBring).toBe('Water');
  });

  it('reports invalid catalog details rather than copying an invalid snapshot', () => {
    const input = freeze(
      state({ classTypes: [{ ...classType, description: '' }] }),
    );
    const before = structuredClone(input);
    expectInvalid(
      createClassTypeSnapshot(input, classType.classTypeId),
      'description',
    );
    expect(input).toEqual(before);
  });
});

describe('rejected class type transitions', () => {
  it.each([
    { field: 'name', updates: { name: '' } },
    { field: 'description', updates: { description: ' \t\n ' } },
    { field: 'difficulty', updates: { difficulty: '' } },
    { field: 'durationMinutes', updates: { durationMinutes: 20 } },
    { field: 'durationMinutes', updates: { durationMinutes: NaN } },
    { field: 'durationMinutes', updates: { durationMinutes: Infinity } },
  ])(
    'rejects invalid $field on create and update without state changes',
    ({ field, updates }) => {
      const input = freeze(state());
      const before = structuredClone(input);
      const proposed = Object.freeze({
        ...classType,
        ...updates,
        classTypeId: 'classType:new' as const,
      });
      const changes = Object.freeze(updates);
      const created = createClassType(input, proposed);
      const updated = updateClassType(input, classType.classTypeId, changes);
      expectInvalid(created, field);
      expectInvalid(updated, field);
      expect(created).not.toHaveProperty('value');
      expect(updated).not.toHaveProperty('value');
      expect(input).toEqual(before);
    },
  );

  it.each(['update', 'snapshot'] as const)(
    'reports an unavailable target for %s without state changes',
    (operation) => {
      const input = freeze(state());
      const before = structuredClone(input);
      const result =
        operation === 'update'
          ? updateClassType(input, 'classType:missing', { name: 'New name' })
          : createClassTypeSnapshot(input, 'classType:missing');
      expect(result).toEqual({
        success: false,
        error: {
          category: 'DemoUnavailableState',
          message: expect.stringMatching(/\S/),
          resource: 'classType',
          resourceId: 'classType:missing',
          stale: false,
        },
      });
      expect(input).toEqual(before);
    },
  );
});
