import {
  advanceAttendanceClock,
  countActiveMembers,
  updateStation,
} from '../domain';
import type {
  ClockPreset,
  DemoActor,
  DemoScenario,
  DemoState,
  DomainResult,
  ScenarioCategory,
  ScenarioId,
  UtcInstant,
} from '../domain';
import {
  createDemoClockPresets,
  createInitialDemoState,
  DEMO_INITIAL_NOW,
  DEMO_TIMEZONE,
  FIXTURE_IDS as ids,
} from '../demo-fixtures';
import { SCENARIO_DATA_IDS, SCENARIO_IDS } from './scenario-ids';

function fixtureValue<T>(result: DomainResult<T>): T {
  if (!result.success)
    throw new Error(
      `Invalid fictional scenario fixture: ${result.error.message}`,
    );
  return result.value;
}

function initialPresetId(scenarioId: ScenarioId): ClockPreset['presetId'] {
  return scenarioId === SCENARIO_IDS.baseline
    ? ids.clockPresets.baseline
    : `clockPreset:${scenarioId.slice('scenario:'.length)}-initial`;
}

function scenario(
  scenarioId: ScenarioId,
  name: string,
  category: ScenarioCategory,
  description: string,
  state: DemoState,
  defaultActor: DemoActor = { kind: 'staff', staffId: ids.staff.admin },
  clockInstant: UtcInstant = DEMO_INITIAL_NOW,
): DemoScenario {
  // Later snapshots must include class-end/no-show transitions, not just a new clock.
  const changes = fixtureValue(advanceAttendanceClock(state, clockInstant));
  return {
    scenarioId,
    name,
    category,
    description: `Fictional, non-operational demonstration. America/Los_Angeles and policy values are illustrative. ${description}`,
    illustrative: true,
    defaultActor: { ...defaultActor },
    clockInstant,
    timezone: DEMO_TIMEZONE,
    snapshot: {
      ...state,
      ...changes,
      revision: 0,
      scenarioId,
      activeActor: { ...defaultActor },
      clock: { now: clockInstant, presetId: initialPresetId(scenarioId) },
    },
  };
}

function memberCapState(): DemoState {
  const state = createInitialDemoState();
  return {
    ...state,
    settings: { ...state.settings, memberCap: countActiveMembers(state) },
  };
}

function scheduleConflictState(): DemoState {
  const state = createInitialDemoState();
  return {
    ...state,
    weeklyTemplates: [
      ...state.weeklyTemplates.map((template) =>
        template.templateId === ids.templates.weekA
          ? {
              ...template,
              name: 'Illustrative conflicting Week A',
              entries: template.entries.map((entry) =>
                entry.entryId === ids.templateEntries.monday
                  ? { ...entry, localTime: '09:15' as const }
                  : entry,
              ),
            }
          : template,
      ),
      {
        templateId: SCENARIO_DATA_IDS.gapTemplate,
        name: 'Illustrative zero-gap boundary',
        entries: [
          {
            entryId: SCENARIO_DATA_IDS.gapEntry,
            weekday: 1,
            localTime: '09:45',
            classTypeId: ids.classTypes.sprint,
          },
        ],
      },
    ],
  };
}

function zeroCapacityState(): DemoState {
  let state = createInitialDemoState();
  for (const station of state.stations) {
    state = fixtureValue(
      updateStation(state, station.stationId, { inService: false }),
    );
  }
  return {
    ...state,
    simulation: { ...state.simulation, delivery: 'failure' },
  };
}

function layoutState(availability: 'stale' | 'unavailable'): DemoState {
  const state = createInitialDemoState();
  return { ...state, layout: { ...state.layout, availability } };
}

function dstState(): DemoState {
  const state = createInitialDemoState();
  return {
    ...state,
    weeklyTemplates: [
      ...state.weeklyTemplates,
      {
        templateId: SCENARIO_DATA_IDS.dstTemplate,
        name: 'Illustrative Sunday wall-clock recurrence',
        entries: [
          {
            entryId: SCENARIO_DATA_IDS.dstEntry,
            weekday: 7,
            localTime: '09:00',
            classTypeId: ids.classTypes.sprint,
          },
        ],
      },
    ],
  };
}

