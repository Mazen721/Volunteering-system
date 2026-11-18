---
description: "Actionable, file-level task breakdown for MNU Volunteer Hours & Certificates System v2 (Phases V2-0 through V2-8)"
---

# Tasks: MNU Volunteer Hours & Certificates System v2

**Input**: Design documents from `/specs/001-volunteer-hours-v2/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/api-contracts.md`, `quickstart.md`) and `docs/PLAN-v2.md` (Section 11 & Section 12).

**Organization**: Tasks are grouped strictly by phases **V2-0 through V2-8** of `docs/PLAN-v2.md` Section 12, mapped to user stories (`[US1]`–`[US6]`) from `spec.md`. Every phase includes backend model/service/route tasks, frontend page/component tasks, centralized Arabic strings in `client/src/constants/ar.ts`, mandatory automated server (`server/tests/v2-*.test.ts`) and client (`client/src/__tests__/v2-*.test.tsx`) tests covering every "Verify" item of that phase and Section 11, and a mandatory end-of-phase verification gate (`lint` + `typecheck` + `test` in both `server/` and `client/`).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (`[US1]`–`[US6]`) for story-scoped phases
- Exact file paths are included in every task description

---

## Phase V2-0: Full TypeScript Migration (Server & Client — Zero Behavior Change)

**Purpose**: Migrate 100% of `server/src`, `server/tests`, and `client/src` from `.js`/`.jsx` to strict TypeScript (`.ts`/`.tsx`) with `"strict": true` and `"noImplicitAny": true`, add `typecheck` (`tsc --noEmit`) to both packages, and verify all existing v1 tests pass without regression (`FR-001`, Principle I).

**Independent Test**: Zero `.js`/`.jsx` files remain in `server/src`, `server/tests`, or `client/src`; `npm run typecheck`, `npm run lint`, and all existing v1 server/client tests pass with zero errors.

### Setup & TypeScript Tooling (`server/` & `client/`)

- [X] T001 Install TypeScript, `tsx`, and type packages (`@types/express`, `@types/jsonwebtoken`, `@types/cors`, `@types/multer`, `@types/node` — excluding `@types/bcryptjs`) and update `dev`, `start`, `seed`, `test` (`node --import tsx --test`), `build`, and `typecheck` (`tsc --noEmit`) scripts in `server/package.json` and root `package.json`
- [X] T002 [P] Install TypeScript and `@types/*` (`@types/react`, `@types/react-dom`, `@types/canvas-confetti`) and add `typecheck` (`tsc --noEmit`) script in `client/package.json`
- [X] T003 [P] Create strict server TypeScript configuration (`"strict": true`, `"noImplicitAny": true`, NodeNext/ESNext module resolution) in `server/tsconfig.json` and update `server/eslint.config.js` for `.ts` files
- [X] T004 [P] Create strict client TypeScript configuration (`"strict": true`, `"noImplicitAny": true`, `"jsx": "react-jsx"`) in `client/tsconfig.json`, add Vite asset/env type declarations in `client/src/vite-env.d.ts`, and update `client/eslint.config.js` and `client/index.html` (`src="/src/main.tsx"`)

### Server Migration (`server/src/**/*.ts` & `server/tests/**/*.ts`)

- [X] T005 [P] Migrate server constants, config, and utilities to strict TypeScript in `server/src/constants/enums.ts`, `server/src/config/env.ts`, `server/src/config/db.ts`, `server/src/utils/errors.ts`, `server/src/utils/excelDate.ts`, and `server/src/utils/volunteerLookup.ts`
- [X] T006 [P] Migrate Mongoose models with explicit TypeScript document interfaces in `server/src/models/Admin.ts`, `server/src/models/Volunteer.ts`, `server/src/models/Activity.ts`, and `server/src/models/Settings.ts`
- [X] T007 [P] Migrate Zod schemas with exported `z.infer` types in `server/src/validators/auth.schema.ts`, `server/src/validators/volunteer.schema.ts`, and `server/src/validators/activity.schema.ts`
- [X] T008 Migrate Express middleware (`Request`/`Response`/`NextFunction` types and `Express.Request` augmentation) in `server/src/middleware/auth.ts`, `server/src/middleware/errorHandler.ts`, and `server/src/middleware/validate.ts`
- [X] T009 Migrate backend services to strict TypeScript in `server/src/services/volunteer.service.ts`, `server/src/services/activity.service.ts`, `server/src/services/stats.service.ts`, `server/src/services/excelImport.service.ts`, and `server/src/services/excelExport.service.ts`
- [X] T010 Migrate Express routes, app factory, server entrypoint, and seed scripts to strict TypeScript in `server/src/routes/auth.routes.ts`, `server/src/routes/volunteers.routes.ts`, `server/src/routes/activities.routes.ts`, `server/src/routes/stats.routes.ts`, `server/src/routes/excel.routes.ts`, `server/src/app.ts`, `server/src/server.ts`, `server/src/seed/parseWorkbook.ts`, and `server/src/seed/seed.ts`
- [X] T011 Migrate existing v1 backend integration tests to TypeScript in `server/tests/phase0.test.ts`, `server/tests/phase1.test.ts`, `server/tests/phase2.test.ts`, and `server/tests/phase6.test.ts` (and remove old `.js` files from `server/src` and `server/tests`)

### Client Migration (`client/src/**/*.ts` & `.tsx`)

