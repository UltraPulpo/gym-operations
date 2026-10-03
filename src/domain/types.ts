/**
 * Fictional, in-memory POC contracts, not production authentication or evidence.
 * IDs use readable prefixes so fixtures need neither casts nor runtime constructors.
 * Time formats distinguish inputs; calendar/zone validity belongs to pure rules.
 */
export type EntityId<Kind extends string> = `${Kind}:${string}`;
export type StaffId = EntityId<'staff'>;
export type MemberId = EntityId<'member'>;
export type IdentitySubject = EntityId<'identity'>;
export type InvitationId = EntityId<'invitation'>;
export type WaiverVersionId = EntityId<'waiver'>;
export type WaiverSignatureId = EntityId<'signature'>;
export type StationId = EntityId<'station'>;
export type ClassTypeId = EntityId<'classType'>;
export type WeeklyTemplateId = EntityId<'template'>;
export type TemplateEntryId = EntityId<'templateEntry'>;
export type ClassId = EntityId<'class'>;
export type BookingId = EntityId<'booking'>;
export type WaitlistEntryId = EntityId<'waitlist'>;
export type AttendanceId = EntityId<'attendance'>;
export type AttendanceCorrectionId = EntityId<'correction'>;
export type NotificationId = EntityId<'notification'>;
export type NotificationAttemptId = EntityId<'notificationAttempt'>;
export type ScenarioId = EntityId<'scenario'>;
export type ClockPresetId = EntityId<'clockPreset'>;
export type AvatarId = EntityId<'avatar'>;

export type LocalDate = `${number}-${number}-${number}`;
export type LocalTime = `${number}:${number}`;
export type UtcInstant = `${LocalDate}T${number}:${number}:${number}Z`;
export type IanaTimeZone = `${string}/${string}`;
export type DurationMinutes = number;
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface LocalSchedule {
  readonly date: LocalDate;
  readonly time: LocalTime;
  readonly timezone: IanaTimeZone;
}

export type MemberStatus = 'pending' | 'active' | 'inactive';
export type StaffRole = 'admin' | 'frontDesk' | 'coach';
export type AdultEligibility = 'attested' | 'denied';

export interface Member {
  readonly memberId: MemberId;
  readonly displayName: string;
  readonly verifiedEmail: string;
  readonly contactEmail?: string;
  readonly identitySubject: IdentitySubject;
  readonly status: MemberStatus;
  readonly invitationId: InvitationId;
  readonly adultAttestationAt: UtcInstant;
  readonly adultEligibility: AdultEligibility;
  readonly createdAt: UtcInstant;
}

export type MemberProfileUpdate = Partial<
  Pick<
    Member,
    | 'displayName'
    | 'verifiedEmail'
    | 'contactEmail'
    | 'adultAttestationAt'
    | 'adultEligibility'
  >
>;

export interface CoachContact {
  readonly email?: string;
  readonly phone?: string;
}

export interface PublicCoachProfile {
  readonly displayName: string;
  readonly avatarId: AvatarId;
  readonly biography: string;
  readonly certifications: readonly string[];
  readonly contact?: never;
}

export interface CoachProfile extends Omit<PublicCoachProfile, 'contact'> {
  readonly contact: CoachContact;
}

export type OwnCoachProfileUpdate = Partial<
  Pick<PublicCoachProfile, 'avatarId' | 'biography'>
>;
export type AdminCoachProfileUpdate = Partial<CoachProfile>;

export interface StaffAccount {
  readonly staffId: StaffId;
  readonly identitySubject: IdentitySubject;
  readonly active: boolean;
  readonly assignedRoles: readonly StaffRole[];
  readonly assignedClassIds: readonly ClassId[];
  readonly coachProfile?: CoachProfile;
}

export type StaffAccountUpdate = Partial<
  Pick<
    StaffAccount,
    'active' | 'assignedRoles' | 'assignedClassIds' | 'identitySubject'
  >
>;

export type DemoActor =
  | { readonly kind: 'staff'; readonly staffId: StaffId }
  | { readonly kind: 'member'; readonly memberId: MemberId }
  | { readonly kind: 'invitation'; readonly invitationId: InvitationId };

