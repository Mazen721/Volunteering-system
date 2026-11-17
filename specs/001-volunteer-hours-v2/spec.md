# Feature Specification: MNU Volunteer Hours & Certificates System v2

**Feature Branch**: `001-volunteer-hours-v2`

**Created**: 2026-11-16

**Status**: Draft

**Input**: User description: "Build Volunteer Hours System v2 as defined in docs/PLAN-v2.md (extending docs/PLAN.md), delivered in phases V2-0 to V2-8. Authentication stays email + password with JWT (no OAuth, no external email service)..."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Multi-Role Access, Faculty Isolation & Dean Management (Priority: P1)

University administrators and faculty deans log in to manage volunteer records, activities, registrations, and official certificates according to their assigned authority. The administrator oversees the entire university, creates and manages dean accounts, and configures system-wide settings. Each dean is strictly locked to their own assigned faculty—managing only their faculty's volunteers, activities, exports, and certificates, while any attempt to view or modify records from another faculty is treated as non-existent.

**Why this priority**: Role-based access control and strict faculty isolation form the security and governance foundation required before opening the platform to faculty deans and self-registered volunteers.

**Independent Test**: Log in as the university administrator to create two dean accounts for two different faculties, verify each dean sees and manages only their own faculty's volunteers, activities, spreadsheets, and certificates, and confirm cross-faculty record lookups return not-found responses.

**Acceptance Scenarios**:

1. **Given** an authenticated university administrator, **When** they create, disable, enable, or reset the temporary password of a dean account for a specific faculty, **Then** the dean's access immediately reflects the updated account status and credentials on subsequent requests.
2. **Given** an authenticated dean assigned to Faculty A, **When** they view volunteer lists, activity logs, statistics, or export spreadsheets, **Then** only records belonging to Faculty A are returned, and any faculty value submitted in a creation or update request is forced to Faculty A.
3. **Given** an authenticated dean assigned to Faculty A, **When** they request, modify, or print a certificate for a volunteer or record belonging to Faculty B, **Then** the system responds with a not-found error rather than a permission error so cross-faculty records cannot be enumerated.
4. **Given** an authenticated dean or administrator, **When** they attempt to delete a volunteer who has recorded activities, opportunity applications, or a linked user account, **Then** the system blocks the deletion and displays a clear Arabic explanation.

---

### User Story 2 - Volunteer Self-Registration, Account Approval & Record Linking (Priority: P1)

Students and university staff (academic and administrative personnel) self-register for the volunteer portal by providing their university details, volunteer ID, affiliation category, faculty, and volunteering interests. Newly registered users wait on a dedicated pending screen until approved by their faculty's dean or the administrator. When approved, if a volunteer record with the same ID already exists from prior imports, the account automatically links to that existing record and preserves all historical hours.

**Why this priority**: Self-service onboarding and identity linking connect historical volunteer records to live user accounts while preventing duplicate identities and unauthorized access.

**Independent Test**: Submit a new registration using an existing imported volunteer ID and another using a brand-new ID, verify both accounts are restricted to the waiting screen until approved, confirm approval links the existing record with prior hours intact, and verify rejected accounts display the Arabic rejection reason.

**Acceptance Scenarios**:

1. **Given** an unauthenticated visitor on the registration page, **When** they submit valid registration details including email, password, full name, unique volunteer ID, category (`student`, `academic`, or `admin`), faculty, and at least one volunteering interest, **Then** a pending account is created and logging in routes them exclusively to the Arabic waiting screen while blocking all other portal features.
2. **Given** a pending registration whose volunteer ID matches an existing imported volunteer record in the same faculty, **When** the faculty dean or administrator approves the registration, **Then** the account becomes active, links to the existing volunteer record, and retains all previously recorded hours.
3. **Given** a pending registration whose volunteer ID matches an existing volunteer record with a different faculty, **When** the registration is reviewed, **Then** it is flagged with a faculty mismatch warning, only the university administrator can approve it, and upon approval the existing volunteer record's official faculty takes precedence.
4. **Given** a pending registration, **When** the faculty dean or administrator rejects the registration with an Arabic reason, **Then** the user remains restricted to the waiting screen and sees the exact Arabic rejection reason.
5. **Given** an existing active or pending account claiming a specific volunteer ID, **When** another registration attempts to use the same volunteer ID, **Then** the registration is rejected with an Arabic conflict message.