- [X] T012 [P] Create shared frontend TypeScript domain and API response interfaces in `client/src/types/index.ts` and migrate `client/src/constants/enums.ts` and `client/src/constants/ar.ts`
- [X] T013 [P] Migrate client API, utilities, contexts, and custom hooks to strict TypeScript in `client/src/api/client.ts`, `client/src/utils/format.ts`, `client/src/utils/confetti.ts`, `client/src/context/authContext.ts`, `client/src/context/AuthContext.tsx`, `client/src/context/toastContext.ts`, `client/src/context/ToastContext.tsx`, `client/src/hooks/useDashboardStats.ts`, `client/src/hooks/useVolunteersList.ts`, and `client/src/hooks/useVolunteerProfile.ts`
- [X] T014 [P] Migrate shared UI, badge, certificate, dashboard, modal, profile, import/export, and volunteer components to `.tsx` with typed props in `client/src/components/ConfirmDialog.tsx`, `client/src/components/ModalFrame.tsx`, `client/src/components/Navbar.tsx`, `client/src/components/ProtectedRoute.tsx`, `client/src/components/UniversityLogo.tsx`, `client/src/components/badges/StatusBadge.tsx`, `client/src/components/certificate/CertificateSheet.tsx`, `client/src/components/dashboard/DashboardErrorState.tsx`, `client/src/components/dashboard/FacultyChart.tsx`, `client/src/components/dashboard/KpiGrid.tsx`, `client/src/components/dashboard/LeaderboardCard.tsx`, `client/src/components/importExport/ImportPreviewReport.tsx`, `client/src/components/modals/ActivityModal.tsx`, `client/src/components/modals/VolunteerModal.tsx`, `client/src/components/profile/ProfileActivitiesSection.tsx`, `client/src/components/volunteers/VolunteersTable.tsx`, and `client/src/components/volunteers/VolunteersToolbar.tsx`
- [X] T015 Migrate client pages, app router, and test suite to `.tsx`/`.ts` in `client/src/pages/LoginPage.tsx`, `client/src/pages/DashboardPage.tsx`, `client/src/pages/VolunteersPage.tsx`, `client/src/pages/VolunteerProfilePage.tsx`, `client/src/pages/ImportExportPage.tsx`, `client/src/pages/CertificatePage.tsx`, `client/src/App.tsx`, `client/src/main.tsx`, `client/src/test/setup.ts`, `client/src/test/phase3.test.tsx`, `client/src/test/phase4.test.tsx`, `client/src/test/phase5.test.tsx`, and `client/src/test/phase6.test.tsx` (and remove old `.js`/`.jsx` files from `client/src`)

### Phase V2-0 Automated Tests & Verification Gate

- [X] T016 [P] Add Phase V2-0 verification tests asserting zero `.js`/`.jsx` files in `server/src`, `server/tests`, and `client/src` and strict type/build readiness in `server/tests/v2-0-typescript.test.ts` and `client/src/__tests__/v2-0-typescript.test.tsx`
- [X] T017 **Phase V2-0 Gate**: Run and pass `npm run lint`, `npm --prefix server run typecheck`, `npm --prefix client run typecheck`, `npm --prefix server test`, and `npm --prefix client test`

---

## Phase V2-1: Users and Roles Refactor (`[US1]`)

**Goal**: Replace `Admin` with `User.ts` (`admin`, `dean`, `student`), include `role` in JWT, reload `User` from MongoDB on every request, implement `requireRole` and `buildScope`, seed admin plus one demo dean per faculty, and update client `AuthContext.tsx` and `ProtectedRoute.tsx` with role support.

**Independent Test**: Existing admin login and all v1 tests still pass; `GET /api/auth/me` returns `role`, `status`, and `faculty`; dean and student tokens receive `403` on admin-only routes; `pending`, `rejected`, and `disabled` users receive `403` everywhere except `GET /api/auth/me`.

### Backend (`server/`)

- [X] T018 [P] [US1] Add `USER_ROLES`, `USER_STATUSES`, and `INTEREST_KEYS` constants and TypeScript union types in `server/src/constants/enums.ts`
- [X] T019 [US1] Create `User` Mongoose model (replacing `Admin.ts`) with `email`, `passwordHash`, `fullName`, `role`, `faculty`, `status`, `volunteer`, `registration`, `interests`, `approvedBy`, `approvedAt`, `rejectionReason`, `lastLoginAt`, and partial unique indexes on `volunteer` (`$type: 'objectId'`) and `registration.volunteerId` in `server/src/models/User.ts`
- [X] T020 [US1] Refactor `server/src/middleware/auth.ts` to reload `User` from MongoDB on every request, enforce `status === 'active'` (`403` for `pending`/`rejected`/`disabled` on all routes except `GET /api/auth/me`), and export `requireRole(...roles: UserRole[])` and `buildScope(user): ScopeFilter`
- [X] T021 [US1] Update `POST /api/auth/login` and `GET /api/auth/me` in `server/src/routes/auth.routes.ts` and `server/src/services/auth.service.ts` to authenticate against `User`, include `role` in JWT payload, update `lastLoginAt`, and return `{ token, user, admin }` (preserving `admin` key for v1 test compatibility)
- [X] T022 [US1] Update `server/src/seed/seed.ts` to seed the `admin` `User` plus one active demo `dean` `User` per faculty in `FACULTIES`

### Frontend (`client/`)

- [X] T023 [P] [US1] Add Arabic role labels, status labels, and unauthorized/disabled account messages in `client/src/constants/ar.ts` and mirror `UserRole`, `UserStatus`, `InterestKey`, and `AuthUser` types in `client/src/types/index.ts` and `client/src/constants/enums.ts`
- [X] T024 [US1] Update `client/src/context/AuthContext.tsx` and `client/src/components/ProtectedRoute.tsx` to store `user` (`role`, `status`, `faculty`), support `allowedRoles?: UserRole[]`, and redirect `pending`/`rejected` users to `/pending` and `student` users to `/me`

