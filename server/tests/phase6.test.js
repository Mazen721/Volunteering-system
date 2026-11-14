import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import { loadEnv } from '../src/config/env.js';
import { Activity } from '../src/models/Activity.js';
import { Volunteer } from '../src/models/Volunteer.js';
import { parseSeedWorkbook } from '../src/seed/parseWorkbook.js';
import { seedDatabase } from '../src/seed/seed.js';
import { roundMetric } from '../src/services/stats.service.js';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.resolve(CURRENT_DIR, '../src/seed/data.xlsx');
const TEST_DB_NAME = 'volunteer_hours_test_p6';

const EXPECTED_VOLUNTEERS = [
  {
    volunteerId: '20260001',
    fullName: 'أحمد محمد علي',
    category: 'student',
    faculty: 'كلية الطب البشري',
    totalActivities: 3,
    approvedActivities: 3,
    approvedHours: 31,
    remainingHours: 0,
    eligible: true,
  },
  {
    volunteerId: '20260002',
    fullName: 'سارة محمود حسن',
    category: 'student',
    faculty: 'كلية طب الأسنان',
    totalActivities: 1,
    approvedActivities: 1,
    approvedHours: 15,
    remainingHours: 15,
    eligible: false,
  },
  {
    volunteerId: '20260003',
    fullName: 'د. عمرو أحمد جبر',
    category: 'academic',
    faculty: 'كلية الصيدلة',
    totalActivities: 3,
    approvedActivities: 3,
    approvedHours: 37,
    remainingHours: 0,
    eligible: true,
  },
  {
    volunteerId: '20260004',
    fullName: 'آية إبراهيم السيد',
    category: 'student',
    faculty: 'كلية الهندسة',
    totalActivities: 1,
    approvedActivities: 1,
    approvedHours: 6,
    remainingHours: 24,
    eligible: false,
  },
  {
    volunteerId: '20260005',
    fullName: 'أ. محمد علي مصطفى',
    category: 'admin',
    faculty: 'كلية تكنولوجيا العلوم الصحية',
    totalActivities: 1,
    approvedActivities: 1,
    approvedHours: 18,
    remainingHours: 12,
    eligible: false,
  },
  {
    volunteerId: '20260006',
    fullName: 'مريم طارق فؤاد',
    category: 'student',
    faculty: 'كلية الاقتصاد والعلوم الإدارية',
    totalActivities: 1,
    approvedActivities: 1,
    approvedHours: 8,
    remainingHours: 22,
    eligible: false,
  },
  {
    volunteerId: '20260007',
    fullName: 'د. خالد عبد الرحمن',
    category: 'academic',
    faculty: 'كلية التمريض',
    totalActivities: 1,
    approvedActivities: 1,
    approvedHours: 14,
    remainingHours: 16,
    eligible: false,
  },
  {
    volunteerId: '20260008',
    fullName: 'نور طاهر حسين',
    category: 'student',
    faculty: 'كلية التمريض',
    totalActivities: 1,
    approvedActivities: 0,
    approvedHours: 0,
    remainingHours: 30,
    eligible: false,
  },
];

const EXPECTED_FACULTIES = [
  {
    faculty: 'كلية الصيدلة',
    volunteerCount: 1,
    totalActivities: 3,
    approvedActivities: 3,
    approvedHours: 37,
    avgHours: 37,
    percentage: 28.7,
  },
  {
    faculty: 'كلية الطب البشري',
    volunteerCount: 1,
    totalActivities: 3,
    approvedActivities: 3,
    approvedHours: 31,
    avgHours: 31,
    percentage: 24,
  },
  {
    faculty: 'كلية تكنولوجيا العلوم الصحية',
    volunteerCount: 1,
    totalActivities: 1,
    approvedActivities: 1,
    approvedHours: 18,
    avgHours: 18,
    percentage: 14,
  },
  {
    faculty: 'كلية طب الأسنان',
    volunteerCount: 1,
    totalActivities: 1,
    approvedActivities: 1,
    approvedHours: 15,
    avgHours: 15,
    percentage: 11.6,
  },
  {
    faculty: 'كلية التمريض',
    volunteerCount: 2,
    totalActivities: 2,
    approvedActivities: 1,
    approvedHours: 14,
    avgHours: 7,
    percentage: 10.9,
  },
  {
    faculty: 'كلية الاقتصاد والعلوم الإدارية',
    volunteerCount: 1,
    totalActivities: 1,
    approvedActivities: 1,
    approvedHours: 8,
    avgHours: 8,
    percentage: 6.2,
  },
  {
    faculty: 'كلية الهندسة',
    volunteerCount: 1,
    totalActivities: 1,
    approvedActivities: 1,
    approvedHours: 6,
    avgHours: 6,
    percentage: 4.7,
  },
];

