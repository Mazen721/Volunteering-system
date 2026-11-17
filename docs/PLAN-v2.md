# Volunteer Hours System v2 — Implementation Plan

**Full TypeScript Migration · Dean Accounts · Student Accounts · Opportunities · Live Check-in · Dashboards**

Extends `docs/PLAN.md` (phases 0–8). Drafted 2026-11-16.

**Terminology:**
- **Admin:** The existing single university-wide admin account.
- **Dean:** One (or more) account(s) per faculty (medicine, nursing, dentistry, engineering, …), strictly locked to that faculty.
- **Student:** A self-registered volunteer account (own data only).
- **Note on Categories vs. Roles:** The existing volunteer category values (`student | academic | admin`) describe the person's university affiliation, not their login role. In this plan, **"staff"** means the `academic` and `admin` volunteer categories. Staff members who self-register use the `student` login role (the self-service volunteer portal).

---

## 1. What is New in v2

1. **100% TypeScript Codebase (`server/` & `client/`):** Migrate the entire project from JavaScript (`.js`/`.jsx`) to strict TypeScript (`.ts`/`.tsx`) with `"strict": true` before building v2 features, ensuring compile-time safety across roles, scopes, Mongoose models, Zod schemas, and React components.
2. **Three Login Roles Instead of One:** `Admin` (university-wide), `Dean` (locked to one faculty), and `Student` (own data only). Authentication is strictly local email + password with JWT.
3. **Student Self-Registration & Approval Workflow:** Students register at `/register` and remain `pending` until approved by the dean of their faculty (or the admin). Existing volunteer records (e.g. from Excel imports) are automatically linked by `volunteerId`.
4. **Volunteering Opportunities & Capacity Engine:** Admin or a Dean posts a volunteering opportunity (e.g. a medical convoy on Saturday) with full details and slot capacity per category (`student`, `academic`, `admin`). Students apply, and either the system auto-accepts them atomically until full (then waitlists) or the organizer manually reviews applications.
5. **Interests Checklist & Smart Recommendations:** Students choose their volunteering interests at sign-up (and in their profile), which the server uses to rank recommended opportunities for each student.
6. **Live Mode & Rotating QR Check-in:** During an active event, organizers display a rotating QR code (valid ~45 seconds) and manage live attendance. Completed events automatically credit approved volunteer hours to attendees who checked in.
7. **Three Role-Based Dashboards:** Dedicated dashboards for Admin, Dean, and Student featuring Recharts analytics, participation funnels, and progress insights.

---

## 2. Roles and Permissions

### Admin
- Sees and edits everything across every faculty: volunteers, activities, accounts, opportunities, and statistics.
- Creates, disables, enables, and resets passwords for Dean accounts.
- Approves or rejects any new student account across any faculty, and resets student passwords when needed.
- Imports and exports Excel across all faculties, and updates system settings (`certificateHours`).
- Opens and prints certificates for any eligible volunteer in any faculty.
- Posts opportunities for a single faculty or for all faculties (`faculty: null`).

