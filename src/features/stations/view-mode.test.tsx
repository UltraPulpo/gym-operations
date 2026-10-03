import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithDemoState } from '../../test-support';
import { StationLayout, StationsScreen } from './StationsScreen';
import { FIXTURE_IDS as ids } from '../../demo-fixtures';

describe('station view mode', () => {
  it('inspects stations without changing positions until an Admin enters editing', async () => {
    const view = renderWithDemoState(<StationsScreen />);
    const before = view.store.getSnapshot().state.stations;
    expect(
      screen.queryByRole('region', { name: 'Admin station management' }),
    ).not.toBeInTheDocument();
    await view.user.click(
      screen.getByRole('button', { name: /Row 1, column 1: Rower 01/ }),
    );
    expect(
      screen.getByRole('region', { name: 'Station details' }),
    ).toHaveTextContent('Maya Chen');
    expect(view.store.getSnapshot().state.stations).toEqual(before);
    await view.user.click(screen.getByRole('button', { name: 'Edit layout' }));
    expect(
      screen.getByRole('region', { name: 'Admin station management' }),
    ).toBeVisible();
    await view.user.click(
      screen.getByRole('button', { name: 'Finish editing' }),
    );
    expect(
      screen.queryByRole('region', { name: 'Admin station management' }),
    ).not.toBeInTheDocument();
  });

  it('keeps embedded maps read-only even for an Admin', async () => {
    const view = renderWithDemoState(
      <StationLayout classId={ids.classes.checkIn} />,
    );
    const before = view.store.getSnapshot();
    expect(
      screen.queryByRole('button', { name: 'Edit layout' }),
    ).not.toBeInTheDocument();
    await view.user.click(
      screen.getByRole('button', { name: /^Row 1, column 1:/ }),
    );
    expect(view.store.getSnapshot()).toBe(before);
  });

  it('projects member details without names or edit controls', async () => {
    const view = renderWithDemoState(<StationsScreen />, {
      actor: { kind: 'member', memberId: ids.members.maple },
    });
    await view.user.click(
      screen.getByRole('button', { name: /^Row 1, column 1:/ }),
    );
    const details = screen.getByRole('region', { name: 'Station details' });
    expect(details).toHaveTextContent('Position: row 0, column 0');
    for (const member of view.store.getSnapshot().state.members) {
      expect(details).not.toHaveTextContent(member.displayName);
      expect(details).not.toHaveTextContent(member.verifiedEmail);
    }
    expect(
      screen.queryByRole('button', { name: 'Edit layout' }),
    ).not.toBeInTheDocument();
  });

  it('clears editing, picks and drafts on same-scenario reset without undoing ordinary submitted changes', async () => {
    const view = renderWithDemoState(<StationsScreen />);
    await view.user.click(screen.getByRole('button', { name: 'Edit layout' }));
    await view.user.clear(
      screen.getByLabelText('Station label', { exact: true }),
    );
    await view.user.type(
      screen.getByLabelText('Station label', { exact: true }),
      'Draft label',
    );
    await view.user.click(
      screen.getByRole('button', { name: /^Row 1, column 1:/ }),
    );
    expect(
      screen.getByRole('button', { name: 'Cancel placement' }),
    ).toBeVisible();
    act(() => {
      expect(view.store.resetDemo({ confirmed: true }).success).toBe(true);
    });
    expect(screen.getByRole('button', { name: 'Edit layout' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Cancel placement' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Station details' }),
    ).toHaveTextContent('Select a station');
    await view.user.click(screen.getByRole('button', { name: 'Edit layout' }));
    expect(screen.getByLabelText('Station label', { exact: true })).toHaveValue(
      'Rower 01',
    );
    await view.user.clear(
      screen.getByLabelText('Station label', { exact: true }),
    );
    await view.user.type(
      screen.getByLabelText('Station label', { exact: true }),
      'Saved label',
    );
    await view.user.click(screen.getByRole('button', { name: 'Save station' }));
    await view.user.click(
      screen.getByRole('button', { name: 'Finish editing' }),
    );
    expect(view.store.getSnapshot().state.stations[0].label).toBe(
      'Saved label',
    );
  });

  it('clears a pending pick on overlay changes instead of treating selection as a placement', async () => {
    const view = renderWithDemoState(<StationsScreen />);
    await view.user.click(screen.getByRole('button', { name: 'Edit layout' }));
    await view.user.click(
      screen.getByRole('button', { name: /^Row 1, column 1:/ }),
    );
    const before = view.store.getSnapshot();
    await view.user.selectOptions(
      screen.getByLabelText('Class overlay'),
      ids.classes.full,
    );
    expect(
      screen.queryByRole('button', { name: 'Cancel placement' }),
    ).not.toBeInTheDocument();
    expect(view.store.getSnapshot()).toBe(before);
  });
});