---

### User Story 3 - Volunteering Opportunities, Category Capacity & Waitlist Engine (Priority: P2)

Administrators and deans publish volunteering opportunities with event schedules, registration deadlines, credited hours, interest tags, and specific capacity slots per affiliation category (`student`, `academic`, `admin`). Approved volunteers apply before the deadline. In automatic approval mode, applicants are accepted immediately until their category's capacity is reached, after which subsequent applicants are placed on an ordered waitlist and automatically promoted if an accepted volunteer withdraws before the event starts.

**Why this priority**: Structured opportunity posting and concurrency-safe slot allocation automate volunteer recruitment and eliminate overbooking.

**Independent Test**: Publish an automatic-approval opportunity with limited category slots, submit concurrent applications exceeding capacity, verify exact slot fulfillment and waitlist ordering, and confirm that an accepted volunteer's withdrawal automatically promotes the earliest waitlisted applicant of the same category.

**Acceptance Scenarios**:

1. **Given** an opportunity in automatic approval mode with 2 student slots, **When** 5 eligible students apply simultaneously before the registration deadline, **Then** exactly 2 students are marked accepted, 3 are placed on the waitlist in application order, and the accepted counter equals 2.
2. **Given** a full automatic-approval opportunity with waitlisted applicants, **When** an accepted volunteer withdraws before the event start time, **Then** their slot is released and the longest-waiting applicant in that same category is automatically promoted to accepted, even if the registration deadline has already passed.
3. **Given** an opportunity that has at least one accepted applicant, **When** the organizer edits the opportunity, **Then** category slot limits cannot be reduced below the current accepted count for that category, and credited hours, event dates, and target faculty are locked against modification.
4. **Given** a volunteer who previously withdrew their application, **When** they re-apply before the registration deadline, **Then** their existing application record is reactivated with a refreshed timestamp placing them at the back of the waitlist; conversely, a volunteer whose application was rejected by the organizer is prevented from re-applying.
5. **Given** an all-faculty opportunity posted by the administrator, **When** a faculty dean views the opportunity's applicants, **Then** the dean has a read-only view filtered strictly to applicants from their own faculty.

---

### User Story 4 - Smart Recommendations & Student Volunteer Portal (Priority: P2)

Active volunteers browse a personalized opportunity board that ranks open events according to their selected volunteering interests, faculty targeting, upcoming deadlines, remaining slot scarcity, and past attendance history. Volunteers track their approved hours, progress toward the university certificate threshold, active applications, and certificate eligibility status on their personal dashboard without ever having direct access to generate or print certificates.

**Why this priority**: Personalized discovery increases volunteer participation in relevant university initiatives while transparent progress tracking motivates students toward certificate completion.

**Independent Test**: Log in as an active volunteer with specific interests and past attendance, verify the opportunity feed ranks matching events highest with Arabic match badges, and confirm the student dashboard accurately displays certificate eligibility without exposing certificate printing or downloading.

**Acceptance Scenarios**:

1. **Given** an active volunteer viewing recommended opportunities, **When** the system ranks available published events, **Then** each event is scored by adding 10 points per matched interest, 3 points if targeted specifically at the volunteer's faculty, 2 points if the deadline is within 3 days, 1 point if 25% or fewer category slots remain, and 1 point per past attended event in the same field (up to 3 points), breaking ties by earliest start time.
2. **Given** the recommended opportunities list, **When** displayed to the volunteer, **Then** already-applied, cancelled, and registration-closed events are excluded from top recommendations, full events appear last with a "Join Waitlist" badge, and matched interests appear as Arabic badges on each card.
3. **Given** an active volunteer whose approved hours reach or exceed the configured certificate threshold, **When** they view their dashboard, **Then** they see zero remaining hours, a 100% progress bar, and an Arabic badge instructing them to collect their certificate from their faculty, with no option or route to open, print, or download the certificate.

---

### User Story 5 - Live Event Check-in & Idempotent Hour Crediting (Priority: P2)

During a live event (from 30 minutes before start until the end time), the organizer displays a rotating QR code on the live management screen and monitors real-time attendance counters, with the ability to check attendees in manually. Accepted volunteers see a "Happening Now" banner on their dashboard and check in by scanning the live QR code. Once the event ends, the organizer marks the opportunity as completed, which automatically and idempotently credits approved volunteer hours to all checked-in attendees and records non-attendees as no-shows with zero hours.

