import { useState } from 'react';
import {
  selectClasses,
  selectCoachClassHistory,
  selectCoachProfile,
  useDemoState,
} from '../../demo-state';
import type {
  ClassId,
  CoachProfile,
  DomainError,
  PublicCoachProfile as PublicProfile,
  StaffId,
} from '../../domain';
import {
  Alert,
  Button,
  InputField,
  SelectField,
  TextareaField,
} from '../../shared';
import styles from './coaches.module.css';

const avatarChoices = [
  { id: 'avatar:local-initials', label: 'Initials - slate', color: '#334155' },
  { id: 'avatar:local-indigo', label: 'Initials - indigo', color: '#4338ca' },
  { id: 'avatar:local-coral', label: 'Initials - coral', color: '#9f1239' },
] as const;

function GeneratedAvatar({
  name,
  avatarId,
  preview = false,
}: {
  name: string;
  avatarId: string;
  preview?: boolean;
}) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '?';
  const color =
    avatarChoices.find((choice) => choice.id === avatarId)?.color ??
    (avatarId === 'avatar:fictional-coral' ? '#9f1239' : '#334155');

  return (
    <svg
      className={styles.avatar}
      viewBox="0 0 80 80"
      role="img"
      aria-label={
        preview ? `${name} avatar preview` : `${name} generated avatar`
      }
    >
      <rect width="80" height="80" rx="40" fill={color} />
      <text
        x="40"
        y="43"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#fff"
        fontSize="28"
      >
        {initials}
      </text>
    </svg>
  );
}

type HeadingLevel = 2 | 3 | 4 | 5;

