# MERN Plan: Volunteer Hours & Certificates System (MNU)

**Scope:** one admin account · React (Vercel) + Express (Railway) + MongoDB Atlas · reuse the prototype's UI, logic and colors (`#1F4E79`, gold `#D4AF37`, Cairo font, RTL).

> [!IMPORTANT]
> **The whole system is in Arabic.** `<html lang="ar" dir="rtl">`, and every label, button, placeholder, toast, empty state, validation message, **API error message**, Excel export header, sheet name, certificate and page title is in Arabic. Dates use `ar-EG` (e.g. ١٣ نوفمبر ٢٠٢٦) and numbers use `toLocaleString('ar-EG')`. Keep all UI strings in one file, `client/src/constants/ar.js`, so they stay consistent. Only code, enum keys and DB field names stay in English.

## 0. Reference files: put them in the repo
The AI that builds the project needs both files. Put them here **before you start**:
```
volunteer-hours/
  docs/
    PLAN.md                     ← this file
    reference/
      prototype.html            ← the code from the Word file, saved as .html (copy all the text from Word → paste into a .html file)
      original-data.xlsx        ← the doctor's Excel file (unchanged, for reference)
  server/src/seed/data.xlsx     ← a copy of the Excel, used by the seed script
  client/  server/
```
> [!TIP]
> Give the AI `prototype.html`, **not** the `.docx`. Most AIs can't read Word files properly. Tell it: *"Use docs/reference/prototype.html as the UI/UX reference and docs/PLAN.md as the spec. Follow the phases in order and run each phase's verification checklist before moving on."*

---

## 1. Audit: problems found

### A. Excel file
| # | Problem | Fix in MERN |
|---|---|---|
| E1 | The **"الطلاب" (students) row is missing** from the dashboard's category table (row 16 is empty). `B19 = SUM(B16:B18)` still shows the old cached value of 8, so the totals are stale and wrong. | Category stats come from an aggregation query, so all 3 categories are always included. |
| E2 | The dashboard's `SUMIF` adds **pending hours** to the totals (نور's 10 hours). | Count only approved hours. |
| E3 | **Faculty conflicts:** the same person has one faculty in the volunteers sheet and another in the log (سارة, د. عمرو, آية, محمد, مريم, د. خالد). The dashboard counts volunteers from one sheet and hours from the other. | The faculty is stored **only on the Volunteer**. An activity just references the volunteer. |
| E4 | Name, category and faculty are **typed again on every log row** (no lookup), which is what causes E3. | Same as above. Also, the importer checks for conflicts. |
| E5 | **Average of averages:** `E12 = AVERAGE(E5:E11)` and `D19 = AVERAGE(D16:D18)` are mathematically wrong. | Use total hours ÷ total volunteers. |
| E6 | The activity count (`COUNTIF`) includes pending and rejected activities. | Return both `totalActivities` and `approvedActivities`. |
| E7 | **Mixed date formats:** most dates are text ("2026-05-10") but I15 is a raw number (46270). | Store a real `Date`. The importer handles both text and Excel serial numbers. |
| E8 | Possible **duplicate activity:** row 15 has the same title as row 8 for the same person (د. عمرو). | Warn about duplicates (same volunteer + title + date). |
| E9 | The data-validation ranges overlap (`D4:D200 D4:D500`). This doesn't break anything but it's messy. | Use enums in the schema instead. |

