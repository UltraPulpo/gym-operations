import { createNotificationRecord } from '../domain/notifications';
import type {
  AttendanceRecord,
  Booking,
  ClassType,
  ClockPreset,
  DemoState,
  IanaTimeZone,
  Invitation,
  Member,
  NotificationRecord,
  ScheduledClass,
  StaffAccount,
  UtcInstant,
  WaiverSignature,
} from '../domain';
import { FIXTURE_IDS as ids } from './fixture-ids';

export const DEMO_TIMEZONE = 'America/Los_Angeles' satisfies IanaTimeZone;
export const DEMO_INITIAL_NOW = '2026-10-05T15:45:00Z' satisfies UtcInstant;
export const DEMO_NOTICE =
  'Fictional, non-operational demonstration only; do not use to operate classes. ' +
  'America/Los_Angeles and all policy values are illustrative, not approved gym policy. ' +
  'Identity and email outcomes are simulated; nothing is sent or persisted. Refresh resets demo data.';

export function createDemoClockPresets(): ClockPreset[] {
  return [
    {
      presetId: ids.clockPresets.baseline,
      name: 'Baseline: Monday 08:45',
      instant: DEMO_INITIAL_NOW,
    },
    {
      presetId: ids.clockPresets.checkInOpens,
      name: 'Morning check-in opens: 08:30',
      instant: '2026-10-05T15:30:00Z',
    },
    {
      presetId: ids.clockPresets.classStart,
      name: 'Morning class starts: 09:00',
      instant: '2026-10-05T16:00:00Z',
    },
    {
      presetId: ids.clockPresets.checkInCloses,
      name: 'Morning check-in closes: 09:05',
      instant: '2026-10-05T16:05:00Z',
    },
    {
      presetId: ids.clockPresets.classEnd,
      name: 'Morning class ends: 09:45',
      instant: '2026-10-05T16:45:00Z',
    },
    {
      presetId: ids.clockPresets.fullLateCancelCutoff,
      name: 'Full class late-cancel cutoff: 10:00',
      instant: '2026-10-05T17:00:00Z',
    },
    {
      presetId: ids.clockPresets.fullWaitlistCutoff,
      name: 'Full class waitlist cutoff: 11:00',
      instant: '2026-10-05T18:00:00Z',
    },
  ];
}

/**
 * Baseline IDs are shared with scenario builders, never mutable records.
 * Every invocation constructs the entire graph, including class-type snapshots.
 */
