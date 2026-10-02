import { useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { DemoState } from '../domain';
import { createInitialDemoState } from '../demo-fixtures';
import { DemoStateContext } from './context';
import { createDemoStore } from './store';

export interface DemoStateProviderProps extends PropsWithChildren {
  readonly initialState?: DemoState;
}

export function DemoStateProvider({
  children,
  initialState,
}: DemoStateProviderProps) {
  const [store] = useState(() =>
    createDemoStore(initialState ?? createInitialDemoState()),
  );

  return (
    <DemoStateContext.Provider value={store}>
      {children}
    </DemoStateContext.Provider>
  );
}
