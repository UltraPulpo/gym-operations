import { useState } from 'react';
import type { FormEvent } from 'react';
import type {
  ClassId,
  DemoCapability,
  IdentitySubject,
  StaffAccount,
  StaffId,
  StaffRole,
} from '../../domain';
import {
  selectCapabilities,
  selectStaffAccounts,
  useDemoState,
} from '../../demo-state';
import type { StaffAccountView } from '../../demo-state';
import {
  Alert,
  Button,
  CheckboxField,
  ConfirmationDialog,
  DataTable,
  Dialog,
  InputField,
  StatusBadge,
} from '../../shared';
import type { TableColumn } from '../../shared';
import styles from './StaffAccessScreen.module.css';

const STAFF_ROLES: readonly {
  readonly value: StaffRole;
  readonly label: string;
}[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'frontDesk', label: 'Front Desk' },
  { value: 'coach', label: 'Coach' },
];

const CAPABILITY_LABELS: Readonly<Record<DemoCapability, string>> = {
  manageStaff: 'Manage staff access',
  manageSettings: 'Manage settings',
  manageWaivers: 'Manage waiver versions',
  manageStations: 'Manage stations and layout',
  manageClassTypes: 'Manage class types',
  manageTemplates: 'Manage weekly templates',
  manageSchedule: 'Manage the schedule',
  viewSchedule: 'View the schedule',
  manageMembers: 'Manage members',
  manageInvitations: 'Manage invitations',
  manageBookings: 'Manage bookings',
  manageWaitlists: 'Manage waitlists',
  manageAttendance: 'Manage attendance',
  viewRoster: 'View class rosters',
  reseatBookings: 'Reseat class bookings',
  manageNotifications: 'Manage simulated notifications',
  manageCoachProfiles: 'Manage coach profiles',
  editOwnCoachProfile: 'Edit own coach biography and photo',
  acceptInvitation: 'Accept the selected invitation',
  signWaiver: 'Sign a waiver',
  bookStation: 'Book a station',
  cancelOwnBooking: 'Cancel own booking',
  moveOwnBooking: 'Move own booking',
  manageOwnWaitlist: 'Manage own waitlist entry',
  selfCheckIn: 'Check in to a class',
};

interface StaffAccountForm {
  readonly staffId: string;
  readonly identitySubject: string;
  readonly active: boolean;
  readonly assignedRoles: readonly StaffRole[];
  readonly assignedClassIds: readonly ClassId[];
}

type Editor =
  | { readonly mode: 'create' }
  | { readonly mode: 'edit'; readonly account: StaffAccountView };

const EMPTY_FORM: StaffAccountForm = {
  staffId: '',
  identitySubject: '',
  active: true,
  assignedRoles: [],
  assignedClassIds: [],
};

