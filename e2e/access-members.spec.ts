import { openControls } from './workspace';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Public fixture identifiers stay local because e2e is a separate TS project.
const ids = {
  staff: {
    admin: 'staff:demo-admin',
    frontDesk: 'staff:demo-front-desk',
    coach: 'staff:demo-coach',
    multiRole: 'staff:demo-front-desk-coach',
    inactive: 'staff:demo-inactive',
  },
  members: {
    maple: 'member:maple',
    cedar: 'member:cedar',
    aspen: 'member:aspen',
  },
  invitations: {
    outstanding: 'invitation:demo-outstanding',
    expired: 'invitation:demo-expired',
    revoked: 'invitation:demo-revoked',
    superseded: 'invitation:demo-superseded',
    maple: 'invitation:maple',
  },
  classes: {
    history: 'class:demo-history',
    checkIn: 'class:demo-check-in',
    free: 'class:demo-free',
    full: 'class:demo-full',
  },
  stations: { west: 'station:demo-west' },
} as const;
const SCENARIO_IDS = {
  baseline: 'scenario:baseline',
  invitationMemberCap: 'scenario:invitation-member-cap',
} as const;

const operationalRequests = new WeakMap<Page, string[]>();
const browserErrors = new WeakMap<Page, string[]>();
const acceptedMemberId = `member:accept-${ids.invitations.outstanding}`;

async function route(page: Page, path: string) {
  await page.goto(`#${path}`);
  await openControls(page);
  await noCredentials(page);
}

async function persona(page: Page, id: string) {
  await page.getByLabel('Persona', { exact: true }).selectOption(id);
  await expect(page.getByLabel('Persona', { exact: true })).toHaveValue(id);
  const label = await page
    .getByLabel('Persona', { exact: true })
    .locator('option:checked')
    .textContent();
  await expect(page.getByLabel('Active persona')).toHaveText(label!);
  await expect(page.getByLabel('Active persona')).toHaveCount(1);
}

async function noCredentials(page: Page) {
  await expect(
    page.locator(
      'input[type="password"], input[autocomplete="username"], input[autocomplete="current-password"], input[autocomplete="new-password"], input[autocomplete="one-time-code"]',
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole('textbox', {
      name: /password|passcode|verification code|login|credential|api key/i,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Persona selection is not authentication.', {
      exact: false,
    }),
  ).toBeVisible();
}

async function unavailable(page: Page, path: string) {
  await route(page, path);
  await expect(
    page.getByRole('heading', { name: 'Demo access unavailable' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Hidden actions demonstrate role limitations, not authentication or production authorization.',
    ),
  ).toBeVisible();
  await expect(page.locator('#demo-workspace input')).toHaveCount(0);
}

async function unusableInvitation(page: Page, message: string) {
  await route(page, '/invitations');
  await expect(
    page.getByRole('heading', { name: 'Invitation acceptance' }),
  ).toBeVisible();
  await expect(page.locator('#demo-workspace').getByRole('alert')).toHaveText(
    message,
  );
  await expect(
    page.getByRole('button', { name: 'Complete acceptance' }),
  ).toHaveCount(0);
  await expect(page.locator('#demo-workspace input')).toHaveCount(0);
}

async function loadScenario(
  page: Page,
  id: string,
  actor: string,
  now: string,
) {
  await page.getByRole('button', { name: '+1 minute', exact: true }).click();
  await expect(
    page.getByText('Local demo edits present.', { exact: false }),
  ).toBeVisible();
  await page.getByLabel('Named scenario').selectOption(id);
  await page
    .getByRole('button', { name: 'Load scenario', exact: true })
    .click();
  const confirmation = page.getByRole('alertdialog', {
    name: 'Replace edited demo state?',
  });
  await expect(confirmation).toBeVisible();
  await expect(page.getByLabel('Frozen demo clock')).not.toHaveText(now);
  await confirmation
    .getByRole('button', { name: 'Replace demo state' })
    .click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByLabel('Named scenario')).toHaveValue(id);
  await expect(page.getByLabel('Persona', { exact: true })).toHaveValue(actor);
  await expect(page.getByLabel('Frozen demo clock')).toHaveText(now);
  await expect(
    page.getByText('Unedited fictional snapshot.', { exact: false }),
  ).toBeVisible();
}

async function acceptance(page: Page, version = 2) {
  await persona(page, ids.invitations.outstanding);
  await route(page, '/invitations');
  await expect(
    page.getByRole('heading', { name: 'Invitation acceptance', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Identity verification and email delivery are local simulations/,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/Local demo subject only. No credentials/),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: `Current waiver version ${version}` }),
  ).toBeVisible();
  await noCredentials(page);
}

async function fillAcceptance(page: Page) {
  await page
    .getByLabel('Display name', { exact: true })
    .fill('Fictional Rowan');
  await page.getByLabel('I attest that I am at least 18').check();
  await page
    .getByLabel('Typed signature', { exact: true })
    .fill('Fictional Rowan');
}

