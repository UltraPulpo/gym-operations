import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('static demo starter', () => {
  it('identifies the non-operational boundary and illustrative timezone', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: 'Fitness Junkie Gym Operations' }),
    ).toBeVisible();
    expect(
      screen.getByText('SIMULATED DEMO - NOT FOR OPERATIONS'),
    ).toBeVisible();
    expect(screen.getByText(/No live authentication, email/)).toBeVisible();
    expect(
      screen.getByText(/America\/Los_Angeles.*illustrative/),
    ).toBeVisible();
  });

  it('loads the overview from a hash deep link', () => {
    window.history.replaceState(null, '', '/gym-operations/#/');
    render(<App />);
    expect(
      screen.getByRole('heading', { name: 'Demo overview' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Demo overview' })).toHaveAttribute(
      'href',
      '#/',
    );
  });

  it('reports an unavailable route and returns to the overview using a hash', async () => {
    window.history.replaceState(null, '', '/gym-operations/#/unavailable');
    const user = userEvent.setup();
    render(<App />);
    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeVisible();
    expect(screen.getByText(/NOT FOR OPERATIONS/)).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Demo overview' }));
    expect(
      screen.getByRole('heading', { name: 'Demo overview' }),
    ).toBeVisible();
    expect(window.location.hash).toBe('#/');
  });
});
