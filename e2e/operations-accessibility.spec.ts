/// <reference lib="dom" />

import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

type Outcome = 'success' | 'failure';
const admin = 'staff:demo-admin';
const coach = 'staff:demo-coach';
const indigo = 'Fictional Coach Indigo';
const requestEvidence = new WeakMap<
  Page,
  { observed: string[]; unexpected: string[]; pageErrors: string[] }
>();

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL)
    throw new Error('The built static application needs a base URL.');
  const base = new URL(baseURL);
  const observed: string[] = [];
  const unexpected: string[] = [];
  const pageErrors: string[] = [];
  requestEvidence.set(page, { observed, unexpected, pageErrors });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    const description = `${request.method()} ${request.resourceType()} ${request.url()}`;
    observed.push(description);
    if (
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.origin !== base.origin ||
      !url.pathname.startsWith(base.pathname) ||
      request.method() !== 'GET' ||
      !['document', 'script', 'stylesheet', 'image', 'font', 'other'].includes(
        request.resourceType(),
      ) ||
      !(
        url.pathname === base.pathname ||
        url.pathname === `${base.pathname}index.html` ||
        url.pathname.startsWith(`${base.pathname}assets/`) ||
        /\.(?:ico|svg|png|woff2?)$/.test(url.pathname)
      )
    ) {
      unexpected.push(description);
    }
  });
});

test.afterEach(async ({ page }, testInfo) => {
  const evidence = requestEvidence.get(page);
  if (!evidence) throw new Error('Request observation was not initialized.');
  await testInfo.attach('browser-request-evidence', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  });
  expect(
    evidence.unexpected,
    'Only localhost static files, never identity/email/API requests',
  ).toEqual([]);
  expect(
    evidence.observed.some((request) => request.startsWith('GET document ')),
  ).toBe(true);
  expect(
    evidence.observed.some((request) => request.startsWith('GET script ')),
  ).toBe(true);
  expect(evidence.pageErrors).toEqual([]);
});

async function openDemo(page: Page, route = '/') {
  const response = await page.goto(`./#${route}`);
  expect(response?.ok()).toBe(true);
  await expect(
    page.getByRole('navigation', { name: 'Demo navigation' }),
  ).toBeVisible();
  await expect(page.getByLabel('Fictional persona')).toHaveValue(admin);
  await expect(page.getByLabel('Frozen demo clock')).toHaveText(
    '2026-10-05T15:45:00Z',
  );
  await expect(
    page.getByText('SIMULATED DEMO - NOT FOR OPERATIONS', { exact: true }),
  ).toBeVisible();
}

async function navigate(page: Page, name: string) {
  const link = page
    .getByRole('navigation', { name: 'Demo navigation' })
    .getByRole('link', { name, exact: true });
  if ((await link.getAttribute('href')) === new URL(page.url()).hash) {
    await expect(page.locator('#demo-workspace h1').first()).toBeVisible();
    return;
  }
  await link.click();
  await expect(page.locator('#demo-workspace h1').first()).toBeFocused();
}

async function persona(page: Page, value: string) {
  await page.getByLabel('Fictional persona').selectOption(value);
  await expect(page.getByLabel('Fictional persona')).toHaveValue(value);
}

async function scenario(page: Page, name: string) {
  await page.getByLabel('Named scenario').selectOption({ label: name });
  await page
    .getByRole('button', { name: 'Load scenario', exact: true })
    .click();
  const confirmation = page.getByRole('alertdialog', {
    name: 'Replace edited demo state?',
  });
  if (await confirmation.isVisible()) {
    await confirmation
      .getByRole('button', { name: 'Replace demo state', exact: true })
      .click();
  }
  await expect(
    page.getByText(`Current scenario: ${name}.`, { exact: false }),
  ).toBeVisible();
}

function dataRows(page: Page, caption: string) {
  return page
    .getByRole('table', { name: caption, exact: true })
    .getByRole('row')
    .filter({ has: page.getByRole('cell') });
}