### Phase V2-1 Automated Tests & Verification Gate

- [X] T025 [P] [US1] Write backend role & status integration tests (`200`, `401`, `403` for `admin`, `dean`, `student`, `pending`, `rejected`, `disabled`, and anonymous tokens across `GET /api/auth/me` and role-guarded routes) in `server/tests/v2-1-roles.test.ts`
- [X] T026 [P] [US1] Write frontend role guard and auth context tests in `client/src/__tests__/v2-1-roles.test.tsx`
- [X] T027 [US1] **Phase V2-1 Gate**: Run and pass `npm run lint`, `npm --prefix server run typecheck`, `npm --prefix client run typecheck`, `npm --prefix server test`, and `npm --prefix client test`

---

## Phase V2-2: Student Registration and Approval (`[US2]`)

**Goal**: Build student/staff self-registration (`POST /api/auth/register`), `/register` page with interest checklist, `/pending` waiting/rejection screen, `/approvals` queue page and approve/reject endpoints for deans and admin, automatic linking to existing `Volunteer` records by `volunteerId`, and `facultyMismatch` handling.

**Independent Test**: Newly registered student can log in but only sees `/pending` and gets `403` on protected APIs; approval links existing Excel-imported `Volunteer` records preserving prior hours; faculty mismatch is flagged for admin-only approval where existing `Volunteer.faculty` wins; rejected account sees Arabic rejection reason on `/pending`.

### Backend (`server/`)

- [X] T028 [P] [US2] Create Zod schemas for student registration (`registerSchema` with email, password >= 8 chars, fullName, volunteerId, category, faculty, and `interests` min 1) and registration approval/rejection (`approveRegistrationSchema`, `rejectRegistrationSchema`) in `server/src/validators/auth.schema.ts` and `server/src/validators/registration.schema.ts`
- [X] T029 [US2] Implement registration and approval service logic (duplicate `volunteerId` check across active/pending users, existing `Volunteer` lookup and `facultyMismatch` flag detection, atomic `Volunteer` linking or creation on approval where existing `Volunteer.faculty` wins, and rejection with `rejectionReason`) in `server/src/services/registration.service.ts`
- [X] T030 [US2] Wire `POST /api/auth/register` in `server/src/routes/auth.routes.ts` and create `GET /api/registrations`, `POST /api/registrations/:userId/approve`, and `POST /api/registrations/:userId/reject` (scoped by faculty for `dean`, returning `404` on cross-faculty `userId` and `403` if a `dean` attempts to approve a `facultyMismatch`) in `server/src/routes/registrations.routes.ts` and mount in `server/src/app.ts`

### Frontend (`client/`)

- [X] T031 [P] [US2] Add Arabic copy for `/register`, the 9 volunteering interest labels (`INTEREST_LABELS`), `/pending` waiting/rejection screens, and `/approvals` queue (including faculty mismatch warning) in `client/src/constants/ar.ts`
- [X] T032 [P] [US2] Build student self-registration page with category, faculty, and 9-interest checklist validation in `client/src/pages/RegisterPage.tsx` and build the pending/rejected waiting screen in `client/src/pages/PendingApprovalPage.tsx`
- [X] T033 [US2] Build `/approvals` registration review queue page for Deans and Admin (with existing volunteer link preview, faculty mismatch badge, approve action, and rejection reason modal) in `client/src/pages/ApprovalsPage.tsx` and register `/register`, `/pending`, and `/approvals` routes in `client/src/App.tsx` and `client/src/components/Navbar.tsx`

### Phase V2-2 Automated Tests & Verification Gate

- [X] T034 [P] [US2] Write backend registration & linking tests (pending flow, `403` on protected APIs, approval creating new volunteer vs. linking existing Excel-imported volunteer preserving hours, `facultyMismatch` admin-only approval where existing faculty wins, rejection with Arabic reason, duplicate `volunteerId` conflict including concurrent pending registrations, and multiple pending users with `volunteer: null` coexisting) in `server/tests/v2-2-registration.test.ts`
- [X] T035 [P] [US2] Write frontend registration, `/pending` waiting/rejection screen, and `/approvals` workflow tests in `client/src/__tests__/v2-2-registration.test.tsx`
- [X] T036 [US2] **Phase V2-2 Gate**: Run and pass `npm run lint`, `npm --prefix server run typecheck`, `npm --prefix client run typecheck`, `npm --prefix server test`, and `npm --prefix client test`

---

## Phase V2-3: Dean Scoping & Admin Dean Management (`[US1]`)

**Goal**: Scope `volunteers`, `activities` (via `scopeActivities`), `stats`, `excel` export, and certificate endpoints using `buildScope`; force dean's faculty on create/update; return `404` on cross-faculty ID access; enforce volunteer deletion guards (`Activity`, `Application`, `User`); block student access to certificates; and build `/api/users`, `/api/settings`, and the `/deans` management page.

**Independent Test**: Dean A never sees Faculty B data anywhere (`404` on cross-faculty ID lookups); request bodies sent by a dean with another faculty name are overwritten with Dean A's faculty; student tokens receive `403` on certificate/volunteer endpoints; Admin manages dean accounts and resets temporary passwords.

### Backend (`server/`)

