import { useState } from 'react';
import { selectClasses, useDemoState } from '../../demo-state';
import type { ClassType, DomainError } from '../../domain';
import {
  Alert,
  Button,
  InputField,
  SelectField,
  TextareaField,
} from '../../shared';
import styles from './classes.module.css';

const emptyDetails: Required<Omit<ClassType, 'classTypeId'>> = {
  name: '',
  durationMinutes: 30,
  description: '',
  difficulty: '',
  alias: '',
  whatToBring: '',
};

export function ClassesScreen() {
  const demo = useDemoState();
  const [selectedId, setSelectedId] = useState('');
  const [details, setDetails] = useState(emptyDetails);
  const [feedback, setFeedback] = useState<{
    revision: number;
    actor: string;
    error?: DomainError;
    message?: string;
  }>();
  const actor = JSON.stringify(demo.activeActor);
  const current =
    feedback?.revision === demo.revision && feedback.actor === actor
      ? feedback
      : undefined;
  const canManage =
    demo.capabilities.success &&
    demo.capabilities.value.capabilities.includes('manageClassTypes');
  const canView =
    demo.capabilities.success &&
    demo.capabilities.value.capabilities.includes('viewSchedule');
  const types = canView ? demo.state.classTypes : [];
  const snapshots = selectClasses(demo.state, {
    actor: demo.activeActor,
    now: demo.now,
  });
  const fieldError = (field: string) =>
    current?.error?.category === 'ValidationError'
      ? current.error.fields.find((item) => item.field === field)?.message
      : undefined;

  return (
    <main className={styles.screen}>
      <h1>Class types</h1>
      <p>
        Updated definitions apply to newly scheduled classes only. Existing
        scheduled snapshots remain unchanged.
      </p>
      {!demo.capabilities.success && (
        <Alert>{demo.capabilities.error.message}</Alert>
      )}
      {!canManage && (
        <p>
          Read-only: only an active Admin can manage class types. Persona
          permissions are simulated, not authentication.
        </p>
      )}
      {current?.error && <Alert>{current.error.message}</Alert>}
      {current?.message && (
        <Alert tone="success">{current.message} in the local demo.</Alert>
      )}
      {canManage && (
        <form
          aria-label="Class type details"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const existing = types.find(
              (item) => item.classTypeId === selectedId,
            );
            if (selectedId && !existing) {
              setFeedback({
                revision: demo.revision,
                actor,
                error: {
                  category: 'DemoUnavailableState',
                  resource: 'classType',
                  resourceId: selectedId,
                  stale: true,
                  message:
                    'The selected class type is no longer available. Choose another type.',
                },
              });
              return;
            }
            const result = demo.submit(
              existing
                ? {
                    type: 'updateClassType',
                    payload: {
                      classTypeId: existing.classTypeId,
                      updates: details,
                    },
                  }
                : {
                    type: 'createClassType',
                    payload: {
                      classType: {
                        ...details,
                        classTypeId: `classType:screen-${demo.revision}-${types.length}`,
                      },
                    },
                  },
              { expectedRevision: demo.revision },
            );
            setFeedback(
              result.success
                ? {
                    revision: result.value.baseRevision + 1,
                    actor,
                    message: existing
                      ? 'Class type updated'
                      : 'Class type created',
                  }
                : { revision: demo.revision, actor, error: result.error },
            );
          }}
        >
          <h2>Create or edit a class type</h2>
          <SelectField
            label="Class type to edit"
            value={selectedId}
            onChange={(event) => {
              setSelectedId(event.target.value);
              const existing = types.find(
                (item) => item.classTypeId === event.target.value,
              );
              setDetails(
                existing
                  ? {
                      name: existing.name,
                      durationMinutes: existing.durationMinutes,
                      description: existing.description,
                      difficulty: existing.difficulty,
                      alias: existing.alias ?? '',
                      whatToBring: existing.whatToBring ?? '',
                    }
                  : emptyDetails,
              );
              setFeedback(undefined);
            }}
          >
            <option value="">New class type</option>
            {types.map((item) => (
              <option key={item.classTypeId} value={item.classTypeId}>
                {item.name}
              </option>
            ))}
          </SelectField>
          <InputField
            label="Name"
            value={details.name}
            error={fieldError('name')}
            onChange={(event) =>
              setDetails({ ...details, name: event.target.value })
            }
          />
          <SelectField
            label="Duration (minutes)"
            value={details.durationMinutes}
            error={fieldError('durationMinutes')}
            onChange={(event) => {
              const duration = Number(event.target.value);
              if (duration === 30 || duration === 45 || duration === 60)
                setDetails({ ...details, durationMinutes: duration });
            }}
          >
            {[30, 45, 60].map((duration) => (
              <option key={duration} value={duration}>
                {duration}
              </option>
            ))}
          </SelectField>
          <TextareaField
            label="Description"
            value={details.description}
            error={fieldError('description')}
            onChange={(event) =>
              setDetails({ ...details, description: event.target.value })
            }
          />
          <InputField
            label="Difficulty"
            value={details.difficulty}
            error={fieldError('difficulty')}
            onChange={(event) =>
              setDetails({ ...details, difficulty: event.target.value })
            }
          />
          <InputField
            label="Alias"
            value={details.alias}
            error={fieldError('alias')}
            onChange={(event) =>
              setDetails({ ...details, alias: event.target.value })
            }
          />
          <TextareaField
            label="What to bring"
            value={details.whatToBring}
            error={fieldError('whatToBring')}
            onChange={(event) =>
              setDetails({ ...details, whatToBring: event.target.value })
            }
          />
          <Button type="submit">Save class type</Button>
        </form>
      )}
      <section aria-label="Class definitions">
        <h2>Reusable definitions</h2>
        {types.length === 0 && (
          <p>No class definitions are available to this persona.</p>
        )}
        {types.map((item) => (
          <article key={item.classTypeId}>
            <h3>{item.name}</h3>
            <p>
              {item.durationMinutes} minutes - {item.difficulty}
            </p>
            <p>{item.description}</p>
            {item.alias && <p>Alias: {item.alias}</p>}
            {item.whatToBring && <p>What to bring: {item.whatToBring}</p>}
          </article>
        ))}
      </section>
      <section aria-label="Scheduled snapshots">
        <h2>Scheduled snapshots</h2>
        {snapshots.length === 0 && <p>No visible scheduled snapshots.</p>}
        {snapshots.map((item) => (
          <p key={item.classId}>
            {item.schedule.date} {item.schedule.time}:{' '}
            {item.classTypeSnapshot.name} -{' '}
            {item.classTypeSnapshot.durationMinutes} minutes ({item.status})
          </p>
        ))}
      </section>
    </main>
  );
}