export type DemoCapability =
  | 'manageStaff'
  | 'manageSettings'
  | 'manageWaivers'
  | 'manageStations'
  | 'manageClassTypes'
  | 'manageTemplates'
  | 'manageSchedule'
  | 'viewSchedule'
  | 'manageMembers'
  | 'manageInvitations'
  | 'manageBookings'
  | 'manageWaitlists'
  | 'manageAttendance'
  | 'viewRoster'
  | 'reseatBookings'
  | 'manageNotifications'
  | 'manageCoachProfiles'
  | 'editOwnCoachProfile'
  | 'acceptInvitation'
  | 'signWaiver'
  | 'bookStation'
  | 'cancelOwnBooking'
  | 'moveOwnBooking'
  | 'manageOwnWaitlist'
  | 'selfCheckIn';

export interface DemoCapabilities {
  readonly capabilities: readonly DemoCapability[];
  readonly classScope:
    | { readonly kind: 'all' }
    | { readonly kind: 'assigned'; readonly classIds: readonly ClassId[] }
    | { readonly kind: 'none' };
}

export type InvitationStatus =
  'outstanding' | 'accepted' | 'revoked' | 'expired' | 'superseded';

export interface InvitationBase {
  readonly invitationId: InvitationId;
  readonly email: string;
  readonly issuedAt: UtcInstant;
  readonly expiresAt: UtcInstant;
  readonly issuedBy: StaffId;
}

export type Invitation = InvitationBase &
  (
    | { readonly status: 'outstanding' }
    | {
        readonly status: 'accepted';
        readonly acceptedAt: UtcInstant;
        readonly memberId: MemberId;
      }
    | {
        readonly status: 'revoked';
        readonly revokedAt: UtcInstant;
        readonly revokedBy: StaffId;
      }
    | { readonly status: 'expired'; readonly expiredAt: UtcInstant }
    | {
        readonly status: 'superseded';
        readonly supersededAt: UtcInstant;
        readonly replacementId: InvitationId;
      }
  );

export type IdentityScenario = 'verified' | 'rejected' | 'mismatched';
export type IdentityOutcome =
  | {
      readonly outcome: 'verified';
      readonly subject: IdentitySubject;
      readonly verifiedEmail: string;
    }
  | { readonly outcome: 'rejected'; readonly message: string }
  | {
      readonly outcome: 'mismatched';
      readonly subject: IdentitySubject;
      readonly verifiedEmail: string;
    };

export interface WaiverSigningInput {
  readonly waiverVersionId: WaiverVersionId;
  readonly typedName: string;
}

export interface InvitationAcceptanceInput {
  readonly invitationId: InvitationId;
  readonly memberId: MemberId;
  readonly signatureId: WaiverSignatureId;
  readonly displayName: string;
  readonly adultAttested: boolean;
  readonly identity: IdentityOutcome;
  readonly waiver: WaiverSigningInput;
}

export type WaiverStatus = 'draft' | 'published';
export type WaiverVersion = {
  readonly waiverVersionId: WaiverVersionId;
  readonly version: number;
  readonly text: string;
  readonly createdAt: UtcInstant;
} & (
  | { readonly status: 'draft' }
  | { readonly status: 'published'; readonly publishedAt: UtcInstant }
);

export interface WaiverSignature {
  readonly signatureId: WaiverSignatureId;
  readonly memberId: MemberId;
  readonly waiverVersionId: WaiverVersionId;
  readonly typedName: string;
  readonly signedAt: UtcInstant;
}

export type WaiverCompliance =
  | { readonly status: 'current'; readonly signature: WaiverSignature }
  | {
      readonly status: 'outdated';
      readonly signature: WaiverSignature;
      readonly currentVersionId: WaiverVersionId;
    }
  | { readonly status: 'missing'; readonly currentVersionId: WaiverVersionId }
  | { readonly status: 'unavailable'; readonly error: DemoUnavailableState };

export interface GridPosition {
  readonly row: number;
  readonly column: number;
}

