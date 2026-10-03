import type { ComponentType } from 'react';
import type { DemoStateApi } from '../demo-state';
import type { DemoCapability } from '../domain';
import { AttendanceScreen } from '../features/attendance';
import { BookingsScreen } from '../features/bookings';
import { ClassesScreen } from '../features/classes';
import { CoachesScreen } from '../features/coaches';
import { InvitationAcceptanceScreen, MembersScreen } from '../features/members';
import { NotificationsScreen } from '../features/notifications';
import { ScheduleScreen } from '../features/schedule';
import { SettingsScreen } from '../features/settings';
import { StaffAccessScreen } from '../features/staff-access';
import { StationsScreen } from '../features/stations';
import { WaiversScreen } from '../features/waivers';
import { APP_ROUTES } from './config';

export interface DemoRoute {
  readonly path: string;
  readonly label: string;
  readonly Screen: ComponentType;
  readonly available: (demo: DemoStateApi) => boolean;
  readonly limitation?: (demo: DemoStateApi) => string | undefined;
}

function has(demo: DemoStateApi, ...capabilities: DemoCapability[]) {
  const selected = demo.capabilities;
  return (
    selected.success &&
    capabilities.some((capability) =>
      selected.value.capabilities.includes(capability),
    )
  );
}

function readOnly(capability: DemoCapability, screen: string) {
  return (demo: DemoStateApi) =>
    has(demo, capability)
      ? undefined
      : `${screen} is read-only for this persona. Unavailable management actions are not shown.`;
}

export const FEATURE_ROUTES: readonly DemoRoute[] = [
  {
    path: APP_ROUTES.staff,
    label: 'Staff access',
    Screen: StaffAccessScreen,
    available: (demo) => has(demo, 'manageStaff'),
  },
  {
    path: APP_ROUTES.members,
    label: 'Members',
    Screen: MembersScreen,
    available: (demo) =>
      has(demo, 'manageMembers') || demo.activeActor.kind === 'member',
  },
  {
    path: APP_ROUTES.invitations,
    label: 'Invitations',
    Screen: InvitationAcceptanceScreen,
    available: (demo) =>
      has(demo, 'manageInvitations') || demo.activeActor.kind === 'invitation',
  },
  {
    path: APP_ROUTES.waivers,
    label: 'Waivers',
    Screen: WaiversScreen,
    available: (demo) =>
      has(demo, 'manageWaivers', 'viewRoster') ||
      demo.activeActor.kind === 'member',
    limitation: readOnly('manageWaivers', 'Waiver publication'),
  },
  {
    path: APP_ROUTES.stations,
    label: 'Stations',
    Screen: StationsScreen,
    available: (demo) => has(demo, 'viewSchedule'),
    limitation: readOnly('manageStations', 'Station management'),
  },
  {
    path: APP_ROUTES.classes,
    label: 'Classes',
    Screen: ClassesScreen,
    available: (demo) => has(demo, 'viewSchedule'),
    limitation: readOnly('manageClassTypes', 'Class type management'),
  },
  {
    path: APP_ROUTES.schedule,
    label: 'Schedule',
    Screen: ScheduleScreen,
    available: (demo) => has(demo, 'viewSchedule'),
    limitation: readOnly('manageSchedule', 'Schedule'),
  },
  {
    path: APP_ROUTES.bookings,
    label: 'Bookings',
    Screen: BookingsScreen,
    available: (demo) => has(demo, 'viewSchedule'),
  },
  {
    path: APP_ROUTES.attendance,
    label: 'Attendance',
    Screen: AttendanceScreen,
    available: (demo) =>
      has(demo, 'manageAttendance') || demo.activeActor.kind === 'member',
  },
  {
    path: APP_ROUTES.notifications,
    label: 'Notifications',
    Screen: NotificationsScreen,
    available: (demo) =>
      has(demo, 'viewRoster') ||
      (demo.activeActor.kind === 'member' && has(demo, 'viewSchedule')),
    limitation: readOnly('manageNotifications', 'Notification resend'),
  },
  {
    path: APP_ROUTES.coaches,
    label: 'Coaches',
    Screen: CoachesScreen,
    available: (demo) => has(demo, 'viewSchedule'),
    limitation: (demo) =>
      has(demo, 'manageCoachProfiles')
        ? undefined
        : has(demo, 'editOwnCoachProfile')
          ? 'Only your own fictional biography and generated avatar can be edited. Names, certifications, and contacts are Admin-managed.'
          : 'Coach profiles are read-only for this persona.',
  },
  {
    path: APP_ROUTES.settings,
    label: 'Settings',
    Screen: SettingsScreen,
    available: (demo) => has(demo, 'manageSettings'),
  },
];
