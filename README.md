# gym-operations

Static, fictional Fitness Junkie Gym Operations proof of concept. This starter
does not authenticate users, send email, call a backend, persist records, or
collect workout metrics. Future demo edits are in memory only and reset on
refresh. `America/Los_Angeles` is the illustrative demo timezone, not confirmed
gym policy.

## Local tooling

Use Node.js 22.12+ and npm 10+ (Node.js 24 LTS recommended).

```powershell
npm ci
npm run dev
```

The app uses React, strict TypeScript, Vite, CSS Modules, and hash routing. The
starter route is `#/`; unavailable routes retain the demo notice and offer a
return link. No server-side route rewrites are needed.

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run format:check
```

`npm test` explicitly runs Vitest once in both interactive terminals and CI,
without relying on npm to forward `--run`. Unit and component tests use React
Testing Library with jsdom. `npm run format` formats
source, browser tests, and root tooling files only; it does not format design,
plan, or other user-provided documents.

## Built-static browser checks

Install Chromium once, then run the smoke tests:

```powershell
npx playwright install chromium
npm run test:e2e
```

`test:e2e` builds first. `playwright.config.ts` launches **Vite preview**, not the
development server, on `127.0.0.1:4173` with a strict port and no reuse of an
existing server. It serves `dist` and stops after the tests. To test an existing
build directly, use `npx playwright test`. Smoke tests cover startup, hash
deep-link reload, unknown-route recovery by keyboard, and axe checks at desktop
and tablet widths. Automated axe results are not a claim of WCAG conformance.
Reports and traces are ignored by Git.

For concurrent checks against an existing build, assign each run a distinct
`PLAYWRIGHT_PORT` (for example, 4174 through 4177) and output directory:

```powershell
$env:PLAYWRIGHT_PORT = '4174'
npx playwright test starter.spec.ts --reporter=list --output=test-results/task8a
Remove-Item Env:PLAYWRIGHT_PORT
```

`PLAYWRIGHT_PORT` defaults to 4173 when unset; explicit values must be integers
from 1 to 65535 or configuration fails. Each run still starts its own strict-port
preview server without reusing an existing server. `--reporter=list` avoids a
shared HTML report.

For manual preview:

```powershell
npm run build
npm run preview -- --port 4173 --strictPort
```

The default preview URL is `http://127.0.0.1:4173/gym-operations/#/`.

## Pages repository base

The default static asset base is `/gym-operations/`. Set `PAGES_BASE_PATH` to a
root-relative path with leading and trailing slashes for another repository, or
`/` for a root site. Vite and Playwright read the same setting from the process
environment or a local `.env.production.local` file. This setting is public
build configuration, not a secret.

```powershell
$env:PAGES_BASE_PATH = '/another-repository/'
npm run test:e2e
Remove-Item Env:PAGES_BASE_PATH
```

Keep the setting identical when building and previewing/testing the resulting
bundle. Pages publishing and the full CI workflow are intentionally deferred
until the application workflows are implemented.