export interface Station extends GridPosition {
  readonly stationId: StationId;
  readonly label: string;
  readonly pm5Serial: string | null;
  readonly inService: boolean;
}

export interface RetiredStation {
  readonly stationId: StationId;
  readonly label: string;
  readonly pm5Serial: string | null;
  readonly retiredAt: UtcInstant;
}

export type StationUpdate = Partial<
  Pick<Station, 'label' | 'pm5Serial' | 'inService'>
>;
export type StationState =
  'available' | 'bookedNotCheckedIn' | 'bookedCheckedIn' | 'outOfService';
export type LayoutAvailability = 'current' | 'stale' | 'unavailable';

export interface StationLayout {
  readonly orientationLabel?: string;
  readonly availability: LayoutAvailability;
}

export interface LayoutStation extends GridPosition {
  readonly stationId: StationId;
  readonly label: string;
  readonly state: StationState;
  readonly stateLabel: string;
}

export interface StaffLayoutStation extends LayoutStation {
  readonly bookingId?: BookingId;
  readonly assignedMember?: {
    readonly memberId: MemberId;
    readonly displayName: string;
  };
  readonly reviewFlags: readonly BookingReviewFlag[];
}

export interface MemberLayoutStation extends LayoutStation {
  readonly assignedMember?: never;
  readonly bookingId?: never;
}

export type LayoutView =
  | {
      readonly status: 'available';
      readonly audience: 'staff';
      readonly classId: ClassId;
      readonly orientationLabel?: string;
      readonly canReseat: boolean;
      readonly stations: readonly StaffLayoutStation[];
    }
  | {
      readonly status: 'available';
      readonly audience: 'member';
      readonly classId: ClassId;
      readonly orientationLabel?: string;
      readonly canReseat: false;
      readonly stations: readonly MemberLayoutStation[];
    }
  | {
      readonly status: 'unavailable';
      readonly classId?: ClassId;
      readonly canReseat: false;
      readonly error: DemoUnavailableState;
    };

export type ClassDurationMinutes = 30 | 45 | 60;
export type ClassStatus = 'draft' | 'published' | 'cancelled' | 'completed';

export interface ClassType {
  readonly classTypeId: ClassTypeId;
  readonly name: string;
  readonly durationMinutes: ClassDurationMinutes;
  readonly description: string;
  readonly difficulty: string;
  readonly alias?: string;
  readonly whatToBring?: string;
}

export type ClassTypeSnapshot = Readonly<ClassType>;
export type ClassTypeUpdate = Partial<Omit<ClassType, 'classTypeId'>>;
export type ClassReviewFlag = 'zeroCapacity';

export interface ScheduledClass {
  readonly classId: ClassId;
  readonly schedule: LocalSchedule;
  readonly startsAt: UtcInstant;
  readonly endsAt: UtcInstant;
  readonly status: ClassStatus;
  readonly coachId?: StaffId;
  readonly classTypeSnapshot: ClassTypeSnapshot;
  readonly releasedAt?: UtcInstant;
  readonly publishedAt?: UtcInstant;
  readonly cancelledAt?: UtcInstant;
  readonly cancellationReason?: string;
  readonly completedAt?: UtcInstant;
  readonly lateCancelWaived: boolean;
  readonly reviewFlags: readonly ClassReviewFlag[];
}

export interface DraftClassInput {
  readonly classId: ClassId;
  readonly schedule: LocalSchedule;
  readonly classTypeId: ClassTypeId;
  readonly coachId?: StaffId;
}

export interface ScheduledClassUpdate {
  readonly schedule?: LocalSchedule;
  readonly classTypeId?: ClassTypeId;
  readonly coachId?: StaffId | null;
}

export interface TemplateEntry {
  readonly entryId: TemplateEntryId;
  readonly weekday: Weekday;
  readonly localTime: LocalTime;
  readonly classTypeId: ClassTypeId;
  readonly coachId?: StaffId;
}

export interface WeeklyTemplate {
  readonly templateId: WeeklyTemplateId;
  readonly name: string;
  readonly entries: readonly TemplateEntry[];
}

export type WeeklyTemplateUpdate = Partial<
  Pick<WeeklyTemplate, 'name' | 'entries'>
