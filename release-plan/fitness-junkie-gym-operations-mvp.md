**NOTE** This artifact is largely just a backup of the grill-me iterations done against the "Release 2 — "Open the Doors" (Gym Operations MVP)" section of the Release Plan.

## Release 2 — "Open the Doors" (Gym Operations MVP)

**Goal:** Everything the gym needs to open and run free, invite-only trial classes: schedule, booking, waitlist, members, and check-in. In class, workout data is still captured on each member's phone (R1 style) as a stopgap until the room hub arrives in R3, but is now linked to the class it happened in.

**Audience:** Admins, front-desk staff, coaches, invited trial members.

**Build approach:** Built in-house (no off-the-shelf gym-management platform). Without billing, the platforms' main strength doesn't apply, and owning stations and bookings is what R3's per-station data attribution depends on.

**Apps**
- **Staff web app** — used by Admin, Front Desk, and Coach roles (on a desktop or a tablet at the front desk). Coaches keep using it until R3's coach console.
- **Member mobile app** — the R1 app, extended with gym features for invited members.

### Staff roles

Three fixed roles; one person can hold more than one. No custom permission profiles in R2.

| Role | Can do |
|---|---|
| **Admin** | Everything, including: staff accounts; settings (member cap, schedule release rules, waitlist cutoff, late-cancel cutoff); waiver versions; stations; class types; schedule templates and **all schedule editing** (creating, editing, publishing, cancelling classes, changing coach). |
| **Front Desk** | Members and invites; bookings, waitlists, check-in / un-check-in, and seat moves for any class. Read-only schedule. |
| **Coach** | For their own classes: roster, check-in / un-check-in, seat moves. Read-only schedule. Edit their own bio and photo. |

### Membership: invite-only trial

- One account per person. Gym membership is a status on the member's existing R1 account, so history, lifetime meters, and start meters carry over. Non-members keep using the personal log.
- Admin / Front Desk invite people by email (whether or not they already have an account). Accepting the invite and signing the waiver grants gym access.
- **Member cap:** a simple guardrail against the trial being flooded, adjustable by Admin in the web app. Deliberately kept loose — invite-only is the real control.
- Deactivate / reactivate a member.

### Waiver

- Digital liability waiver signed in the app when accepting an invite (typed name + timestamp + waiver version).
- Waiver text is versioned by Admin; publishing a new version requires members to re-sign before their next booking.
- Staff can see who has signed which version. The waiver wording itself is a legal task for the owners, not an engineering one.

### Stations

- One room with a fixed layout of numbered RowErg stations, each mapped to its PM5 serial. A physical label on each erg shows the station number and serial, which resolves Capture proposal OQ5.
- Stations are spaced ~1 - 2 m apart; there is no separate tracking of weights or floor spots. Class capacity = number of in-service stations.
- Admin can mark a station out of service (e.g. a broken erg).

### Class types

- Name, duration (30/45/60), description, difficulty, alias (e.g. "90's theme workout").
- Optional free-text **"what to bring / expect"** note (e.g. "Bring water; we'll use 10–25 lb dumbbells"), shown to members when booking and on the class detail screen. Replaces the BRD's structured equipment list.

### Schedule management (Admin only)

- **Weekly templates:** a template defines a week of classes (day, time, class type, coach). Templates are saved and can be applied to any week at will, e.g. Template A for several weeks in a row, or alternating (weeks 1 and 3 get Template A, weeks 2 and 4 get Template B).
- **Applying a template only adds draft classes** (skipping exact duplicates). It never changes or removes existing classes, especially published ones.
- **Easy day and week editing:** edit, add, or remove classes for a single day or a whole week in one view.
- Drafts are published in bulk.
- **Published classes** change only by explicit edit or cancel:
  - Cancelling emails everyone booked or waitlisted.
  - Changing coach or time emails booked members; a time change lets them cancel without counting as a late cancel.
- **Schedule release rules** (Admin setting): controls how far ahead published classes become bookable (e.g. "14 days in advance" or a monthly batch release). **Default during the trial: no limits** — published classes are bookable immediately. The setting exists so the policy can be tightened if waitlists become unmanageable.

### Booking and waitlist

- Members see published classes, book one, and **pick a specific station** on a simple room map. They can switch to another free station until class starts. No limits on the number of bookings during the trial.
- **Waitlist:** first-in, first-out. When a spot frees up, the first person on the waitlist is automatically given it (the freed station), and notified. Automatic promotion stops **X minutes** before class (Admin setting); after that, freed spots are open to anyone.
- Members can cancel. Cancellations after a **late-cancel cutoff** (Admin setting) are recorded as late cancels.
- Front Desk / Admin (any class) and Coach (own classes) can remove a member from a class (which reopens the spot) and move members between stations.

### Check-in and attendance

- **Member self-check-in** in the app from **30 minutes before start to 5 minutes after start**. No location check.
- Staff can check members in, or **un-check-in** members who checked in remotely but didn't show up, at any time (no time window).
- **No-shows** (booked but not checked in) and late cancels are tracked and shown per member to staff only. **No automatic penalties** during the trial; staff handle repeat cases personally. This data is ready for R8's no-show charges.

### Notifications

- **Email only**, plus an in-app banner for the same events: invites, waitlist promotions, class cancellations, coach/time changes. No SMS. Push notifications arrive in R5.

### Workout data linked to classes

- A row captured on a member's phone during the scheduled time of a class they're checked in to is automatically tagged to that class. If the PM5's serial matches their booked station, it's tagged to that station too.
- This is stopgap behavior: from R3 the room hub captures in-class rows directly and this linking is retired for them. Outside class, members keep connecting their own phones as in R1.
- Gives members a real class history in R2 and keeps the station → PM5 serial mapping accurate, which is the foundation the room hub relies on in R3.

### Coach profiles

- Name, photo, short bio, certifications — shown to members when booking. Contact details visible to staff only. Class history is built automatically from past classes.

### Member app (extends R1)

- Landing page: next class (with the check-in button during its window), last class, today's classes.
- My schedule: upcoming classes, book and pick a station, switch station, join/leave a waitlist, cancel.
- Invite acceptance and waiver signing.

### Room hub (separate parallel effort)

- The room hub — a gym-owned device that connects to every PM5 in the room and records each row to the member booked at that station — is the eventual approach for in-class capture. It is designed in a separate parallel effort, out of scope here, and adopted in R3.
- Phone relay (members' phones streaming live data for room displays) was considered and not chosen. The R2 stopgap is not a phone relay: each phone only records its own member's row.

**Explicitly not in this release:** the room hub (separate parallel effort, adopted in R3), live class displays, coach console, gamification, push notifications, SMS, location-based check-in, booking limits (available as an Admin setting but off), tracking of dumbbells or other equipment, bulk booking, delegation, anything payment-related (R8).

**Exit criteria**
- Admin can build and publish a month of classes using saved weekly templates, including an alternating-week pattern.
- Invited members can accept, sign the waiver, book stations, join waitlists (with automatic promotion), and check in; attendance, no-shows, and late cancels are recorded accurately.
- Rows captured during classes are correctly linked to the class (and station where serials match).
