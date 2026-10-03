import { HashRouter } from 'react-router-dom';
import { DemoStateProvider } from '../demo-state';
import { DemoErrorBoundary } from './DemoErrorBoundary';
import { DemoShell } from './DemoShell';

export function App() {
  return (
    <DemoErrorBoundary>
      <DemoStateProvider>
        <HashRouter>
          <DemoShell />
        </HashRouter>
      </DemoStateProvider>
    </DemoErrorBoundary>
  );
}
