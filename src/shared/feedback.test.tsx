import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  Alert,
  Button,
  LoadingState,
  StatusBadge,
  UnavailableState,
  UnsupportedOperation,
} from './index';

describe('shared feedback', () => {
  it.each([
    'Available',
    'Booked - not checked in',
    'Booked - checked in',
    'Out of service',
  ])('conveys %s in visible text, not only color', (label) => {
    render(<StatusBadge tone="warning">{label}</StatusBadge>);
    expect(screen.getByText(label)).toBeVisible();
  });

  it('announces errors assertively and informational outcomes politely', () => {
    render(
      <>
        <Alert title="Unable to save">Correct the highlighted fields.</Alert>
        <Alert tone="success">Demo changes saved.</Alert>
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Correct the highlighted fields.',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Demo changes saved.');
  });

  it('presents loading with a text announcement and busy state', () => {
    render(<LoadingState label="Preparing demo records..." />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Preparing demo records...',
    );
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('explains unavailable data and offers caller-owned keyboard recovery', async () => {
    const user = userEvent.setup();
    const recover = vi.fn();
    render(
      <UnavailableState
        title="Data unavailable"
        message="Current data is missing. Actions using it are unavailable."
      >
        <Button onClick={recover}>Reload demo</Button>
      </UnavailableState>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Current data is missing.',
    );
    await user.tab();
    await user.keyboard('{Enter}');
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it('never presents an unsupported live operation as successful', () => {
    render(
      <UnsupportedOperation message="Real email is not sent by this prototype." />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Not supported in this prototype',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Real email is not sent by this prototype.',
    );
  });
});
