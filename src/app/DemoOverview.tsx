import { Link } from 'react-router-dom';
import { selectClasses, useDemoState } from '../demo-state';
import { FEATURE_ROUTES } from './routes';
import styles from './App.module.css';

export function DemoOverview() {
  const demo = useDemoState();
  const classes = selectClasses(demo.state, {
    actor: demo.activeActor,
    now: demo.now,
    from: demo.now,
  });
  return (
    <main>
      <p className={styles.eyebrow}>
        A fictional rowing studio / in-memory playground
      </p>
      <h1>Demo overview</h1>
      <p className={styles.lead}>
        Explore a class from invitation to attendance. Switch one fictional
        persona at a time, try a named edge case, and advance the frozen clock
        deliberately. Nothing here reserves a real station or operates a class.
      </p>
      <div className={styles.metrics}>
        <div>
          <strong>{classes.length}</strong>
          <span>Upcoming classes in your demo scope</span>
        </div>
        <div>
          <strong>
            {demo.state.stations.filter((station) => station.inService).length}
          </strong>
          <span>In-service fictional stations</span>
        </div>
        <div>
          <strong>{demo.scenarios.length}</strong>
          <span>Deterministic scenarios to explore</span>
        </div>
      </div>
      <h2>Your demo workspace</h2>
      <p>
        Navigation follows this persona's demo capabilities. Hidden actions are
        not production authorization.
      </p>
      <div className={styles.cards}>
        {FEATURE_ROUTES.filter((route) => route.available(demo)).map(
          (route) => (
            <Link key={route.path} to={route.path}>
              <strong>Explore {route.label}</strong>
              <span>
                {route.limitation?.(demo) ??
                  'Open the fictional workflow and its available demo actions.'}
              </span>
            </Link>
          ),
        )}
      </div>
      <h2>Safe by design, not an operational system</h2>
      <p>
        All identities, addresses, avatars, and waiver text are fictional.
        Signatures are non-legal placeholders. No APIs, email delivery, browser
        storage, multi-user coordination, or offline booking are provided.
        Refresh or reset to discard this browser's changes.
      </p>
    </main>
  );
}