async function accept(page: Page, status: 'active' | 'pending', version = 2) {
  await page.getByRole('button', { name: 'Complete acceptance' }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: `Invitation accepted: ${status}.` }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Complete acceptance' }),
  ).toHaveCount(0);
  await persona(page, acceptedMemberId);
  await route(page, '/members');
  await expect(
    page.getByText(
      `Fictional Rowan; invitee@example.invalid; status: ${status}`,
    ),
  ).toBeVisible();
  await expect(
    page.getByText('Waiver: current', { exact: true }),
  ).toBeVisible();
  await route(page, '/waivers');
  const signatures = page.getByRole('table', {
    name: 'Signature history',
  });
  await expect(signatures.getByRole('row')).toHaveCount(2);
  await expect(signatures).toContainText(`Version ${version}`);
  await expect(signatures).toContainText('Fictional Rowan');
  await expect(signatures).toContainText('2026-10-05T15:45:00Z');
}

test.beforeEach(async ({ page, baseURL }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  const origin = new URL(baseURL!).origin;
  operationalRequests.set(page, requests);
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (
      ['fetch', 'xhr', 'websocket'].includes(request.resourceType()) ||
      new URL(request.url()).origin !== origin
    ) {
      requests.push(request.url());
    }
  });
  await page.goto(`${baseURL}#/`);
  await openControls(page);
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  const confirmation = page.getByRole('alertdialog', {
    name: 'Reset demo?',
  });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Reset data' }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByLabel('Named scenario')).toHaveValue(
    SCENARIO_IDS.baseline,
  );
  await expect(page.getByLabel('Persona', { exact: true })).toHaveValue(
    ids.staff.admin,
  );
  await expect(page.getByLabel('Frozen demo clock')).toHaveText(
    '2026-10-05T15:45:00Z',
  );
  await expect(
    page.getByText('Unedited fictional snapshot.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText('Demo · resets on refresh', { exact: true }),
  ).toBeVisible();
});

test.afterEach(async ({ page }) => {
  await noCredentials(page);
  expect(operationalRequests.get(page)).toEqual([]);
  expect(browserErrors.get(page)).toEqual([]);
});

