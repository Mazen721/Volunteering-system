import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import type { AppEnv } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import { loadEnv } from '../src/config/env.js';
import { Activity } from '../src/models/Activity.js';
import { Volunteer } from '../src/models/Volunteer.js';
import { parseSeedWorkbook } from '../src/seed/parseWorkbook.js';
import { seedDatabase } from '../src/seed/seed.js';
import type {
  CategoryStatsResponse,
  FacultyStatsResponse,
  LeaderboardResponse,
  OverviewStats,
} from '../src/services/stats.service.js';
import { computeEligibility, roundMetric } from '../src/services/stats.service.js';
import type { VolunteerListResult, VolunteerProfileResult } from '../src/services/volunteer.service.js';
import type {
  ImportCommitResult,
  ImportPreviewResult,
} from '../src/services/excelImport.service.js';
import type { TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, readJson, startTestServer } from './helpers.js';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.resolve(CURRENT_DIR, '../src/seed/data.xlsx');
const ORIGINAL_FILE = path.resolve(CURRENT_DIR, '../../docs/reference/original-data.xlsx');
const TEST_DB_NAME = 'volunteer_hours_test_p2';

interface LoginBody {
  token: string;
}

describe('computeEligibility', () => {
  const cases = [
    { hours: 29, expectedRemaining: 1, expectedEligible: false },
    { hours: 30, expectedRemaining: 0, expectedEligible: true },
    { hours: 31, expectedRemaining: 0, expectedEligible: true },
  ];

  for (const scenario of cases) {
    it(`evaluates_${scenario.hours}_hours_against_30_hour_threshold`, () => {
      assert.deepEqual(computeEligibility(scenario.hours, 30), {
        approvedHours: scenario.hours,
        remainingHours: scenario.expectedRemaining,
        eligible: scenario.expectedEligible,
      });
    });
  }
});

