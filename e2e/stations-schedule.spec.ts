import { openControls, openNavigation, editLayout } from './workspace';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const classes = {
  morning: 'class:demo-check-in',
  free: 'class:demo-free',
  full: 'class:demo-full',
  draft: 'class:demo-draft',
  later: 'class:demo-later-release',
};
const workspace = (page: Page) => page.locator('#demo-workspace');
const grid = (page: Page) =>
  workspace(page).getByRole('grid', { name: 'Station layout' });
const cell = (page: Page, row: number, column: number) =>
  grid(page).getByRole('button', {
    name: new RegExp(`^Row ${row}, column ${column}:`),
  });
const card = (page: Page, id: string) =>
  workspace(page).getByRole('article', { name: `Class ${id}`, exact: true });

async function navigate(page: Page, name: string) {
  await openNavigation(page);
  await page
    .getByRole('navigation', { name: 'Demo navigation' })
    .getByRole('link', { name, exact: true })
    .click();
  await expect(
    workspace(page).getByRole('heading', { level: 1 }),
  ).toBeFocused();
  if (name === 'Stations') await editLayout(page);
}

async function placeWithKeyboard(
  page: Page,
  source: Locator,
  arrows: string[],
  pickup: 'Space' | 'Enter',
  drop: 'Space' | 'Enter',
) {
  await source.focus();
  await page.keyboard.press(pickup);
  await expect(source).toHaveAttribute('aria-pressed', 'true');
  for (const arrow of arrows) await page.keyboard.press(arrow);
  await page.keyboard.press(drop);
}

async function stationMetadata(page: Page) {
  const options = page.getByLabel('Station to edit').getByRole('option');
  const ids = await options.evaluateAll((items) =>
    items.map((item) => (item as HTMLOptionElement).value),
  );
  const records = [];
  for (const id of ids) {
    await page.getByLabel('Station to edit').selectOption(id);
    records.push({
      id,
      label: await page
        .getByLabel('Station label', { exact: true })
        .inputValue(),
      pm5: await page
        .getByLabel('PM5 association', { exact: true })
        .inputValue(),
      inService: await page
        .getByLabel('In service', { exact: true })
        .isChecked(),
    });
  }
  return records;
}

async function roster(page: Page, classId = classes.morning) {
  await navigate(page, 'Bookings');
  await page.getByLabel('Class', { exact: true }).selectOption(classId);
  return page
    .getByRole('table', { name: 'Class roster and booking history' })
    .getByRole('row')
    .allTextContents();
}

async function notificationRows(page: Page) {
  await navigate(page, 'Notifications');
  return page
    .getByRole('table', { name: 'Simulated delivery records' })
    .getByRole('row')
    .allTextContents();
}

async function bookingSnapshot(page: Page) {
  await navigate(page, 'Bookings');
  const ids = await optionValues(page.getByLabel('Class', { exact: true }));
  const snapshots = [];
  for (const id of ids) {
    if (!id) throw new Error('Class option has no reference.');
    await page.getByLabel('Class', { exact: true }).selectOption(id);
    snapshots.push({
      id,
      roster: await page
        .getByRole('table', { name: 'Class roster and booking history' })
        .getByRole('row')
        .allTextContents(),
      waitlist: await page
        .getByRole('table', { name: 'FIFO waitlist' })
        .getByRole('row')
        .allTextContents(),
    });
  }
  return snapshots;
}

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}#/stations`);
  await openControls(page);
  await editLayout(page);
  await expect(page.getByLabel('Frozen demo clock')).toHaveText(
    '2026-10-05T15:45:00Z',
  );
  await expect(page.getByLabel('Persona', { exact: true })).toHaveValue(
    'staff:demo-admin',
  );
  await expect(
    page.getByText('Demo · resets on refresh', { exact: true }),
  ).toBeVisible();
});

