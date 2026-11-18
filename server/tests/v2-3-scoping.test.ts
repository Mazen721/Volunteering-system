import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import type { AppEnv } from '../src/config/env.js';
import { loadEnv } from '../src/config/env.js';
import type { Faculty, UserRole } from '../src/constants/enums.js';
import { FACULTIES } from '../src/constants/enums.js';
import { Activity } from '../src/models/Activity.js';
import { Settings } from '../src/models/Settings.js';
import { User } from '../src/models/User.js';
import { Volunteer } from '../src/models/Volunteer.js';
import type { PublicUser } from '../src/services/auth.service.js';
import type { ActivityListResult } from '../src/services/activity.service.js';
import type { SettingsPayload } from '../src/services/settings.service.js';
import type {
  CategoryStatsResponse,
  FacultyStatsResponse,
  LeaderboardResponse,
  OverviewStats,
} from '../src/services/stats.service.js';
import type {
  VolunteerListResult,
  VolunteerProfileResult,
} from '../src/services/volunteer.service.js';
import type { TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, startTestServer } from './helpers.js';

const TEST_DB_NAME = 'volunteer_hours_test_v2_3';
const FACULTY_A = FACULTIES[0];
const FACULTY_B = FACULTIES[1];

interface ErrorResponse {
  message: string;
}

interface UsersResponse {
  users: PublicUser[];
}

interface UserResponse {
  user: PublicUser;
}

interface VolunteerMutationResponse {
  volunteer: { _id: string; volunteerId: string; faculty: Faculty; fullName: string };
}

async function createAccount(options: {
  email: string;
  role: UserRole;
  faculty: Faculty | null;
  status?: 'active' | 'disabled' | 'pending';
  volunteer?: mongoose.Types.ObjectId | null;
  password?: string;
}) {
  const passwordHash = await bcrypt.hash(options.password ?? 'Password123!', 10);
  const doc = await User.create({
    email: options.email,
    passwordHash,
    fullName: `حساب ${options.role}`,
    role: options.role,
    status: options.status ?? 'active',
    faculty: options.faculty,
    volunteer: options.volunteer ?? null,
  });
  return {
    doc,
    id: doc._id.toString(),
    token: jwt.sign({ sub: doc._id.toString(), role: options.role }, loadEnv().jwtSecret, {
      expiresIn: '1h',
    }),
  };
}

async function seedTwoFacultyDataset() {
  const [volA1, volA2, volB1] = await Volunteer.create([
    { volunteerId: 'A-101', fullName: 'طالب طب ١', category: 'student', faculty: FACULTY_A },
    { volunteerId: 'A-102', fullName: 'معيد طب ٢', category: 'academic', faculty: FACULTY_A },
    { volunteerId: 'B-201', fullName: 'طالب أسنان ١', category: 'student', faculty: FACULTY_B },
  ]);

  const [actA1, actA2, actB1] = await Activity.create([
    {
      volunteer: volA1._id,
      title: 'قافلة طب',
      type: 'قافلة',
      hours: 15,
      date: new Date('2026-10-01T00:00:00.000Z'),
      status: 'approved',
      supervisor: 'د. سارة',
    },
    {
      volunteer: volA2._id,
      title: 'ندوة طبية',
      type: 'ندوة',
      hours: 5,
      date: new Date('2026-10-02T00:00:00.000Z'),
      status: 'pending',
      supervisor: 'د. سارة',
    },
    {
      volunteer: volB1._id,
      title: 'حملة أسنان',
      type: 'حملة توعية',
      hours: 32,
      date: new Date('2026-10-03T00:00:00.000Z'),
      status: 'approved',
      supervisor: 'د. طارق',
    },
  ]);

  return { volA1, volA2, volB1, actA1, actA2, actB1 };
}

