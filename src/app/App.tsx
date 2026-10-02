import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { APP_ROUTES, DEMO_TIMEZONE } from './config';
import styles from './App.module.css';

export function App() {
  return (
    <HashRouter>
      <div className={styles.app}>
        <header>
          <h1>Fitness Junkie Gym Operations</h1>
          <p className={styles.boundary}>SIMULATED DEMO - NOT FOR OPERATIONS</p>
          <p>
            Fictional data only. No live authentication, email, backend, durable
            storage, or workout metrics. Demo changes will stay in memory and
            reset on refresh.
          </p>
          <p>
            Demo timezone: {DEMO_TIMEZONE} (illustrative; not confirmed gym
            policy).
          </p>
        </header>
        <nav aria-label="Demo navigation" className={styles.navigation}>
          <NavLink to={APP_ROUTES.overview} end>
            Demo overview
          </NavLink>
        </nav>
        <main className={styles.content}>
          <Routes>
            <Route
              path={APP_ROUTES.overview}
              element={
                <>
                  <h2>Demo overview</h2>
                  <p>
                    This static starter is the foundation for fictional gym
                    workflows. Persona selection, scenarios, and operational
                    screens are not implemented yet.
                  </p>
                </>
              }
            />
            <Route
              path="*"
              element={
                <>
                  <h2>Page not found</h2>
                  <p>
                    This demo route is unavailable. Use Demo overview to return
                    to the starter.
                  </p>
                </>
              }
            />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
