import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openControls, openNavigation } from './workspace';

test('built demo loads and resets ephemeral state on a repository-base hash refresh', async ({
  page,
  baseURL,
}) => {
  const pageErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push(response.url());
  });

  await page.goto(`${baseURL}#/schedule`);
  await expect(
    page.getByRole('heading', { name: 'Schedule', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Demo · resets on refresh', { exact: true }),
  ).toBeVisible();
  await openControls(page);
  await expect(
    page.getByText(/Demo timezone: America\/Los_Angeles.*illustrative/),
  ).toBeVisible();
  await page.getByRole('button', { name: '+1 minute', exact: true }).click();
  await expect(page.getByLabel('Frozen demo clock')).toHaveText(
    '2026-10-05T15:46:00Z',
  );
  await page
    .getByLabel('Persona', { exact: true })
    .selectOption('staff:demo-front-desk');
  await expect(
    page.getByText(/Schedule is read-only for this persona/),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Schedule', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(`${baseURL}#/schedule`);
  await expect(page.getByLabel('Persona', { exact: true })).toHaveValue(
    'staff:demo-admin',
  );
  await expect(page.getByLabel('Frozen demo clock')).toHaveText(
    '2026-10-05T15:45:00Z',
  );
  expect(pageErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
});

test('unknown hash routes retain the boundary and offer keyboard navigation', async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}#/unavailable`);
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeFocused();
  await expect(page.getByText('Demo · resets on refresh')).toBeVisible();
  await page.getByRole('link', { name: 'Skip to demo workspace' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('summary')).toBeFocused();
  await page.getByRole('link', { name: 'Demo overview', exact: true }).focus();
  await expect(page.getByRole('link', { name: 'Demo overview' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Demo overview' }),
  ).toBeFocused();
  await expect(page).toHaveURL(`${baseURL}#/`);
});

test('composed shell stays readable with no detected axe violations at desktop, tablet, and phone widths', async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}#/`);
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole('heading', { name: 'Demo overview' }),
    ).toBeVisible();
    await expect(
      page.getByText('Demo · resets on refresh', { exact: true }),
    ).toBeVisible();
    expect(
      await page.locator('html').evaluate((element) => element.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  }
});

test('baseline navigation mounts every real feature screen and retains the current notice', async ({
  page,
  baseURL,
}) => {
  const operationalRequests: string[] = [];
  page.on('request', (request) => {
    if (['fetch', 'xhr', 'websocket'].includes(request.resourceType())) {
      operationalRequests.push(request.url());
    }
  });
  await page.goto(`${baseURL}#/`);
  const screens = [
    ['Staff access', 'Staff access', '/staff'],
    ['Members', 'Members and invitations', '/members'],
    ['Invitations', 'Invitation acceptance', '/invitations'],
    ['Waivers', 'Waivers', '/waivers'],
    ['Stations', 'Stations and layout', '/stations'],
    ['Classes', 'Class types', '/classes'],
    ['Schedule', 'Schedule', '/schedule'],
    ['Bookings', 'Bookings and waitlists', '/bookings'],
    ['Attendance', 'Attendance and outage roster', '/attendance'],
    ['Notifications', 'Notifications', '/notifications'],
    ['Coaches', 'Coach profiles', '/coaches'],
    ['Settings', 'Admin settings', '/settings'],
  ];
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [label, heading, path] of screens) {
      await openNavigation(page);
      await page
        .getByRole('navigation', { name: 'Demo navigation' })
        .getByRole('link', { name: label, exact: true })
        .click();
      await expect(page).toHaveURL(`${baseURL}#${path}`);
      await expect(
        page.getByRole('heading', { name: heading, exact: true }),
      ).toBeFocused();
      const notice = page.getByText('Demo · resets on refresh', {
        exact: true,
      });
      await expect(notice).toHaveCount(1);
      await expect(notice).toBeVisible();
      const bounds = await notice.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
        page.viewportSize()!.height,
      );
      await expect(page.getByLabel('Persona', { exact: true })).toHaveValue(
        'staff:demo-admin',
      );
      expect(
        await page.locator('html').evaluate((element) => element.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
  }
  expect(operationalRequests).toEqual([]);
});
