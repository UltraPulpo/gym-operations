import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { expect, it, vi } from 'vitest';

// The repository's shared afterEach resets history even for Node-only tests.
vi.stubGlobal('window', { history: { replaceState() {} } });

it('downloads a real two-field roster artifact and prints only the roster, not the surrounding app', async () => {
  const harnessId = 'virtual:attendance-browser-test';
  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [
      react(),
      {
        name: 'attendance-browser-test',
        resolveId: (id) => (id === harnessId ? `\0${harnessId}` : undefined),
        load: (id) =>
          id === `\0${harnessId}`
            ? `
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import { AttendanceScreen } from '/src/features/attendance/index.ts';
          import { createInitialDemoState, FIXTURE_IDS } from '/src/demo-fixtures/index.ts';
          import { createDemoStore } from '/src/demo-state/index.ts';
          import { DemoStateContext } from '/src/demo-state/context.ts';
          const state = createInitialDemoState();
          const store = createDemoStore({
            ...state,
            layout: location.search.includes('stale') ? { ...state.layout, availability: 'stale' } : state.layout,
            members: location.search.includes('escaped')
              ? state.members.map((member) => member.memberId === FIXTURE_IDS.members.maple
                  ? { ...member, displayName: '=Fictional "Maple",\\nsecond line' } : member)
              : state.members,
            activeActor: location.search.includes('member')
              ? { kind: 'member', memberId: FIXTURE_IDS.members.cedar }
              : { kind: 'staff', staffId: FIXTURE_IDS.staff.admin },
          });
          createRoot(document.getElementById('root')).render(
            React.createElement(DemoStateContext.Provider, { value: store },
              React.createElement(React.Fragment, null,
                React.createElement('header', null, 'Private shell contact: secret@example.invalid'),
                location.search.includes('other') ? React.createElement('p', null, 'Another feature screen') : React.createElement(AttendanceScreen),
                React.createElement('footer', null, 'Private waiver and correction details')
              )
            )
          );
        `
            : undefined,
        configureServer(vite) {
          vite.middlewares.use((request, response, next) => {
            if (!request.url?.startsWith('/attendance-test')) return next();
            void vite
              .transformIndexHtml(
                request.url,
                `
              <!doctype html><html lang="en"><head><title>Attendance browser test</title></head>
              <body><div id="root"></div><script type="module" src="/@id/${harnessId}"></script></body></html>
            `,
              )
              .then((html) => {
                response.setHeader('Content-Type', 'text/html');
                response.end(html);
              }, next);
          });
        },
      },
    ],
  });
  const directory = await mkdtemp(join(tmpdir(), 'attendance-download-'));
  try {
    await server.listen();
    const baseUrl = server.resolvedUrls?.local[0];
    if (!baseUrl)
      throw new Error('Attendance test server has no responsive URL.');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ acceptDownloads: true });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const response = await page.goto(`${baseUrl}attendance-test`);
      expect(response?.ok()).toBe(true);
      await page
        .getByRole('heading', { name: 'Attendance and outage roster' })
        .waitFor();
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download roster' }).click();
      const download = await downloaded;
      expect(download.suggestedFilename()).toBe('demo-roster.csv');
      expect(await download.failure()).toBeNull();
      const file = join(directory, 'demo-roster.csv');
      await download.saveAs(file);
      const csv = await readFile(file, 'utf8');
      expect(csv).toBe(
        'Member,Station\r\n' +
          '"Maya Chen","Rower 01"\r\n' +
          '"Jordan Brooks","Rower 02"\r\n' +
          '"Avery Bennett","Rower 04"',
      );
      expect(csv).not.toMatch(
        /@|waiver|check.?in|outcome|correction|staff:|class:/i,
      );
      await page.evaluate(() => {
        window.print = () => {
          document.documentElement.dataset.printCalls = '1';
        };
      });
      await page.getByRole('button', { name: 'Print roster' }).click();
      expect(await page.locator('html').getAttribute('data-print-calls')).toBe(
        '1',
      );
      await page.emulateMedia({ media: 'print' });
      const visibleText = await page.locator('body').evaluate((body) => {
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
        const text: string[] = [];
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const parent = node.parentElement;
          if (
            parent &&
            node.textContent?.trim() &&
            getComputedStyle(parent).visibility === 'visible' &&
            getComputedStyle(parent).display !== 'none'
          ) {
            text.push(node.textContent.trim());
          }
        }
        return text;
      });
      expect(visibleText).toEqual([
        'Printable roster',
        'Member',
        'Station',
        'Maya Chen',
        'Rower 01',
        'Jordan Brooks',
        'Rower 02',
        'Avery Bennett',
        'Rower 04',
      ]);
      expect(
        await page
          .locator('header')
          .evaluate((element) => getComputedStyle(element).visibility),
      ).toBe('hidden');
      await page.goto(`${baseUrl}attendance-test?member`);
      await page.locator('h1').waitFor({ state: 'attached' });
      expect(
        await page
          .locator('button')
          .filter({ hasText: 'Download roster' })
          .count(),
      ).toBe(0);
      expect(
        await page
          .locator('header')
          .evaluate((element) => getComputedStyle(element).visibility),
      ).toBe('hidden');
      await page.goto(`${baseUrl}attendance-test?stale`);
      await page.locator('h1').waitFor({ state: 'attached' });
      expect(
        await page
          .locator('button')
          .filter({ hasText: 'Download roster' })
          .isDisabled(),
      ).toBe(true);
      expect(
        await page.getByRole('table', { name: 'Printable roster' }).count(),
      ).toBe(0);
      expect(
        await page
          .locator('header')
          .evaluate((element) => getComputedStyle(element).visibility),
      ).toBe('hidden');
      await page.goto(`${baseUrl}attendance-test?other`);
      await page.getByText('Another feature screen').waitFor();
      expect(
        await page
          .locator('header')
          .evaluate((element) => getComputedStyle(element).visibility),
      ).toBe('visible');
      await page.emulateMedia({ media: 'screen' });
      await page.goto(`${baseUrl}attendance-test?escaped`);
      await page
        .getByRole('heading', { name: 'Attendance and outage roster' })
        .waitFor();
      const escapedDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download roster' }).click();
      const escaped = await escapedDownload;
      const escapedFile = join(directory, 'escaped-roster.csv');
      await escaped.saveAs(escapedFile);
      expect(await readFile(escapedFile, 'utf8')).toBe(
        'Member,Station\r\n' +
          '"\'=Fictional ""Maple"",\nsecond line","Rower 01"\r\n' +
          '"Jordan Brooks","Rower 02"\r\n' +
          '"Avery Bennett","Rower 04"',
      );
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
    await rm(directory, { recursive: true });
  }
}, 60_000);
// @vitest-environment node
