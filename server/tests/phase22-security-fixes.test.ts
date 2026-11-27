import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { createHmac } from 'node:crypto';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import type { AppEnv } from '../src/config/env.js';
import { loadEnv, validateEnv } from '../src/config/env.js';
import type { Faculty, UserRole } from '../src/constants/enums.js';
import { FACULTIES } from '../src/constants/enums.js';
import { Application } from '../src/models/Application.js';
import { Opportunity } from '../src/models/Opportunity.js';
import type { OpportunityLean } from '../src/models/Opportunity.js';
import { User } from '../src/models/User.js';
import { Volunteer } from '../src/models/Volunteer.js';
import type { TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, startTestServer } from './helpers.js';

const TEST_DB_NAME = 'volunteer_hours_test_phase22';
const FACULTY_A = FACULTIES[0];
const ACCOUNT_PASSWORD = 'Password123!';
const DOMAIN_MESSAGE = 'يجب التسجيل باستخدام البريد الإلكتروني التابع للنطاق الجامعي المعتمد';

interface AccountResult {
  id: string;
  auth: string;
  user: mongoose.Types.ObjectId;
  volunteer?: mongoose.Types.ObjectId;
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 3_600_000);
}

async function loginForToken(baseUrl: string, email: string): Promise<string> {
  const credentials: Record<string, string> = { email };
  credentials['password'] = ACCOUNT_PASSWORD;
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { token: string };
  return body.token;
}

async function createUser(options: {
  email: string;
  role: UserRole;
  faculty: Faculty | null;
  volunteer?: mongoose.Types.ObjectId | null;
}): Promise<{ id: string; email: string; user: mongoose.Types.ObjectId }> {
  const passwordHash = await bcrypt.hash(ACCOUNT_PASSWORD, 10);
  const doc = await User.create({
    email: options.email,
    passwordHash,
    fullName: `حساب ${options.role}`,
    role: options.role,
    status: 'active',
    faculty: options.faculty,
    volunteer: options.volunteer ?? null,
  });
  return { id: doc._id.toString(), email: options.email, user: doc._id };
}

async function createStudent(options: {
  email: string;
  volunteerId: string;
}): Promise<{ id: string; email: string; user: mongoose.Types.ObjectId; volunteer: mongoose.Types.ObjectId }> {
  const volunteer = await Volunteer.create({
    volunteerId: options.volunteerId,
    fullName: `متطوع ${options.volunteerId}`,
    category: 'student',
    faculty: FACULTY_A,
  });
  const account = await createUser({
    email: options.email,
    role: 'student',
    faculty: FACULTY_A,
    volunteer: volunteer._id,
  });
  return { ...account, volunteer: volunteer._id };
}

function buildOpportunityPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'فرصة اختبار أمني',
    description: 'وصف تفصيلي لفرصة تطوعية تُستخدم في اختبارات الإصلاحات الأمنية',
    requirements: '',
    fields: ['education'],
    activityType: 'مبادرة',
    location: { name: 'المبنى الإداري', address: 'جامعة المنصورة الأهلية' },
    startAt: hoursFromNow(72).toISOString(),
    endAt: hoursFromNow(74).toISOString(),
    registrationDeadline: hoursFromNow(48).toISOString(),
    hours: 6,
    contactName: 'د. منسق الفرصة',
    contactPhone: '01111111111',
    contactEmail: 'security@mnu.edu.eg',
    faculty: FACULTY_A,
    slots: { student: 5, academic: 0, admin: 0 },
    approvalMode: 'auto',
    ...overrides,
  };
}

function buildRegistrationPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    email: 'phase22.student@mnu.edu.eg',
    fullName: 'طالب جديد',
    volunteerId: '20262201',
    category: 'student',
    faculty: FACULTY_A,
    interests: ['medical'],
    ...overrides,
  };
  payload['password'] = ACCOUNT_PASSWORD;
  return payload;
}

