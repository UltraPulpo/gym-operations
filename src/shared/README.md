# Shared UI contract

Import components and prop types from `src\shared\index.ts`. These controls
depend only on React and their CSS Module, not domain records, routes, state,
or operational services.

| Export                                          | Contract                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                        | Native button props, including `ref`; defaults to `type="button"` so incidental actions do not submit forms. `variant` is `primary`, `secondary`, or `danger`. Use native `disabled` and explain unavailable actions nearby.                                                                               |
| `Link`                                          | Native anchor props with a required `href`; retains link and keyboard semantics. Routing remains caller-owned.                                                                                                                                                                                             |
| `InputField`                                    | Native input props plus required `label`, optional `hint` and `error`. Supports text, email, number, tel, url, search, date, time, and datetime-local inputs.                                                                                                                                              |
| `SelectField`, `TextareaField`, `CheckboxField` | Native control props plus the same label/hint/error contract. Select options are passed as children.                                                                                                                                                                                                       |
| `DataTable<T>`                                  | Required `caption`, `columns`, `rows`, and `getRowKey`. Columns have stable `key`, `header`, and `render(row)`. Supply at least one column. Optional `emptyMessage`; native table headers use column scope.                                                                                                |
| `DataList`                                      | Required accessible `label` and `items` with stable `id` and `content`. Optional `emptyMessage` is announced for an empty list.                                                                                                                                                                            |
| `StatusBadge`                                   | Required string children convey status in text, regardless of color. Optional `tone`: `neutral`, `info`, `success`, `warning`, or `danger`. Static badges are not live regions.                                                                                                                            |
| `Alert`                                         | Required children, optional `title` and `tone`. Defaults to `danger`; danger/warning use `role="alert"`, other tones use `role="status"`.                                                                                                                                                                  |
| `LoadingState`                                  | Optional `label` (defaults to `Loading...`), with a text status and busy state.                                                                                                                                                                                                                            |
| `UnavailableState`                              | Required explanatory `message`, optional `title` and recovery controls as children. It does not disable external controls or invent replacement data.                                                                                                                                                      |
| `UnsupportedOperation`                          | Required `message` explaining why an operation is unavailable in the prototype. Never represents success.                                                                                                                                                                                                  |
| `Dialog`                                        | Controlled `open`, required `title`, `children`, and `onClose`; optional `description`, `initialFocus` ref, and `role` (`dialog` or `alertdialog`). Portals to the body, makes background content inert, traps focus, handles Escape, provides a Close dialog button, and restores focus on close/unmount. |
| `ConfirmationDialog`                            | Controlled `open`; required `title`, `description`, `confirmLabel`, `onConfirm`, and `onCancel`. Optional `cancelLabel` and `confirmDisabled`. Initially focuses Cancel. Escape and Close dialog cancel; only the confirm button confirms.                                                                 |

All exported component props, `FieldFeedbackProps`, `TableColumn<T>`, and
`StatusTone` are also public type exports. Native refs are supported on buttons,
links, and fields.

Fields generate unique IDs unless an explicit `id` is supplied. Hint and
validation text are associated with their control alongside any caller-provided
`aria-describedby`. An error marks the control invalid and is announced without
resetting its value. Forms own validation, submission, and any summary focus;
passing an error does not mutate input state.

Dialogs are controlled: callbacks notify the caller, which must update `open`.
Use stable refs for `initialFocus`; its target must be inside the dialog. The
first usable control is the fallback. Nested dialogs handle keyboard input only
in the top dialog. Backdrop clicks do not dismiss or confirm.

Use text to explain conflicts, missing data, and unmet conditions. Feature code
owns translating domain failures, disabling affected actions, and recovering
from them. These components provide no authorization, live operations, workflow,
or data-formatting policy.

```powershell
npm test -- src\shared
npx prettier --check src\shared
npx eslint src\shared
npm run typecheck
```
