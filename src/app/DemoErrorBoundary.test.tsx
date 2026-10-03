import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoStateProvider, useDemoState } from '../demo-state';
import { DEMO_INITIAL_NOW } from '../demo-fixtures';
import { DemoErrorBoundary } from './DemoErrorBoundary';

function UnexpectedFailure() {
  const demo = useDemoState();
  if (demo.now !== DEMO_INITIAL_NOW)
    throw new Error('Unexpected fictional screen failure');
  return (
    <main>
      <h1>Recovered overview</h1>
      <p>{demo.now}</p>
      <button onClick={() => demo.advanceClockBy(1)}>
        Trigger unexpected failure
      </button>
    </main>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('visible unexpected-error recovery', () => {
  it('focuses recovery even when a child fails during the initial render', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function InitialFailure(): never {
      throw new Error('Unexpected startup failure');
    }
    render(
      <DemoErrorBoundary>
        <InitialFailure />
      </DemoErrorBoundary>,
    );
    expect(
      screen.getByRole('heading', { name: 'Demo recovery' }),
    ).toHaveFocus();
    expect(screen.getByText('Demo · resets on refresh')).toBeVisible();
  });

  it('retains the non-operational notice, explains the failure, and safely remounts fresh state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.history.replaceState(null, '', '/gym-operations/#/bookings');
    const user = userEvent.setup();
    render(
      <DemoErrorBoundary>
        <DemoStateProvider>
          <UnexpectedFailure />
        </DemoStateProvider>
      </DemoErrorBoundary>,
    );
    await user.click(
      screen.getByRole('button', { name: 'Trigger unexpected failure' }),
    );
    expect(screen.getByText('Demo · resets on refresh')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(/unexpected UI error/i);
    expect(screen.getByRole('alert')).toHaveTextContent(
      /No authoritative data was changed/,
    );
    expect(
      screen.getByRole('heading', { name: 'Demo recovery' }),
    ).toHaveFocus();
    await user.click(
      screen.getByRole('button', {
        name: 'Reset and recover',
      }),
    );
    expect(
      screen.getByRole('heading', { name: 'Recovered overview' }),
    ).toBeVisible();
    expect(screen.getByText(DEMO_INITIAL_NOW)).toBeVisible();
    expect(window.location.pathname).toBe('/gym-operations/');
    expect(window.location.hash).toBe('#/');
    expect(screen.getByText('Demo · resets on refresh')).toBeVisible();
  });
});
