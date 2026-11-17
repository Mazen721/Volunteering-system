# API & Client Route Contracts: MNU Volunteer Hours & Certificates System v2

**Feature**: `001-volunteer-hours-v2`
**Date**: 2026-11-16
**References**: [spec.md](../spec.md), [data-model.md](../data-model.md)

---

## 1. Global Middleware & Authorization Rules

1. **Authentication (`authenticate`)**:
   - Extracts Bearer JWT (`{ sub: string, role: UserRole }`), verifies signature, and loads the live `User` document from MongoDB on every request.
   - Attaches `req.user` (`{ id, email, fullName, role, status, faculty, volunteer, interests, registration, rejectionReason }`) and backward-compatible `req.admin` (`{ id, email }` when `role === 'admin'`).
2. **Account Status Gate**:
   - If `req.user.status !== 'active'`, every protected route **except `GET /api/auth/me`** immediately returns HTTP `403` with an Arabic message (`حسابك قيد المراجعة` / `تم رفض طلب التسجيل` / `تم تعطيل الحساب`).
3. **Role Guard (`requireRole(...roles: UserRole[])`)**:
   - Returns HTTP `403` (`غير مصرح لك بالوصول إلى هذا المورد`) if `req.user.role` is not in `roles`.
4. **Faculty Scope (`buildScope(user)`)**:
   - Returns `{}` for `admin` and `{ faculty: user.faculty }` for `dean`.
   - On any `dean` create/update request, any `faculty` field in `req.body` is ignored and overwritten with `req.user.faculty`.
   - Accessing a resource by ID (`:id`, `:volunteerId`, `:userId`) outside the dean's faculty returns HTTP `404` (`غير موجود`), never `403`.
5. **Error Response Contract**:
   - All validation (`400`), auth (`401`/`403`), not-found (`404`), conflict (`409`), and rate-limit (`429`) responses return `{ message: string, errors?: Record<string, string[]> }` with 100% Arabic messages.

---

## 2. REST API Endpoints

### 2.1 Auth (`/api/auth`)

| Method & Path | Access | Request Body / Query (Zod Schema) | Response & Behavior |
| --- | --- | --- | --- |
| `POST /api/auth/register` | Public (rate-limited) | `{ email, password, fullName, volunteerId, category, faculty, interests: InterestKey[] (min 1) }` | `201`: `{ token, user }`. Rejects with `409` if `email` or `volunteerId` is already claimed by a `pending`/`active`/`disabled` user. Checks if `Volunteer` with `volunteerId` exists; if its `faculty !== req.body.faculty`, sets `registration.facultyMismatch = true`. Creates `User` with `role: 'student', status: 'pending'`. |
| `POST /api/auth/login` | Public (rate-limited) | `{ email, password }` | `200`: `{ token, user, admin: { id, email } }` (keeps `admin` key alongside `user` so v1 tests pass without regression). Disabled users receive `403`. `pending` and `rejected` users receive a token so `/pending` can call `GET /api/auth/me`. |
| `GET /api/auth/me` | Authenticated (any `status`) | — | `200`: `{ user, admin: { id, email } }`. Works for `pending`, `rejected`, `disabled`, and `active` users. |
| `PATCH /api/auth/me` | Active users (`admin`, `dean`, `student`) | `{ interests?: InterestKey[] (min 1), currentPassword?: string, newPassword?: string }` | `200`: `{ user }`. Updates `interests` and/or changes password (verifying `currentPassword`). |

---

### 2.2 Users & Dean Management (`/api/users`)

| Method & Path | Access | Request Body / Query | Response & Behavior |
| --- | --- | --- | --- |
| `GET /api/users` | `admin` | Query: `?role=dean&faculty=...&status=...` | `200`: `{ users: UserSummary[] }`. Lists dean/student accounts. |
| `POST /api/users` | `admin` | `{ email, fullName, faculty (in FACULTIES), password }` | `201`: `{ user }`. Creates an `active` `dean` account for the specified faculty (multiple deans per faculty allowed). |
| `PATCH /api/users/:id` | `admin` or `dean` | `{ status?: 'active' \| 'disabled', fullName?: string, faculty?: string, temporaryPassword?: string }` | `200`: `{ user }`. `admin` can enable/disable or reset temporary password for any `dean` or `student`. `dean` can ONLY reset `temporaryPassword` for a `student` in their own faculty (cross-faculty or non-student target returns `404`). |

