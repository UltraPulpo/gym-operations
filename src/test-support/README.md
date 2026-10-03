# Feature component test helpers

Import test-only helpers from `src\test-support`. Do not import them into the
application bundle. Fixture identifiers and seed data stay in `src\demo-fixtures`;
scenario identifiers and snapshots stay in `src\demo-scenarios`.

```tsx
import { act } from '@testing-library/react';
import { FIXTURE_IDS } from '../demo-fixtures';
import { SCENARIO_IDS } from '../demo-scenarios';
import { renderWithDemoState } from '../test-support';

const view = renderWithDemoState(<FeatureScreen />, {
  scenarioId: SCENARIO_IDS.capacityWaitlist,
  actor: { kind: 'staff', staffId: FIXTURE_IDS.staff.frontDesk },
});

await view.user.click(view.getByRole('button', { name: 'Join waitlist' }));
expect(view.store.getSnapshot().state.waitlistEntries).toEqual(
  expect.arrayContaining([expect.objectContaining({ status: 'waiting' })]),
);

// Direct store changes that update a mounted component belong inside act.
act(() => {
  expect(view.store.resetDemo({ confirmed: true }).success).toBe(true);
});
```

`createDemoTestState(options?: DemoTestStateOptions): DemoState` creates a fresh
baseline by default. `scenarioId?: string` selects a fresh existing scenario
snapshot, including its default actor and frozen clock. `actor?: DemoActor`
overrides that persona after validation against the snapshot without advancing
the revision or marking setup as an edit. Unknown scenarios or actor records
throw explicit setup errors; there is no fallback to baseline.

`renderWithDemoState(ui, options?: RenderWithDemoStateOptions)` accepts the same
setup options plus React Testing Library render options except `wrapper` and
custom `queries`. Its result includes all standard render methods, a fresh
`userEvent.setup()` instance as `user`, and the **same `DemoStore`** consumed by
the rendered component as `store`. Submit, validate, dispatch, scenario loading,
clock controls and reset use the existing store APIs and domain results.
Direct accepted dispatch is revalidated by that store; test setup does not grant
permission to submit fabricated replacements. Use pure reducer tests only for
the accepted-action application contract.

Raw snapshots are available for validation inputs and test assertions, not for
feature rendering. Mounted consumers must render role-aware member, invitation,
staff and roster selector projections. `useDemoState().clockPresets` is a typed
result; render its scenario error explicitly rather than an empty preset list.

Each call owns separate fixture records, a separate store and a separate user
session. `rerender` preserves that call's store; unmounting and calling the helper
again creates fresh state. Normal React Testing Library cleanup applies. For
simultaneous renders, use `within(view.container)` to scope queries: standard
render queries default to the document body.

The helper supplies the existing `DemoStateContext` directly because the
application's `DemoStateProvider` owns a private store. This test-only wrapper
allows outcome assertions without changing the provider or introducing another
state implementation. Compose routing or other UI context in the `ui` argument.
No storage or external-service providers are installed.

Reset follows the real store contract: edited state requires confirmation, and
confirmed reset restores a **fresh baseline and its default actor**, not the
scenario/actor originally selected for the test. State replacement still advances
the store revision; assertions should not assume reset returns revision zero.