test('Admin creates, edits and deactivates fictional staff through visible controls @smoke', async ({
  page,
}) => {
  await route(page, '/schedule');
  await expect(
    page.getByRole('form', { name: 'Weekly template editor' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Apply template', exact: true }),
  ).toBeEnabled();
  await route(page, '/settings');
  await expect(
    page.getByRole('heading', { name: 'Admin settings' }),
  ).toBeVisible();
  await route(page, '/staff');
  await page
    .getByRole('button', { name: 'Create staff account', exact: true })
    .click();
  const editor = page.getByRole('dialog', { name: 'Create staff account' });
  await editor
    .getByLabel('Staff ID', { exact: true })
    .fill('staff:browser-rowan');
  await editor
    .getByLabel('Simulated identity subject')
    .fill('identity:browser-rowan');
  await editor.getByLabel('Front Desk role').check();
  await editor.getByLabel('Coach role').check();
  await editor.getByLabel(`Assign to class ${ids.classes.checkIn}`).check();
  await noCredentials(page);
  await editor
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Staff account created' }),
  ).toBeVisible();
  const row = page
    .getByRole('table', { name: 'Staff accounts' })
    .getByRole('row')
    .filter({ hasText: 'staff:browser-rowan' });
  await expect(row).toContainText('Front Desk, Coach');
  const capabilities = page.getByRole('list', {
    name: 'Capabilities for staff:browser-rowan',
  });
  await expect(capabilities).toContainText('Manage members');
  await expect(capabilities).toContainText(
    'Edit own coach biography and photo',
  );
  await expect(capabilities).not.toContainText('Manage the schedule');
  await row.getByRole('button', { name: 'Edit staff:browser-rowan' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit staff account' });
  await edit.getByLabel('Front Desk role').uncheck();
  await edit.getByRole('button', { name: 'Save account' }).click();
  await expect(row).not.toContainText('Front Desk');
  await expect(
    page.getByText(`Class access is limited to: ${ids.classes.checkIn}`),
  ).toBeVisible();
  await row
    .getByRole('button', { name: 'Deactivate staff:browser-rowan' })
    .click();
  await page
    .getByRole('alertdialog', { name: 'Deactivate staff account?' })
    .getByRole('button', { name: 'Deactivate account', exact: true })
    .click();
  await expect(row).toContainText('Inactive');
  await expect(
    row.getByRole('button', { name: 'Deactivate staff:browser-rowan' }),
  ).toBeDisabled();
  await persona(page, 'staff:browser-rowan');
  await unavailable(page, '/attendance');
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Inactive staff cannot perform demo actions.' }),
  ).toHaveCount(2);
});

test('Front Desk manages members and all rosters but cannot edit schedule or Admin surfaces @smoke', async ({
  page,
}) => {
  await persona(page, ids.staff.frontDesk);
  await route(page, '/members');
  await expect(
    page.getByRole('button', { name: 'Create invitation' }),
  ).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Edit profile' })).toHaveCount(
    8,
  );
  await route(page, '/attendance');
  await page.getByLabel('Attendance class').selectOption(ids.classes.full);
  await expect(
    page.getByRole('table', { name: 'Class attendance roster' }),
  ).toContainText('Maya Chen');
  await expect(
    page.getByRole('button', { name: 'Check in Jordan Brooks', exact: true }),
  ).toBeEnabled();
  await route(page, '/bookings');
  await page
    .getByLabel('Class', { exact: true })
    .selectOption(ids.classes.free);
  await expect(
    page.getByRole('region', { name: 'Staff booking controls' }),
  ).toBeVisible();
  await route(page, '/schedule');
  await expect(
    page.getByText('Schedule is read-only for this persona.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('form', { name: 'Weekly template editor' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Apply template' }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Class start time')).toHaveCount(0);
  await route(page, '/waivers');
  await page.getByLabel('Member to inspect').selectOption(ids.members.aspen);
  await expect(
    page.getByText('Outdated signature', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Publish version|Create draft/ }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Typed name')).toHaveCount(0);
  await route(page, '/coaches');
  await expect(
    page.getByRole('button', { name: 'Save coach profile' }),
  ).toHaveCount(0);
  for (const [path, explanation] of [
    ['/stations', 'Station management is read-only for this persona.'],
    ['/classes', 'Class type management is read-only for this persona.'],
  ]) {
    await route(page, path);
    await expect(page.getByText(explanation, { exact: false })).toBeVisible();
  }
  for (const path of ['/staff', '/settings']) await unavailable(page, path);
});

test('Coach can act only on assigned classes and edit only their own biography and avatar @smoke', async ({
  page,
}) => {
  await persona(page, ids.staff.coach);
  await expect(
    page.getByText(/Coach actions are limited to assigned classes/),
  ).toBeVisible();
  await route(page, '/attendance');
  const classes = page.getByLabel('Attendance class');
  await expect(classes.locator('option')).toHaveCount(3);
  await expect(
    classes.locator(`option[value="${ids.classes.full}"]`),
  ).toHaveCount(0);
  await expect(
    classes.locator(`option[value="${ids.classes.free}"]`),
  ).toHaveCount(0);
  await classes.selectOption(ids.classes.checkIn);
  await page
    .getByRole('button', { name: 'Check in Jordan Brooks', exact: true })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Simulated check-in recorded.' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('table', { name: 'Class attendance roster' })
      .getByRole('row')
      .filter({ hasText: 'Jordan Brooks' }),
  ).toContainText('Checked in at 2026-10-05T15:45:00Z');
  await route(page, '/bookings');
  await expect(
    page
      .getByLabel('Class', { exact: true })
      .locator(`option[value="${ids.classes.full}"]`),
  ).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Staff booking controls' }),
  ).toBeVisible();
  await route(page, '/coaches');
  const own = page.getByRole('form', { name: 'Edit Alex Rivera' });
  await expect(own).toBeVisible();
  await expect(
    page.getByRole('form', { name: 'Edit Morgan Ellis' }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Coach name')).toHaveCount(0);
  await expect(page.getByLabel('Staff email')).toHaveCount(0);
  await own
    .getByLabel('Biography')
    .fill('Fictional browser-tested Indigo biography.');
  await own.getByLabel('Generated avatar').selectOption('avatar:local-indigo');
  await own.getByRole('button', { name: 'Save coach profile' }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Coach profile saved in the local demo.' }),
  ).toBeVisible();
  await route(page, '/schedule');
  await expect(
    page.getByText('Schedule is read-only for this persona.', { exact: false }),
  ).toBeVisible();
  await route(page, '/coaches');
  await expect(page.getByLabel('Biography')).toHaveValue(
    'Fictional browser-tested Indigo biography.',
  );
  await expect(
    page.getByLabel('Generated avatar', { exact: true }),
  ).toHaveValue('avatar:local-indigo');
  for (const path of ['/members', '/invitations', '/staff', '/settings'])
    await unavailable(page, path);
});

test('one multi-role account combines Front Desk and Coach capabilities without acquiring Admin rights', async ({
  page,
}) => {
  await persona(page, ids.staff.multiRole);
  await expect(page.getByLabel('Active persona')).toHaveText(
    'Morgan Ellis - Front Desk + Coach',
  );
  await expect(
    page.getByText('Class action scope: all classes.', { exact: false }),
  ).toBeVisible();
  await route(page, '/members');
  await expect(
    page.getByRole('button', { name: 'Create invitation' }),
  ).toBeEnabled();
  await route(page, '/attendance');
  await page.getByLabel('Attendance class').selectOption(ids.classes.checkIn);
  await page
    .getByRole('button', { name: 'Check in Jordan Brooks', exact: true })
    .click();
  await expect(
    page
      .getByRole('table', { name: 'Class attendance roster' })
      .getByRole('row')
      .filter({ hasText: 'Jordan Brooks' }),
  ).toContainText('Checked in at');
  await route(page, '/coaches');
  const own = page.getByRole('form', { name: 'Edit Morgan Ellis' });
  await own
    .getByLabel('Biography')
    .fill('Fictional Coral multi-role biography.');
  await own.getByRole('button', { name: 'Save coach profile' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Coach profile saved' }),
  ).toBeVisible();
  await expect(
    page.getByRole('form', { name: 'Edit Alex Rivera' }),
  ).toHaveCount(0);
  await route(page, '/schedule');
  await expect(
    page.getByRole('button', { name: 'Apply template' }),
  ).toHaveCount(0);
  for (const path of ['/staff', '/settings']) await unavailable(page, path);
});

test('switching personas replaces rather than accumulates permissions and inactive staff cannot act', async ({
  page,
}) => {
  const nav = page.getByRole('navigation', { name: 'Demo navigation' });
  await expect(page.getByLabel('Persona', { exact: true })).toHaveCount(1);
  await expect(page.getByLabel('Persona', { exact: true })).not.toHaveAttribute(
    'multiple',
  );
  await persona(page, ids.staff.multiRole);
  await expect(
    nav.getByRole('link', { name: 'Members', exact: true }),
  ).toBeVisible();
  await persona(page, ids.staff.coach);
  await expect(
    nav.getByRole('link', { name: 'Members', exact: true }),
  ).toHaveCount(0);
  await persona(page, ids.staff.admin);
  await expect(
    nav.getByRole('link', { name: 'Staff access', exact: true }),
  ).toBeVisible();
  await persona(page, ids.staff.inactive);
  await expect(nav.getByRole('link')).toHaveCount(1);
  await expect(
    nav.getByRole('link', { name: 'Demo overview', exact: true }),
  ).toBeVisible();
  for (const path of [
    '/staff',
    '/members',
    '/schedule',
    '/bookings',
    '/attendance',
    '/waivers',
  ])
    await unavailable(page, path);
  await persona(page, ids.staff.frontDesk);
  await expect(
    nav.getByRole('link', { name: 'Staff access', exact: true }),
  ).toHaveCount(0);
  await route(page, '/schedule');
  await expect(
    page.getByText(/Read-only schedule: only an active Admin/),
  ).toBeVisible();
  await persona(page, ids.members.cedar);
  await route(page, '/members');
  await expect(
    page.getByRole('heading', { name: 'Your membership' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit profile' })).toHaveCount(
    0,
  );
  await expect(
    nav.getByRole('link', { name: 'Staff access', exact: true }),
  ).toHaveCount(0);
  await persona(page, ids.invitations.outstanding);
  await route(page, '/invitations');
  await expect(
    page.getByRole('button', { name: 'Complete acceptance' }),
  ).toBeEnabled();
  await expect(nav.getByRole('link')).toHaveCount(2);
  await expect(
    nav.getByRole('link', { name: 'Bookings', exact: true }),
  ).toHaveCount(0);
});

test('Front Desk creates, resends and revokes invitations with renewed expiry and unusable old links', async ({
  page,
}) => {
  await persona(page, ids.staff.frontDesk);
  await route(page, '/members');
  const table = page.getByRole('table', { name: 'Invitations' });
  const originalRows = await table.getByRole('row').count();
  await page
    .getByLabel('Invitation email')
    .fill('rowan-browser@example.invalid');
  await page.getByRole('button', { name: 'Create invitation' }).click();
  const original = table
    .getByRole('row')
    .filter({ hasText: 'rowan-browser@example.invalid' });
  await expect(original).toContainText('outstanding');
  await expect(original).toContainText('2026-10-12T15:45:00Z');
  await expect(table.getByRole('row')).toHaveCount(originalRows + 1);
  const originalId = await page
    .getByLabel('Persona', { exact: true })
    .getByRole('option')
    .filter({ hasText: /rowan-browser@example.invalid.*outstanding/ })
    .getAttribute('value');
  expect(originalId).not.toBeNull();
  await page.getByRole('button', { name: '+1 minute', exact: true }).click();
  await original.getByRole('button', { name: 'Resend', exact: true }).click();
  const rows = table
    .getByRole('row')
    .filter({ hasText: 'rowan-browser@example.invalid' });
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'superseded' })).toContainText(
    '2026-10-12T15:45:00Z',
  );
  const replacement = rows.filter({
    has: page.getByRole('cell', { name: 'outstanding', exact: true }),
  });
  await expect(replacement).toContainText('2026-10-12T15:46:00Z');
  await expect(
    page.getByText(
      'rowan-browser@example.invalid: simulated sent; attempts: 1',
    ),
  ).toHaveCount(2);
  const replacementId = await page
    .getByLabel('Persona', { exact: true })
    .getByRole('option')
    .filter({ hasText: /rowan-browser@example.invalid.*outstanding/ })
    .getAttribute('value');
  expect(replacementId).not.toBe(originalId);
  await persona(page, originalId!);
  await unusableInvitation(
    page,
    'Select an outstanding invitation to accept it.',
  );
  await persona(page, ids.staff.frontDesk);
  await route(page, '/members');
  await replacement
    .getByRole('button', { name: 'Revoke', exact: true })
    .click();
  await expect(rows.filter({ hasText: 'revoked' })).toBeVisible();
  await expect(rows.getByRole('button')).toHaveCount(0);
  await persona(page, replacementId!);
  await unusableInvitation(page, 'This invitation has been revoked.');
  await expect(
    page.getByRole('button', { name: 'Complete acceptance' }),
  ).toHaveCount(0);
});

test('a user-created invitation becomes unusable at its exact expiry without consuming membership capacity', async ({
  page,
}) => {
  await persona(page, ids.staff.frontDesk);
  await route(page, '/members');
  await page
    .getByLabel('Invitation email')
    .fill('expiry-browser@example.invalid');
  await page.getByRole('button', { name: 'Create invitation' }).click();
  const row = page
    .getByRole('table', { name: 'Invitations' })
    .getByRole('row')
    .filter({ hasText: 'expiry-browser@example.invalid' });
  await expect(row).toContainText('2026-10-12T15:45:00Z');
  const invitationId = await page
    .getByLabel('Persona', { exact: true })
    .getByRole('option')
    .filter({ hasText: 'expiry-browser@example.invalid' })
    .getAttribute('value');
  expect(invitationId).not.toBeNull();
  await expect(
    page.getByText('Active members: 6 / 8.', { exact: false }),
  ).toBeVisible();
  for (let day = 0; day < 7; day++) {
    await page.getByRole('button', { name: '+1 day', exact: true }).click();
  }
  await expect(page.getByLabel('Frozen demo clock')).toHaveText(
    '2026-10-12T15:45:00Z',
  );
  await expect(
    row.getByRole('cell', { name: 'expired (clock)', exact: true }),
  ).toBeVisible();
  await expect(row.getByRole('button')).toHaveCount(0);
  await persona(page, invitationId!);
  await unusableInvitation(page, 'This invitation has expired.');
  await persona(page, ids.staff.frontDesk);
  await route(page, '/members');
  await expect(
    page.getByRole('table', { name: 'Gym members' }).getByRole('row'),
  ).toHaveCount(9);
  await expect(
    page.getByText('Active members: 6 / 8.', { exact: false }),
  ).toBeVisible();
});

for (const email of [
  '',
  'not-an-email',
  'INVITEE@example.invalid',
  'MAYA.CHEN@example.invalid',
]) {
  test(`invalid or duplicate invitation is rejected without a new record: ${email || 'blank'}`, async ({
    page,
  }) => {
    await route(page, '/members');
    const invitations = page.getByRole('table', {
      name: 'Invitations',
    });
    const members = page.getByRole('table', { name: 'Gym members' });
    const before = await invitations.textContent();
    const memberBefore = await members.textContent();
    await page.getByLabel('Invitation email').fill(email);
    await page.getByRole('button', { name: 'Create invitation' }).click();
    await expect(
      page.locator('div[role="alert"]').filter({
        hasText: email.includes('@')
          ? /already|duplicate/i
          : 'A valid invitation email is required.',
      }),
    ).toBeVisible();
    await expect(page.getByLabel('Invitation email')).toHaveValue(email);
    await expect(invitations).toHaveText(before!);
    await expect(members).toHaveText(memberBefore!);
    await expect(
      page.getByText('Invitation created in local demo state.', {
        exact: true,
      }),
    ).toHaveCount(0);
  });
}

test('incomplete acceptance preserves the invitation until display name, adult attestation and current signature are supplied @smoke', async ({
  page,
}) => {
  await acceptance(page);
  await page.getByRole('button', { name: 'Complete acceptance' }).click();
  await expect(
    page.getByLabel('Display name', { exact: true }),
  ).toHaveAttribute('aria-invalid', 'true');
  await expect(
    page
      .locator('div[role="alert"]')
      .filter({ hasText: 'A display name is required.' }),
  ).toBeVisible();
  await page
    .getByLabel('Display name', { exact: true })
    .fill('Fictional Rowan');
  await page.getByRole('button', { name: 'Complete acceptance' }).click();
  await expect(
    page
      .locator('div[role="alert"]')
      .filter({ hasText: 'An explicit adult attestation is required.' }),
  ).toBeVisible();
  await page.getByLabel('I attest that I am at least 18').check();
  await page.getByRole('button', { name: 'Complete acceptance' }).click();
  await expect(
    page.getByLabel('Typed signature', { exact: true }),
  ).toHaveAttribute('aria-invalid', 'true');
  await expect(
    page
      .locator('div[role="alert"]')
      .filter({ hasText: 'A typed waiver signature name is required.' }),
  ).toBeVisible();
  await expect(
    page.getByText('Invitation accepted:', { exact: false }),
  ).toHaveCount(0);
  await persona(page, ids.staff.frontDesk);
  await route(page, '/members');
  await expect(
    page.getByRole('table', { name: 'Gym members' }).getByRole('row'),
  ).toHaveCount(9);
  await expect(
    page
      .getByRole('table', { name: 'Invitations' })
      .getByRole('row')
      .filter({ hasText: 'invitee@example.invalid' }),
  ).toContainText('outstanding');
  await acceptance(page);
  await fillAcceptance(page);
  await accept(page, 'active');
  await persona(page, ids.staff.frontDesk);
  await route(page, '/members');
  await expect(
    page
      .getByRole('table', { name: 'Invitations' })
      .getByRole('row')
      .filter({ hasText: 'invitee@example.invalid' }),
  ).toContainText('accepted');
  await expect(
    page.getByText('Active members: 7 / 8.', { exact: false }),
  ).toBeVisible();
  await persona(page, ids.invitations.outstanding);
  await unusableInvitation(
    page,
    'Select an outstanding invitation to accept it.',
  );
});

for (const outcome of ['rejected', 'mismatched'] as const) {
  test(`${outcome} simulated identity cannot consume an invitation or create a member`, async ({
    page,
  }) => {
    await acceptance(page);
    await fillAcceptance(page);
    await page.getByLabel('Simulated identity outcome').selectOption(outcome);
    await page.getByRole('button', { name: 'Complete acceptance' }).click();
    await expect(
      page.getByRole('alert').filter({
        hasText:
          outcome === 'rejected'
            ? 'The local simulated identity was rejected.'
            : 'The verified identity must match the invitation email.',
      }),
    ).toBeVisible();
    await expect(page.getByLabel('Display name', { exact: true })).toHaveValue(
      'Fictional Rowan',
    );
    await expect(
      page.getByLabel('Typed signature', { exact: true }),
    ).toHaveValue('Fictional Rowan');
    await expect(
      page.getByLabel('I attest that I am at least 18'),
    ).toBeChecked();
    await persona(page, ids.staff.frontDesk);
    await route(page, '/members');
    await expect(
      page.getByRole('table', { name: 'Gym members' }).getByRole('row'),
    ).toHaveCount(9);
    await expect(
      page
        .getByRole('table', { name: 'Invitations' })
        .getByRole('row')
        .filter({ hasText: 'invitee@example.invalid' }),
    ).toContainText('outstanding');
    await acceptance(page);
    await fillAcceptance(page);
    await page
      .getByLabel('Simulated identity outcome')
      .selectOption('verified');
    await accept(page, 'active');
  });
}

for (const [invitation, message] of [
  [ids.invitations.expired, 'This invitation has expired.'],
  [ids.invitations.revoked, 'This invitation has been revoked.'],
  [
    ids.invitations.superseded,
    'Select an outstanding invitation to accept it.',
  ],
  [ids.invitations.maple, 'Select an outstanding invitation to accept it.'],
]) {
  test(`unusable invitation has no acceptance controls: ${invitation}`, async ({
    page,
  }) => {
    await persona(page, invitation);
    await unusableInvitation(page, message);
    await expect(
      page.getByRole('button', { name: 'Complete acceptance' }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel('Typed signature', { exact: true }),
    ).toHaveCount(0);
    await persona(page, ids.staff.frontDesk);
    await route(page, '/members');
    await expect(
      page.getByRole('table', { name: 'Gym members' }).getByRole('row'),
    ).toHaveCount(9);
  });
}

test('cap-full acceptance records a pending signature but forbids booking and check-in until staff frees capacity', async ({
  page,
}) => {
  await loadScenario(
    page,
    SCENARIO_IDS.invitationMemberCap,
    ids.invitations.outstanding,
    '2026-10-05T15:45:00Z',
  );
  await acceptance(page);
  await fillAcceptance(page);
  await accept(page, 'pending');
  await route(page, '/bookings');
  await page
    .getByLabel('Class', { exact: true })
    .selectOption(ids.classes.free);
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Only active members may book or check in.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Book station', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('Free station', { exact: true })).toBeDisabled();
  await route(page, '/attendance');
  await expect(page.getByLabel('Attendance class')).toBeDisabled();
  await expect(
    page.getByRole('button', { name: /Check in Fictional Rowan/ }),
  ).toHaveCount(0);
  await persona(page, ids.staff.frontDesk);
  await route(page, '/members');
  const members = page.getByRole('table', { name: 'Gym members' });
  const rowan = members.getByRole('row').filter({ hasText: 'Fictional Rowan' });
  await rowan.getByRole('button', { name: 'Activate', exact: true }).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'The active-member cap has been reached.' }),
  ).toBeVisible();
  await expect(rowan).toContainText('pending');
  await members
    .getByRole('row')
    .filter({ hasText: 'Maya Chen' })
    .getByRole('button', { name: 'Deactivate', exact: true })
    .click();
  await rowan.getByRole('button', { name: 'Activate', exact: true }).click();
  await expect(rowan).toContainText('active');
  await persona(page, acceptedMemberId);
  await route(page, '/bookings');
  await page
    .getByLabel('Class', { exact: true })
    .selectOption(ids.classes.free);
  await page
    .getByLabel('Free station', { exact: true })
    .selectOption(ids.stations.west);
  await page.getByRole('button', { name: 'Book station', exact: true }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Booking confirmed in this demo.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Your bookings' }),
  ).toContainText('Fictional Rowan');
});

test('profile correction preserves stable persona, invitation, signatures, bookings and attendance correction history', async ({
  page,
}) => {
  await persona(page, ids.staff.frontDesk);
  await route(page, '/waivers');
  await page.getByLabel('Member to inspect').selectOption(ids.members.maple);
  const signatureBefore = await page
    .getByRole('table', { name: 'Signature history' })
    .textContent();
  const bookingsBefore = await page
    .getByRole('table', { name: 'Existing demo bookings' })
    .textContent();
  await route(page, '/attendance');
  await page.getByLabel('Attendance class').selectOption(ids.classes.history);
  await page.getByLabel('Attendance record', { exact: true }).selectOption({
    label: 'Maya Chen',
  });
  await page.getByLabel('Corrected outcome').selectOption('noShow');
  await page
    .getByLabel('Correction reason', { exact: true })
    .fill('Fictional browser profile-history marker.');
  await page
    .getByRole('button', { name: 'Save attendance correction' })
    .click();
  const mapleAttendance = page
    .getByRole('table', { name: 'Class attendance roster' })
    .getByRole('row')
    .filter({ hasText: 'Maya Chen' });
  await expect(mapleAttendance).toContainText(
    'Attended to No-show - Fictional browser profile-history marker.',
  );
  const attendanceBefore = await mapleAttendance.textContent();
  await route(page, '/members');
  const invitationsBefore = await page
    .getByRole('table', { name: 'Invitations' })
    .textContent();
  await page
    .getByRole('table', { name: 'Gym members' })
    .getByRole('row')
    .filter({ hasText: 'Maya Chen' })
    .getByRole('button', { name: 'Edit profile' })
    .click();
  await expect(
    page.getByText(`Stable member ID: ${ids.members.maple}`, { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Member display name').fill('Maya Chen Revised');
  await page
    .getByLabel('Verified profile email')
    .fill('maple-revised@example.invalid');
  await page
    .getByLabel('Contact email', { exact: true })
    .fill('maple-contact@example.invalid');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(
    page.getByRole('status').filter({
      hasText:
        'Stable member ID, identity association, and linked history retained.',
    }),
  ).toBeVisible();
  await expect(page.getByRole('table', { name: 'Invitations' })).toHaveText(
    invitationsBefore!,
  );
  await route(page, '/waivers');
  await page.getByLabel('Member to inspect').selectOption(ids.members.maple);
  await expect(
    page.getByRole('table', { name: 'Signature history' }),
  ).toHaveText(signatureBefore!);
  await expect(
    page.getByRole('table', { name: 'Existing demo bookings' }),
  ).toHaveText(bookingsBefore!);
  await route(page, '/attendance');
  await page.getByLabel('Attendance class').selectOption(ids.classes.history);
  await expect(mapleAttendance).toHaveText(
    attendanceBefore!.replaceAll('Maya Chen', 'Maya Chen Revised'),
  );
  await persona(page, ids.members.maple);
  await route(page, '/members');
  await expect(
    page.getByText(
      'Maya Chen Revised; maple-revised@example.invalid; status: active',
    ),
  ).toBeVisible();
  await route(page, '/attendance');
  await page.getByLabel('Attendance class').selectOption(ids.classes.checkIn);
  await expect(
    page.getByRole('button', {
      name: 'Check in Maya Chen Revised',
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole('table', { name: 'Class attendance roster' }),
  ).toContainText('Checked in at 2026-10-05T15:35:00Z');
});

test('duplicate active profile email is rejected without changing the stable member or linked evidence', async ({
  page,
}) => {
  await persona(page, ids.staff.frontDesk);
  await route(page, '/members');
  const members = page.getByRole('table', { name: 'Gym members' });
  const before = await members.textContent();
  const invitations = page.getByRole('table', {
    name: 'Invitations',
  });
  const invitationsBefore = await invitations.textContent();
  await members
    .getByRole('row')
    .filter({ hasText: 'Jordan Brooks' })
    .getByRole('button', { name: 'Edit profile' })
    .click();
  await page
    .getByLabel('Verified profile email')
    .fill('MAYA.CHEN@example.invalid');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(
    page.locator('div[role="alert"]').filter({ hasText: /already|duplicate/i }),
  ).toBeVisible();
  await expect(page.getByLabel('Verified profile email')).toHaveValue(
    'MAYA.CHEN@example.invalid',
  );
  await expect(
    page.getByText(`Stable member ID: ${ids.members.cedar}`, { exact: true }),
  ).toBeVisible();
  await expect(members).toHaveText(before!);
  await expect(invitations).toHaveText(invitationsBefore!);
  await expect(
    page.getByRole('status').filter({ hasText: 'Profile corrected.' }),
  ).toHaveCount(0);
  await persona(page, ids.members.cedar);
  await route(page, '/members');
  await expect(
    page.getByText(
      'Jordan Brooks; jordan.brooks@example.invalid; status: active',
    ),
  ).toBeVisible();
  await expect(
    page.getByText('Waiver: current', { exact: true }),
  ).toBeVisible();
});

test('denying adult eligibility deactivates a member without cancelling bookings and staff must restore eligibility before activation', async ({
  page,
}) => {
  await persona(page, ids.staff.frontDesk);
  await route(page, '/waivers');
  await page.getByLabel('Member to inspect').selectOption(ids.members.cedar);
  const existing = page.getByRole('table', { name: 'Existing demo bookings' });
  const before = await existing.textContent();
  await route(page, '/members');
  const row = page
    .getByRole('table', { name: 'Gym members' })
    .getByRole('row')
    .filter({ hasText: 'Jordan Brooks' });
  await row.getByRole('button', { name: 'Edit profile' }).click();
  await page.getByLabel('Adult eligibility correction').selectOption('denied');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(
    row.getByRole('cell', { name: 'inactive', exact: true }),
  ).toBeVisible();
  await row.getByRole('button', { name: 'Activate', exact: true }).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Adult eligibility must be attested.' }),
  ).toBeVisible();
  await route(page, '/waivers');
  await page.getByLabel('Member to inspect').selectOption(ids.members.cedar);
  await expect(existing).toHaveText(before!);
  await expect(
    page.getByText('Current signature', { exact: true }),
  ).toBeVisible();
  await persona(page, ids.members.cedar);
  await route(page, '/attendance');
  await page.getByLabel('Attendance class').selectOption(ids.classes.checkIn);
  await expect(
    page.getByRole('button', { name: 'Check in Jordan Brooks', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('table', { name: 'Class attendance roster' }),
  ).toContainText('Only active members');
  await route(page, '/bookings');
  await page
    .getByLabel('Class', { exact: true })
    .selectOption(ids.classes.free);
  await expect(
    page.getByRole('button', { name: 'Book station', exact: true }),
  ).toBeDisabled();
  await persona(page, ids.staff.frontDesk);
  await route(page, '/members');
  await row.getByRole('button', { name: 'Edit profile' }).click();
  await page
    .getByLabel('Adult eligibility correction')
    .selectOption('attested');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await row.getByRole('button', { name: 'Activate', exact: true }).click();
  await expect(
    row.getByRole('cell', { name: 'active', exact: true }),
  ).toBeVisible();
  await persona(page, ids.members.cedar);
  await route(page, '/attendance');
  await page.getByLabel('Attendance class').selectOption(ids.classes.checkIn);
  await page
    .getByRole('button', { name: 'Check in Jordan Brooks', exact: true })
    .click();
  await expect(
    page.getByRole('table', { name: 'Class attendance roster' }),
  ).toContainText('Checked in at 2026-10-05T15:45:00Z');
});

test('invitation acceptance signs the newly published current waiver, not the previous version', async ({
  page,
}) => {
  await route(page, '/waivers');
  await page
    .getByRole('button', { name: 'Publish version 3', exact: true })
    .click();
  await page
    .getByRole('alertdialog', { name: 'Publish waiver?' })
    .getByRole('button', { name: 'Publish version', exact: true })
    .click();
  await acceptance(page, 3);
  await expect(
    page.getByRole('region', { name: 'Current waiver' }),
  ).toContainText(
    'Demonstration only: fictional draft waiver marker, not legal text.',
  );
  await fillAcceptance(page);
  await accept(page, 'active', 3);
  const history = page.getByRole('table', {
    name: 'Signature history',
  });
  await expect(history).not.toContainText('Version 2');
  await expect(history).toContainText('Current');
  await expect(history).toContainText('fictional draft waiver marker');
});

test('publishing a waiver preserves bookings and old signatures, blocks new booking and check-in, then signing restores both @smoke', async ({
  page,
}) => {
  await route(page, '/waivers');
  await page.getByLabel('Member to inspect').selectOption(ids.members.cedar);
  const history = page.getByRole('table', {
    name: 'Signature history',
  });
  const existing = page.getByRole('table', { name: 'Existing demo bookings' });
  const signatureBefore = await history.textContent();
  const bookingsBefore = await existing.textContent();
  await page.getByLabel('Version number').fill('4');
  await page
    .getByLabel('Waiver text')
    .fill('Fictional browser version four. Non-legal simulation only.');
  await page.getByRole('button', { name: 'Create draft', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Created draft version 4.' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Publish version 4', exact: true })
    .click();
  const publication = page.getByRole('alertdialog', {
    name: 'Publish waiver?',
  });
  await expect(publication).toContainText(
    'Existing bookings and signatures remain.',
  );
  await publication
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Current waiver' })
      .getByRole('heading', { name: 'Version 2' }),
  ).toBeVisible();
  await expect(history).toHaveText(signatureBefore!);
  await page
    .getByRole('button', { name: 'Publish version 4', exact: true })
    .click();
  await publication
    .getByRole('button', { name: 'Publish version', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Current waiver' })
      .getByRole('heading', { name: 'Version 4' }),
  ).toBeVisible();
  await expect(existing).toHaveText(bookingsBefore!);
  await expect(history).toHaveText(signatureBefore!.replace('Current', 'Old'));
  await expect(
    page.getByText('Outdated signature', { exact: true }),
  ).toBeVisible();
  await persona(page, ids.members.cedar);
  await route(page, '/bookings');
  await page
    .getByLabel('Class', { exact: true })
    .selectOption(ids.classes.free);
  await expect(
    page.getByRole('button', { name: 'Book station', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('Free station', { exact: true })).toBeDisabled();
  await expect(
    page.getByRole('alert').filter({
      hasText: 'A signature for the current published waiver is required.',
    }),
  ).toBeVisible();
  await route(page, '/attendance');
  await page.getByLabel('Attendance class').selectOption(ids.classes.checkIn);
  await expect(
    page.getByRole('button', { name: 'Check in Jordan Brooks', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('table', { name: 'Class attendance roster' }),
  ).toContainText('Not checked in');
  await route(page, '/waivers');
  const memberBookings = bookingsBefore!
    .replace('Rowing Foundations (class:demo-history)', 'class:demo-history')
    .replace('Endurance Row (class:demo-cancelled)', 'class:demo-cancelled');
  await expect(existing).toHaveText(memberBookings);
  await page
    .getByRole('button', { name: 'Sign current waiver', exact: true })
    .click();
  await expect(page.getByLabel('Typed name')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByLabel('Typed name').fill('Jordan Brooks New Signature');
  await page
    .getByRole('button', { name: 'Sign current waiver', exact: true })
    .click();
  const signature = page.getByRole('alertdialog', {
    name: 'Record signature?',
  });
  await expect(signature).toContainText('2026-10-05T15:45:00Z');
  await signature.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(history.getByRole('row')).toHaveCount(3);
  await expect(page.getByLabel('Typed name')).toHaveValue(
    'Jordan Brooks New Signature',
  );
  await page
    .getByRole('button', { name: 'Sign current waiver', exact: true })
    .click();
  await signature
    .getByRole('button', { name: 'Record simulated signature', exact: true })
    .click();
  await expect(
    page.getByText('Current signature', { exact: true }),
  ).toBeVisible();
  await expect(history.getByRole('row')).toHaveCount(4);
  await expect(history).toContainText('Version 1');
  await expect(history).toContainText('Version 2');
  await expect(history).toContainText('Version 4');
  await expect(history).toContainText('Jordan Brooks New Signature');
  await expect(existing).toHaveText(memberBookings);
  await route(page, '/bookings');
  await page
    .getByLabel('Class', { exact: true })
    .selectOption(ids.classes.free);
  await page
    .getByLabel('Free station', { exact: true })
    .selectOption(ids.stations.west);
  await page.getByRole('button', { name: 'Book station', exact: true }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Booking confirmed in this demo.' }),
  ).toBeVisible();
  await route(page, '/attendance');
  await page.getByLabel('Attendance class').selectOption(ids.classes.checkIn);
  await page
    .getByRole('button', { name: 'Check in Jordan Brooks', exact: true })
    .click();
  await expect(
    page.getByRole('table', { name: 'Class attendance roster' }),
  ).toContainText('Checked in at 2026-10-05T15:45:00Z');
});