describe('Phase 2 API features integration', () => {
  let env: AppEnv;
  let apiServer: TestServer;
  let token: string;

  before(async () => {
    env = loadEnv();
    await connectDatabase(buildTestDbUri(env.mongoUri, TEST_DB_NAME));
    assert.equal(mongoose.connection.name, TEST_DB_NAME);
    await mongoose.connection.dropDatabase();

    const workbookData = await parseSeedWorkbook(SEED_FILE);
    await seedDatabase({
      ...workbookData,
      adminEmail: env.adminEmail,
      adminPassword: env.adminPassword,
    });

    const app = createApp({ clientUrl: env.clientUrl, jwtSecret: env.jwtSecret });
    apiServer = await startTestServer(app);

    const loginResponse = await fetch(`${apiServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: env.adminEmail, password: env.adminPassword }),
    });
    const loginPayload = await readJson<LoginBody>(loginResponse);
    token = loginPayload.token;
  });

  after(async () => {
    if (apiServer) {
      await apiServer.close();
    }
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === TEST_DB_NAME) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  it('returns_accurate_seeded_overview_faculties_categories_and_leaderboard', async () => {
    const overview = await apiJson<OverviewStats>(
      apiServer.baseUrl,
      '/api/stats/overview',
      token
    );
    assert.equal(overview.status, 200);
    assert.equal(overview.body.totalApprovedHours, 129);
    assert.equal(overview.body.registeredVolunteers, 8);
    assert.equal(overview.body.activeVolunteers, 7);
    assert.equal(overview.body.totalActivities, 12);
    assert.equal(overview.body.approvedActivities, 11);
    assert.equal(overview.body.avgHoursPerRegistered, roundMetric(129 / 8));

    const categories = await apiJson<CategoryStatsResponse>(
      apiServer.baseUrl,
      '/api/stats/categories',
      token
    );
    assert.equal(categories.status, 200);
    assert.equal(categories.body.categories.length, 3);
    assert.equal(categories.body.totals.avgHours, roundMetric(129 / 8));

    const faculties = await apiJson<FacultyStatsResponse>(
      apiServer.baseUrl,
      '/api/stats/faculties',
      token
    );
    assert.equal(faculties.status, 200);
    assert.equal(faculties.body.faculties.length, 7);
    assert.equal(faculties.body.totals.avgHours, roundMetric(129 / 8));

    const leaderboard = await apiJson<LeaderboardResponse>(
      apiServer.baseUrl,
      '/api/stats/leaderboard?category=student',
      token
    );
    assert.equal(leaderboard.status, 200);
    assert.equal(leaderboard.body.leaderboard[0].volunteerId, '20260001');
  });

  it('computes_volunteer_eligibility_and_supports_combined_filters_and_pagination', async () => {
    const ahmed = await apiJson<VolunteerProfileResult>(
      apiServer.baseUrl,
      '/api/volunteers/20260001',
      token
    );
    assert.equal(ahmed.body.volunteer.approvedHours, 31);
    assert.equal(ahmed.body.volunteer.eligible, true);

    const amr = await apiJson<VolunteerProfileResult>(
      apiServer.baseUrl,
      '/api/volunteers/20260003',
      token
    );
    assert.equal(amr.body.volunteer.approvedHours, 37);
    assert.equal(amr.body.volunteer.eligible, true);

    const nour = await apiJson<VolunteerProfileResult>(
      apiServer.baseUrl,
      '/api/volunteers/20260008',
      token
    );
    assert.equal(nour.body.volunteer.approvedHours, 0);
    assert.equal(nour.body.volunteer.remainingHours, 30);
    assert.equal(nour.body.volunteer.totalActivities, 1);

    const filtered = await apiJson<VolunteerListResult>(
      apiServer.baseUrl,
      '/api/volunteers?category=student&eligibility=eligible&search=أحمد&page=1&limit=5',
      token
    );
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.total, 1);
    assert.equal(filtered.body.pages, 1);
    assert.equal(filtered.body.volunteers[0].volunteerId, '20260001');

    const pendingVolunteers = await apiJson<VolunteerListResult>(
      apiServer.baseUrl,
      '/api/volunteers?activityStatus=pending',
      token
    );
    assert.equal(pendingVolunteers.status, 200);
    assert.equal(pendingVolunteers.body.total, 1);
    assert.equal(pendingVolunteers.body.volunteers[0].volunteerId, '20260008');

    const eligibleAndPending = await apiJson<VolunteerListResult>(
      apiServer.baseUrl,
      '/api/volunteers?eligibility=eligible&activityStatus=pending',
      token
    );
    assert.equal(eligibleAndPending.status, 200);
    assert.equal(eligibleAndPending.body.total, 0);
  });

  it('updates_totals_when_activity_status_changes_from_pending_to_approved', async () => {
    const nour = await apiJson<VolunteerProfileResult>(
      apiServer.baseUrl,
      '/api/volunteers/20260008',
      token
    );
    const pendingActivityId = nour.body.activities[0]._id;

    const approvedRes = await apiJson<unknown>(
      apiServer.baseUrl,
      `/api/activities/${pendingActivityId}/status`,
      token,
      { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) }
    );
    assert.equal(approvedRes.status, 200);

    const afterApprove = await apiJson<OverviewStats>(
      apiServer.baseUrl,
      '/api/stats/overview',
      token
    );
    assert.equal(afterApprove.body.totalApprovedHours, 139);
    assert.equal(afterApprove.body.activeVolunteers, 8);

    await apiJson<unknown>(
      apiServer.baseUrl,
      `/api/activities/${pendingActivityId}/status`,
      token,
      { method: 'PATCH', body: JSON.stringify({ status: 'pending' }) }
    );
  });

  it('rejects_duplicate_volunteerId_with_409_and_blocks_deleting_volunteer_with_activities', async () => {
    const duplicateRes = await apiJson<unknown>(apiServer.baseUrl, '/api/volunteers', token, {
      method: 'POST',
      body: JSON.stringify({
        volunteerId: '20260001',
        fullName: 'متطوع مكرر',
        category: 'student',
        faculty: 'كلية الطب البشري',
      }),
    });
    assert.equal(duplicateRes.status, 409);

    const blockedDelete = await apiJson<unknown>(
      apiServer.baseUrl,
      '/api/volunteers/20260001',
      token,
      { method: 'DELETE' }
    );
    assert.equal(blockedDelete.status, 409);

    const created = await apiJson<unknown>(apiServer.baseUrl, '/api/volunteers', token, {
      method: 'POST',
      body: JSON.stringify({
        volunteerId: '20269999',
        fullName: 'متطوع مؤقت',
        category: 'student',
        faculty: 'كلية الهندسة',
      }),
    });
    assert.equal(created.status, 201);

    const allowedDelete = await apiJson<unknown>(
      apiServer.baseUrl,
      '/api/volunteers/20269999',
      token,
      { method: 'DELETE' }
    );
    assert.equal(allowedDelete.status, 200);
  });

  it('exports_3_arabic_sheets_and_round_trips_without_creating_duplicates', async () => {
    const exportRes = await fetch(`${apiServer.baseUrl}/api/excel/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(exportRes.status, 200);
    const buffer = Buffer.from(await exportRes.arrayBuffer());

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    assert.deepEqual(
      workbook.worksheets.map((worksheet) => worksheet.name),
      ['لوحة التحكم والتقارير', 'بيانات المتطوعين', 'سجل الأنشطة والساعات']
    );

    const form = new FormData();
    form.append('file', new Blob([buffer]), 'export.xlsx');
    const roundTripRes = await fetch(`${apiServer.baseUrl}/api/excel/import?commit=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const roundTripBody = await readJson<ImportCommitResult>(roundTripRes);

    assert.equal(roundTripRes.status, 200);
    assert.equal(roundTripBody.committed, true);
    assert.equal(roundTripBody.summary.volunteersCreated, 0);
    assert.equal(roundTripBody.summary.activitiesCreated, 0);
    assert.equal(roundTripBody.summary.skippedDuplicates, 12);
  });

  it('previews_original_excel_reporting_faculty_conflicts_and_possible_duplicate_without_saving', async () => {
    await Activity.deleteMany({});
    await Volunteer.deleteMany({});

    const originalBuffer = await fs.readFile(ORIGINAL_FILE);
    const form = new FormData();
    form.append('file', new Blob([originalBuffer]), 'original-data.xlsx');

    const previewRes = await fetch(`${apiServer.baseUrl}/api/excel/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const previewBody = await readJson<ImportPreviewResult>(previewRes);

    assert.equal(previewRes.status, 200);
    assert.equal(previewBody.committed, false);
    assert.equal(previewBody.preview.conflicts.length, 8);
    assert.equal(new Set(previewBody.preview.conflicts.map((conflict) => conflict.volunteerId)).size, 6);
    assert.equal(
      previewBody.preview.duplicates.some(
        (duplicate) => duplicate.type === 'possible' && duplicate.volunteerId === '20260003'
      ),
      true
    );
    assert.equal(await Volunteer.countDocuments(), 0);
    assert.equal(await Activity.countDocuments(), 0);
  });
});
