import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openControls, openNavigation } from './workspace';

for (const width of [320, 390, 768, 1440]) {
  test(`compact workspace and station inspection at ${width}px @smoke`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./#/stations');
    const controls = page
      .locator('details')
      .filter({ has: page.locator('summary', { hasText: 'Demo controls' }) });
    await expect(controls).not.toHaveAttribute('open');
    for (const target of [
      controls.locator('summary'),
      page.getByRole('button', { name: 'Edit layout', exact: true }),
    ]) {
      const targetBounds = await target.boundingBox();
      expect(targetBounds!.height).toBeGreaterThanOrEqual(44);
      expect(targetBounds!.width).toBeGreaterThanOrEqual(44);
    }
    await expect(
      page.getByText('Demo · resets on refresh', { exact: true }),
    ).toHaveCount(1);
    const heading = page.getByRole('heading', { name: 'Stations and layout' });
    const bounds = await heading.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThan(800);
    const menu = page.getByRole('button', { name: 'Navigation', exact: true });
    if (width <= 800) {
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
      await expect(
        page.getByRole('navigation', { name: 'Demo navigation' }),
      ).toBeHidden();
    } else {
      await expect(menu).toHaveCount(0);
      await expect(
        page.getByRole('navigation', { name: 'Demo navigation' }),
      ).toBeVisible();
    }
    expect(
      await page.locator('html').evaluate((html) => html.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
    const tile = page
      .getByRole('grid')
      .getByRole('button', { name: /^Row 1, column 1:/ });
    const geometry = await tile.boundingBox();
    expect(geometry!.width).toBeGreaterThanOrEqual(44);
    expect(geometry!.width).toBeLessThan(120);
    expect(geometry!.height).toBeGreaterThanOrEqual(44);
    expect(geometry!.height).toBeLessThan(128);
    await tile.click();
    const details = page.getByRole('region', { name: 'Station details' });
    await expect(details).toContainText('Maya Chen');
    await expect(page.getByLabel('Station label', { exact: true })).toHaveCount(
      0,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`station-view-${width}.png`),
      fullPage: true,
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page
      .getByRole('button', { name: 'Edit layout', exact: true })
      .click();
    const field = page.getByLabel('Station label', { exact: true });
    expect((await field.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const serviceTarget = page
      .getByLabel('In service', { exact: true })
      .locator('..');
    expect((await serviceTarget.boundingBox())!.height).toBeGreaterThanOrEqual(
      44,
    );
    if (width <= 800) {
      expect(
        await field.evaluate((element) =>
          parseFloat(getComputedStyle(element).fontSize),
        ),
      ).toBeGreaterThanOrEqual(16);
    }
    await tile.click();
    await expect(
      page.getByRole('button', { name: 'Cancel placement' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cancel placement' }).click();
    await expect(
      page.getByRole('status', { name: 'Layout interaction' }),
    ).toContainText('No layout positions changed');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`station-edit-${width}.png`),
      fullPage: true,
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Finish editing' }).click();
    await openControls(page);
    await page
      .getByLabel('Persona', { exact: true })
      .selectOption('member:maple');
    await tile.click();
    await expect(details).not.toContainText('Maya Chen');
    await expect(details).not.toContainText('Jordan Brooks');
    await expect(
      page.getByRole('button', { name: 'Edit layout', exact: true }),
    ).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await controls.locator('summary').click();
    await openNavigation(page);
    await page
      .getByRole('navigation')
      .getByRole('link', { name: 'Schedule', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Schedule', exact: true }),
    ).toBeFocused();
    if (width <= 800)
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(
      await page.locator('html').evaluate((html) => html.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
  });
}

test('mobile map scroll, long labels, touch placement, reset and resize preserve intent', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 800 },
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.goto(test.info().project.use.baseURL + '#/stations');
    const grid = page.getByRole('grid');
    const source = grid.getByRole('button', { name: /^Row 1, column 1:/ });
    await page.getByRole('button', { name: 'Edit layout', exact: true }).tap();
    await page
      .getByLabel('Station label', { exact: true })
      .fill('Rower 01 - riverside training area');
    await page.getByRole('button', { name: 'Save station', exact: true }).tap();
    await source.tap();
    await grid.getByRole('button', { name: /^Row 2, column 1:/ }).tap();
    await expect(
      grid.getByRole('button', { name: /^Row 2, column 1:/ }),
    ).toContainText('Rower 01 - riverside training area');
    const scroller = grid.locator('..');
    const dimensions = await scroller.evaluate((element) => ({
      width: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(dimensions.scroll).toBeGreaterThan(dimensions.width);
    expect(
      await page.locator('html').evaluate((html) => html.scrollWidth),
    ).toBeLessThanOrEqual(321);
    await page.getByRole('button', { name: 'Finish editing' }).tap();
    await openControls(page);
    await page.getByRole('button', { name: 'Reset demo', exact: true }).tap();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Reset data' })
      .tap();
    await expect(
      page.getByRole('button', { name: 'Edit layout', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Station label', { exact: true })).toHaveCount(
      0,
    );
    await openNavigation(page);
    await page
      .getByRole('navigation')
      .getByRole('link', { name: 'Stations', exact: true })
      .focus();
    await page.setViewportSize({ width: 1440, height: 800 });
    await expect(page.getByRole('navigation')).toBeVisible();
    await page.setViewportSize({ width: 320, height: 800 });
    await expect(page.getByRole('navigation')).toBeHidden();
    await expect(page.locator('#demo-workspace')).toBeFocused();
  } finally {
    await context.close();
  }
});