- [X] T037 [P] [US1] Create Zod schemas for Dean account creation, status toggling, temporary password resets, and settings updates in `server/src/validators/user.schema.ts` and `server/src/validators/settings.schema.ts`
- [X] T038 [US1] Update `server/src/services/volunteer.service.ts` and `server/src/routes/volunteers.routes.ts` to require `requireRole('admin', 'dean')`, accept `scope: ScopeFilter`, force `req.user.faculty` on dean create/update, return `404` on out-of-faculty `volunteerId` (protecting certificate profile fetches), and block `deleteVolunteer` with `409` if the volunteer has activities or a linked `User` account
- [X] T039 [US1] Implement `scopeActivities(scope: ScopeFilter)` helper and update `server/src/services/activity.service.ts` and `server/src/routes/activities.routes.ts` so deans can only list, create, update, approve/reject, or delete activities for volunteers in their own faculty (returning `404` otherwise)
- [X] T040 [US1] Update `server/src/services/stats.service.ts`, `server/src/routes/stats.routes.ts`, `server/src/services/excelExport.service.ts`, and `server/src/routes/excel.routes.ts` to scope all queries and exports via `buildScope(req.user)` and restrict `POST /api/excel/import` to `requireRole('admin')`
- [X] T041 [US1] Implement user & settings services and routes (`GET /api/users`, `POST /api/users`, `PATCH /api/users/:id` for admin dean management and admin/dean student temporary password reset; `GET /api/settings`, `PATCH /api/settings`) in `server/src/services/user.service.ts`, `server/src/services/settings.service.ts`, `server/src/routes/users.routes.ts`, and `server/src/routes/settings.routes.ts`, and mount in `server/src/app.ts`

### Frontend (`client/`)

- [X] T042 [P] [US1] Add Arabic strings for Dean account management (`/deans`), temporary password reset modals, dedicated activities page (`/activities`), and faculty-scoped labels in `client/src/constants/ar.ts`
- [X] T043 [P] [US1] Build Admin Dean Management page (`/deans` — list deans, create dean account, enable/disable dean, reset temporary password) in `client/src/pages/DeansPage.tsx` and build dedicated Activities management page in `client/src/pages/ActivitiesPage.tsx`
- [X] T044 [US1] Update `client/src/pages/VolunteersPage.tsx`, `client/src/components/modals/VolunteerModal.tsx`, `client/src/pages/ImportExportPage.tsx` (aliased at `/excel`), `client/src/pages/CertificatePage.tsx`, `client/src/components/Navbar.tsx`, and `client/src/App.tsx` for Dean faculty locking (hide faculty selector/import for deans, add student password reset action, and block students from `/certificate/:volunteerId`)

### Phase V2-3 Automated Tests & Verification Gate

- [X] T045 [P] [US1] Write backend faculty scoping, anti-enumeration (`404` for Dean A accessing Faculty B volunteers/activities/registrations/passwords/certificates), forced-faculty body override, student certificate `403`, volunteer deletion guard, and admin dean management tests in `server/tests/v2-3-scoping.test.ts`
- [X] T046 [P] [US1] Write frontend Dean scoping, `/deans` management, and certificate role-guard tests in `client/src/__tests__/v2-3-scoping.test.tsx`
- [X] T047 [US1] **Phase V2-3 Gate**: Run and pass `npm run lint`, `npm --prefix server run typecheck`, `npm --prefix client run typecheck`, `npm --prefix server test`, and `npm --prefix client test`

---

## Phase V2-4: Opportunities and Applications Engine (`[US3]`)

**Goal**: Implement `Opportunity.ts` and `Application.ts` models, `Africa/Cairo` phase calculation, opportunity CRUD and publish/cancel actions, edit locks once `acceptedCounts > 0`, apply/withdraw endpoints, manual accept/reject, category slots (`student | academic | admin`), `auto` and `manual` modes, concurrency-safe atomic slot claims via `findOneAndUpdate`, automatic FIFO waitlist promotion on withdrawal, re-application reactivation, and read-only dean applicant views on admin opportunities.

**Independent Test**: Parallel capacity race test passes (`accepted === M`, `waitlisted === N - M`); withdrawal before `startAt` promotes oldest waitlisted applicant of the same category; `acceptedCounts` always equals accepted applications across withdraw, reject-after-accept, and cancel; withdraw → re-apply reactivates the same document at the back of the waitlist; edit locks enforce slot minimums and field locks once anyone is accepted.

### Backend (`server/`)

- [X] T048 [P] [US3] Implement `Africa/Cairo` timezone phase evaluation (`upcoming`, `registration_closed`, `in_progress`, `ended`) and check-in window helpers in `server/src/utils/cairoTime.ts` and add opportunity/application enum constants in `server/src/constants/enums.ts`
- [X] T049 [P] [US3] Create `Opportunity` Mongoose model (`slots`, `acceptedCounts`, `approvalMode`, `status`, `fields`, `activityType`, `location`, `startAt`, `endAt`, `registrationDeadline`, `hours`, `faculty`, `createdBy`) in `server/src/models/Opportunity.ts` and `Application` Mongoose model (with unique compound index `(opportunity, volunteer)` and waitlist index `(opportunity, status, category, appliedAt)`) in `server/src/models/Application.ts` (and add `Application.exists` check to `deleteVolunteer` in `server/src/services/volunteer.service.ts`)
- [X] T050 [P] [US3] Create Zod validation schemas for opportunity creation/editing (`endAt > startAt`, `registrationDeadline <= startAt`, at least one slot `> 0`, `hours > 0`) and application submission/status updates in `server/src/validators/opportunity.schema.ts` and `server/src/validators/application.schema.ts`
- [X] T051 [US3] Implement opportunity service (create with forced dean faculty, edit locks once any `acceptedCounts.<cat> > 0` or when `completed`/`cancelled`, publish, cancel resetting `acceptedCounts` and cancelling active applications, and scoped listing) in `server/src/services/opportunity.service.ts`
- [X] T052 [US3] Implement concurrency-safe application service (eligibility checks, atomic slot claim via `Opportunity.findOneAndUpdate` with `$expr: { $lt: ["$acceptedCounts.<cat>", "$slots.<cat>"] }` and `$inc`, decrement on every exit from `accepted`, automatic FIFO waitlist promotion on withdrawal before `startAt` in `auto` mode, reactivation of `cancelled` applications with refreshed `appliedAt`, block on `rejected` re-apply, and dean read-only faculty-filtered applicant view on admin `faculty: null` opportunities) in `server/src/services/application.service.ts`
- [X] T053 [US3] Create opportunity and application routes (`GET/POST /api/opportunities`, `GET/PATCH /api/opportunities/:id`, `POST /:id/publish`, `POST /:id/cancel`, `POST/DELETE /:id/apply`, `GET /:id/applications`, `PATCH /api/applications/:id`) in `server/src/routes/opportunities.routes.ts` and `server/src/routes/applications.routes.ts` and mount in `server/src/app.ts`

