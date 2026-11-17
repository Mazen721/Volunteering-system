# Data Model: MNU Volunteer Hours & Certificates System v2

**Feature**: `001-volunteer-hours-v2`
**Date**: 2026-11-16
**References**: [spec.md](./spec.md), [research.md](./research.md)

---

## 1. Shared Domain Enumerations (`server/src/constants/enums.ts` & `client/src/constants/enums.ts`)

| Constant | Values | Description |
| --- | --- | --- |
| `FACULTIES` | `'كلية الطب البشري'`, `'كلية طب الأسنان'`, `'كلية الصيدلة'`, `'كلية الهندسة'`, `'كلية تكنولوجيا العلوم الصحية'`, `'كلية الاقتصاد والعلوم الإدارية'`, `'كلية التمريض'` | The 7 official MNU faculties. |
| `CATEGORIES` (`VolunteerCategory`) | `'student' \| 'academic' \| 'admin'` | Affiliation category (students, academic staff, administrative staff). |
| `USER_ROLES` (`UserRole`) | `'admin' \| 'dean' \| 'student'` | Platform login roles (`academic`/`admin` staff use the `'student'` login role). |
| `USER_STATUSES` (`UserStatus`) | `'pending' \| 'active' \| 'rejected' \| 'disabled'` | Account lifecycle states. |
| `INTEREST_KEYS` (`InterestKey`) | `'medical'`, `'agriculture_environment'`, `'education'`, `'charity_community'`, `'technology'`, `'sports'`, `'arts_culture'`, `'awareness_campaigns'`, `'event_organizing'` | The 9 volunteering interest domains (Arabic labels in `client/src/constants/ar.ts`). |
| `ACTIVITY_TYPES` (`ActivityType`) | `'قافلة'`, `'مبادرة'`, `'ندوة'`, `'حملة توعية'`, `'ورشة عمل'`, `'دورة تدريبية'`, `'مؤتمر مجتمعي'`, `'زيارة ميدانية'`, `'برنامج تأهيلي'`, `'شراكات'` | Official volunteer activity types. |
| `ACTIVITY_STATUSES` (`ActivityStatus`) | `'approved' \| 'pending' \| 'rejected'` | Activity review statuses. |
| `OPPORTUNITY_STATUSES` (`OpportunityStatus`) | `'draft' \| 'published' \| 'cancelled' \| 'completed'` | Stored opportunity lifecycle states. |
| `OPPORTUNITY_PHASES` (`OpportunityPhase`) | `'upcoming' \| 'registration_closed' \| 'in_progress' \| 'ended'` | Computed time phase evaluated in `Africa/Cairo`. |
| `APPROVAL_MODES` (`ApprovalMode`) | `'auto' \| 'manual'` | Opportunity applicant acceptance mode. |
| `APPLICATION_STATUSES` (`ApplicationStatus`) | `'pending' \| 'accepted' \| 'waitlisted' \| 'rejected' \| 'cancelled'` | Applicant status lifecycle. |

---

## 2. Entities & Mongoose Schemas

### 2.1 `User` (`server/src/models/User.ts` — replaces `Admin`)

Replaces the v1 `Admin` model. Existing admin credentials migrate seamlessly to `role: 'admin', status: 'active', faculty: null`.

| Field | Type | Required / Default | Constraints & Validation |
| --- | --- | --- | --- |
| `_id` | `Types.ObjectId` | Auto | Primary key |
| `email` | `string` | Required | Unique, lowercase, trimmed, valid email format (+ optional `ALLOWED_EMAIL_DOMAINS` check on registration) |
| `passwordHash` | `string` | Required | Bcrypt hash (excluded by default in responses) |
| `fullName` | `string` | Required | Trimmed, non-empty |
| `role` | `UserRole` | Required | Discriminated enum: `'admin' \| 'dean' \| 'student'` |
| `faculty` | `string \| null` | Default `null` | Required (`in FACULTIES`) for `dean` and active `student`; `null` for `admin` |
| `status` | `UserStatus` | Default `'pending'` | `'pending' \| 'active' \| 'rejected' \| 'disabled'` |
| `volunteer` | `Types.ObjectId \| null` | Default `null` | Ref `'Volunteer'`. Set for `student` upon registration approval |
| `registration` | `RegistrationSnapshot \| null` | Default `null` | `{ volunteerId: string; category: VolunteerCategory; faculty: string; facultyMismatch: boolean } \| null` |
| `interests` | `InterestKey[]` | Default `[]` | Array of valid `INTEREST_KEYS` (at least 1 required on student registration) |
| `approvedBy` | `Types.ObjectId \| null` | Default `null` | Ref `'User'` |
| `approvedAt` | `Date \| null` | Default `null` | Timestamp of registration approval |
| `rejectionReason` | `string \| null` | Default `null` | Arabic reason required when `status === 'rejected'` |
| `lastLoginAt` | `Date \| null` | Default `null` | Updated on successful `POST /api/auth/login` |
| `createdAt`, `updatedAt` | `Date` | Auto | UTC timestamps |