>;
export interface TemplateApplication {
  readonly classes: readonly ScheduledClass[];
  readonly skippedDuplicates: readonly ClassId[];
  readonly warnings: readonly ShortGapWarning[];
}

export type ScheduleReleasePolicy =
  | { readonly mode: 'immediate' }
  | { readonly mode: 'rolling'; readonly advanceMinutes: DurationMinutes }
  | { readonly mode: 'manual' };

export interface ClassFilters {
  readonly actor: DemoActor;
  readonly now: UtcInstant;
  readonly from?: UtcInstant;
  readonly to?: UtcInstant;
  readonly statuses?: readonly ClassStatus[];
  readonly coachId?: StaffId;
}

export type BookingStatus = 'booked' | 'cancelled' | 'staffRemoved';
export type BookingReviewFlag = 'memberInactive' | 'stationOutOfService';

export interface BookingBase {
  readonly bookingId: BookingId;
  readonly memberId: MemberId;
  readonly classId: ClassId;
  readonly stationId: StationId;
  readonly bookedAt: UtcInstant;
  /** Attendance is canonical in DemoState.attendance, never duplicated on a booking. */
  readonly attendanceRecordId: AttendanceId;
  readonly reviewFlags: readonly BookingReviewFlag[];
  readonly promotedFromEntryId?: WaitlistEntryId;
}

export type Booking = BookingBase &
  (
    | { readonly status: 'booked' }
    | {
        readonly status: 'cancelled';
        readonly cancelledAt: UtcInstant;
        readonly cancellationReason: 'member' | 'classCancelled';
      }
    | {
        readonly status: 'staffRemoved';
        readonly removedAt: UtcInstant;
        readonly removedBy: StaffId;
        readonly removalReason: string;
      }
  );

export type WaitlistStatus = 'waiting' | 'left' | 'promoted' | 'cancelled';
export type WaitlistReviewFlag =
  'memberInactive' | 'waiverOutdated' | 'invitationNotAccepted';
export type WaitlistEntry = {
  readonly entryId: WaitlistEntryId;
  readonly memberId: MemberId;
  readonly classId: ClassId;
  readonly joinOrder: number;
  readonly joinedAt: UtcInstant;
  readonly reviewFlags: readonly WaitlistReviewFlag[];
} & (
  | { readonly status: 'waiting' }
  | { readonly status: 'left'; readonly leftAt: UtcInstant }
  | {
      readonly status: 'promoted';
      readonly promotedAt: UtcInstant;
      readonly bookingId: BookingId;
    }
  | {
      readonly status: 'cancelled';
      readonly cancelledAt: UtcInstant;
      readonly reason: 'classCancelled' | 'staffRemoval';
    }
);

export type AttendanceOutcome =
  | 'booked'
  | 'attended'
  | 'cancelled'
  | 'lateCancel'
  | 'noShow'
  | 'staffRemoved';
export type CheckInState =
  | { readonly status: 'notCheckedIn' }
  | {
      readonly status: 'checkedIn';
      readonly checkedInAt: UtcInstant;
      readonly checkedInBy: DemoActor;
    };

export type AttendanceSource =
  | { readonly kind: 'booking'; readonly bookingId: BookingId }
  | { readonly kind: 'classEnd'; readonly recordedAt: UtcInstant }
  | { readonly kind: 'memberCancellation'; readonly recordedAt: UtcInstant }
  | {
      readonly kind: 'staff';
      readonly staffId: StaffId;
      readonly recordedAt: UtcInstant;
    }
  | {
      readonly kind: 'manualOutage';
      readonly staffId: StaffId;
      readonly recordedAt: UtcInstant;
    };

export interface AttendanceCorrection {
  readonly correctionId: AttendanceCorrectionId;
  readonly staffId: StaffId;
  readonly previousOutcome: AttendanceOutcome;
  readonly newOutcome: AttendanceOutcome;
  readonly recordedAt: UtcInstant;
  readonly reason: string;
  readonly previousCheckIn?: CheckInState;
  readonly newCheckIn?: CheckInState;
}

