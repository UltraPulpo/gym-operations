import { describe, expect, it } from 'vitest';
import type { DemoAction } from '../domain';
import { FIXTURE_IDS as ids, createInitialDemoState } from '../demo-fixtures';
import { SCENARIO_IDS } from '../demo-scenarios';
import { expectSuccess } from './test-helpers';
import {
  DEMO_CLOCK_STEPS,
  advanceClockBy,
  selectClockPresets,
  setClockPresetAction,
  stepClockTarget,
} from './clock';

describe('demo-state clock helpers', () => {
  it('returns a typed unavailable scenario error instead of an empty preset list', () => {
    expect(
      selectClockPresets({
        ...createInitialDemoState(),
        scenarioId: 'scenario:missing',
      }),
    ).toMatchObject({
      success: false,
      error: {
        category: 'DemoUnavailableState',
        resource: 'scenario',
        resourceId: 'scenario:missing',
      },
    });
  });
  it('exposes the named frozen step options', () => {
    expect(DEMO_CLOCK_STEPS).toEqual({
      minute: { label: '+1 minute', minutes: 1 },
      quarterHour: { label: '+15 minutes', minutes: 15 },
      hour: { label: '+1 hour', minutes: 60 },
      day: { label: '+1 day', minutes: 24 * 60 },
    });
  });

  it('selects fresh scenario presets for the current scenario', () => {
    const state = createInitialDemoState();
    const first = expectSuccess(selectClockPresets(state));
    const second = expectSuccess(selectClockPresets(state));
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first[0]?.presetId).toBe(ids.clockPresets.baseline);
  });

  it('includes the scenario-specific initial preset for non-baseline scenarios', () => {
    const state = {
      ...createInitialDemoState(),
      scenarioId: SCENARIO_IDS.waiverAttendance,
    };
    const presets = expectSuccess(selectClockPresets(state));
    expect(presets[0]?.presetId).toBe('clockPreset:waiver-attendance-initial');
  });

  it('computes a later UTC instant by whole positive minutes only', () => {
    expect(stepClockTarget('2026-10-05T15:45:00Z', 15)).toBe(
      '2026-10-05T16:00:00Z',
    );
    expect(() => stepClockTarget('2026-10-05T15:45:00Z', 0)).toThrow(
      /positive whole minutes/i,
    );
    expect(() => stepClockTarget('2026-10-05T15:45:00Z', -1)).toThrow(
      /positive whole minutes/i,
    );
    expect(() => stepClockTarget('2026-10-05T15:45:00Z', 1.5)).toThrow(
      /positive whole minutes/i,
    );
  });

  it('builds advance-clock and set-preset actions from the current state', () => {
    const state = createInitialDemoState();
    const advanced: DemoAction = advanceClockBy(state, 15);
    const preset: DemoAction = setClockPresetAction(ids.clockPresets.classEnd);

    expect(advanced).toEqual({
      type: 'advanceClock',
      payload: { to: '2026-10-05T16:00:00Z' },
    });
    expect(preset).toEqual({
      type: 'setClockPreset',
      payload: { presetId: ids.clockPresets.classEnd },
    });
  });
});