**Why this priority**: Live rotating QR verification prevents remote attendance fraud, and automated completion eliminates manual data entry for large university events.

**Independent Test**: Open the live organizer view during an event's active check-in window, check in one accepted volunteer via rotating QR token and another via manual toggle while leaving a third unchecked, complete the event after its end time twice, and verify that attended volunteers receive their approved hours exactly once while the absent volunteer receives zero hours.

**Acceptance Scenarios**:

1. **Given** an accepted volunteer during the check-in window (30 minutes before start until event end in Cairo time), **When** they submit a valid rotating check-in code (valid for ~45 seconds), **Then** their attendance is recorded with a timestamp and live organizer counters update immediately.
2. **Given** a check-in attempt using an expired QR code, a code from a different opportunity, by a non-accepted volunteer, outside the check-in window, or after event completion, **Then** the system rejects the check-in with a clear Arabic error message.
3. **Given** a published opportunity whose end time has passed, **When** the organizer completes the event, **Then** every accepted attendee who checked in is granted an approved activity record for the event's hours, unchecked accepted applicants remain recorded as no-shows with zero hours, and check-in is permanently closed.
4. **Given** an already completed opportunity, **When** the completion action is triggered a second time, **Then** the operation succeeds as a safe no-op without duplicating activity records or volunteer hours.

---

### User Story 6 - Role-Based Analytics Dashboards & Production Readiness (Priority: P3)

Deans and administrators monitor volunteering performance through Arabic RTL visual dashboards featuring key performance indicators, participation funnels, engagement breakdowns, monthly approved hour trends, certificate progress buckets, and faculty comparisons. The system enforces rate limits on sensitive actions and includes comprehensive demo data covering all roles and event states for immediate walkthrough verification.

**Why this priority**: Actionable analytics give faculty leadership visibility into student engagement and event efficiency, while rate limiting and rich seed data ensure safe deployment and end-to-end demonstrability.

**Independent Test**: Compare the dean dashboard for a specific faculty against the administrator dashboard filtered to that same faculty to verify identical figures, inspect responsive RTL chart rendering at mobile width (375px), and execute a full walkthrough using seeded demo accounts.

**Acceptance Scenarios**:

1. **Given** the dean dashboard for Faculty X and the administrator dashboard filtered to Faculty X, **When** comparing KPI totals, participation funnel counts, monthly hours, and certificate progress buckets, **Then** all numbers match identically and reflect only approved volunteer hours.
2. **Given** any dashboard viewed on a 375px mobile screen, **When** charts and widgets render in RTL mode, **Then** all labels, tooltips, empty states, loading states, and error states are displayed entirely in Arabic with `ar-EG` number and date formatting.
3. **Given** repeated rapid requests to login, registration, or QR check-in from the same client, **When** the rate threshold is exceeded, **Then** subsequent attempts are throttled with an Arabic rate-limit message.
4. **Given** a freshly seeded demo environment, **When** an evaluator logs in with the provided demo credentials, **Then** they find an administrator, faculty deans, approved and pending students, and opportunities in upcoming, live, and completed states ready for an end-to-end walkthrough ending with certificate printing by a dean or administrator.

---

### Edge Cases

- **Concurrent applications for the final category slot**: Only the exact number of available slots are accepted; simultaneous excess applicants are deterministically placed on the waitlist without ever pushing accepted counts above slot capacity.
- **Cancelling an opportunity that already has accepted applicants**: All active applications transition to cancelled, accepted slot counters reset to zero, and applicants see the cancelled status on their portal.
- **Accepting or rejecting an already-accepted applicant in manual/organizer management**: Moving an accepted applicant to rejected or waitlisted immediately decrements the accepted slot counter for their category so capacity counters never drift from actual accepted applications.
- **Completing an event early or on a cancelled/draft opportunity**: Attempting to complete an opportunity before its scheduled end time or while in draft/cancelled status is rejected with a conflict message.
- **Two pending registrations claiming the same volunteer ID simultaneously**: The system prevents duplicate pending claims on the same volunteer ID, while still allowing multiple pending registrations that do not yet link to an existing volunteer record to coexist cleanly.
- **Disabling an active dean or student account mid-session**: Because user status and faculty assignment are verified fresh on every request, a disabled user is immediately blocked with a forbidden response on their very next action (except checking their own session status).
- **Zero-slot categories on an opportunity**: If an opportunity sets `0` slots for a category (e.g., `academic: 0`), volunteers of that category cannot apply even if other categories have open slots.

