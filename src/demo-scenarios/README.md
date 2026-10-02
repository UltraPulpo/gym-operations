# Fictional scenario contract

Import from `src\demo-scenarios\index.ts`. This package has no provider, reducer, persistence, browser interaction, or operational service integration.

- `getScenarios(): DemoScenario[]` returns a fresh default-first catalog.
- `loadScenario(scenarioId: string): DomainResult<DemoScenario>` returns fresh metadata and a complete `value.snapshot`, matching the domain's stable `LoadScenario` contract. Replace the entire state with that snapshot; do not merge it into current edits.
- `getScenarioClockPresets(scenarioId: string): DomainResult<ClockPreset[]>` returns fresh presets, starting with that scenario's initial clock. October scenarios also include the fixture check-in/start/end and late-cancel/waitlist boundaries. DST scenarios include the seconds bracketing the transition.
- `DEFAULT_SCENARIO_ID` is `SCENARIO_IDS.baseline`, exactly the initial fixture state on every load. Selecting another scenario never changes this default.
- `SCENARIO_IDS` and `SCENARIO_DATA_IDS` are frozen named identifiers, not mutable records. `DemoScenario` is re-exported from the domain without redefining its shape.

Unknown, blank, differently cased, or whitespace-padded IDs return `DemoUnavailableState` with `resource: 'scenario'` and the requested `resourceId`. Neither loader silently falls back to baseline. Catalog entries, repeated loads, and presets share no mutable objects. Expected domain failures remain typed; an invalid internally constructed fixture throws an explicit diagnostic rather than returning a success-shaped fallback.

Every scenario sets a default actor, fixed UTC instant, matching preset, revision zero, scenario ID, and illustrative `America/Los_Angeles` metadata. Advancing a seed to a later snapshot applies the domain attendance clock transition first, preserving class-end/no-show and correction history. The catalog does not run an invitation-expiry background service; invitation actions still validate expiry against the selected clock.

## Browser-test starting points

Use `SCENARIO_IDS` and the fixture's `FIXTURE_IDS`, never catalog or entity array positions.

| Scenario key          | Default actor / local clock              | Demonstration                                                                                                                                                                                                                                                                  |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `baseline`            | Admin / October 5, 2026 08:45            | Exact initial state; all four station overlays; named check-in and class-end boundaries; staff/member layout privacy.                                                                                                                                                          |
| `capacityWaitlist`    | Juniper / October 5 08:45                | Full noon class; Juniper rejoins at order 6. Cancel Maple to free North and promote Willow, skipping inactive Moss and outdated-waiver Aspen while retaining review flags.                                                                                                     |
| `invitationMemberCap` | Outstanding invitation / October 5 08:45 | Six active members at cap six; complete acceptance creates pending membership and signature evidence. Baseline cap eight creates active membership. Expired, revoked, superseded, and replacement links remain linked.                                                         |
| `scheduleConflict`    | Admin / October 5 08:45                  | Apply Week A to `2026-10-05`: its Monday 09:15 entry conflicts with the morning class, rejecting the whole proposal. Apply `SCENARIO_DATA_IDS.gapTemplate` to the same week: one 09:45–10:15 draft succeeds with two zero-gap warnings. The existing schedule itself is valid. |
| `waiverAttendance`    | Aspen / October 5 10:15                  | Old-waiver booking at North is retained; new booking/check-in fails until signing the current waiver. Morning class is already completed, Cedar is a no-show, and earlier corrections survive.                                                                                 |
| `serviceUnavailable`  | Admin / October 5 08:45                  | All stations out of service; zero capacity blocks publication/booking. Existing bookings retain stations/status and receive review flags. Future notification delivery is simulated failure, never actual email.                                                               |
| `layoutUnavailable`   | Front Desk / October 5 08:45             | Explicit unavailable layout; no map-based reseating; complete reservations and identities retained.                                                                                                                                                                            |
| `layoutStale`         | Front Desk / October 5 08:45             | Explicit stale layout; no map-based reseating; reload/reset can restore current layout.                                                                                                                                                                                        |
| `dstSpring`           | Admin / March 13, 2027 12:00             | Apply `SCENARIO_DATA_IDS.dstTemplate` to `2027-03-01` and `2027-03-08`: Sunday 09:00 persists while UTC changes from 17:00 to 16:00 (167 elapsed hours).                                                                                                                       |
| `dstFall`             | Admin / October 31, 2026 12:00           | Apply the DST template to `2026-10-19` and `2026-10-26`: Sunday 09:00 persists while UTC changes from 16:00 to 17:00 (169 elapsed hours).                                                                                                                                      |

The late-cancel cutoff itself is an ordinary cancellation; one second after is late. Automatic promotion stops at the exact waitlist cutoff. Member check-in includes both opening and grace-close instants. Class-end completion/no-show occurs at the exact end instant. Some October boundary presets precede a scenario's initial clock: returning to an earlier instant requires full scenario/reset replacement, not a backward clock advance. Presets are values only; downstream clock actions must apply domain transitions, not merely change `clock.now`.

All identities, emails, avatar references, equipment labels, waiver markers, and policy values are fictional and illustrative, not approved gym policy or legal waiver content. Nothing authenticates, sends email, or persists.

Run `npm test -- --run src\demo-scenarios`, `npm run typecheck`, `npx eslint src\demo-scenarios`, and `npx prettier --check src\demo-scenarios`.
