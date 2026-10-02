# Fitness Junkie - Deferred Mobile and Metrics Requirements

## Purpose

This document preserves requirements that are related to Fitness Junkie but are outside the gym operations application release. It is a scope register for separate mobile-app and workout-metrics requirements, not a complete specification for either release. These items SHALL NOT expand the scope of `gym-operations-requirements.md`.

## Release Boundaries

- The gym operations application owns gym records and rules: member status, invitations, waivers, schedules, bookings, waitlists, station assignments, notifications, and attendance.
- The mobile application is a separate release with its own requirements. Gym Operations owns the stable gym-member record and identifier; whether the mobile or metrics application links to it, uses the same authentication provider, or synchronizes profile fields is undecided and SHALL be specified before integration.
- Workout-metric collection and processing are separate from gym operations. Gym-member records are designed to support future extensions through their stable internal identifiers, but Gym Operations V1 does not store metrics or placeholder metric fields. Future metric ownership, schema, and synchronization require separate requirements.
- The room hub is a separate, parallel effort. Any hub integration and class-performance metrics require their own release specification.

## A. Member Mobile Application

The following member-facing capabilities were identified for a separate mobile-app requirements document:

- Account sign-up and sign-in, including the external authentication provider and whether members use one identity for personal and gym use. Gym Operations requires external authentication for live access but does not assume a particular provider or shared account.
- Profile creation and editing. Gym Operations owns its stable member profile and gym membership status. Any synchronization or account linking with a mobile/metrics application must be defined by a separate integration decision.
- Invitation acceptance, adult-eligibility attestation, and digital waiver signing.
- Landing view showing the next class, last class, and today's classes.
- Class schedule and detail views, including class type details, coach information, and what-to-bring notes.
- Station selection from the gym-maintained schematic layout, station changes, booking cancellation, waitlist joining/leaving, and status visibility. The mobile app SHALL show every station in its fixed layout position, make available stations selectable, and show booked or out-of-service stations as unavailable without revealing member names. It SHALL identify the member's own booked station and allow a change to another free station until the class starts. Members select a station and then confirm the booking; tapping a tile alone SHALL NOT reserve it. A stale availability conflict SHALL refresh the layout and SHALL NOT be reported as a confirmed booking. The layout is staff-maintained; the mobile app presents it and does not infer room geometry or require photographs.
- Member self-check-in during the configured window.
- Member-facing notices for invitation, booking, waitlist promotion, cancellation, and class changes. The gym operations release sends email; in-app banners are a mobile-app concern.
- Attendance and class participation history. Workout metrics SHALL NOT be attached to classes in the gym operations release.
- Account deletion interaction and coordination with the retention/anonymization policy for gym records, which remains an owner/legal decision.
- Personal rowing-log functionality already associated with the existing member experience, specified separately from gym operations.

The mobile-app specification must define client behavior and, if an integration is selected, its authentication-subject mapping, account linking, and profile synchronization without duplicating or weakening the gym operations system's authorization and business rules.

## B. Personal Workout Metrics

Personal workout capture and metrics are separate from the gym operations application. A future personal-rowing release may specify:

- Phone-to-PM5 Bluetooth Low Energy (BLE) workout capture.
- Workout records, metrics, synchronization, offline capture, and personal rowing history.
- Storage and presentation of member metrics linked to a stable member identity, with ownership and the relationship to Gym Operations records specified by the future metrics design.
- Data ownership, privacy, retention, and account-deletion behavior for workout data.

No workout metric is collected, calculated, imported, displayed, or attributed by the gym operations release. The stable gym-member identifier provides a possible future linkage point; it is not a requirement to create placeholder metric values or to collect metrics now.

## C. Room Hub and Class-Performance Metrics

These previously identified requirements are retained for a future room-hub release and require review in that release's specification:

### Class-performance grouping

- Create a separate class-performance grouping from eligible hub-captured metrics for each member and class.
- Include hub metrics in the member's canonical personal history without double-counting personal totals.
- Begin class-performance groupings prospectively at room-hub launch; do not backfill or retroactively tag earlier workouts or classes.
- A member's class performance may present a combined class total with station-segment detail.
- Define staff visibility and access in the room-hub or coach-console requirements.

### Capture window and idle behavior

- Align the early capture window with the configurable pre-class check-in lead time. Attribute metrics to the checked-in member assigned to the station.
- Make the post-class metric grace period configurable with a 5-minute default. It affects metrics only, not scheduled class time, check-in, or attendance.
- During class, an idle period may pause capture; if rowing resumes during class, capture resumes into the same class-performance grouping.
- Do not attribute a pre-class capture attempt that idles before class starts to the upcoming class. Class attribution begins with rowing activity at or after scheduled class start.
- After class end, the first station idle ends capture for that class before the grace cutoff. If the station does not idle, capture continues through the configured grace cutoff.
- If a station continues transmitting through the grace period while another person rows there without an assignment change, attribute metrics to the member assigned to the station; do not infer or correct the exchange automatically.

### Station changes and attribution

- A staff-approved station assignment change takes effect at the time of the change. Attribute earlier metrics to the prior member and subsequent metrics to the new assignment.
- If a member has eligible metrics from multiple assigned stations during a class, combine them in the member's class grouping while retaining station-segment detail.
- Use the current staff-maintained PM5-to-friendly-station association. Historical mapping and automatic correction of equipment-placement errors are not required.

### Explicit exclusions

- Room-hub hardware, live station-level capture, and live room displays are outside the gym operations release.
- A dedicated coach console and staff access to class-performance metrics require separate requirements.
- Gym operations SHALL NOT collect, display, or associate personal phone-captured workouts with classes or stations.