## Requirements *(mandatory)*

### Functional Requirements

#### Codebase & Localization Baseline (Phase V2-0)
- **FR-001**: All application source and test files across the backend and frontend MUST be strictly type-checked with zero implicit `any` types and zero behavioral regressions against existing v1 functionality.
- **FR-002**: The entire user interface, including all labels, buttons, placeholders, notifications, empty/loading/error states, validation messages, API error responses, chart labels/tooltips, and spreadsheet headers, MUST be rendered in Arabic (`dir="rtl"`, `lang="ar"`) with `ar-EG` date and numeral formatting.
- **FR-003**: All stored timestamps MUST use UTC, while all event lifecycle phases (`upcoming`, `registration_closed`, `in_progress`, `ended`) and check-in windows MUST be evaluated in the `Africa/Cairo` timezone.

#### Roles, Registration & Access Control (Phases V2-1 to V2-3)
- **FR-004**: The system MUST support three login roles (`admin`, `dean`, `student`) authenticated via email and password, verifying the user's current account status (`pending`, `active`, `rejected`, `disabled`) and faculty assignment fresh on every request. Session logout MUST be handled client-side by discarding credentials without a server logout endpoint.
- **FR-005**: Users with `pending`, `rejected`, or `disabled` status MUST receive a `403` forbidden response on every protected action except retrieving their own session profile.
- **FR-006**: Self-registration MUST collect email, password, full name, volunteer ID, affiliation category (`student`, `academic`, `admin`), faculty, and at least one volunteering interest from the 9 supported interest domains (`medical`, `agriculture_environment`, `education`, `charity_community`, `technology`, `sports`, `arts_culture`, `awareness_campaigns`, `event_organizing`).
- **FR-007**: A `volunteerId` MUST belong to at most one user account across active and pending registrations. If a matching volunteer record already exists (such as from a spreadsheet import), approving the registration MUST link the user account to that existing volunteer record and preserve all prior hours.
- **FR-008**: If a registering user selects a faculty different from the existing volunteer record's faculty for that `volunteerId`, the registration MUST be flagged with a faculty mismatch warning, restricted to `admin`-only approval, and upon approval MUST retain the existing volunteer record's official faculty.
- **FR-009**: A `dean` MUST be restricted to their assigned faculty across all views, mutations, statistics, spreadsheet exports, registration approvals, student password resets, and certificate printing; any faculty value supplied in a dean's request payload MUST be ignored and overwritten with the dean's assigned faculty, and any attempt to access a resource belonging to another faculty MUST return a `404` not-found response. Multiple dean accounts per faculty MUST be supported.
- **FR-010**: Only `admin` may create, enable, disable, or reset passwords for `dean` accounts, import spreadsheets across faculties, or modify global settings (`certificateHours`). Both `admin` (for any faculty) and `dean` (for their own faculty) may reset a student's password using a temporary password.
- **FR-011**: Deleting a volunteer record MUST be blocked if the volunteer has any recorded activities, opportunity applications, or a linked user account.
- **FR-012**: Certificate viewing and printing MUST be restricted strictly to `admin` (any faculty) and `dean` (own faculty); `student` accounts MUST receive a `403` response on any certificate endpoint and MUST NOT have a certificate view or print route.

