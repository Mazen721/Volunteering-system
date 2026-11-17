# Quickstart & Verification Guide: MNU Volunteer Hours & Certificates System v2

**Feature**: `001-volunteer-hours-v2`
**Date**: 2026-11-16
**References**: [spec.md](./spec.md), [data-model.md](./data-model.md), [contracts/api-contracts.md](./contracts/api-contracts.md)

---

## 1. Prerequisites & Environment Setup

- **Node.js**: v22+ (with built-in `node --test` and `--import tsx` support)
- **MongoDB**: Local MongoDB instance or MongoDB Atlas connection string
- **Server Environment (`server/.env`)**:
  ```ini
  PORT=5000
  MONGO_URI=mongodb://127.0.0.1:27017/mnu_volunteer_hours
  JWT_SECRET=replace-with-strong-secret
  CLIENT_URL=http://localhost:5173
  ADMIN_EMAIL=admin@mnu.edu.eg
  ADMIN_PASSWORD=Admin@12345
  ALLOWED_EMAIL_DOMAINS=
  ```
- **Client Environment (`client/.env`)**:
  ```ini
  VITE_API_URL=http://localhost:5000/api
  ```

---

## 2. Install, Seed & Run Commands

```powershell
# 1. Install dependencies in root, server, and client
npm --prefix server install
npm --prefix client install

# 2. Seed database with v1 Excel data + v2 demo accounts & opportunities
npm run seed

# 3. Start both server (tsx watch) and client (Vite) in development mode
npm run dev
```

---

## 3. Mandatory Per-Phase Verification Gate (Principle V)

Every implementation phase (`V2-0` through `V2-8`) MUST pass all four commands with zero errors before advancing to the next phase:

```powershell
# 1. Lint check (ESLint across server and client)
npm run lint

# 2. Strict TypeScript check (tsc --noEmit in server and client)
npm --prefix server run typecheck
npm --prefix client run typecheck

# 3. Backend integration test suite (Node test runner via tsx)
npm --prefix server test

# 4. Frontend unit & integration test suite (Vitest + React Testing Library + MSW)
npm --prefix client test
```

---

## 4. End-to-End Validation Walkthrough Scenarios

### Scenario 1: Admin & Dean Faculty Isolation (`SC-001`)
1. Log in as Admin (`admin@mnu.edu.eg`) and navigate to `/deans` to verify or create Dean accounts for two faculties (e.g., `كلية الطب البشري` and `كلية طب الأسنان`).
2. Log in as the Dentistry Dean (`dentistry.dean@mnu.edu.eg`).
3. Verify `/volunteers`, `/activities`, `/`, and `/excel` export contain **only** `كلية طب الأسنان` records.
4. Attempt to open `/volunteers/20260001` or `/certificate/20260001` (Medicine student أحمد) → verify `404` Arabic not-found screen.

### Scenario 2: Student Registration, Excel Linking & Approval (`FR-006` – `FR-008`)
1. Open `/register` and register a student using existing imported ID `20260002` (`سارة`, `كلية طب الأسنان`) and select interests (`medical`, `awareness_campaigns`).
2. Verify the student is routed exclusively to `/pending` and receives `403` on protected API calls.
3. Log in as the Dentistry Dean, open `/approvals`, and approve `سارة`.
4. Log back in as `سارة` → verify she lands on `/me` with her prior imported hours preserved.

### Scenario 3: Concurrency-Safe Opportunity Capacity & Waitlist Promotion (`SC-002`)
1. As Admin or Dean, create and publish an `auto`-approval opportunity with `slots: { student: 1, academic: 0, admin: 0 }`.
2. Apply as Student A → status is `accepted` (`acceptedCounts.student === 1`).
3. Apply as Student B → status is `waitlisted`.
4. Withdraw as Student A before `startAt` → verify Student B is automatically promoted to `accepted` and `acceptedCounts.student === 1`.
5. Re-apply as Student A → verify the same application record is reactivated as `waitlisted` with a refreshed `appliedAt`.

### Scenario 4: Live Rotating QR Check-in & Idempotent Event Completion (`SC-003`)
1. Open `/opportunities/:id/live` as the organizer during the check-in window (`[startAt - 30m, endAt]` in `Africa/Cairo`).
2. Verify the rotating QR token refreshes every 30s (valid ~45s).
3. As an accepted student, see the "يجري الآن" banner on `/me` and complete check-in.
4. Once `endAt` has passed, trigger `POST /api/opportunities/:id/complete` twice.
5. Verify the checked-in student receives the exact `opportunity.hours` once as an `approved` activity, unchecked applicants receive `0` hours, and the second `/complete` call creates zero duplicates.

### Scenario 5: Certificate Eligibility vs. Issuance (`FR-012`, `SC-004`)
1. When a student's approved hours reach `Settings.certificateHours` (default `30`), verify `/me` shows `0` remaining hours and the badge `"مؤهل للشهادة — تُستلم من الكلية"`, with no certificate link or route (`GET /api/volunteers/:id` returns `403` for student tokens).
2. Log in as that faculty's Dean (or Admin), open `/certificate/:volunteerId`, and verify the A4 landscape certificate renders and prints cleanly.
