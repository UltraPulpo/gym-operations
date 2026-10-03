# gym-operations

**SIMULATED DEMO - NOT FOR OPERATIONS.** This static Fitness Junkie Gym
Operations proof of concept uses fictional staff, members, identities, generated
avatars, email outcomes, and non-legal waiver text. It must not be used to
operate classes or collect real personal information. It does not authenticate
users, send email, call an operational backend, persist records, or collect
workout metrics. Persona and role controls are UI demonstrations, not security
boundaries; bookings are not authoritative or coordinated across visitors.

All edits are in memory and reset on refresh. The shell provides named scenarios,
confirmed reset, and a frozen virtual clock. There is no browser persistence,
service worker, offline booking, or live identity/email integration.
`America/Los_Angeles` is the user-confirmed illustrative demo and DST test zone,
not approved operational gym policy.

## Local tooling

Use Node.js 22.12+ and npm 10+ (Node.js 24 LTS recommended).

```powershell
npm ci
npx playwright install --with-deps chromium
npm run dev
```

The app uses React, strict TypeScript, Vite, CSS Modules, and hash routing. The
overview route is `#/`; unavailable routes retain the demo notice and offer a
return link. No server-side route rewrites are needed.

Chromium must be installed **before `npm test`**: the attendance artifact test
launches a real browser inside Vitest. On Linux, `--with-deps` also installs
Chromium's OS prerequisites; on Windows it installs the supported browser
components. Development serves the same repository base path as the build.

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npx playwright test --grep '@smoke'
npx playwright test
```

`npm test` explicitly runs Vitest once in both interactive terminals and CI,
without relying on npm to forward `--run`. Unit and component tests use React
Testing Library with jsdom, plus Node-based release checks and the real-browser
attendance artifact test. Release regressions exercise the Pages event/branch
guard, failure paths, check ordering, permissions, and a temporary production
build's asset base, fictional email addresses, literal URL allowlist, and known
credential/provider signatures. These checks are not a general secret scanner
or proof of production security. `npm run format` formats source, browser tests, root tooling,
README, and workflows; it does not format design, plan, or other user-provided
documents.

## Built-static browser checks

After installing Chromium, build and run the PR-blocking smoke suite:

```powershell
npm run build
npx playwright test --grep '@smoke'
```

Quote `'@smoke'` in **Windows PowerShell**: an unquoted `@smoke` is interpreted
as splatting and can silently remove the selector, resulting in incorrect
selection or "No tests found". The quoted command also works in Bash.
The smoke selection currently contains **14 tests**, covering startup/reset,
staff permissions, invitation/current-waiver acceptance, whole-template overlap
rejection, stale booking conflict, eligible FIFO promotion, exact-end no-show,
keyboard navigation/dialogs/forms/station grids, and a representative axe scan.
The full suite currently contains **104 tests** across five spec files.

To build and run the full browser suite in one command:

```powershell
npm run test:e2e
```

`test:e2e` builds first. `playwright.config.ts` launches **Vite preview**, not the
development server, on `127.0.0.1:4173` with a strict port and no reuse of an
existing server. It serves `dist` and stops after the tests. To test an existing
build directly, use `npx playwright test`. Tests verify repository-base hash
deep links, refresh reset, and representative accessibility/privacy behavior.
Automated axe results are not a claim of WCAG conformance. Reports and traces
are ignored by Git.

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
bundle. The release gate intentionally verifies `/gym-operations/`; changing
repository paths requires updating that gate and the workflow as well.

## CI and Pages release boundary

`.github/workflows/ci-pages.yml` runs on pull requests and pushes to `main`.
Read-only local `origin/HEAD` metadata identifies `origin/main` as the repository
default branch. If the default branch changes, update the push trigger, artifact
and deployment guards, and their regression test together.

Both events run locked dependency installation, Chromium/OS setup, formatting,
lint, type checks, the complete Vitest/RTL suite, and production build. Pull
requests run the 14-test smoke selection; default-branch pushes run all 104
browser tests. Tests start their own built-static preview server. Any failed
quality, build, or browser step prevents Pages artifact upload and deployment.
The existing Vite warning about the roughly 601 kB JavaScript chunk remains
visible; the size limit is not raised or hidden.

Only a successful **push to `main`** can upload `dist` and enter the dependent
Pages deployment job. Pull requests, including fork PRs, cannot deploy; there is
no `pull_request_target` trigger. The checks job has only `contents: read`.
`pages: write` and `id-token: write` are granted only to the deploy job, which
uses the `github-pages` environment. The artifact is static assets only, with
no production endpoint or identity/email secrets configured.

The repository owner must select **GitHub Actions** as the Pages source in
repository settings and configure any desired environment protections and
required PR checks. This repository provides the workflow configuration; local
verification does not execute remote Actions or publish Pages. Pushing, PR
creation, and deployment are left to the owner.
