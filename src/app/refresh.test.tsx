import { act, screen } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithDemoState } from '../test-support';
import { DemoShell } from './DemoShell';
import { FIXTURE_IDS as ids } from '../demo-fixtures';

afterEach(() => vi.unstubAllGlobals());

describe('compact workspace', () => {
  it('starts with controls collapsed and keeps the selected persona and clock visible', async () => {
    const view = renderWithDemoState(
      <HashRouter>
        <DemoShell />
      </HashRouter>,
    );
    expect(screen.getByLabelText('Workspace summary')).toHaveTextContent(
      'Chris Sullivan',
    );
    expect(screen.getByLabelText('Workspace summary')).toHaveTextContent(
      '08:45',
    );
    expect(
      screen
        .getByText('Demo controls', { selector: 'summary' })
        .closest('details'),
    ).not.toHaveAttribute('open');
    await view.user.click(
      screen.getByText('Demo controls', { selector: 'summary' }),
    );
    expect(screen.getByLabelText('Persona')).toBeVisible();
  });

  it('synchronizes the visible summary with actor, clock and full replacement', () => {
    const view = renderWithDemoState(
      <HashRouter>
        <DemoShell />
      </HashRouter>,
    );
    act(() => {
      expect(view.store.advanceClockBy(1).success).toBe(true);
      expect(
        view.store.submit({
          type: 'selectActor',
          payload: { actor: { kind: 'member', memberId: ids.members.maple } },
        }).success,
      ).toBe(true);
    });
    expect(screen.getByLabelText('Workspace summary')).toHaveTextContent(
      'Maya Chen',
    );
    expect(screen.getByLabelText('Workspace summary')).toHaveTextContent(
      '08:46',
    );
    act(() => {
      expect(view.store.resetDemo({ confirmed: true }).success).toBe(true);
    });
    expect(screen.getByLabelText('Workspace summary')).toHaveTextContent(
      'Chris Sullivan',
    );
    expect(screen.getByLabelText('Workspace summary')).toHaveTextContent(
      '08:45',
    );
  });

  it('collapses mobile navigation and returns focus to the destination heading', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const view = renderWithDemoState(
      <HashRouter>
        <DemoShell />
      </HashRouter>,
    );
    const toggle = screen.getByRole('button', { name: 'Navigation' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('navigation', { name: 'Demo navigation' }),
    ).not.toBeInTheDocument();
    await view.user.click(toggle);
    await view.user.click(screen.getByRole('link', { name: 'Stations' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('heading', { name: 'Stations and layout' }),
    ).toHaveFocus();
  });
});