**Indexes on `User`:**
1. `{ email: 1 }` — `unique: true`
2. `{ volunteer: 1 }` — **Partial unique index** (NEVER `sparse`):
   ```ts
   { unique: true, partialFilterExpression: { volunteer: { $type: 'objectId' } } }
   ```
3. `{ 'registration.volunteerId': 1 }` — **Partial unique index** preventing duplicate pending/active claims on the same `volunteerId`:
   ```ts
   {
     unique: true,
     partialFilterExpression: {
       'registration.volunteerId': { $type: 'string' },
       status: { $in: ['pending', 'active', 'disabled'] },
     },
   }
   ```
4. `{ role: 1, status: 1, faculty: 1 }` — Compound index for `/approvals` and `/deans` queries.

---

### 2.2 `Volunteer` (`server/src/models/Volunteer.ts`)

| Field | Type | Required / Default | Constraints & Validation |
| --- | --- | --- | --- |
| `_id` | `Types.ObjectId` | Auto | Primary key |
| `volunteerId` | `string` | Required | Unique, trimmed university/staff ID |
| `fullName` | `string` | Required | Trimmed |
| `category` | `VolunteerCategory` | Required | `'student' \| 'academic' \| 'admin'` |
| `faculty` | `string` | Required | One of `FACULTIES` |
| `createdAt`, `updatedAt` | `Date` | Auto | UTC timestamps |

**Deletion Guard Rule:**
- A `Volunteer` document CANNOT be deleted if any of the following exist:
  1. `Activity.exists({ volunteer: volunteer._id })`
  2. `Application.exists({ volunteer: volunteer._id })`
  3. `User.exists({ volunteer: volunteer._id })`
- Attempting deletion when linked records exist throws `AppError(409, ...)` with an Arabic message.

---

### 2.3 `Opportunity` (`server/src/models/Opportunity.ts`)

| Field | Type | Required / Default | Constraints & Validation |
| --- | --- | --- | --- |
| `_id` | `Types.ObjectId` | Auto | Primary key |
| `title` | `string` | Required | Trimmed, non-empty |
| `description` | `string` | Required | Trimmed, non-empty |
| `requirements` | `string` | Default `''` | Trimmed |
| `fields` | `InterestKey[]` | Required | Non-empty array of `INTEREST_KEYS` (`min: 1`) |
| `activityType` | `ActivityType` | Required | One of `ACTIVITY_TYPES` (used when creating `Activity` on completion) |
| `location` | `OpportunityLocation` | Required | `{ name: string; address: string; mapUrl?: string }` |
| `startAt` | `Date` | Required | UTC `Date`; must not be in the past at creation |
| `endAt` | `Date` | Required | UTC `Date`; `endAt > startAt` |
| `registrationDeadline` | `Date` | Required | UTC `Date`; `registrationDeadline <= startAt` |
| `hours` | `number` | Required | Positive number (`hours > 0`) credited per checked-in attendee |
| `contactName` | `string` | Required | Trimmed (becomes `Activity.supervisor` on completion) |
| `contactPhone` | `string` | Required | Trimmed |
| `contactEmail` | `string` | Required | Trimmed, valid email |
| `faculty` | `string \| null` | Default `null` | `null` = all faculties (admin only); otherwise one of `FACULTIES` (forced to `req.user.faculty` for deans) |
| `slots` | `CategoryCounts` | Required | `{ student: number; academic: number; admin: number }` (`>= 0`, at least one category `> 0`) |
| `acceptedCounts` | `CategoryCounts` | Default `{ student: 0, academic: 0, admin: 0 }` | Maintained atomically via `$inc`; always equals accepted applications per category |
| `approvalMode` | `ApprovalMode` | Required | `'auto' \| 'manual'` |
| `status` | `OpportunityStatus` | Default `'draft'` | `'draft' \| 'published' \| 'cancelled' \| 'completed'` |
| `createdBy` | `Types.ObjectId` | Required | Ref `'User'` |
| `createdAt`, `updatedAt` | `Date` | Auto | UTC timestamps |

**Computed Fields (evaluated in `Africa/Cairo` time):**
- `phase`:
  - `'upcoming'` when `now < registrationDeadline`
  - `'registration_closed'` when `registrationDeadline <= now < startAt`
  - `'in_progress'` when `startAt <= now <= endAt`
  - `'ended'` when `now > endAt`
- `checkInOpen`: `status === 'published' && now >= (startAt - 30 minutes) && now <= endAt`

**Edit & State Transition Rules:**
- Lifecycle: `draft → published → completed`, or `draft/published → cancelled`.
- Once `acceptedCounts.student + acceptedCounts.academic + acceptedCounts.admin > 0`:
  - `slots.<cat>` cannot be updated to a value `< acceptedCounts.<cat>`.
  - `hours`, `startAt`, `endAt`, and `faculty` are locked against edits.
