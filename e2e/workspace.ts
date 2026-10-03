import { expect, type Page } from '@playwright/test';

export async function openControls(page: Page) {
  const disclosure = page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Demo controls' }) });
  if (!(await disclosure.evaluate((element) => element.hasAttribute('open')))) {
    await disclosure.locator('summary').click();
  }
  await expect(disclosure).toHaveAttribute('open', '');
}

export async function openNavigation(page: Page) {
  const toggle = page.getByRole('button', { name: 'Navigation', exact: true });
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute('aria-expanded')) === 'false'
  ) {
    await toggle.click();
  }
}

export async function editLayout(page: Page) {
  const button = page.getByRole('button', { name: 'Edit layout', exact: true });
  if (await button.isVisible()) await button.click();
}