### Frontend (`client/`)

- [X] T054 [P] [US3] Add Arabic strings for opportunities, category slots, approval modes, phases, applicant management, waitlist badges, and edit-lock messages in `client/src/constants/ar.ts` and add `Opportunity` and `Application` interfaces in `client/src/types/index.ts`
- [X] T055 [P] [US3] Build Opportunity creation/editing page (`/opportunities/new` and edit mode with locked-field indicators once applicants are accepted) in `client/src/pages/OpportunityFormPage.tsx`
- [X] T056 [US3] Build Organizer Opportunities management page (`/opportunities/manage`) and applicants review modal/table (supporting manual accept/reject/waitlist for poster/admin and read-only faculty-filtered view for deans on admin opportunities) in `client/src/pages/OpportunitiesManagePage.tsx` and `client/src/components/opportunities/ApplicantsModal.tsx`, and wire routes in `client/src/App.tsx`

### Phase V2-4 Automated Tests & Verification Gate

- [X] T057 [P] [US3] Write backend opportunity & concurrency tests (parallel `N` applications for `M < N` slots race test, `auto` waitlist & FIFO promotion on withdrawal before `startAt`, `manual` pending/accept/409 full conflict, `acceptedCounts` consistency across withdraw/reject-after-accept/cancel, edit locks after acceptance, withdraw → re-apply reactivation at back of waitlist, rejected re-apply block, and dean read-only faculty applicant view on admin opportunities) in `server/tests/v2-4-opportunities.test.ts`
- [X] T058 [P] [US3] Write frontend opportunity creation, edit locks, and organizer applicant management tests in `client/src/__tests__/v2-4-opportunities.test.tsx`
- [X] T059 [US3] **Phase V2-4 Gate**: Run and pass `npm run lint`, `npm --prefix server run typecheck`, `npm --prefix client run typecheck`, `npm --prefix server test`, and `npm --prefix client test`

---

## Phase V2-5: Student Portal and Recommendations (`[US4]`)

**Goal**: Implement server-side recommendation scoring (`+10` per matched interest, `+3` faculty target, `+2` deadline <= 3d, `+1` <= 25% slots left, `+1` per past attended field max `+3`, tie-break earliest `startAt`), build the student portal (`/me`, `/opportunities`, `/opportunities/:id`, `/me/applications`, `/me/profile`), and enforce certificate eligibility display without any student certificate access.

**Independent Test**: Student with `medical` and `agriculture_environment` interests sees matching opportunities ranked first with Arabic match badges; already-applied, cancelled, and closed opportunities are excluded from top recommendations while full ones appear last with a waitlist badge; hours remaining and eligibility badge at `Settings.certificateHours` are accurate; student has no certificate route and receives `403` on certificate endpoints.

### Backend (`server/`)

- [X] T060 [P] [US4] Implement deterministic recommendation scoring service (`recommendationScore`, `matchedFields`, exclusion of already-applied/cancelled/registration_closed from top, full opportunities placed last with waitlist indicator, tie-broken by earliest `startAt`) in `server/src/services/recommendation.service.ts` and integrate with `GET /api/opportunities?sort=recommended` in `server/src/routes/opportunities.routes.ts`
- [X] T061 [US4] Implement `PATCH /api/auth/me` (update student `interests` and change password) in `server/src/routes/auth.routes.ts` and `GET /api/applications/me` (or student application list in `GET /api/stats/me`) in `server/src/routes/applications.routes.ts`

### Frontend (`client/`)

- [X] T062 [P] [US4] Add Arabic strings for the student portal (`/me`, `/opportunities`, `/me/applications`, `/me/profile`), matched interest badges (`"يناسب اهتمامك: ..."`), waitlist badge (`"انضم لقائمة الانتظار"`), and certificate eligibility notice (`"مؤهل للشهادة — تُستلم من الكلية"`) in `client/src/constants/ar.ts`
- [X] T063 [P] [US4] Build Student Opportunities Board (`/opportunities`) with recommendation sorting and Arabic matched-interest badges in `client/src/pages/OpportunitiesBoardPage.tsx` and Opportunity Details page (`/opportunities/:id`) with apply/withdraw actions in `client/src/pages/OpportunityDetailsPage.tsx`
- [X] T064 [US4] Build Student Dashboard shell (`/me` with approved hours, dynamic `Settings.certificateHours` progress bar, eligibility badge without print/download, recommendations, and recent activities), My Applications page (`/me/applications`), and Student Profile page (`/me/profile` for editing interests and password) in `client/src/pages/StudentDashboardPage.tsx`, `client/src/pages/MyApplicationsPage.tsx`, and `client/src/pages/StudentProfilePage.tsx`, and wire student routes in `client/src/App.tsx`

