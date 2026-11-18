import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import type { AppEnv } from '../src/config/env.js';
import type { Faculty, VolunteerCategory } from '../src/constants/enums.js';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import { loadEnv } from '../src/config/env.js';
import { Activity } from '../src/models/Activity.js';
import type { VolunteerDoc } from '../src/models/Volunteer.js';
import { Volunteer } from '../src/models/Volunteer.js';
import { parseSeedWorkbook } from '../src/seed/parseWorkbook.js';
import { seedDatabase } from '../src/seed/seed.js';
import type {
  CategoryStatsResponse,
  CategoryStatsRow,
  FacultyStatsResponse,
  FacultyStatsRow,
  OverviewStats,
} from '../src/services/stats.service.js';
import { roundMetric } from '../src/services/stats.service.js';
import type { ImportPreview } from '../src/services/excelImport.service.js';
import type {
  VolunteerListResult,
  VolunteerProfileResult,
  VolunteerWithLabel,
} from '../src/services/volunteer.service.js';
import type { TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, readJson, startTestServer } from './helpers.js';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.resolve(CURRENT_DIR, '../src/seed/data.xlsx');
const TEST_DB_NAME = 'volunteer_hours_test_p6';

interface ExpectedVolunteer {
  volunteerId: string;
  fullName: string;
  category: VolunteerCategory;
  faculty: Faculty;
  totalActivities: number;
  approvedActivities: number;
  approvedHours: number;
  remainingHours: number;
  eligible: boolean;
}

interface LoginBody {
  token: string;
}

interface ImportErrorBody {
  message: string;
  details: { preview: ImportPreview };
}