#### Opportunities & Applications Engine (Phase V2-4)
- **FR-013**: Administrators and deans MUST be able to create, edit, publish, and cancel volunteering opportunities containing title, description, requirements, interest fields (at least one), activity type, location (name, address, optional map URL), start and end times (`endAt > startAt`), registration deadline (`<= startAt`), credited hours (`> 0`), contact details, target faculty (`null` for all faculties [admin only], or a specific faculty), category slot limits (`student`, `academic`, `admin` with at least one `> 0`), and approval mode (`auto` or `manual`).
- **FR-014**: Once an opportunity has at least one accepted application, category slot limits MUST NOT be lowered below that category's current accepted count, and credited hours, start time, end time, and target faculty MUST be locked. Completed or cancelled opportunities MUST be read-only.
- **FR-015**: An active `student` user may apply to an opportunity only if it is `published`, the current time is before `registrationDeadline`, the opportunity targets their faculty or all faculties, their affiliation category has at least 1 allocated slot, and they do not have an existing `pending`, `accepted`, `waitlisted`, or `rejected` application for that opportunity.
- **FR-016**: In `auto` approval mode, applying MUST atomically claim an open category slot and mark the application `accepted`, or place the application in `waitlisted` status if the category is full. In `manual` mode, applications start as `pending` until the organizer accepts (atomically claiming a slot, or returning a conflict if full), rejects, or waitlists them.
- **FR-017**: Whenever an `accepted` application leaves the `accepted` state (via volunteer withdrawal before `startAt`, organizer status change, or opportunity cancellation), its category slot counter MUST be decremented atomically. In `auto` mode, when an accepted volunteer withdraws before `startAt`, the earliest waitlisted applicant of the same category (`appliedAt` ascending) MUST be automatically promoted to `accepted`.
- **FR-018**: A volunteer who withdrew (`cancelled` application) and re-applies before the deadline MUST reactivate their existing application record with a refreshed `appliedAt` timestamp (placing them at the back of the waitlist). A volunteer whose application was `rejected` MUST NOT be allowed to re-apply.
- **FR-019**: Deans MUST have full applicant management over opportunities they posted for their faculty, and a read-only view of applicants belonging to their faculty on all-faculty opportunities posted by the administrator.

#### Student Portal & Recommendations (Phase V2-5)
- **FR-020**: When browsing recommended opportunities, the system MUST rank eligible published events for the student using the deterministic formula: `+10` per matching interest field, `+3` if targeted specifically at the student's faculty, `+2` if the registration deadline is within 3 days, `+1` if `<= 25%` of the student's category slots remain open, and `+1` per past attended event in the same interest field (maximum `+3`), breaking ties by earliest `startAt`.
- **FR-021**: The recommended opportunities response MUST exclude already-applied, cancelled, and registration-closed opportunities from top results, place full opportunities at the bottom with a waitlist indicator, and return the list of matched interest keys for each opportunity.
- **FR-022**: Active volunteers MUST be able to view and update their volunteering interests and change their password from their profile page.

#### Live Check-in & Event Completion (Phase V2-6)
- **FR-023**: During an opportunity's check-in window (from 30 minutes before `startAt` until `endAt` in `Africa/Cairo`), the organizer live view MUST generate a signed rotating check-in token valid for ~45 seconds (refreshed every 30 seconds), display live counters (`accepted`, `checkedIn`, `notArrived`), and allow manual attendance toggling.
- **FR-024**: Accepted volunteers MUST see a "Happening Now" banner on their dashboard during the check-in window and be able to record their attendance by submitting a valid rotating check-in token for that opportunity before the event is completed.
- **FR-025**: Completing an opportunity MUST only be permitted when its status is `published` (or already `completed`) and the current time is past `endAt`. Completion MUST transition the opportunity to `completed`, close all check-in actions, idempotently create one `approved` activity record (`hours = opportunity.hours`) per accepted attendee who checked in, and leave unchecked accepted applicants with `attended: false` and `0` hours granted.

#### Dashboards, Security & Seed Data (Phases V2-7 & V2-8)
- **FR-026**: Only `approved` activity hours MUST count toward volunteer hour totals, leaderboard rankings, dashboard charts, and certificate eligibility (`approvedHours >= Settings.certificateHours`).
- **FR-027**: The system MUST provide role-specific dashboards for Student (hours, remaining hours to certificate, progress bar, eligibility badge, live banner, upcoming events, active applications, recommendations, recent activities), Dean (faculty-scoped KPIs, participation funnel, engagement donut, monthly hours line chart, certificate progress buckets relative to `Settings.certificateHours`, top events/volunteers, zero-hour students, approvals shortcut), and Admin (all dean metrics university-wide, faculty comparison chart, slot fill rate and no-show rate per completed opportunity, dean account and global approvals overview).
- **FR-028**: Every metric on a Dean's dashboard for a given faculty MUST equal the corresponding metric on the Admin dashboard when filtered to that same faculty.
- **FR-029**: The system MUST apply HTTP security headers (`helmet`), enforce configurable rate limiting on login, registration (default 20 requests per 15-minute window), and QR check-in requests (default 30 requests per 1-minute window), validate password strength (minimum 8 characters), and support an optional allowed-email-domain restriction (`ALLOWED_EMAIL_DOMAINS`).
- **FR-030**: The seed process MUST populate comprehensive demo data including the administrator, deans for faculties, approved and pending students, and opportunities in upcoming, live, and completed states to support a complete end-to-end verification walkthrough.