export function createInitialDemoState(): DemoState {
  const memberNames = [
    'maple',
    'cedar',
    'birch',
    'willow',
    'aspen',
    'juniper',
    'fern',
    'moss',
  ] as const;
  const profiles = {
    maple: ['Maya Chen', 'maya.chen'],
    cedar: ['Jordan Brooks', 'jordan.brooks'],
    birch: ['Sam Patel', 'sam.patel'],
    willow: ['Taylor Reed', 'taylor.reed'],
    aspen: ['Casey Park', 'casey.park'],
    juniper: ['Riley Morgan', 'riley.morgan'],
    fern: ['Jamie Ellis', 'jamie.ellis'],
    moss: ['Avery Bennett', 'avery.bennett'],
  } as const;
  const members: Member[] = memberNames.map((name) => {
    const createdAt: UtcInstant =
      name === 'fern' ? '2026-10-04T18:00:00Z' : '2026-10-01T15:00:00Z';
    return {
      memberId: ids.members[name],
      displayName: profiles[name][0],
      verifiedEmail: `${profiles[name][1]}@example.invalid`,
      identitySubject: `identity:demo-member-${name}`,
      status:
        name === 'fern' ? 'pending' : name === 'moss' ? 'inactive' : 'active',
      invitationId: ids.invitations[name],
      adultAttestationAt: createdAt,
      adultEligibility: 'attested',
      createdAt,
    };
  });
  const invitations: Invitation[] = [
    ...members.map((member): Invitation => ({
      invitationId: member.invitationId,
      email: member.verifiedEmail,
      issuedAt:
        member.memberId === ids.members.fern
          ? '2026-10-04T17:30:00Z'
          : '2026-09-30T15:00:00Z',
      expiresAt:
        member.memberId === ids.members.fern
          ? '2026-10-11T17:30:00Z'
          : '2026-10-07T15:00:00Z',
      issuedBy: ids.staff.frontDesk,
      status: 'accepted',
      acceptedAt: member.createdAt,
      memberId: member.memberId,
    })),
    {
      invitationId: ids.invitations.outstanding,
      email: 'invitee@example.invalid',
      issuedAt: '2026-10-04T19:00:00Z',
      expiresAt: '2026-10-11T19:00:00Z',
      issuedBy: ids.staff.frontDesk,
      status: 'outstanding',
    },
    {
      invitationId: ids.invitations.expired,
      email: 'expired@example.invalid',
      issuedAt: '2026-09-20T19:00:00Z',
      expiresAt: '2026-09-27T19:00:00Z',
      issuedBy: ids.staff.admin,
      status: 'expired',
      expiredAt: '2026-09-27T19:00:00Z',
    },
    {
      invitationId: ids.invitations.revoked,
      email: 'revoked@example.invalid',
      issuedAt: '2026-10-01T19:00:00Z',
      expiresAt: '2026-10-08T19:00:00Z',
      issuedBy: ids.staff.frontDesk,
      status: 'revoked',
      revokedAt: '2026-10-02T19:00:00Z',
      revokedBy: ids.staff.admin,
    },
    {
      invitationId: ids.invitations.superseded,
      email: 'replacement@example.invalid',
      issuedAt: '2026-10-01T19:00:00Z',
      expiresAt: '2026-10-08T19:00:00Z',
      issuedBy: ids.staff.frontDesk,
      status: 'superseded',
      supersededAt: '2026-10-04T20:00:00Z',
      replacementId: ids.invitations.replacement,
    },
    {
      invitationId: ids.invitations.replacement,
      email: 'replacement@example.invalid',
      issuedAt: '2026-10-04T20:00:00Z',
      expiresAt: '2026-10-11T20:00:00Z',
      issuedBy: ids.staff.frontDesk,
      status: 'outstanding',
    },
  ];
  const waiverSignatures: WaiverSignature[] = [];
  for (const member of members) {
    const name = member.memberId.slice('member:'.length);
    if (member.memberId !== ids.members.fern) {
      waiverSignatures.push({
        signatureId: `signature:${name}-old`,
        memberId: member.memberId,
        waiverVersionId: ids.waivers.old,
        typedName: member.displayName,
        signedAt: member.createdAt,
      });
    }
    if (member.memberId !== ids.members.aspen) {
      waiverSignatures.push({
        signatureId: `signature:${name}-current`,
        memberId: member.memberId,
        waiverVersionId: ids.waivers.current,
        typedName: member.displayName,
        signedAt: '2026-10-04T18:00:00Z',
      });
    }
  }

  const sprint: ClassType = {
    classTypeId: ids.classTypes.sprint,
    name: 'Power Intervals',
    durationMinutes: 30,
    description: 'Build power with focused intervals and recovery.',
    difficulty: 'Intermediate',
    alias: 'Sprint',
    whatToBring: 'Bring water and comfortable training clothes.',
  };
  const technique: ClassType = {
    classTypeId: ids.classTypes.technique,
    name: 'Rowing Foundations',
    durationMinutes: 45,
    description: 'Refine your stroke with guided technique practice.',
    difficulty: 'Beginner',
  };
  const endurance: ClassType = {
    classTypeId: ids.classTypes.endurance,
    name: 'Endurance Row',
    durationMinutes: 60,
    description: 'Develop aerobic endurance with steady-paced rowing.',
    difficulty: 'Advanced',
    whatToBring: 'Bring a water bottle.',
  };
  const classes: ScheduledClass[] = [
    {
      classId: ids.classes.history,
      schedule: { date: '2026-10-02', time: '08:00', timezone: DEMO_TIMEZONE },
      startsAt: '2026-10-02T15:00:00Z',
      endsAt: '2026-10-02T15:45:00Z',
      status: 'completed',
      coachId: ids.staff.coach,
      classTypeSnapshot: { ...technique },
      publishedAt: '2026-09-30T16:00:00Z',
      releasedAt: '2026-09-30T16:00:00Z',
      completedAt: '2026-10-02T15:45:00Z',
      lateCancelWaived: false,
      reviewFlags: [],
    },
    {
      classId: ids.classes.cancelled,
      schedule: { date: '2026-10-03', time: '12:00', timezone: DEMO_TIMEZONE },
      startsAt: '2026-10-03T19:00:00Z',
      endsAt: '2026-10-03T20:00:00Z',
      status: 'cancelled',
      coachId: ids.staff.multiRole,
      classTypeSnapshot: { ...endurance },
      publishedAt: '2026-09-30T16:00:00Z',
      releasedAt: '2026-09-30T16:00:00Z',
      cancelledAt: '2026-10-02T22:00:00Z',
      cancellationReason: 'Coach unavailable.',
      lateCancelWaived: false,
      reviewFlags: [],
    },
    {
      classId: ids.classes.checkIn,
      schedule: { date: '2026-10-05', time: '09:00', timezone: DEMO_TIMEZONE },
      startsAt: '2026-10-05T16:00:00Z',
      endsAt: '2026-10-05T16:45:00Z',
      status: 'published',
      coachId: ids.staff.coach,
      classTypeSnapshot: { ...technique },
      publishedAt: '2026-09-30T16:00:00Z',
      releasedAt: '2026-09-30T16:00:00Z',
      lateCancelWaived: false,
      reviewFlags: [],
    },
    {
      classId: ids.classes.free,
      schedule: { date: '2026-10-05', time: '10:15', timezone: DEMO_TIMEZONE },
      startsAt: '2026-10-05T17:15:00Z',
      endsAt: '2026-10-05T17:45:00Z',
      status: 'published',
      classTypeSnapshot: { ...sprint },
      publishedAt: '2026-09-30T16:00:00Z',
      releasedAt: '2026-09-30T16:00:00Z',
      lateCancelWaived: false,
      reviewFlags: [],
    },
    {
      classId: ids.classes.full,
      schedule: { date: '2026-10-05', time: '12:00', timezone: DEMO_TIMEZONE },
      startsAt: '2026-10-05T19:00:00Z',
      endsAt: '2026-10-05T20:00:00Z',
      status: 'published',
      coachId: ids.staff.multiRole,
      classTypeSnapshot: { ...endurance },
      publishedAt: '2026-09-30T16:00:00Z',
      releasedAt: '2026-09-30T16:00:00Z',
      lateCancelWaived: false,
      reviewFlags: [],
    },
    {
      classId: ids.classes.draft,
      schedule: { date: '2026-10-06', time: '09:00', timezone: DEMO_TIMEZONE },
      startsAt: '2026-10-06T16:00:00Z',
      endsAt: '2026-10-06T16:45:00Z',
      status: 'draft',
      classTypeSnapshot: { ...technique },
      lateCancelWaived: false,
      reviewFlags: [],
    },
    {
      classId: ids.classes.laterRelease,
      schedule: { date: '2026-10-12', time: '09:00', timezone: DEMO_TIMEZONE },
      startsAt: '2026-10-12T16:00:00Z',
      endsAt: '2026-10-12T16:45:00Z',
      status: 'published',
      coachId: ids.staff.coach,
      classTypeSnapshot: { ...technique },
      publishedAt: '2026-10-04T17:00:00Z',
      lateCancelWaived: false,
      reviewFlags: [],
    },
  ];
  const staffAccounts: StaffAccount[] = [
    {
      staffId: ids.staff.admin,
      identitySubject: 'identity:demo-admin',
      active: true,
      assignedRoles: ['admin'],
      assignedClassIds: [],
    },
    {
      staffId: ids.staff.frontDesk,
      identitySubject: 'identity:demo-front-desk',
      active: true,
      assignedRoles: ['frontDesk'],
      assignedClassIds: [],
    },
    {
      staffId: ids.staff.coach,
      identitySubject: 'identity:demo-coach',
      active: true,
      assignedRoles: ['coach'],
      assignedClassIds: classes
        .filter((item) => item.coachId === ids.staff.coach)
        .map((item) => item.classId),
      coachProfile: {
        displayName: 'Alex Rivera',
        avatarId: 'avatar:fictional-indigo',
        biography:
          'Technique-focused coaching for confident, efficient rowing.',
        certifications: ['Rowing instructor'],
        contact: { email: 'alex.rivera@example.invalid' },
      },
    },
    {
      staffId: ids.staff.multiRole,
      identitySubject: 'identity:demo-front-desk-coach',
      active: true,
      assignedRoles: ['frontDesk', 'coach'],
      assignedClassIds: classes
        .filter((item) => item.coachId === ids.staff.multiRole)
        .map((item) => item.classId),
      coachProfile: {
        displayName: 'Morgan Ellis',
        avatarId: 'avatar:fictional-coral',
        biography: 'Endurance coaching and a welcoming start to every class.',
        certifications: ['Endurance instructor'],
        contact: { email: 'morgan.ellis@example.invalid' },
      },
    },
    {
      staffId: ids.staff.inactive,
      identitySubject: 'identity:demo-inactive',
      active: false,
      assignedRoles: ['frontDesk'],
      assignedClassIds: [],
    },
  ];

  function booked(
    key: keyof typeof ids.bookings,
    memberId: Member['memberId'],
    classId: ScheduledClass['classId'],
    stationId: Booking['stationId'],
    bookedAt: UtcInstant = '2026-10-01T18:00:00Z',
  ): Extract<Booking, { status: 'booked' }> {
    return {
      bookingId: ids.bookings[key],
      memberId,
      classId,
      stationId,
      bookedAt,
      attendanceRecordId: ids.attendance[key],
      status: 'booked',
      reviewFlags: [],
    };
  }
  const bookings: Booking[] = [
    booked(
      'historyAttended',
      ids.members.maple,
      ids.classes.history,
      ids.stations.north,
    ),
    booked(
      'historyNoShow',
      ids.members.cedar,
      ids.classes.history,
      ids.stations.west,
    ),
    booked(
      'historyCorrected',
      ids.members.birch,
      ids.classes.history,
      ids.stations.east,
      '2026-10-02T14:50:00Z',
    ),
    {
      ...booked(
        'historyLateCancel',
        ids.members.willow,
        ids.classes.history,
        ids.stations.east,
      ),
      status: 'cancelled',
      cancelledAt: '2026-10-02T14:45:00Z',
      cancellationReason: 'member',
    },
    {
      ...booked(
        'historyRemoved',
        ids.members.juniper,
        ids.classes.history,
        ids.stations.north,
        '2026-10-01T16:00:00Z',
      ),
      status: 'staffRemoved',
      removedAt: '2026-10-01T17:00:00Z',
      removedBy: ids.staff.frontDesk,
      removalReason: 'Reservation removed at the member’s request.',
    },
    {
      ...booked(
        'cancelled',
        ids.members.maple,
        ids.classes.cancelled,
        ids.stations.north,
      ),
      status: 'cancelled',
      cancelledAt: '2026-10-02T22:00:00Z',
      cancellationReason: 'classCancelled',
    },
    {
      ...booked(
        'cancelledCedar',
        ids.members.cedar,
        ids.classes.cancelled,
        ids.stations.west,
      ),
      status: 'cancelled',
      cancelledAt: '2026-10-02T22:00:00Z',
      cancellationReason: 'classCancelled',
    },
    {
      ...booked(
        'cancelledBirch',
        ids.members.birch,
        ids.classes.cancelled,
        ids.stations.east,
      ),
      status: 'cancelled',
      cancelledAt: '2026-10-02T22:00:00Z',
      cancellationReason: 'classCancelled',
    },
    booked(
      'checkInMaple',
      ids.members.maple,
      ids.classes.checkIn,
      ids.stations.north,
    ),
    booked(
      'checkInCedar',
      ids.members.cedar,
      ids.classes.checkIn,
      ids.stations.west,
    ),
    {
      ...booked(
        'outage',
        ids.members.moss,
        ids.classes.checkIn,
        ids.stations.outage,
      ),
      reviewFlags: ['memberInactive', 'stationOutOfService'],
    },
    booked(
      'outdatedWaiver',
      ids.members.aspen,
      ids.classes.free,
      ids.stations.north,
    ),
    booked(
      'fullMaple',
      ids.members.maple,
      ids.classes.full,
      ids.stations.north,
    ),
    booked('fullCedar', ids.members.cedar, ids.classes.full, ids.stations.west),
    {
      ...booked(
        'fullPrevious',
        ids.members.juniper,
        ids.classes.full,
        ids.stations.east,
      ),
      status: 'cancelled',
      cancelledAt: '2026-10-02T18:00:00Z',
      cancellationReason: 'member',
    },
    {
      ...booked(
        'fullBirch',
        ids.members.birch,
        ids.classes.full,
        ids.stations.east,
        '2026-10-02T18:00:00Z',
      ),
      promotedFromEntryId: ids.waitlist.birchPromoted,
    },
  ];
  const attendance: AttendanceRecord[] = bookings.map(
    (booking): AttendanceRecord => {
      const base: AttendanceRecord = {
        attendanceId: booking.attendanceRecordId,
        bookingId: booking.bookingId,
        classId: booking.classId,
        memberId: booking.memberId,
        currentOutcome: 'booked',
        checkIn: { status: 'notCheckedIn' },
        source: { kind: 'booking', bookingId: booking.bookingId },
        corrections: [],
      };
      if (booking.status === 'cancelled') {
        return {
          ...base,
          currentOutcome:
            booking.bookingId === ids.bookings.historyLateCancel
              ? 'lateCancel'
              : 'cancelled',
          source:
            booking.cancellationReason === 'member'
              ? { kind: 'memberCancellation', recordedAt: booking.cancelledAt }
              : {
                  kind: 'staff',
                  staffId: ids.staff.admin,
                  recordedAt: booking.cancelledAt,
                },
        };
      }
      if (booking.status === 'staffRemoved') {
        return {
          ...base,
          currentOutcome: 'staffRemoved',
          source: {
            kind: 'staff',
            staffId: booking.removedBy,
            recordedAt: booking.removedAt,
          },
        };
      }
      if (
        booking.bookingId === ids.bookings.historyAttended ||
        booking.bookingId === ids.bookings.checkInMaple
      ) {
        const checkedInAt: UtcInstant =
          booking.classId === ids.classes.history
            ? '2026-10-02T14:45:00Z'
            : '2026-10-05T15:35:00Z';
        return {
          ...base,
          currentOutcome: 'attended',
          checkIn: {
            status: 'checkedIn',
            checkedInAt,
            checkedInBy: { kind: 'member', memberId: booking.memberId },
          },
        };
      }
      if (booking.bookingId === ids.bookings.historyNoShow) {
        return {
          ...base,
          currentOutcome: 'noShow',
          source: { kind: 'classEnd', recordedAt: '2026-10-02T15:45:00Z' },
        };
      }
      if (booking.bookingId === ids.bookings.historyCorrected) {
        return {
          ...base,
          currentOutcome: 'attended',
          source: {
            kind: 'manualOutage',
            staffId: ids.staff.coach,
            recordedAt: '2026-10-02T16:00:00Z',
          },
          corrections: [
            {
              correctionId: ids.corrections.historyReconciled,
              staffId: ids.staff.coach,
              previousOutcome: 'noShow',
              newOutcome: 'attended',
              recordedAt: '2026-10-02T16:00:00Z',
              reason: 'Reconciled with the printed attendance roster.',
            },
          ],
        };
      }
      return base;
    },
  );

  function notification(
    input: Parameters<typeof createNotificationRecord>[0],
    now: UtcInstant,
  ): NotificationRecord {
    const result = createNotificationRecord(input, now);
    if (!result.success)
      throw new Error(
        `Invalid demo notification fixture: ${result.error.message}`,
      );
    return result.value;
  }
  const notifications: NotificationRecord[] = [
    notification(
      {
        notificationId: ids.notifications.invitationFailed,
        event: {
          type: 'invitation',
          invitationId: ids.invitations.outstanding,
        },
        recipient: { kind: 'invitee', email: 'invitee@example.invalid' },
        scenario: 'failure',
      },
      '2026-10-04T19:00:00Z',
    ),
    notification(
      {
        notificationId: ids.notifications.bookingConfirmed,
        event: {
          type: 'bookingConfirmed',
          bookingId: ids.bookings.fullMaple,
          classId: ids.classes.full,
        },
        recipient: {
          kind: 'member',
          memberId: ids.members.maple,
          email: 'maya.chen@example.invalid',
        },
        scenario: 'success',
      },
      '2026-10-01T18:00:00Z',
    ),
    notification(
      {
        notificationId: ids.notifications.waitlistPromoted,
        event: {
          type: 'waitlistPromoted',
          bookingId: ids.bookings.fullBirch,
          entryId: ids.waitlist.birchPromoted,
          classId: ids.classes.full,
        },
        recipient: {
          kind: 'member',
          memberId: ids.members.birch,
          email: 'sam.patel@example.invalid',
        },
        scenario: 'success',
      },
      '2026-10-02T18:00:00Z',
    ),
    notification(
      {
        notificationId: ids.notifications.classCancelled,
        event: { type: 'classCancelled', classId: ids.classes.cancelled },
        recipient: {
          kind: 'member',
          memberId: ids.members.maple,
          email: 'maya.chen@example.invalid',
        },
        scenario: 'success',
      },
      '2026-10-02T22:00:00Z',
    ),
    notification(
      {
        notificationId: ids.notifications.classChanged,
        event: {
          type: 'classChanged',
          classId: ids.classes.free,
          changes: ['coach'],
        },
        recipient: {
          kind: 'member',
          memberId: ids.members.aspen,
          email: 'casey.park@example.invalid',
        },
        scenario: 'success',
      },
      '2026-10-04T20:00:00Z',
    ),
  ];

  return {
    revision: 0,
    staffAccounts,
    members,
    invitations,
    waiverSignatures,
    waivers: [
      {
        waiverVersionId: ids.waivers.old,
        version: 1,
        status: 'published',
        text: 'Demonstration only: fictional old waiver marker, not legal text.',
        createdAt: '2026-09-28T15:00:00Z',
        publishedAt: '2026-09-28T16:00:00Z',
      },
      {
        waiverVersionId: ids.waivers.current,
        version: 2,
        status: 'published',
        text: 'Demonstration only: fictional current waiver marker, not legal text.',
        createdAt: '2026-10-04T16:00:00Z',
        publishedAt: '2026-10-04T17:00:00Z',
      },
      {
        waiverVersionId: ids.waivers.draft,
        version: 3,
        status: 'draft',
        text: 'Demonstration only: fictional draft waiver marker, not legal text.',
        createdAt: '2026-10-05T15:00:00Z',
      },
    ],
    currentWaiverVersionId: ids.waivers.current,
    stations: [
      {
        stationId: ids.stations.north,
        label: 'Rower 01',
        pm5Serial: 'DEMO-PM5-NORTH',
        inService: true,
        row: 0,
        column: 0,
      },
      {
        stationId: ids.stations.west,
        label: 'Rower 02',
        pm5Serial: 'DEMO-PM5-WEST',
        inService: true,
        row: 1,
        column: 0,
      },
      {
        stationId: ids.stations.east,
        label: 'Rower 03',
        pm5Serial: null,
        inService: true,
        row: 1,
        column: 2,
      },
      {
        stationId: ids.stations.outage,
        label: 'Rower 04',
        pm5Serial: 'DEMO-PM5-OUTAGE',
        inService: false,
        row: 0,
        column: 2,
      },
    ],
    layout: {
      availability: 'current',
      orientationLabel: 'Entrance at bottom; center aisle',
    },
    classTypes: [sprint, technique, endurance],
    weeklyTemplates: [
      {
        templateId: ids.templates.weekA,
        name: 'Week A',
        entries: [
          {
            entryId: ids.templateEntries.monday,
            weekday: 1,
            localTime: '09:00',
            classTypeId: ids.classTypes.technique,
            coachId: ids.staff.coach,
          },
          {
            entryId: ids.templateEntries.wednesday,
            weekday: 3,
            localTime: '09:00',
            classTypeId: ids.classTypes.technique,
            coachId: ids.staff.multiRole,
          },
        ],
      },
      {
        templateId: ids.templates.weekB,
        name: 'Week B',
        entries: [
          {
            entryId: ids.templateEntries.tuesday,
            weekday: 2,
            localTime: '10:15',
            classTypeId: ids.classTypes.sprint,
          },
          {
            entryId: ids.templateEntries.thursday,
            weekday: 4,
            localTime: '12:00',
            classTypeId: ids.classTypes.endurance,
            coachId: ids.staff.coach,
          },
        ],
      },
    ],
    classes,
    bookings,
    attendance,
    notifications,
    waitlistEntries: [
      {
        entryId: ids.waitlist.birchPromoted,
        memberId: ids.members.birch,
        classId: ids.classes.full,
        joinOrder: 1,
        joinedAt: '2026-10-01T19:00:00Z',
        status: 'promoted',
        promotedAt: '2026-10-02T18:00:00Z',
        bookingId: ids.bookings.fullBirch,
        reviewFlags: [],
      },
      {
        entryId: ids.waitlist.moss,
        memberId: ids.members.moss,
        classId: ids.classes.full,
        joinOrder: 2,
        joinedAt: '2026-10-02T18:01:00Z',
        status: 'waiting',
        reviewFlags: ['memberInactive'],
      },
      {
        entryId: ids.waitlist.aspen,
        memberId: ids.members.aspen,
        classId: ids.classes.full,
        joinOrder: 3,
        joinedAt: '2026-10-02T18:02:00Z',
        status: 'waiting',
        reviewFlags: ['waiverOutdated'],
      },
      {
        entryId: ids.waitlist.willow,
        memberId: ids.members.willow,
        classId: ids.classes.full,
        joinOrder: 4,
        joinedAt: '2026-10-02T18:03:00Z',
        status: 'waiting',
        reviewFlags: [],
      },
      {
        entryId: ids.waitlist.juniperLeft,
        memberId: ids.members.juniper,
        classId: ids.classes.full,
        joinOrder: 5,
        joinedAt: '2026-10-02T18:04:00Z',
        status: 'left',
        leftAt: '2026-10-03T18:00:00Z',
        reviewFlags: [],
      },
      {
        entryId: ids.waitlist.cancelled,
        memberId: ids.members.willow,
        classId: ids.classes.cancelled,
        joinOrder: 1,
        joinedAt: '2026-10-01T19:00:00Z',
        status: 'cancelled',
        cancelledAt: '2026-10-02T22:00:00Z',
        reason: 'classCancelled',
        reviewFlags: [],
      },
    ],
    settings: {
      illustrative: true,
      timezone: DEMO_TIMEZONE,
      memberCap: 8,
      invitationExpiryMinutes: 7 * 24 * 60,
      scheduleRelease: { mode: 'immediate' },
      targetGapMinutes: 30,
      waitlistCutoffMinutes: 60,
      lateCancelCutoffMinutes: 120,
      checkInLeadMinutes: 30,
      checkInGraceMinutes: 5,
    },
    activeActor: { kind: 'staff', staffId: ids.staff.admin },
    scenarioId: ids.scenarios.baseline,
    clock: { now: DEMO_INITIAL_NOW, presetId: ids.clockPresets.baseline },
    simulation: { delivery: 'success', identity: 'verified' },
  };
}