export interface AttendanceRecord {
  readonly attendanceId: AttendanceId;
  readonly classId: ClassId;
  readonly memberId: MemberId;
  readonly bookingId?: BookingId;
  readonly currentOutcome: AttendanceOutcome;
  readonly checkIn: CheckInState;
  readonly source: AttendanceSource;
  readonly corrections: readonly AttendanceCorrection[];
}

export interface PrintableRosterEntry {
  readonly memberDisplayName: string;
  readonly stationLabel: string;
}

export interface PrintableRoster {
  readonly classId: ClassId;
  readonly entries: readonly PrintableRosterEntry[];
}

export type DeliveryScenario = 'success' | 'failure';
export type NotificationStatus = 'sent' | 'failed';
export type ClassChange = 'date' | 'startTime' | 'coach';

export type NotificationEvent =
  | { readonly type: 'invitation'; readonly invitationId: InvitationId }
  | {
      readonly type: 'bookingConfirmed';
      readonly bookingId: BookingId;
      readonly classId: ClassId;
    }
  | {
      readonly type: 'waitlistPromoted';
      readonly bookingId: BookingId;
      readonly entryId: WaitlistEntryId;
      readonly classId: ClassId;
    }
  | { readonly type: 'classCancelled'; readonly classId: ClassId }
  | {
      readonly type: 'classChanged';
      readonly classId: ClassId;
      readonly changes: readonly ClassChange[];
    };

export type NotificationRecipient =
  | { readonly kind: 'invitee'; readonly email: string }
  | {
      readonly kind: 'member';
      readonly memberId: MemberId;
      readonly email: string;
    };

export type NotificationAttempt = {
  readonly attemptId: NotificationAttemptId;
  readonly attemptedAt: UtcInstant;
  readonly resentBy?: StaffId;
} & (
  | { readonly status: 'sent'; readonly scenario: 'success' }
  | {
      readonly status: 'failed';
      readonly scenario: 'failure';
      readonly error: SimulatedDeliveryFailure;
    }
);

export interface NotificationRecord {
  readonly notificationId: NotificationId;
  readonly simulated: true;
  readonly event: NotificationEvent;
  readonly recipient: NotificationRecipient;
  readonly createdAt: UtcInstant;
  readonly status: NotificationStatus;
  readonly attempts: readonly NotificationAttempt[];
}

export interface SystemSettings {
  readonly illustrative: true;
  readonly timezone: IanaTimeZone;
  readonly memberCap: number;
  readonly invitationExpiryMinutes: DurationMinutes;
  readonly scheduleRelease: ScheduleReleasePolicy;
  readonly targetGapMinutes: DurationMinutes;
  readonly waitlistCutoffMinutes: DurationMinutes;
  readonly lateCancelCutoffMinutes: DurationMinutes;
  readonly checkInLeadMinutes: DurationMinutes;
  readonly checkInGraceMinutes: DurationMinutes;
}

export type SystemSettingsUpdate = Partial<
  Omit<SystemSettings, 'illustrative'>
>;

export interface VirtualClock {
  readonly now: UtcInstant;
  readonly presetId: ClockPresetId | null;
}

export interface ClockPreset {
  readonly presetId: ClockPresetId;
  readonly name: string;
  readonly instant: UtcInstant;
}

export interface SimulationSettings {
  readonly delivery: DeliveryScenario;
  readonly identity: IdentityScenario;
}

export interface DemoState {
  readonly revision: number;
  readonly staffAccounts: readonly StaffAccount[];
  readonly members: readonly Member[];
  readonly invitations: readonly Invitation[];
  readonly waivers: readonly WaiverVersion[];
  readonly currentWaiverVersionId: WaiverVersionId | null;
  readonly waiverSignatures: readonly WaiverSignature[];
  readonly stations: readonly Station[];
  readonly retiredStations: readonly RetiredStation[];
  readonly layout: StationLayout;
  readonly classTypes: readonly ClassType[];
  readonly weeklyTemplates: readonly WeeklyTemplate[];
  readonly classes: readonly ScheduledClass[];
  readonly bookings: readonly Booking[];
  readonly waitlistEntries: readonly WaitlistEntry[];
  readonly attendance: readonly AttendanceRecord[];
  readonly notifications: readonly NotificationRecord[];
  readonly settings: SystemSettings;
  readonly activeActor: DemoActor;
  readonly scenarioId: ScenarioId;
  readonly clock: VirtualClock;
  readonly simulation: SimulationSettings;
}

