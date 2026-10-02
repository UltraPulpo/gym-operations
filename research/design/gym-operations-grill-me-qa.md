# Fitness Junkie Gym Operations - Grill-Me Q&A

Backup of the decisions reached while reviewing `gym-operations-requirements.md` against `documents\proposals\fitness-junkie-gym-operations.md`. This records the confirmed product decisions, not implementation design.

## Release scope and metrics

| Question | Answer |
|----------|--------|
| Which proposal workflows remain in v1? | Keep the invite-only adult trial workflows: staff roles, invitations, waivers, members, class types, schedules, coaches, station assignments, bookings, waitlists, check-in, attendance, and notifications. |
| What is the v1 workout behavior? | BLE-recorded workouts remain complete canonical personal-history records. V1 does not tag workout metrics to a class or station. |
| When does class performance history begin? | With the future room-hub release, prospectively only. Do not retroactively tag or backfill classes/workouts from before that release. |
| How do hub metrics relate to personal totals? | The same captured metrics update the member's canonical personal history and a separate class-performance grouping. Class metrics must not be counted a second time in personal totals. |
| Who may view class metrics? | Defer staff visibility/access rules to the separate room-hub or coach-console requirements. |
| What is the hub capture window? | In the future hub release, the early capture window aligns with configurable pre-class check-in lead time. A separate configurable post-class metrics grace period applies; it does not extend attendance or check-in. |
| What is the future hub idle behavior? | During class, an idle may pause metrics and later rowing resumes the same class grouping. An idle during the pre-class break clears that early attempt; pre-class metrics from an attempt that idles before class start are not attached to the next class. After class ends, the first idle ends that class's capture before grace; if the machine does not idle, capture continues through the grace cutoff. |
| How do future hub station switches work? | Staff-approved station changes take effect at the switch time. Previously captured metrics stay with the member who produced them; subsequent metrics follow the new station assignment. A member's class performance combines their own eligible intervals and may show station-segment detail. |
| How are overlapping class metric windows handled? | Do not block a class merely because another class's post-class metrics grace may continue. The prior class keeps the station through grace only if the machine has not idled. If someone else rows before idle or cutoff, the members are expected to resolve that situation; no additional inference/correction behavior is required. |

## Schedule and classes

| Question | Answer |
|----------|--------|
| Is the inter-class gap a hard rule? | No. Admin configures a target gap (30-minute default). Warn when a gap is shorter than the target, including a zero-minute gap where one class ends as the next begins, but allow it. Block actual class-time overlap only; never move neighboring classes automatically. The interface shows class start/end times, not break events. |
| What happens when applying a template? | Skip exact duplicates. Reject the whole application if it would create an actual overlap and report the conflict. A gap shorter than the target, including zero without overlap, is allowed with a warning. |
| Which schedule-release modes are required? | Admin may choose immediate availability, a rolling advance window, or manual/batch release. Immediate availability with no advance limit is the trial default. |
| Which time zone and recurring-time behavior apply? | Use the gym's local time zone; recurring templates retain local wall-clock times across daylight-saving changes. |
| Are coaches mandatory? | No. Coach assignments are optional for drafts and published classes to support unexpected coach conflicts. Room overlap prevention is sufficient; no separate coach-overlap constraint was selected. |
| Which published edits notify members or waive late-cancel status? | Date/start-time or coach changes notify booked members; only a start-time change waives the late-cancel outcome. A duration-only change is not material for notification or cancellation relief. |
| How do class-type edits affect scheduled classes? | Class-type changes affect future classes only. Existing scheduled classes keep their details unless an Admin edits a specific class. |
| What if there are no in-service stations? | Warn staff; the class has zero capacity and cannot be published or booked. Do not automatically cancel it. |

## Membership, waivers, and staff

| Question | Answer |
|----------|--------|
| Who counts toward the member cap? | Active members only; outstanding invitations do not reserve capacity. Block invitation redemption when the active cap is reached. Reactivation also respects the cap. |
| How are invitations resent and expired? | Make expiration configurable, with the launch value unset. Keep at most one active invitation per email; resend replaces its token and restarts the expiry period. Revocation invalidates outstanding tokens. |
| What happens when an account is deactivated? | Immediately block member-app gym actions. Preserve existing bookings and waitlist entries but flag them for staff review; staff resolve them and can handle attendance if the person attends. Reactivation is subject to the member cap and current waiver requirements. |
| What happens after a new waiver version is published? | Preserve existing bookings. Require the member to sign the current version before checking in or making another booking. |
| How are adult members screened? | Adults only, using 18+ self-attestation during invitation acceptance; staff may correct or deny eligibility. Do not collect identity documents in v1. |
| Who owns coach profile fields? | Admin manages coach name, certifications, and staff-only contact details. Coaches edit their own photo and short biography. |
| What happens when a member account is deleted? | Gym-record retention/anonymization remains an owner/legal decision; no retention period was selected. |

