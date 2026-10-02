import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('built static starter loads and reloads a repository-base hash deep link', async ({
  page,
  baseURL,
}) => {
  const pageErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push(response.url());
  });

  await page.goto(`${baseURL}#/`);
  await expect(
    page.getByRole('heading', { name: 'Demo overview' }),
  ).toBeVisible();
  await expect(
    page.getByText('SIMULATED DEMO - NOT FOR OPERATIONS'),
  ).toBeVisible();
  await expect(
    page.getByText(/America\/Los_Angeles.*illustrative/),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Demo overview' }),
  ).toBeVisible();
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
  ).toBeVisible();
  await expect(page.getByText(/NOT FOR OPERATIONS/)).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Demo overview' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Demo overview' }),
  ).toBeVisible();
  await expect(page).toHaveURL(`${baseURL}#/`);
});

test('starter has no detected axe violations at desktop and tablet widths', async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}#/`);
  for (const width of [1280, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  }
});
