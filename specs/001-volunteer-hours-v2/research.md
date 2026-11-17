# Phase 0 Research & Architecture Decisions: MNU Volunteer Hours & Certificates System v2

**Feature**: `001-volunteer-hours-v2`
**Date**: 2026-11-16
**References**: [spec.md](./spec.md), [constitution.md](../../.specify/memory/constitution.md), [docs/PLAN-v2.md](../../docs/PLAN-v2.md)

All technical unknowns and stack decisions were resolved from the existing monorepo configuration (`server/package.json`, `client/package.json`), `docs/PLAN-v2.md`, and the ratified Constitution.

---

## 1. Full TypeScript Strict-Mode Execution Strategy (Phase V2-0)

- **Decision**:
  - Migrate every file under `server/src`, `server/tests`, and `client/src` from `.js`/`.jsx` to `.ts`/`.tsx` with `"strict": true` and `"noImplicitAny": true`.
  - Keep root tooling files (`eslint.config.js`, `vite.config.js`) in JavaScript as permitted by Principle I.
  - On `server/`: execute TypeScript directly via `tsx` (`node --import tsx --watch src/server.ts` for `dev`, `node --import tsx src/seed/seed.ts` for `seed`, `node --import tsx --test tests/*.test.ts` for `test`) and use `tsc --noEmit` for `typecheck` and `tsc` for `build`.
  - Install `@types/express`, `@types/jsonwebtoken`, `@types/cors`, `@types/multer`, and `@types/node` in `server/` (omit `@types/bcryptjs` because `bcryptjs` v3 ships built-in TypeScript definitions).
  - Keep Zod schemas on the server (`server/src/validators/*.ts`) using `z.infer<typeof schema>`, and maintain mirrored TypeScript interfaces in `client/src/types/` without introducing a third shared workspace package.
- **Rationale**:
  - `node --import tsx --test` works natively with Node's built-in test runner already used in `server/tests/phase*.test.js`, preserving 100% of v1 test structure while adding compile-time verification via `tsc --noEmit`.
  - Avoiding a separate `shared/` package keeps Railway (`server/`) and Vercel (`client/`) independent build roots intact.
- **Alternatives Considered**:
  - *Jest / ts-jest on server*: Rejected because the codebase already uses Node's native test runner (`node --test`).
  - *Shared workspace package for types*: Rejected by architecture directive to keep deployment boundaries simple between `server/` and `client/`.

---

## 2. Partial Unique Indexes on `User` & `Activity`

- **Decision**:
  - On `User.volunteer`: define `{ unique: true, partialFilterExpression: { volunteer: { $type: 'objectId' } } }`.
  - On `User.registration.volunteerId`: define `{ unique: true, partialFilterExpression: { 'registration.volunteerId': { $type: 'string' }, status: { $in: ['pending', 'active', 'disabled'] } } }`.
  - On `Activity.application`: define `{ unique: true, partialFilterExpression: { application: { $type: 'objectId' } } }`.
- **Rationale**:
  - In MongoDB, a `sparse: true` unique index still indexes documents where the field is explicitly stored as `null`, causing a `E11000 duplicate key error` on the second pending `User` (`volunteer: null`) or the second manual `Activity` (`application: null`). `partialFilterExpression` with `{ $type: 'objectId' }` indexes only documents holding an actual `ObjectId`.
  - Filtering `registration.volunteerId` across non-rejected statuses prevents two concurrent pending registrations from claiming the same `volunteerId` while permitting re-registration if a prior attempt was rejected.
- **Alternatives Considered**:
  - *MongoDB `sparse: true` index*: Rejected because Mongoose default `null` fields trigger duplicate key errors on the second document.
  - *Application-level check only*: Rejected because concurrent requests can pass a pre-insert `findOne` check simultaneously.

---

## 3. Fresh DB-Backed Auth, RBAC & Anti-Enumeration Faculty Scoping

- **Decision**:
  - JWT payload contains `{ sub: string, role: UserRole }`.
  - `authenticate` middleware verifies the JWT and reloads the `User` document from MongoDB on every request.
  - Status gate: `pending`, `rejected`, and `disabled` users receive HTTP `403` on every route except `GET /api/auth/me`.
  - Role gate: `requireRole(...roles: UserRole[])` enforces endpoint-level role access (`admin`, `dean`, `student`).
  - Scope helper: `buildScope(user: AuthUser): ScopeFilter` returns `{}` for `admin` and `{ faculty: user.faculty }` for `dean`. Every service function accepts `scope: ScopeFilter`.
  - Since `Activity` does not store `faculty`, `scopeActivities(scope)` resolves dean scoping via `{ volunteer: { $in: await Volunteer.distinct('_id', scope) } }` for standard queries and `$lookup` on `volunteers` + `$match` on `volunteer.faculty` for aggregation pipelines.
  - Out-of-scope resource access by ID returns HTTP `404` (`NotFoundError`) rather than `403`.
- **Rationale**:
  - Reloading the user from MongoDB guarantees that disabling an account or changing a dean's faculty takes effect on the very next request without waiting for token expiry.
  - Returning `404` on cross-faculty ID lookups prevents deans from enumerating volunteer IDs or object IDs belonging to other faculties.
- **Alternatives Considered**:
  - *Trusting JWT claims for `status` and `faculty`*: Rejected because revoked/disabled users would retain access until token expiration.
  - *Denormalizing `faculty` onto `Activity`*: Rejected to preserve v1 schema compatibility and avoid stale faculty values if an admin corrects a volunteer's faculty.

---