## Bookings, waitlists, attendance, and notices

| Question | Answer |
|----------|--------|
| Can a member have conflicting bookings or waitlists? | No. The schedule blocks actual class overlaps, so conflicting class bookings/waitlists are not a separate case to design for. |
| What if two members choose the same station concurrently? | Show a simple conflict, refresh the available choices, and preserve the correct booking state. Leave race-condition and eventual-consistency mechanics to design documents. |
| How does waitlist re-entry work? | Leaving removes the active queue entry; rejoining gets a new position at the tail. |
| When does automatic promotion stop? | Promote only if the genuine in-service vacancy occurs strictly before the configured waitlist cutoff. At or after cutoff, open the station to booking. The launch cutoff value is unset. |
| Which vacancies trigger promotion? | A cancellation or staff removal that frees an in-service station may trigger promotion. Class cancellation and an out-of-service station do not. |
| What if a waitlisted member is ineligible? | Skip that entry for the current promotion attempt, retain it for staff resolution, and continue to the first eligible member. |
| How are late promotions treated? | A promoted member is booked automatically and follows ordinary no-show tracking; no separate acceptance is required. |
| What happens when staff remove a booked member? | Record a distinct staff-removed outcome, retain history, and process the genuine vacancy under the waitlist policy. |
| What happens when a class is cancelled? | Cancel active bookings and waitlist entries, retain cancellation history, do not promote anyone, and notify affected members. |
| How long may a member cancel? | Through the scheduled class start. Late cancellations before that point follow the Admin-configured late-cancel cutoff; after start, attendance/no-show rules apply. The launch cutoff value is unset. |
| How are station outages handled? | Exclude out-of-service stations from new capacity, retain and flag any existing affected booking for staff review, and never promote someone onto an unusable station. Do not silently reassign/cancel. |
| What happens if a member is promoted but is deactivated or lacks a current waiver? | Skip and retain the ineligible waitlist entry for staff resolution. |
| What is the check-in window? | Admin-configurable before-start and after-start windows, defaulting to 30 minutes before and 5 minutes after. The window is independent of the previous class; no preceding-class-end gate applies. |
| Can staff check in or reverse a check-in after class? | Yes, at any time. Attendance may be corrected and staff correction history retained; this does not extend any future hub metric-capture window. |
| Are no-shows or late cancellations penalized? | Track them for staff; no automatic penalties during the trial. |
| Are members notified about routine station moves? | No. A staff station move updates the assignment without notifying the member. |
| When is booking email sent? | Send booking/promotion email only after the booking is confirmed, avoiding correction emails for unconfirmed conflicts. Booking/cancellation/promotion state remains authoritative if email later fails; retain the in-app notice and surface failure to staff for resend. |

## Availability and outage

| Question | Answer |
|----------|--------|
| Is offline booking supported? | No. During a service outage, staff may use a printed/downloaded roster for attendance and reconcile it after service returns. Booking state remains unchanged unless staff explicitly correct it. |
| What is included in the outage roster? | Class roster and station assignments only; do not include member contact details or waiver information. |

## Configuration values intentionally left open

- Member cap launch value.
- Invitation expiration launch value.
- Waitlist promotion cutoff.
- Late-cancel cutoff.
- Account-deletion retention/anonymization period and policy.

## Superseded or clarified interpretations

- The earlier class-row linking/tagging language from the proposal does **not** apply in v1; it is deferred to the room-hub release.
- The inter-class target is a warning-only preference, not a 30-minute minimum. Only actual scheduled-time overlap is blocked; a zero-minute boundary gap without overlap is allowed with a warning.
- The earlier fixed 30/+5 check-in statement is clarified: these are configurable Admin defaults in v1, and check-in may occur while a preceding class is in progress.
- Future hub capture rules are separate from v1 BLE personal-workout capture. They do not alter the canonical complete workout or retroactively tag pre-hub classes.