### Phase V2-5 Automated Tests & Verification Gate

- [X] T065 [P] [US4] Write backend recommendation scoring & student portal tests (deterministic scoring formula, tie-breaking, exclusion of applied/closed/cancelled from top, full opportunities at bottom, `matchedFields` accuracy, `PATCH /api/auth/me` interest updates, and `403` on certificate endpoints for student tokens) in `server/tests/v2-5-recommendations.test.ts`
- [X] T066 [P] [US4] Write frontend student portal tests (`/opportunities` matched badges, apply/withdraw flow, `/me` certificate threshold math at `C-1`, `C`, `C+1` with no certificate link, and `/me/profile` interest editing) in `client/src/__tests__/v2-5-student-portal.test.tsx`
- [X] T067 [US4] **Phase V2-5 Gate**: Run and pass `npm run lint`, `npm --prefix server run typecheck`, `npm --prefix client run typecheck`, `npm --prefix server test`, and `npm --prefix client test`

---

## Phase V2-6: Live Mode, Rotating QR Check-in, and Completion (`[US5]`)

**Goal**: Implement 45-second signed rotating QR check-in tokens, live check-in validation within `[startAt - 30m, endAt]` in `Africa/Cairo`, manual organizer check-in toggle, live organizer view (`/opportunities/:id/live`) with `qrcode.react` and 10s polling, student "Happening Now" banner and `/checkin/:opportunityId` page, and idempotent `POST /api/opportunities/:id/complete` backed by a partial unique index on `Activity.application`.

**Independent Test**: Expired QR token (>45s), wrong opportunity token, unaccepted student, outside `[startAt - 30m, endAt]` window, or check-in after completion all fail with Arabic errors; completing an event after `endAt` credits approved hours to attendees only, records no-shows with 0 hours, and calling `/complete` twice creates zero duplicates (`409` if called before `endAt` or on `cancelled`).

### Backend (`server/`)

- [X] T068 [P] [US5] Extend `server/src/models/Activity.ts` with optional `opportunity` and `application` (`Types.ObjectId | null`) fields and a partial unique index on `application` (`{ unique: true, partialFilterExpression: { application: { $type: 'objectId' } } }`)
- [X] T069 [US5] Implement live check-in and idempotent completion service (`generateCheckInToken` valid 45s, `verifyAndCheckIn` checking `[startAt - 30m, endAt]` in `Africa/Cairo` and `status === 'accepted'`, `toggleManualCheckIn`, `getLiveOpportunityState`, and idempotent `completeOpportunity` upserting `approved` `Activity` records keyed by `application` only after `endAt`) in `server/src/services/checkin.service.ts`
- [X] T070 [US5] Wire `GET /api/opportunities/:id/checkin-token`, `POST /api/opportunities/:id/checkin`, `POST /api/opportunities/:id/checkin/manual`, `GET /api/opportunities/:id/live`, and `POST /api/opportunities/:id/complete` in `server/src/routes/opportunities.routes.ts`

### Frontend (`client/`)

- [X] T071 [P] [US5] Install `qrcode.react` in `client/package.json` and add Arabic strings for live check-in, rotating QR display, attendance counters (`accepted`, `checkedIn`, `notArrived`), "Happening Now" (`"يجري الآن"`) banner, and event completion confirmation in `client/src/constants/ar.ts`
- [X] T072 [P] [US5] Build Organizer Live Event page (`/opportunities/:id/live`) displaying the rotating QR code (refreshed every 30s), live attendance counters and attendee table (polled every 10s), manual check-in toggle, and "Complete Event" action in `client/src/pages/OpportunityLivePage.tsx`
- [X] T073 [US5] Build Student Check-in page (`/checkin/:opportunityId`) in `client/src/pages/CheckInPage.tsx`, add the "Happening Now" live banner to `client/src/pages/StudentDashboardPage.tsx`, and register `/opportunities/:id/live` and `/checkin/:opportunityId` routes in `client/src/App.tsx`

### Phase V2-6 Automated Tests & Verification Gate

- [X] T074 [P] [US5] Write backend check-in & idempotent completion tests (45s token expiry, wrong opportunity token, unaccepted student, outside `[startAt - 30m, endAt]` window, check-in after completion, manual check-in toggle, `/complete` before `endAt` or on `cancelled` returning `409`, and calling `/complete` twice creating exactly one `approved` `Activity` per attended student and `0` hours for no-shows) in `server/tests/v2-6-checkin.test.ts`
- [X] T075 [P] [US5] Write frontend live organizer QR rotation/manual check-in and student "Happening Now" check-in tests in `client/src/__tests__/v2-6-live-checkin.test.tsx`
- [X] T076 [US5] **Phase V2-6 Gate**: Run and pass `npm run lint`, `npm --prefix server run typecheck`, `npm --prefix client run typecheck`, `npm --prefix server test`, and `npm --prefix client test`

---

## Phase V2-7: Role-Based Dashboards & Recharts Analytics (`[US6]`)

**Goal**: Implement `/api/stats/participation`, `/api/stats/events`, `/api/stats/monthly-hours`, and `/api/stats/me` scoped via `buildScope` and `scopeActivities`; build Recharts analytics widgets for Student, Dean, and Admin dashboards in RTL Arabic down to 375px width with Arabic empty, loading, and error states.

