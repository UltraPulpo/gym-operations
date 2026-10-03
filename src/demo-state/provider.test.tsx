import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FIXTURE_IDS as ids, createInitialDemoState } from '../demo-fixtures';
import { DemoStateProvider } from './provider';
import { useDemoState } from './context';
import { selectClasses } from './selectors';

function Consumer() {
  const demo = useDemoState();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <div data-testid="actor">{demo.activeActor.kind}</div>
      <div data-testid="revision">{demo.revision}</div>
      <div data-testid="has-edits">{String(demo.hasUnsavedEdits)}</div>
      <div data-testid="class-count">
        {
          selectClasses(demo.state, { actor: demo.activeActor, now: demo.now })
            .length
        }
      </div>
      <div data-testid="scenario-count">{demo.scenarios.length}</div>
      {demo.clockPresets.success ? (
        <div data-testid="clock-preset-count">
          {demo.clockPresets.value.length}
        </div>
      ) : (
        <div role="alert">{demo.clockPresets.error.message}</div>
      )}
      <button
        onClick={() => {
          const result = demo.submit({
            type: 'setSimulation',
            payload: { delivery: 'failure' },
          });
          if (!result.success) {
            setError(result.error.message);
          }
        }}
      >
        fail-delivery
      </button>
      <button
        onClick={() => {
          const result = demo.submit({
            type: 'bookStation',
            payload: {
              memberId: ids.members.maple,
              classId: ids.classes.free,
              stationId: ids.stations.east,
            },
          });
          if (!result.success) {
            setError(
              'reason' in result.error
                ? result.error.reason
                : result.error.message,
            );
          }
        }}
      >
        invalid-booking
      </button>
      <button
        onClick={() => {
          const result = demo.resetDemo();
          if (!result.success) {
            setError(
              'reason' in result.error
                ? result.error.reason
                : result.error.message,
            );
          }
        }}
      >
        reset
      </button>
      <div data-testid="error">{error ?? ''}</div>
    </div>
  );
}

describe('DemoStateProvider and useDemoState', () => {
  it('renders the typed preset error from an unavailable scenario', () => {
    render(
      <DemoStateProvider
        initialState={{
          ...createInitialDemoState(),
          scenarioId: 'scenario:missing',
        }}
      >
        <Consumer />
      </DemoStateProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /scenario.*unavailable/i,
    );
  });
  it('throws an explicit error outside the provider', () => {
    expect(() => render(<Consumer />)).toThrow(/DemoStateProvider/i);
  });

  it('renders state and derived data from the provider', () => {
    render(
      <DemoStateProvider>
        <Consumer />
      </DemoStateProvider>,
    );

    expect(screen.getByTestId('actor')).toHaveTextContent('staff');
    expect(screen.getByTestId('revision')).toHaveTextContent('0');
    expect(screen.getByTestId('class-count')).toHaveTextContent('7');
    expect(screen.getByTestId('scenario-count')).toHaveTextContent('10');
    expect(screen.getByTestId('clock-preset-count')).toHaveTextContent('7');
  });

  it('updates UI after a successful submit', async () => {
    const user = userEvent.setup();
    render(
      <DemoStateProvider>
        <Consumer />
      </DemoStateProvider>,
    );

    await user.click(screen.getByText('fail-delivery'));

    expect(screen.getByTestId('revision')).toHaveTextContent('1');
    expect(screen.getByTestId('has-edits')).toHaveTextContent('true');
    expect(screen.getByTestId('error')).toHaveTextContent('');
  });

  it('keeps state unchanged when a rejected action is submitted', async () => {
    const user = userEvent.setup();
    render(
      <DemoStateProvider>
        <Consumer />
      </DemoStateProvider>,
    );

    await user.click(screen.getByText('invalid-booking'));

    expect(screen.getByTestId('revision')).toHaveTextContent('0');
    expect(screen.getByTestId('error')).toHaveTextContent('roleDenied');
  });

  it('surfaces reset confirmation when edited', async () => {
    const user = userEvent.setup();
    render(
      <DemoStateProvider>
        <Consumer />
      </DemoStateProvider>,
    );

    await user.click(screen.getByText('fail-delivery'));
    await user.click(screen.getByText('reset'));

    expect(screen.getByTestId('revision')).toHaveTextContent('1');
    expect(screen.getByTestId('error')).toHaveTextContent(
      'confirmationRequired',
    );
  });

  it('isolates multiple providers', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <DemoStateProvider>
          <Consumer />
        </DemoStateProvider>
        <DemoStateProvider>
          <Consumer />
        </DemoStateProvider>
      </div>,
    );

    const buttons = screen.getAllByText('fail-delivery');
    await user.click(buttons[0]!);

    const revisions = screen.getAllByTestId('revision');
    expect(revisions[0]).toHaveTextContent('1');
    expect(revisions[1]).toHaveTextContent('0');
  });

  it('uses the provided initial state per mount', () => {
    const initialState = {
      ...createInitialDemoState(),
      activeActor: { kind: 'member' as const, memberId: ids.members.willow },
    };
    render(
      <DemoStateProvider initialState={initialState}>
        <Consumer />
      </DemoStateProvider>,
    );

    expect(screen.getByTestId('actor')).toHaveTextContent('member');
  });
});