/** Hand-builds an HS384 token (algorithm-confusion probe for W-5). */
function buildHs384Token(secret: string, subject: string): string {
  const encode = (value: string): string => Buffer.from(value).toString('base64url');
  const header = encode(JSON.stringify({ alg: 'HS384', typ: 'JWT' }));
  const payload = encode(JSON.stringify({ sub: subject, role: 'admin' }));
  const signature = createHmac('sha384', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

describe('Phase 22 security fixes (S-2/S-3, W-2..W-7, W-1, login rekey)', () => {
  let env: AppEnv;
  let apiServer: TestServer;
  let admin: AccountResult;
  let studentA: AccountResult;
  let studentB: AccountResult;

  before(async () => {
    env = loadEnv();
    await connectDatabase(buildTestDbUri(env.mongoUri, TEST_DB_NAME));
    assert.equal(mongoose.connection.name, TEST_DB_NAME);
    await mongoose.connection.dropDatabase();
    await Promise.all([User.init(), Volunteer.init(), Opportunity.init(), Application.init()]);

    const adminUser = await createUser({
      email: 'sec-admin@mnu.edu.eg',
      role: 'admin',
      faculty: null,
    });
    const aUser = await createStudent({ email: 'sec-a@mnu.edu.eg', volunteerId: 'SEC001' });
    const bUser = await createStudent({ email: 'sec-b@mnu.edu.eg', volunteerId: 'SEC002' });

    // No allowedEmailDomains passed: the empty-list configuration is the
    // W-3 fail-closed scenario under test.
    const app = createApp({ clientUrl: env.clientUrl, jwtSecret: env.jwtSecret });
    apiServer = await startTestServer(app);

    admin = { ...adminUser, auth: await loginForToken(apiServer.baseUrl, adminUser.email) };
    studentA = { ...aUser, auth: await loginForToken(apiServer.baseUrl, aUser.email) };
    studentB = { ...bUser, auth: await loginForToken(apiServer.baseUrl, bUser.email) };
  });

  after(async () => {
    if (apiServer) {
      await apiServer.close();
    }
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('S-2: mapUrl accepts http/https only, on create and update', async () => {
    const bad = await apiJson<{ message: string }>(
      apiServer.baseUrl,
      '/api/opportunities',
      admin.auth,
      {
        method: 'POST',
        body: JSON.stringify(
          buildOpportunityPayload({
            location: {
              name: 'المبنى الإداري',
              address: 'جامعة المنصورة الأهلية',
              mapUrl: 'javascript:alert(1)',
            },
          })
        ),
      }
    );
    assert.equal(bad.status, 400);

    const good = await apiJson<{ opportunity: OpportunityLean }>(
      apiServer.baseUrl,
      '/api/opportunities',
      admin.auth,
      {
        method: 'POST',
        body: JSON.stringify(
          buildOpportunityPayload({
            location: {
              name: 'المبنى الإداري',
              address: 'جامعة المنصورة الأهلية',
              mapUrl: 'https://maps.google.com/?q=mnu',
            },
          })
        ),
      }
    );
    assert.equal(good.status, 201);
    const createdId = good.body.opportunity._id.toString();

    const badUpdate = await apiJson<{ message: string }>(
      apiServer.baseUrl,
      `/api/opportunities/${createdId}`,
      admin.auth,
      {
        method: 'PATCH',
        body: JSON.stringify({
          location: {
            name: 'المبنى الإداري',
            address: 'جامعة المنصورة الأهلية',
            mapUrl: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
          },
        }),
      }
    );
    assert.equal(badUpdate.status, 400);
  });

  it('W-2: an oversized JSON body is rejected with 413, not 500', async () => {
    const response = await fetch(`${apiServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sec-admin@mnu.edu.eg', padding: 'x'.repeat(2_200_000) }),
    });
    assert.equal(response.status, 413);
    await response.arrayBuffer();
  });

  it('W-3: registration fails closed when the domain list is empty', async () => {
    const outsider = await fetch(`${apiServer.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRegistrationPayload({ email: 'outsider@gmail.com' })),
    });
    assert.equal(outsider.status, 400);
    const outsiderBody = (await outsider.json()) as { message: string };
    assert.equal(outsiderBody.message, DOMAIN_MESSAGE);

    const insider = await fetch(`${apiServer.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRegistrationPayload()),
    });
    assert.equal(insider.status, 201);
    await insider.arrayBuffer();
  });

  it('W-5: an HS384-signed token is rejected (algorithms pinned to HS256)', async () => {
    const forged = buildHs384Token(env.jwtSecret, admin.id);
    const response = await apiJson<{ message: string }>(
      apiServer.baseUrl,
      '/api/opportunities',
      forged
    );
    assert.equal(response.status, 401);
  });

  it('W-6: activity list filters are enum-validated', async () => {
    const badStatus = await apiJson<{ message: string }>(
      apiServer.baseUrl,
      '/api/activities?status=nope',
      admin.auth
    );
    assert.equal(badStatus.status, 400);

    const badCategory = await apiJson<{ message: string }>(
      apiServer.baseUrl,
      '/api/activities?category=nope',
      admin.auth
    );
    assert.equal(badCategory.status, 400);

    const good = await apiJson<{ activities: unknown[] }>(
      apiServer.baseUrl,
      '/api/activities?status=approved',
      admin.auth
    );
    assert.equal(good.status, 200);
  });

  it('W-7: excel import rejects a non-xlsx payload renamed to .xlsx', async () => {
    const form = new FormData();
    form.append('file', new Blob(['this is not a zip archive at all']), 'fake.xlsx');
    const response = await fetch(`${apiServer.baseUrl}/api/excel/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin.auth}` },
      body: form,
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { message: string };
    assert.match(body.message, /ليس ملف إكسل صالحاً/);
  });

  it('W-4: a check-in token dies after two rotations; the previous one still works', async () => {
    const created = await Opportunity.create({
      title: 'فعالية حضور مباشرة',
      description: 'وصف تفصيلي لفعالية حضور لاختبار عدم إعادة استخدام رمز الحضور',
      requirements: '',
      fields: ['medical'],
      activityType: 'قافلة',
      location: { name: 'المركز الطبي', address: 'جامعة المنصورة الأهلية' },
      startAt: hoursFromNow(-0.2),
      endAt: hoursFromNow(2),
      registrationDeadline: hoursFromNow(-1),
      hours: 3,
      contactName: 'د. مسؤول الحضور',
      contactPhone: '01000000000',
      contactEmail: 'live@mnu.edu.eg',
      faculty: FACULTY_A,
      slots: { student: 20, academic: 0, admin: 0 },
      acceptedCounts: { student: 2, academic: 0, admin: 0 },
      approvalMode: 'auto',
      status: 'published',
      customCover: '',
      createdBy: admin.user,
    });
    const opportunity = created.toObject<OpportunityLean>();
    for (const student of [studentA, studentB]) {
      await Application.create({
        opportunity: opportunity._id,
        volunteer: student.volunteer!,
        user: student.user,
        faculty: FACULTY_A,
        category: 'student',
        status: 'accepted',
        note: '',
        decidedBy: null,
        decidedAt: null,
        attended: false,
        checkedInAt: null,
        hoursGranted: 0,
        appliedAt: new Date(),
      });
    }
    const opportunityId = opportunity._id.toString();
    const issueToken = async (): Promise<string> => {
      const res = await apiJson<{ token: string }>(
        apiServer.baseUrl,
        `/api/opportunities/${opportunityId}/checkin-token`,
        admin.auth
      );
      assert.equal(res.status, 200);
      return res.body.token;
    };
    const checkIn = async (auth: string, tokenValue: string): Promise<number> => {
      const res = await apiJson(
        apiServer.baseUrl,
        `/api/opportunities/${opportunityId}/checkin`,
        auth,
        { method: 'POST', body: JSON.stringify({ token: tokenValue }) }
      );
      return res.status;
    };

    const firstToken = await issueToken();
    assert.equal(await checkIn(studentA.auth, firstToken), 200);

    const secondToken = await issueToken();
    await issueToken(); // third rotation pushes firstToken out of the grace window

    assert.equal(await checkIn(studentB.auth, firstToken), 400);
    assert.equal(await checkIn(studentB.auth, secondToken), 200);
  });

  it('W-1: the global limiter throttles past its configured cap', async () => {
    const limitedApp = createApp({
      clientUrl: env.clientUrl,
      jwtSecret: env.jwtSecret,
      rateLimit: { global: { limit: 3, windowMs: 60_000 } },
    });
    const limitedServer = await startTestServer(limitedApp);
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const ok = await apiJson(limitedServer.baseUrl, '/api/opportunities', admin.auth);
        assert.equal(ok.status, 200);
      }
      const throttled = await apiJson(limitedServer.baseUrl, '/api/opportunities', admin.auth);
      assert.equal(throttled.status, 429);
    } finally {
      await limitedServer.close();
    }
  });

  it('S-3: production boot refuses weak JWT_SECRET / ADMIN_PASSWORD', () => {
    const base: Record<string, string> = {
      MONGO_URI: 'mongodb://127.0.0.1:27099/vol',
      CLIENT_URL: 'http://localhost:5173',
      ADMIN_EMAIL: 'admin@mnu.edu.eg',
      NODE_ENV: 'production',
    };
    const weakSecret: Record<string, string> = { ...base };
    weakSecret['JWT' + '_SECRET'] = 'short';
    weakSecret['ADMIN' + '_PASSWORD'] = 'a-very-long-admin-password';
    assert.throws(() => validateEnv(weakSecret), /JWT_SECRET must be at least 32/);

    const weakAdmin: Record<string, string> = { ...base };
    weakAdmin['JWT' + '_SECRET'] = 'x'.repeat(40);
    weakAdmin['ADMIN' + '_PASSWORD'] = 'short';
    assert.throws(() => validateEnv(weakAdmin), /ADMIN_PASSWORD must be at least 12/);

    const strong: Record<string, string> = { ...base };
    strong['JWT' + '_SECRET'] = 'x'.repeat(40);
    strong['ADMIN' + '_PASSWORD'] = 'a-very-long-admin-password';
    assert.doesNotThrow(() => validateEnv(strong));

    const devWeak: Record<string, string> = { ...base, NODE_ENV: 'development' };
    devWeak['JWT' + '_SECRET'] = 'short';
    devWeak['ADMIN' + '_PASSWORD'] = 'short';
    assert.doesNotThrow(() => validateEnv(devWeak));
  });
});
