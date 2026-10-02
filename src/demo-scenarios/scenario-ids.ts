import type { ScenarioId, TemplateEntryId, WeeklyTemplateId } from '../domain';
import { FIXTURE_IDS } from '../demo-fixtures';

export const SCENARIO_IDS = Object.freeze({
  baseline: FIXTURE_IDS.scenarios.baseline,
  capacityWaitlist: 'scenario:capacity-waitlist',
  invitationMemberCap: 'scenario:invitation-member-cap',
  scheduleConflict: 'scenario:schedule-conflict',
  waiverAttendance: 'scenario:waiver-attendance',
  serviceUnavailable: 'scenario:service-unavailable',
  layoutUnavailable: 'scenario:layout-unavailable',
  layoutStale: 'scenario:layout-stale',
  dstSpring: 'scenario:dst-spring',
  dstFall: 'scenario:dst-fall',
} as const satisfies Record<string, ScenarioId>);

export const DEFAULT_SCENARIO_ID = SCENARIO_IDS.baseline;

export const SCENARIO_DATA_IDS = Object.freeze({
  gapTemplate: 'template:scenario-zero-gap' satisfies WeeklyTemplateId,
  gapEntry: 'templateEntry:scenario-zero-gap-monday' satisfies TemplateEntryId,
  dstTemplate: 'template:scenario-dst' satisfies WeeklyTemplateId,
  dstEntry: 'templateEntry:scenario-dst-sunday' satisfies TemplateEntryId,
});