## 4. Concurrency-Safe Slot Allocation & Automatic Waitlist Promotion

- **Decision**:
  - Claiming a category slot (`cat: 'student' | 'academic' | 'admin'`) executes a single atomic MongoDB `Opportunity.findOneAndUpdate`:
    ```ts
    Opportunity.findOneAndUpdate(
      {
        _id: opportunityId,
        status: 'published',
        $expr: { $lt: [`$acceptedCounts.${cat}`, `$slots.${cat}`] },
      },
      { $inc: { [`acceptedCounts.${cat}`]: 1 } },
      { new: true }
    );
    ```
  - In `auto` mode, if `findOneAndUpdate` returns a document, the application is saved as `accepted`; if `null` (and `slots[cat] > 0`), it is saved as `waitlisted`.
  - In `manual` mode, applications start as `pending`; when the organizer accepts an application, the same atomic `findOneAndUpdate` runs and throws `409 Conflict` if full.
  - Every transition out of `accepted` (student withdrawal before `startAt`, organizer changing `accepted` → `rejected`/`waitlisted`, or opportunity cancellation) atomically decrements `acceptedCounts[cat]`.
  - When an `accepted` student withdraws before `startAt` on an `auto`-mode opportunity, the service immediately queries the oldest waitlisted application of the same category (`findOne({ opportunity: id, category: cat, status: 'waitlisted' }).sort({ appliedAt: 1 })`), claims the freed slot, and promotes that application to `accepted`.
  - Because `Application` has a unique compound index on `(opportunity, volunteer)`, a student who withdrew (`status: 'cancelled'`) and re-applies reactivates the same `Application` document with a fresh `appliedAt = new Date()` (placing them at the back of the waitlist).
- **Rationale**:
  - Single-document atomic `$expr` + `$inc` updates in MongoDB are serialized at the document level, guaranteeing that `N` parallel requests for `M` remaining slots accept at most `M` applicants even without multi-document transactions.
- **Alternatives Considered**:
  - *Read-then-write (`if (opp.acceptedCounts.student < opp.slots.student)`)*: Rejected due to race conditions under concurrent requests.

---

## 5. `Africa/Cairo` Timezone Evaluation & Rotating QR Check-in Tokens

- **Decision**:
  - Persist all `Date` fields in UTC in MongoDB.
  - Evaluate opportunity phases (`upcoming`, `registration_closed`, `in_progress`, `ended`) and check-in windows (`[startAt - 30 minutes, endAt]`) against `Africa/Cairo` wall-clock rules, and format all display dates/times with `Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', ... })`.
  - Sign rotating check-in tokens using `jsonwebtoken` (`jwt.sign({ opportunityId, type: 'checkin' }, jwtSecret, { expiresIn: '45s' })`). The organizer live screen (`/opportunities/:id/live`) polls `/checkin-token` every 30 seconds and renders the token via `qrcode.react`.
- **Rationale**:
  - Short-lived (~45s) signed JWT tokens require zero additional database state while preventing students from screenshotting and sharing static QR codes outside the venue.
- **Alternatives Considered**:
  - *Static QR code per event*: Rejected because attendees could share a photo of the QR code with absent peers.
  - *Storing rotating nonces in MongoDB*: Unnecessary write load every 30s when stateless HMAC-SHA256 JWT expiration already enforces the 45-second window and opportunity binding.

---

## 6. Idempotent Event Completion (`POST /api/opportunities/:id/complete`)

- **Decision**:
  - Preconditions: Opportunity must have `status === 'published'` (or already `'completed'`, which returns the existing summary as a no-op) and `now > opportunity.endAt` (otherwise HTTP `409`).
  - Execution: Query all `Application` documents with `{ opportunity: id, status: 'accepted', attended: true }`. For each attendee, perform an idempotent `Activity.findOneAndUpdate({ application: app._id }, { $setOnInsert: { volunteer: app.volunteer, title: opp.title, type: opp.activityType, hours: opp.hours, date: opp.startAt, status: 'approved', supervisor: opp.contactName, opportunity: opp._id, application: app._id } }, { upsert: true, new: true })`, and set `app.hoursGranted = opp.hours`.
  - Unchecked `accepted` applications remain `attended: false, hoursGranted: 0`.
  - Update `opportunity.status = 'completed'`.
- **Rationale**:
  - Combining `upsert: true` keyed by `application._id` with the partial unique index on `Activity.application` guarantees that retrying or double-clicking "Complete Event" can never grant duplicate hours.
- **Alternatives Considered**:
  - *`Activity.insertMany` without unique key*: Rejected because a retry or partial failure could duplicate hours.

---

## 7. Arabic RTL Charts & Responsive Analytics (Phase V2-7)

- **Decision**:
  - Use `recharts` for Dean and Admin analytics (Participation Funnel, Engagement Donut, Monthly Hours Line Chart, Certificate Progress Buckets, Faculty Comparison).
  - Wrap charts in `ResponsiveContainer` sized to fit down to `375px` viewports, source all labels/tooltips from `client/src/constants/ar.ts`, format numbers with `ar-EG`, and compute all metrics through `buildScope(user)` + `scopeActivities(scope)` so Dean numbers for Faculty X always equal Admin numbers filtered to Faculty X.
- **Rationale**:
  - Centralizing the aggregation helpers in `stats.service.ts` with `scope: ScopeFilter` ensures mathematical identity between Dean and Admin views.
- **Alternatives Considered**:
  - *Separate aggregation queries for Dean vs. Admin*: Rejected because diverging pipelines risk metric drift between roles.
