import { useState } from 'react';
import type { FormEvent } from 'react';
import { selectSettings, useDemoState } from '../../demo-state';
import type {
  DomainError,
  ScheduleReleasePolicy,
  SystemSettings,
  SystemSettingsUpdate,
} from '../../domain';
import { Alert, Button, InputField, SelectField } from '../../shared';
import styles from './settings.module.css';

const numericFields = [
  { key: 'memberCap', label: 'Member cap', min: 1 },
  {
    key: 'invitationExpiryMinutes',
    label: 'Invitation expiry (minutes)',
    min: 1,
  },
  {
    key: 'targetGapMinutes',
    label: 'Inter-class target gap (minutes)',
    min: 0,
  },
  {
    key: 'waitlistCutoffMinutes',
    label: 'Waitlist cutoff before class (minutes)',
    min: 0,
  },
  {
    key: 'lateCancelCutoffMinutes',
    label: 'Late-cancel cutoff before class (minutes)',
    min: 0,
  },
  {
    key: 'checkInLeadMinutes',
    label: 'Self-check-in lead (minutes before start)',
    min: 0,
  },
  {
    key: 'checkInGraceMinutes',
    label: 'Self-check-in grace (minutes after start)',
    min: 0,
  },
] as const;

type NumericKey = (typeof numericFields)[number]['key'];
type SettingsDraft = Record<NumericKey, string> & {
  releaseMode: ScheduleReleasePolicy['mode'];
  advanceMinutes: string;
};

interface FormFailure {
  readonly message: string;
  readonly fields: Readonly<Record<string, string>>;
}

function createDraft(settings: SystemSettings): SettingsDraft {
  return {
    memberCap: String(settings.memberCap),
    invitationExpiryMinutes: String(settings.invitationExpiryMinutes),
    targetGapMinutes: String(settings.targetGapMinutes),
    waitlistCutoffMinutes: String(settings.waitlistCutoffMinutes),
    lateCancelCutoffMinutes: String(settings.lateCancelCutoffMinutes),
    checkInLeadMinutes: String(settings.checkInLeadMinutes),
    checkInGraceMinutes: String(settings.checkInGraceMinutes),
    releaseMode: settings.scheduleRelease.mode,
    advanceMinutes:
      settings.scheduleRelease.mode === 'rolling'
        ? String(settings.scheduleRelease.advanceMinutes)
        : '',
  };
}

function formFailure(error: DomainError): FormFailure {
  return error.category === 'ValidationError'
    ? {
        message: 'Settings were not saved. Correct the highlighted field.',
        fields: Object.fromEntries(
          error.fields.map(({ field, message }) => [field, message]),
        ),
      }
    : { message: error.message, fields: {} };
}