**Independent Test**: Dean dashboard numbers for Faculty X match Admin numbers filtered to Faculty X; participation funnel math is consistent (`applied >= accepted >= attended`); all charts render in RTL Arabic at 375px mobile width with no English text.

### Backend (`server/`)

- [X] T077 [US6] Extend `server/src/services/stats.service.ts` and `server/src/routes/stats.routes.ts` with `GET /api/stats/participation` (funnel: `applied`, `accepted`, `attended`, `rejected`, `noShow`; engagement donut: `joined` vs. `zeroHours`), `GET /api/stats/events` (top events, slot fill rate, no-show rate per completed opportunity), `GET /api/stats/monthly-hours` (approved hours per month), `GET /api/stats/me` (full student dashboard summary), and updated `GET /api/stats/overview` & `/faculties` (including `eventsThisMonth`, `pendingRegistrations`, `pendingApplications`, `certificateBuckets` relative to `Settings.certificateHours`, and zero-hour students list) using `buildScope(req.user)` + optional `?faculty=` filter for `admin`

### Frontend (`client/`)

- [X] T078 [P] [US6] Install `recharts` in `client/package.json` and add Arabic chart titles, axis/tooltip labels, funnel stage labels, certificate progress bucket labels, and empty/loading/error state strings in `client/src/constants/ar.ts`
- [X] T079 [P] [US6] Build RTL Recharts dashboard components (Participation Funnel chart, Engagement Donut chart, Monthly Approved Hours Line chart, Certificate Progress Buckets bar/card widget, Faculty Comparison chart, and Event Efficiency table/cards) in `client/src/components/dashboard/ParticipationFunnelChart.tsx`, `client/src/components/dashboard/EngagementDonutChart.tsx`, `client/src/components/dashboard/MonthlyHoursChart.tsx`, `client/src/components/dashboard/CertificateBucketsCard.tsx`, `client/src/components/dashboard/FacultyComparisonChart.tsx`, and `client/src/components/dashboard/EventEfficiencyCard.tsx`
- [X] T080 [US6] Update `client/src/pages/DashboardPage.tsx`, `client/src/pages/StudentDashboardPage.tsx`, `client/src/hooks/useDashboardStats.ts`, and `client/src/hooks/useStudentDashboard.ts` to assemble the complete Admin, Dean, and Student dashboards with 375px mobile responsiveness and Arabic empty/loading/error states

### Phase V2-7 Automated Tests & Verification Gate

- [X] T081 [P] [US6] Write backend analytics consistency tests asserting that Dean stats for Faculty X equal Admin stats filtered to Faculty X across overview KPIs, participation funnel (`applied >= accepted >= attended`), engagement donut, monthly hours, and certificate progress buckets relative to `Settings.certificateHours` in `server/tests/v2-7-stats.test.ts`
- [X] T082 [P] [US6] Write frontend Admin, Dean, and Student dashboard rendering, RTL Arabic chart label, and empty/loading/error state tests in `client/src/__tests__/v2-7-dashboards.test.tsx`
- [X] T083 [US6] **Phase V2-7 Gate**: Run and pass `npm run lint`, `npm --prefix server run typecheck`, `npm --prefix client run typecheck`, `npm --prefix server test`, and `npm --prefix client test`

---

## Phase V2-8: Security Hardening, Demo Data, and Documentation (`[US6]`)

**Goal**: Add HTTP security headers (`helmet`), rate limiting (`express-rate-limit`) on login, registration, and QR check-in, and optional `ALLOWED_EMAIL_DOMAINS` validation; expand `seed.ts` with comprehensive demo data across all roles and opportunity states; and verify the full end-to-end walkthrough.

**Independent Test**: Security headers and rate limits protect `/api/auth/login`, `/api/auth/register`, and `/api/opportunities/:id/checkin` with Arabic `429` messages; `ALLOWED_EMAIL_DOMAINS` restricts registration when configured; `npm run seed` populates admin, deans, approved/pending students, and upcoming/live/completed opportunities enabling the full demo walkthrough ending with certificate printing by a dean or admin.

### Backend & Seed (`server/`)

- [ ] T084 [P] [US6] Install `helmet` and `express-rate-limit` in `server/package.json`, add `ALLOWED_EMAIL_DOMAINS` parsing in `server/src/config/env.ts`, and create configurable rate-limiting middleware (with Arabic `429` error responses) in `server/src/middleware/rateLimiter.ts`
- [ ] T085 [US6] Wire `helmet()` and rate limiters on `POST /api/auth/login`, `POST /api/auth/register`, and `POST /api/opportunities/:id/checkin` in `server/src/app.ts`, `server/src/routes/auth.routes.ts`, and `server/src/routes/opportunities.routes.ts`, and enforce `ALLOWED_EMAIL_DOMAINS` in `server/src/services/registration.service.ts`
- [ ] T086 [US6] Expand `server/src/seed/seed.ts` to idempotently seed the Admin account, Dean accounts per faculty, approved and pending Student accounts (including linked Excel volunteers), and Opportunities in `upcoming`, `in_progress` (live check-in open), and `completed` (with credited approved hours) states

### Frontend & Documentation (`client/` & `docs/`)

- [ ] T087 [P] [US6] Add Arabic `429` rate-limit and email-domain validation messages in `client/src/constants/ar.ts` and document demo credentials and walkthrough steps in `server/.env.example` and `specs/001-volunteer-hours-v2/quickstart.md`

### Phase V2-8 Automated Tests & Final Verification Gate