async function inspectAndResend(
  page: Page,
  event: string,
  recipient: string,
  initial: Outcome,
  verifyOperation: () => Promise<void>,
  expectedReferences: readonly string[],
) {
  await persona(page, admin);
  await navigate(page, 'Notifications');
  const option = page
    .getByLabel('Notification to inspect')
    .locator('option')
    .filter({ hasText: `${event}: ${recipient} (` })
    .last();
  const id = await option.getAttribute('value');
  if (!id) throw new Error(`No notification for ${event}: ${recipient}.`);
  await page.getByLabel('Notification to inspect').selectOption(id);
  const panel = page.getByRole('region', {
    name: 'Selected notification',
    exact: true,
  });
  await expect(
    panel.getByRole('heading', { name: event, exact: true }),
  ).toBeVisible();
  const references = await panel.locator('dd').allTextContents();
  expect(references.length).toBeGreaterThan(0);
  expect(references).toEqual(expect.arrayContaining([...expectedReferences]));
  const rows = dataRows(page, 'Delivery attempt history');
  const records = await dataRows(page, 'Simulated delivery records').count();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(
    initial === 'failure' ? 'Simulated failure' : 'Simulated success',
  );
  await expect(rows.first()).toContainText('Initial post-operation simulation');
  const originalAttempt = await rows
    .first()
    .getByRole('cell')
    .allTextContents();
  if (initial === 'failure') {
    await expect(panel.getByRole('alert')).toContainText(
      'The operation remains committed',
    );
  }

  for (const [index, outcome] of (['failure', 'success'] as const).entries()) {
    await page.getByLabel('Resend outcome').selectOption(outcome);
    await page
      .getByRole('button', {
        name: 'Resend simulated notification',
        exact: true,
      })
      .click();
    await expect(rows).toHaveCount(index + 2);
    await expect(rows.first().getByRole('cell')).toHaveText(originalAttempt);
    await expect(rows.last()).toContainText(
      outcome === 'failure' ? 'Simulated failure' : 'Simulated success',
    );
    await expect(rows.last()).toContainText(`Explicit staff resend (${admin})`);
    await expect(panel.getByRole('alert')).toContainText(
      'Earlier failed attempts remain attached',
    );
    await expect(dataRows(page, 'Simulated delivery records')).toHaveCount(
      records,
    );
    expect(await panel.locator('dd').allTextContents()).toEqual(references);
    if (outcome === 'success') {
      await expect(page.getByText(/Simulated resend succeeded;/)).toBeVisible();
    }
    await verifyOperation();
    await persona(page, admin);
    await navigate(page, 'Notifications');
    await page.getByLabel('Notification to inspect').selectOption(id);
    await expect(rows).toHaveCount(index + 2);
  }
  const attempts = await rows.allTextContents();
  await navigate(page, 'Demo overview');
  await navigate(page, 'Notifications');
  await page.getByLabel('Notification to inspect').selectOption(id);
  expect(
    await rows.allTextContents(),
    'No automatic retry on navigation',
  ).toEqual(attempts);
}

const emailEvents = [
  'Invitation',
  'Booking confirmation',
  'Waitlist promotion',
  'Class cancellation',
  'Class change: date',
  'Class change: start time',
  'Class change: coach',
] as const;