function SettingsForm({
  settings,
  canEdit,
  onSaved,
  onEdited,
}: {
  readonly settings: SystemSettings;
  readonly canEdit: boolean;
  readonly onSaved: (revision: number) => void;
  readonly onEdited: () => void;
}) {
  const demo = useDemoState();
  const [form, setForm] = useState(() => ({
    settings,
    draft: createDraft(settings),
  }));
  const [failure, setFailure] = useState<FormFailure | null>(null);

  // A replacement snapshot must also discard drafts when its values are equal.
  if (form.settings !== settings) {
    setForm({ settings, draft: createDraft(settings) });
    setFailure(null);
  }

  const { draft } = form;
  function change(updates: Partial<SettingsDraft>) {
    setForm({ settings, draft: { ...draft, ...updates } });
    setFailure(null);
    onEdited();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onEdited();
    const fields: Record<string, string> = {};
    for (const { key, min } of numericFields) {
      if (draft[key].trim() === '') {
        fields[`updates.${key}`] = 'Enter a whole number.';
      } else if (min === 1 && Number(draft[key]) === 0) {
        fields[`updates.${key}`] = 'Use a whole number greater than zero.';
      }
    }
    if (draft.releaseMode === 'rolling' && draft.advanceMinutes.trim() === '') {
      fields['updates.scheduleRelease.advanceMinutes'] =
        'Enter a whole number.';
    }
    if (Object.keys(fields).length > 0) {
      setFailure({
        message: 'Settings were not saved. Correct the highlighted fields.',
        fields,
      });
      return;
    }
    const updates: SystemSettingsUpdate = {
      memberCap: Number(draft.memberCap),
      invitationExpiryMinutes: Number(draft.invitationExpiryMinutes),
      targetGapMinutes: Number(draft.targetGapMinutes),
      waitlistCutoffMinutes: Number(draft.waitlistCutoffMinutes),
      lateCancelCutoffMinutes: Number(draft.lateCancelCutoffMinutes),
      checkInLeadMinutes: Number(draft.checkInLeadMinutes),
      checkInGraceMinutes: Number(draft.checkInGraceMinutes),
      scheduleRelease:
        draft.releaseMode === 'rolling'
          ? { mode: 'rolling', advanceMinutes: Number(draft.advanceMinutes) }
          : { mode: draft.releaseMode },
    };
    const result = demo.submit(
      { type: 'updateSettings', payload: { updates } },
      { expectedRevision: demo.revision },
    );
    if (!result.success) {
      setFailure(formFailure(result.error));
      return;
    }
    setFailure(null);
    onSaved(result.value.baseRevision + 1);
  }

  return (
    <form
      aria-label="Illustrative demo settings"
      className={styles.form}
      noValidate
      onSubmit={submit}
    >
      {failure && <Alert>{failure.message}</Alert>}
      <div className={styles.fields}>
        {numericFields.map(({ key, label, min }) => (
          <InputField
            key={key}
            label={label}
            type="number"
            min={min}
            step={1}
            required
            value={draft[key]}
            readOnly={!canEdit}
            hint={
              min === 1
                ? 'Illustrative value; use a positive whole number.'
                : 'Illustrative value; use whole minutes, zero or greater.'
            }
            error={failure?.fields[`updates.${key}`]}
            onChange={(event) => change({ [key]: event.target.value })}
          />
        ))}
        <SelectField
          label="Schedule release policy"
          value={draft.releaseMode}
          disabled={!canEdit}
          hint="Illustrative policy: immediate at publication, rolling before start, or explicit manual release."
          error={failure?.fields['updates.scheduleRelease']}
          onChange={(event) => {
            const mode = event.target.value;
            if (
              mode === 'immediate' ||
              mode === 'rolling' ||
              mode === 'manual'
            ) {
              change({ releaseMode: mode });
            } else {
              setFailure({
                message:
                  'Choose an immediate, rolling or manual release policy.',
                fields: {
                  'updates.scheduleRelease': 'Choose a listed release policy.',
                },
              });
            }
          }}
        >
          <option value="immediate">Immediate</option>
          <option value="rolling">Rolling</option>
          <option value="manual">Manual</option>
        </SelectField>
        {draft.releaseMode === 'rolling' && (
          <InputField
            label="Rolling release advance (minutes)"
            type="number"
            min={0}
            step={1}
            required
            value={draft.advanceMinutes}
            readOnly={!canEdit}
            hint="Illustrative whole minutes before class starts; zero releases at start."
            error={failure?.fields['updates.scheduleRelease.advanceMinutes']}
            onChange={(event) => change({ advanceMinutes: event.target.value })}
          />
        )}
        <InputField
          label="Demo timezone"
          value={settings.timezone}
          readOnly
          hint="Frozen illustrative scenario timezone; not an approved gym location."
        />
      </div>
      {canEdit && <Button type="submit">Save demo settings</Button>}
    </form>
  );
}

export function SettingsScreen() {
  const demo = useDemoState();
  const settings = selectSettings(demo.state);
  const canEdit =
    demo.capabilities.success &&
    demo.capabilities.value.capabilities.includes('manageSettings');
  const [savedRevision, setSavedRevision] = useState<number | null>(null);

  return (
    <section className={styles.screen} aria-labelledby="settings-heading">
      <h1 id="settings-heading">Admin settings</h1>
      <p>
        Non-operational demo: changes affect in-memory state only. Refresh
        resets the demo; settings are not persisted.
      </p>
      <p>
        Unresolved launch values are illustrative fixture values, not approved
        gym policy. All controls below use illustrative values.
      </p>
      {!demo.capabilities.success && (
        <Alert>{demo.capabilities.error.message}</Alert>
      )}
      {!canEdit && (
        <p>Read-only: only an active Admin can change demo settings.</p>
      )}
      {savedRevision === demo.revision && (
        <Alert tone="success">Demo settings updated in memory only.</Alert>
      )}
      <SettingsForm
        key={JSON.stringify(demo.activeActor)}
        settings={settings}
        canEdit={canEdit}
        onSaved={setSavedRevision}
        onEdited={() => setSavedRevision(null)}
      />
    </section>
  );
}