export function getScenarios(): DemoScenario[] {
  return [
    scenario(
      SCENARIO_IDS.baseline,
      'Baseline',
      'baseline',
      'Admin overview, mixed station states, invitation history, and attendance boundaries.',
      createInitialDemoState(),
    ),
    scenario(
      SCENARIO_IDS.capacityWaitlist,
      'Capacity and waitlist',
      'capacityWaitlist',
      'Juniper can rejoin the full noon class at the queue tail. Cancelling Maple frees North: skip inactive Moss and outdated-waiver Aspen, then promote Willow before the cutoff.',
      createInitialDemoState(),
      { kind: 'member', memberId: ids.members.juniper },
    ),
    scenario(
      SCENARIO_IDS.invitationMemberCap,
      'Invitation at member cap',
      'invitationMemberCap',
      'Accept the outstanding invitation with a current waiver into pending membership at the active-member cap. Baseline accepts into active; expired, revoked, and superseded links remain available for rejection demonstrations.',
      memberCapState(),
      { kind: 'invitation', invitationId: ids.invitations.outstanding },
    ),
    scenario(
      SCENARIO_IDS.scheduleConflict,
      'Schedule conflict and zero gap',
      'scheduleConflict',
      'Apply conflicting Week A to October 5: reject the entire proposal without changing existing classes. The zero-gap template fits 09:45–10:15 with warnings, not overlap.',
      scheduleConflictState(),
    ),
    scenario(
      SCENARIO_IDS.waiverAttendance,
      'Waiver and attendance',
      'waiverAttendance',
      'Aspen retains the 10:15 booking but must sign the current waiver before check-in or a new booking. Morning no-shows are already resolved; historical corrections remain intact.',
      createInitialDemoState(),
      { kind: 'member', memberId: ids.members.aspen },
      '2026-10-05T17:15:00Z',
    ),
    scenario(
      SCENARIO_IDS.serviceUnavailable,
      'Stations out of service',
      'unavailableLayout',
      'All stations are out of service: zero capacity blocks publication and new bookings, while existing reservations remain flagged for review. Future email outcomes are simulated failures; no email is sent.',
      zeroCapacityState(),
    ),
    scenario(
      SCENARIO_IDS.layoutUnavailable,
      'Unavailable layout',
      'unavailableLayout',
      'Layout data is explicitly unavailable; map-based reseating is disabled without erasing station, booking, or attendance records.',
      layoutState('unavailable'),
      { kind: 'staff', staffId: ids.staff.frontDesk },
    ),
    scenario(
      SCENARIO_IDS.layoutStale,
      'Stale layout',
      'unavailableLayout',
      'Layout data is explicitly stale; map-based reseating is disabled until a fresh scenario is loaded. Reservations and identities are retained.',
      layoutState('stale'),
      { kind: 'staff', staffId: ids.staff.frontDesk },
    ),
    scenario(
      SCENARIO_IDS.dstSpring,
      'Spring daylight-saving boundary',
      'scheduleConflict',
      'Sunday 09:00 recurrence keeps wall-clock time across March 14, 2027; UTC shifts from 17:00 to 16:00. Apply the Sunday template to March 1 and March 8. Presets bracket the skipped hour.',
      dstState(),
      { kind: 'staff', staffId: ids.staff.admin },
      '2027-03-13T20:00:00Z',
    ),
    scenario(
      SCENARIO_IDS.dstFall,
      'Fall daylight-saving boundary',
      'scheduleConflict',
      'Sunday 09:00 recurrence keeps wall-clock time across November 1, 2026; UTC shifts from 16:00 to 17:00. Apply the Sunday template to October 19 and October 26. Presets bracket the repeated hour.',
      dstState(),
      { kind: 'staff', staffId: ids.staff.admin },
      '2026-10-31T19:00:00Z',
    ),
  ];
}

export function loadScenario(scenarioId: string): DomainResult<DemoScenario> {
  const selected = getScenarios().find(
    (item) => item.scenarioId === scenarioId,
  );
  return selected
    ? { success: true, value: selected }
    : {
        success: false,
        error: {
          category: 'DemoUnavailableState',
          message: 'The requested demo scenario is unavailable.',
          resource: 'scenario',
          resourceId: scenarioId,
          stale: false,
        },
      };
}

export function getScenarioClockPresets(
  scenarioId: string,
): DomainResult<ClockPreset[]> {
  const loaded = loadScenario(scenarioId);
  if (!loaded.success) return loaded;
  const selected = loaded.value;
  const initial: ClockPreset = {
    presetId: initialPresetId(selected.scenarioId),
    name: `${selected.name}: initial illustrative clock`,
    instant: selected.clockInstant,
  };
  if (
    scenarioId === SCENARIO_IDS.dstSpring ||
    scenarioId === SCENARIO_IDS.dstFall
  ) {
    const spring = scenarioId === SCENARIO_IDS.dstSpring;
    return {
      success: true,
      value: [
        initial,
        {
          presetId: spring
            ? 'clockPreset:dst-spring-before'
            : 'clockPreset:dst-fall-before',
          name: 'One second before illustrative daylight-saving transition',
          instant: spring ? '2027-03-14T09:59:59Z' : '2026-11-01T08:59:59Z',
        },
        {
          presetId: spring
            ? 'clockPreset:dst-spring-after'
            : 'clockPreset:dst-fall-after',
          name: 'Exact illustrative daylight-saving transition',
          instant: spring ? '2027-03-14T10:00:00Z' : '2026-11-01T09:00:00Z',
        },
      ],
    };
  }
  const boundaries = createDemoClockPresets();
  return {
    success: true,
    value:
      scenarioId === SCENARIO_IDS.baseline
        ? boundaries
        : [initial, ...boundaries],
  };
}