---

### 2.3 Student Registrations Queue (`/api/registrations`)

| Method & Path | Access | Request Body / Query | Response & Behavior |
| --- | --- | --- | --- |
| `GET /api/registrations` | `admin`, `dean` | Query: `?status=pending\|rejected\|active&faculty=...` | `200`: `{ registrations: RegistrationItem[] }`. Scoped to `req.user.faculty` for deans (`registration.faculty === dean.faculty`). Includes `existingVolunteer` preview and `facultyMismatch` flag. |
| `POST /api/registrations/:userId/approve` | `admin`, `dean` | `{ facultyOverride?: string }` (admin only) | `200`: `{ user, volunteer }`. Scoped to dean's faculty (`404` if outside). If `registration.facultyMismatch === true`, a `dean` receives `403` (only `admin` can approve). Links existing `Volunteer` by `volunteerId` (preserving prior activities/hours and keeping existing `Volunteer.faculty` unless admin explicitly updates it) or creates a new `Volunteer`. Sets `user.status = 'active'`, `user.volunteer = volunteer._id`, `user.faculty = volunteer.faculty`. |
| `POST /api/registrations/:userId/reject` | `admin`, `dean` | `{ rejectionReason: string (min 3) }` | `200`: `{ user }`. Scoped to dean's faculty (`404` if outside). Sets `status = 'rejected'` and stores `rejectionReason`. |

---

### 2.4 Opportunities & Applications (`/api/opportunities`, `/api/applications`)