- When `status` is `'completed'` or `'cancelled'`, the opportunity is read-only.

**Indexes on `Opportunity`:**
1. `{ status: 1, faculty: 1, startAt: 1 }`
2. `{ createdBy: 1, status: 1 }`

---

### 2.4 `Application` (`server/src/models/Application.ts`)

| Field | Type | Required / Default | Constraints & Validation |
| --- | --- | --- | --- |
| `_id` | `Types.ObjectId` | Auto | Primary key |
| `opportunity` | `Types.ObjectId` | Required | Ref `'Opportunity'` |
| `volunteer` | `Types.ObjectId` | Required | Ref `'Volunteer'` |
| `user` | `Types.ObjectId` | Required | Ref `'User'` |
| `faculty` | `string` | Required | Denormalized copy of `volunteer.faculty` at apply time (for dean scoping & analytics) |
| `category` | `VolunteerCategory` | Required | Denormalized copy of `volunteer.category` at apply time (for slot accounting) |
| `status` | `ApplicationStatus` | Required | `'pending' \| 'accepted' \| 'waitlisted' \| 'rejected' \| 'cancelled'` |
| `note` | `string` | Default `''` | Optional applicant message |
| `decidedBy` | `Types.ObjectId \| null` | Default `null` | Ref `'User'` |
| `decidedAt` | `Date \| null` | Default `null` | Timestamp of organizer decision |
| `attended` | `boolean` | Default `false` | Set `true` via QR check-in or manual organizer toggle |
| `checkedInAt` | `Date \| null` | Default `null` | Timestamp of check-in |
| `hoursGranted` | `number` | Default `0` | Set to `opportunity.hours` upon event completion if `attended === true` |
| `appliedAt` | `Date` | Default `Date.now` | Used for FIFO waitlist promotion; refreshed when a `cancelled` application re-applies |
| `createdAt`, `updatedAt` | `Date` | Auto | UTC timestamps |

**Indexes on `Application`:**
1. `{ opportunity: 1, volunteer: 1 }` — `unique: true` (prevents duplicate applications; re-apply after withdrawal reactivates the same document)
2. `{ opportunity: 1, status: 1, category: 1, appliedAt: 1 }` — Waitlist promotion lookup index
3. `{ faculty: 1, status: 1 }` — Dean-scoped applicant & participation funnel index
4. `{ volunteer: 1, status: 1 }` — Student portal applications lookup

---

### 2.5 `Activity` (`server/src/models/Activity.ts` — extended)

Extends the v1 `Activity` schema with optional references to `Opportunity` and `Application`.

| Field | Type | Required / Default | Constraints & Validation |
| --- | --- | --- | --- |
| `volunteer` | `Types.ObjectId` | Required | Ref `'Volunteer'`, indexed |
| `title` | `string` | Required | Trimmed |
| `type` | `ActivityType` | Required | One of `ACTIVITY_TYPES` |
| `hours` | `number` | Required | `> 0` |
| `date` | `Date` | Required | UTC `Date` |
| `status` | `ActivityStatus` | Default `'pending'` | `'approved' \| 'pending' \| 'rejected'`, indexed |
| `supervisor` | `string` | Required | Trimmed |
| `opportunity` | `Types.ObjectId \| null` | Default `null` | Optional ref `'Opportunity'` |
| `application` | `Types.ObjectId \| null` | Default `null` | Optional ref `'Application'` |
| `createdAt`, `updatedAt` | `Date` | Auto | UTC timestamps |

**Indexes on `Activity`:**
1. `{ volunteer: 1, title: 1, date: 1 }` (existing v1 index)
2. `{ application: 1 }` — **Partial unique index** guaranteeing idempotent hour crediting:
   ```ts
   { unique: true, partialFilterExpression: { application: { $type: 'objectId' } } }
   ```

**Faculty Scoping Rule (`scopeActivities`):**
- Because `Activity` does not store `faculty`, `scopeActivities(scope: ScopeFilter)` in `server/src/services/activity.service.ts` resolves:
  - Query filter: `scope.faculty ? { volunteer: { $in: await Volunteer.distinct('_id', { faculty: scope.faculty }) } } : {}`
  - Aggregation pipeline stage: `$lookup` from `volunteers` + `$match: scope.faculty ? { 'volunteerDoc.faculty': scope.faculty } : {}`

---

### 2.6 `Settings` (`server/src/models/Settings.ts` — unchanged schema, typed)

| Field | Type | Required / Default | Constraints & Validation |
| --- | --- | --- | --- |
| `key` | `string` | Default `'global'` | Unique |
| `certificateHours` | `number` | Default `30` | `min: 1`, dynamic eligibility threshold |