### B. Prototype code (HTML in the Word file)
| # | Problem | Fix in MERN |
|---|---|---|
| C1 | **No persistence:** the data is hard-coded in `sampleData` and every change is lost on refresh. | MongoDB. |
| C2 | **Demo data doesn't match the Excel:** different names (د. إبراهيم instead of د. عمرو), hours and dates, plus a faculty "الإدارة العامة" that isn't in the Excel's list. | Seed the database from the Excel file only. |
| C3 | **`parseCSV` reads the wrong columns:** date from col 6 (actually type) and status from col 8 (actually date). It also skips supervisor and type, and `split(',')` breaks if any text contains a comma. | Replace it with an `exceljs` importer that maps columns by header name. |
| C4 | **Category names don't match the Excel:** طالب / عضو هيئة تدريس / جهاز إداري. | Store enum keys `student / academic / admin` and use one label map for display. |
| C5 | The code has **no "activity type" field** (the Excel has 10 types). | Add a `type` enum. |
| C6 | **"مرفوض" (rejected) status isn't handled:** anything that isn't approved shows as "قيد المراجعة" (pending). | 3 status badges. |
| C7 | The **status filter is misleading:** choosing "معتمد" (approved) actually filters volunteers with ≥30 hours. It mixes up activity status and certificate eligibility. | Two separate filters: eligibility (eligible / in progress) and activity status. |
| C8 | Volunteers are **built from activity rows**, taking the faculty from the first row. That means a volunteer with 0 activities can't exist, and conflicts are hidden. | A separate `Volunteer` collection. |
| C9 | Adding an activity with an existing ID but a **different name or faculty** creates inconsistent data. | The activity form only selects a volunteer by ID. Their details are read-only there. |
| C10 | Activities are edited by **array index**, which is fragile. | Use `_id`. |
| C11 | **The KPI cards and the table disagree:** the "volunteers" KPI counts only people with approved hours, while the table counts everyone. | Define both clearly ("registered" vs "active"). |
| C12 | **XSS / broken buttons:** `innerHTML` and `onclick="openCertificate('${name}')"` break on names with quotes and allow script injection. | React escapes text by default. |
| C13 | **No validation:** negative or zero hours, future dates and duplicate IDs are all accepted. | Zod on both the client and the server, plus a unique index on `volunteerId`. |
| C14 | `window.print()` prints the whole page, not just the certificate. | A dedicated certificate route with `@media print` CSS. |
| C15 | **The 30 hours is hard-coded** in about 6 places. | Store it in `Settings.certificateHours`. |
| C16 | The Tailwind CDN script isn't meant for production. | Install Tailwind through npm with Vite. |
| C17 | No authentication: anyone can edit. | Admin JWT login. |

---

## 2. Data models
- **Volunteer:** `volunteerId` (unique), `fullName`, `category` (`student|academic|admin`), `faculty`, timestamps.
- **Activity:** `volunteer` (ref), `title`, `type` (10 enum values from the Excel), `hours` (> 0), `date`, `status` (`approved|pending|rejected`), `supervisor`.
- **Admin:** `email`, `passwordHash`. One account, created by the seed script.
- **Settings:** `certificateHours = 30`.
- **Faculties:** a constant list of the 7 faculties from the Excel.

**Computed per volunteer:** total activities, approved activities, approved hours, `remaining = max(0, 30 − approved)`, `eligible = approved ≥ 30`.

---

## 3. Phases

### Phase 0: Setup
- Monorepo with `server/` (Express, Mongoose) and `client/` (Vite, React, Tailwind with RTL and the Cairo font).
- Create the Atlas cluster and set up `.env` files (`MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`).
- Add ESLint/Prettier and `.gitignore`, then push to GitHub.

