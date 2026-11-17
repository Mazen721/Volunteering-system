<!--
Sync Impact Report
- Version change: N/A (template) → 1.0.0
- Modified principles:
  - [PRINCIPLE_1_NAME] → I. 100% TypeScript Strict Mode (NON-NEGOTIABLE)
  - [PRINCIPLE_2_NAME] → II. Arabic-First & RTL User Experience (NON-NEGOTIABLE)
  - [PRINCIPLE_3_NAME] → III. Server-Enforced Role-Based Access Control & Faculty Isolation (NON-NEGOTIABLE)
  - [PRINCIPLE_4_NAME] → IV. Data Integrity, Concurrency Safety & Idempotency (NON-NEGOTIABLE)
  - [PRINCIPLE_5_NAME] → V. Automated Verification Gate per Phase (NON-NEGOTIABLE)
- Added sections:
  - Technical & Security Constraints
  - Development Workflow & Quality Gates
- Removed sections: None
- Templates requiring updates: None (resolved dynamically at runtime)
- Follow-up TODOs: None
-->

# MNU Volunteer Hours & Certificates System v2 Constitution

## Core Principles

### I. 100% TypeScript Strict Mode (NON-NEGOTIABLE)

- Every source and test file under `server/src`, `server/tests`, and `client/src` MUST be written in
  TypeScript (`.ts` / `.tsx`) with `"strict": true` enabled in `tsconfig.json`. Root tooling
  configuration files (e.g., `eslint.config.js`, `vite.config`) are exempt.
- `any` MUST NOT be used. Developers MUST use explicit interfaces, discriminated unions for user
  roles and entity statuses, and `z.infer` derived from Zod validation schemas.

*Rationale*: End-to-end compile-time type safety combined with runtime schema inference prevents type
drift between API boundaries, database models, and UI components.

### II. Arabic-First & RTL User Experience (NON-NEGOTIABLE)

- The root HTML document MUST declare `<html lang="ar" dir="rtl">` across the entire application.
- Every UI label, button, placeholder, toast notification, empty state, validation error, API error
  message, chart label, and Excel export header MUST be in Arabic. All frontend UI strings MUST be
  centralized in `client/src/constants/ar.ts`.
- All user-facing dates and numbers MUST use `ar-EG` locale formatting. Event phases and check-in
  time windows MUST be evaluated in the `Africa/Cairo` timezone, while MongoDB MUST store timestamps
  in UTC.

*Rationale*: The platform serves an Arabic-speaking university community in Egypt; native RTL layout,
centralized Arabic copy, and explicit Cairo timezone evaluation eliminate localization inconsistencies
and boundary bugs during event check-ins.

### III. Server-Enforced Role-Based Access Control & Faculty Isolation (NON-NEGOTIABLE)

- Authentication MUST support exactly three login roles (`admin`, `dean`, `student`) using email +
  password with JWT (no OAuth and no external email service).
- Every permission check MUST be enforced on the server; hiding UI elements in the client is never an
  acceptable security control.
- A `dean` user MUST be locked to the `faculty` value loaded fresh from the database on every
  request; any `faculty` field supplied in a dean's request body or query MUST be ignored and
  overwritten server-side.
- Any attempt by a `dean` to access or mutate a resource outside their assigned faculty MUST return
  HTTP `404` (never `403`) to prevent cross-faculty resource enumeration.
- Users with `pending`, `rejected`, or `disabled` status MUST receive HTTP `403` on every API
  endpoint except `GET /api/auth/me`.
- Certificates MUST only be opened or printed by `admin` (for any faculty) and `dean` (for their own
  faculty). `student` users MUST never access or generate certificates.

*Rationale*: Strict server-side authorization, fresh DB-backed faculty scoping, and anti-enumeration
responses protect sensitive academic records and prevent privilege escalation across faculties.

### IV. Data Integrity, Concurrency Safety & Idempotency (NON-NEGOTIABLE)

- Only `approved` volunteer hours MUST count toward student totals, dashboard statistics, and
  certificate eligibility. The eligibility threshold MUST always be read dynamically from
  `Settings.certificateHours` and MUST NEVER be hardcoded.
- Opportunity capacity MUST NEVER be exceeded, even under concurrent application requests or status
  transitions; capacity counters MUST always equal the exact number of accepted applications.
- Crediting volunteer hours for an event MUST be idempotent; duplicate hours MUST NEVER be granted to
  a student for the same event regardless of repeated submissions or retries.

*Rationale*: Volunteer hours directly govern official university certificate issuance; atomic capacity
guards and idempotent hour crediting guarantee audit-grade accuracy under concurrent load.

### V. Automated Verification Gate per Phase (NON-NEGOTIABLE)

- Every implementation phase MUST pass all four automated verification checks before advancing to the
  next phase:
  1. `npm run lint` (zero lint errors across server and client)
  2. `npm run typecheck` (`tsc --noEmit` with strict mode across server and client)
  3. Backend integration tests (`node --test` executed via `tsx`)
  4. Frontend unit and integration tests (Vitest + MSW)

*Rationale*: Enforcing a strict, multi-layered verification gate at the end of every phase prevents
regressions, broken types, and untested behavior from compounding across milestones.

## Technical & Security Constraints

- **Monorepo Layout**: Backend resides in `server/` (Express + MongoDB/Mongoose + Zod + TypeScript)
  and frontend resides in `client/` (React + Vite + TypeScript).
- **Timezone & Locale Invariants**: Database timestamps are stored in UTC; business logic for event
  lifecycles and check-in windows is evaluated in `Africa/Cairo`; presentation uses `ar-EG`.
- **Zero External Auth/Mail Dependencies**: Authentication and account lifecycle flows operate
  entirely via local JWT authentication and admin/dean approval workflows without third-party OAuth
  or SMTP dependencies.

## Development Workflow & Quality Gates

- **Spec-Driven Execution**: Features and phases MUST follow the Spec Kit workflow (`specify` →
  `plan` → `tasks` → `implement`), verifying alignment with the five Core Principles at each stage.
- **No Phase Advancement on Red**: Work on a subsequent phase MUST NOT begin while any lint check,
  `tsc --noEmit` check, backend test, or frontend Vitest/MSW test is failing.
- **Schema-First Contracts**: Request payloads, query parameters, and responses MUST be validated
  with Zod schemas, and TypeScript types MUST be inferred via `z.infer`.

## Governance

- This Constitution supersedes all other ad-hoc conventions, prior patterns, or implementation
  shortcuts within the repository.
- Amendments to this Constitution require:
  1. An explicit proposal documenting the rationale and impact on existing modules and tests.
  2. Updating `.specify/memory/constitution.md` with an incremented semantic version and a prepended
     Sync Impact Report.
  3. Verification that dependent specifications, plans, and task lists remain compliant.
- **Versioning Policy**: Semantic versioning (`MAJOR.MINOR.PATCH`) applies to this document:
  - `MAJOR`: Backward-incompatible governance changes, principle removals, or redefinitions of
    non-negotiable security/data rules.
  - `MINOR`: Addition of a new principle or governance section, or materially expanded requirements.
  - `PATCH`: Wording clarifications, formatting refinements, or non-semantic fixes.
- **Compliance Review**: Every specification, implementation plan, task list, and code review MUST
  verify compliance against Principles I–V prior to phase completion.

**Version**: 1.0.0 | **Ratified**: 2026-11-16 | **Last Amended**: 2026-11-16
