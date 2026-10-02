import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const classes = {
  morning: 'class:demo-check-in',
  free: 'class:demo-free',
  full: 'class:demo-full',
} as const;
const staff = { admin: 'staff:demo-admin' } as const;
const STALE_MESSAGE =
  'The demo state changed before this action could be submitted. Review current availability and make a new selection.';

const workspace = (page: Page) => page.locator('#demo-workspace');
const clock = (page: Page) => page.getByLabel('Frozen demo clock');
const roster = (page: Page) =>
  workspace(page).getByRole('table', {
    name: 'Class roster and booking history',
  });
const ownBookings = (page: Page) =>
  workspace(page).getByRole('table', { name: 'Your bookings' });
const waitlist = (page: Page) =>
  workspace(page).getByRole('table', { name: 'FIFO waitlist' });
const attendanceRoster = (page: Page) =>
  workspace(page).getByRole('table', { name: 'Class attendance roster' });
const bookingError = (page: Page) =>
  workspace(page).getByRole('alert', { name: 'Booking error' });
const bookingResult = (page: Page) =>
  workspace(page).getByRole('status', { name: 'Booking result' });
const confirmation = (page: Page) => page.getByRole('alertdialog');
const row = (table: Locator, ...texts: string[]) =>
  texts.reduce(
    (rows, text) => rows.filter({ hasText: text }),
    table.getByRole('row'),
  );
const withStatus = (rows: Locator, status: string) =>
  rows.filter({
    has: rows.page().getByRole('cell', { name: status, exact: true }),
  });
const bookedRow = (table: Locator, ...texts: string[]) =>
  withStatus(row(table, ...texts), 'booked');

async function rowsText(table: Locator) {
  return (await table.getByRole('row').allTextContents()).map((text) =>
    text.trim(),
  );
}

async function openDemo(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}#/`);
  await expect(clock(page)).toHaveText('2026-10-05T15:45:00Z');
  await expect(page.getByLabel('Fictional persona')).toHaveValue(staff.admin);
}

const routes: Record<string, [string, string]> = {
  Bookings: ['/bookings', 'Bookings and waitlists'],
  Attendance: ['/attendance', 'Attendance and outage roster'],
  Waivers: ['/waivers', 'Fictional waivers'],
  Stations: ['/stations', 'Stations and layout'],
  Schedule: ['/schedule', 'Schedule'],
};

async function navigate(page: Page, name: keyof typeof routes) {
  const [path, heading] = routes[name];
  await page
    .getByRole('navigation', { name: 'Demo navigation' })
    .getByRole('link', { name, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`#${path}$`));
  await expect(
    workspace(page).getByRole('heading', {
      level: 1,
      name: heading,
      exact: true,
    }),
  ).toBeVisible();
}

async function loadScenario(page: Page, name: string, actor: string) {
  await page.getByLabel('Named scenario').selectOption({ label: name });
  await page
    .getByRole('button', { name: 'Load scenario', exact: true })
    .click();
  await expect(page.getByText(`Current scenario: ${name}.`)).toBeVisible();
  await expect(page.getByLabel('Fictional persona')).toHaveValue(actor);
}

async function choosePersona(page: Page, actor: string) {
  await page.getByLabel('Fictional persona').selectOption(actor);
  await expect(page.getByLabel('Fictional persona')).toHaveValue(actor);
}

async function applyPreset(page: Page, name: string, instant: string) {
  await page.getByLabel('Clock preset').selectOption({ label: name });
  await page.getByRole('button', { name: 'Apply clock preset' }).click();
  await expect(clock(page)).toHaveText(instant);
}

async function advance(page: Page, step: string, times = 1) {
  for (let index = 0; index < times; index += 1) {
    await page.getByRole('button', { name: step, exact: true }).click();
  }
}

async function openBookings(page: Page, classId: string) {
  await navigate(page, 'Bookings');
  await workspace(page)
    .getByLabel('Class', { exact: true })
    .selectOption(classId);
}

