# Demo state boundary

`src\demo-state` is the single feature-facing state boundary for the fictional Gym Operations demo. It validates UI actions, applies accepted reducer actions, exposes pure selectors, and never uses network or browser storage. These local checks demonstrate privacy and workflow rules; they are not production authentication or authorization.

## Public API

- `validateAction(state, actor, action, now)`
- `createDemoStore(initialState?)`
- `DemoStateProvider`, `useDemoState()`
- selectors from `selectors.ts`
- clock helpers from `clock.ts`
- `demoReducer`, `DemoReducerError`

## Read data with selectors

```ts
import { selectClasses, selectPrintableRoster } from '../demo-state';

const classes = selectClasses(state, {
  actor: state.activeActor,
  now: state.clock.now,
});
const roster = selectPrintableRoster(state, selectedClassId, state.activeActor);
if (!roster.success) {
  // Display roster.error.message; do not render a roster.
}
```

`useDemoState().state` remains the immutable **validation snapshot**, required by
`validateAction(state, actor, action, now)` and domain validators. It must not be
used to render raw member, invitation, or staff records. Feature rendering must
use role-aware projections:

- `selectMember(state, memberId, actor?)` and `selectMembers(state, actor?)` return
  `MemberView` DTOs. Member-management staff see member contacts; members see only
  their own record and contacts; coaches see names/status only for active bookings
  on assigned classes. Identity subjects are never projected.
- `selectInvitations(state, actor?)` returns `InvitationView` DTOs to invitation-management
  staff, or only the selected invitation to its valid invitee.
- `selectStaff(state, staffId, actor?)` and `selectStaffAccounts(state, actor?)`
  return `StaffAccountView` DTOs only to staff-management personas, without identity
  subjects or coach profile contacts. Use the existing role-aware coach profile
  selector for coach profiles.
- `selectPrintableRoster(state, classId, actor?)` returns
  `DomainResult<PrintableRoster>`, restricted to authorized staff and assigned
  coach classes. Entries contain only member display names and station labels.

Omitted selector actors default to the current snapshot actor. Empty directory
projections mean that no records are visible to that persona; roster errors remain
explicit typed results. Never maintain a competing editable state tree.

## Validate, render failures, then submit

```ts
const result = demo.submit({
  type: 'bookStation',
  payload: {
    memberId,
    classId,
    stationId,
  },
});

if (!result.success) {
  // ValidationError => field messages
  // IneligibleDemoAction / DemoConflict / DemoUnavailableState => alert
}
```

## Reset or load a scenario with confirmation

```ts
const reset = demo.resetDemo({ confirmed: true });
const loaded = demo.loadScenario('scenario:waiver-attendance', {
  confirmed: true,
});
```

When there are unsaved local edits, `resetDemo()` and `loadScenario()` return `confirmationRequired` unless `confirmed: true` is supplied. Pristine state can reset or load without confirmation.

## Frozen clock controls

```ts
const presets = demo.clockPresets;
if (!presets.success) {
  // Display presets.error.message instead of an empty preset control.
}
const stepAction = advanceClockBy(demo.state, 15);
const presetAction = setClockPresetAction('clockPreset:class-end');
```

The clock never ticks on its own. `clock.now` changes only through accepted `advanceClock` or `setClockPreset` actions, and exact-end attendance completion/no-show rules run during those accepted transitions.
`selectClockPresets(state)` and `demo.clockPresets` return
`DomainResult<readonly ClockPreset[]>`; unavailable scenario errors are preserved.
Clock steps catch only target-construction `RangeError`s. Unexpected reducer and
subscriber exceptions propagate, including subscriber failures after a committed
transition.

## Stale revision handling

```ts
const result = store.submit(action, { expectedRevision: currentRevision });
```

If another accepted action already advanced the store, the store returns a typed revision conflict and leaves state unchanged.
Public `store.dispatch(accepted): void` revalidates the request against the current
actor, clock and revision, then compares the entire envelope (including replacements
and warnings) with that fresh result. Stale, mismatched or tampered envelopes throw
`DemoReducerError` without changing the snapshot or notifying subscribers. A valid
independently constructed or cloned accepted envelope remains supported.