### Dean (own faculty only — always taken from the authenticated DB account, never from the request)
- Sees only the volunteers, activities, statistics, registrations, and applications belonging to their faculty.
- Adds and edits volunteers in their faculty (the `faculty` field is forced to the dean's faculty on the server). Deletes a volunteer only if they have no activities, no applications, and no linked `User` account.
- Adds, edits, and approves/rejects activities for their faculty's volunteers.
- Approves or rejects new student accounts belonging to their faculty, and can reset passwords for students in their faculty with a temporary password.
- Posts opportunities for their own faculty and manages applicants on the opportunities they posted. Has a read-only view of their faculty's applicants on Admin-posted (`faculty: null`) opportunities.
- Exports Excel for their faculty only. No Excel import, no global settings access.
- Opens and prints certificates for eligible volunteers belonging to their faculty.

### Student (own data only)
- Views and manages their own profile, interests, approved/pending hours, activities, and applications.
- Browses published opportunities visible to them (their faculty or all faculties), applies, withdraws, and checks in during live events.
- Sees their certificate eligibility status (`approvedHours >= Settings.certificateHours`) but **cannot open, print, or download a certificate** — certificates are issued and printed only by their faculty's Dean or the Admin.
- Cannot view or query any other volunteer's data.

---

## 3. Data Model & TypeScript Schema Changes

### User (`server/src/models/User.ts` — replaces `Admin`; existing admin is migrated to `role: 'admin'`)
- `email`: `string` (unique, lowercase, trimmed)
- `passwordHash`: `string`
- `fullName`: `string`
- `role`: `'admin' | 'dean' | 'student'`
- `faculty`: `string | null` (required for `dean`, copied from the volunteer record for `student`, `null` for `admin`)
- `status`: `'pending' | 'active' | 'rejected' | 'disabled'`
- `volunteer`: `Types.ObjectId | null` (ref to `Volunteer`, set for students on approval). **Partial unique index** `{ unique: true, partialFilterExpression: { volunteer: { $type: 'objectId' } } }` — a `sparse` index is NOT used because sparse indexes still index explicit `null` values and would reject the second pending user.
- `registration`: `{ volunteerId: string; category: 'student' | 'academic' | 'admin'; faculty: string; facultyMismatch: boolean } | null` (captured at sign-up and used until approval). Partial unique index on `registration.volunteerId` for non-rejected users so two pending accounts can never claim the same ID.
- `interests`: `InterestKey[]` (array of interest keys)
- `approvedBy`: `Types.ObjectId | null` (ref to `User`)
- `approvedAt`: `Date | null`
- `rejectionReason`: `string | null`
- `lastLoginAt`: `Date | null`

**Interest Keys (`INTEREST_KEYS` constant list, with Arabic labels in `client/src/constants/ar.ts`):**
`medical`, `agriculture_environment`, `education`, `charity_community`, `technology`, `sports`, `arts_culture`, `awareness_campaigns`, `event_organizing`.

### Opportunity (`server/src/models/Opportunity.ts`)
- `title`: `string`
- `description`: `string`
- `requirements`: `string`
- `fields`: `InterestKey[]` (at least one interest key)
- `activityType`: one of the existing 10 `ACTIVITY_TYPES` (becomes `Activity.type` when hours are credited)
- `location`: `{ name: string; address: string; mapUrl?: string }`
- `startAt`: `Date`
- `endAt`: `Date`
- `registrationDeadline`: `Date`
- `hours`: `number` (hours credited per attendee, `> 0`)
- `contactName`: `string`
- `contactPhone`: `string`
- `contactEmail`: `string`
- `faculty`: `string | null` (`null` means open to all faculties; otherwise restricted to one faculty)
- `slots`: `{ student: number; academic: number; admin: number }` (`0` means closed to that category; e.g., 5 students and 3 staff)
- `acceptedCounts`: `{ student: number; academic: number; admin: number }` (same shape as `slots`, maintained atomically)
- `approvalMode`: `'auto' | 'manual'`
- `status`: `'draft' | 'published' | 'cancelled' | 'completed'`
- `createdBy`: `Types.ObjectId` (ref to `User`)
- **Validation Rules:** `endAt > startAt`, `registrationDeadline <= startAt`, at least one category slot `> 0`, `hours > 0`, `startAt` not in the past at creation.
- **Edit Rules:** Once an opportunity has any `accepted` application, `slots.<cat>` can never be lowered below `acceptedCounts.<cat>`, and `hours`, `startAt`, `endAt`, and `faculty` are locked. A `completed` or `cancelled` opportunity is read-only.
- **Computed Phase (not stored in DB, always evaluated in `Africa/Cairo` time):** `upcoming` → `registration_closed` → `in_progress` → `ended`.

### Application (`server/src/models/Application.ts`)
- `opportunity`: `Types.ObjectId` (ref to `Opportunity`)
- `volunteer`: `Types.ObjectId` (ref to `Volunteer`)
- `user`: `Types.ObjectId` (ref to `User`)
- `faculty`: `string` (denormalized copy of the volunteer's faculty at apply time, used for dean scoping and stats)
- `category`: `'student' | 'academic' | 'admin'` (copied from the volunteer at apply time, used for slot accounting)
- `status`: `'pending' | 'accepted' | 'waitlisted' | 'rejected' | 'cancelled'`
- `note`: `string` (optional message from the applicant)
- `decidedBy`: `Types.ObjectId | null` (ref to `User`)
- `decidedAt`: `Date | null`
- `attended`: `boolean` (default `false`)
- `checkedInAt`: `Date | null`
- `hoursGranted`: `number` (default `0`)
- `appliedAt`: `Date` (set on apply and refreshed on re-apply; used for waitlist order)
- **Indexes:** Unique compound index on `(opportunity, volunteer)`; index on `(opportunity, status, category, appliedAt)`; index on `(faculty, status)`.
- **Re-applying:** Because of the unique index, a volunteer who withdrew (`cancelled`) and applies again **reactivates the same Application document** (status re-evaluated, `appliedAt` refreshed so they join the back of the waitlist) instead of inserting a new one. Rejected applicants cannot re-apply.

### Activity (`server/src/models/Activity.ts` — small extension)
- Add optional `opportunity` (`Types.ObjectId`, ref to `Opportunity`) and `application` (`Types.ObjectId`, ref to `Application`) fields.
- Add a **partial unique index** on `application` (`{ unique: true, partialFilterExpression: { application: { $type: 'objectId' } } }`) so completing an event twice can never create duplicate hours.

### Faculty Scoping of Models Without a `faculty` Field
`Volunteer`, `Opportunity`, and `Application` carry `faculty` directly. `Activity` does not, so dean-scoped activity queries resolve through the volunteer: plain queries use `{ volunteer: { $in: await Volunteer.distinct('_id', scope) } }`, and aggregations use a `$lookup` on `volunteers` followed by `$match` on `volunteer.faculty`. A helper `scopeActivities(scope)` encapsulates this so no route builds it by hand.

---

## 4. Authentication, Registration, and Approval

### Student Registration Flow
1. Student opens `/register` and submits: `email`, `password`, `fullName`, `volunteerId` (student/staff ID), `category` (`student | academic | admin`), `faculty`, and at least one `interest`.
2. Server validates input with Zod. It rejects any `volunteerId` already linked to another `User` **or already used by another pending/active registration**. If a `Volunteer` document with that `volunteerId` already exists (for example, imported previously from Excel), the server compares the `faculty` and sets `registration.facultyMismatch = true` on a mismatch.
3. A `User` is created with `status: 'pending'`. The student can log in, but the UI routes them exclusively to `/pending` ("Waiting for approval"). Every API route other than `GET /api/auth/me` returns `403` with an Arabic message. (Logout is client-side: the token is discarded; there is no logout endpoint.)
4. The dean of the faculty the student **selected at registration** (or the admin) views the request in the `/approvals` page, sees a mismatch warning when flagged, and either approves it or rejects it with a `rejectionReason`.
5. On approval, the server either creates the `Volunteer` record or links the existing `Volunteer` record, sets `status: 'active'` and `faculty`, and unlocks the full student portal. **On a faculty mismatch, the existing `Volunteer.faculty` wins** (the official record); only the Admin can approve a mismatched request, and may correct the volunteer's faculty first.

### Dean Accounts & Passwords
- **Dean accounts:** Created only by the Admin (`email`, `fullName`, `faculty`, temporary `password`). A faculty may have more than one dean account if needed.
- **Passwords:** No external email service is required. Admin resets dean passwords with a temporary password, and either the faculty's Dean or the Admin can reset a student's password with a temporary password.

### Middleware & Scoping (`server/src/middleware/auth.ts`)
- **JWT payload:** `{ sub: string, role: UserRole }`. The authentication middleware reloads the `User` from MongoDB on every request so a disabled account or updated faculty takes effect immediately.
- **Role Guard:** `requireRole(...roles: UserRole[])` restricts route access.
- **Faculty Scope Helper:** `buildScope(user: IUser): ScopeFilter` returns `{}` for `admin` and `{ faculty: user.faculty }` for `dean`. All service functions accept `scope: ScopeFilter` in their TypeScript signature.
- **Anti-Enumeration:** Accessing a resource by ID outside the dean's faculty scope returns `404 Not Found` (never `403 Forbidden`) so resource existence is not leaked.
- **Forced Faculty:** On any create or update request by a dean, any `faculty` field in the request body is ignored and overwritten with `req.user.faculty`.

### Security Hardening
- Rate limiting (`express-rate-limit`) on login, registration, and QR check-in endpoints.
- HTTP security headers via `helmet`.
- Password strength/length validation via Zod.
- Optional `ALLOWED_EMAIL_DOMAINS` environment variable (empty in demo mode, configurable to the university domain in production).

---

## 5. API Surface

### Auth
- `POST /api/auth/register` (public)
- `POST /api/auth/login` (public)
- `GET /api/auth/me` (authenticated — works for `pending`/`rejected` too)
- `PATCH /api/auth/me` (active users — update interests, change password)

### Users (Admin, plus Dean for student password reset)
- `GET /api/users?role=dean` (admin)
- `POST /api/users` (admin — create dean account)
- `PATCH /api/users/:id` (admin — disable, enable, reset dean/student password; dean — reset password for student in own faculty)

### Registrations (Dean, Admin)
- `GET /api/registrations?status=pending` (scoped by faculty for dean)
- `POST /api/registrations/:userId/approve` (scoped by faculty for dean)
- `POST /api/registrations/:userId/reject` (scoped by faculty for dean, requires `rejectionReason`)

### Opportunities & Applications
- `GET /api/opportunities` (student: published & visible to them, supports `sort=recommended`; dean/admin: scoped list with filters)
- `GET /api/opportunities/:id`
- `POST /api/opportunities` (dean/admin)
- `PATCH /api/opportunities/:id` (poster/admin)
- `POST /api/opportunities/:id/publish` (poster/admin)
- `POST /api/opportunities/:id/cancel` (poster/admin)
- `POST /api/opportunities/:id/complete` (poster/admin — idempotent)
- `POST /api/opportunities/:id/apply` (active student)
- `DELETE /api/opportunities/:id/apply` (active student — withdraw)
- `GET /api/opportunities/:id/applications` (poster/admin, or read-only faculty-filtered view for dean on admin opportunities)
- `PATCH /api/applications/:id` (poster/admin — accept, reject, waitlist)
- `GET /api/opportunities/:id/checkin-token` (poster/admin — rotating ~45s signed token)
- `POST /api/opportunities/:id/checkin` (accepted student — validates rotating token & time window)
- `POST /api/opportunities/:id/checkin/manual` (poster/admin — manual attendance toggle)
- `GET /api/opportunities/:id/live` (poster/admin — live counters and attendee list)

### Stats (all scoped by role via `buildScope`)
- Existing: `GET /api/stats/overview`, `GET /api/stats/faculties`, `GET /api/stats/categories`, `GET /api/stats/leaderboard`
- New: `GET /api/stats/participation`, `GET /api/stats/events`, `GET /api/stats/monthly-hours`, `GET /api/stats/me`

### Existing Routes (Volunteers, Activities, Excel, Settings)
- Keep existing paths (`/api/volunteers`, `/api/activities`, `/api/excel`, `/api/settings`), add strict TypeScript types, `requireRole` guards, and `buildScope` filtering.

---

## 6. Opportunities in Detail

### Lifecycle
`draft` → `published` → *(registration closes at `registrationDeadline`)* → *(in progress between `startAt` and `endAt`)* → *(ended after `endAt`)* → `completed` (hours credited). Cancellation (`cancelled`) is allowed anytime before `completed`.

### Eligibility to Apply
An active `student` user may apply if:
1. Opportunity `status === 'published'`.
2. Current time is before `registrationDeadline`.
3. `opportunity.faculty === null` or `opportunity.faculty === volunteer.faculty`.
4. `opportunity.slots[volunteer.category] > 0`.
5. No existing `pending`, `accepted`, or `waitlisted` application for `(opportunity, volunteer)`, and no `rejected` one (a `cancelled` one is reactivated).

### Approval Modes & Atomic Slot Claim
- **`auto` mode:** The application is immediately `accepted` if a category slot is available; otherwise it becomes `waitlisted`.
- **`manual` mode:** The application starts as `pending` until the organizer accepts or rejects it. Accepting an application also requires claiming an available category slot atomically.
- **Atomic Slot Claim (Concurrency-Safe):**
  Executed via a single MongoDB `findOneAndUpdate` on `Opportunity`:
  - Filter: `{ _id: opportunityId, status: 'published', $expr: { $lt: ["$acceptedCounts.<cat>", "$slots.<cat>"] } }`
  - Update: `{ $inc: { "acceptedCounts.<cat>": 1 } }`
  - If matched, the application status becomes `accepted`; otherwise `waitlisted` (in `auto` mode) or returns a `409` conflict (when manually accepting on a full category).
- **Withdrawal & Waitlist Promotion:**
  When an `accepted` student withdraws before `startAt`, decrement `acceptedCounts.<cat>`. In `auto` mode, immediately find the oldest `waitlisted` application of the same category (`sort: { appliedAt: 1 }`), claim the slot, and promote it to `accepted`. Promotion continues after `registrationDeadline` and stops at `startAt`.
- **Releasing Slots (all paths):** Every transition out of `accepted` — withdrawal, organizer rejection/waitlisting of an accepted applicant, or opportunity cancellation — decrements `acceptedCounts.<cat>` in the same operation, so counters always equal the number of `accepted` applications.

### Live Mode & Rotating QR Check-in
- **Check-in Window:** From 30 minutes before `startAt` until `endAt` (evaluated in `Africa/Cairo`).
- **Student Experience:** Accepted students see a "Happening Now" (يجري الآن) banner on their dashboard (`/me`) with location, contact details, remaining time, and a check-in action.
- **Organizer Live View (`/opportunities/:id/live`):** Displays a rotating QR code (`qrcode.react`), real-time counters (`accepted`, `checkedIn`, `notArrived`), and the attendee table with a manual check-in toggle, polling every 10 seconds.
- **Rotating QR Token:** A signed JWT/HMAC token containing `{ opportunityId, type: 'checkin', exp }` valid for ~45 seconds and refreshed automatically every 30 seconds by the live page so screenshots cannot be shared remotely.

### Completing the Event (`POST /api/opportunities/:id/complete`)
- **Preconditions:** Allowed only when `status === 'published'` (or already `completed`, which is a no-op) and the current time is after `endAt`. Rejected with `409` on `draft`/`cancelled` or before `endAt`. Check-in (QR and manual) is closed once the opportunity is `completed`.
- **Idempotent execution:** For each application with `status: 'accepted'` and `attended: true`, upserts/creates an `approved` `Activity` (`volunteer: application.volunteer`, `title`, `type: opportunity.activityType`, `hours: opportunity.hours`, `date: opportunity.startAt`, `supervisor: opportunity.contactName`, `opportunity`, `application`) and sets `application.hoursGranted = opportunity.hours`.
- Applications with `status: 'accepted'` and `attended: false` remain `attended: false, hoursGranted: 0` (counted as no-shows in analytics).
- Opportunity status transitions to `completed`.

---

## 7. Recommendations ("Best for You First")

Computed on the server in `GET /api/opportunities?sort=recommended` (no external AI service needed):
- **+10 points** for each opportunity field in `opportunity.fields` that matches one of the student's `interests`.
- **+3 points** if `opportunity.faculty === student.faculty` (specifically targeting their faculty rather than `null`).
- **+2 points** if `registrationDeadline` is within the next 3 days.
- **+1 point** if 25% or fewer of the slots for the student's category remain open.
- **+1 point** per past attended event in the same field (capped at **+3 points**).
- **Exclusions & Ordering:** Already-applied, `cancelled`, and `registration_closed` opportunities are excluded from top recommendations. Full opportunities appear at the bottom with a "انضم لقائمة الانتظار" (Join Waitlist) badge.
- **Tie-breaker:** Earliest `startAt` date.
- **Response Enrichment:** Each opportunity includes `matchedFields: InterestKey[]` and `recommendationScore: number` so the UI displays badges like `"يناسب اهتمامك: المجال الطبي"`.

---

## 8. Dashboards & Analytics

All charts use **Recharts** (compatible with React 19) with RTL Arabic tooltips and labels. All metrics are powered by MongoDB aggregation pipelines scoped with `buildScope(user)`. Only approved hours count toward totals and certificates.

### Student Dashboard (`/me`)
- Approved hours, remaining hours to certificate (`Settings.certificateHours`), animated progress bar, and an "مؤهل للشهادة — تُستلم من الكلية" (eligible — collect from your faculty) badge when eligible (no print/download button).
- Summary KPIs: events attended, upcoming accepted events, active applications.
- "Happening Now" live check-in banner (when applicable).
- Top recommended opportunities and recent activity log.

### Dean Dashboard (`/` for Dean — own faculty only)
- **KPI Cards:** Registered volunteers, active volunteers, approved hours, events this month, pending student registrations, pending applications.
- **Participation Funnel:** Applied → Accepted → Attended, alongside Rejected and No-Show counts.
- **Engagement Donut Chart:** Volunteers who joined at least one activity vs. 0-hour registered volunteers.
- **Monthly Hours Line Chart:** Approved volunteer hours per month.
- **Certificate Progress Buckets** (relative to `Settings.certificateHours`, shown here for the default `C = 30`): Eligible (`>= C`), `≥ ⅔C` (20–29h), `1h – <⅔C` (1–19h), and `0h`.
- **Actionable Lists:** Top events by attendance, top volunteers, students with 0 hours, and quick links to the Approvals queue.

### Admin Dashboard (`/` for Admin — university-wide)
- All Dean dashboard widgets aggregated across the entire university.
- **Faculty Comparison Chart:** Registered volunteers, approved hours, and participation rate per faculty.
- **Event Efficiency Metrics:** Slot fill rate and no-show rate per completed opportunity.
- **System Queues:** Quick overview of Dean accounts and university-wide pending approvals.

---

## 9. Client Architecture (TypeScript + React 19)

- **Strict TypeScript:** All components, pages, hooks, contexts, and utilities in `client/src/` use `.ts` / `.tsx` with typed props and API response interfaces in `client/src/types/`.
- **Routes:**
  - Public: `/login`, `/register`
  - Pending/Rejected Student: `/pending`
  - Student (`role: 'student'`): `/me`, `/opportunities`, `/opportunities/:id`, `/me/applications`, `/me/profile`, `/checkin/:opportunityId` (no certificate route — students cannot open or print certificates)
  - Dean & Admin (`role: 'dean' | 'admin'`): `/`, `/volunteers`, `/volunteers/:id`, `/activities`, `/approvals`, `/opportunities/manage`, `/opportunities/new`, `/opportunities/:id`, `/opportunities/:id/live`, `/excel`, `/certificate/:volunteerId` (dean: own faculty only, `404` otherwise)
  - Admin Only (`role: 'admin'`): `/deans`
- **Role Guards:** `ProtectedRoute` accepts `allowedRoles?: UserRole[]` and redirects unauthorized or pending users to their appropriate home screen.
- **Conventions:** All UI strings in `client/src/constants/ar.ts`, RTL layout, `ar-EG` dates and digits, Arabic API error messages, confirmation dialogs for destructive actions, and skeleton loaders.

---

## 10. Security and Edge Cases

- Every permission and faculty scope rule is enforced on the server; hiding UI buttons is never relied upon for security.
- A dean cannot read, create, update, or delete anything outside their faculty, even by guessing MongoDB ObjectIds or injecting another `faculty` in the request body.
- One `User` per `volunteerId` (enforced via validation, the partial unique index on `User.volunteer`, and the partial unique index on `registration.volunteerId`).
- Duplicate applications by the same volunteer to the same opportunity are blocked by the compound unique index `(opportunity, volunteer)`.
- Two students applying for the final slot simultaneously: atomic `findOneAndUpdate` guarantees that exactly one gets `accepted` and the other gets `waitlisted`.
- `pending`, `rejected`, and `disabled` users receive `403` everywhere except `GET /api/auth/me`.
- Timezone handling: store UTC `Date` values in MongoDB; evaluate opportunity phases and check-in windows in `Africa/Cairo`.
- Cancelling an opportunity with accepted applicants transitions all its active applications to `cancelled`, resets `acceptedCounts`, and displays the cancellation status to students.
- Completing an opportunity twice is idempotent and never duplicates `Activity` records or hours.
- Deleting a volunteer who has existing applications, activities, or a linked `User` account is blocked with a clear Arabic error message.
- Certificates are server-protected: any certificate data endpoint requires `role: 'admin' | 'dean'` (dean scoped to own faculty); a student token receives `403`.

---

## 11. Testing Plan

- **Type Checking:** `npm run typecheck` (`tsc --noEmit`) in both `server/` and `client/` must pass with zero errors.
- **Server Tests (`node --test` with `tsx`):** One test file per phase (`server/tests/v2-*.test.ts`).
  - **Roles:** Verify status codes (`200`, `401`, `403`, `404`) for `admin`, `dean`, `student`, `pending`, `disabled`, and anonymous requests across all endpoints.
  - **Scoping:** Verify Dean A receives `404` when reading/updating/deleting Faculty B's volunteers, activities, registrations, or applications, and that `faculty` in request bodies is overridden.
  - **Registration & Linking:** Pending flow, approval creating a new volunteer vs. linking an existing Excel-imported volunteer, faculty mismatch flag (admin-only approval, existing faculty wins), rejection with reason, duplicate ID rejection (including two concurrent pending registrations with the same `volunteerId`), and multiple pending users with `volunteer: null` coexisting.
  - **Capacity Concurrency:** Fire `N` parallel application requests for `M < N` slots and assert that `accepted === M` and `waitlisted === N - M`; verify withdrawal promotes the oldest waitlisted applicant; verify `acceptedCounts` equals the number of `accepted` applications after withdraw, reject-after-accept, and cancel; verify withdraw → re-apply reactivates the same document at the back of the waitlist.
  - **Check-in Security:** Expired QR token, wrong opportunity token, unaccepted student, outside time window, and check-in after completion all fail with Arabic errors.
  - **Idempotent Completion:** Calling `/complete` twice creates exactly one `Activity` per attended student, updates approved hours immediately, and gives 0 hours to no-shows; calling it before `endAt` or on a cancelled opportunity returns `409`.
  - **Certificates:** Student tokens get `403` on certificate endpoints; Dean A gets `404` for Faculty B volunteers.
  - **Recommendations:** Verify deterministic ordering and `matchedFields` for known student interest sets.
  - **Stats Consistency:** Assert that Dean stats for Faculty X equal Admin stats filtered to Faculty X.
- **Client Tests (Vitest + React Testing Library + MSW):** One test file per phase (`client/src/__tests__/v2-*.test.tsx`).

---

## 12. Implementation Phases

### Phase V2-0: Full TypeScript Migration (Server & Client)
- **Tasks:**
  - Install TypeScript, `tsx`, and `@types/*` packages in `server/` and `client/` (`@types/express`, `@types/jsonwebtoken`, `@types/cors`, `@types/multer`, `@types/node`; NOT `@types/bcryptjs` — bcryptjs v3 ships its own types).
  - Add strict `tsconfig.json` files (`"strict": true`, `"noImplicitAny": true`) to both `server/` and `client/`.
  - Convert all existing `server/src/**/*.js` and `server/tests/**/*.js` files to `.ts` with explicit Mongoose document interfaces, typed Express request/response handlers, and Zod inferred types.
  - Convert all existing `client/src/**/*.js` and `client/src/**/*.jsx` files to `.ts` / `.tsx` with typed props, state, and API models.
  - Update `package.json` scripts (`dev`, `build`, `seed`, `test`, `lint`) to run natively with TypeScript, and **add a new `typecheck` script** (`tsc --noEmit`) to both packages. Root config files (e.g. `eslint.config.js`, `vite.config`) may stay JS; the TS rule applies to `src/` and `tests/`.
- **Verify:**
  - [ ] Zero `.js` or `.jsx` files remain in `server/src` or `client/src`.
  - [ ] `npm run typecheck` passes with 0 errors in both `server/` and `client/`.
  - [ ] All existing v1 server and client tests pass without regression.

### Phase V2-1: Users and Roles Refactor
- **Tasks:** Create `User.ts` model, migrate existing admin seed/logic, include `role` in JWT, implement `requireRole` and `buildScope`, seed admin plus one demo dean per faculty, update client `AuthContext.tsx` and `ProtectedRoute.tsx` with role support.
- **Verify:**
  - [ ] Existing admin login and all v1 tests still pass.
  - [ ] `GET /api/auth/me` returns the user's `role`, `status`, and `faculty`.
  - [ ] Dean and student tokens receive `403` on admin-only routes.

### Phase V2-2: Student Registration and Approval
- **Tasks:** Build `POST /api/auth/register`, `/register` page, `/pending` screen, `/approvals` queue page for deans/admin, approve/reject endpoints, interests selection at sign-up, and automatic linking to existing `Volunteer` records by `volunteerId`.
- **Verify:**
  - [ ] A newly registered student can log in but only sees `/pending` and gets `403` on protected APIs.
  - [ ] After approval by their faculty's dean, the full student portal opens.
  - [ ] Registering with an existing Excel-imported `volunteerId` links to that existing `Volunteer` record and preserves their prior hours.
  - [ ] A rejected account sees the Arabic rejection reason on `/pending`.

### Phase V2-3: Dean Scoping & Admin Dean Management
- **Tasks:** Scope `volunteers`, `activities` (via `scopeActivities`), `stats`, `excel` export, and certificate endpoints using `buildScope`; enforce dean's faculty on create/update; return `404` on cross-faculty ID access; block student access to certificates; build `/deans` management page for the Admin.
- **Verify:**
  - [ ] Dean A never sees Faculty B data anywhere (lists, by ID, stats, Excel export).
  - [ ] Request bodies sent by a dean with another faculty name are ignored and forced to Dean A's faculty.
  - [ ] Admin still sees all faculties with identical totals as before.

### Phase V2-4: Opportunities and Applications Engine
- **Tasks:** Implement `Opportunity.ts` and `Application.ts` models, CRUD routes, publish/cancel actions, apply/withdraw endpoints, manual accept/reject, category slots (`student | academic | admin`), `auto` and `manual` modes, atomic slot claim via `findOneAndUpdate`, and automatic waitlist promotion.
- **Verify:**
  - [ ] Parallel capacity race test passes (exact slot count accepted, remainder waitlisted).
  - [ ] `auto` mode fills slots then waitlists; withdrawing promotes the oldest waitlisted student of that category.
  - [ ] `manual` mode keeps applications `pending` until organizer decision.
  - [ ] Categories with `0` slots cannot apply; deadline and faculty restrictions are enforced.
  - [ ] `acceptedCounts` always equals the number of `accepted` applications (withdraw, reject-after-accept, cancel); slots cannot be lowered below `acceptedCounts`.
  - [ ] Withdraw → re-apply reactivates the same Application at the back of the waitlist.

### Phase V2-5: Student Portal and Recommendations
- **Tasks:** Build student dashboard shell (`/me`), opportunities board (`/opportunities`) with server-side recommendation scoring and matched interest badges, opportunity details page (`/opportunities/:id`), my applications page (`/me/applications`), and student profile with editable interests (`/me/profile`).
- **Verify:**
  - [ ] A student with `medical` and `agriculture_environment` interests sees matching opportunities ranked first with Arabic match badges.
  - [ ] Already-applied or closed opportunities are excluded from top recommendations.
  - [ ] Hours remaining to certificate are accurate at `certificateHours - 1`, `certificateHours`, and `certificateHours + 1`, and the eligibility badge appears at `certificateHours`+.
  - [ ] A student token gets `403` on certificate endpoints and has no certificate route in the UI.

### Phase V2-6: Live Mode, Rotating QR Check-in, and Completion
- **Tasks:** Implement `Africa/Cairo` phase calculation, 45-second signed QR token endpoint, live organizer page (`/opportunities/:id/live`) with `qrcode.react` and 10s polling, student "Happening Now" banner and check-in page, manual check-in toggle, and idempotent `POST /api/opportunities/:id/complete` that credits approved activities.
- **Verify:**
  - [ ] An expired QR token (>45s) fails verification.
  - [ ] Check-in succeeds only for `accepted` students within the `[startAt - 30m, endAt]` window.
  - [ ] Completing an event credits approved hours to attendees only, and calling `/complete` a second time creates zero duplicates; `/complete` before `endAt` returns `409`.
  - [ ] Student's approved hours and certificate eligibility update immediately upon completion.

### Phase V2-7: Role-Based Dashboards & Recharts Analytics
- **Tasks:** Build `/api/stats/participation`, `/api/stats/events`, `/api/stats/monthly-hours`, and `/api/stats/me`; implement Recharts widgets for Student, Dean, and Admin dashboards with Arabic empty, loading, and error states.
- **Verify:**
  - [ ] Dean dashboard numbers for a faculty match Admin numbers filtered to that faculty.
  - [ ] Participation funnel math is consistent (`applied >= accepted >= attended`).
  - [ ] All charts render cleanly in RTL at 375px mobile width with no English text.

### Phase V2-8: Security Hardening, Demo Data, and Documentation
- **Tasks:** Add `helmet` and `express-rate-limit`, expand seed script with rich demo data (deans for faculties, approved/pending students, opportunities across upcoming/live/completed states), update documentation, and run full end-to-end verification.
- **Verify:**
  - [ ] Full demo walkthrough (Admin → Dean → Student → Live QR Check-in → Event Completion → Dashboards → Dean/Admin prints the certificate) runs smoothly.
  - [ ] All server and client test suites and `tsc --noEmit` checks pass 100%.

---

## 13. Confirmed Architecture Assumptions

1. **Authentication:** Local email and password with JWT only (Microsoft Sign-In / OAuth is excluded).
2. **Opportunity Scope:** A dean posts opportunities only for their own faculty; only the admin can post opportunities for all faculties (`faculty: null`).
3. **Auto-Approved Event Hours:** Hours credited from a completed opportunity are created directly with `status: 'approved'` for checked-in attendees.
4. **Password Resets:** No external email service is needed; Admin resets Dean/Student passwords and Deans reset their faculty's Student passwords using temporary passwords.
5. **Multiple Deans:** More than one dean account per faculty is supported.
6. **Staff Volunteers:** Self-registered volunteers whose category is `academic` or `admin` use the `student` login role (volunteer portal) and can apply to opportunities that allocate slots for their category.
7. **Certificates:** Only the Admin (any faculty) and Deans (own faculty) can open and print certificates. Students only see their eligibility status and remaining hours.

---

## 14. Spec Kit Workflow & Ready-to-Use Commands

Spec Kit is not yet initialized in this workspace. Initialize it once (replace `<agent>` with your coding agent, e.g. `claude`, `gemini`, `copilot`):
```powershell
uvx --from git+https://github.com/github/spec-kit.git specify init --here --ai <agent>
```

**Workflow:** v2 is delivered as **one Spec Kit feature** (one branch, one `spec.md`, `plan.md`, and `tasks.md`), with `tasks.md` split into phases V2-0 → V2-8. Run each command once, in order:

```text
/speckit.constitution
/speckit.specify
/speckit.clarify
/speckit.plan
/speckit.checklist
/speckit.tasks
/speckit.analyze
/speckit.implement   ← run once per phase (V2-0, then V2-1, … V2-8)
```

> [!IMPORTANT]
> Run `/speckit.implement` **one phase at a time** and confirm lint, typecheck, and tests pass before the next phase. Running all 9 phases in one go on a spec this large risks skipped details.

### 1. `/speckit.constitution`
```text
/speckit.constitution Create the project constitution for the MNU Volunteer Hours & Certificates System v2 with the following non-negotiable principles:

1. 100% TypeScript Strict Mode:
   - Every source and test file under `server/src`, `server/tests`, and `client/src` MUST be TypeScript (`.ts` / `.tsx`) with `"strict": true`. Root tooling config files (e.g. `eslint.config.js`, `vite.config`) are exempt.
   - Avoid `any`; use explicit interfaces, discriminated unions for roles/statuses, and `z.infer` from Zod schemas.

2. Arabic-First & RTL User Experience:
   - `<html lang="ar" dir="rtl">` across the entire application.
   - Every UI label, button, placeholder, toast, empty state, validation error, API error message, chart label, and Excel header MUST be Arabic; UI strings are centralized in `client/src/constants/ar.ts`.
   - Dates and numbers use `ar-EG` formatting. Event phases and check-in windows are evaluated in `Africa/Cairo`; MongoDB stores UTC.

3. Server-Enforced Role-Based Access Control & Faculty Isolation:
   - Three login roles only: `admin`, `dean`, `student`. Authentication is email + password with JWT (no OAuth, no external email service).
   - Every permission is enforced on the server; hiding UI is never a security control.
   - A `dean` is locked to the `faculty` loaded fresh from the DB on every request; any `faculty` in a dean's request body is ignored and overwritten.
   - Accessing a resource outside a dean's faculty returns `404` (never `403`) to prevent enumeration.
   - `pending`, `rejected`, and `disabled` users receive `403` on every endpoint except `GET /api/auth/me`.
   - Certificates can be opened/printed only by `admin` (any faculty) and `dean` (own faculty). Students never access certificates.

4. Data Integrity, Concurrency Safety & Idempotency:
   - Only `approved` hours count toward totals, stats, and certificate eligibility; the eligibility threshold always comes from `Settings.certificateHours` (never hardcoded).
   - Opportunity capacity can never be exceeded, even under concurrent requests; capacity counters always equal the number of accepted applications.
   - Crediting hours for an event is idempotent; duplicate hours can never be granted.

5. Automated Verification Gate per Phase:
   - Every phase requires passing `npm run lint`, `npm run typecheck` (`tsc --noEmit`), backend integration tests (`node --test` via `tsx`), and frontend Vitest + MSW tests before advancing.
```

### 2. `/speckit.specify`
```text
/speckit.specify Build Volunteer Hours System v2 as defined in docs/PLAN-v2.md (extending docs/PLAN.md), delivered in phases V2-0 to V2-8. Authentication stays email + password with JWT (no OAuth, no external email service).

1. TypeScript Migration (Phase V2-0, zero behavior change):
   - Every file in server/src, server/tests, and client/src becomes .ts/.tsx with "strict": true; root tooling config files may stay JS.
   - Add a `typecheck` script (tsc --noEmit) to both packages; dev, build, seed, test, and lint run natively on TypeScript. All existing v1 tests must still pass.

2. Roles, Registration & Faculty Isolation (Phases V2-1 to V2-3):
   - admin: university-wide access to volunteers, activities, accounts, opportunities, stats, settings, and Excel import/export; creates/disables/enables dean accounts and resets dean/student passwords with temporary passwords; approves/rejects any registration; opens and prints certificates for any faculty.
   - dean: locked to one faculty (from the DB account, never the request); manages that faculty's volunteers and activities; approves/rejects that faculty's registrations; resets that faculty's student passwords; exports Excel for that faculty only; opens and prints certificates for that faculty's eligible volunteers. More than one dean per faculty is allowed. Out-of-faculty access returns 404.
   - student: self-registers with email, password, fullName, volunteerId, category (student | academic | admin — "academic"/"admin" are staff who still use the student login role), faculty, and at least one interest (medical, agriculture_environment, education, charity_community, technology, sports, arts_culture, awareness_campaigns, event_organizing). Starts pending and only sees a waiting screen until approved; rejected users see the Arabic rejection reason. Students see their own hours and certificate eligibility but can NEVER open, print, or download a certificate.
   - A volunteerId may belong to only one account, including across pending registrations. If a Volunteer record with that ID already exists (e.g. from Excel import), it is linked on approval (keeping prior hours) instead of duplicated. If the faculties differ, the request is flagged, only the admin can approve it, and the existing Volunteer's faculty wins.
   - A volunteer cannot be deleted if they have activities, applications, or a linked account. Logout is client-side (no logout endpoint).

3. Opportunities & Applications (Phase V2-4):
   - Admin or a dean posts an opportunity (title, description, requirements, interest fields, activity type, location, start/end, registration deadline, hours, contact info, faculty or all faculties [admin only], slots per category student/academic/admin, approval mode auto/manual). Lifecycle: draft → published → completed, or cancelled any time before completion. Time phases (upcoming, registration closed, in progress, ended) are evaluated in Africa/Cairo.
   - Once anyone is accepted, slots can't drop below the accepted count and hours/dates/faculty are locked; completed or cancelled opportunities are read-only.
   - Active students apply if published, before the deadline, faculty matches (or all faculties), and their category has slots. Auto mode accepts until full, then waitlists; manual mode keeps applications pending until the organizer decides. Capacity is never exceeded under concurrent applications.
   - Any accepted application leaving "accepted" (withdraw, organizer reject, cancellation) frees its slot. In auto mode a freed slot promotes the oldest waitlisted applicant of the same category until the event starts. A withdrawn student may re-apply (joins the back of the waitlist); a rejected one may not.
   - Deans get a read-only view of their own faculty's applicants on admin-posted all-faculty opportunities.

4. Student Portal & Recommendations (Phase V2-5):
   - Scoring: +10 per matching interest, +3 if targeted at the student's faculty, +2 if the deadline is within 3 days, +1 if ≤25% of the category's slots remain, +1 per past attended event in the same field (max +3); ties by earliest start.
   - Already-applied, cancelled, and registration-closed opportunities are excluded from the top; full ones appear last with a "join waitlist" badge; each result shows its matched interests as Arabic badges.

5. Live Check-in & Completion (Phase V2-6):
   - Check-in window is 30 minutes before start until end. The organizer screen shows a QR code that rotates (valid ~45s, refreshed every 30s), live counters, and an attendee list with manual check-in. Accepted students see a "Happening Now" banner and check in by scanning.
   - Completing an event is allowed only after it ends, never on a cancelled one, and closes check-in. It credits approved hours (as approved activities) to attendees only, records no-shows with 0 hours, and running it twice never duplicates hours.

6. Dashboards (Phase V2-7):
   - Student: approved hours, hours remaining to the certificate threshold (Settings.certificateHours), progress bar, an "eligible — collect from your faculty" badge when eligible (no print/download), Happening Now banner, upcoming accepted events, active applications, recommendations, recent activity.
   - Dean (own faculty only): KPIs (registered/active volunteers, approved hours, events this month, pending registrations, pending applications), participation funnel (applied → accepted → attended, plus rejected and no-show), joined vs never-joined donut, monthly approved hours line chart, certificate progress buckets relative to the threshold, top events, top volunteers, zero-hour students, approvals shortcut.
   - Admin: all dean widgets university-wide, faculty comparison (volunteers, hours, participation rate), slot fill rate and no-show rate per completed opportunity, dean account and global approvals overview.
   - Dean numbers for a faculty must equal admin numbers filtered to that faculty. All charts are Arabic, RTL, usable at 375px width, with Arabic empty/loading/error states.

7. Hardening & Demo Data (Phase V2-8):
   - Security headers and rate limiting on login, registration, and QR check-in; optional allowed-email-domain restriction.
   - Demo seed: admin, deans per faculty, approved and pending students, and opportunities in upcoming, live, and completed states, enabling a full walkthrough ending with a dean/admin printing a certificate.
```

### 3. `/speckit.clarify`
```text
/speckit.clarify Resolve remaining ambiguities using docs/PLAN-v2.md as the source of truth, especially sections 2, 3, 6, 10, and 13 (confirmed decisions). Key decisions already made: email/password JWT only; admin-issued temporary passwords; multiple deans per faculty; deans post only for their own faculty, admin may post for all; deans have read-only views of their faculty's applicants on admin opportunities; staff use the student login role; completion auto-creates approved hours for attendees only; only admin and deans can open/print certificates. Ask only about anything not covered there.
```

### 4. `/speckit.plan`
```text
/speckit.plan Create the technical implementation plan following docs/PLAN-v2.md (sections 3, 4, 5, 9, and the matching phases in section 12).

Stack (versions as in the current package.json files):
- server/: Node.js + Express 5 + Mongoose 9 + Zod 4 + TypeScript (tsx for dev/seed/test via `node --import tsx --test`, tsc for build & typecheck). Types: @types/express, @types/jsonwebtoken, @types/cors, @types/multer, @types/node (bcryptjs v3 ships its own types — do not add @types/bcryptjs). Phase V2-8 adds helmet and express-rate-limit.
- client/: Vite + React 19 + TypeScript + Tailwind CSS v4 (RTL, Cairo font) + React Router v7 + Axios. New: recharts, qrcode.react, vitest, @testing-library/react, msw.
- Schemas: Zod schemas live on the server; the client keeps mirrored TypeScript interfaces in client/src/types/ (no shared package).

Key architecture rules:
- User.volunteer and registration.volunteerId use PARTIAL unique indexes (`$type: 'objectId'` / non-rejected), never sparse.
- authenticate middleware reloads the User on every request; requireRole(...roles) guards; buildScope(user) returns {} for admin and { faculty } for dean, and every service takes `scope: ScopeFilter`.
- Activity has no faculty field: dean scoping goes through a scopeActivities(scope) helper (volunteer $in / $lookup). Application stores denormalized faculty and category.
- Slot claim: single findOneAndUpdate with `$expr: { $lt: ["$acceptedCounts.<cat>", "$slots.<cat>"] }` and `$inc`. Every exit from "accepted" decrements the counter. Waitlist order uses Application.appliedAt; re-apply reactivates the cancelled document.
- Completion: preconditions (published, after endAt), upsert per application, Activity partial unique index on `application`.
- Certificate endpoints: requireRole('admin','dean') + dean scope.
```

### 5. `/speckit.checklist`
```text
/speckit.checklist Generate requirement-quality checklists ("unit tests for the requirements") that verify the spec and plan are complete, unambiguous, consistent, and testable for: (1) role permissions and faculty isolation, including certificate access; (2) capacity, concurrency, waitlist, and idempotency rules; (3) QR check-in and time-window rules in Africa/Cairo; (4) Arabic/RTL and accessibility requirements; (5) data-integrity rules (approved-hours-only, configurable certificate threshold, deletion guards). Flag any requirement missing a measurable acceptance criterion.
```

### 6. `/speckit.tasks`
```text
/speckit.tasks Break the plan into actionable, file-level tasks grouped strictly by phases V2-0 through V2-8 of docs/PLAN-v2.md section 12. For every phase include: backend model/service/route tasks, frontend page/component tasks, Arabic strings in client/src/constants/ar.ts, and mandatory automated test tasks (server/tests/v2-*.test.ts and client/src/__tests__/v2-*.test.tsx) covering every "Verify" item of that phase and the relevant section 11 tests. End every phase with a gate task: lint + typecheck + tests in server/ and client/.
```

### 7. `/speckit.analyze`
```text
/speckit.analyze Perform a cross-artifact consistency and coverage analysis across constitution.md, spec.md, plan.md, and tasks.md. Verify that:
1. No constitution principle is violated (TypeScript strictness, Arabic/RTL, server-side RBAC, 404 scoping, approved-hours-only, configurable certificate threshold).
2. No references to OAuth, Microsoft Sign-In, a logout endpoint, or student certificate access exist.
3. Every file created or migrated under src/ or tests/ uses .ts/.tsx.
4. Every API endpoint, role permission, edge case (docs/PLAN-v2.md section 10), and "Verify" item of phases V2-0 to V2-8 maps to at least one task and one automated test.
```

### 8. `/speckit.implement`
```text
/speckit.implement Execute ONLY Phase <N> of tasks.md (start with V2-0; run again for V2-1 ... V2-8), then stop. After each phase, run `npm run lint`, `npm run typecheck`, and `npm test` in both server/ and client/, and confirm all pass and every "Verify" item of that phase in docs/PLAN-v2.md is satisfied.
```
