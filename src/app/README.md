# Demo composition

`App` composes one `DemoStateProvider`, a `HashRouter`, and `DemoShell`. Hash
links (`#/schedule`, for example) stay under the configured repository asset
base; unknown links and unavailable persona routes have explicit fallbacks.
The shell moves focus to the destination heading after navigation, persona
changes, or full-state replacement.

The route catalog imports named screens only through feature indexes. It
derives navigation from the current account's capability union. Coach class
scope and member eligibility remain in feature/domain selectors, not the router.
Persona choices include current staff, members, and invitation records, including
newly created records and inactive/rejected examples. Selection is not
authentication and never requests credentials.

Scenario names, descriptions, actors, UTC instants, and zones come directly from
the catalog. Loading replaces the complete snapshot and confirms before
discarding edits. Reset always confirms and restores baseline state. Clock
presets use the typed `DomainResult` API; forward steps and rejected backward
presets display explicit outcomes without a timer.

The outer error boundary keeps a sticky non-operational notice visible while
scrolling and even if the provider or a feature fails. Recovery remounts the sole
provider with fresh fixtures and returns to the overview hash; it discards local
edits. Both startup and later failures focus the recovery heading. No browser
storage, network APIs, credentials, or external assets are introduced.

Shell styles reuse the shared palette and leave attendance's isolated print
roster rules unchanged. Generated coach avatars remain owned by the coach feature.

Targeted checks: `npm test -- src\app` and
`npx playwright test starter.spec.ts` after `npm run build` (Playwright uses a
filename regular expression, not a Windows path, for its selector).
The starter checks cover baseline composition, repository-base hash reload,
keyboard navigation, and responsive axe checks; full business browser workflows
are separate work.