describe('Phase V2-3 Dean Faculty Scoping, Anti-Enumeration & Admin Management', () => {
  let env: AppEnv;
  let apiServer: TestServer;

  before(async () => {
    env = loadEnv();
    await connectDatabase(buildTestDbUri(env.mongoUri, TEST_DB_NAME));
    assert.equal(mongoose.connection.name, TEST_DB_NAME);
    await mongoose.connection.dropDatabase();
    await Promise.all([User.init(), Volunteer.init(), Activity.init(), Settings.init()]);

    const app = createApp({ clientUrl: env.clientUrl, jwtSecret: env.jwtSecret });
    apiServer = await startTestServer(app);
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

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Volunteer.deleteMany({}),
      Activity.deleteMany({}),
      Settings.deleteMany({}),
    ]);
  });

  it('scopes_volunteers_and_activities_lists_to_dean_faculty_ignoring_query_faculty', async () => {
    const { volA1 } = await seedTwoFacultyDataset();
    const deanA = await createAccount({
      email: 'dean.a@mnu.edu.eg',
      role: 'dean',
      faculty: FACULTY_A,
    });
    const studentA = await createAccount({
      email: 'student.a@mnu.edu.eg',
      role: 'student',
      faculty: FACULTY_A,
      volunteer: volA1._id,
    });

    const volunteersRes = await apiJson<VolunteerListResult>(
      apiServer.baseUrl,
      `/api/volunteers?faculty=${encodeURIComponent(FACULTY_B)}`,
      deanA.token
    );
    assert.equal(volunteersRes.status, 200);
    assert.equal(volunteersRes.body.total, 2);
    assert.ok(volunteersRes.body.volunteers.every((v) => v.faculty === FACULTY_A));
    const linkedVol = volunteersRes.body.volunteers.find((v) => v.volunteerId === 'A-101');
    assert.equal(linkedVol?.linkedUserId, studentA.id);

    const activitiesRes = await apiJson<ActivityListResult>(
      apiServer.baseUrl,
      `/api/activities?faculty=${encodeURIComponent(FACULTY_B)}`,
      deanA.token
    );
    assert.equal(activitiesRes.status, 200);
    assert.equal(activitiesRes.body.total, 2);
    assert.ok(activitiesRes.body.activities.every((a) => a.volunteer.faculty === FACULTY_A));
  });

  it('forces_dean_faculty_on_volunteer_create_and_update_ignoring_spoofed_body', async () => {
    const deanA = await createAccount({
      email: 'dean.a@mnu.edu.eg',
      role: 'dean',
      faculty: FACULTY_A,
    });

    const created = await apiJson<VolunteerMutationResponse>(
      apiServer.baseUrl,
      '/api/volunteers',
      deanA.token,
      {
        method: 'POST',
        body: JSON.stringify({
          volunteerId: 'A-999',
          fullName: 'متطوع جديد',
          category: 'student',
          faculty: FACULTY_B,
        }),
      }
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.volunteer.faculty, FACULTY_A);

    const updated = await apiJson<VolunteerMutationResponse>(
      apiServer.baseUrl,
      '/api/volunteers/A-999',
      deanA.token,
      {
        method: 'PUT',
        body: JSON.stringify({ fullName: 'متطوع محدث', faculty: FACULTY_B }),
      }
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.body.volunteer.faculty, FACULTY_A);
    assert.equal(updated.body.volunteer.fullName, 'متطوع محدث');
  });

  it('returns_404_when_dean_accesses_or_mutates_out_of_faculty_resources', async () => {
    const { volB1, actB1 } = await seedTwoFacultyDataset();
    const deanA = await createAccount({
      email: 'dean.a@mnu.edu.eg',
      role: 'dean',
      faculty: FACULTY_A,
    });
    const deanB = await createAccount({
      email: 'dean.b@mnu.edu.eg',
      role: 'dean',
      faculty: FACULTY_B,
    });
    const studentB = await createAccount({
      email: 'student.b@mnu.edu.eg',
      role: 'student',
      faculty: FACULTY_B,
      volunteer: volB1._id,
    });

    const outOfFacultyCalls: Array<{
      route: string;
      method: string;
      body?: Record<string, unknown>;
    }> = [
      { route: `/api/volunteers/${volB1.volunteerId}`, method: 'GET' },
      { route: `/api/volunteers/${volB1._id.toString()}`, method: 'GET' },
      { route: `/api/volunteers/${volB1.volunteerId}`, method: 'PUT', body: { fullName: 'تعديل' } },
      { route: `/api/volunteers/${volB1.volunteerId}`, method: 'DELETE' },
      {
        route: '/api/activities',
        method: 'POST',
        body: {
          volunteerId: volB1.volunteerId,
          title: 'نشاط خارج الكلية',
          type: 'ندوة',
          hours: 2,
          date: '2026-10-05',
          status: 'pending',
          supervisor: 'مشرف',
        },
      },
      { route: `/api/activities/${actB1._id.toString()}`, method: 'PUT', body: { hours: 10 } },
      {
        route: `/api/activities/${actB1._id.toString()}/status`,
        method: 'PATCH',
        body: { status: 'rejected' },
      },
      { route: `/api/activities/${actB1._id.toString()}`, method: 'DELETE' },
      {
        route: `/api/users/${studentB.id}`,
        method: 'PATCH',
        body: { temporaryPassword: 'NewPassword123!' },
      },
      {
        route: `/api/users/${deanB.id}`,
        method: 'PATCH',
        body: { temporaryPassword: 'NewPassword123!' },
      },
    ];

    for (const call of outOfFacultyCalls) {
      const response = await apiJson<ErrorResponse>(apiServer.baseUrl, call.route, deanA.token, {
        method: call.method,
        ...(call.body ? { body: JSON.stringify(call.body) } : {}),
      });
      assert.equal(
        response.status,
        404,
        `Expected 404 for ${call.method} ${call.route}, got ${response.status}`
      );
    }
  });

  it('blocks_student_tokens_with_403_on_certificate_volunteer_and_admin_endpoints', async () => {
    const { volA1 } = await seedTwoFacultyDataset();
    const student = await createAccount({
      email: 'student.a@mnu.edu.eg',
      role: 'student',
      faculty: FACULTY_A,
      volunteer: volA1._id,
    });

    const blockedRoutes = [
      `/api/volunteers/${volA1.volunteerId}`,
      '/api/volunteers',
      '/api/activities',
      '/api/stats/overview',
      '/api/excel/export',
      '/api/users',
      '/api/settings',
    ];

    for (const route of blockedRoutes) {
      const res = await apiJson<ErrorResponse>(apiServer.baseUrl, route, student.token);
      assert.equal(res.status, 403, `Expected 403 for student on ${route}`);
    }
  });

  it('blocks_deleting_volunteer_with_activities_or_linked_user_account', async () => {
    const { volA1 } = await seedTwoFacultyDataset();
    const admin = await createAccount({ email: 'admin@mnu.edu.eg', role: 'admin', faculty: null });
    const unlinkedWithUser = await Volunteer.create({
      volunteerId: 'A-500',
      fullName: 'متطوع مرتبط بدون أنشطة',
      category: 'student',
      faculty: FACULTY_A,
    });
    await createAccount({
      email: 'linked@mnu.edu.eg',
      role: 'student',
      faculty: FACULTY_A,
      volunteer: unlinkedWithUser._id,
    });
    const cleanVol = await Volunteer.create({
      volunteerId: 'A-501',
      fullName: 'متطوع قابل للحذف',
      category: 'student',
      faculty: FACULTY_A,
    });

    const hasActivitiesRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/volunteers/${volA1.volunteerId}`,
      admin.token,
      { method: 'DELETE' }
    );
    assert.equal(hasActivitiesRes.status, 409);

    const hasUserRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/volunteers/${unlinkedWithUser.volunteerId}`,
      admin.token,
      { method: 'DELETE' }
    );
    assert.equal(hasUserRes.status, 409);

    const cleanDeleteRes = await apiJson<{ message: string }>(
      apiServer.baseUrl,
      `/api/volunteers/${cleanVol.volunteerId}`,
      admin.token,
      { method: 'DELETE' }
    );
    assert.equal(cleanDeleteRes.status, 200);
  });

  it('matches_dean_stats_and_excel_export_to_admin_filtered_faculty_without_cross_faculty_leakage', async () => {
    await seedTwoFacultyDataset();
    const admin = await createAccount({ email: 'admin@mnu.edu.eg', role: 'admin', faculty: null });
    const deanA = await createAccount({
      email: 'dean.a@mnu.edu.eg',
      role: 'dean',
      faculty: FACULTY_A,
    });

    const [
      deanOverview,
      adminFilteredOverview,
      adminAllOverview,
      deanFaculties,
      adminFilteredFaculties,
      deanCategories,
      adminFilteredCategories,
      deanLeaderboard,
      adminFilteredLeaderboard,
    ] = await Promise.all([
      apiJson<OverviewStats>(apiServer.baseUrl, '/api/stats/overview', deanA.token),
      apiJson<OverviewStats>(
        apiServer.baseUrl,
        `/api/stats/overview?faculty=${encodeURIComponent(FACULTY_A)}`,
        admin.token
      ),
      apiJson<OverviewStats>(apiServer.baseUrl, '/api/stats/overview', admin.token),
      apiJson<FacultyStatsResponse>(apiServer.baseUrl, '/api/stats/faculties', deanA.token),
      apiJson<FacultyStatsResponse>(
        apiServer.baseUrl,
        `/api/stats/faculties?faculty=${encodeURIComponent(FACULTY_A)}`,
        admin.token
      ),
      apiJson<CategoryStatsResponse>(apiServer.baseUrl, '/api/stats/categories', deanA.token),
      apiJson<CategoryStatsResponse>(
        apiServer.baseUrl,
        `/api/stats/categories?faculty=${encodeURIComponent(FACULTY_A)}`,
        admin.token
      ),
      apiJson<LeaderboardResponse>(apiServer.baseUrl, '/api/stats/leaderboard', deanA.token),
      apiJson<LeaderboardResponse>(
        apiServer.baseUrl,
        `/api/stats/leaderboard?faculty=${encodeURIComponent(FACULTY_A)}`,
        admin.token
      ),
    ]);

    assert.deepEqual(deanOverview.body, adminFilteredOverview.body);
    assert.deepEqual(deanFaculties.body, adminFilteredFaculties.body);
    assert.deepEqual(deanCategories.body, adminFilteredCategories.body);
    assert.deepEqual(deanLeaderboard.body, adminFilteredLeaderboard.body);

    assert.equal(deanFaculties.body.faculties.length, 1);
    assert.equal(deanFaculties.body.faculties[0].faculty, FACULTY_A);
    assert.equal(adminAllOverview.body.totalApprovedHours, 47);
    assert.equal(deanOverview.body.totalApprovedHours, 15);

    const exportRes = await fetch(`${apiServer.baseUrl}/api/excel/export`, {
      headers: { Authorization: `Bearer ${deanA.token}` },
    });
    assert.equal(exportRes.status, 200);
    const buffer = Buffer.from(await exportRes.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    const volunteersSheet = workbook.getWorksheet('بيانات المتطوعين');
    const activitiesSheet = workbook.getWorksheet('سجل الأنشطة والساعات');
    assert.ok(volunteersSheet);
    assert.ok(activitiesSheet);
    assert.equal(volunteersSheet.rowCount, 5); // 2 header/blank + 1 column row + 2 Faculty A volunteers
    assert.equal(activitiesSheet.rowCount, 5); // 2 header/blank + 1 column row + 2 Faculty A activities

    const sheetText = JSON.stringify(volunteersSheet.getSheetValues());
    assert.equal(sheetText.includes(FACULTY_B), false);

    const deanImportRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      '/api/excel/import',
      deanA.token,
      { method: 'POST' }
    );
    assert.equal(deanImportRes.status, 403);
  });

  it('manages_dean_accounts_settings_and_scoped_student_password_resets', async () => {
    const { volA1 } = await seedTwoFacultyDataset();
    const admin = await createAccount({ email: 'admin@mnu.edu.eg', role: 'admin', faculty: null });
    const studentA = await createAccount({
      email: 'student.a@mnu.edu.eg',
      role: 'student',
      faculty: FACULTY_A,
      volunteer: volA1._id,
    });

    // Admin creates a dean account
    const createDeanRes = await apiJson<UserResponse>(
      apiServer.baseUrl,
      '/api/users',
      admin.token,
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'new.dean@mnu.edu.eg',
          fullName: 'د. عميد الطب الجديد',
          faculty: FACULTY_A,
          password: 'DeanPassword123!',
        }),
      }
    );
    assert.equal(createDeanRes.status, 201);
    assert.equal(createDeanRes.body.user.role, 'dean');
    assert.equal(createDeanRes.body.user.faculty, FACULTY_A);
    const deanId = createDeanRes.body.user.id;

    // Dean lists forbidden; admin lists deans
    const deanListForbidden = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      '/api/users?role=dean',
      jwt.sign({ sub: deanId, role: 'dean' }, env.jwtSecret, { expiresIn: '1h' })
    );
    assert.equal(deanListForbidden.status, 403);

    const adminListRes = await apiJson<UsersResponse>(
      apiServer.baseUrl,
      '/api/users?role=dean',
      admin.token
    );
    assert.equal(adminListRes.status, 200);
    assert.equal(adminListRes.body.users.length, 1);

    // Admin disables dean -> immediate 403 on next request
    const disableRes = await apiJson<UserResponse>(
      apiServer.baseUrl,
      `/api/users/${deanId}`,
      admin.token,
      { method: 'PATCH', body: JSON.stringify({ status: 'disabled' }) }
    );
    assert.equal(disableRes.status, 200);
    assert.equal(disableRes.body.user.status, 'disabled');

    const deanToken = jwt.sign({ sub: deanId, role: 'dean' }, env.jwtSecret, { expiresIn: '1h' });
    const blockedAfterDisable = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      '/api/volunteers',
      deanToken
    );
    assert.equal(blockedAfterDisable.status, 403);

    // Admin re-enables and resets dean temporary password -> login succeeds with new password
    await apiJson<UserResponse>(apiServer.baseUrl, `/api/users/${deanId}`, admin.token, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active', temporaryPassword: 'TempDeanPassword99!' }),
    });

    const deanLoginRes = await fetch(`${apiServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new.dean@mnu.edu.eg', password: 'TempDeanPassword99!' }),
    });
    assert.equal(deanLoginRes.status, 200);

    // Dean resets own-faculty student's password, but cannot change status
    const deanAttemptStatus = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/users/${studentA.id}`,
      deanToken,
      { method: 'PATCH', body: JSON.stringify({ status: 'disabled' }) }
    );
    assert.equal(deanAttemptStatus.status, 403);

    const deanResetStudent = await apiJson<UserResponse>(
      apiServer.baseUrl,
      `/api/users/${studentA.id}`,
      deanToken,
      { method: 'PATCH', body: JSON.stringify({ temporaryPassword: 'StudentTemp777!' }) }
    );
    assert.equal(deanResetStudent.status, 200);

    const studentLoginRes = await fetch(`${apiServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student.a@mnu.edu.eg', password: 'StudentTemp777!' }),
    });
    assert.equal(studentLoginRes.status, 200);

    // Settings: admin can PATCH, dean can GET only (403 on PATCH)
    const deanPatchSettings = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      '/api/settings',
      deanToken,
      { method: 'PATCH', body: JSON.stringify({ certificateHours: 20 }) }
    );
    assert.equal(deanPatchSettings.status, 403);

    const adminPatchSettings = await apiJson<SettingsPayload>(
      apiServer.baseUrl,
      '/api/settings',
      admin.token,
      { method: 'PATCH', body: JSON.stringify({ certificateHours: 20 }) }
    );
    assert.equal(adminPatchSettings.status, 200);
    assert.equal(adminPatchSettings.body.certificateHours, 20);

    const deanGetSettings = await apiJson<SettingsPayload>(
      apiServer.baseUrl,
      '/api/settings',
      deanToken
    );
    assert.equal(deanGetSettings.status, 200);
    assert.equal(deanGetSettings.body.certificateHours, 20);

    // Profile now reflects dynamic certificateHours = 20
    const profileRes = await apiJson<VolunteerProfileResult>(
      apiServer.baseUrl,
      `/api/volunteers/${volA1.volunteerId}`,
      deanToken
    );
    assert.equal(profileRes.status, 200);
    assert.equal(profileRes.body.certificateHours, 20);
    assert.equal(profileRes.body.volunteer.remainingHours, 5);
  });
});