| Method & Path | Access | Request Body / Query | Response & Behavior |
| --- | --- | --- | --- |
| `GET /api/opportunities` | `admin`, `dean`, `student` | Query: `?status=...&faculty=...&field=...&phase=...&sort=recommended` | `200`: `{ opportunities: OpportunityDTO[] }`. For `student`: returns `published` (and applied `completed`/`cancelled`) opportunities where `faculty === null \|\| faculty === student.faculty`. When `sort=recommended`, computes `recommendationScore` and `matchedFields` and orders per `FR-020`/`FR-021`. For `dean`: returns opportunities for their faculty plus admin (`faculty: null`) opportunities. |
| `GET /api/opportunities/:id` | `admin`, `dean`, `student` | — | `200`: `{ opportunity, myApplication?: ApplicationDTO }`. Returns `404` if outside faculty visibility. |
| `POST /api/opportunities` | `admin`, `dean` | Opportunity payload (see `data-model.md`) | `201`: `{ opportunity }`. For `dean`, `faculty` is forced to `req.user.faculty`. Only `admin` may set `faculty: null`. |
| `PATCH /api/opportunities/:id` | `admin`, `dean` (poster) | Partial Opportunity payload | `200`: `{ opportunity }`. Enforces edit locks (`FR-014`): if any `acceptedCounts.<cat> > 0`, `slots.<cat> >= acceptedCounts.<cat>` and `hours`, `startAt`, `endAt`, `faculty` cannot change. Read-only if `completed` or `cancelled`. |
| `POST /api/opportunities/:id/publish` | `admin`, `dean` (poster) | — | `200`: `{ opportunity }`. Transitions `draft → published`. |
| `POST /api/opportunities/:id/cancel` | `admin`, `dean` (poster) | — | `200`: `{ opportunity }`. Allowed before `completed`. Transitions `status → 'cancelled'`, transitions all active applications (`pending`, `accepted`, `waitlisted`) to `'cancelled'`, and resets `acceptedCounts` to `{ student: 0, academic: 0, admin: 0 }`. |
| `POST /api/opportunities/:id/complete` | `admin`, `dean` (poster) | — | `200`: `{ opportunity, creditedCount, noShowCount }`. Allowed only when `status === 'published'` (or `'completed'` no-op) and `now > endAt` (`409` otherwise). Closes check-in, idempotently upserts an `approved` `Activity` per `accepted` + `attended: true` applicant, sets `hoursGranted = opportunity.hours`, and transitions `status → 'completed'`. |
| `POST /api/opportunities/:id/apply` | `student` (active) | `{ note?: string }` | `201` / `200`: `{ application }`. Validates eligibility (`FR-015`). Uses atomic `findOneAndUpdate` for `auto` mode (`accepted` if slot claimed, else `waitlisted`) or creates `pending` in `manual` mode. Reactivates `cancelled` application with refreshed `appliedAt`. |
| `DELETE /api/opportunities/:id/apply` | `student` (active) | — | `200`: `{ application }`. Withdraws before `startAt`. If application was `accepted`, atomically decrements `acceptedCounts[cat]` and (in `auto` mode before `startAt`) promotes the oldest `waitlisted` application of `cat` to `accepted`. |
| `GET /api/opportunities/:id/applications` | `admin`, `dean` | Query: `?status=...&category=...` | `200`: `{ applications: ApplicationDetailDTO[], readOnly: boolean }`. Poster/admin sees all applicants (`readOnly: false`). A dean viewing an admin's `faculty: null` opportunity sees ONLY applicants where `application.faculty === dean.faculty` (`readOnly: true`). Cross-faculty opportunity returns `404`. |
| `PATCH /api/applications/:id` | `admin`, `dean` (poster) | `{ status: 'accepted' \| 'rejected' \| 'waitlisted' }` | `200`: `{ application }`. Moving into `accepted` claims a slot atomically (`409` if full). Moving out of `accepted` decrements `acceptedCounts[cat]`. |
| `GET /api/opportunities/:id/checkin-token` | `admin`, `dean` (poster) | — | `200`: `{ token, expiresAt }`. Issues a signed JWT `{ opportunityId, type: 'checkin' }` valid for 45s. |
| `POST /api/opportunities/:id/checkin` | `student` (active, rate-limited) | `{ token: string }` | `200`: `{ application }`. Verifies rotating token signature, expiration, `opportunityId`, check-in window (`[startAt - 30m, endAt]` in `Africa/Cairo`), `opportunity.status === 'published'`, and `application.status === 'accepted'`. Sets `attended = true, checkedInAt = now`. |
| `POST /api/opportunities/:id/checkin/manual` | `admin`, `dean` (poster) | `{ applicationId: string, attended: boolean }` | `200`: `{ application }`. Toggles manual attendance before `completed`. |
| `GET /api/opportunities/:id/live` | `admin`, `dean` (poster) | — | `200`: `{ opportunity, counters: { accepted, checkedIn, notArrived }, attendees: ApplicationDetailDTO[] }`. |

---

### 2.5 Existing & Extended Routes (`/api/volunteers`, `/api/activities`, `/api/stats`, `/api/excel`, `/api/settings`)

| Method & Path | Access | Scoping & Behavior |
| --- | --- | --- |
| `/api/volunteers/*` | `admin`, `dean` | All list, profile (`/:volunteerId`), create, update, and delete operations accept `buildScope(req.user)`. Deans are forced to `req.user.faculty` on create/update and receive `404` on cross-faculty `:volunteerId`. `DELETE /:volunteerId` blocks deletion with `409` if activities, applications, or a linked `User` exist. (Note: `CertificatePage` fetches `/api/volunteers/:volunteerId`; blocking `student` from `/api/volunteers/*` with `403` enforces certificate endpoint protection on the server.) |
| `/api/activities/*` | `admin`, `dean` | Scoped via `scopeActivities(buildScope(req.user))`. Creating/updating/deleting/approving an activity for a volunteer outside the dean's faculty returns `404`. |
| `GET /api/stats/overview`, `/faculties`, `/categories`, `/leaderboard` | `admin`, `dean` | Scoped via `buildScope(req.user)` (and optional `?faculty=` filter for `admin` so Admin filtered to Faculty X matches Dean X). Includes v2 KPI counts (`eventsThisMonth`, `pendingRegistrations`, `pendingApplications`, `certificateBuckets`). |
| `GET /api/stats/participation` | `admin`, `dean` | Returns `{ funnel: { applied, accepted, attended, rejected, noShow }, engagement: { joined, zeroHours } }` scoped by faculty. |
| `GET /api/stats/events` | `admin`, `dean` | Returns top events by attendance, slot fill rates, and no-show rates per completed opportunity scoped by faculty. |
| `GET /api/stats/monthly-hours` | `admin`, `dean` | Returns monthly approved hours time series scoped by faculty. |
| `GET /api/stats/me` | `student` (active) | Returns student dashboard payload: `{ volunteer, approvedHours, pendingHours, certificateHours, remainingHours, eligible, eventsAttended, happeningNow: OpportunityDTO[], upcomingAccepted: OpportunityDTO[], activeApplications: ApplicationDTO[], recentActivities: ActivityDTO[] }`. |
| `POST /api/excel/import` | `admin` only | Imports `.xlsx` workbook with preview/commit report (`403` for `dean` and `student`). |
| `GET /api/excel/export` | `admin`, `dean` | Exports `.xlsx` workbook scoped via `buildScope(req.user)` (all faculties for `admin`, own faculty only for `dean`). |
| `GET /api/settings`, `PATCH /api/settings` | `GET`: `admin`, `dean`; `PATCH`: `admin` only | Reads/updates `Settings.certificateHours`. |

