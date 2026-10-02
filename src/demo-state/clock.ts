import { DateTime } from 'luxon';
import type {
  ClockPreset,
  ClockPresetId,
  DemoAction,
  DemoState,
  DomainResult,
  UtcInstant,
} from '../domain';
import { getScenarioClockPresets } from '../demo-scenarios';

export const DEMO_CLOCK_STEPS = {
  minute: { label: '+1 minute', minutes: 1 },
  quarterHour: { label: '+15 minutes', minutes: 15 },
  hour: { label: '+1 hour', minutes: 60 },
  day: { label: '+1 day', minutes: 24 * 60 },
} as const;

function ensureWholePositiveMinutes(minutes: number): void {
  if (!Number.isSafeInteger(minutes) || minutes <= 0) {
    throw new RangeError('Clock steps require positive whole minutes.');
  }
}

function validUtcInstant(value: UtcInstant): boolean {
  const parsed = DateTime.fromISO(value, { setZone: true });
  return (
    parsed.isValid &&
    value.endsWith('Z') &&
    parsed.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'") === value
  );
}

export function selectClockPresets(
  state: DemoState,
): DomainResult<readonly ClockPreset[]> {
  const result = getScenarioClockPresets(state.scenarioId);
  return result.success
    ? { success: true, value: result.value.map((preset) => ({ ...preset })) }
    : result;
}

export function stepClockTarget(now: UtcInstant, minutes: number): UtcInstant {
  ensureWholePositiveMinutes(minutes);
  if (!validUtcInstant(now)) {
    throw new RangeError('Clock steps require a valid UTC instant.');
  }
  return DateTime.fromISO(now, { setZone: true })
    .plus({ minutes })
    .toUTC()
    .toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'") as UtcInstant;
}

export function advanceClockBy(state: DemoState, minutes: number): DemoAction {
  return {
    type: 'advanceClock',
    payload: { to: stepClockTarget(state.clock.now, minutes) },
  };
}

export function setClockPresetAction(presetId: ClockPresetId): DemoAction {
  return {
    type: 'setClockPreset',
    payload: { presetId },
  };
}