export type ScenarioCategory =
  | 'baseline'
  | 'capacityWaitlist'
  | 'invitationMemberCap'
  | 'scheduleConflict'
  | 'waiverAttendance'
  | 'unavailableLayout';

export interface DemoScenario {
  readonly scenarioId: ScenarioId;
  readonly name: string;
  readonly description: string;
  readonly category: ScenarioCategory;
  readonly illustrative: true;
  readonly snapshot: DemoState;
  readonly defaultActor: DemoActor;
  readonly clockInstant: UtcInstant;
  readonly timezone: IanaTimeZone;
}

export interface FieldValidationError {
  readonly field: string;
  readonly message: string;
}

export interface ValidationError {
  readonly category: 'ValidationError';
  readonly message: string;
  readonly fields: readonly FieldValidationError[];
}

export type IneligibilityReason =
  | 'roleDenied'
  | 'inactiveStaff'
  | 'classScopeDenied'
  | 'memberInactive'
  | 'adultEligibilityDenied'
  | 'memberCapReached'
  | 'invitationNotAccepted'
  | 'invitationExpired'
  | 'invitationRevoked'
  | 'identityRejected'
  | 'identityMismatch'
  | 'waiverMissing'
  | 'waiverOutdated'
  | 'classNotPublished'
  | 'classNotReleased'
  | 'classCancelled'
  | 'classCompleted'
  | 'zeroCapacity'
  | 'stationOutOfService'
  | 'stationHasActiveBookings'
  | 'alreadyBooked'
  | 'alreadyWaitlisted'
  | 'classNotFull'
  | 'bookingNotActive'
  | 'waitlistNotActive'
  | 'waitlistCutoffReached'
  | 'outsideCheckInWindow'
  | 'classStarted'
  | 'classEnded'
  | 'backwardClock'
  | 'confirmationRequired';

export interface IneligibleDemoAction {
  readonly category: 'IneligibleDemoAction';
  readonly message: string;
  readonly reason: IneligibilityReason;
  readonly memberId?: MemberId;
  readonly classId?: ClassId;
}

export type ConflictDetails =
  | {
      readonly kind: 'station';
      readonly classId: ClassId;
      readonly stationId: StationId;
      readonly availableStationIds: readonly StationId[];
      readonly layout?: LayoutView;
    }
  | { readonly kind: 'schedule'; readonly classIds: readonly ClassId[] }
  | { readonly kind: 'duplicateEmail'; readonly email: string }
  | {
      readonly kind: 'revision';
      readonly expectedRevision: number;
      readonly currentRevision: number;
    };

export interface DemoConflict {
  readonly category: 'DemoConflict';
  readonly message: string;
  readonly conflict: ConflictDetails;
}

export type DomainResource =
  | 'staff'
  | 'member'
  | 'invitation'
  | 'waiver'
  | 'station'
  | 'classType'
  | 'template'
  | 'class'
  | 'booking'
  | 'waitlist'
  | 'attendance'
  | 'notification'
  | 'scenario'
  | 'clockPreset'
  | 'layout';

export interface DemoUnavailableState {
  readonly category: 'DemoUnavailableState';
  readonly message: string;
  readonly resource: DomainResource;
  readonly resourceId?: string;
  readonly stale: boolean;
}

export interface SimulatedDeliveryFailure {
  readonly category: 'SimulatedDeliveryFailure';
  readonly message: string;
  readonly scenario: 'failure';
  readonly notificationId?: NotificationId;
}

export type UnsupportedOperation =
  | 'liveAuthentication'
  | 'realEmail'
  | 'sharedPersistence'
  | 'offlineBooking'
  | 'equipmentConnection'
  | 'mediaUpload';

