# Implementation Plan: MNU Volunteer Hours & Certificates System v2

**Branch**: `001-volunteer-hours-v2` | **Date**: 2026-11-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-volunteer-hours-v2/spec.md` and `docs/PLAN-v2.md`

## Summary

Upgrade the MNU Volunteer Hours & Certificates System to **v2** across 9 sequential phases (`V2-0` through `V2-8`):
1. **100% Strict TypeScript Migration (`V2-0`)**: Migrate every file in `server/src`, `server/tests`, and `client/src` from JavaScript to strict TypeScript (`"strict": true`, `"noImplicitAny": true`) with zero behavioral regression on v1 tests.
2. **Multi-Role Authentication, Self-Registration & Faculty Isolation (`V2-1` to `V2-3`)**: Replace `Admin` with `User` (`admin`, `dean`, `student`), implement fresh DB-reloaded JWT authentication, student self-registration (`/register`) with automatic `Volunteer` record linking by `volunteerId` and faculty mismatch detection, dean faculty locking (`buildScope` + `scopeActivities`, returning `404` on cross-faculty access), and certificate protection (`admin` and `dean` only).
3. **Volunteering Opportunities, Concurrency-Safe Capacity & Waitlist Engine (`V2-4`)**: Implement `Opportunity` and `Application` models with category slot allocations (`student`, `academic`, `admin`), atomic `$expr` + `$inc` slot claims via `findOneAndUpdate`, automatic FIFO waitlist promotion on withdrawal, and re-application reactivation.
4. **Student Portal & Deterministic Recommendations (`V2-5`)**: Build the student portal (`/me`, `/opportunities`, `/me/applications`, `/me/profile`) and server-side recommendation scoring (`+10` per interest match, `+3` faculty target, `+2` deadline <= 3d, `+1` <= 25% slots left, `+1` per past attended field up to `+3`) with Arabic matched-interest badges.
5. **Live Mode, Rotating QR Check-in & Idempotent Completion (`V2-6`)**: Evaluate phases and check-in windows (`[startAt - 30m, endAt]`) in `Africa/Cairo`, generate ~45s signed rotating check-in tokens (`qrcode.react`), and implement idempotent event completion (`POST /api/opportunities/:id/complete`) backed by a partial unique index on `Activity.application`.
6. **Role-Based Recharts Dashboards & Production Hardening (`V2-7` to `V2-8`)**: Deliver Student, Dean, and Admin analytics dashboards (Recharts in RTL Arabic at 375px width, guaranteeing Dean Faculty X stats equal Admin stats filtered to Faculty X), add `helmet` and `express-rate-limit`, and expand the seed script for a complete end-to-end demo walkthrough.

## Technical Context

**Language/Version**: TypeScript 5.x (`"strict": true`, `"noImplicitAny": true`) on Node.js 22+ (`server/`) and ES2022/DOM (`client/`).

**Primary Dependencies**:
- `server/`: Express `^5.3.0`, Mongoose `^9.12.1`, Zod `^4.6.7`, `jsonwebtoken` `^9.0.3`, `bcryptjs` `^3.0.3` (ships built-in types — do NOT install `@types/bcryptjs`), `exceljs` `^4.4.0`, `multer` `^2.5.0`, `cors` `^2.8.6`, `dotenv` `^18.0.10`, plus `helmet` and `express-rate-limit` (in `V2-8`). Dev/types: `typescript`, `tsx`, `@types/express`, `@types/jsonwebtoken`, `@types/cors`, `@types/multer`, `@types/node`.
- `client/`: React `^19.3.1`, React Router DOM `^7.18.5`, Vite `^8.3.8`, Tailwind CSS `^4.3.5` (RTL, `@fontsource/cairo`), Axios `^1.21.1`, `lucide-react` `^1.73.0`, `canvas-confetti` `^1.9.4`, plus new v2 packages `recharts` and `qrcode.react`.

**Storage**: MongoDB (Atlas / local) via Mongoose 9 with partial unique indexes on `User.volunteer`, `User.registration.volunteerId`, and `Activity.application`, and compound unique index on `Application (opportunity, volunteer)`.

**Testing**:
- `server/`: Node native test runner executed via `tsx` (`node --import tsx --test tests/*.test.ts`).
- `client/`: Vitest `^5.1.0` + `@testing-library/react` `^16.3.3` + `@testing-library/user-event` `^14.6.10` + `msw` `^3.0.5` + `jsdom` `^29.1.1`.

**Target Platform**: Web application (Express REST API on Railway + React SPA on Vercel, responsive down to 375px mobile width in RTL Arabic).

**Project Type**: Full-stack TypeScript web application monorepo (`server/` + `client/`).

**Performance Goals**: Atomic single-roundtrip slot claiming under concurrent load; live check-in polling every 10s and QR token rotation every 30s (~45s TTL); instant dashboard aggregation via indexed MongoDB pipelines.

**Constraints**:
- 100% Arabic UI (`<html lang="ar" dir="rtl">`, strings in `client/src/constants/ar.ts`, `ar-EG` formatting, `Africa/Cairo` phase/window evaluation, UTC DB storage).
- Local email + password JWT auth only (no OAuth, no external email/SMTP service).
- Schemas live in `server/src/validators/*.ts` (Zod); mirrored TypeScript interfaces live in `client/src/types/` (no shared workspace package).

**Scale/Scope**: 7 MNU faculties, 3 login roles (`admin`, `dean`, `student`), 3 affiliation categories (`student`, `academic`, `admin`), 9 interest domains, 9 delivery phases (`V2-0` to `V2-8`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Design Verification |
| --- | --- | --- |
| **I. 100% TypeScript Strict Mode** | **PASS** | Phase `V2-0` migrates all files in `server/src`, `server/tests`, and `client/src` to `.ts`/`.tsx` with `"strict": true` and adds `npm run typecheck` (`tsc --noEmit`) before any v2 feature work begins. |
| **II. Arabic-First & RTL User Experience** | **PASS** | `<html lang="ar" dir="rtl">`, centralized `client/src/constants/ar.ts`, `ar-EG` locale formatting, UTC DB storage, and `Africa/Cairo` timezone evaluation for opportunity phases and check-in windows are enforced in `data-model.md` and `api-contracts.md`. |
| **III. Server-Enforced RBAC & Faculty Isolation** | **PASS** | `authenticate` reloads `User` from MongoDB on every request; `pending`/`rejected`/`disabled` receive `403` everywhere except `GET /api/auth/me`; `buildScope(user)` + `scopeActivities(scope)` lock deans to their DB faculty and return `404` on cross-faculty ID access; certificate routes/endpoints require `admin` or `dean` (scoped). |
| **IV. Data Integrity, Concurrency Safety & Idempotency** | **PASS** | Only `approved` hours count toward `Settings.certificateHours`; slot claims use a single atomic `findOneAndUpdate` with `$expr: { $lt: ["$acceptedCounts.<cat>", "$slots.<cat>"] }` and `$inc`, and every exit from `accepted` decrements the counter; `/complete` upserts by `application` with a partial unique index on `Activity.application`. |
| **V. Automated Verification Gate per Phase** | **PASS** | Every phase (`V2-0`..`V2-8`) gates advancement on `npm run lint`, `npm run typecheck`, `server` integration tests (`node --import tsx --test`), and `client` Vitest + MSW tests. |

## Project Structure

### Documentation (this feature)

```text
specs/001-volunteer-hours-v2/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 architecture & stack decisions
├── data-model.md        # Phase 1 Mongoose schemas, partial indexes, and state rules
├── quickstart.md        # Phase 1 verification & walkthrough guide
├── contracts/
│   └── api-contracts.md # Phase 1 REST API & client route contracts
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
server/
├── tsconfig.json
├── package.json
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   │   ├── db.ts
│   │   └── env.ts
│   ├── constants/
│   │   └── enums.ts
│   ├── middleware/
│   │   ├── auth.ts              # authenticate (DB reload), requireActive, requireRole, buildScope
│   │   ├── errorHandler.ts
│   │   ├── rateLimiter.ts       # Phase V2-8 login/register/checkin rate limiters
│   │   └── validate.ts
│   ├── models/
│   │   ├── User.ts              # Replaces Admin.js; partial unique indexes on volunteer & registration.volunteerId
│   │   ├── Volunteer.ts
│   │   ├── Opportunity.ts
│   │   ├── Application.ts
│   │   ├── Activity.ts          # Extended with opportunity, application + partial unique index
│   │   └── Settings.ts
│   ├── validators/
│   │   ├── auth.schema.ts
│   │   ├── user.schema.ts
│   │   ├── registration.schema.ts
│   │   ├── volunteer.schema.ts
│   │   ├── activity.schema.ts
│   │   ├── opportunity.schema.ts
│   │   ├── application.schema.ts
│   │   └── settings.schema.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── user.service.ts
│   │   ├── registration.service.ts
│   │   ├── volunteer.service.ts
│   │   ├── activity.service.ts  # Includes scopeActivities(scope) helper
│   │   ├── opportunity.service.ts
│   │   ├── application.service.ts
│   │   ├── checkin.service.ts
│   │   ├── recommendation.service.ts
│   │   ├── stats.service.ts
│   │   ├── settings.service.ts
│   │   ├── excelImport.service.ts
│   │   └── excelExport.service.ts
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── users.routes.ts
│   │   ├── registrations.routes.ts
│   │   ├── volunteers.routes.ts
│   │   ├── activities.routes.ts
│   │   ├── opportunities.routes.ts
│   │   ├── applications.routes.ts
│   │   ├── stats.routes.ts
│   │   ├── settings.routes.ts
│   │   └── excel.routes.ts
│   ├── utils/
│   │   ├── cairoTime.ts         # Africa/Cairo phase & check-in window evaluation
│   │   ├── errors.ts
│   │   ├── excelDate.ts
│   │   └── volunteerLookup.ts
│   └── seed/
│       ├── data.xlsx
│       ├── parseWorkbook.ts
│       └── seed.ts              # Seeds v1 Excel + v2 deans, students, and opportunities
└── tests/
    ├── phase0.test.ts
    ├── phase1.test.ts
    ├── phase2.test.ts
    ├── phase6.test.ts
    ├── v2-1-roles.test.ts
    ├── v2-2-registration.test.ts
    ├── v2-3-scoping.test.ts
    ├── v2-4-opportunities.test.ts
    ├── v2-5-recommendations.test.ts
    ├── v2-6-checkin.test.ts
    ├── v2-7-stats.test.ts
    └── v2-8-security.test.ts

client/
├── tsconfig.json
├── package.json
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── types/
    │   └── index.ts             # Mirrored TypeScript interfaces & discriminated unions
    ├── constants/
    │   ├── ar.ts                # Centralized Arabic UI dictionary
    │   └── enums.ts
    ├── api/
    │   └── client.ts
    ├── context/
    │   ├── authContext.ts
    │   ├── AuthContext.tsx
    │   ├── toastContext.ts
    │   └── ToastContext.tsx
    ├── hooks/
    │   ├── useDashboardStats.ts
    │   ├── useVolunteerProfile.ts
    │   ├── useVolunteersList.ts
    │   ├── useOpportunities.ts
    │   └── useStudentDashboard.ts
    ├── components/
    │   ├── Navbar.tsx
    │   ├── ProtectedRoute.tsx   # Role & status-aware guard (allowedRoles)
    │   ├── ConfirmDialog.tsx
    │   ├── ModalFrame.tsx
    │   ├── UniversityLogo.tsx
    │   ├── badges/
    │   ├── certificate/
    │   ├── dashboard/           # Recharts RTL widgets for Admin, Dean, and Student
    │   ├── importExport/
    │   ├── modals/
    │   ├── opportunities/
    │   ├── profile/
    │   └── volunteers/
    ├── pages/
    │   ├── LoginPage.tsx
    │   ├── RegisterPage.tsx
    │   ├── PendingApprovalPage.tsx
    │   ├── DashboardPage.tsx
    │   ├── DeansPage.tsx
    │   ├── ApprovalsPage.tsx
    │   ├── VolunteersPage.tsx
    │   ├── VolunteerProfilePage.tsx
    │   ├── ActivitiesPage.tsx
    │   ├── OpportunitiesManagePage.tsx
    │   ├── OpportunityFormPage.tsx
    │   ├── OpportunityLivePage.tsx
    │   ├── ImportExportPage.tsx
    │   ├── CertificatePage.tsx
    │   ├── StudentDashboardPage.tsx
    │   ├── OpportunitiesBoardPage.tsx
    │   ├── OpportunityDetailsPage.tsx
    │   ├── MyApplicationsPage.tsx
    │   ├── StudentProfilePage.tsx
    │   └── CheckInPage.tsx
    ├── utils/
    │   ├── confetti.ts
    │   └── format.ts
    ├── test/
    │   ├── setup.ts
    │   ├── phase3.test.tsx
    │   ├── phase4.test.tsx
    │   ├── phase5.test.tsx
    │   └── phase6.test.tsx
    └── __tests__/
        ├── v2-0-typescript.test.tsx
        ├── v2-1-roles.test.tsx
        ├── v2-2-registration.test.tsx
        ├── v2-3-scoping.test.tsx
        ├── v2-4-opportunities.test.tsx
        ├── v2-5-student-portal.test.tsx
        ├── v2-6-live-checkin.test.tsx
        ├── v2-7-dashboards.test.tsx
        └── v2-8-walkthrough.test.tsx
```

**Structure Decision**: Retain the existing two-package monorepo layout (`server/` and `client/`) so Railway and Vercel deployments stay self-contained. Zod schemas reside in `server/src/validators/` while mirrored TypeScript interfaces reside in `client/src/types/index.ts`.

---

## Phased Delivery Roadmap (`V2-0` → `V2-8`)

1. **Phase V2-0 — Full TypeScript Migration (`server/` & `client/`)**:
   - Install TypeScript, `tsx`, and `@types/*` (excluding `@types/bcryptjs`).
   - Add `tsconfig.json` (`"strict": true`, `"noImplicitAny": true`) and `typecheck` scripts (`tsc --noEmit`) to both packages.
   - Convert all `.js`/`.jsx` files under `server/src`, `server/tests`, and `client/src` to `.ts`/`.tsx` with zero behavioral changes.
   - Gate: 0 `.js`/`.jsx` files in `src/` or `tests/`, `npm run lint`, `npm run typecheck`, and all v1 tests (`phase0`..`phase6`) green.

2. **Phase V2-1 — Users & Roles Refactor**:
   - Replace `Admin` with `User.ts` (`role: 'admin' | 'dean' | 'student'`, `status: 'pending' | 'active' | 'rejected' | 'disabled'`, partial unique indexes on `volunteer` and `registration.volunteerId`).
   - Update `authenticate` middleware to reload `User` from DB on every request, enforce `status === 'active'` (except `GET /api/auth/me`), and expose `requireRole` and `buildScope`.
   - Update `AuthContext.tsx` and `ProtectedRoute.tsx` with role & status routing; seed admin + demo deans.

3. **Phase V2-2 — Student Self-Registration & Approval Queue**:
   - Build `POST /api/auth/register`, `GET /api/registrations`, `POST /api/registrations/:userId/approve`, and `POST /api/registrations/:userId/reject`.
   - Implement automatic linking to existing `Volunteer` records by `volunteerId` (preserving prior hours) and `facultyMismatch` detection (admin-only approval, existing `Volunteer.faculty` wins).
   - Build `/register`, `/pending` (waiting + Arabic rejection reason), and `/approvals`.

4. **Phase V2-3 — Dean Faculty Scoping & Admin Dean Management**:
   - Thread `scope: ScopeFilter` through `volunteer.service.ts`, `activity.service.ts` (`scopeActivities`), `stats.service.ts`, and `excelExport.service.ts`.
   - Force `req.user.faculty` on dean create/update operations; return `404` on cross-faculty ID access; block `student` from `/api/volunteers/*` and certificate routes; restrict `/api/excel/import` and `PATCH /api/settings` to `admin`.
   - Build `/api/users` and `/deans` management page + student temporary password reset.

5. **Phase V2-4 — Opportunities & Concurrency-Safe Applications Engine**:
   - Implement `Opportunity.ts` and `Application.ts` models, edit locks once `acceptedCounts > 0`, and `Africa/Cairo` phase calculation (`cairoTime.ts`).
   - Implement atomic slot claim via `Opportunity.findOneAndUpdate` (`$expr: { $lt: ["$acceptedCounts.<cat>", "$slots.<cat>"] }` + `$inc`), decrement on every exit from `accepted`, automatic FIFO waitlist promotion on withdrawal before `startAt`, and re-application reactivation on `cancelled` documents.
   - Build organizer pages (`/opportunities/manage`, `/opportunities/new`) and read-only faculty applicant view for deans on admin (`faculty: null`) opportunities.

6. **Phase V2-5 — Student Portal & Smart Recommendations**:
   - Implement server-side recommendation scoring (`+10` interest match, `+3` faculty target, `+2` deadline <= 3d, `+1` <= 25% slots left, `+1` per past attended field max `+3`, tie-break earliest `startAt`) with `matchedFields`.
   - Build `/me`, `/opportunities`, `/opportunities/:id`, `/me/applications`, and `/me/profile` (edit interests & change password).
   - Enforce dynamic `Settings.certificateHours` progress bar and `"مؤهل للشهادة — تُستلم من الكلية"` badge with zero certificate print/download access.

7. **Phase V2-6 — Live Mode, Rotating QR Check-in & Idempotent Completion**:
   - Implement 45s signed check-in JWT (`GET /api/opportunities/:id/checkin-token`), student QR check-in (`POST /api/opportunities/:id/checkin`) within `[startAt - 30m, endAt]` in `Africa/Cairo`, manual organizer check-in toggle, and live status endpoint (`/live`).
   - Implement idempotent `POST /api/opportunities/:id/complete` (upserting `approved` `Activity` records keyed by `application` with partial unique index, recording no-shows with `0` hours, and locking check-in).
   - Build `/opportunities/:id/live` (`qrcode.react`, 30s token refresh, 10s counter polling), student "Happening Now" banner, and `/checkin/:opportunityId`.

8. **Phase V2-7 — Role-Based Dashboards & Recharts Analytics**:
   - Implement `/api/stats/participation`, `/api/stats/events`, `/api/stats/monthly-hours`, and `/api/stats/me` using `buildScope` + `scopeActivities`.
   - Build Recharts widgets (Participation Funnel, Engagement Donut, Monthly Hours Line Chart, Certificate Progress Buckets relative to `Settings.certificateHours`, Faculty Comparison, Event Efficiency) in RTL Arabic at 375px width with Arabic empty/loading/error states.

9. **Phase V2-8 — Security Hardening, Demo Seed & Final Walkthrough**:
   - Add `helmet`, `express-rate-limit` on `/api/auth/login`, `/api/auth/register`, and `/api/opportunities/:id/checkin`, and optional `ALLOWED_EMAIL_DOMAINS` validation.
   - Expand `seed.ts` with rich demo data (admin, deans per faculty, approved/pending students, and upcoming/live/completed opportunities).
   - Run full verification gate across all phases.

## Complexity Tracking

No Constitution violations exist; no complexity exemptions required.