### Key Entities

- **User**: Represents a platform account (`admin`, `dean`, or `student`) with email, password credentials, full name, role, account status (`pending`, `active`, `rejected`, `disabled`), faculty assignment, volunteering interests, approval/rejection metadata, temporary registration payload (`volunteerId`, `category`, `faculty`, `facultyMismatch`), and an optional one-to-one link to a `Volunteer` record.
- **Volunteer**: Represents an individual's official university volunteering profile (`volunteerId`, full name, faculty, affiliation category `student | academic | admin`, contact info, and accumulated hours derived from approved activities).
- **Opportunity**: Represents a scheduled volunteering event posted by an administrator or dean, including descriptive details, interest fields, activity type, location, schedule (`startAt`, `endAt`, `registrationDeadline`), credited hours, target faculty (`null` or specific faculty), category slot capacities (`slots`), atomic accepted counters (`acceptedCounts`), approval mode (`auto` or `manual`), and lifecycle status (`draft`, `published`, `cancelled`, `completed`).
- **Application**: Represents a volunteer's application to an opportunity, recording the applicant's snapshot faculty and category, application status (`pending`, `accepted`, `waitlisted`, `rejected`, `cancelled`), application timestamp (`appliedAt` used for waitlist ordering), decision metadata, check-in status (`attended`, `checkedInAt`), and `hoursGranted`.
- **Activity**: Represents a volunteer hour log entry (`pending`, `approved`, `rejected`), extended with optional links to the originating `Opportunity` and unique `Application` so completed events credit hours idempotently without duplication.
- **Settings**: Stores university-wide configuration, notably the dynamic `certificateHours` threshold required for certificate eligibility.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of cross-faculty data access or mutation attempts by a dean return a not-found (`404`) response, and 100% of certificate access attempts by a student account are blocked (`403`), with zero data leakage across faculties.
- **SC-002**: Under concurrent application spikes (e.g., 50 simultaneous applications for an opportunity with 10 category slots), accepted applications never exceed the configured category slot limit (`acceptedCounts == 10`), and waitlist promotion upon withdrawal preserves strict first-in, first-out ordering.
- **SC-003**: Triggering event completion multiple times on a finished opportunity produces zero duplicate activity records and credits the exact event hours once to 100% of checked-in attendees while granting 0 hours to no-shows.
- **SC-004**: 100% of dashboard metrics (approved hours, volunteer counts, participation funnel stages, and certificate progress buckets) on a faculty dean's view match the university administrator's view when filtered to that faculty.
- **SC-005**: 100% of user-facing screens, charts, notifications, error messages, and exported spreadsheets render in Arabic RTL layout and remain readable and operable down to a 375px mobile viewport width.
- **SC-006**: Every delivery phase (V2-0 through V2-8) passes 100% of automated linting, strict compile-time type checks, backend integration tests, and frontend component/workflow tests before advancing.

## Assumptions

- Authentication relies exclusively on local email and password credentials with signed session tokens; external identity providers (such as Microsoft OAuth) and external email/SMTP servers are intentionally out of scope.
- Password resets are performed administratively: the administrator generates temporary passwords for deans or students, and deans generate temporary passwords for students within their own faculty.
- University staff members in the `academic` and `admin` affiliation categories who wish to volunteer self-register using the `student` login role (the volunteer portal) and apply for slots designated for their respective category.
- Official volunteer certificates are printed or issued physically/administratively by the faculty dean or university administrator; students only view their eligibility badge and remaining hour balance online.
- Optional email domain restrictions (`ALLOWED_EMAIL_DOMAINS`) default to unrestricted in local/demo environments so evaluators can test with arbitrary demo email addresses, while remaining configurable for production university domains.