const EXPECTED_CATEGORIES = [
  {
    category: 'student',
    label: 'الطلاب',
    volunteerCount: 5,
    totalActivities: 7,
    approvedActivities: 6,
    approvedHours: 60,
    avgHours: 12,
  },
  {
    category: 'academic',
    label: 'أعضاء الكادر الأكاديمي',
    volunteerCount: 2,
    totalActivities: 4,
    approvedActivities: 4,
    approvedHours: 51,
    avgHours: 25.5,
  },
  {
    category: 'admin',
    label: 'أعضاء الجهاز الإداري',
    volunteerCount: 1,
    totalActivities: 1,
    approvedActivities: 1,
    approvedHours: 18,
    avgHours: 18,
  },
];

function buildTestDbUri(mongoUri) {
  const url = new URL(mongoUri);
  url.pathname = `/${TEST_DB_NAME}`;
  return url.toString();
}

async function startTestServer(app) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

async function apiJson(baseUrl, route, token, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function buildWorkbookBuffer(volunteerRows, activityRows) {
  const workbook = new ExcelJS.Workbook();
  const volSheet = workbook.addWorksheet('بيانات المتطوعين');
  volSheet.addRow(['الرقم التعريفي (ID)', 'الاسم الرباعي', 'الفئة', 'الكلية / الجهة']);
  for (const row of volunteerRows) {
    volSheet.addRow(row);
  }

  const actSheet = workbook.addWorksheet('سجل الأنشطة والساعات');
  actSheet.addRow([
    'الرقم التعريفي',
    'عنوان النشاط التطوعي',
    'نوع النشاط',
    'عدد الساعات',
    'تاريخ النشاط',
    'حالة الاعتماد',
    'مشرف النشاط',
  ]);
  for (const row of activityRows) {
    actSheet.addRow(row);
  }

  return workbook.xlsx.writeBuffer();
}

describe('Phase 6 Excel reconciliation and edge cases', () => {
  let env;
  let apiServer;
  let token;
  let workbookData;

  before(async () => {
    env = loadEnv();
    await connectDatabase(buildTestDbUri(env.mongoUri));
    assert.equal(mongoose.connection.name, TEST_DB_NAME);
    workbookData = await parseSeedWorkbook(SEED_FILE);

    const app = createApp({ clientUrl: env.clientUrl, jwtSecret: env.jwtSecret });
    apiServer = await startTestServer(app);
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    await Promise.all([Volunteer.createIndexes(), Activity.createIndexes()]);
    await seedDatabase({
      ...workbookData,
      adminEmail: env.adminEmail,
      adminPassword: env.adminPassword,
    });

    const loginResponse = await fetch(`${apiServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: env.adminEmail, password: env.adminPassword }),
    });
    const loginPayload = await loginResponse.json();
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

  it('matches_all_corrected_excel_totals_per_volunteer_faculty_category_and_export', async () => {
    const [volunteersRes, facultiesRes, categoriesRes, overviewRes, exportRes] = await Promise.all([
      apiJson(apiServer.baseUrl, '/api/volunteers?limit=50', token),
      apiJson(apiServer.baseUrl, '/api/stats/faculties', token),
      apiJson(apiServer.baseUrl, '/api/stats/categories', token),
      apiJson(apiServer.baseUrl, '/api/stats/overview', token),
      fetch(`${apiServer.baseUrl}/api/excel/export`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    assert.equal(overviewRes.body.totalApprovedHours, 129);
    assert.equal(overviewRes.body.eligibleVolunteers, 2);
    assert.equal(overviewRes.body.avgHoursPerActive, roundMetric(129 / 7));

    const actualById = new Map(volunteersRes.body.volunteers.map((v) => [v.volunteerId, v]));
    for (const expected of EXPECTED_VOLUNTEERS) {
      const actual = actualById.get(expected.volunteerId);
      assert.ok(actual, `Missing volunteer ${expected.volunteerId}`);
      for (const [key, value] of Object.entries(expected)) {
        assert.equal(actual[key], value, `Mismatch on ${expected.volunteerId}.${key}`);
      }
    }

    assert.deepEqual(facultiesRes.body.faculties, EXPECTED_FACULTIES);
    assert.deepEqual(facultiesRes.body.totals, {
      volunteerCount: 8,
      totalActivities: 12,
      approvedActivities: 11,
      approvedHours: 129,
      avgHours: 16.13,
    });

    assert.deepEqual(categoriesRes.body.categories, EXPECTED_CATEGORIES);
    assert.deepEqual(categoriesRes.body.totals, {
      volunteerCount: 8,
      totalActivities: 12,
      approvedActivities: 11,
      approvedHours: 129,
      avgHours: 16.13,
    });

    const exportedBuffer = Buffer.from(await exportRes.arrayBuffer());
    const exportedWorkbook = new ExcelJS.Workbook();
    await exportedWorkbook.xlsx.load(exportedBuffer);

    const summarySheet = exportedWorkbook.getWorksheet('لوحة التحكم والتقارير');
    const summaryFacultyTotalRow = summarySheet.getRow(12).values.slice(1);
    assert.deepEqual(summaryFacultyTotalRow, ['إجمالي الكليات', 8, 11, 129, 16.13]);

    const summaryCategoryTotalRow = summarySheet.getRow(19).values.slice(1);
    assert.deepEqual(summaryCategoryTotalRow, ['الإجمالي العام للفئات', 8, 129, 16.13]);

    const volunteersSheet = exportedWorkbook.getWorksheet('بيانات المتطوعين');
    assert.equal(volunteersSheet.rowCount, 11);
    const nourRow = volunteersSheet.getRow(11).values.slice(1);
    assert.equal(nourRow[1], '20260008');
    assert.equal(nourRow[6], 0);
    assert.equal(nourRow[7], 30);
    assert.equal(nourRow[8], 'متبقي 30 ساعة');
  });

  it('calculates_zero_activity_volunteer_metrics_without_skewing_active_average', async () => {
    const createZeroRes = await apiJson(apiServer.baseUrl, '/api/volunteers', token, {
      method: 'POST',
      body: JSON.stringify({
        volunteerId: '20260090',
        fullName: 'سلمى حسام الدين',
        category: 'student',
        faculty: 'كلية الهندسة',
      }),
    });
    assert.equal(createZeroRes.status, 201);

    const [profileRes, overviewRes, facultiesRes] = await Promise.all([
      apiJson(apiServer.baseUrl, '/api/volunteers/20260090', token),
      apiJson(apiServer.baseUrl, '/api/stats/overview', token),
      apiJson(apiServer.baseUrl, '/api/stats/faculties', token),
    ]);

    assert.equal(profileRes.body.volunteer.totalActivities, 0);
    assert.equal(profileRes.body.volunteer.approvedHours, 0);
    assert.equal(profileRes.body.volunteer.remainingHours, 30);
    assert.equal(profileRes.body.volunteer.eligible, false);
    assert.equal(profileRes.body.activities.length, 0);

    assert.equal(overviewRes.body.registeredVolunteers, 9);
    assert.equal(overviewRes.body.activeVolunteers, 7);
    assert.equal(overviewRes.body.avgHoursPerRegistered, roundMetric(129 / 9));
    assert.equal(overviewRes.body.avgHoursPerActive, roundMetric(129 / 7));

    const engFaculty = facultiesRes.body.faculties.find((f) => f.faculty === 'كلية الهندسة');
    assert.equal(engFaculty.volunteerCount, 2);
    assert.equal(engFaculty.approvedHours, 6);
    assert.equal(engFaculty.avgHours, 3);
  });

  it('returns_zero_metrics_without_nan_when_database_is_empty', async () => {
    await Activity.deleteMany({});
    await Volunteer.deleteMany({});

    const [emptyOverview, emptyFaculties, emptyCategories] = await Promise.all([
      apiJson(apiServer.baseUrl, '/api/stats/overview', token),
      apiJson(apiServer.baseUrl, '/api/stats/faculties', token),
      apiJson(apiServer.baseUrl, '/api/stats/categories', token),
    ]);

    assert.deepEqual(emptyOverview.body, {
      totalApprovedHours: 0,
      totalActivities: 0,
      approvedActivities: 0,
      registeredVolunteers: 0,
      activeVolunteers: 0,
      eligibleVolunteers: 0,
      activeFaculties: 0,
      avgHoursPerRegistered: 0,
      avgHoursPerActive: 0,
      certificateHours: 30,
    });
    assert.equal(emptyFaculties.body.totals.avgHours, 0);
    assert.equal(emptyCategories.body.totals.avgHours, 0);
  });

  it('grants_eligibility_at_exact_30_approved_hours_ignoring_pending_and_rejected_hours', async () => {
    await apiJson(apiServer.baseUrl, '/api/volunteers', token, {
      method: 'POST',
      body: JSON.stringify({
        volunteerId: '20260030',
        fullName: 'يوسف طارق محمود',
        category: 'admin',
        faculty: 'كلية الصيدلة',
      }),
    });

    const activitiesToAdd = [
      { title: 'قافلة صيدلانية', hours: 18, status: 'approved' },
      { title: 'مبادرة دوائية', hours: 12, status: 'approved' },
      { title: 'نشاط قيد المراجعة', hours: 8, status: 'pending' },
      { title: 'نشاط مرفوض', hours: 6, status: 'rejected' },
    ];
    for (const act of activitiesToAdd) {
      const res = await apiJson(apiServer.baseUrl, '/api/activities', token, {
        method: 'POST',
        body: JSON.stringify({
          volunteerId: '20260030',
          title: act.title,
          type: 'مبادرة',
          hours: act.hours,
          date: '2026-10-01',
          status: act.status,
          supervisor: 'د. هبة شريف',
        }),
      });
      assert.equal(res.status, 201);
    }

    const [profileRes, overviewRes, eligibleListRes] = await Promise.all([
      apiJson(apiServer.baseUrl, '/api/volunteers/20260030', token),
      apiJson(apiServer.baseUrl, '/api/stats/overview', token),
      apiJson(apiServer.baseUrl, '/api/volunteers?eligibility=eligible&search=20260030', token),
    ]);

    assert.equal(profileRes.body.volunteer.totalActivities, 4);
    assert.equal(profileRes.body.volunteer.approvedActivities, 2);
    assert.equal(profileRes.body.volunteer.approvedHours, 30);
    assert.equal(profileRes.body.volunteer.remainingHours, 0);
    assert.equal(profileRes.body.volunteer.eligible, true);
    assert.equal(overviewRes.body.eligibleVolunteers, 3);
    assert.equal(eligibleListRes.body.total, 1);
  });

  it('excludes_volunteers_with_only_rejected_activities_from_active_counts_and_hours', async () => {
    await apiJson(apiServer.baseUrl, '/api/volunteers', token, {
      method: 'POST',
      body: JSON.stringify({
        volunteerId: '20260040',
        fullName: 'منة الله كريم',
        category: 'student',
        faculty: 'كلية الهندسة',
      }),
    });

    for (const title of ['نشاط مرفوض أول', 'نشاط مرفوض ثان']) {
      const res = await apiJson(apiServer.baseUrl, '/api/activities', token, {
        method: 'POST',
        body: JSON.stringify({
          volunteerId: '20260040',
          title,
          type: 'ندوة',
          hours: 15,
          date: '2026-10-02',
          status: 'rejected',
          supervisor: 'د. شريف كامل',
        }),
      });
      assert.equal(res.status, 201);
    }

    const [profileRes, overviewRes, rejectedFilterRes, eligibleRejectedRes] = await Promise.all([
      apiJson(apiServer.baseUrl, '/api/volunteers/20260040', token),
      apiJson(apiServer.baseUrl, '/api/stats/overview', token),
      apiJson(apiServer.baseUrl, '/api/volunteers?activityStatus=rejected', token),
      apiJson(
        apiServer.baseUrl,
        '/api/volunteers?activityStatus=rejected&eligibility=eligible',
        token
      ),
    ]);

    assert.equal(profileRes.body.volunteer.totalActivities, 2);
    assert.equal(profileRes.body.volunteer.approvedActivities, 0);
    assert.equal(profileRes.body.volunteer.approvedHours, 0);
    assert.equal(profileRes.body.volunteer.remainingHours, 30);
    assert.equal(profileRes.body.volunteer.eligible, false);

    assert.equal(overviewRes.body.totalApprovedHours, 129);
    assert.equal(overviewRes.body.activeVolunteers, 7);
    assert.equal(overviewRes.body.totalActivities, 14);
    assert.equal(overviewRes.body.approvedActivities, 11);

    assert.equal(rejectedFilterRes.body.total, 1);
    assert.equal(rejectedFilterRes.body.volunteers[0].volunteerId, '20260040');
    assert.equal(eligibleRejectedRes.body.total, 0);
  });

  it('rejects_duplicate_volunteer_ids_on_update_and_excel_import_without_partial_writes', async () => {
    const updateDupRes = await apiJson(apiServer.baseUrl, '/api/volunteers/20260002', token, {
      method: 'PUT',
      body: JSON.stringify({ volunteerId: '20260001' }),
    });
    assert.equal(updateDupRes.status, 409);
    assert.equal(updateDupRes.body.message, 'الرقم التعريفي للمتطوع مسجل مسبقاً');

    const dupWorkbookBuffer = await buildWorkbookBuffer(
      [
        ['20269001', 'متطوع جديد أول', 'الطلاب', 'كلية الهندسة'],
        ['20269001', 'متطوع مكرر بالملف', 'الطلاب', 'كلية الصيدلة'],
      ],
      []
    );

    const form = new FormData();
    form.append('file', new Blob([dupWorkbookBuffer]), 'duplicate-ids.xlsx');
    const importRes = await fetch(`${apiServer.baseUrl}/api/excel/import?commit=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const importBody = await importRes.json();

    assert.equal(importRes.status, 400);
    assert.equal(importBody.details.preview.errors.length, 1);
    assert.match(importBody.details.preview.errors[0].message, /20269001/);
    assert.equal(await Volunteer.countDocuments(), 8);
  });

  it('exports_all_volunteers_even_when_count_exceeds_100_api_page_limit', async () => {
    const bulkVolunteers = Array.from({ length: 105 }, (_, idx) => ({
      volunteerId: `2027${String(idx + 1).padStart(4, '0')}`,
      fullName: `متطوع اختبار ${idx + 1}`,
      category: 'student',
      faculty: 'كلية الهندسة',
    }));
    await Volunteer.insertMany(bulkVolunteers);

    const exportRes = await fetch(`${apiServer.baseUrl}/api/excel/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(exportRes.status, 200);

    const exportedWorkbook = new ExcelJS.Workbook();
    await exportedWorkbook.xlsx.load(Buffer.from(await exportRes.arrayBuffer()));
    const volunteersSheet = exportedWorkbook.getWorksheet('بيانات المتطوعين');

    // 3 header/title rows + 8 seeded + 105 bulk volunteers = 116 rows
    assert.equal(volunteersSheet.rowCount, 116);
  });
});