export interface UnsupportedPrototypeOperation {
  readonly category: 'UnsupportedPrototypeOperation';
  readonly message: string;
  readonly operation: UnsupportedOperation;
}

export type DomainError =
  | ValidationError
  | IneligibleDemoAction
  | DemoConflict
  | DemoUnavailableState
  | SimulatedDeliveryFailure
  | UnsupportedPrototypeOperation;

export type DomainResult<T> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: DomainError };

export interface ShortGapWarning {
  readonly category: 'shortGap';
  readonly message: string;
  readonly earlierClassId: ClassId;
  readonly laterClassId: ClassId;
  readonly actualGapMinutes: DurationMinutes;
  readonly targetGapMinutes: DurationMinutes;
}

export interface WaitlistNotPromotedWarning {
  readonly category: 'waitlistNotPromoted';
  readonly message: string;
  readonly classId: ClassId;
  readonly reason: 'noEligibleWaiter';
}

export type DomainWarning = ShortGapWarning | WaitlistNotPromotedWarning;

/** Requests are unvalidated. Only rules may turn them into accepted transitions. */
export interface DemoActionPayloads {
  readonly createStaffAccount: { readonly staff: StaffAccount };
  readonly updateStaffAccount: {
    readonly staffId: StaffId;
    readonly updates: StaffAccountUpdate;
  };
  readonly deactivateStaffAccount: { readonly staffId: StaffId };
  readonly createInvitation: {
    readonly invitationId: InvitationId;
    readonly email: string;
  };
  readonly resendInvitation: {
    readonly invitationId: InvitationId;
    readonly replacementId: InvitationId;
  };
  readonly revokeInvitation: { readonly invitationId: InvitationId };
  readonly expireInvitations: Readonly<Record<string, never>>;
  readonly acceptInvitation: InvitationAcceptanceInput;
  readonly updateMemberProfile: {
    readonly memberId: MemberId;
    readonly updates: MemberProfileUpdate;
  };
  readonly setMemberStatus: {
    readonly memberId: MemberId;
    readonly status: MemberStatus;
  };
  readonly createWaiverVersion: { readonly waiver: WaiverVersion };
  readonly publishWaiver: { readonly waiverVersionId: WaiverVersionId };
  readonly signWaiver: WaiverSigningInput & {
    readonly memberId: MemberId;
    readonly signatureId: WaiverSignatureId;
  };
  readonly createStation: { readonly station: Station };
  readonly updateStation: {
    readonly stationId: StationId;
    readonly updates: StationUpdate;
  };
  readonly placeStation: GridPosition & { readonly stationId: StationId };
  readonly retireStation: { readonly stationId: StationId };
  readonly insertLayoutLine: {
    readonly axis: 'row' | 'column';
    readonly index: number;
  };
  readonly removeLayoutLine: {
    readonly axis: 'row' | 'column';
    readonly index: number;
  };
  readonly setLayoutOrientation: { readonly orientationLabel: string };
  readonly createClassType: { readonly classType: ClassType };
  readonly updateClassType: {
    readonly classTypeId: ClassTypeId;
    readonly updates: ClassTypeUpdate;
  };
  readonly createWeeklyTemplate: { readonly template: WeeklyTemplate };
  readonly updateWeeklyTemplate: {
    readonly templateId: WeeklyTemplateId;
    readonly updates: WeeklyTemplateUpdate;
  };
  readonly deleteWeeklyTemplate: { readonly templateId: WeeklyTemplateId };
  readonly applyWeeklyTemplate: {
    readonly templateId: WeeklyTemplateId;
    readonly weekStartsOn: LocalDate;
  };
  readonly createDraftClass: DraftClassInput;
  readonly editScheduledClass: {
    readonly classId: ClassId;
    readonly updates: ScheduledClassUpdate;
  };
  readonly deleteDraftClass: { readonly classId: ClassId };
  readonly publishClasses: { readonly classIds: readonly ClassId[] };
  readonly releaseClasses: { readonly classIds: readonly ClassId[] };
  readonly cancelClass: { readonly classId: ClassId; readonly reason: string };
  readonly bookStation: {
    readonly memberId: MemberId;
    readonly classId: ClassId;
    readonly stationId: StationId;
  };
  readonly cancelBooking: { readonly bookingId: BookingId };
  readonly removeBooking: {
    readonly bookingId: BookingId;
    readonly reason: string;
  };
  readonly moveBooking: {
    readonly bookingId: BookingId;
    readonly destinationStationId: StationId;
    readonly confirmed: true;
  };
  readonly swapBookings: {
    readonly bookingId: BookingId;
    readonly otherBookingId: BookingId;
    readonly confirmed: true;
  };
  readonly joinWaitlist: {
    readonly memberId: MemberId;
    readonly classId: ClassId;
  };
  readonly leaveWaitlist: { readonly entryId: WaitlistEntryId };
  readonly promoteWaitlist: {
    readonly classId: ClassId;
    readonly stationId: StationId;
  };
  readonly checkIn: { readonly bookingId: BookingId };
  readonly reverseCheckIn: {
    readonly attendanceId: AttendanceId;
    readonly reason: string;
  };
  readonly correctAttendance: {
    readonly attendanceId: AttendanceId;
    readonly outcome: AttendanceOutcome;
    readonly reason: string;
  };
  readonly recordManualAttendance: {
    readonly classId: ClassId;
    readonly memberId: MemberId;
    readonly outcome: AttendanceOutcome;
    readonly reason: string;
  };
  readonly resendNotification: {
    readonly notificationId: NotificationId;
    readonly scenario: DeliveryScenario;
  };
  readonly updateOwnCoachProfile: {
    readonly staffId: StaffId;
    readonly updates: OwnCoachProfileUpdate;
  };
  readonly updateCoachProfile: {
    readonly staffId: StaffId;
    readonly updates: AdminCoachProfileUpdate;
  };
  readonly updateSettings: { readonly updates: SystemSettingsUpdate };
  readonly selectActor: { readonly actor: DemoActor };
  readonly setSimulation: Partial<SimulationSettings>;
  readonly advanceClock: { readonly to: UtcInstant };
  readonly setClockPreset: { readonly presetId: ClockPresetId };
  readonly resetDemo: { readonly confirmed: true };
  readonly loadScenario: {
    readonly scenarioId: ScenarioId;
    readonly confirmed: true;
  };
  readonly unsupportedOperation: { readonly operation: UnsupportedOperation };
}

