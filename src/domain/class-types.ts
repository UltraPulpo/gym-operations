import type {
  ClassType,
  ClassTypeId,
  ClassTypeSnapshot,
  ClassTypeUpdate,
  DemoState,
  DomainResult,
  FieldValidationError,
} from './types';

export type ClassTypeInput = Omit<ClassType, 'durationMinutes'> & {
  readonly durationMinutes: number;
};

export type ClassTypeChanges = Omit<ClassTypeUpdate, 'durationMinutes'> & {
  readonly durationMinutes?: number;
};

export function validateClassType(
  input: ClassTypeInput,
): DomainResult<ClassType> {
  const fields: FieldValidationError[] = [];
  for (const field of ['name', 'description', 'difficulty'] as const) {
    if (typeof input[field] !== 'string' || !input[field].trim()) {
      fields.push({ field, message: `Enter a nonblank class ${field}.` });
    }
  }
  for (const field of ['alias', 'whatToBring'] as const) {
    if (input[field] !== undefined && typeof input[field] !== 'string') {
      fields.push({ field, message: `Provide text for ${field} or omit it.` });
    }
  }
  const durationMinutes = input.durationMinutes;
  const validDuration =
    durationMinutes === 30 || durationMinutes === 45 || durationMinutes === 60;
  if (!validDuration) {
    fields.push({
      field: 'durationMinutes',
      message: 'Choose a class duration of 30, 45, or 60 minutes.',
    });
  }
  if (fields.length > 0 || !validDuration) {
    return {
      success: false,
      error: {
        category: 'ValidationError',
        message: 'Correct the class type details.',
        fields,
      },
    };
  }

  return {
    success: true,
    value: {
      classTypeId: input.classTypeId,
      name: input.name,
      durationMinutes,
      description: input.description,
      difficulty: input.difficulty,
      ...(input.alias === undefined ? {} : { alias: input.alias }),
      ...(input.whatToBring === undefined
        ? {}
        : { whatToBring: input.whatToBring }),
    },
  };
}

function findClassType(
  state: DemoState,
  classTypeId: ClassTypeId,
): DomainResult<ClassType> {
  const classType = state.classTypes.find(
    (candidate) => candidate.classTypeId === classTypeId,
  );
  return classType
    ? { success: true, value: classType }
    : {
        success: false,
        error: {
          category: 'DemoUnavailableState',
          message: 'The demo class type is unavailable.',
          resource: 'classType',
          resourceId: classTypeId,
          stale: false,
        },
      };
}

export function createClassType(
  state: DemoState,
  input: ClassTypeInput,
): DomainResult<DemoState> {
  if (
    state.classTypes.some(
      (candidate) => candidate.classTypeId === input.classTypeId,
    )
  ) {
    return {
      success: false,
      error: {
        category: 'ValidationError',
        message: 'Class type IDs must be unique.',
        fields: [
          {
            field: 'classTypeId',
            message: 'Choose an unused class type ID.',
          },
        ],
      },
    };
  }
  const validated = validateClassType(input);
  if (!validated.success) return validated;
  return {
    success: true,
    value: {
      ...state,
      classTypes: [...state.classTypes, validated.value],
    },
  };
}

/** Edits apply to newly created snapshots, never to existing scheduled classes. */
export function updateClassType(
  state: DemoState,
  classTypeId: ClassTypeId,
  updates: ClassTypeChanges,
): DomainResult<DemoState> {
  const existing = findClassType(state, classTypeId);
  if (!existing.success) return existing;
  const validated = validateClassType({
    ...existing.value,
    ...updates,
    classTypeId,
  });
  if (!validated.success) return validated;
  return {
    success: true,
    value: {
      ...state,
      classTypes: state.classTypes.map((candidate) =>
        candidate === existing.value ? validated.value : candidate,
      ),
    },
  };
}

export function createClassTypeSnapshot(
  state: DemoState,
  classTypeId: ClassTypeId,
): DomainResult<ClassTypeSnapshot> {
  const existing = findClassType(state, classTypeId);
  if (!existing.success) return existing;
  const validated = validateClassType(existing.value);
  if (!validated.success) return validated;
  return { success: true, value: Object.freeze(validated.value) };
}