async function openAttendance(page: Page, classId: string) {
  await navigate(page, 'Attendance');
  await workspace(page).getByLabel('Attendance class').selectOption(classId);
}

async function reviewStaffReseat(
  page: Page,
  bookedMember: string,
  destination: string,
) {
  const controls = workspace(page).getByRole('region', {
    name: 'Staff booking controls',
  });
  await controls
    .getByLabel('Booked member')
    .selectOption({ label: bookedMember });
  await controls
    .getByLabel('Destination station')
    .selectOption({ label: destination });
  await controls.getByRole('button', { name: 'Review reseating' }).click();
}

async function cancelOwnBooking(page: Page) {
  await workspace(page).getByRole('button', { name: 'Cancel booking' }).click();
  await expect(confirmation(page)).toContainText('Confirm cancellation');
  await confirmation(page)
    .getByRole('button', { name: 'Confirm cancellation' })
    .click();
  await expect(bookingResult(page)).toHaveText(
    'Cancellation confirmed in this demo.',
  );
}

test.beforeEach(async ({ page, baseURL }) => {
  await openDemo(page, baseURL);
});

test('a stale member booking selection reports a conflict, never success, and rebooks from fresh availability @smoke', async ({
  page,
}) => {
  await loadScenario(page, 'Capacity and waitlist', 'member:juniper');
  await openBookings(page, classes.free);
  const station = workspace(page).getByLabel('Free station');
  await expect(station.getByRole('option')).toHaveText([
    'Choose a free station',
    'Demo West - Available',
    'Demo East - Available',
  ]);
  await station.selectOption({ label: 'Demo West - Available' });

  // Another supported same-browser transition changes the snapshot while the selection is pending.
  await advance(page, '+1 minute');
  await expect(clock(page)).toHaveText('2026-10-05T15:46:00Z');
  await workspace(page).getByRole('button', { name: 'Book station' }).click();

  await expect(bookingError(page)).toHaveText(STALE_MESSAGE);
  await expect(bookingResult(page)).toHaveCount(0);
  await expect(workspace(page).getByText(/Booking confirmed/)).toHaveCount(0);
  await expect(ownBookings(page)).toContainText('No records to display.');
  await expect(station).toHaveValue('');
  await expect(station.getByRole('option')).toHaveText([
    'Choose a free station',
    'Demo West - Available',
    'Demo East - Available',
  ]);

  await station.selectOption({ label: 'Demo West - Available' });
  await workspace(page).getByRole('button', { name: 'Book station' }).click();
  await expect(bookingResult(page)).toHaveText(
    'Booking confirmed in this demo.',
  );
  await expect(bookingError(page)).toHaveCount(0);
  await expect(bookedRow(ownBookings(page), 'Demo West')).toHaveCount(1);
});

