import { useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { DateTime } from 'luxon';
import { DEMO_CLOCK_STEPS, useDemoState } from '../demo-state';
import { SCENARIO_IDS } from '../demo-scenarios';
import type { AcceptedAction, DomainResult, ScenarioId } from '../domain';
import { Alert, Button, ConfirmationDialog, SelectField } from '../shared';
import { APP_ROUTES } from './config';
import { actorId, getPersonas } from './personas';
import { FEATURE_ROUTES } from './routes';
import { DemoOverview } from './DemoOverview';
import styles from './App.module.css';

export function DemoShell() {
  const demo = useDemoState();
  const location = useLocation();
  const workspace = useRef<HTMLDivElement>(null);
  const [scenarioChoice, setScenarioChoice] = useState<string>(
    demo.state.scenarioId,
  );
  const [presetChoice, setPresetChoice] = useState<string>('');
  const [replacement, setReplacement] = useState<
    { kind: 'reset' } | { kind: 'scenario'; scenarioId: ScenarioId } | null
  >(null);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const personas = getPersonas(demo.state);
  const currentPersona = personas.find(
    (persona) => actorId(persona.actor) === actorId(demo.activeActor),
  );
  const selectedScenario = demo.scenarios.find(
    (scenario) => scenario.scenarioId === scenarioChoice,
  );
  const currentScenario = demo.scenarios.find(
    (scenario) => scenario.scenarioId === demo.state.scenarioId,
  );
  const preset = demo.clockPresets.success
    ? (demo.clockPresets.value.find((item) => item.presetId === presetChoice) ??
      demo.clockPresets.value[0])
    : undefined;
  const visibleRoutes = FEATURE_ROUTES.filter((route) => route.available(demo));
  const actorKey = actorId(demo.activeActor);

  useEffect(() => {
    const heading = workspace.current?.querySelector<HTMLElement>('h1, h2');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, [location.pathname, actorKey, demo.state.scenarioId, workspaceVersion]);

  function present(result: DomainResult<AcceptedAction>, message: string) {
    if (!result.success) {
      setError(`${result.error.category}: ${result.error.message}`);
      setNotice(undefined);
      return false;
    }
    setError(undefined);
    setNotice(message);
    return true;
  }

  function replaceState(action: NonNullable<typeof replacement>) {
    const result =
      action.kind === 'reset'
        ? demo.resetDemo({ confirmed: true })
        : demo.loadScenario(action.scenarioId, { confirmed: true });
    if (
      present(
        result,
        'Fictional state replaced. No operational records were changed.',
      )
    ) {
      setScenarioChoice(
        action.kind === 'reset' ? SCENARIO_IDS.baseline : action.scenarioId,
      );
      setPresetChoice('');
      setWorkspaceVersion((version) => version + 1);
    }
    setReplacement(null);
  }

  const scope = demo.capabilities.success
    ? demo.capabilities.value.classScope
    : undefined;

  return (
    <>
      <a
        className={styles.skipLink}
        href="#demo-workspace"
        onClick={(event) => {
          event.preventDefault();
          workspace.current?.focus();
        }}
      >
        Skip to demo workspace
      </a>
      <section className={styles.controls} aria-label="Demo controls">
        <div className={styles.personaPanel}>
          <p className={styles.eyebrow}>One active fictional persona</p>
          <SelectField
            label="Fictional persona"
            value={actorKey}
            hint="Persona selection is not authentication. No credentials are requested; role visibility is not a security boundary."
            onChange={(event) => {
              const selected = personas.find(
                (persona) => actorId(persona.actor) === event.target.value,
              );
              if (!selected) {
                setError(
                  'DemoUnavailableState: The selected fictional persona is unavailable.',
                );
                return;
              }
              present(
                demo.submit({
                  type: 'selectActor',
                  payload: { actor: selected.actor },
                }),
                'Active fictional persona changed.',
              );
            }}
          >
            {personas.map((persona) => (
              <option
                key={actorId(persona.actor)}
                value={actorId(persona.actor)}
              >
                {persona.label}
              </option>
            ))}
          </SelectField>
          <p aria-label="Active fictional actor" className={styles.actorBanner}>
            {currentPersona?.label ?? 'Selected fictional actor unavailable'}
          </p>
          {!demo.capabilities.success && (
            <Alert>{demo.capabilities.error.message}</Alert>
          )}
          {scope?.kind === 'all' && (
            <p>
              Class action scope: all classes. Capabilities are the union of
              this account's assigned roles.
            </p>
          )}
          {scope?.kind === 'assigned' && (
            <p>
              Coach actions are limited to assigned classes (
              {scope.classIds.length}). Other class actions are unavailable.
            </p>
          )}
          {demo.activeActor.kind === 'member' && (
            <p>
              Member actions apply only to your selected fictional record.
              Pending/inactive members cannot book or check in; current-waiver
              and timing rules still apply.
            </p>
          )}
          {demo.activeActor.kind === 'invitation' && (
            <p>
              Only the selected invitation can be accepted. Identity
              verification and signatures are simulated, not legal evidence.
            </p>
          )}
        </div>
        <div className={styles.scenarioPanel}>
          <p className={styles.eyebrow}>Replace the entire playground</p>
          <p>
            Current scenario:{' '}
            <strong>{currentScenario?.name ?? 'Unavailable scenario'}</strong>.{' '}
            {demo.hasUnsavedEdits
              ? 'Local demo edits present.'
              : 'Unedited fictional snapshot.'}
          </p>
          <SelectField
            label="Named scenario"
            value={scenarioChoice}
            onChange={(event) => setScenarioChoice(event.target.value)}
          >
            {demo.scenarios.map((scenario) => (
              <option key={scenario.scenarioId} value={scenario.scenarioId}>
                {scenario.name}
              </option>
            ))}
          </SelectField>
          {selectedScenario ? (
            <div className={styles.scenarioDetails}>
              <p>{selectedScenario.description}</p>
              <p>Scenario clock: {selectedScenario.clockInstant}</p>
              <p>
                Scenario timezone: {selectedScenario.timezone} (illustrative)
              </p>
              <p>
                Scenario actor:{' '}
                {getPersonas(selectedScenario.snapshot).find(
                  (persona) =>
                    actorId(persona.actor) ===
                    actorId(selectedScenario.defaultActor),
                )?.label ?? 'Unavailable actor'}
              </p>
            </div>
          ) : (
            <Alert>The requested demo scenario is unavailable.</Alert>
          )}
          <div className={styles.actions}>
            <Button
              disabled={!selectedScenario}
              onClick={() => {
                if (!selectedScenario) return;
                const action = {
                  kind: 'scenario',
                  scenarioId: selectedScenario.scenarioId,
                } as const;
                if (demo.hasUnsavedEdits) setReplacement(action);
                else replaceState(action);
              }}
            >
              Load scenario
            </Button>
            <Button
              variant="secondary"
              onClick={() => setReplacement({ kind: 'reset' })}
            >
              Reset demo
            </Button>
          </div>
        </div>
        <div className={styles.clockPanel}>
          <p className={styles.eyebrow}>
            Frozen virtual clock / explicit transitions only
          </p>
          <p aria-label="Frozen demo clock" className={styles.clock}>
            <time dateTime={demo.now}>{demo.now}</time>
          </p>
          <p>
            {DateTime.fromISO(demo.now, {
              zone: demo.state.settings.timezone,
            }).toFormat('ccc, dd LLL yyyy HH:mm:ss ZZZZ')}
          </p>
          <p>
            Demo timezone: {demo.state.settings.timezone} (illustrative; not
            confirmed gym policy).
          </p>
          <p>
            Forward only. Load a scenario or reset to return to an earlier
            instant. No background services or email run.
          </p>
          <SelectField
            label="Clock preset"
            value={preset?.presetId ?? ''}
            disabled={!demo.clockPresets.success}
            onChange={(event) => setPresetChoice(event.target.value)}
          >
            {demo.clockPresets.success ? (
              demo.clockPresets.value.map((item) => (
                <option key={item.presetId} value={item.presetId}>
                  {item.name}
                </option>
              ))
            ) : (
              <option value="">Presets unavailable</option>
            )}
          </SelectField>
          {!demo.clockPresets.success && (
            <Alert>
              {demo.clockPresets.error.category}:{' '}
              {demo.clockPresets.error.message}
            </Alert>
          )}
          <div className={styles.actions}>
            <Button
              disabled={!preset}
              onClick={() => {
                if (preset)
                  present(
                    demo.setClockPreset(preset.presetId),
                    'Frozen clock preset applied. Only local demo transitions occurred.',
                  );
              }}
            >
              Apply clock preset
            </Button>
            {Object.values(DEMO_CLOCK_STEPS).map((step) => (
              <Button
                key={step.minutes}
                variant="secondary"
                onClick={() =>
                  present(
                    demo.advanceClockBy(step.minutes),
                    'Frozen clock advanced. Only local demo transitions occurred.',
                  )
                }
              >
                {step.label}
              </Button>
            ))}
          </div>
        </div>
      </section>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="info">{notice}</Alert>}
      <div className={styles.workspace}>
        <nav aria-label="Demo navigation" className={styles.navigation}>
          <p className={styles.eyebrow}>Workspace</p>
          <NavLink to={APP_ROUTES.overview} end>
            Demo overview
          </NavLink>
          {visibleRoutes.map((route) => (
            <NavLink key={route.path} to={route.path}>
              {route.label}
            </NavLink>
          ))}
          <p className={styles.navHint}>
            Unavailable routes are hidden. Direct links explain demo access
            limits.
          </p>
        </nav>
        <div
          id="demo-workspace"
          ref={workspace}
          tabIndex={-1}
          className={styles.content}
        >
          <Routes
            key={`${actorKey}:${demo.state.scenarioId}:${workspaceVersion}`}
          >
            <Route path={APP_ROUTES.overview} element={<DemoOverview />} />
            {FEATURE_ROUTES.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={
                  route.available(demo) ? (
                    <>
                      {route.limitation?.(demo) && (
                        <p className={styles.limitation}>
                          {route.limitation(demo)}
                        </p>
                      )}
                      <route.Screen />
                    </>
                  ) : (
                    <main>
                      <h1>Demo access unavailable</h1>
                      <Alert>
                        {demo.capabilities.success
                          ? 'This route is unavailable for the selected fictional persona. Choose a relevant workspace link or another persona.'
                          : demo.capabilities.error.message}
                      </Alert>
                      <p>
                        Hidden actions demonstrate role limitations, not
                        authentication or production authorization.
                      </p>
                    </main>
                  )
                }
              />
            ))}
            <Route
              path="*"
              element={
                <main>
                  <h1>Page not found</h1>
                  <Alert>
                    This hash route is not part of the demo. Use Demo overview
                    in the persistent navigation to recover.
                  </Alert>
                </main>
              }
            />
          </Routes>
        </div>
      </div>
      <ConfirmationDialog
        open={replacement !== null}
        title={
          replacement?.kind === 'reset'
            ? 'Reset fictional demo?'
            : 'Replace edited demo state?'
        }
        description="This discards the complete local snapshot, including edits, and replaces its persona and frozen clock. It does not affect any operational records."
        confirmLabel={
          replacement?.kind === 'reset'
            ? 'Reset fictional state'
            : 'Replace demo state'
        }
        onCancel={() => setReplacement(null)}
        onConfirm={() => {
          if (replacement) replaceState(replacement);
        }}
      />
    </>
  );
}
