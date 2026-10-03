# Fictional fixture contract

Import from `src\demo-fixtures\index.ts`:

- `createInitialDemoState(): DemoState` constructs a complete independent graph on every call.
- `FIXTURE_IDS` contains deeply frozen named identifiers, not mutable records.
- `createDemoClockPresets(): ClockPreset[]` returns fresh named UTC clock values.
- `DEMO_INITIAL_NOW`, `DEMO_TIMEZONE`, and `DEMO_NOTICE` describe the fixed illustrative demonstration boundary.

The baseline is `scenario:baseline`, with the Admin actor, at **2026-10-05 08:45 America/Los_Angeles** (`2026-10-05T15:45:00Z`). All people, identities, emails, PM5 labels, avatars, certificates, waiver markers, and policy values are fictional. Emails use `example.invalid`. Waiver markers are not legal text. Nothing authenticates, sends email, persists, or operates a gym.

## Named data for scenarios and future screens

Use named keys in `FIXTURE_IDS`, not array positions or regenerated IDs.

| Keys                                                                         | Baseline meaning                                                                                                                                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `staff.admin`, `frontDesk`, `coach`, `multiRole`, `inactive`                 | Single-role accounts, Front Desk + Coach union, and inactive access. Coach class assignments exactly match class ownership, including history.                                                               |
| `members.maple`, `cedar`, `birch`                                            | Active/current-waiver members occupying the full class.                                                                                                                                                      |
| `members.willow`, `aspen`, `juniper`                                         | Eligible waiter; active old-waiver member with retained booking; active/current-waiver unbooked member available for booking or queue rejoin.                                                                |
| `members.fern`, `moss`                                                       | Accepted pending member awaiting staff resolution; inactive member with retained flagged booking and queue entry.                                                                                            |
| `invitations.outstanding`, `expired`, `revoked`, `superseded`, `replacement` | Available acceptance, expired/revoked failures, and a superseded-to-outstanding resend link. Every member also has a reciprocal accepted invitation.                                                         |
| `waivers.old`, `current`, `draft`                                            | Published old/current versions plus unpublished draft. Aspen has only an old signature; other members retain signing evidence, including old signatures where applicable.                                    |
| `classes.checkIn`                                                            | Monday 09:00–09:45; Maple checked in, Cedar unchecked, Moss retained on outage station, East free. All four station overlay states are visible.                                                              |
| `classes.free`                                                               | Monday 10:15–10:45, no coach; Aspen retains an old-waiver booking at North. West and East are free.                                                                                                          |
| `classes.full`                                                               | Monday 12:00–13:00; all three in-service stations booked. Birch's booking reciprocally links a promoted queue entry and Juniper's earlier cancellation retains the freed-station history.                    |
| `waitlist.moss`, `aspen`, `willow`, `juniperLeft`                            | FIFO waiters: inactive, outdated waiver, then eligible Willow. Juniper's left entry allows deterministic rejoin-at-tail tests.                                                                               |
| `classes.history`, `cancelled`, `draft`, `laterRelease`                      | Completed Friday class with attended/no-show/late-cancel/staff-removal history and an outage reconciliation; fully cancelled class/queue; unpublished draft; distant published class without manual release. |
| `attendance.historyCorrected`                                                | No-show corrected to attended after class end, without reopening check-in, with Coach correction evidence.                                                                                                   |
| `templates.weekA`, `weekB`                                                   | Alternating patterns with optional coaches. Week A applied to October 5 skips the exact morning-class duplicate; either pattern expands safely into a later empty week.                                      |
| `notifications.invitationFailed`                                             | Explicit simulated failure available for resend. Other notification IDs cover confirmed booking, promotion, class cancellation, and coach change with matching recipients and event ownership.               |

Capacity is **three in-service stations** plus one out-of-service station. Station positions preserve an empty center aisle. The active-member count is **six**, below the illustrative cap of **eight**. A member-cap scenario can replace only `settings.memberCap` with the active count; do not alter accepted-invitation/signature links. Pending Fern remains pending until explicitly resolved by staff even though the baseline has available capacity.

The default release policy is **immediate**, so all published classes, including `classes.laterRelease`, are released. That distant class deliberately lacks `releasedAt`: switching to manual policy hides it, while the other upcoming published classes retain explicit release timestamps. A one-day rolling window also excludes it. Drafts, cancellations, and completed classes do not become released.

Presets identify the morning check-in open/start/close/end boundaries and the full class's late-cancel/waitlist cutoffs. `checkInOpens` precedes the baseline; returning to it requires full state replacement, not a backward clock advance. Scenario loading/reset, clock transitions, UI composition, and render helpers belong to downstream packages. Do not retain a singleton seed or use presets as a substitute for applying the attendance clock transition.

Run fixture checks with `npm test -- --run src/demo-fixtures`; use `npm run typecheck`, `npx eslint src\demo-fixtures`, and `npx prettier --check src\demo-fixtures` for the corresponding gates.