test('a stale staff move confirmation is rejected and leaves assignments and history unchanged', async ({
  page,
}) => {
  await openBookings(page, classes.morning);
  const before = await rowsText(roster(page));
  await expect(row(roster(page), 'Fictional Cedar', 'Demo West')).toHaveCount(
    1,
  );
  const destinations = workspace(page)
    .getByRole('region', { name: 'Staff booking controls' })
    .getByLabel('Destination station');
  await workspace(page)
    .getByLabel('Booked member')
    .selectOption({ label: 'Fictional Cedar - Demo West' });
  await expect(destinations.getByRole('option')).not.toContainText([
    /Demo Outage/,
  ]);

  await reviewStaffReseat(
    page,
    'Fictional Cedar - Demo West',
    'Demo East - Available',
  );
  await expect(confirmation(page)).toContainText('Confirm station move');
  await confirmation(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(confirmation(page)).toHaveCount(0);
  expect(await rowsText(roster(page))).toEqual(before);

  await advance(page, '+1 minute');
  await workspace(page)
    .getByRole('button', { name: 'Review reseating' })
    .click();
  await expect(confirmation(page)).toContainText(
    'Move Fictional Cedar from Demo West to Demo East?',
  );
  await confirmation(page)
    .getByRole('button', { name: 'Confirm move' })
    .click();
  await expect(bookingError(page)).toHaveText(STALE_MESSAGE);
  await expect(bookingResult(page)).toHaveCount(0);
  expect(await rowsText(roster(page))).toEqual(before);

  await reviewStaffReseat(
    page,
    'Fictional Cedar - Demo West',
    'Demo East - Available',
  );
  await confirmation(page)
    .getByRole('button', { name: 'Confirm move' })
    .click();
  await expect(bookingResult(page)).toHaveText(
    'Station move confirmed in this demo.',
  );
  await expect(
    bookedRow(roster(page), 'Fictional Cedar', 'Demo East'),
  ).toContainText('Booked; Not checked in');
  await expect(row(roster(page), 'Fictional Cedar', 'Demo West')).toHaveCount(
    0,
  );
});

test('a cancellation before cutoff promotes the first eligible FIFO waiter and retains skipped waiters for review @smoke', async ({
  page,
}) => {
  await loadScenario(page, 'Capacity and waitlist', 'member:juniper');
  await choosePersona(page, 'member:maple');
  await openBookings(page, classes.full);
  await expect(bookedRow(ownBookings(page), 'Demo North')).toHaveCount(1);
  await cancelOwnBooking(page);
  await expect(row(ownBookings(page), 'Demo North')).toContainText('cancelled');
  await expect(row(ownBookings(page), 'Demo North')).toContainText(
    'Cancelled; Not checked in',
  );

  await choosePersona(page, staff.admin);
  await openBookings(page, classes.full);
  await expect(
    bookedRow(roster(page), 'Fictional Willow', 'Demo North'),
  ).toHaveCount(1);
  await expect(
    workspace(page).getByText(/free in-service stations: 0/),
  ).toBeVisible();
  await expect(row(waitlist(page), 'Fictional Moss')).toContainText(
    'Inactive member: staff review required',
  );
  await expect(row(waitlist(page), 'Fictional Moss')).toContainText('waiting');
  await expect(row(waitlist(page), 'Fictional Aspen')).toContainText(
    'Current waiver required',
  );
  await expect(row(waitlist(page), 'Fictional Aspen')).toContainText('waiting');
  await expect(row(waitlist(page), 'Fictional Willow')).toHaveCount(0);
  await expect(workspace(page).getByText(/waiting: 2\./)).toBeVisible();
  await expect(
    workspace(page)
      .getByRole('table', { name: 'Email simulation records' })
      .getByRole('row')
      .filter({ hasText: 'Waitlist promotion' }),
  ).toHaveCount(2);
});

test('the waitlist cutoff is strict: one minute before promotes, exact cutoff leaves the station for ordinary booking', async ({
  page,
}) => {
  await loadScenario(page, 'Capacity and waitlist', 'member:juniper');
  await applyPreset(
    page,
    'Full class late-cancel cutoff: 10:00',
    '2026-10-05T17:00:00Z',
  );
  await advance(page, '+15 minutes', 3);
  await advance(page, '+1 minute', 14);
  await expect(clock(page)).toHaveText('2026-10-05T17:59:00Z');
  await choosePersona(page, 'member:maple');
  await openBookings(page, classes.full);
  await cancelOwnBooking(page);
  await expect(row(ownBookings(page), 'Demo North')).toContainText(
    'Late cancel',
  );
  await choosePersona(page, staff.admin);
  await openBookings(page, classes.full);
  await expect(
    bookedRow(roster(page), 'Fictional Willow', 'Demo North'),
  ).toHaveCount(1);

  await advance(page, '+1 minute');
  await expect(clock(page)).toHaveText('2026-10-05T18:00:00Z');
  await choosePersona(page, 'member:cedar');
  await openBookings(page, classes.full);
  await cancelOwnBooking(page);
  await choosePersona(page, staff.admin);
  await openBookings(page, classes.full);
  await expect(bookedRow(roster(page), 'Demo West')).toHaveCount(0);
  await expect(
    workspace(page).getByText(/free in-service stations: 1/),
  ).toBeVisible();
  await expect(row(waitlist(page), 'Fictional Moss')).toContainText('waiting');
  await expect(row(waitlist(page), 'Fictional Aspen')).toContainText('waiting');

  await choosePersona(page, 'member:juniper');
  await openBookings(page, classes.full);
  await expect(
    workspace(page).getByRole('button', { name: 'Join waitlist' }),
  ).toBeDisabled();
  await workspace(page)
    .getByLabel('Free station')
    .selectOption({ label: 'Demo West - Available' });
  await workspace(page).getByRole('button', { name: 'Book station' }).click();
  await expect(bookingResult(page)).toHaveText(
    'Booking confirmed in this demo.',
  );
  await expect(bookedRow(ownBookings(page), 'Demo West')).toHaveCount(1);
});

test('out-of-service stations, class cancellation, and occupied swaps never promote waiters', async ({
  page,
}) => {
  await loadScenario(page, 'Capacity and waitlist', 'member:juniper');
  await choosePersona(page, staff.admin);
  await openBookings(page, classes.full);
  const waitlistBefore = await rowsText(waitlist(page));

  await reviewStaffReseat(
    page,
    'Fictional Maple - Demo North',
    'Demo East - Booked, not checked in',
  );
  await expect(confirmation(page)).toContainText(
    'Confirm occupied-station swap',
  );
  await confirmation(page)
    .getByRole('button', { name: 'Confirm swap' })
    .click();
  await expect(bookingResult(page)).toHaveText(
    'Station swap confirmed in this demo.',
  );
  await expect(
    bookedRow(roster(page), 'Fictional Maple', 'Demo East'),
  ).toHaveCount(1);
  expect(await rowsText(waitlist(page))).toEqual(waitlistBefore);

  await navigate(page, 'Stations');
  await workspace(page)
    .getByLabel('Station to edit')
    .selectOption({ label: 'Demo East' });
  await workspace(page).getByLabel('In service', { exact: true }).uncheck();
  await workspace(page).getByRole('button', { name: 'Save station' }).click();
  await choosePersona(page, 'member:maple');
  await openBookings(page, classes.full);
  await cancelOwnBooking(page);
  await choosePersona(page, staff.admin);
  await openBookings(page, classes.full);
  await expect(bookedRow(roster(page), 'Fictional Willow')).toHaveCount(0);
  expect(await rowsText(waitlist(page))).toEqual(waitlistBefore);

  await navigate(page, 'Schedule');
  await workspace(page).getByLabel('Class to edit').selectOption(classes.full);
  await workspace(page)
    .getByLabel('Cancellation reason')
    .fill('Fictional cancellation for the no-promotion demonstration.');
  await workspace(page)
    .getByRole('button', { name: 'Cancel published class' })
    .click();
  await openBookings(page, classes.full);
  await expect(
    workspace(page).getByText(/Class status: cancelled/),
  ).toBeVisible();
  await expect(row(roster(page), 'Fictional Willow')).toHaveCount(0);
  await expect(bookedRow(roster(page))).toHaveCount(0);
  await expect(
    withStatus(row(roster(page), 'Fictional Birch', 'Demo North'), 'cancelled'),
  ).toHaveCount(1);
  await expect(
    withStatus(row(roster(page), 'Fictional Cedar', 'Demo West'), 'cancelled'),
  ).toHaveCount(1);
  await expect(workspace(page).getByText(/waiting: 0\./)).toBeVisible();
  await expect(waitlist(page)).toContainText('No records to display.');
});

test('leaving and rejoining the waitlist places the member at the FIFO tail', async ({
  page,
}) => {
  await loadScenario(page, 'Capacity and waitlist', 'member:juniper');
  await openBookings(page, classes.full);
  await expect(
    workspace(page).getByRole('button', { name: 'Book station' }),
  ).toBeDisabled();
  await workspace(page).getByRole('button', { name: 'Join waitlist' }).click();
  await expect(bookingResult(page)).toHaveText(
    'Joined the FIFO waitlist in this demo.',
  );
  await expect(
    workspace(page).getByText(/Your FIFO join order: 6\./),
  ).toBeVisible();
  await workspace(page).getByRole('button', { name: 'Leave waitlist' }).click();
  await expect(bookingResult(page)).toHaveText(
    'Left the waitlist in this demo. History retained.',
  );
  await workspace(page).getByRole('button', { name: 'Join waitlist' }).click();
  await expect(
    workspace(page).getByText(/Your FIFO join order: 7\./),
  ).toBeVisible();

  await choosePersona(page, staff.admin);
  await openBookings(page, classes.full);
  const waiting = waitlist(page)
    .getByRole('row')
    .filter({ hasText: 'waiting' });
  await expect(waiting.last()).toContainText('Fictional Juniper');
  await expect(waiting.last()).toContainText('7');
  await expect(
    row(waitlist(page), 'Fictional Willow', 'waiting'),
  ).toContainText('4');
});

test('member cancellation at the exact late-cancel cutoff is not late, after it is late, and staff removal is distinct', async ({
  page,
}) => {
  await loadScenario(page, 'Capacity and waitlist', 'member:juniper');
  await applyPreset(
    page,
    'Full class late-cancel cutoff: 10:00',
    '2026-10-05T17:00:00Z',
  );
  await choosePersona(page, 'member:maple');
  await openBookings(page, classes.full);
  await cancelOwnBooking(page);
  await expect(row(ownBookings(page), 'Demo North')).toContainText(
    'Cancelled; Not checked in',
  );

  await advance(page, '+1 minute');
  await choosePersona(page, 'member:cedar');
  await openBookings(page, classes.full);
  await cancelOwnBooking(page);
  await expect(row(ownBookings(page), 'Demo West')).toContainText(
    'Late cancel; Not checked in',
  );

  await choosePersona(page, staff.admin);
  await openBookings(page, classes.full);
  const controls = workspace(page).getByRole('region', {
    name: 'Staff booking controls',
  });
  await controls
    .getByLabel('Booked member')
    .selectOption({ label: 'Fictional Birch - Demo East' });
  await controls.getByRole('button', { name: 'Remove booking' }).click();
  await expect(confirmation(page)).toHaveCount(0);
  await expect(bookingError(page)).toHaveText(
    'Explain why the booking is removed.',
  );
  await expect(bookedRow(roster(page), 'Fictional Birch')).toHaveCount(1);
  await controls
    .getByLabel('Removal reason')
    .fill('Fictional staff removal reason.');
  await controls.getByRole('button', { name: 'Remove booking' }).click();
  await expect(confirmation(page)).toContainText(
    'This records staff removal, not a member late cancellation or no-show.',
  );
  await confirmation(page)
    .getByRole('button', { name: 'Confirm removal' })
    .click();
  await expect(bookingResult(page)).toContainText(
    'Staff removal confirmed in this demo.',
  );
  await expect(row(roster(page), 'Fictional Birch', 'Demo East')).toContainText(
    'Staff removal; Not checked in',
  );
  await expect(row(roster(page), 'Fictional Cedar', 'Demo West')).toContainText(
    'Late cancel',
  );
  await expect(
    row(roster(page), 'Fictional Maple', 'Demo North'),
  ).toContainText('Cancelled; Not checked in');
});

test('occupied swaps need explicit confirmation; rejection preserves both assignments and outcomes', async ({
  page,
}) => {
  await openBookings(page, classes.full);
  const before = await rowsText(roster(page));
  const emails = workspace(page).getByRole('table', {
    name: 'Email simulation records',
  });
  const emailsBefore = await rowsText(emails);
  await reviewStaffReseat(
    page,
    'Fictional Maple - Demo North',
    'Demo East - Booked, not checked in',
  );
  await expect(confirmation(page)).toContainText(
    'Swap Fictional Maple at Demo North with Fictional Birch at Demo East? Neither assignment changes until confirmation.',
  );
  await confirmation(page).getByRole('button', { name: 'Cancel' }).click();
  expect(await rowsText(roster(page))).toEqual(before);
  await workspace(page)
    .getByRole('button', { name: 'Review reseating' })
    .click();
  await page.keyboard.press('Escape');
  await expect(confirmation(page)).toHaveCount(0);
  await expect(bookingResult(page)).toHaveCount(0);
  expect(await rowsText(roster(page))).toEqual(before);

  await workspace(page)
    .getByRole('button', { name: 'Review reseating' })
    .click();
  await confirmation(page)
    .getByRole('button', { name: 'Confirm swap' })
    .click();
  await expect(bookingResult(page)).toHaveText(
    'Station swap confirmed in this demo.',
  );
  await expect(
    bookedRow(roster(page), 'Fictional Maple', 'Demo East'),
  ).toContainText('Booked; Not checked in');
  await expect(
    bookedRow(roster(page), 'Fictional Birch', 'Demo North'),
  ).toContainText('Booked; Not checked in');
  expect(await rowsText(emails)).toEqual(emailsBefore);
});

test('stale and unavailable layouts disable all reseating without erasing bookings', async ({
  page,
}) => {
  for (const [scenario, message] of [
    ['Stale layout', /^Class layout data is stale\./],
    ['Unavailable layout', /unavailable/i],
  ] as const) {
    await loadScenario(page, scenario, 'staff:demo-front-desk');
    await openBookings(page, classes.morning);
    await expect(
      workspace(page).getByText(
        'Station selection and map-based reseating are disabled.',
        { exact: false },
      ),
    ).toContainText(message);
    const controls = workspace(page).getByRole('region', {
      name: 'Staff booking controls',
    });
    await expect(controls.getByLabel('Destination station')).toBeDisabled();
    await expect(
      controls.getByRole('button', { name: 'Review reseating' }),
    ).toBeDisabled();
    await expect(
      bookedRow(roster(page), 'Fictional Cedar', 'Demo West'),
    ).toHaveCount(1);
    await expect(
      bookedRow(roster(page), 'Fictional Maple', 'Demo North'),
    ).toHaveCount(1);
    await expect(confirmation(page)).toHaveCount(0);
    await expect(bookingResult(page)).toHaveCount(0);
  }
});

test('member self-check-in opens at the lead boundary only with a current waiver', async ({
  page,
}) => {
  await choosePersona(page, 'member:aspen');
  await openAttendance(page, classes.free);
  const checkIn = attendanceRoster(page).getByRole('button', {
    name: 'Check in Fictional Aspen',
  });
  await expect(checkIn).toBeDisabled();

  await navigate(page, 'Waivers');
  await workspace(page)
    .getByLabel('Fictional typed name')
    .fill('Fictional Aspen');
  await workspace(page)
    .getByRole('button', { name: 'Sign current fictional waiver' })
    .click();
  await confirmation(page)
    .getByRole('button', { name: 'Record simulated signature' })
    .click();

  await advance(page, '+15 minutes', 3);
  await advance(page, '+1 minute', 14);
  await expect(clock(page)).toHaveText('2026-10-05T16:44:00Z');
  await openAttendance(page, classes.free);
  await expect(checkIn).toBeDisabled();
  await advance(page, '+1 minute');
  await expect(clock(page)).toHaveText('2026-10-05T16:45:00Z');
  await expect(checkIn).toBeEnabled();
  await checkIn.click();
  await expect(
    workspace(page).getByText('Simulated check-in recorded.'),
  ).toBeVisible();
  await expect(row(attendanceRoster(page), 'Fictional Aspen')).toContainText(
    'Checked in at 2026-10-05T16:45:00Z (UTC)',
  );
});

test('an outdated waiver blocks self-check-in inside the window until the current waiver is signed', async ({
  page,
}) => {
  await loadScenario(page, 'Waiver and attendance', 'member:aspen');
  await expect(clock(page)).toHaveText('2026-10-05T17:15:00Z');
  await openAttendance(page, classes.free);
  const checkIn = attendanceRoster(page).getByRole('button', {
    name: 'Check in Fictional Aspen',
  });
  await expect(checkIn).toBeDisabled();
  await expect(row(attendanceRoster(page), 'Fictional Aspen')).toContainText(
    /waiver/i,
  );
  await navigate(page, 'Waivers');
  await workspace(page)
    .getByLabel('Fictional typed name')
    .fill('Fictional Aspen');
  await workspace(page)
    .getByRole('button', { name: 'Sign current fictional waiver' })
    .click();
  await confirmation(page)
    .getByRole('button', { name: 'Record simulated signature' })
    .click();
  await openAttendance(page, classes.free);
  await expect(checkIn).toBeEnabled();
  await checkIn.click();
  await expect(row(attendanceRoster(page), 'Fictional Aspen')).toContainText(
    'Checked in at 2026-10-05T17:15:00Z (UTC)',
  );
});

test('member self-check-in closes after the grace boundary', async ({
  page,
}) => {
  await applyPreset(
    page,
    'Morning check-in closes: 09:05',
    '2026-10-05T16:05:00Z',
  );
  await choosePersona(page, 'member:cedar');
  await openAttendance(page, classes.morning);
  const checkIn = attendanceRoster(page).getByRole('button', {
    name: 'Check in Fictional Cedar',
  });
  await expect(checkIn).toBeEnabled();
  await advance(page, '+1 minute');
  await expect(checkIn).toBeDisabled();
  await expect(row(attendanceRoster(page), 'Fictional Cedar')).toContainText(
    'Not checked in',
  );
});

test('the exact class end records no-shows once; corrections keep history and manual entries stay independent @smoke', async ({
  page,
}) => {
  await applyPreset(
    page,
    'Morning check-in closes: 09:05',
    '2026-10-05T16:05:00Z',
  );
  await advance(page, '+15 minutes', 2);
  await advance(page, '+1 minute', 9);
  await expect(clock(page)).toHaveText('2026-10-05T16:44:00Z');
  await openAttendance(page, classes.morning);
  const cedar = row(attendanceRoster(page), 'Fictional Cedar');
  const maple = row(attendanceRoster(page), 'Fictional Maple');
  await expect(
    cedar.getByRole('cell', { name: 'Booked', exact: true }),
  ).toHaveCount(1);
  await expect(cedar).not.toContainText('No-show');

  await advance(page, '+1 minute');
  await expect(clock(page)).toHaveText('2026-10-05T16:45:00Z');
  await expect(cedar).toContainText('No-show');
  await expect(cedar).toContainText('Class-end transition');
  await expect(cedar).toContainText('No corrections');
  await expect(maple).toContainText('Attended');
  const afterEnd = await rowsText(attendanceRoster(page));

  await advance(page, '+1 minute');
  await advance(page, '+15 minutes');
  expect(await rowsText(attendanceRoster(page))).toEqual(afterEnd);
  await expect(clock(page)).toHaveText('2026-10-05T17:01:00Z');

  const correction = workspace(page).getByRole('form', {
    name: 'Correct attendance',
  });
  await correction
    .getByLabel('Attendance record')
    .selectOption({ label: 'Fictional Cedar' });
  await correction.getByLabel('Corrected outcome').selectOption('attended');
  await correction
    .getByLabel('Correction reason')
    .fill('Fictional coach confirmed attendance.');
  await correction
    .getByRole('button', { name: 'Save attendance correction' })
    .click();
  await expect(
    workspace(page).getByText(
      'Simulated attendance correction recorded; history retained.',
    ),
  ).toBeVisible();
  await expect(cedar).toContainText('Attended');
  await expect(cedar).toContainText('Not checked in');
  await expect(cedar).toContainText(
    'No-show to Attended - Fictional coach confirmed attendance. (staff:demo-admin, 2026-10-05T17:01:00Z UTC)',
  );
  await advance(page, '+1 hour');
  await expect(cedar).toContainText('Attended');
  await expect(cedar.getByRole('listitem')).toHaveCount(1);

  await openBookings(page, classes.morning);
  const bookingsBefore = await rowsText(roster(page));
  await openAttendance(page, classes.morning);
  const manual = workspace(page).getByRole('form', {
    name: 'Record manual outage attendance',
  });
  await manual.getByLabel('Manual class').selectOption(classes.morning);
  await manual
    .getByLabel('Manual member', { exact: true })
    .selectOption({ label: 'Fictional Juniper' });
  await manual.getByLabel('Manual outcome').selectOption('attended');
  await manual
    .getByLabel('Manual entry reason')
    .fill('Fictional paper roster reconciliation.');
  await manual
    .getByRole('button', { name: 'Record manual attendance' })
    .click();
  await expect(
    workspace(page).getByText(
      'Simulated manual attendance recorded; bookings unchanged.',
    ),
  ).toBeVisible();
  const juniper = row(attendanceRoster(page), 'Fictional Juniper');
  await expect(juniper).toContainText('No assigned station');
  await expect(juniper).toContainText('Manual outage');
  await expect(juniper).toContainText('No active booking');
  await openBookings(page, classes.morning);
  expect(await rowsText(roster(page))).toEqual(bookingsBefore);
  await expect(row(roster(page), 'Fictional Juniper')).toHaveCount(0);
});

test('roster-only staff reseating is allowed at the inclusive class end with a closed map and denied afterward', async ({
  page,
}) => {
  await applyPreset(page, 'Morning class ends: 09:45', '2026-10-05T16:45:00Z');
  await openBookings(page, classes.morning);
  await expect(
    workspace(page).getByText(
      /The map is disabled at class end\. Authorized roster-only reseating remains available at the scheduled end, including after class-end processing\./,
    ),
  ).toBeVisible();
  await expect(
    workspace(page).getByRole('grid', { name: 'Station layout' }),
  ).toHaveCount(0);
  await expect(row(roster(page), 'Fictional Cedar')).toContainText(
    'No-show; Not checked in',
  );

  await reviewStaffReseat(
    page,
    'Fictional Cedar - Demo West',
    'Demo East - Available',
  );
  await confirmation(page)
    .getByRole('button', { name: 'Confirm move' })
    .click();
  await expect(bookingResult(page)).toHaveText(
    'Station move confirmed in this demo.',
  );
  await expect(row(roster(page), 'Fictional Cedar', 'Demo East')).toContainText(
    'No-show; Not checked in',
  );

  await advance(page, '+1 minute');
  await expect(
    workspace(page).getByText(
      'This class is history or not published. Reseating and removal are unavailable.',
    ),
  ).toBeVisible();
  const controls = workspace(page).getByRole('region', {
    name: 'Staff booking controls',
  });
  await expect(
    controls.getByRole('button', { name: 'Review reseating' }),
  ).toBeDisabled();
  await expect(
    controls.getByRole('button', { name: 'Remove booking' }),
  ).toBeDisabled();
  await expect(controls.getByLabel('Destination station')).toBeDisabled();
});