function ProfileContent({
  coachId,
  profile,
  headingLevel = 2,
}: {
  coachId: StaffId;
  profile: PublicProfile | CoachProfile;
  headingLevel?: HeadingLevel;
}) {
  const Heading = `h${headingLevel}` as const;
  const Subheading = `h${headingLevel + 1}` as 'h3' | 'h4' | 'h5' | 'h6';
  const demo = useDemoState();
  const history = selectCoachClassHistory(
    demo.state,
    coachId,
    demo.activeActor,
    demo.now,
  );
  return (
    <>
      <header className={styles.heading}>
        <GeneratedAvatar
          name={profile.displayName}
          avatarId={profile.avatarId}
        />
        <Heading>{profile.displayName}</Heading>
      </header>
      <p>{profile.biography || 'No biography provided.'}</p>
      <Subheading>Certifications</Subheading>
      {profile.certifications.length > 0 ? (
        <ul>
          {profile.certifications.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>No certifications listed.</p>
      )}
      <section aria-label={`${profile.displayName} class history`}>
        <Subheading>Class history</Subheading>
        <p>
          Past scheduled classes, ordered by start time. A class enters history
          at its end time.
        </p>
        {!history.success ? (
          <Alert>{history.error.message}</Alert>
        ) : history.value.length === 0 ? (
          <p>No visible past classes.</p>
        ) : (
          <ul>
            {history.value.map((scheduled) => (
              <li key={scheduled.classId}>
                {scheduled.classTypeSnapshot.name} - {scheduled.schedule.date}{' '}
                {scheduled.schedule.time} ({scheduled.schedule.timezone}) -{' '}
                {scheduled.classTypeSnapshot.durationMinutes} minutes -{' '}
                {scheduled.status}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export interface PublicCoachProfileProps {
  readonly coachId: StaffId;
  /** Heading level for the coach name when nested inside another section. */
  readonly headingLevel?: HeadingLevel;
}

export function PublicCoachProfile({
  coachId,
  headingLevel,
}: PublicCoachProfileProps) {
  const demo = useDemoState();
  const selected = selectCoachProfile(demo.state, coachId, demo.activeActor);
  if (!selected.success) return <Alert>{selected.error.message}</Alert>;
  return (
    <section
      className={styles.card}
      aria-label={`${selected.value.profile.displayName} public profile`}
    >
      <ProfileContent
        coachId={coachId}
        profile={selected.value.profile}
        headingLevel={headingLevel}
      />
    </section>
  );
}

export interface PublicCoachClassDetailsProps {
  readonly classId: ClassId;
}

export function PublicCoachClassDetails({
  classId,
}: PublicCoachClassDetailsProps) {
  const demo = useDemoState();
  if (!demo.capabilities.success)
    return <Alert>{demo.capabilities.error.message}</Alert>;
  const scheduled = selectClasses(demo.state, {
    actor: demo.activeActor,
    now: demo.now,
  }).find((item) => item.classId === classId);
  if (!scheduled)
    return (
      <Alert>
        The selected fictional class is unavailable to this persona.
      </Alert>
    );
  const details = scheduled.classTypeSnapshot;
  return (
    <section
      className={styles.card}
      aria-label={`${details.name} class details`}
    >
      <h2>{details.name}</h2>
      <p>
        {scheduled.schedule.date} {scheduled.schedule.time} (
        {scheduled.schedule.timezone})
      </p>
      <p>
        {details.durationMinutes} minutes - {details.difficulty}
      </p>
      <p>{details.description}</p>
      {details.alias && <p>Alias: {details.alias}</p>}
      {details.whatToBring && <p>What to bring: {details.whatToBring}</p>}
      {scheduled.coachId ? (
        <PublicCoachProfile coachId={scheduled.coachId} />
      ) : (
        <p>No coach assigned.</p>
      )}
    </section>
  );
}

function ProfileEditor({
  coachId,
  profile,
  admin,
}: {
  coachId: StaffId;
  profile?: CoachProfile;
  admin: boolean;
}) {
  const demo = useDemoState();
  const fields = () => ({
    displayName: profile?.displayName ?? '',
    biography: profile?.biography ?? '',
    avatarId: profile?.avatarId ?? avatarChoices[0].id,
    certifications: profile?.certifications.join('\n') ?? '',
    email: profile?.contact.email ?? '',
    phone: profile?.contact.phone ?? '',
  });
  const [draft, setDraft] = useState(fields);
  const [baseRevision, setBaseRevision] = useState(demo.revision);
  const [feedback, setFeedback] = useState<{
    revision: number;
    error?: DomainError;
    message?: string;
  }>();
  const current = feedback?.revision === demo.revision ? feedback : undefined;
  const fieldError = (field: string) =>
    current?.error?.category === 'ValidationError'
      ? current.error.fields.find((item) => item.field === field)?.message
      : undefined;
  const ownUpdates = { biography: draft.biography, avatarId: draft.avatarId };

  return (
    <form
      className={styles.editor}
      aria-label={
        profile ? `Edit ${profile.displayName}` : `Initialize ${coachId}`
      }
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const result = demo.submit(
          admin
            ? {
                type: 'updateCoachProfile',
                payload: {
                  staffId: coachId,
                  updates: {
                    ...ownUpdates,
                    displayName: draft.displayName,
                    certifications: draft.certifications
                      .split('\n')
                      .map((entry) => entry.trim())
                      .filter(Boolean),
                    contact: {
                      ...(draft.email.trim()
                        ? { email: draft.email.trim() }
                        : {}),
                      ...(draft.phone.trim()
                        ? { phone: draft.phone.trim() }
                        : {}),
                    },
                  },
                },
              }
            : {
                type: 'updateOwnCoachProfile',
                payload: { staffId: coachId, updates: ownUpdates },
              },
          { expectedRevision: baseRevision },
        );
        if (result.success) {
          const revision = result.value.baseRevision + 1;
          setBaseRevision(revision);
          setFeedback({
            revision,
            message: 'Coach profile saved in the local demo.',
          });
        } else {
          setFeedback({ revision: demo.revision, error: result.error });
        }
      }}
    >
      <h3>{admin ? 'Admin profile controls' : 'Your profile controls'}</h3>
      {current?.error && <Alert>{current.error.message}</Alert>}
      {current?.message && <Alert tone="success">{current.message}</Alert>}
      {admin && (
        <InputField
          label="Coach name"
          value={draft.displayName}
          error={fieldError('displayName')}
          onChange={(event) =>
            setDraft({ ...draft, displayName: event.target.value })
          }
        />
      )}
      <TextareaField
        label="Biography"
        value={draft.biography}
        error={fieldError('biography')}
        onChange={(event) =>
          setDraft({ ...draft, biography: event.target.value })
        }
      />
      <SelectField
        label="Generated avatar"
        hint="Local initials only. No upload, external image, or network request."
        value={draft.avatarId}
        error={fieldError('avatarId')}
        onChange={(event) => {
          const choice = avatarChoices.find(
            (item) => item.id === event.target.value,
          );
          if (choice) setDraft({ ...draft, avatarId: choice.id });
        }}
      >
        {!avatarChoices.some((choice) => choice.id === draft.avatarId) && (
          <option value={draft.avatarId}>Current generated initials</option>
        )}
        {avatarChoices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.label}
          </option>
        ))}
      </SelectField>
      <GeneratedAvatar
        name={draft.displayName}
        avatarId={draft.avatarId}
        preview
      />
      {admin && (
        <>
          <TextareaField
            label="Certifications"
            hint="One certification per line; leave blank to clear."
            value={draft.certifications}
            error={fieldError('certifications')}
            onChange={(event) =>
              setDraft({ ...draft, certifications: event.target.value })
            }
          />
          <InputField
            label="Staff email"
            hint="Staff-only fictional contact, not an identity or sign-in email."
            type="email"
            value={draft.email}
            error={fieldError('contact.email')}
            onChange={(event) =>
              setDraft({ ...draft, email: event.target.value })
            }
          />
          <InputField
            label="Staff phone"
            type="tel"
            value={draft.phone}
            error={fieldError('contact.phone')}
            onChange={(event) =>
              setDraft({ ...draft, phone: event.target.value })
            }
          />
        </>
      )}
      <div className={styles.actions}>
        <Button type="submit">
          {profile ? 'Save coach profile' : 'Initialize coach profile'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setDraft(fields());
            setBaseRevision(demo.revision);
            setFeedback(undefined);
          }}
        >
          Reload profile
        </Button>
      </div>
      <p>
        Reload discards your unsaved draft and uses the current demo profile.
      </p>
    </form>
  );
}

export function CoachesScreen() {
  const demo = useDemoState();
  const capabilities = demo.capabilities.success
    ? demo.capabilities.value.capabilities
    : [];
  const canView = capabilities.includes('viewSchedule');
  const admin = capabilities.includes('manageCoachProfiles');
  const own = capabilities.includes('editOwnCoachProfile');
  // Profile fields come from the audience-aware selector.
  const profiles = canView
    ? demo.state.staffAccounts.flatMap(({ staffId }) => {
        const selected = selectCoachProfile(
          demo.state,
          staffId,
          demo.activeActor,
        );
        return selected.success ? [{ staffId, view: selected.value }] : [];
      })
    : [];
  const missingProfiles = canView
    ? demo.state.staffAccounts.filter(
        (account) =>
          account.assignedRoles.includes('coach') && !account.coachProfile,
      )
    : [];

  return (
    <main className={styles.screen}>
      <h1>Coach profiles</h1>
      <p>
        Persona permissions are simulated, not authentication. Avatars are
        generated locally.
      </p>
      {!demo.capabilities.success && (
        <Alert>{demo.capabilities.error.message}</Alert>
      )}
      {!admin && (
        <p>
          Read-only except your own Coach biography and generated avatar. Only
          an active Admin manages names, certifications and staff-only contact.
        </p>
      )}
      {canView && profiles.length === 0 && missingProfiles.length === 0 && (
        <p>No coach profiles available.</p>
      )}
      {demo.capabilities.success && !canView && (
        <Alert>This persona cannot view coach profiles.</Alert>
      )}
      <div className={styles.profiles}>
        {missingProfiles.map(({ staffId }) => {
          const ownProfile =
            own &&
            demo.activeActor.kind === 'staff' &&
            demo.activeActor.staffId === staffId;
          return (
            <section
              key={staffId}
              className={styles.card}
              aria-label={
                admin || ownProfile
                  ? `${staffId} missing profile`
                  : 'Missing coach profile'
              }
            >
              <Alert>
                {admin || ownProfile
                  ? `Coach profile for ${staffId} has not been initialized.`
                  : 'A coach profile has not been initialized.'}
              </Alert>
              {admin ? (
                <ProfileEditor
                  key={`${JSON.stringify(demo.activeActor)}:${demo.state.scenarioId}`}
                  coachId={staffId}
                  admin
                />
              ) : (
                <p>Ask an active Admin to initialize this coach profile.</p>
              )}
            </section>
          );
        })}
        {profiles.map(({ staffId, view }) => (
          <section
            key={staffId}
            className={styles.card}
            aria-label={`${view.profile.displayName} profile`}
          >
            <ProfileContent coachId={staffId} profile={view.profile} />
            {view.audience === 'staff' && (
              <section aria-label={`${view.profile.displayName} staff contact`}>
                <h3>Staff-only contact</h3>
                {view.profile.contact.email && (
                  <p>{view.profile.contact.email}</p>
                )}
                {view.profile.contact.phone && (
                  <p>{view.profile.contact.phone}</p>
                )}
                {!view.profile.contact.email && !view.profile.contact.phone && (
                  <p>No staff contact provided.</p>
                )}
              </section>
            )}
            {view.audience === 'staff' &&
              (admin ||
                (own &&
                  demo.activeActor.kind === 'staff' &&
                  demo.activeActor.staffId === staffId)) && (
                <ProfileEditor
                  key={`${JSON.stringify(demo.activeActor)}:${demo.state.scenarioId}`}
                  coachId={staffId}
                  profile={view.profile}
                  admin={admin}
                />
              )}
          </section>
        ))}
      </div>
    </main>
  );
}