---

## 3. Client Routes Contract (`client/src/App.tsx`)

| Route Path | Allowed Roles / State | Component | Purpose |
| --- | --- | --- | --- |
| `/login` | Public | `LoginPage.tsx` | Email + password login |
| `/register` | Public | `RegisterPage.tsx` | Student/staff volunteer self-registration with interest checklist |
| `/pending` | Authenticated (`pending` or `rejected`) | `PendingApprovalPage.tsx` | Waiting screen or Arabic rejection reason notice |
| `/` | `admin`, `dean` (`student` redirects to `/me`) | `DashboardPage.tsx` | Admin university-wide or Dean faculty-scoped Recharts analytics dashboard |
| `/volunteers` | `admin`, `dean` | `VolunteersPage.tsx` | Scoped volunteer directory, search, filters, password reset action |
| `/volunteers/:volunteerId` | `admin`, `dean` | `VolunteerProfilePage.tsx` | Scoped volunteer profile & activity history |
| `/activities` | `admin`, `dean` | `ActivitiesPage.tsx` | Dedicated activity management & status approval table |
| `/approvals` | `admin`, `dean` | `ApprovalsPage.tsx` | Student registration approval/rejection queue with faculty-mismatch badge |
| `/deans` | `admin` only | `DeansPage.tsx` | Create, enable/disable, and reset passwords for faculty dean accounts |
| `/opportunities/manage` | `admin`, `dean` | `OpportunitiesManagePage.tsx` | Organizer list of opportunities, applicants modal/drawer, publish/cancel/complete actions |
| `/opportunities/new` | `admin`, `dean` | `OpportunityFormPage.tsx` | Create/edit opportunity form |
| `/opportunities/:id/live` | `admin`, `dean` | `OpportunityLivePage.tsx` | Live rotating QR code (`qrcode.react`), 10s attendance polling, manual check-in toggle |
| `/excel` (alias `/import-export`) | `admin`, `dean` | `ImportExportPage.tsx` | Admin import + export; Dean faculty-only export |
| `/certificate/:volunteerId` | `admin`, `dean` (`student` blocked) | `CertificatePage.tsx` | Official printable A4 landscape certificate (own faculty only for dean) |
| `/me` | `student` (active) | `StudentDashboardPage.tsx` | Approved hours, progress bar, eligibility badge (no print), Happening Now banner, recommendations |
| `/opportunities` | `student` (active) | `OpportunitiesBoardPage.tsx` | Recommended opportunities feed with Arabic matched-interest badges |
| `/opportunities/:id` | `admin`, `dean`, `student` | `OpportunityDetailsPage.tsx` | Opportunity details, slot availability, apply/withdraw actions |
| `/me/applications` | `student` (active) | `MyApplicationsPage.tsx` | Student's applications & waitlist status |
| `/me/profile` | `student` (active) | `StudentProfilePage.tsx` | Edit volunteering interests and change password |
| `/checkin/:opportunityId` | `student` (active) | `CheckInPage.tsx` | Student live QR code scanner / token check-in screen |