export function StaffAccessScreen() {
  const demo = useDemoState();
  const [selectedStaffId, setSelectedStaffId] = useState<StaffId>();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [form, setForm] = useState<StaffAccountForm>(EMPTY_FORM);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [deactivating, setDeactivating] = useState<StaffAccountView | null>(
    null,
  );

  const actorCapabilities = demo.capabilities;
  const canManageStaff =
    demo.activeActor.kind === 'staff' &&
    actorCapabilities.success &&
    actorCapabilities.value.capabilities.includes('manageStaff');

  if (!canManageStaff) {
    return (
      <main className={styles.screen}>
        <h1>Staff access</h1>
        <Alert>
          Only an active Admin persona can manage fictional staff access in this
          demo.
        </Alert>
        <p className={styles.boundary}>
          This is a fictional demo only. It is not authentication or a security
          boundary.
        </p>
      </main>
    );
  }

  const accounts = selectStaffAccounts(demo.state, demo.activeActor);
  const selected =
    accounts.find((account) => account.staffId === selectedStaffId) ??
    accounts[0];
  const selectedCapabilities = selected
    ? selectCapabilities(demo.state, {
        kind: 'staff',
        staffId: selected.staffId,
      })
    : undefined;

  function beginCreate() {
    setForm(EMPTY_FORM);
    setError(undefined);
    setNotice(undefined);
    setEditor({ mode: 'create' });
  }

  function beginEdit(account: StaffAccountView) {
    setForm({
      staffId: account.staffId,
      identitySubject: '',
      active: account.active,
      assignedRoles: [...account.assignedRoles],
      assignedClassIds: [...account.assignedClassIds],
    });
    setSelectedStaffId(account.staffId);
    setError(undefined);
    setNotice(undefined);
    setEditor({ mode: 'edit', account });
  }

  function closeEditor() {
    setEditor(null);
    setError(undefined);
  }

  function toggleRole(role: StaffRole, checked: boolean) {
    setForm((current) => ({
      ...current,
      assignedRoles: checked
        ? [...current.assignedRoles, role]
        : current.assignedRoles.filter((item) => item !== role),
    }));
  }

  function toggleClass(classId: ClassId, checked: boolean) {
    setForm((current) => ({
      ...current,
      assignedClassIds: checked
        ? [...current.assignedClassIds, classId]
        : current.assignedClassIds.filter((item) => item !== classId),
    }));
  }

  function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const result =
      editor?.mode === 'create'
        ? demo.submit({
            type: 'createStaffAccount',
            payload: {
              staff: {
                staffId: form.staffId as StaffId,
                identitySubject: form.identitySubject as IdentitySubject,
                active: form.active,
                assignedRoles: form.assignedRoles,
                assignedClassIds: form.assignedClassIds,
              } satisfies StaffAccount,
            },
          })
        : editor?.mode === 'edit'
          ? demo.submit({
              type: 'updateStaffAccount',
              payload: {
                staffId: editor.account.staffId,
                updates: {
                  active: form.active,
                  assignedRoles: form.assignedRoles,
                  assignedClassIds: form.assignedClassIds,
                  ...(form.identitySubject.trim()
                    ? {
                        identitySubject:
                          form.identitySubject as IdentitySubject,
                      }
                    : {}),
                },
              },
            })
          : undefined;

    if (!editor || !result) return;
    if (!result.success) {
      setError(result.error.message);
      return;
    }

    const createdStaffId =
      editor.mode === 'create' ? (form.staffId as StaffId) : undefined;
    setSelectedStaffId(
      createdStaffId ??
        (editor.mode === 'edit' ? editor.account.staffId : undefined),
    );
    setNotice(
      editor.mode === 'create'
        ? 'Staff account created in this demo.'
        : 'Staff account updated in this demo.',
    );
    setEditor(null);
  }

  function deactivateAccount() {
    if (!deactivating) return;
    const result = demo.submit({
      type: 'deactivateStaffAccount',
      payload: { staffId: deactivating.staffId },
    });
    if (!result.success) {
      setError(result.error.message);
      setDeactivating(null);
      return;
    }
    setSelectedStaffId(deactivating.staffId);
    setNotice('Staff account deactivated in this demo.');
    setError(undefined);
    setDeactivating(null);
  }

  const accountColumns: readonly TableColumn<StaffAccountView>[] = [
    {
      key: 'staffId',
      header: 'Fictional staff ID',
      render: (account) => account.staffId,
    },
    {
      key: 'status',
      header: 'Status',
      render: (account) => (
        <StatusBadge tone={account.active ? 'success' : 'neutral'}>
          {account.active ? 'Active' : 'Inactive'}
        </StatusBadge>
      ),
    },
    {
      key: 'roles',
      header: 'Fixed roles',
      render: (account) =>
        account.assignedRoles
          .map(
            (role) =>
              STAFF_ROLES.find((option) => option.value === role)?.label,
          )
          .filter(Boolean)
          .join(', '),
    },
    {
      key: 'actions',
      header: 'Account actions',
      render: (account) => (
        <div className={styles.rowActions}>
          <Button
            variant="secondary"
            aria-label={`Select ${account.staffId}`}
            aria-pressed={selected?.staffId === account.staffId}
            onClick={() => setSelectedStaffId(account.staffId)}
          >
            Select
          </Button>
          <Button
            variant="secondary"
            aria-label={`Edit ${account.staffId}`}
            onClick={() => beginEdit(account)}
          >
            Edit
          </Button>
          <Button
            variant="danger"
            aria-label={`Deactivate ${account.staffId}`}
            disabled={!account.active}
            onClick={() => setDeactivating(account)}
          >
            Deactivate
          </Button>
        </div>
      ),
    },
  ];

  return (
    <main className={styles.screen}>
      <header className={styles.heading}>
        <div>
          <h1>Staff access</h1>
          <p>
            Manage fictional staff account status and fixed-role assignments.
          </p>
        </div>
        <Button onClick={beginCreate}>Create staff account</Button>
      </header>

      <Alert tone="info">
        Fictional demo only: this screen does not authenticate anyone, issue
        credentials, or enforce production security.
      </Alert>
      {notice && <p role="status">{notice}</p>}
      {error && !editor && <Alert>{error}</Alert>}

      <DataTable
        caption="Fictional staff accounts"
        columns={accountColumns}
        rows={accounts}
        getRowKey={(account) => account.staffId}
        emptyMessage="No fictional staff accounts are available."
      />

      {selected && (
        <section className={styles.detail} aria-labelledby="selected-account">
          <h2 id="selected-account">Selected account capabilities</h2>
          <p>
            <strong>Fictional staff ID:</strong> {selected.staffId}
          </p>
          <p>
            <strong>Status:</strong> {selected.active ? 'Active' : 'Inactive'}
          </p>
          <p>
            <strong>Assigned fixed roles:</strong>{' '}
            {selected.assignedRoles
              .map(
                (role) =>
                  STAFF_ROLES.find((option) => option.value === role)?.label,
              )
              .filter(Boolean)
              .join(', ')}
          </p>
          {selectedCapabilities?.success ? (
            <>
              <h3>Capabilities in this demo</h3>
              <ul aria-label={`Capabilities for ${selected.staffId}`}>
                {selectedCapabilities.value.capabilities.map((capability) => (
                  <li key={capability}>{CAPABILITY_LABELS[capability]}</li>
                ))}
              </ul>
              {selectedCapabilities.value.classScope.kind === 'assigned' && (
                <p>
                  Class access is limited to:{' '}
                  {selectedCapabilities.value.classScope.classIds.join(', ') ||
                    'no assigned classes'}
                </p>
              )}
            </>
          ) : (
            <Alert>
              {selectedCapabilities?.error.message ??
                'Capabilities are unavailable for this account.'}
            </Alert>
          )}
        </section>
      )}

      <p className={styles.boundary}>
        This demonstration uses temporary in-memory data. Refreshing resets
        changes; no real staff account, identity provider, or credentials are
        involved.
      </p>

      <Dialog
        open={editor !== null}
        title={
          editor?.mode === 'edit'
            ? 'Edit staff account'
            : 'Create staff account'
        }
        description="Use fictional values only. Fixed roles combine their demo capabilities."
        onClose={closeEditor}
      >
        <form className={styles.form} onSubmit={saveAccount}>
          {editor?.mode === 'create' ? (
            <InputField
              label="Staff ID"
              value={form.staffId}
              onChange={(event) => {
                const staffId = event.currentTarget.value;
                setForm((current) => ({ ...current, staffId }));
              }}
              hint="Use a fictional identifier beginning with staff:."
            />
          ) : (
            <p>
              <strong>Fictional staff ID:</strong> {form.staffId}
            </p>
          )}
          <InputField
            label="Fictional identity subject"
            value={form.identitySubject}
            onChange={(event) => {
              const identitySubject = event.currentTarget.value;
              setForm((current) => ({ ...current, identitySubject }));
            }}
            hint={
              editor?.mode === 'edit'
                ? 'Optional replacement; leave blank to keep the current fictional association.'
                : 'Use a fictional subject beginning with identity:.'
            }
          />
          <CheckboxField
            label="Active account"
            checked={form.active}
            onChange={(event) => {
              const active = event.currentTarget.checked;
              setForm((current) => ({ ...current, active }));
            }}
          />
          <fieldset className={styles.fieldset}>
            <legend>Fixed roles</legend>
            {STAFF_ROLES.map((role) => (
              <CheckboxField
                key={role.value}
                label={`${role.label} role`}
                checked={form.assignedRoles.includes(role.value)}
                onChange={(event) =>
                  toggleRole(role.value, event.currentTarget.checked)
                }
              />
            ))}
          </fieldset>
          <fieldset className={styles.fieldset}>
            <legend>Assigned classes</legend>
            <p>Coach demo access is limited to these fictional classes.</p>
            {demo.state.classes.map((scheduledClass) => (
              <CheckboxField
                key={scheduledClass.classId}
                label={`Assign to class ${scheduledClass.classId}`}
                checked={form.assignedClassIds.includes(scheduledClass.classId)}
                onChange={(event) =>
                  toggleClass(
                    scheduledClass.classId,
                    event.currentTarget.checked,
                  )
                }
              />
            ))}
          </fieldset>
          {error && <Alert>{error}</Alert>}
          <div className={styles.formActions}>
            <Button type="submit">
              {editor?.mode === 'edit' ? 'Save account' : 'Create account'}
            </Button>
            <Button variant="secondary" onClick={closeEditor}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmationDialog
        open={deactivating !== null}
        title="Deactivate staff account?"
        description={
          deactivating
            ? `Deactivate ${deactivating.staffId}? This changes only fictional demo access.`
            : ''
        }
        confirmLabel="Deactivate account"
        onConfirm={deactivateAccount}
        onCancel={() => setDeactivating(null)}
      />
    </main>
  );
}
