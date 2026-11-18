import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import type { AppEnv } from '../src/config/env.js';
import { loadEnv } from '../src/config/env.js';
import type { UserRole, UserStatus } from '../src/constants/enums.js';
import { FACULTIES } from '../src/constants/enums.js';
import { buildScope } from '../src/middleware/auth.js';
import { User } from '../src/models/User.js';
import { parseSeedWorkbook } from '../src/seed/parseWorkbook.js';
import { DEMO_DEANS, seedDatabase } from '../src/seed/seed.js';
import type { PublicUser } from '../src/services/auth.service.js';
import type { TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, readJson, startTestServer } from './helpers.js';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.resolve(CURRENT_DIR, '../src/seed/data.xlsx');
const TEST_DB_NAME = 'volunteer_hours_test_v2_1';

interface AuthMeResponse {
  user: PublicUser;
  admin?: { id: string; email: string };
}

interface LoginResponse {
  token: string;
  user: PublicUser;
  admin?: { id: string; email: string };
}

interface ErrorResponse {
  message: string;
}

async function createTestUser(options: {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  faculty: (typeof FACULTIES)[number] | null;
}) {
  const passwordHash = await bcrypt.hash(options.password, 10);
  const doc = await User.create({
    email: options.email,
    passwordHash,
    fullName: options.fullName,
    role: options.role,
    status: options.status,
    faculty: options.faculty,
  });
  return doc;
}

function signToken(userId: string, role: UserRole, jwtSecret: string): string {
  return jwt.sign({ sub: userId, role }, jwtSecret, { expiresIn: '1h' });
}