export type DemoActionType = keyof DemoActionPayloads;
export type ActionOf<Type extends DemoActionType> = {
  [ActionType in Type]: {
    readonly type: ActionType;
    readonly payload: DemoActionPayloads[ActionType];
  };
}[Type];
export type DemoAction = ActionOf<DemoActionType>;

/**
 * Rules compute all affected collection replacements together, including promotion,
 * corrections and simulated delivery. Omitted fields stay unchanged; revision is
 * advanced by the reducer. Reset/scenario load supply every replacement field.
 */
export type DemoStateChanges = Partial<Omit<DemoState, 'revision'>>;

export interface AcceptedAction {
  readonly type: 'accepted';
  readonly action: DemoAction;
  readonly actor: DemoActor;
  readonly validatedAt: UtcInstant;
  readonly baseRevision: number;
  readonly changes: DemoStateChanges;
  readonly warnings: readonly DomainWarning[];
}

export type ValidateAction = (
  state: DemoState,
  actor: DemoActor,
  action: DemoAction,
  now: UtcInstant,
) => DomainResult<AcceptedAction>;
export type DemoReducer = (
  state: DemoState,
  action: AcceptedAction,
) => DemoState;
export type DemoDispatch = (action: AcceptedAction) => void;
export type CreateInitialDemoState = () => DemoState;
export type SelectClasses = (
  state: DemoState,
  filters: ClassFilters,
) => readonly ScheduledClass[];
export type SelectClassLayout = (
  state: DemoState,
  classId: ClassId,
  actor: DemoActor,
  now: UtcInstant,
) => LayoutView;
export type GetScenarios = () => readonly DemoScenario[];
export type LoadScenario = (
  scenarioId: ScenarioId,
) => DomainResult<DemoScenario>;
export type ResetDemo = () => void;