test('keyboard grid moves and occupied swaps change positions only; Escape cancels @stations @smoke', async ({
  page,
}) => {
  const beforeMetadata = await stationMetadata(page);
  const beforeRoster = await bookingSnapshot(page);
  const beforeNotifications = await notificationRows(page);
  await navigate(page, 'Stations');
  await expect(page.getByLabel('Class overlay')).toHaveValue(classes.morning);
  await expect(
    workspace(page).getByText('Capacity: 3 in-service stations'),
  ).toBeVisible();
  const beforeCells = await grid(page).getByRole('button').allTextContents();

  await cell(page, 1, 1).focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await expect(cell(page, 1, 1)).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await expect(cell(page, 1, 2)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('status', { name: 'Layout interaction' }),
  ).toHaveText('Station selection cancelled. No layout positions changed.');
  expect(await grid(page).getByRole('button').allTextContents()).toEqual(
    beforeCells,
  );
  await expect(grid(page).getByRole('button', { pressed: true })).toHaveCount(
    0,
  );

  await placeWithKeyboard(
    page,
    cell(page, 1, 1),
    ['ArrowRight'],
    'Space',
    'Enter',
  );
  await expect(cell(page, 1, 2)).toContainText('Rower 01');
  await expect(cell(page, 1, 2)).toContainText('Booked, checked in');
  await expect(cell(page, 1, 2)).toHaveAccessibleName(/Maya Chen/);
  await expect(cell(page, 1, 1)).toContainText('Empty cell');
  await expect(cell(page, 1, 2)).toBeFocused();

  await placeWithKeyboard(
    page,
    cell(page, 1, 2),
    ['ArrowRight'],
    'Enter',
    'Space',
  );
  await expect(cell(page, 1, 3)).toContainText('Rower 01');
  await expect(cell(page, 1, 3)).toContainText('Booked, checked in');
  await expect(cell(page, 1, 2)).toContainText('Rower 04');
  await expect(cell(page, 1, 2)).toContainText('Out of service');
  await expect(cell(page, 1, 2)).toHaveAccessibleName(/Avery Bennett/);
  await expect(cell(page, 1, 3)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(cell(page, 2, 3)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await expect(cell(page, 1, 2)).toBeFocused();
  await expect(grid(page).locator('button[tabindex="0"]')).toHaveCount(1);
  await expect(grid(page).getByRole('button', { pressed: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('status', { name: 'Layout interaction' }),
  ).toHaveText('Station placed. Only layout positions changed.');
  await expect(
    workspace(page).getByText('Capacity: 3 in-service stations'),
  ).toBeVisible();
  expect(await stationMetadata(page)).toEqual(beforeMetadata);
  expect(await bookingSnapshot(page)).toEqual(beforeRoster);
  expect(await notificationRows(page)).toEqual(beforeNotifications);
});

async function persona(page: Page, value: string) {
  await page.getByLabel('Persona', { exact: true }).selectOption(value);
  await expect(page.getByLabel('Persona', { exact: true })).toHaveValue(value);
  if (new URL(page.url()).hash === '#/stations') await editLayout(page);
}

async function scenario(page: Page, name: string, instant: string) {
  await page.getByLabel('Named scenario').selectOption({ label: name });
  await page
    .getByRole('button', { name: 'Load scenario', exact: true })
    .click();
  const confirmation = page.getByRole('dialog', {
    name: 'Replace edited demo state?',
  });
  if (await confirmation.isVisible()) {
    await confirmation
      .getByRole('button', { name: 'Replace demo state' })
      .click();
  }
  await expect(
    page.getByText(`Current scenario: ${name}.`, { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel('Frozen demo clock')).toHaveText(instant);
}

async function clockPreset(page: Page, label: string, instant: string) {
  await page.getByLabel('Clock preset').selectOption({ label });
  await page.getByRole('button', { name: 'Apply clock preset' }).click();
  await expect(page.getByLabel('Frozen demo clock')).toHaveText(instant);
}

async function scheduleSnapshot(page: Page) {
  return workspace(page).getByRole('article').allTextContents();
}

async function createDraft(
  page: Page,
  date: string,
  time: string,
  type = 'Power Intervals (30 min)',
) {
  await page.getByLabel('Class to edit', { exact: true }).selectOption('');
  await page.getByLabel('Class date', { exact: true }).fill(date);
  await page.getByLabel('Class start time', { exact: true }).fill(time);
  await page.getByLabel('Scheduled class type').selectOption({ label: type });
  await page.getByRole('button', { name: 'Save scheduled class' }).click();
  await expect(workspace(page).getByRole('status')).toContainText(
    'Draft class created',
  );
  const created = workspace(page)
    .getByRole('article')
    .filter({
      hasText: `${date} ${time}`,
    });
  await expect(created).toHaveCount(1);
  const label = await created.getAttribute('aria-label');
  expect(label).toMatch(/^Class class:/);
  if (!label)
    throw new Error('Created draft has no accessible class reference.');
  return label.slice('Class '.length);
}

async function saveTemplate(
  page: Page,
  name: string,
  time: string,
  weekday = '2',
) {
  await page.getByLabel('Template to edit').selectOption('');
  await page.getByLabel('Template name', { exact: true }).fill(name);
  await page.getByLabel('Entry 1 weekday').selectOption(weekday);
  await page.getByLabel('Entry 1 time', { exact: true }).fill(time);
  await page.getByLabel('Entry 1 class type').selectOption({
    label: 'Power Intervals (30 min)',
  });
  await page
    .getByRole('button', { name: 'Save template', exact: true })
    .click();
  await expect(workspace(page).getByRole('status')).toContainText(
    'Template created',
  );
  await expect(
    page.getByLabel('Template to apply').getByRole('option', {
      name,
      exact: true,
    }),
  ).toHaveCount(1);
}

async function applyTemplate(page: Page, name: string, week: string) {
  await page.getByLabel('Template to apply').selectOption({ label: name });
  await page.getByLabel('Week starting Monday').fill(week);
  await page
    .getByRole('button', { name: 'Apply template', exact: true })
    .click();
}

async function releasePolicy(
  page: Page,
  mode: 'manual' | 'rolling' | 'immediate',
  minutes?: string,
) {
  await page.getByLabel('Release mode').selectOption(mode);
  if (minutes !== undefined) {
    await page.getByLabel('Rolling window (minutes)').fill(minutes);
  }
  await page.getByRole('button', { name: 'Save release policy' }).click();
  await expect(workspace(page).getByRole('status')).toContainText(
    'Release policy saved',
  );
}

async function optionValues(select: Locator) {
  return select
    .getByRole('option')
    .evaluateAll((options) =>
      options.map((option) => option.getAttribute('value')),
    );
}

async function notificationSnapshot(page: Page) {
  const rows = await notificationRows(page);
  const ids = await optionValues(page.getByLabel('Notification to inspect'));
  return { rows, ids };
}

test('admin removes an idle station after confirmation without changing bookings @stations', async ({
  page,
}) => {
  await page.getByLabel('New station label', { exact: true }).fill('Idle E2E');
  await page
    .getByLabel('New PM5 association', { exact: true })
    .fill('PM5-IDLE-E2E');
  await page.getByRole('button', { name: 'Create station' }).click();
  await expect(workspace(page).getByText('Station change saved')).toBeVisible();
  const beforeRoster = await bookingSnapshot(page);
  await navigate(page, 'Stations');
  await page
    .getByLabel('Station to edit')
    .selectOption('station:demo-created-1');
  await page.getByRole('button', { name: 'Remove station' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Idle E2E');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Station to edit')).toContainText('Idle E2E');
  await page.getByRole('button', { name: 'Remove station' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remove station' })
    .click();
  await expect(workspace(page).getByText('Station removed.')).toBeVisible();
  await expect(page.getByLabel('Station to edit')).not.toContainText(
    'Idle E2E',
  );
  expect(await bookingSnapshot(page)).toEqual(beforeRoster);
});

test('admin cannot remove a station with active bookings @stations', async ({
  page,
}) => {
  const beforeRoster = await bookingSnapshot(page);
  await navigate(page, 'Stations');
  await page.getByLabel('Station to edit').selectOption('station:demo-outage');
  await page.getByRole('button', { name: 'Remove station' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remove station' })
    .click();
  await expect(workspace(page).getByRole('alert')).toContainText(
    /active booking/i,
  );
  await expect(page.getByLabel('Station to edit')).toContainText('Rower 04');
  expect(await bookingSnapshot(page)).toEqual(beforeRoster);
});

test('admin removes an empty column to close a layout gap @stations', async ({
  page,
}) => {
  const beforeRoster = await bookingSnapshot(page);
  await navigate(page, 'Stations');
  await page.getByLabel('Layout axis', { exact: true }).selectOption('column');
  await page.getByLabel('Layout line index').fill('1');
  await page.getByRole('button', { name: 'Remove empty row/column' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remove empty row/column' })
    .click();
  await expect(cell(page, 2, 2)).toContainText('Rower 03');
  await expect(cell(page, 2, 3)).toContainText('Empty cell');
  expect(await bookingSnapshot(page)).toEqual(beforeRoster);
});

test('admin inserts a column before existing stations without moving bookings @stations', async ({
  page,
}) => {
  const beforeRoster = await bookingSnapshot(page);
  await navigate(page, 'Stations');
  await page.getByLabel('Layout axis', { exact: true }).selectOption('column');
  await page.getByLabel('Layout line index').fill('1');
  await page.getByRole('button', { name: 'Insert before' }).click();
  await expect(cell(page, 2, 4)).toContainText('Rower 03');
  await expect(cell(page, 2, 3)).toContainText('Empty cell');
  expect(await bookingSnapshot(page)).toEqual(beforeRoster);
});

async function expectNotifications(
  page: Page,
  before: Awaited<ReturnType<typeof notificationSnapshot>>,
  event: 'Class change' | 'Class cancellation',
  emails: string[],
  outcome: 'success' | 'failure',
  classId: string,
  changes?: string,
) {
  const after = await notificationSnapshot(page);
  const added = after.rows.filter((row) => !before.rows.includes(row));
  expect(added).toHaveLength(emails.length);
  for (const email of emails) {
    const matching = added.filter((row) => row.includes(email));
    expect(matching).toHaveLength(1);
    expect(matching[0]).toContain(event);
    expect(matching[0]).toContain(`Simulated ${outcome}`);
    expect(matching[0]).toContain('2026-10-05T15:45:00Z');
  }
  const newIds = after.ids.filter((id) => !before.ids.includes(id));
  expect(newIds).toHaveLength(emails.length);
  for (const id of newIds) {
    if (!id) throw new Error('Notification option has no reference.');
    await page.getByLabel('Notification to inspect').selectOption(id);
    const detail = page.getByRole('region', { name: 'Selected notification' });
    await expect(
      detail.getByRole('heading', { name: event, exact: true }),
    ).toBeVisible();
    await expect(detail.getByText(classId, { exact: true })).toBeVisible();
    if (changes) {
      await expect(detail.getByText(changes, { exact: true })).toBeVisible();
    }
    await expect(
      page
        .getByRole('table', { name: 'Delivery attempt history' })
        .getByRole('row'),
    ).toHaveCount(2);
  }
}

test('staff text and icon states remain anonymous and read-only for members @stations @privacy', async ({
  page,
}) => {
  const states = [
    [1, 1, 'Booked, checked in', '[x]', 'Maya Chen'],
    [2, 1, 'Booked, not checked in', '...', 'Jordan Brooks'],
    [2, 3, 'Available', '+', ''],
    [1, 3, 'Out of service', '!', 'Avery Bennett'],
  ] as const;
  for (const [row, column, state, icon, name] of states) {
    await expect(cell(page, row, column)).toContainText(state);
    await expect(cell(page, row, column)).toHaveAccessibleName(
      new RegExp(state),
    );
    await expect(
      cell(page, row, column).locator('[aria-hidden="true"]'),
    ).toHaveText(icon);
    if (name)
      await expect(cell(page, row, column)).toHaveAccessibleName(
        new RegExp(name),
      );
  }
  await expect(cell(page, 1, 3)).toHaveAccessibleName(
    /Station outage: staff review required/,
  );
  const overlayIds = await optionValues(page.getByLabel('Class overlay'));
  expect(overlayIds).not.toContain('class:demo-history');
  expect(overlayIds).not.toContain('class:demo-cancelled');
  await page.getByLabel('Class overlay').selectOption(classes.full);
  await expect(cell(page, 2, 3)).toHaveAccessibleName(/Sam Patel/);

  await persona(page, 'member:maple');
  await expect(page.getByLabel('Class overlay')).toHaveValue(classes.morning);
  for (const [row, column, state] of states) {
    await expect(cell(page, row, column)).toContainText(state);
  }
  const before = await grid(page).getByRole('button').allTextContents();
  await cell(page, 1, 1).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  expect(await grid(page).getByRole('button').allTextContents()).toEqual(
    before,
  );
  await expect(
    page.getByRole('status', { name: 'Layout interaction' }),
  ).toContainText('Read-only');
  await expect(workspace(page)).not.toContainText(
    /(Maya Chen|Jordan Brooks|Sam Patel|Taylor Reed|Casey Park|Riley Morgan|Jamie Ellis|Avery Bennett)|@example\.invalid|member:|identity:|DEMO-PM5/,
  );
  await expect(page.getByLabel('Station to edit')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Create station', exact: true }),
  ).toHaveCount(0);
  expect(await optionValues(page.getByLabel('Class overlay'))).not.toContain(
    classes.draft,
  );
});

for (const name of ['Unavailable layout', 'Stale layout']) {
  test(`${name} explicitly disables placement and roster reseating without erasing bookings @stations`, async ({
    page,
  }) => {
    const beforeRoster = await roster(page);
    await navigate(page, 'Stations');
    await scenario(page, name, '2026-10-05T15:45:00Z');
    await expect(
      workspace(page).getByText(/layout data is (unavailable|stale)/),
    ).toBeVisible();
    await expect(grid(page)).toHaveCount(0);
    await expect(
      workspace(page).getByText('Capacity: 3 in-service stations'),
    ).toBeVisible();
    await persona(page, 'staff:demo-admin');
    await expect(page.getByLabel('Destination row')).toBeDisabled();
    await expect(page.getByLabel('Destination column')).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Place station', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Create station', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Save orientation' }),
    ).toBeDisabled();
    expect(await roster(page)).toEqual(beforeRoster);
    await page
      .getByLabel('Booked member')
      .selectOption('booking:check-in-maple');
    await expect(page.getByLabel('Destination station')).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Review reseating' }),
    ).toBeDisabled();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      workspace(page).getByText(
        /Station selection and map-based reseating are disabled/,
      ),
    ).toBeVisible();
  });
}

test('station metadata and outages update capacity and flags but preserve booking identities and attendance @stations', async ({
  page,
}) => {
  const before = await roster(page);
  const beforeNotifications = await notificationRows(page);
  await navigate(page, 'Stations');
  await page.getByLabel('Station to edit').selectOption('station:demo-north');
  await page
    .getByLabel('Station label', { exact: true })
    .fill('Demo renamed North');
  await page
    .getByLabel('PM5 association', { exact: true })
    .fill('DEMO-PM5-REPLACEMENT');
  await page.getByLabel('In service', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save station', exact: true }).click();
  await expect(cell(page, 1, 1)).toContainText('Demo renamed North');
  await expect(cell(page, 1, 1)).toContainText('Out of service');
  await expect(cell(page, 1, 1)).toHaveAccessibleName(/Maya Chen/);
  await expect(cell(page, 1, 1)).toHaveAccessibleName(
    /Station outage: staff review required/,
  );
  await expect(
    workspace(page).getByText('Capacity: 2 in-service stations'),
  ).toBeVisible();
  await navigate(page, 'Bookings');
  await page.getByLabel('Class', { exact: true }).selectOption(classes.morning);
  const maple = page
    .getByRole('table', { name: 'Class roster and booking history' })
    .getByRole('row')
    .filter({ hasText: 'Maya Chen' });
  await expect(maple).toContainText('Demo renamed North');
  await expect(maple).toContainText('booked');
  await expect(maple).toContainText('Attended; Checked in');
  await expect(maple).toContainText(
    'Station out of service: staff review required',
  );
  await expect(
    page.getByLabel('Booked member').getByRole('option', {
      name: 'Maya Chen - Demo renamed North',
      exact: true,
    }),
  ).toHaveAttribute('value', 'booking:check-in-maple');
  await navigate(page, 'Stations');
  await page.getByLabel('Station to edit').selectOption('station:demo-north');
  await expect(page.getByLabel('PM5 association', { exact: true })).toHaveValue(
    'DEMO-PM5-REPLACEMENT',
  );
  await page.getByLabel('Station label', { exact: true }).fill('Rower 01');
  await page.getByLabel('In service', { exact: true }).check();
  await page.getByRole('button', { name: 'Save station', exact: true }).click();
  await expect(cell(page, 1, 1)).toContainText('Booked, checked in');
  await expect(
    workspace(page).getByText('Capacity: 3 in-service stations'),
  ).toBeVisible();
  expect(await roster(page)).toEqual(before);
  expect(await notificationRows(page)).toEqual(beforeNotifications);
});

test('station forms reject invalid coordinates and occupied creation then save PM5 and orientation @stations', async ({
  page,
}) => {
  const before = await grid(page).getByRole('button').allTextContents();
  for (const value of ['-1', '1.5', '']) {
    await page.getByLabel('Destination row').fill(value);
    await page
      .getByRole('button', { name: 'Place station', exact: true })
      .click();
    await expect(workspace(page).getByRole('alert')).toContainText(
      'non-negative whole numbers',
    );
    expect(await grid(page).getByRole('button').allTextContents()).toEqual(
      before,
    );
  }
  await page
    .getByRole('button', { name: 'Create station', exact: true })
    .click();
  await expect(workspace(page).getByRole('alert')).toContainText(
    'A station label is required',
  );
  await page.getByLabel('New station label').fill('Demo South');
  await page.getByLabel('New PM5 association').fill('DEMO-PM5-SOUTH');
  await page.getByLabel('New row', { exact: true }).fill('0');
  await page.getByLabel('New column', { exact: true }).fill('0');
  await page
    .getByRole('button', { name: 'Create station', exact: true })
    .click();
  await expect(workspace(page).getByRole('alert')).toContainText(
    'already contains a station',
  );
  expect(await grid(page).getByRole('button').allTextContents()).toEqual(
    before,
  );
  await page.getByLabel('New row', { exact: true }).fill('2');
  await page.getByLabel('New column', { exact: true }).fill('1');
  await page
    .getByRole('button', { name: 'Create station', exact: true })
    .click();
  await expect(cell(page, 3, 2)).toContainText('Demo South');
  await expect(cell(page, 3, 2)).toContainText('Available');
  await expect(
    workspace(page).getByText('Capacity: 4 in-service stations'),
  ).toBeVisible();
  await page
    .getByLabel('Station to edit')
    .selectOption({ label: 'Demo South' });
  await expect(page.getByLabel('PM5 association', { exact: true })).toHaveValue(
    'DEMO-PM5-SOUTH',
  );
  await expect(page.getByLabel('Destination row')).toHaveValue('2');
  await expect(page.getByLabel('Destination column')).toHaveValue('1');
  await page.getByLabel('Orientation label').fill('Demo entrance on the left');
  await page.getByRole('button', { name: 'Save orientation' }).click();
  await expect(
    workspace(page).getByText('Demo entrance on the left', { exact: true }),
  ).toBeVisible();
});

test('zero capacity retains reservations, blocks publication and booking, and recovers when service returns @stations @schedule', async ({
  page,
}) => {
  const before = await roster(page);
  await navigate(page, 'Stations');
  await scenario(page, 'Stations out of service', '2026-10-05T15:45:00Z');
  await expect(
    workspace(page).getByText('Capacity: 0 in-service stations'),
  ).toBeVisible();
  await expect(
    workspace(page).getByText('Zero capacity: staff review required'),
  ).toBeVisible();
  await navigate(page, 'Schedule');
  const scheduled = await scheduleSnapshot(page);
  await card(page, classes.draft)
    .getByRole('checkbox', { name: 'Select draft for publication' })
    .check();
  await page.getByRole('button', { name: 'Publish selected drafts' }).click();
  await expect(workspace(page).getByRole('alert')).toContainText(
    /in.service|capacity/i,
  );
  expect(await scheduleSnapshot(page)).toEqual(scheduled);
  await expect(workspace(page).getByRole('status')).toHaveCount(0);
  await persona(page, 'member:maple');
  await navigate(page, 'Bookings');
  await page.getByLabel('Class', { exact: true }).selectOption(classes.free);
  await expect(
    page.getByRole('button', { name: 'Book station', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Join waitlist', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('Free station').getByRole('option')).toHaveCount(
    1,
  );
  await persona(page, 'staff:demo-admin');
  await navigate(page, 'Stations');
  await page.getByLabel('In service', { exact: true }).check();
  await page.getByRole('button', { name: 'Save station', exact: true }).click();
  await expect(
    workspace(page).getByText('Capacity: 1 in-service stations'),
  ).toBeVisible();
  await expect(
    workspace(page).getByText('Zero capacity: staff review required'),
  ).toHaveCount(0);
  await navigate(page, 'Bookings');
  await page.getByLabel('Class', { exact: true }).selectOption(classes.morning);
  await expect(
    page
      .getByRole('table', { name: 'Class roster and booking history' })
      .getByRole('row'),
  ).toHaveCount(before.length);
  for (const name of ['Maya Chen', 'Jordan Brooks', 'Avery Bennett']) {
    await expect(
      page
        .getByRole('table', { name: 'Class roster and booking history' })
        .getByRole('row')
        .filter({ hasText: name }),
    ).toContainText('booked');
  }
});

test('base arrangement remains available when no current or future class overlay remains @stations', async ({
  page,
}) => {
  await navigate(page, 'Schedule');
  await page.getByLabel('Class to edit').selectOption(classes.later);
  await page
    .getByLabel('Cancellation reason')
    .fill('Fictional base-map demonstration');
  await page.getByRole('button', { name: 'Cancel published class' }).click();
  await card(page, classes.draft)
    .getByRole('button', { name: 'Delete draft' })
    .click();
  await page.getByRole('button', { name: '+1 day', exact: true }).click();
  await expect(page.getByLabel('Frozen demo clock')).toHaveText(
    '2026-10-06T15:45:00Z',
  );
  await navigate(page, 'Stations');
  await expect(page.getByLabel('Class overlay')).toHaveCount(0);
  await expect(
    workspace(page).getByText(/Base station arrangement. Service states only/),
  ).toBeVisible();
  await expect(cell(page, 1, 1)).toContainText('Rower 01');
  await expect(cell(page, 1, 1)).toContainText('In service');
  await expect(cell(page, 1, 3)).toContainText('Out of service');
  await expect(grid(page)).not.toContainText(
    /(Maya Chen|Jordan Brooks|Avery Bennett)|Booked|Available/,
  );
  await placeWithKeyboard(
    page,
    cell(page, 1, 1),
    ['ArrowRight'],
    'Space',
    'Enter',
  );
  await expect(cell(page, 1, 2)).toContainText('Rower 01');
  await persona(page, 'member:maple');
  await expect(grid(page)).toBeVisible();
  await expect(cell(page, 1, 2)).toContainText('In service');
  await expect(workspace(page)).not.toContainText(
    /@example\.invalid|member:|DEMO-PM5|Maya Chen/,
  );
});

for (const duration of [30, 45, 60]) {
  test(`class type ${duration}-minute edits feed new snapshots but preserve all existing details @classes @schedule`, async ({
    page,
  }) => {
    await navigate(page, 'Schedule');
    const before = await scheduleSnapshot(page);
    await navigate(page, 'Classes');
    expect(await optionValues(page.getByLabel('Duration (minutes)'))).toEqual([
      '30',
      '45',
      '60',
    ]);
    await page
      .getByLabel('Class type to edit')
      .selectOption({ label: 'Power Intervals' });
    await page.getByLabel('Name', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Save class type' }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(
      workspace(page).getByRole('alert').filter({
        hasText: 'Correct the class type',
      }),
    ).toBeVisible();
    await page
      .getByLabel('Name', { exact: true })
      .fill(`Demo revised ${duration}`);
    await page.getByLabel('Duration (minutes)').selectOption(String(duration));
    await page
      .getByLabel('Description', { exact: true })
      .fill('Fictional revised class description.');
    await page
      .getByLabel('Difficulty', { exact: true })
      .fill('Illustrative revised difficulty');
    await page.getByLabel('Alias', { exact: true }).fill('Revised rowing');
    await page
      .getByLabel('What to bring', { exact: true })
      .fill('Fictional revised water note.');
    await page.getByRole('button', { name: 'Save class type' }).click();
    await expect(workspace(page).getByRole('status')).toContainText(
      'Class type updated',
    );
    await expect(
      page.getByRole('region', { name: 'Scheduled snapshots' }),
    ).toContainText('Power Intervals - 30 minutes');
    await expect(
      page.getByRole('region', { name: 'Scheduled snapshots' }),
    ).not.toContainText(`Demo revised ${duration}`);
    await navigate(page, 'Schedule');
    expect(await scheduleSnapshot(page)).toEqual(before);
    const id = await createDraft(
      page,
      '2026-11-10',
      '14:00',
      `Demo revised ${duration} (${duration} min)`,
    );
    await expect(card(page, id)).toContainText(
      `${duration} minutes - Illustrative revised difficulty`,
    );
    await expect(card(page, id)).toContainText(
      'Fictional revised class description.',
    );
    await expect(card(page, id)).toContainText('Alias: Revised rowing');
    await expect(card(page, id)).toContainText(
      'What to bring: Fictional revised water note.',
    );
    const end = { 30: '14:30', 45: '14:45', 60: '15:00' }[duration];
    await expect(card(page, id)).toContainText(
      `2026-11-10 14:00 PST - ${end} PST`,
    );
    expect(
      (await scheduleSnapshot(page)).filter(
        (text) => !text.includes(`Demo revised ${duration}`),
      ),
    ).toEqual(before);
    await card(page, id)
      .getByRole('checkbox', { name: 'Select draft for publication' })
      .check();
    await page.getByRole('button', { name: 'Publish selected drafts' }).click();
    await persona(page, 'member:maple');
    await expect(card(page, id)).toContainText('Fictional revised water note.');
    await expect(card(page, classes.free)).toContainText('Power Intervals');
    await expect(card(page, classes.free)).toContainText('30 minutes');
  });
}

test('editable multi-entry templates alternate weeks, skip exact duplicates, and preserve prior snapshots @schedule', async ({
  page,
}) => {
  await navigate(page, 'Schedule');
  const baseline = await scheduleSnapshot(page);
  await saveTemplate(page, 'Demo custom A', '14:00');
  await page
    .getByLabel('Template to edit')
    .selectOption({ label: 'Demo custom A' });
  await page.getByRole('button', { name: 'Add template entry' }).click();
  await page.getByLabel('Entry 2 weekday').selectOption('4');
  await page.getByLabel('Entry 2 time', { exact: true }).fill('17:00');
  await page
    .getByLabel('Entry 2 class type')
    .selectOption({ label: 'Endurance Row (60 min)' });
  await page
    .getByLabel('Entry 2 coach')
    .selectOption({ label: 'Morgan Ellis' });
  await page
    .getByRole('button', { name: 'Save template', exact: true })
    .click();
  await expect(workspace(page).getByRole('status')).toContainText(
    'Template updated',
  );
  await saveTemplate(page, 'Demo custom B', '09:00');
  await applyTemplate(page, 'Demo custom A', '2026-11-09');
  await expect(workspace(page).getByRole('status')).toContainText(
    '2 drafts created; 0 exact duplicates skipped',
  );
  await applyTemplate(page, 'Demo custom B', '2026-11-16');
  await expect(workspace(page).getByRole('status')).toContainText(
    '1 draft created; 0 exact duplicates skipped',
  );
  await expect(workspace(page).getByRole('article')).toHaveCount(
    baseline.length + 3,
  );
  for (const dateTime of [
    '2026-11-10 14:00 PST',
    '2026-11-12 17:00 PST',
    '2026-11-17 09:00 PST',
  ]) {
    const added = workspace(page)
      .getByRole('article')
      .filter({ hasText: dateTime });
    await expect(added.getByText('draft', { exact: true })).toBeVisible();
  }
  await expect(
    workspace(page)
      .getByRole('article')
      .filter({ hasText: '2026-11-12 17:00' }),
  ).toContainText('Coach: Morgan Ellis');
  const applied = await scheduleSnapshot(page);
  await applyTemplate(page, 'Demo custom A', '2026-11-09');
  await expect(workspace(page).getByRole('status')).toContainText(
    '0 drafts created; 2 exact duplicates skipped',
  );
  expect(await scheduleSnapshot(page)).toEqual(applied);
  await page
    .getByLabel('Template to edit')
    .selectOption({ label: 'Demo custom A' });
  await page.getByLabel('Template name', { exact: true }).fill('Demo edited A');
  await page.getByLabel('Entry 1 time', { exact: true }).fill('15:00');
  await page.getByRole('button', { name: 'Remove entry 2' }).click();
  await page
    .getByRole('button', { name: 'Save template', exact: true })
    .click();
  await page
    .getByLabel('Template to edit')
    .selectOption({ label: 'Demo custom B' });
  await page
    .getByLabel('Template to edit')
    .selectOption({ label: 'Demo edited A' });
  await expect(page.getByLabel('Entry 1 time', { exact: true })).toHaveValue(
    '15:00',
  );
  await expect(page.getByLabel('Entry 2 weekday')).toHaveCount(0);
  expect(await scheduleSnapshot(page)).toEqual(applied);
  await applyTemplate(page, 'Demo edited A', '2026-11-23');
  await expect(
    workspace(page)
      .getByRole('article')
      .filter({ hasText: '2026-11-24 15:00 PST' }),
  ).toHaveCount(1);
  for (const text of applied)
    expect(await scheduleSnapshot(page)).toContain(text);
});

test('whole-template overlap rejection identifies conflicts and never adds the otherwise valid entry @schedule @smoke', async ({
  page,
}) => {
  await scenario(
    page,
    'Schedule conflict and zero gap',
    '2026-10-05T15:45:00Z',
  );
  const beforeRoster = await roster(page);
  const beforeNotifications = await notificationRows(page);
  await navigate(page, 'Schedule');
  const before = await scheduleSnapshot(page);
  await applyTemplate(page, 'Conflicting Week A', '2026-10-05');
  await expect(workspace(page).getByRole('alert')).toContainText(
    'The proposed class overlaps another scheduled class.',
  );
  await expect(workspace(page).getByRole('alert')).toContainText(
    classes.morning,
  );
  await expect(workspace(page).getByRole('alert')).toContainText(
    'Entire proposal rejected; no classes changed.',
  );
  await expect(workspace(page).getByRole('status')).toHaveCount(0);
  expect(await scheduleSnapshot(page)).toEqual(before);
  await expect(
    workspace(page).getByRole('article').filter({ hasText: '2026-10-07' }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Week starting Monday')).toHaveValue(
    '2026-10-05',
  );
  expect(await roster(page)).toEqual(beforeRoster);
  expect(await notificationRows(page)).toEqual(beforeNotifications);
});

test('overlap between proposed entries rejects every draft even without an existing conflict @schedule', async ({
  page,
}) => {
  await navigate(page, 'Schedule');
  await saveTemplate(page, 'Demo internal overlap', '14:00');
  await page
    .getByLabel('Template to edit')
    .selectOption({ label: 'Demo internal overlap' });
  await page.getByRole('button', { name: 'Add template entry' }).click();
  await page.getByLabel('Entry 2 weekday').selectOption('2');
  await page.getByLabel('Entry 2 time', { exact: true }).fill('14:15');
  await page
    .getByRole('button', { name: 'Save template', exact: true })
    .click();
  const before = await scheduleSnapshot(page);
  await applyTemplate(page, 'Demo internal overlap', '2026-11-09');
  await expect(workspace(page).getByRole('alert')).toContainText('overlaps');
  await expect(workspace(page).getByRole('alert')).toContainText(
    'Entire proposal rejected; no classes changed.',
  );
  await expect(workspace(page).getByRole('status')).toHaveCount(0);
  expect(await scheduleSnapshot(page)).toEqual(before);
});

test('edited same-week template rejects an overlap atomically, then accepts adjacent occurrences and skips unchanged duplicates @schedule', async ({
  page,
}) => {
  await navigate(page, 'Schedule');
  await saveTemplate(page, 'Demo editable occurrence', '10:00');
  await page
    .getByLabel('Template to edit')
    .selectOption({ label: 'Demo editable occurrence' });
  await page.getByRole('button', { name: 'Add template entry' }).click();
  await page.getByLabel('Entry 2 weekday').selectOption('4');
  await page.getByLabel('Entry 2 time', { exact: true }).fill('10:00');
  await page
    .getByRole('button', { name: 'Save template', exact: true })
    .click();
  await applyTemplate(page, 'Demo editable occurrence', '2026-11-16');
  await expect(workspace(page).getByRole('status')).toContainText(
    '2 drafts created',
  );
  const before = await scheduleSnapshot(page);
  await page.getByLabel('Entry 1 time', { exact: true }).fill('10:30');
  await page.getByLabel('Entry 2 time', { exact: true }).fill('10:15');
  await page
    .getByRole('button', { name: 'Save template', exact: true })
    .click();
  await applyTemplate(page, 'Demo editable occurrence', '2026-11-16');
  await expect(workspace(page).getByRole('alert')).toContainText('overlaps');
  await expect(workspace(page).getByRole('alert')).toContainText(
    'occurrence:2',
  );
  await expect(workspace(page).getByRole('status')).toHaveCount(0);
  expect(await scheduleSnapshot(page)).toEqual(before);
  await page.getByLabel('Entry 2 time', { exact: true }).fill('10:00');
  await page
    .getByRole('button', { name: 'Save template', exact: true })
    .click();
  await applyTemplate(page, 'Demo editable occurrence', '2026-11-16');
  await expect(workspace(page).getByRole('status')).toContainText(
    '1 draft created; 1 exact duplicate skipped',
  );
  await expect(workspace(page).getByRole('alert')).toContainText(
    '0-minute gap',
  );
  await expect(
    workspace(page)
      .getByRole('article')
      .filter({ hasText: '2026-11-17 10:30 PST' }),
  ).toHaveCount(1);
  const after = await scheduleSnapshot(page);
  expect(after).toHaveLength(before.length + 1);
  for (const text of before) expect(after).toContain(text);
  await applyTemplate(page, 'Demo editable occurrence', '2026-11-16');
  await expect(workspace(page).getByRole('status')).toContainText(
    '0 drafts created; 2 exact duplicates skipped',
  );
  expect(await scheduleSnapshot(page)).toEqual(after);
});

for (const [time, gap] of [
  ['09:45', 0],
  ['10:00', 15],
] as const) {
  test(`${gap}-minute template gap warns without rejecting or shifting either class @schedule`, async ({
    page,
  }) => {
    await scenario(
      page,
      'Schedule conflict and zero gap',
      '2026-10-05T15:45:00Z',
    );
    await navigate(page, 'Schedule');
    await page
      .getByLabel('Template to edit')
      .selectOption({ label: 'Zero-gap boundary' });
    await page.getByLabel('Entry 1 time', { exact: true }).fill(time);
    await page
      .getByRole('button', { name: 'Save template', exact: true })
      .click();
    if (gap === 15) {
      await createDraft(
        page,
        '2026-11-09',
        '09:00',
        'Rowing Foundations (45 min)',
      );
    }
    const week = gap === 0 ? '2026-10-05' : '2026-11-09';
    const date = week;
    const before = await scheduleSnapshot(page);
    await applyTemplate(page, 'Zero-gap boundary', week);
    await expect(workspace(page).getByRole('status')).toContainText(
      '1 draft created; 0 exact duplicates skipped',
    );
    await expect(workspace(page).getByRole('alert')).toContainText(
      `${gap}-minute gap`,
    );
    const added = workspace(page)
      .getByRole('article')
      .filter({ hasText: `${date} ${time}` });
    await expect(added).toHaveCount(1);
    await expect(added).toContainText(`Warning: ${gap}-minute gap`);
    const after = await scheduleSnapshot(page);
    expect(after).toHaveLength(before.length + 1);
    const withoutGapWarning = (text: string) =>
      text.replace(
        /Warning: \d+-minute gap; below the illustrative \d+-minute target\. Times were not shifted\./g,
        '',
      );
    for (const text of before) {
      expect(after.map(withoutGapWarning)).toContain(withoutGapWarning(text));
    }
  });
}

for (const boundary of [
  {
    name: 'Spring daylight-saving boundary',
    initial: '2027-03-13T20:00:00Z',
    weeks: ['2027-03-01', '2027-03-08'],
    dates: ['2027-03-07', '2027-03-14'],
    offsets: ['PST', 'PDT'],
    before: '2027-03-14T09:59:59Z',
    after: '2027-03-14T10:00:00Z',
    beforeLocal: '01:59:59 PST',
    afterLocal: '03:00:00 PDT',
    advanceMinutes: '360',
  },
  {
    name: 'Fall daylight-saving boundary',
    initial: '2026-10-31T19:00:00Z',
    weeks: ['2026-10-19', '2026-10-26'],
    dates: ['2026-10-25', '2026-11-01'],
    offsets: ['PDT', 'PST'],
    before: '2026-11-01T08:59:59Z',
    after: '2026-11-01T09:00:00Z',
    beforeLocal: '01:59:59 PDT',
    afterLocal: '01:00:00 PST',
    advanceMinutes: '480',
  },
]) {
  test(`${boundary.name} keeps Sunday 09:00 recurrence with changed Los Angeles offsets and fixed UTC clock @schedule @dst`, async ({
    page,
  }) => {
    await scenario(page, boundary.name, boundary.initial);
    await navigate(page, 'Schedule');
    await expect(
      page.getByText(/Demo timezone: America\/Los_Angeles.*illustrative/),
    ).toBeVisible();
    for (let index = 0; index < boundary.weeks.length; index += 1) {
      await applyTemplate(
        page,
        'Sunday wall-clock recurrence',
        boundary.weeks[index],
      );
      await expect(workspace(page).getByRole('status')).toContainText(
        '1 draft created',
      );
      const occurrence = workspace(page)
        .getByRole('article')
        .filter({
          hasText: `${boundary.dates[index]} 09:00 ${boundary.offsets[index]}`,
        });
      await expect(occurrence).toHaveCount(1);
      await expect(occurrence).toContainText(
        `09:30 ${boundary.offsets[index]}`,
      );
      await expect(
        occurrence.getByText('draft', { exact: true }),
      ).toBeVisible();
    }
    const upcoming = workspace(page)
      .getByRole('article')
      .filter({
        hasText: `${boundary.dates[1]} 09:00 ${boundary.offsets[1]}`,
      });
    await upcoming
      .getByRole('checkbox', {
        name: 'Select draft for publication',
      })
      .check();
    await page.getByRole('button', { name: 'Publish selected drafts' }).click();
    await expect(
      upcoming.getByText('published', { exact: true }),
    ).toBeVisible();
    await releasePolicy(page, 'rolling', boundary.advanceMinutes);
    const before = await scheduleSnapshot(page);
    await clockPreset(
      page,
      'One second before illustrative daylight-saving transition',
      boundary.before,
    );
    await expect(
      page.getByRole('region', { name: 'Demo controls' }),
    ).toContainText(boundary.beforeLocal);
    // Release visibility tests the scheduled UTC instant without reading the store.
    await persona(page, 'member:maple');
    await expect(upcoming).toHaveCount(0);
    await clockPreset(
      page,
      'Exact illustrative daylight-saving transition',
      boundary.after,
    );
    await expect(
      page.getByRole('region', { name: 'Demo controls' }),
    ).toContainText(boundary.afterLocal);
    await expect(upcoming).toBeVisible();
    await expect(upcoming).toContainText('published');
    await persona(page, 'staff:demo-admin');
    for (const date of boundary.dates) {
      const occurrence = workspace(page)
        .getByRole('article')
        .filter({ hasText: `${date} 09:00` });
      await expect(occurrence).toContainText('Power Intervals');
    }
    expect(await scheduleSnapshot(page)).toEqual(before);
  });
}

test('one-off drafts can be edited and deleted while invalid weeks and overlapping saves preserve history @schedule', async ({
  page,
}) => {
  await navigate(page, 'Schedule');
  const baseline = await scheduleSnapshot(page);
  await applyTemplate(page, 'Week A', '2026-11-10');
  await expect(page.getByLabel('Week starting Monday')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect(await scheduleSnapshot(page)).toEqual(baseline);
  const id = await createDraft(page, '2026-11-10', '14:00');
  await page.getByLabel('Class to edit').selectOption(id);
  await page.getByLabel('Class start time', { exact: true }).fill('15:30');
  await page
    .getByLabel('Scheduled class type')
    .selectOption({ label: 'Rowing Foundations (45 min)' });
  await page.getByLabel('Class coach').selectOption({ label: 'Alex Rivera' });
  await page.getByRole('button', { name: 'Save scheduled class' }).click();
  await expect(card(page, id)).toContainText(
    '2026-11-10 15:30 PST - 16:15 PST',
  );
  await expect(card(page, id)).toContainText('Coach: Alex Rivera');
  const edited = await scheduleSnapshot(page);
  await page.getByLabel('Class to edit').selectOption('');
  await page.getByLabel('Class date', { exact: true }).fill('2026-11-10');
  await page.getByLabel('Class start time', { exact: true }).fill('15:45');
  await page.getByRole('button', { name: 'Save scheduled class' }).click();
  await expect(workspace(page).getByRole('alert')).toContainText('overlaps');
  await expect(workspace(page).getByRole('status')).toHaveCount(0);
  await expect(
    page.getByLabel('Class start time', { exact: true }),
  ).toHaveValue('15:45');
  expect(await scheduleSnapshot(page)).toEqual(edited);
  await card(page, id).getByRole('button', { name: 'Delete draft' }).click();
  await expect(card(page, id)).toHaveCount(0);
  expect(await scheduleSnapshot(page)).toEqual(baseline);
});

test('batch publication, manual release and rolling clock boundaries determine member visibility @schedule', async ({
  page,
}) => {
  await navigate(page, 'Schedule');
  await expect(
    workspace(page).getByText(/Current release: immediate/),
  ).toBeVisible();
  await releasePolicy(page, 'manual');
  const other = await createDraft(page, '2026-10-07', '14:00');
  for (const id of [classes.draft, other]) {
    await card(page, id)
      .getByRole('checkbox', { name: 'Select draft for publication' })
      .check();
  }
  await page.getByRole('button', { name: 'Publish selected drafts' }).click();
  await expect(workspace(page).getByRole('status')).toContainText(
    '2 selected drafts published',
  );
  for (const id of [classes.draft, other]) {
    await expect(
      card(page, id).getByText('published', { exact: true }),
    ).toBeVisible();
    await expect(card(page, id)).toContainText('Manual release: not released');
  }
  await persona(page, 'member:maple');
  for (const id of [
    classes.draft,
    other,
    classes.later,
    'class:demo-cancelled',
    'class:demo-history',
  ]) {
    await expect(card(page, id)).toHaveCount(0);
  }
  await expect(card(page, classes.morning)).toBeVisible();
  await persona(page, 'staff:demo-admin');
  for (const id of [classes.draft, other]) {
    await card(page, id)
      .getByRole('checkbox', { name: 'Select published class for release' })
      .check();
  }
  await page.getByRole('button', { name: 'Release selected classes' }).click();
  await expect(workspace(page).getByRole('status')).toContainText(
    '2 selected classes released',
  );
  await persona(page, 'member:maple');
  for (const id of [classes.draft, other])
    await expect(card(page, id)).toBeVisible();
  await expect(card(page, classes.later)).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Save scheduled class' }),
  ).toHaveCount(0);
  await persona(page, 'staff:demo-admin');
  await releasePolicy(page, 'rolling', '75');
  await persona(page, 'member:maple');
  await expect(card(page, classes.morning)).toBeVisible();
  await expect(card(page, classes.free)).toHaveCount(0);
  await expect(card(page, classes.full)).toHaveCount(0);
  await page.getByRole('button', { name: '+15 minutes', exact: true }).click();
  await expect(page.getByLabel('Frozen demo clock')).toHaveText(
    '2026-10-05T16:00:00Z',
  );
  await expect(card(page, classes.free)).toBeVisible();
  await expect(card(page, classes.full)).toHaveCount(0);
  await persona(page, 'staff:demo-admin');
  await releasePolicy(page, 'immediate');
  await persona(page, 'member:maple');
  await expect(card(page, classes.later)).toBeVisible();
  await expect(card(page, classes.full)).toBeVisible();
});

for (const outcome of ['success', 'failure'] as const) {
  for (const change of [
    { label: 'Class date', value: '2026-10-07', field: 'Date', waived: false },
    {
      label: 'Class start time',
      value: '09:15',
      field: 'start time',
      waived: true,
    },
    { label: 'Class coach', value: '', field: 'coach', waived: false },
  ]) {
    test(`published ${change.field} edit records simulated ${outcome}; only start-time changes waive late cancel @schedule @notifications`, async ({
      page,
    }) => {
      const before = await notificationSnapshot(page);
      await page.getByLabel('Simulated email outcome').selectOption(outcome);
      await navigate(page, 'Schedule');
      await page.getByLabel('Class to edit').selectOption(classes.morning);
      await expect(page.getByLabel('Scheduled class type')).toBeDisabled();
      if (change.label === 'Class coach') {
        await page
          .getByLabel(change.label, { exact: true })
          .selectOption(change.value);
      } else {
        await page.getByLabel(change.label, { exact: true }).fill(change.value);
      }
      await page.getByRole('button', { name: 'Save scheduled class' }).click();
      await expect(workspace(page).getByRole('status')).toContainText(
        'Scheduled class updated',
      );
      await expect(card(page, classes.morning)).toContainText(
        `Late-cancel waiver: ${change.waived ? 'yes' : 'no'}`,
      );
      await expect(card(page, classes.morning)).toContainText('45 minutes');
      await expect(workspace(page).getByRole('alert')).toContainText(
        `Simulated delivery: ${outcome === 'success' ? '3 sent, 0 failed' : '0 sent, 3 failed'}. No email transmitted.`,
      );
      const saved = await card(page, classes.morning).textContent();
      await expectNotifications(
        page,
        before,
        'Class change',
        [
          'maya.chen@example.invalid',
          'jordan.brooks@example.invalid',
          'avery.bennett@example.invalid',
        ],
        outcome,
        classes.morning,
        change.field,
      );
      await navigate(page, 'Schedule');
      expect(await card(page, classes.morning).textContent()).toEqual(saved);
      if (change.label === 'Class date')
        await expect(card(page, classes.morning)).toContainText(
          '2026-10-07 09:00 PDT',
        );
      if (change.label === 'Class start time')
        await expect(card(page, classes.morning)).toContainText(
          '2026-10-05 09:15 PDT',
        );
      if (change.label === 'Class coach')
        await expect(card(page, classes.morning)).toContainText(
          'Coach: No coach assigned',
        );
    });
  }
}

test('rejected published overlap preserves snapshots, bookings, notifications and the late-cancel marker @schedule', async ({
  page,
}) => {
  const beforeRoster = await roster(page);
  const beforeNotifications = await notificationRows(page);
  await navigate(page, 'Schedule');
  const before = await scheduleSnapshot(page);
  await page.getByLabel('Class to edit').selectOption(classes.morning);
  await page.getByLabel('Class start time', { exact: true }).fill('10:00');
  await page.getByRole('button', { name: 'Save scheduled class' }).click();
  await expect(workspace(page).getByRole('alert')).toContainText('overlaps');
  await expect(workspace(page).getByRole('status')).toHaveCount(0);
  await expect(card(page, classes.morning)).toContainText(
    'Late-cancel waiver: no',
  );
  await expect(
    page.getByLabel('Class start time', { exact: true }),
  ).toHaveValue('10:00');
  expect(await scheduleSnapshot(page)).toEqual(before);
  expect(await roster(page)).toEqual(beforeRoster);
  expect(await notificationRows(page)).toEqual(beforeNotifications);
});

for (const outcome of ['success', 'failure'] as const) {
  test(`cancellation retains history and notifies every booked and waiting member with simulated ${outcome}, never promotion @schedule @notifications`, async ({
    page,
  }) => {
    const before = await notificationSnapshot(page);
    await page.getByLabel('Simulated email outcome').selectOption(outcome);
    await navigate(page, 'Bookings');
    await page.getByLabel('Class', { exact: true }).selectOption(classes.full);
    const beforeRoster = await page
      .getByRole('table', { name: 'Class roster and booking history' })
      .getByRole('row')
      .count();
    const waiting = page.getByRole('table', { name: 'FIFO waitlist' });
    for (const name of ['Avery Bennett', 'Casey Park', 'Taylor Reed']) {
      await expect(
        waiting.getByRole('row').filter({ hasText: name }),
      ).toBeVisible();
    }
    await navigate(page, 'Schedule');
    await page.getByLabel('Class to edit').selectOption(classes.full);
    const scheduled = await scheduleSnapshot(page);
    await page.getByRole('button', { name: 'Cancel published class' }).click();
    await expect(page.getByLabel('Cancellation reason')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(await scheduleSnapshot(page)).toEqual(scheduled);
    await page.getByLabel('Cancellation reason').fill('Fictional room closure');
    await page.getByRole('button', { name: 'Cancel published class' }).click();
    await expect(
      card(page, classes.full).getByText('cancelled', { exact: true }),
    ).toBeVisible();
    await expect(card(page, classes.full)).toContainText(
      'Cancellation reason: Fictional room closure',
    );
    await expect
      .soft(workspace(page).getByRole('alert'))
      .toContainText(
        `Simulated delivery: ${outcome === 'success' ? '6 sent, 0 failed' : '0 sent, 6 failed'}. No email transmitted.`,
      );
    await navigate(page, 'Bookings');
    await page.getByLabel('Class', { exact: true }).selectOption(classes.full);
    const table = page.getByRole('table', {
      name: 'Class roster and booking history',
    });
    await expect(table.getByRole('row')).toHaveCount(beforeRoster);
    for (const name of ['Maya Chen', 'Jordan Brooks', 'Sam Patel']) {
      await expect(
        table.getByRole('row').filter({ hasText: name }),
      ).toContainText('cancelled');
    }
    await expect(
      table.getByRole('cell', { name: 'booked', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel('Booked member').getByRole('option'),
    ).toHaveCount(1);
    await expect(
      page
        .getByRole('table', { name: 'FIFO waitlist' })
        .getByText('Taylor Reed', { exact: true }),
    ).toHaveCount(0);
    const after = await notificationRows(page);
    expect(
      after
        .filter((row) => !before.rows.includes(row))
        .every((row) => row.includes('Class cancellation')),
    ).toBe(true);
    await navigate(page, 'Stations');
    expect(await optionValues(page.getByLabel('Class overlay'))).not.toContain(
      classes.full,
    );
    await navigate(page, 'Schedule');
    await persona(page, 'member:maple');
    await expect(card(page, classes.full)).toHaveCount(0);
    await persona(page, 'staff:demo-admin');
    await expect(card(page, classes.full)).toContainText(
      'Fictional room closure',
    );
    await expectNotifications(
      page,
      before,
      'Class cancellation',
      [
        'maya.chen',
        'jordan.brooks',
        'sam.patel',
        'avery.bennett',
        'casey.park',
        'taylor.reed',
      ].map((name) => `${name}@example.invalid`),
      outcome,
      classes.full,
    );
  });
}

test('clock-driven completion retains scheduled snapshots and removes completed classes from editable overlays @schedule @stations', async ({
  page,
}) => {
  await navigate(page, 'Schedule');
  await expect(
    card(page, classes.morning).getByText('published', { exact: true }),
  ).toBeVisible();
  await clockPreset(page, 'Morning class ends: 09:45', '2026-10-05T16:45:00Z');
  await expect(
    card(page, classes.morning).getByText('completed', { exact: true }),
  ).toBeVisible();
  await expect(card(page, classes.morning)).toContainText(
    '2026-10-05 09:00 PDT - 09:45 PDT',
  );
  expect(await optionValues(page.getByLabel('Class to edit'))).not.toContain(
    classes.morning,
  );
  await navigate(page, 'Stations');
  await expect(page.getByLabel('Class overlay')).toHaveValue(classes.free);
  expect(await optionValues(page.getByLabel('Class overlay'))).not.toContain(
    classes.morning,
  );
});