for (const event of emailEvents) {
  for (const outcome of ['success', 'failure'] as const) {
    test(`${event}: simulated ${outcome}, failed and successful resends retain the actual operation`, async ({
      page,
    }) => {
      await openDemo(page);
      await navigate(page, 'Notifications');
      await page
        .getByLabel('Simulated email outcome', { exact: true })
        .selectOption(outcome);

      let recipient: string;
      let verifyOperation: () => Promise<void>;
      if (event === 'Invitation') {
        recipient = `invite-${outcome}@example.invalid`;
        await navigate(page, 'Members');
        await page
          .getByLabel('Invitation email', { exact: true })
          .fill(recipient);
        await page
          .getByRole('button', { name: 'Create invitation', exact: true })
          .click();
        verifyOperation = async () => {
          await navigate(page, 'Members');
          const row = dataRows(page, 'Fictional invitations').filter({
            hasText: recipient,
          });
          await expect(row).toHaveCount(1);
          await expect(row).toContainText('outstanding');
          await expect(row).toContainText('2026-10-12T15:45:00Z');
        };
      } else if (event === 'Booking confirmation') {
        recipient = 'juniper@example.invalid';
        await persona(page, 'member:juniper');
        await navigate(page, 'Bookings');
        await page
          .getByLabel('Class', { exact: true })
          .selectOption('class:demo-free');
        await page
          .getByLabel('Free station', { exact: true })
          .selectOption('station:demo-west');
        await page
          .getByRole('button', { name: 'Book station', exact: true })
          .click();
        await expect(page.getByLabel('Booking result')).toContainText(
          'Booking confirmed',
        );
        await persona(page, admin);
        verifyOperation = async () => {
          await navigate(page, 'Bookings');
          await page
            .getByLabel('Class', { exact: true })
            .selectOption('class:demo-free');
          const row = dataRows(page, 'Class roster and booking history').filter(
            { hasText: 'Fictional Juniper' },
          );
          await expect(row).toHaveCount(1);
          await expect(row.getByRole('cell').nth(1)).toHaveText('Demo West');
          await expect(row.getByRole('cell').nth(2)).toHaveText('booked');
        };
      } else if (event === 'Waitlist promotion') {
        recipient = 'willow@example.invalid';
        await persona(page, 'member:maple');
        await navigate(page, 'Bookings');
        await page
          .getByLabel('Class', { exact: true })
          .selectOption('class:demo-full');
        await page
          .getByRole('button', { name: 'Cancel booking', exact: true })
          .click();
        await page
          .getByRole('alertdialog', { name: 'Confirm cancellation' })
          .getByRole('button', { name: 'Confirm cancellation', exact: true })
          .click();
        await persona(page, admin);
        verifyOperation = async () => {
          await navigate(page, 'Bookings');
          await page
            .getByLabel('Class', { exact: true })
            .selectOption('class:demo-full');
          const roster = dataRows(page, 'Class roster and booking history');
          const promoted = roster.filter({ hasText: 'Fictional Willow' });
          await expect(promoted).toHaveCount(1);
          await expect(promoted.getByRole('cell').nth(1)).toHaveText(
            'Demo North',
          );
          await expect(promoted.getByRole('cell').nth(2)).toHaveText('booked');
          await expect(
            roster
              .filter({ hasText: 'Fictional Maple' })
              .getByRole('cell')
              .nth(2),
          ).toHaveText('cancelled');
          await expect(
            dataRows(page, 'FIFO waitlist').filter({
              hasText: 'Fictional Willow',
            }),
          ).toHaveCount(0);
          await expect(
            dataRows(page, 'FIFO waitlist').filter({
              hasText: 'Fictional Aspen',
            }),
          ).toHaveCount(1);
          await expect(
            dataRows(page, 'FIFO waitlist').filter({
              hasText: 'Fictional Moss',
            }),
          ).toHaveCount(1);
        };
      } else {
        recipient = 'maple@example.invalid';
        await navigate(page, 'Schedule');
        const form = page.getByRole('form', { name: 'Scheduled class editor' });
        const classId =
          event === 'Class cancellation'
            ? 'class:demo-full'
            : 'class:demo-check-in';
        await form.getByLabel('Class to edit').selectOption(classId);
        if (event === 'Class cancellation') {
          await form
            .getByLabel('Cancellation reason')
            .fill('Fictional weather demonstration.');
          await form
            .getByRole('button', { name: 'Cancel published class' })
            .click();
          verifyOperation = async () => {
            await navigate(page, 'Schedule');
            await expect(
              page.getByRole('article', {
                name: `Class ${classId}`,
                exact: true,
              }),
            ).toContainText('cancelled');
            await navigate(page, 'Bookings');
            await page
              .getByLabel('Class', { exact: true })
              .selectOption(classId);
            const roster = dataRows(page, 'Class roster and booking history');
            for (const name of ['Maple', 'Cedar', 'Birch']) {
              await expect(
                roster
                  .filter({ hasText: `Fictional ${name}` })
                  .getByRole('cell')
                  .nth(2),
              ).toHaveText('cancelled');
            }
            await expect(
              roster.filter({ hasText: 'Fictional Willow' }),
            ).toHaveCount(0);
          };
        } else {
          const field = event.slice('Class change: '.length);
          if (field === 'date')
            await form
              .getByLabel('Class date', { exact: true })
              .fill('2026-10-07');
          if (field === 'start time')
            await form.getByLabel('Class start time').fill('09:15');
          if (field === 'coach')
            await form
              .getByLabel('Class coach')
              .selectOption('staff:demo-front-desk-coach');
          await form
            .getByRole('button', { name: 'Save scheduled class' })
            .click();
          await expect(
            page.getByText('Scheduled class updated in the local demo.', {
              exact: true,
            }),
          ).toBeVisible();
          verifyOperation = async () => {
            await navigate(page, 'Schedule');
            const article = page.getByRole('article', {
              name: `Class ${classId}`,
              exact: true,
            });
            await expect(article).toContainText('published');
            await expect(article).toContainText(
              field === 'date'
                ? '2026-10-07 09:00'
                : field === 'start time'
                  ? '2026-10-05 09:15'
                  : 'Coach: Fictional Coach Coral',
            );
            await expect(article).toContainText(
              `Late-cancel waiver: ${field === 'start time' ? 'yes' : 'no'}`,
            );
            await navigate(page, 'Bookings');
            await page
              .getByLabel('Class', { exact: true })
              .selectOption(classId);
            const row = dataRows(
              page,
              'Class roster and booking history',
            ).filter({ hasText: 'Fictional Maple' });
            await expect(row.getByRole('cell').nth(2)).toHaveText('booked');
          };
        }
      }
      await verifyOperation();
      await inspectAndResend(
        page,
        event.startsWith('Class change:') ? 'Class change' : event,
        recipient,
        outcome,
        verifyOperation,
        event === 'Booking confirmation'
          ? ['class:demo-free']
          : event === 'Waitlist promotion' || event === 'Class cancellation'
            ? ['class:demo-full']
            : event.startsWith('Class change:')
              ? [
                  'class:demo-check-in',
                  event === 'Class change: date'
                    ? 'Date'
                    : event.slice('Class change: '.length),
                ]
              : [],
      );
    });
  }
}