const EXPECTED_VOLUNTEERS: ExpectedVolunteer[] = [
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

const EXPECTED_FACULTIES: FacultyStatsRow[] = [
  {
    faculty: 'كلية الصيدلة',
    volunteerCount: 1,
    totalActivities: 3,
    approvedActivities: 3,
    approvedHours: 37,
    avgHours: 37,
    percentage: 28.7,
    activeVolunteers: 1,
    participationRate: 100,
  },
  {
    faculty: 'كلية الطب البشري',
    volunteerCount: 1,
    totalActivities: 3,
    approvedActivities: 3,
    approvedHours: 31,
    avgHours: 31,
    percentage: 24,
    activeVolunteers: 1,
    participationRate: 100,
  },
  {
    faculty: 'كلية تكنولوجيا العلوم الصحية',
    volunteerCount: 1,
    totalActivities: 1,
    approvedActivities: 1,
    approvedHours: 18,
    avgHours: 18,
    percentage: 14,
    activeVolunteers: 1,
    participationRate: 100,
  },
  {
    faculty: 'كلية طب الأسنان',
    volunteerCount: 1,
    totalActivities: 1,
    approvedActivities: 1,
    approvedHours: 15,
    avgHours: 15,
    percentage: 11.6,
    activeVolunteers: 1,
    participationRate: 100,
  },
  {
    faculty: 'كلية التمريض',
    volunteerCount: 2,
    totalActivities: 2,
    approvedActivities: 1,
    approvedHours: 14,
    avgHours: 7,
    percentage: 10.9,
    activeVolunteers: 1,
    participationRate: 50,
  },
  {
    faculty: 'كلية الاقتصاد والعلوم الإدارية',
    volunteerCount: 1,
    totalActivities: 1,
    approvedActivities: 1,
    approvedHours: 8,
    avgHours: 8,
    percentage: 6.2,
    activeVolunteers: 1,
    participationRate: 100,
  },
  {
    faculty: 'كلية الهندسة',
    volunteerCount: 1,
    totalActivities: 1,
    approvedActivities: 1,
    approvedHours: 6,
    avgHours: 6,
    percentage: 4.7,
    activeVolunteers: 1,
    participationRate: 100,
  },
];

const EXPECTED_CATEGORIES: CategoryStatsRow[] = [
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

async function buildWorkbookBuffer(
  volunteerRows: string[][],
  activityRows: string[][]
): Promise<ExcelJS.Buffer> {
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

function getRowValues(sheet: ExcelJS.Worksheet, rowNumber: number): ExcelJS.CellValue[] {
  const values = sheet.getRow(rowNumber).values;
  return Array.isArray(values) ? values.slice(1) : [];
}

describe('Phase 6 Excel reconciliation and edge cases', () => {
  let env: AppEnv;
  let apiServer: TestServer;
  let token: string;
  let workbookData: Awaited<ReturnType<typeof parseSeedWorkbook>>;

  before(async () => {
    env = loadEnv();
    await connectDatabase(buildTestDbUri(env.mongoUri, TEST_DB_NAME));
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

  it('matches_all_corrected_excel_totals_per_volunteer_faculty_category_and_export', async () => {
    const [volunteersRes, facultiesRes, categoriesRes, overviewRes, exportRes] = await Promise.all([
      apiJson<VolunteerListResult>(apiServer.baseUrl, '/api/volunteers?limit=50', token),
      apiJson<FacultyStatsResponse>(apiServer.baseUrl, '/api/stats/faculties', token),
      apiJson<CategoryStatsResponse>(apiServer.baseUrl, '/api/stats/categories', token),
      apiJson<OverviewStats>(apiServer.baseUrl, '/api/stats/overview', token),
      fetch(`${apiServer.baseUrl}/api/excel/export`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    assert.equal(overviewRes.body.totalApprovedHours, 129);
    assert.equal(overviewRes.body.eligibleVolunteers, 2);
    assert.equal(overviewRes.body.avgHoursPerActive, roundMetric(129 / 7));

    const actualById = new Map<string, VolunteerWithLabel>(
      volunteersRes.body.volunteers.map((volunteer) => [volunteer.volunteerId, volunteer])
    );
    for (const expected of EXPECTED_VOLUNTEERS) {
      const actual = actualById.get(expected.volunteerId);
      assert.ok(actual, `Missing volunteer ${expected.volunteerId}`);
      for (const [key, value] of Object.entries(expected)) {
        assert.equal(
          actual[key as keyof ExpectedVolunteer],
          value,
          `Mismatch on ${expected.volunteerId}.${key}`
        );
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
    await exportedWorkbook.xlsx.load(exportedBuffer as unknown as ExcelJS.Buffer);

    const summarySheet = exportedWorkbook.getWorksheet('لوحة التحكم والتقارير');
    assert.ok(summarySheet);
    assert.deepEqual(getRowValues(summarySheet, 12), ['إجمالي الكليات', 8, 11, 129, 16.13]);
    assert.deepEqual(getRowValues(summarySheet, 19), ['الإجمالي العام للفئات', 8, 129, 16.13]);

    const volunteersSheet = exportedWorkbook.getWorksheet('بيانات المتطوعين');
    assert.ok(volunteersSheet);
    assert.equal(volunteersSheet.rowCount, 11);
    const nourRow = getRowValues(volunteersSheet, 11);
    assert.equal(nourRow[1], '20260008');
    assert.equal(nourRow[6], 0);
    assert.equal(nourRow[7], 30);
    assert.equal(nourRow[8], 'متبقي 30 ساعة');
  });

  it('calculates_zero_activity_volunteer_metrics_without_skewing_active_average', async () => {
    const createZeroRes = await apiJson<unknown>(apiServer.baseUrl, '/api/volunteers', token, {
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
      apiJson<VolunteerProfileResult>(apiServer.baseUrl, '/api/volunteers/20260090', token),
      apiJson<OverviewStats>(apiServer.baseUrl, '/api/stats/overview', token),
      apiJson<FacultyStatsResponse>(apiServer.baseUrl, '/api/stats/faculties', token),
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

    const engFaculty = facultiesRes.body.faculties.find(
      (faculty) => faculty.faculty === 'كلية الهندسة'
    );
    assert.ok(engFaculty);
    assert.equal(engFaculty.volunteerCount, 2);
    assert.equal(engFaculty.approvedHours, 6);
    assert.equal(engFaculty.avgHours, 3);
  });

  it('returns_zero_metrics_without_nan_when_database_is_empty', async () => {
    await Activity.deleteMany({});
    await Volunteer.deleteMany({});

    const [emptyOverview, emptyFaculties, emptyCategories] = await Promise.all([
      apiJson<OverviewStats>(apiServer.baseUrl, '/api/stats/overview', token),
      apiJson<FacultyStatsResponse>(apiServer.baseUrl, '/api/stats/faculties', token),
      apiJson<CategoryStatsResponse>(apiServer.baseUrl, '/api/stats/categories', token),
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
      eventsThisMonth: 0,
      pendingRegistrations: 0,
      pendingApplications: 0,
      certificateBuckets: {
        eligible: 0,
        nearEligible: 0,
        inProgress: 0,
        zeroHours: 0,
      },
      zeroHourVolunteers: [],
    });
    assert.equal(emptyFaculties.body.totals.avgHours, 0);
    assert.equal(emptyCategories.body.totals.avgHours, 0);
  });

  it('grants_eligibility_at_exact_30_approved_hours_ignoring_pending_and_rejected_hours', async () => {
    await apiJson<unknown>(apiServer.baseUrl, '/api/volunteers', token, {
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
    for (const activity of activitiesToAdd) {
      const res = await apiJson<unknown>(apiServer.baseUrl, '/api/activities', token, {
        method: 'POST',
        body: JSON.stringify({
          volunteerId: '20260030',
          title: activity.title,
          type: 'مبادرة',
          hours: activity.hours,
          date: '2026-10-01',
          status: activity.status,
          supervisor: 'د. هبة شريف',
        }),
      });
      assert.equal(res.status, 201);
    }

    const [profileRes, overviewRes, eligibleListRes] = await Promise.all([
      apiJson<VolunteerProfileResult>(apiServer.baseUrl, '/api/volunteers/20260030', token),
      apiJson<OverviewStats>(apiServer.baseUrl, '/api/stats/overview', token),
      apiJson<VolunteerListResult>(
        apiServer.baseUrl,
        '/api/volunteers?eligibility=eligible&search=20260030',
        token
      ),
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
    await apiJson<unknown>(apiServer.baseUrl, '/api/volunteers', token, {
      method: 'POST',
      body: JSON.stringify({
        volunteerId: '20260040',
        fullName: 'منة الله كريم',
        category: 'student',
        faculty: 'كلية الهندسة',
      }),
    });

    for (const title of ['نشاط مرفوض أول', 'نشاط مرفوض ثان']) {
      const res = await apiJson<unknown>(apiServer.baseUrl, '/api/activities', token, {
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
      apiJson<VolunteerProfileResult>(apiServer.baseUrl, '/api/volunteers/20260040', token),
      apiJson<OverviewStats>(apiServer.baseUrl, '/api/stats/overview', token),
      apiJson<VolunteerListResult>(
        apiServer.baseUrl,
        '/api/volunteers?activityStatus=rejected',
        token
      ),
      apiJson<VolunteerListResult>(
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
    const updateDupRes = await apiJson<{ message: string }>(
      apiServer.baseUrl,
      '/api/volunteers/20260002',
      token,
      {
        method: 'PUT',
        body: JSON.stringify({ volunteerId: '20260001' }),
      }
    );
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
    const importBody = await readJson<ImportErrorBody>(importRes);

    assert.equal(importRes.status, 400);
    assert.equal(importBody.details.preview.errors.length, 1);
    assert.match(importBody.details.preview.errors[0].message, /20269001/);
    assert.equal(await Volunteer.countDocuments(), 8);
  });

  it('exports_all_volunteers_even_when_count_exceeds_100_api_page_limit', async () => {
    const bulkVolunteers: VolunteerDoc[] = Array.from({ length: 105 }, (_, index) => ({
      volunteerId: `2027${String(index + 1).padStart(4, '0')}`,
      fullName: `متطوع اختبار ${index + 1}`,
      category: 'student',
      faculty: 'كلية الهندسة',
    }));
    await Volunteer.insertMany(bulkVolunteers);

    const exportRes = await fetch(`${apiServer.baseUrl}/api/excel/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(exportRes.status, 200);

    const exportedWorkbook = new ExcelJS.Workbook();
    await exportedWorkbook.xlsx.load(
      Buffer.from(await exportRes.arrayBuffer()) as unknown as ExcelJS.Buffer
    );
    const volunteersSheet = exportedWorkbook.getWorksheet('بيانات المتطوعين');
    assert.ok(volunteersSheet);

    // 3 header/title rows + 8 seeded + 105 bulk volunteers = 116 rows
    assert.equal(volunteersSheet.rowCount, 116);
  });
});