- [ ] T088 [P] [US6] Write backend security hardening (`helmet` headers, rate-limit `429` throttling on login/register/checkin, `ALLOWED_EMAIL_DOMAINS` enforcement) and full demo seed walkthrough tests (Admin → Dean → Student → Live QR Check-in → Event Completion → Certificate eligibility & Dean/Admin certificate access) in `server/tests/v2-8-security.test.ts`
- [ ] T089 [P] [US6] Write frontend end-to-end role walkthrough and rate-limit error display tests in `client/src/__tests__/v2-8-walkthrough.test.tsx`
- [ ] T090 [US6] **Phase V2-8 Final Gate**: Run and pass `npm run lint`, `npm --prefix server run typecheck`, `npm --prefix client run typecheck`, `npm --prefix server test`, and `npm --prefix client test`

---

## Dependencies & Execution Order

### Phase Completion Order (Strict Sequential Phases with Gates)

```text
Phase V2-0 (TypeScript Migration)
  └──► Phase V2-1 (Users & Roles Refactor) [US1]
         └──► Phase V2-2 (Student Registration & Approval) [US2]
                └──► Phase V2-3 (Dean Scoping & Admin Dean Management) [US1]
                       └──► Phase V2-4 (Opportunities & Applications Engine) [US3]
                              └──► Phase V2-5 (Student Portal & Recommendations) [US4]
                                     └──► Phase V2-6 (Live Mode, QR Check-in & Completion) [US5]
                                            └──► Phase V2-7 (Role-Based Dashboards & Recharts) [US6]
                                                   └──► Phase V2-8 (Security Hardening & Demo Seed) [US6]
```

### User Story Mapping

| User Story | Priority | Phases Delivering the Story | Independent Verification Test |
| --- | --- | --- | --- |
| **Baseline (TS Strict Mode)** | Foundation | `Phase V2-0` | `server/tests/v2-0-typescript.test.ts` + `client/src/__tests__/v2-0-typescript.test.tsx` + all v1 tests |
| **US1**: Multi-Role Access, Faculty Isolation & Dean Management | P1 (MVP) | `Phase V2-1`, `Phase V2-3` | `server/tests/v2-1-roles.test.ts`, `server/tests/v2-3-scoping.test.ts`, `client/src/__tests__/v2-1-roles.test.tsx`, `client/src/__tests__/v2-3-scoping.test.tsx` |
| **US2**: Volunteer Self-Registration, Account Approval & Record Linking | P1 (MVP) | `Phase V2-2` | `server/tests/v2-2-registration.test.ts`, `client/src/__tests__/v2-2-registration.test.tsx` |
| **US3**: Volunteering Opportunities, Category Capacity & Waitlist Engine | P2 | `Phase V2-4` | `server/tests/v2-4-opportunities.test.ts`, `client/src/__tests__/v2-4-opportunities.test.tsx` |
| **US4**: Smart Recommendations & Student Volunteer Portal | P2 | `Phase V2-5` | `server/tests/v2-5-recommendations.test.ts`, `client/src/__tests__/v2-5-student-portal.test.tsx` |
| **US5**: Live Event Check-in & Idempotent Hour Crediting | P2 | `Phase V2-6` | `server/tests/v2-6-checkin.test.ts`, `client/src/__tests__/v2-6-live-checkin.test.tsx` |
| **US6**: Role-Based Analytics Dashboards & Production Readiness | P3 | `Phase V2-7`, `Phase V2-8` | `server/tests/v2-7-stats.test.ts`, `server/tests/v2-8-security.test.ts`, `client/src/__tests__/v2-7-dashboards.test.tsx`, `client/src/__tests__/v2-8-walkthrough.test.tsx` |

---

## Parallel Execution Examples per Phase

```text
# Phase V2-0: Parallel server & client file migrations after tsconfig setup (T001–T004)
Task T005: Migrate server constants, config, and utilities in server/src/constants/enums.ts, ...
Task T006: Migrate Mongoose models in server/src/models/*.ts
Task T007: Migrate Zod schemas in server/src/validators/*.ts
Task T012: Create client types and migrate constants in client/src/types/index.ts, client/src/constants/*.ts

# Phase V2-4: Parallel model, schema, and timezone utility creation before services
Task T048: Implement Africa/Cairo phase evaluation in server/src/utils/cairoTime.ts
Task T049: Create Opportunity.ts and Application.ts models in server/src/models/
Task T050: Create opportunity.schema.ts and application.schema.ts in server/src/validators/
Task T054: Add Arabic opportunity strings in client/src/constants/ar.ts and types in client/src/types/index.ts

# End of Every Phase: Parallel server & client test authoring before the Phase Gate
Task T057: Write backend concurrency & waitlist tests in server/tests/v2-4-opportunities.test.ts
Task T058: Write frontend opportunity & applicant tests in client/src/__tests__/v2-4-opportunities.test.tsx
```

---

## Implementation Strategy

1. **Execute One Phase at a Time**: Run `/speckit-implement` per phase (`Phase V2-0` first, then `V2-1`, ..., `V2-8`).
2. **Never Skip a Phase Gate**: Every phase ends with a mandatory gate task (`T017`, `T027`, `T036`, `T047`, `T059`, `T067`, `T076`, `T083`, `T090`) that runs `npm run lint`, `npm --prefix server run typecheck`, `npm --prefix client run typecheck`, `npm --prefix server test`, and `npm --prefix client test`. Do not start the next phase until all four checks pass with zero errors.
3. **MVP Milestone**: Completing `Phase V2-0` through `Phase V2-3` delivers a complete, production-safe P1 increment (100% strict TypeScript, Admin/Dean/Student roles, student self-registration & Excel record linking, and strict faculty-scoped Dean management).