test('downloaded roster bytes and actual print output contain only members and assigned stations', async ({
  page,
}, testInfo) => {
  await openDemo(page, '/attendance');
  await page.getByLabel('Attendance class').selectOption('class:demo-check-in');
  const entries = [
    ['Fictional Maple', 'Demo North'],
    ['Fictional Moss', 'Demo Outage'],
    ['Fictional Cedar', 'Demo West'],
  ];
  const printable = dataRows(page, 'Printable roster');
  await expect(printable).toHaveCount(entries.length);
  for (const [index, entry] of entries.entries()) {
    await expect(printable.nth(index).getByRole('cell')).toHaveText(entry);
  }
  const downloadEvent = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download roster', exact: true })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('demo-roster.csv');
  expect(await download.failure()).toBeNull();
  const file = testInfo.outputPath('demo-roster.csv');
  await download.saveAs(file);
  const bytes = await readFile(file);
  const csv = bytes.toString('utf8');
  expect(csv).toBe(
    'Member,Station\r\n' +
      entries
        .map(([member, station]) => `"${member}","${station}"`)
        .join('\r\n'),
  );
  expect(csv).not.toMatch(
    /@|email|phone|contact|waiver|signature|check.?in|outcome|correction|staff:|class:/i,
  );
  await testInfo.attach('downloaded-roster', {
    path: file,
    contentType: 'text/csv',
  });

  // Observe the real browser print event, without replacing window.print.
  const [printed] = await Promise.all([
    page.evaluate(
      () =>
        new Promise<boolean>((resolve) =>
          window.addEventListener('beforeprint', () => resolve(true), {
            once: true,
          }),
        ),
    ),
    page.getByRole('button', { name: 'Print roster', exact: true }).click(),
  ]);
  expect(printed).toBe(true);
  await page.emulateMedia({ media: 'print' });
  const visiblePrintText = await page.locator('body').evaluate((body) => {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const visible: string[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (
        parent &&
        node.textContent?.trim() &&
        parent.getClientRects().length > 0 &&
        getComputedStyle(parent).visibility === 'visible'
      ) {
        visible.push(node.textContent.trim());
      }
    }
    return visible;
  });
  expect(visiblePrintText).toEqual([
    'Printable roster',
    'Member',
    'Station',
    ...entries.flat(),
  ]);
  const pdf = await page.pdf({
    path: testInfo.outputPath('printed-roster.pdf'),
    format: 'A4',
  });
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(1000);
  await testInfo.attach('browser-printed-roster', {
    body: pdf,
    contentType: 'application/pdf',
  });
});