describe('Phase V2-1 Users, Roles, Status Gate & Faculty Scope', () => {
  let env: AppEnv;
  let apiServer: TestServer;

  before(async () => {
    env = loadEnv();
    await connectDatabase(buildTestDbUri(env.mongoUri, TEST_DB_NAME));
    assert.equal(mongoose.connection.name, TEST_DB_NAME);
    await mongoose.connection.dropDatabase();

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
    await User.deleteMany({});
  });

  it('seeds_admin_and_one_active_demo_dean_per_faculty_allowing_multiple_null_volunteers', async () => {
    const workbookData = await parseSeedWorkbook(SEED_FILE);
    const counts = await seedDatabase({
      ...workbookData,
      adminEmail: env.adminEmail,
      adminPassword: env.adminPassword,
    });

    assert.equal(counts.adminCount, 1);

    const deans = await User.find({ role: 'dean', status: 'active' }).lean();
    assert.equal(deans.length, FACULTIES.length);

    const seededFaculties = new Set(deans.map((dean) => dean.faculty));
    for (const faculty of FACULTIES) {
      assert.ok(seededFaculties.has(faculty), `Missing seeded dean for ${faculty}`);
    }

    const admin = await User.findOne({ role: 'admin' }).lean();
    assert.ok(admin);
    assert.equal(admin.faculty, null);
    assert.equal(admin.volunteer, null);
  });

  it('includes_role_in_jwt_updates_last_login_and_blocks_disabled_login', async () => {
    const dean = await createTestUser({
      email: DEMO_DEANS[0].email,
      password: 'Password123!',
      fullName: DEMO_DEANS[0].fullName,
      role: 'dean',
      status: 'active',
      faculty: FACULTIES[0],
    });
    assert.equal(dean.lastLoginAt, null);

    const loginRes = await fetch(`${apiServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: DEMO_DEANS[0].email, password: 'Password123!' }),
    });
    const loginBody = await readJson<LoginResponse>(loginRes);

    assert.equal(loginRes.status, 200);
    assert.equal(loginBody.user.role, 'dean');
    assert.equal(loginBody.user.status, 'active');
    assert.equal(loginBody.user.faculty, FACULTIES[0]);
    assert.equal(loginBody.admin, undefined);

    const decoded = jwt.verify(loginBody.token, env.jwtSecret) as jwt.JwtPayload;
    assert.equal(decoded.sub, dean._id.toString());
    assert.equal(decoded.role, 'dean');

    const refreshed = await User.findById(dean._id).lean();
    assert.ok(refreshed?.lastLoginAt instanceof Date);

    await createTestUser({
      email: 'disabled.student@mnu.edu.eg',
      password: 'Password123!',
      fullName: 'طالب معطل',
      role: 'student',
      status: 'disabled',
      faculty: FACULTIES[0],
    });

    const disabledRes = await fetch(`${apiServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'disabled.student@mnu.edu.eg', password: 'Password123!' }),
    });
    const disabledBody = await readJson<ErrorResponse>(disabledRes);
    assert.equal(disabledRes.status, 403);
    assert.equal(disabledBody.message, 'تم تعطيل الحساب');
  });

  it('rejects_anonymous_and_checkin_tokens_with_401', async () => {
    const anonRes = await fetch(`${apiServer.baseUrl}/api/auth/me`);
    assert.equal(anonRes.status, 401);

    const user = await createTestUser({
      email: 'student.checkin@mnu.edu.eg',
      password: 'Password123!',
      fullName: 'طالب تجريبي',
      role: 'student',
      status: 'active',
      faculty: FACULTIES[0],
    });
    const checkinToken = jwt.sign({ sub: user._id.toString(), type: 'checkin' }, env.jwtSecret, {
      expiresIn: '45s',
    });
    const checkinRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      '/api/auth/me',
      checkinToken
    );
    assert.equal(checkinRes.status, 401);
  });

  // Pending students are covered by the Phase 1 pending-flow tests: they may browse
  // student routes and are only blocked from staff routes by the role guard.
  const nonActiveCases: Array<{ status: Exclude<UserStatus, 'active'>; expectedMessage: string }> =
    [
      { status: 'rejected', expectedMessage: 'تم رفض طلب التسجيل' },
      { status: 'disabled', expectedMessage: 'تم تعطيل الحساب' },
    ];

  for (const testCase of nonActiveCases) {
    it(`allows_auth_me_200_and_blocks_protected_routes_403_for_${testCase.status}_user`, async () => {
      const user = await createTestUser({
        email: `${testCase.status}@mnu.edu.eg`,
        password: 'Password123!',
        fullName: 'مستخدم غير نشط',
        role: 'student',
        status: testCase.status,
        faculty: FACULTIES[1],
      });
      const token = signToken(user._id.toString(), 'student', env.jwtSecret);

      const meRes = await apiJson<AuthMeResponse>(apiServer.baseUrl, '/api/auth/me', token);
      assert.equal(meRes.status, 200);
      assert.equal(meRes.body.user.status, testCase.status);
      assert.equal(meRes.body.user.role, 'student');
      assert.equal(meRes.body.user.faculty, FACULTIES[1]);

      const blockedRes = await apiJson<ErrorResponse>(apiServer.baseUrl, '/api/volunteers', token);
      assert.equal(blockedRes.status, 403);
      assert.equal(blockedRes.body.message, testCase.expectedMessage);
    });
  }

  it('reloads_user_from_mongodb_on_every_request_to_enforce_live_disable', async () => {
    const dean = await createTestUser({
      email: 'live.dean@mnu.edu.eg',
      password: 'Password123!',
      fullName: 'عميد نشط',
      role: 'dean',
      status: 'active',
      faculty: FACULTIES[2],
    });
    const token = signToken(dean._id.toString(), 'dean', env.jwtSecret);

    const beforeDisable = await apiJson<{ volunteers: unknown[] }>(
      apiServer.baseUrl,
      '/api/volunteers',
      token
    );
    assert.equal(beforeDisable.status, 200);

    await User.updateOne({ _id: dean._id }, { $set: { status: 'disabled' } });

    const afterDisable = await apiJson<ErrorResponse>(apiServer.baseUrl, '/api/volunteers', token);
    assert.equal(afterDisable.status, 403);
    assert.equal(afterDisable.body.message, 'تم تعطيل الحساب');
  });

  const roleRouteMatrix: Array<{
    role: UserRole;
    faculty: (typeof FACULTIES)[number] | null;
    route: string;
    method: 'GET' | 'POST';
    expectedStatus: number;
  }> = [
    {
      role: 'admin',
      faculty: null,
      route: '/api/excel/import',
      method: 'POST',
      expectedStatus: 400,
    },
    {
      role: 'dean',
      faculty: FACULTIES[0],
      route: '/api/excel/import',
      method: 'POST',
      expectedStatus: 403,
    },
    {
      role: 'student',
      faculty: FACULTIES[0],
      route: '/api/excel/import',
      method: 'POST',
      expectedStatus: 403,
    },
    {
      role: 'dean',
      faculty: FACULTIES[0],
      route: '/api/volunteers',
      method: 'GET',
      expectedStatus: 200,
    },
    {
      role: 'student',
      faculty: FACULTIES[0],
      route: '/api/volunteers',
      method: 'GET',
      expectedStatus: 403,
    },
    {
      role: 'student',
      faculty: FACULTIES[0],
      route: '/api/activities',
      method: 'GET',
      expectedStatus: 403,
    },
    {
      role: 'student',
      faculty: FACULTIES[0],
      route: '/api/stats/overview',
      method: 'GET',
      expectedStatus: 403,
    },
  ];

  for (const scenario of roleRouteMatrix) {
    it(`enforces_role_guard_${scenario.method}_${scenario.route}_for_${scenario.role}_returning_${scenario.expectedStatus}`, async () => {
      const user = await createTestUser({
        email: `${scenario.role}.${Date.now()}.${Math.random()}@mnu.edu.eg`,
        password: 'Password123!',
        fullName: 'مستخدم اختبار',
        role: scenario.role,
        status: 'active',
        faculty: scenario.faculty,
      });
      const token = signToken(user._id.toString(), scenario.role, env.jwtSecret);

      const response = await apiJson<ErrorResponse>(apiServer.baseUrl, scenario.route, token, {
        method: scenario.method,
      });
      assert.equal(response.status, scenario.expectedStatus);
      if (scenario.expectedStatus === 403) {
        assert.equal(response.body.message, 'غير مصرح لك بالوصول إلى هذا المورد');
      }
    });
  }

  it('computes_buildScope_for_admin_dean_and_missing_faculty_guard', () => {
    assert.deepEqual(buildScope({ role: 'admin', faculty: null }), {});
    assert.deepEqual(buildScope({ role: 'dean', faculty: FACULTIES[3] }), {
      faculty: FACULTIES[3],
    });
    assert.throws(() => buildScope({ role: 'dean', faculty: null }), { statusCode: 403 });
  });
});