`demoReducer(state, accepted)` is deliberately a pure accepted-action applier, not
a live authorization service. It checks reducer structure/revision and applies the
supplied transition without replaying domain rules. Synthetic reducer tests exercise
that contract; feature callers must use the store's validated dispatch boundary.

## Notifications and simulated delivery

Notification records are stored in state. Delivery failures never roll back the business change that triggered them; they simply produce a failed notification record that staff can resend.

Manual promotion and automatic promotion after cancellation/removal/reseating reuse
one pure FIFO policy in `src\domain\booking.ts`. The domain
`promoteWaitlist(state, actor, classId, stationId, now)` returns
`DomainResult<WaitlistPromotionResult>` with explicit `promoted` status, `changes`,
and `warnings`. No eligible waiter yields `promoted: false`, a
`waitlistNotPromoted` warning and a review-only waitlist patch, never a booking,
attendance record or notification. State validation carries those warnings into
the accepted envelope so features must display them, not announce a promotion.
Automated transitions still succeed for their primary cancellation/removal/move
and retain skipped-entry flags even when no promotion occurs. Both paths stop
strictly at cutoff equality and commit promotion records with notifications
together; invalid notification construction rejects the complete transition.

## What is simulated

- role/capability checks for fictional personas
- invitation email outcomes
- external identity outcomes
- scenario replacement and virtual time
- class-end attendance completion

Not simulated here: persistence, live authentication, real email, shared concurrency, or network calls.

## 52-variant routing table

| Action                                                                                                                                        | Validation owner                              | Capability / notes                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `createStaffAccount`, `updateStaffAccount`, `deactivateStaffAccount`                                                                          | `roles.ts`                                    | `manageStaff`                                                                                |
| `createInvitation`, `resendInvitation`, `revokeInvitation`, `expireInvitations`, `acceptInvitation`, `updateMemberProfile`, `setMemberStatus` | `membership.ts` + `validation.ts` composition | membership flows; invitation create/resend add composed notification                         |
| `createWaiverVersion`, `publishWaiver`, `signWaiver`                                                                                          | `waivers.ts` + `validation.ts`                | `manageWaivers` or `signWaiver`                                                              |
| `createStation`, `updateStation`, `placeStation`, `setLayoutOrientation`                                                                      | `stations.ts`                                 | `manageStations`                                                                             |
| `createClassType`, `updateClassType`                                                                                                          | `class-types.ts`                              | `manageClassTypes`                                                                           |
| `createWeeklyTemplate`, `updateWeeklyTemplate`, `deleteWeeklyTemplate`                                                                        | `scheduling.ts`                               | `manageTemplates`                                                                            |
| `applyWeeklyTemplate`, `createDraftClass`, `editScheduledClass`, `deleteDraftClass`, `publishClasses`, `releaseClasses`, `cancelClass`        | `scheduling.ts` + `validation.ts`             | `manageSchedule`; publishes return warnings; class edits/cancels add member notifications    |
| `bookStation`, `cancelBooking`, `removeBooking`, `moveBooking`, `swapBookings`, `joinWaitlist`, `leaveWaitlist`                               | `booking.ts` + generated ids                  | booking/waitlist rules, promotion side-effects, confirmation checks                          |
| `promoteWaitlist`                                                                                                                             | `booking.ts`                                  | `manageWaitlists`; shared FIFO promotion, explicit non-promotion warnings and review patches |
| `checkIn`, `reverseCheckIn`, `correctAttendance`, `recordManualAttendance`                                                                    | `attendance.ts`                               | attendance and correction history                                                            |
| `resendNotification`                                                                                                                          | `notifications.ts`                            | `manageNotifications`                                                                        |
| `updateOwnCoachProfile`, `updateCoachProfile`                                                                                                 | `coaches.ts`                                  | own/self or admin coach profile edits                                                        |
| `updateSettings`                                                                                                                              | `validation.ts`                               | `manageSettings`; whole numbers, unchanged timezone                                          |
| `selectActor`, `setSimulation`, `advanceClock`, `setClockPreset`, `resetDemo`, `loadScenario`                                                 | `validation.ts`                               | demo-only controls, no production side effects                                               |
| `unsupportedOperation`                                                                                                                        | `validation.ts`                               | always returns `UnsupportedPrototypeOperation`                                               |