for (const name of ['Baseline', 'Unavailable layout', 'Stale layout']) {
  test(`${name}: manual attendance and reconciliation preserve booking assignments and lifecycle`, async ({
    page,
  }) => {
    await openDemo(page);
    if (name !== 'Baseline') await scenario(page, name);
    await navigate(page, 'Bookings');
    await page
      .getByLabel('Class', { exact: true })
      .selectOption('class:demo-check-in');
    const before = await dataRows(
      page,
      'Class roster and booking history',
    ).evaluateAll((rows) =>
      rows.map((row) =>
        Array.from(row.querySelectorAll('td'))
          .slice(0, 3)
          .map((cell) => cell.textContent),
      ),
    );
    await navigate(page, 'Attendance');
    await page
      .getByLabel('Attendance class')
      .selectOption('class:demo-check-in');
    await expect(
      page.getByText(/Offline booking is unsupported\./),
    ).toBeVisible();
    if (name !== 'Baseline') {
      await expect(
        page.getByRole('alert').filter({ hasText: /layout/i }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Map-based reseating unavailable' }),
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Download roster' }),
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Print roster' }),
      ).toBeDisabled();
    }
    const manual = page.getByRole('form', {
      name: 'Record manual outage attendance',
    });
    await manual.getByLabel('Manual class').selectOption('class:demo-check-in');
    await manual
      .getByLabel('Manual member', { exact: true })
      .selectOption('member:cedar');
    await manual.getByLabel('Manual outcome').selectOption('attended');
    await manual
      .getByLabel('Manual entry reason')
      .fill('Fictional paper roster reconciliation.');
    await manual
      .getByRole('button', { name: 'Record manual attendance' })
      .click();
    await expect(
      page.getByText(
        'Simulated manual attendance recorded; bookings unchanged.',
        { exact: true },
      ),
    ).toBeVisible();
    const row = dataRows(page, 'Class attendance roster').filter({
      hasText: 'Fictional Cedar',
    });
    await expect(row).toContainText('Attended');
    await expect(row).toContainText('Manual outage');
    await expect(row).toContainText('Fictional paper roster reconciliation.');
    await expect(row).toContainText('Not checked in');
    const correction = page.getByRole('form', { name: 'Correct attendance' });
    await correction
      .getByLabel('Attendance record')
      .selectOption({ label: 'Fictional Cedar' });
    await correction.getByLabel('Corrected outcome').selectOption('noShow');
    await correction
      .getByLabel('Correction reason')
      .fill('Fictional staff correction of paper entry.');
    await correction
      .getByRole('button', { name: 'Save attendance correction' })
      .click();
    await expect(row.getByRole('cell').nth(3)).toHaveText('No-show');
    await expect(row).toContainText('Fictional paper roster reconciliation.');
    await expect(row).toContainText(
      'Fictional staff correction of paper entry.',
    );
    await navigate(page, 'Bookings');
    await page
      .getByLabel('Class', { exact: true })
      .selectOption('class:demo-check-in');
    const after = await dataRows(
      page,
      'Class roster and booking history',
    ).evaluateAll((rows) =>
      rows.map((row) =>
        Array.from(row.querySelectorAll('td'))
          .slice(0, 3)
          .map((cell) => cell.textContent),
      ),
    );
    expect(after).toEqual(before);
    const reconciled = dataRows(
      page,
      'Class roster and booking history',
    ).filter({
      hasText: 'Fictional Cedar',
    });
    await expect(reconciled).toContainText('No-show; Not checked in');
    if (name !== 'Baseline') {
      await expect(
        page.getByRole('button', { name: 'Review reseating' }),
      ).toBeDisabled();
    }
  });
}

test('manual attendance without a booking creates an attendance-only record', async ({
  page,
}) => {
  await openDemo(page, '/bookings');
  await page
    .getByLabel('Class', { exact: true })
    .selectOption('class:demo-free');
  const before = await dataRows(
    page,
    'Class roster and booking history',
  ).allTextContents();
  await navigate(page, 'Attendance');
  await page.getByLabel('Attendance class').selectOption('class:demo-free');
  const form = page.getByRole('form', {
    name: 'Record manual outage attendance',
  });
  await form.getByLabel('Manual class').selectOption('class:demo-free');
  await form
    .getByLabel('Manual member', { exact: true })
    .selectOption('member:juniper');
  await form
    .getByLabel('Manual entry reason')
    .fill('Fictional walk-in paper attendance only.');
  await form.getByRole('button', { name: 'Record manual attendance' }).click();
  const row = dataRows(page, 'Class attendance roster').filter({
    hasText: 'Fictional Juniper',
  });
  await expect(row).toContainText('No assigned station');
  await expect(row).toContainText('No active booking');
  await expect(row).toContainText('Attended');
  await navigate(page, 'Bookings');
  await page
    .getByLabel('Class', { exact: true })
    .selectOption('class:demo-free');
  expect(
    await dataRows(page, 'Class roster and booking history').allTextContents(),
  ).toEqual(before);
});

async function assertMemberPrivacy(
  page: Page,
  privateEmail = 'coach-indigo@example.invalid',
  phone = '555-0109',
) {
  const workspace = page.locator('#demo-workspace');
  const markup = await workspace.innerHTML();
  expect(markup).not.toContain(privateEmail);
  expect(markup).not.toContain('coach-coral@example.invalid');
  expect(markup).not.toContain(phone);
  expect(markup).not.toContain('identity:');
  await expect(
    workspace.getByText('Staff-only contact', { exact: true }),
  ).toHaveCount(0);
  await expect(
    workspace.locator('a[href^="mailto:"], a[href^="tel:"]'),
  ).toHaveCount(0);
  await expect(workspace.getByRole('form')).toHaveCount(0);
}

test('Coach edits only their own biography and local generated avatar; members see public history without contacts', async ({
  page,
}) => {
  await openDemo(page, '/coaches');
  await persona(page, coach);
  const coralBefore = await page
    .getByRole('region', { name: 'Fictional Coach Coral profile', exact: true })
    .innerText();
  const form = page.getByRole('form', { name: `Edit ${indigo}`, exact: true });
  await expect(page.getByRole('form')).toHaveCount(1);
  for (const label of [
    'Coach name',
    'Certifications',
    'Staff email',
    'Staff phone',
  ]) {
    await expect(form.getByLabel(label, { exact: true })).toHaveCount(0);
  }
  await form
    .getByLabel('Biography', { exact: true })
    .fill('Fictional coach keyboard-friendly technique biography.');
  await form.getByLabel('Generated avatar').selectOption('avatar:local-coral');
  await form.getByRole('button', { name: 'Save coach profile' }).click();
  await expect(
    page.getByText('Coach profile saved in the local demo.', { exact: true }),
  ).toBeVisible();
  const profile = page.getByRole('region', {
    name: `${indigo} profile`,
    exact: true,
  });
  await expect(
    profile
      .getByRole('img', { name: `${indigo} generated avatar` })
      .locator('rect'),
  ).toHaveAttribute('fill', '#9f1239');
  await expect(
    profile.getByText('coach-indigo@example.invalid', { exact: true }),
  ).toBeVisible();
  expect(
    await page
      .getByRole('region', {
        name: 'Fictional Coach Coral profile',
        exact: true,
      })
      .innerText(),
  ).toBe(coralBefore);
  await persona(page, 'member:maple');
  await expect(profile).toContainText(
    'Fictional coach keyboard-friendly technique biography.',
  );
  await expect(profile).toContainText('Illustrative rowing certificate');
  await expect(
    profile.getByRole('img', { name: `${indigo} generated avatar` }),
  ).toBeVisible();
  const history = profile.getByRole('region', {
    name: `${indigo} class history`,
    exact: true,
  });
  await expect(history.getByRole('listitem')).toHaveCount(1);
  await expect(history).toContainText('Demo Technique - 2026-10-02 08:00');
  await expect(history).not.toContainText('2026-10-05');
  await assertMemberPrivacy(page);
  await navigate(page, 'Schedule');
  await expect(
    page.getByRole('article', {
      name: 'Class class:demo-check-in',
      exact: true,
    }),
  ).toContainText('Fictional coach keyboard-friendly technique biography.');
  await assertMemberPrivacy(page);
});

test('Admin manages coach name, certifications and private contact with validation preserving the draft', async ({
  page,
}) => {
  await openDemo(page, '/coaches');
  const form = page.getByRole('form', { name: `Edit ${indigo}`, exact: true });
  await form.getByLabel('Coach name').fill('');
  await form
    .getByLabel('Biography', { exact: true })
    .fill('Fictional Admin-edited biography.');
  await form.getByRole('button', { name: 'Save coach profile' }).click();
  await expect(form.getByLabel('Coach name')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(form.getByLabel('Biography', { exact: true })).toHaveValue(
    'Fictional Admin-edited biography.',
  );
  await expect(
    page.getByRole('heading', { name: indigo, exact: true }),
  ).toBeVisible();
  await form.getByLabel('Coach name').fill('Fictional Coach Violet');
  await form
    .getByLabel('Certifications', { exact: true })
    .fill('Illustrative rowing\nIllustrative first aid');
  await form
    .getByLabel('Staff email', { exact: true })
    .fill('violet-private@example.invalid');
  await form.getByLabel('Staff phone', { exact: true }).fill('555-0109');
  await form.getByLabel('Generated avatar').selectOption('avatar:local-indigo');
  await form.getByRole('button', { name: 'Save coach profile' }).click();
  const saved = page.getByRole('region', {
    name: 'Fictional Coach Violet profile',
    exact: true,
  });
  await expect(saved).toContainText('Illustrative first aid');
  await expect(
    saved.getByRole('region', {
      name: 'Fictional Coach Violet staff contact',
      exact: true,
    }),
  ).toContainText('violet-private@example.invalid');
  await expect(
    saved
      .getByRole('img', { name: 'Fictional Coach Violet generated avatar' })
      .locator('text'),
  ).toHaveText('FC');
  await expect(
    saved
      .getByRole('img', { name: 'Fictional Coach Violet generated avatar' })
      .locator('rect'),
  ).toHaveAttribute('fill', '#4338ca');
  await navigate(page, 'Demo overview');
  await navigate(page, 'Coaches');
  await expect(
    page
      .getByRole('form', { name: 'Edit Fictional Coach Violet' })
      .getByLabel('Staff phone'),
  ).toHaveValue('555-0109');
  await persona(page, 'staff:demo-front-desk');
  await expect(saved).toContainText('violet-private@example.invalid');
  await expect(page.getByRole('form')).toHaveCount(0);
  await persona(page, 'member:maple');
  await expect(saved).toContainText('Fictional Admin-edited biography.');
  await expect(saved).toContainText('Illustrative first aid');
  await assertMemberPrivacy(page, 'violet-private@example.invalid');
  await navigate(page, 'Schedule');
  const details = page.getByRole('article', {
    name: 'Class class:demo-check-in',
    exact: true,
  });
  await expect(details).toContainText('Coach: Fictional Coach Violet');
  await expect(details).toContainText('Fictional Admin-edited biography.');
  await expect(details).toContainText('Illustrative first aid');
  await assertMemberPrivacy(page, 'violet-private@example.invalid');
});

test('a newly created Coach requires Admin initialization before own-profile editing', async ({
  page,
}) => {
  await openDemo(page, '/staff');
  await page
    .getByRole('button', { name: 'Create staff account', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Create staff account' });
  await dialog
    .getByLabel('Staff ID', { exact: true })
    .fill('staff:fictional-new-coach');
  await dialog
    .getByLabel('Fictional identity subject')
    .fill('identity:fictional-new-coach');
  await dialog.getByLabel('Coach role', { exact: true }).check();
  await dialog
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await navigate(page, 'Coaches');
  await persona(page, 'staff:fictional-new-coach');
  await expect(
    page.getByText('Ask an active Admin to initialize this coach profile.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('form')).toHaveCount(0);
  await persona(page, admin);
  const form = page.getByRole('form', {
    name: 'Initialize staff:fictional-new-coach',
    exact: true,
  });
  await form.getByLabel('Coach name').fill('Fictional Coach Amber');
  await form
    .getByLabel('Biography', { exact: true })
    .fill('Fictional newly initialized coach.');
  await form
    .getByLabel('Certifications', { exact: true })
    .fill('Illustrative new coach certificate');
  await form
    .getByLabel('Staff email', { exact: true })
    .fill('amber-private@example.invalid');
  await form.getByLabel('Generated avatar').selectOption('avatar:local-coral');
  await form.getByRole('button', { name: 'Initialize coach profile' }).click();
  await expect(
    page.getByRole('heading', { name: 'Fictional Coach Amber', exact: true }),
  ).toBeVisible();
  await persona(page, 'staff:fictional-new-coach');
  await expect(
    page.getByRole('form', { name: 'Edit Fictional Coach Amber', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('form')).toHaveCount(1);
  await persona(page, 'member:maple');
  await expect(
    page.getByRole('region', {
      name: 'Fictional Coach Amber profile',
      exact: true,
    }),
  ).toContainText('Fictional newly initialized coach.');
  await assertMemberPrivacy(page, 'amber-private@example.invalid');
});

test('member class details include the assigned coach generated photo as well as public biography and certifications', async ({
  page,
}) => {
  await openDemo(page, '/schedule');
  await persona(page, 'member:maple');
  const details = page.getByRole('article', {
    name: 'Class class:demo-check-in',
    exact: true,
  });
  await expect(details).toContainText(indigo);
  await expect(details).toContainText(
    'Fictional technique coach for the demonstration.',
  );
  await expect(details).toContainText('Illustrative rowing certificate');
  await assertMemberPrivacy(page);
  await expect(
    details.getByRole('img', {
      name: `${indigo} generated avatar`,
      exact: true,
    }),
  ).toBeVisible();
});

test('member coach history includes a scheduled class exactly at its end, not before', async ({
  page,
}) => {
  await openDemo(page, '/coaches');
  await persona(page, 'member:maple');
  const history = page.getByRole('region', {
    name: `${indigo} class history`,
    exact: true,
  });
  await expect(history.getByRole('listitem')).toHaveCount(1);
  await page
    .getByLabel('Clock preset')
    .selectOption({ label: 'Morning class ends: 09:45' });
  await page
    .getByRole('button', { name: 'Apply clock preset', exact: true })
    .click();
  await expect(page.getByLabel('Frozen demo clock')).toHaveText(
    '2026-10-05T16:45:00Z',
  );
  await expect(history.getByRole('listitem')).toHaveCount(2);
  await expect(history.getByRole('listitem').first()).toContainText(
    '2026-10-02 08:00',
  );
  await expect(history.getByRole('listitem').last()).toContainText(
    '2026-10-05 09:00',
  );
  await expect(history.getByRole('listitem').last()).toContainText('completed');
  await expect(history).not.toContainText('2026-10-12');
  await assertMemberPrivacy(page);
});

test('startup, confirmed reset and hash-route refresh restore ephemeral fixtures @smoke', async ({
  page,
}) => {
  await openDemo(page, '/coaches');
  await page
    .getByRole('form', { name: `Edit ${indigo}`, exact: true })
    .getByLabel('Biography', { exact: true })
    .fill('Fictional edit discarded by reset.');
  await page
    .getByRole('form', { name: `Edit ${indigo}`, exact: true })
    .getByRole('button', { name: 'Save coach profile' })
    .click();
  await page.getByRole('button', { name: '+1 minute', exact: true }).click();
  await persona(page, coach);
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  const reset = page.getByRole('alertdialog', {
    name: 'Reset fictional demo?',
  });
  await expect(
    reset.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeFocused();
  await reset
    .getByRole('button', { name: 'Reset fictional state', exact: true })
    .click();
  await expect(page.getByLabel('Fictional persona')).toHaveValue(admin);
  await expect(page.getByLabel('Frozen demo clock')).toHaveText(
    '2026-10-05T15:45:00Z',
  );
  await expect(
    page
      .getByRole('form', { name: `Edit ${indigo}`, exact: true })
      .getByLabel('Biography', { exact: true }),
  ).toHaveValue('Fictional technique coach for the demonstration.');
  await page.getByRole('button', { name: '+1 minute', exact: true }).click();
  await persona(page, coach);
  await page.reload();
  await expect(page).toHaveURL(/#\/coaches$/);
  await expect(page.getByLabel('Fictional persona')).toHaveValue(admin);
  await expect(page.getByLabel('Frozen demo clock')).toHaveText(
    '2026-10-05T15:45:00Z',
  );
  await expect(
    page.getByRole('heading', { name: 'Coach profiles', exact: true }),
  ).toBeFocused();
});

async function scan(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await test.info().attach(`axe-${page.viewportSize()?.width}`, {
    body: JSON.stringify({
      url: page.url(),
      viewport: page.viewportSize(),
      violations: results.violations,
      passes: results.passes.length,
      incomplete: results.incomplete,
    }),
    contentType: 'application/json',
  });
  expect(
    results.violations,
    'Representative automated scan, not proof of full WCAG conformance',
  ).toEqual([]);
}

for (const [route, actor] of [
  ['/notifications', admin],
  ['/attendance', 'staff:demo-front-desk'],
  ['/coaches', coach],
  ['/bookings', 'member:juniper'],
] as const) {
  test(`representative ${route} feature and composed shell axe scan${route === '/bookings' ? ' @smoke' : ''}`, async ({
    page,
  }) => {
    await openDemo(page, route);
    await persona(page, actor);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(
        page.getByText('SIMULATED DEMO - NOT FOR OPERATIONS', { exact: true }),
      ).toBeVisible();
      await scan(page);
    }
  });
}

test('keyboard navigation, modal focus trap and real form submission remain operable @smoke', async ({
  page,
}) => {
  await openDemo(page);
  const skip = page.getByRole('link', { name: 'Skip to demo workspace' });
  await skip.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#demo-workspace')).toBeFocused();
  await skip.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Fictional persona')).toBeFocused();
  const link = page
    .getByRole('navigation', { name: 'Demo navigation' })
    .getByRole('link', { name: 'Staff access', exact: true });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Staff access', exact: true }),
  ).toBeFocused();
  const trigger = page.getByRole('button', {
    name: 'Create staff account',
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Create staff account' });
  await expect(dialog.getByLabel('Staff ID', { exact: true })).toBeFocused();
  await scan(page);
  await dialog
    .getByRole('button', { name: 'Close dialog', exact: true })
    .focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Staff ID', { exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    dialog.getByRole('button', { name: 'Close dialog', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.type('staff:keyboard-coach');
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Fictional identity subject')).toBeFocused();
  await page.keyboard.type('identity:keyboard-coach');
  await page.keyboard.press('Tab');
  await expect(
    dialog.getByLabel('Active account', { exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Admin role', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Coach role', { exact: true })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(dialog.getByLabel('Coach role', { exact: true })).toBeChecked();
  await dialog
    .getByRole('button', { name: 'Create account', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(
    dataRows(page, 'Fictional staff accounts').filter({
      hasText: 'staff:keyboard-coach',
    }),
  ).toContainText('Coach');
});

test('keyboard station-grid swap and Escape preserve bookings and station identity @smoke', async ({
  page,
}) => {
  await openDemo(page, '/bookings');
  await page
    .getByLabel('Class', { exact: true })
    .selectOption('class:demo-check-in');
  const before = await dataRows(
    page,
    'Class roster and booking history',
  ).allTextContents();
  await navigate(page, 'Stations');
  await page.getByLabel('Class overlay').selectOption('class:demo-check-in');
  const grid = page.getByRole('grid', { name: 'Station layout' });
  const north = grid.getByRole('button', {
    name: /Row 1, column 1: Demo North,/,
  });
  await north.focus();
  await page.keyboard.press('Enter');
  await expect(north).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(
    grid.getByRole('button', {
      name: 'Row 1, column 2: Empty cell',
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(north).toBeFocused();
  await page.keyboard.press('ArrowDown');
  const west = grid.getByRole('button', {
    name: /Row 2, column 1: Demo West,/,
  });
  await expect(west).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(north).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('Layout interaction')).toContainText(
    'No layout positions changed',
  );
  await page.keyboard.press('Space');
  await expect(west).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(north).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Layout interaction')).toContainText(
    'Station placed',
  );
  await expect(
    grid.getByRole('button', { name: /Row 1, column 1: Demo West,/ }),
  ).toBeVisible();
  await expect(
    grid.getByRole('button', { name: /Row 2, column 1: Demo North,/ }),
  ).toBeVisible();
  await scan(page);
  await navigate(page, 'Bookings');
  await page
    .getByLabel('Class', { exact: true })
    .selectOption('class:demo-check-in');
  expect(
    await dataRows(page, 'Class roster and booking history').allTextContents(),
  ).toEqual(before);
});