**Verify ✅**
- [x] `npm run dev` in `server/` logs "MongoDB connected" with no errors.
- [x] `GET /api/health` returns `{ status: "ok" }`.
- [x] The client opens at `localhost:5173` with the page in RTL, Cairo font loaded, and the title in Arabic.
- [x] `.env` is **not** in git (`git status` doesn't show it). `.env.example` is committed.

### Phase 1: Backend core
- Write the models and indexes, plus error-handling middleware and Zod validation.
- Seed script: reads the doctor's `.xlsx`, **fixes E3/E7** (the volunteers sheet is the source of truth for faculty), and creates the admin account.
- Auth: `POST /api/auth/login` and `GET /api/auth/me`, using a JWT middleware that protects all routes.

**Verify ✅**
- [x] `npm run seed` creates **8 volunteers, 12 activities, 1 admin** (check in Atlas or Compass).
- [x] Each volunteer's faculty matches the **volunteers sheet** (e.g. سارة = كلية طب الأسنان).
- [x] The activity from row 15 (serial date 46270) is stored as a real date (2026-09-05). All dates are valid `Date` values.
- [x] Running the seed twice doesn't create duplicates.
- [x] Login with the correct credentials → 200 + token. Wrong password → 401 with an Arabic message ("بيانات الدخول غير صحيحة").
- [x] Any protected route without a token → 401. With a token → 200.
- [x] Invalid body (e.g. hours = -5) → 400 with an Arabic validation message.

### Phase 2: Backend features
- **Volunteers:** CRUD, plus a list endpoint with search, category, faculty, eligibility and pagination that returns the computed totals (aggregation).
- **Activities:** CRUD, plus `PATCH /:id/status` and filters.
- **Stats:** `/overview` (KPIs), `/faculties`, `/categories`, `/leaderboard?category`. Averages are calculated correctly (E5).
- **Excel:** `POST /import` (multer + exceljs, with a preview report of errors and conflicts) and `GET /export` (3 sheets in the doctor's layout, with the fixes applied).

**Verify ✅** (expected numbers come from the seed data with only approved activities counted)
- [x] `/stats/overview`: **129** approved hours (139 minus نور's 10 pending), **8** registered volunteers, **7** active volunteers.
- [x] Volunteer 20260001 (أحمد): 31 hours, eligible ✅. 20260003 (د. عمرو): 37 hours, eligible ✅. 20260008 (نور): 0 approved hours, 30 remaining, 1 activity in total.
- [x] `/stats/categories` returns **all 3 categories**, including الطلاب (fixes E1).
- [x] The averages equal total hours ÷ volunteers, not an average of averages (E5).
- [x] Changing an activity's status pending → approved updates the totals right away.
- [x] Duplicate `volunteerId` → 409 with an Arabic message.
- [x] Deleting a volunteer who still has activities → blocked with a clear message (or cascades, whichever you decide, but be consistent).
- [x] Filters and search combine correctly, and pagination returns `total` and `pages`.
- [x] Export → open the file in Excel: 3 sheets with Arabic names and headers, Arabic text shows correctly, and the numbers match the API.
- [x] Import the doctor's original file → the preview reports the faculty conflicts (E3) and the possible duplicate (E8) **before** anything is saved.
- [x] Optional: Jest + Supertest tests for the stats service and the eligibility rule (29 / 30 / 31 hours).

### Phase 3: Frontend, layout and dashboard
- Axios client with the JWT, a login page and protected routes.
- Navbar, then the Dashboard: KPI cards, animated faculty bars, leaderboard with category tabs (ported from the prototype's markup).

**Verify ✅**
- [x] Opening `/` while logged out redirects to `/login`. After login you land on the dashboard, and the session survives a refresh.
- [x] Logout clears the token, and the back button doesn't show protected pages.
- [x] The KPI cards show the same numbers as `/stats/overview`, in Arabic digits.
- [x] Faculty bars are sorted, and the percentages add up to about 100%.
- [x] Each leaderboard tab (الكل / الطلاب / أعضاء الكادر الأكاديمي / أعضاء الجهاز الإداري) shows the correct top 5.
- [x] With the API stopped: an Arabic error message is shown, not a blank page.
- [x] It looks fine on mobile width (375px), and there's **no English text anywhere** in the UI.

### Phase 4: Frontend management
- Volunteers table with search and filters (C7 fixed), plus an add/edit volunteer modal.
- Volunteer profile page: details, a progress bar towards 30 hours, and the list of activities with 3 status badges.
- Add activity modal: look up the volunteer by ID and show their details read-only (C9). Edit and delete activity.
- Import/Export page: upload with a preview, and a download button.
- Toasts and confetti on success, plus loading skeletons.

**Verify ✅**
- [x] Add a volunteer → it appears in the table right away and **still exists after a refresh**.
- [x] Add an activity: typing an existing ID fills in the volunteer's name, category and faculty as read-only. An unknown ID shows an Arabic error.
- [x] Add 30+ approved hours to a volunteer → the badge changes to "مؤهل لإصدار الشهادة 🎓" and the certificate button unlocks.
- [x] Change an activity to مرفوض → its hours are removed from the totals and the red badge shows.
- [x] Edit a volunteer's faculty → the faculty stats on the dashboard update.
- [x] Every filter works on its own and together with the others. The eligibility filter and the activity-status filter are separate (C7).
- [x] A name containing `'` or `<script>` displays as plain text and nothing breaks (C12).
- [x] Forms reject: empty fields, hours ≤ 0, invalid dates. All error messages are in Arabic.
- [x] Deleting anything asks for confirmation first, in Arabic.
- [x] The Import/Export page round-trips: export → import the same file → no changes, no duplicates.

### Phase 5: Certificate
- `/certificate/:volunteerId` page, only available if the volunteer is eligible.
- Show name, ID, category, faculty, total hours, number of activities and the date, with the "مركز المسؤولية المجتمعية" heading.
- Print CSS (A4 landscape) so only the certificate prints.

**Verify ✅**
- [x] Opening `/certificate/20260002` (15 hours, not eligible) by URL directly → blocked with an Arabic message.
- [x] For أحمد (31 hours): the certificate shows the correct name, ID, category, faculty, 31 hours, 3 activities and today's date in Arabic.
- [x] Print preview: exactly **1 A4 landscape page**, with no navbar or buttons.
- [x] Long Arabic names (four-part names) don't overflow the layout.

### Phase 6: Testing and data check
- Check by hand that the totals per volunteer, faculty and category match a corrected copy of the Excel.
- Edge cases: 0 activities, exactly 30 hours, only rejected activities, a duplicate ID.
- Optional: a few Jest/Supertest tests for the stats logic.

### Phase 7: Deploy
- **Railway:** the `server` service with the env vars. Allow your Vercel domain in CORS.
- **Atlas:** network access set to 0.0.0.0/0 (Railway's IPs change), and run the seed once.
- **Vercel:** the `client` with `VITE_API_URL` and an SPA rewrite rule.

**Verify ✅**
- [x] `https://<railway-url>/api/health` → ok.
- [x] Log in on the Vercel URL, with no CORS errors in the browser console.
- [x] Refreshing on a deep link (e.g. `/volunteers/20260001`) doesn't give a 404 (the SPA rewrite works).
- [ ] Add an activity on your laptop → it shows up on your phone (same database). *(API/Atlas persistence across reloads verified; physical phone check left for user verification.)*
- [x] No secrets in the client bundle: search the built JS for `MONGO` or `JWT` and find nothing.
- [x] Run the Phase 6 checklist again on production.

### Phase 8: Preparing for the meeting with the doctor (two parts)
**Part 1: show the working system (live link)**, following this script:
1. Log in → dashboard (KPIs, faculty chart, leaderboard).
2. Search and filter volunteers → open أحمد's profile → print his certificate.
3. Add a new activity → approve it → watch the totals update live.
4. Refresh the page → the data is still there (unlike the prototype).
5. Export to Excel → open it → the same 3-sheet layout as his file, with the numbers corrected.

**Part 2: a short report (in Arabic, 1 to 2 pages): "ملاحظات وتصحيحات على النموذج المبدئي"**
- The main problems from section 1 (E1–E5, C1–C4, C7, C12), each with *what was wrong → its effect → how the system fixes it*.
- A before/after example: total hours 139 → 129, because pending hours were being counted.

**Verify ✅**
- [ ] You've rehearsed the whole script once on the live link (it should take under 10 minutes).
- [x] The report is ready as a PDF or printed. *(Generated at `docs/phase8-report.pdf` with sources `docs/phase8-report.md` and `docs/phase8-report.html`.)*
- [ ] A backup in case the internet fails: screenshots or a short screen recording, and the project running locally.

---

## 4. Do you need Spec Kit?
**No.** Spec Kit (GitHub's spec-driven workflow: spec → plan → tasks) is useful for bigger or team projects where requirements change and AI agents need detailed specs. Here you have a single admin, a clear scope, a working prototype as reference, and very little time, so its overhead would cost you more than it helps. **This document already works as your spec and plan.** You can come back to Spec Kit later if the project grows (student portal, roles, CampusCare integration).
