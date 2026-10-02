import type { PropsWithChildren, ReactElement } from 'react';
import { render } from '@testing-library/react';
import type {
  queries,
  RenderOptions,
  RenderResult,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createDemoStore } from '../demo-state';
import type { DemoStore } from '../demo-state';
import { DemoStateContext } from '../demo-state/context';
import { createDemoTestState } from './state';
import type { DemoTestStateOptions } from './state';

export interface RenderWithDemoStateOptions
  extends DemoTestStateOptions, Omit<RenderOptions, 'wrapper' | 'queries'> {}

export interface RenderWithDemoStateResult extends RenderResult {
  readonly store: DemoStore;
  readonly user: ReturnType<typeof userEvent.setup>;
}

export function renderWithDemoState(
  ui: ReactElement,
  { scenarioId, actor, ...renderOptions }: RenderWithDemoStateOptions = {},
): RenderWithDemoStateResult {
  const store = createDemoStore(createDemoTestState({ scenarioId, actor }));
  const user = userEvent.setup();
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <DemoStateContext.Provider value={store}>
        {children}
      </DemoStateContext.Provider>
    );
  }

  return {
    ...render<typeof queries>(ui, { ...renderOptions, wrapper: Wrapper }),
    store,
    user,
  };
}
