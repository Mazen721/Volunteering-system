import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import type { AppEnv } from '../src/config/env.js';
import { loadEnv, validateEnv } from '../src/config/env.js';
import { FACULTIES } from '../src/constants/enums.js';
import { Activity } from '../src/models/Activity.js';
import { Application } from '../src/models/Application.js';
import { Opportunity } from '../src/models/Opportunity.js';
import { User } from '../src/models/User.js';
import { Volunteer } from '../src/models/Volunteer.js';
import { parseSeedWorkbook } from '../src/seed/parseWorkbook.js';
import { seedDatabase } from '../src/seed/seed.js';
import type { ApiResponse, TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, readJson, startTestServer } from './helpers.js';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.resolve(CURRENT_DIR, '../src/seed/data.xlsx');
const TEST_DB_NAME = 'volunteer_hours_test_v2_8';
const ARABIC_CHAR_REGEX = /[\u0600-\u06FF]/;

interface LoginPayload {
  token: string;
  user: { id: string; role: string; status: string; faculty: string | null };
}

interface ErrorPayload {
  message: string;
}

describe('Phase V2-8 Security Hardening, Demo Seed & End-to-End Walkthrough', () => {
  let env: AppEnv;
  let workbookData: Awaited<ReturnType<typeof parseSeedWorkbook>>;

  before(async () => {
    env = loadEnv();
    workbookData = await parseSeedWorkbook(SEED_FILE);
    await connectDatabase(buildTestDbUri(env.mongoUri, TEST_DB_NAME));
    assert.equal(mongoose.connection.name, TEST_DB_NAME);
    await mongoose.connection.dropDatabase();
    await mongoose.syncIndexes();
  });

  after(async () => {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === TEST_DB_NAME) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await Promise.all([
      Activity.deleteMany({}),
      Application.deleteMany({}),
      Opportunity.deleteMany({}),
      User.deleteMany({}),
      Volunteer.deleteMany({}),
    ]);
  });

  it('parses_allowed_email_domains_from_environment_config', () => {
    const base = {
      MONGO_URI: env.mongoUri,
      JWT_SECRET: env.jwtSecret,
      CLIENT_URL: env.clientUrl,
      ADMIN_EMAIL: env.adminEmail,
      ADMIN_PASSWORD: env.adminPassword,
    };

    assert.deepEqual(validateEnv({ ...base, ALLOWED_EMAIL_DOMAINS: '' }).allowedEmailDomains, [
      'mnu.edu.eg',
    ]);
    assert.deepEqual(
      validateEnv({
        ...base,
        ALLOWED_EMAIL_DOMAINS: ' @MNU.EDU.EG , std.mnu.edu.eg , mnu.edu.eg ',
      }).allowedEmailDomains,
      ['mnu.edu.eg', 'std.mnu.edu.eg']
    );
  });

  it('sets_helmet_security_headers_on_responses', async () => {
    const app = createApp({ clientUrl: env.clientUrl, jwtSecret: env.jwtSecret });
    const server = await startTestServer(app);
    try {
      const healthRes = await fetch(`${server.baseUrl}/api/health`);
      assert.equal(healthRes.status, 200);
      assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(healthRes.headers.get('x-frame-options'), 'SAMEORIGIN');
      assert.equal(healthRes.headers.get('x-powered-by'), null);
    } finally {
      await server.close();
    }
  });

  it('throttles_login_register_and_checkin_requests_with_arabic_429_messages', async () => {
    await seedDatabase({
      ...workbookData,
      adminEmail: env.adminEmail,
      adminPassword: env.adminPassword,
      includeDemoData: true,
    });

    const liveOpp = await Opportunity.findOne({
      title: 'قافلة الكشف الطبي والتوعية المجتمعية (مباشر)',
    }).lean();
    assert.ok(liveOpp);

    const hardenedApp = createApp({
      clientUrl: env.clientUrl,
      jwtSecret: env.jwtSecret,
      rateLimit: {
        login: { windowMs: 60_000, limit: 2 },
        register: { windowMs: 60_000, limit: 2 },
        checkIn: { windowMs: 60_000, limit: 2 },
      },
    });
    const server: TestServer = await startTestServer(hardenedApp);

    try {
      const saraLogin = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'sara.student@mnu.edu.eg', password: env.adminPassword }),
      });
      assert.equal(saraLogin.status, 200);
      const { token: saraToken } = await readJson<LoginPayload>(saraLogin);

      // Second login succeeds, third hits rate limit
      const secondLogin = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'sara.student@mnu.edu.eg', password: 'wrong-password' }),
      });
      assert.equal(secondLogin.status, 401);

      const throttledLogin = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'sara.student@mnu.edu.eg', password: env.adminPassword }),
      });
      const throttledLoginBody = await readJson<ErrorPayload>(throttledLogin);
      assert.equal(throttledLogin.status, 429);
      assert.match(throttledLoginBody.message, ARABIC_CHAR_REGEX);

      // Register rate limit (limit = 2)
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const regRes = await fetch(`${server.baseUrl}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: `rate.test.${attempt}@mnu.edu.eg`,
            password: 'Password123!',
            fullName: 'متطوع اختبار معدل الطلبات',
            volunteerId: `2026900${attempt}`,
            category: 'student',
            faculty: FACULTIES[0],
            interests: ['medical'],
          }),
        });
        assert.equal(regRes.status, 201);
      }

      const throttledRegister = await fetch(`${server.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'rate.test.3@mnu.edu.eg',
          password: 'Password123!',
          fullName: 'متطوع ثالث',
          volunteerId: '20269003',
          category: 'student',
          faculty: FACULTIES[0],
          interests: ['medical'],
        }),
      });
      const throttledRegisterBody = await readJson<ErrorPayload>(throttledRegister);
      assert.equal(throttledRegister.status, 429);
      assert.match(throttledRegisterBody.message, ARABIC_CHAR_REGEX);

      // Check-in rate limit (limit = 2)
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const checkInRes: ApiResponse<ErrorPayload> = await apiJson<ErrorPayload>(
          server.baseUrl,
          `/api/opportunities/${liveOpp._id.toString()}/checkin`,
          saraToken,
          { method: 'POST', body: JSON.stringify({ token: 'invalid-token' }) }
        );
        assert.equal(checkInRes.status, 400);
      }

      const throttledCheckIn = await apiJson<ErrorPayload>(
        server.baseUrl,
        `/api/opportunities/${liveOpp._id.toString()}/checkin`,
        saraToken,
        { method: 'POST', body: JSON.stringify({ token: 'invalid-token' }) }
      );
      assert.equal(throttledCheckIn.status, 429);
      assert.match(throttledCheckIn.body.message, ARABIC_CHAR_REGEX);
    } finally {
      await server.close();
    }
  });

  it('enforces_allowed_email_domains_on_registration_when_configured', async () => {
    const restrictedApp = createApp({
      clientUrl: env.clientUrl,
      jwtSecret: env.jwtSecret,
      allowedEmailDomains: ['mnu.edu.eg'],
    });
    const server = await startTestServer(restrictedApp);

    try {
      const rejectedRes = await fetch(`${server.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'outsider@gmail.com',
          password: 'Password123!',
          fullName: 'طالب خارجي',
          volunteerId: '20268801',
          category: 'student',
          faculty: FACULTIES[0],
          interests: ['medical'],
        }),
      });
      const rejectedBody = await readJson<ErrorPayload>(rejectedRes);
      assert.equal(rejectedRes.status, 400);
      assert.match(rejectedBody.message, ARABIC_CHAR_REGEX);
      assert.equal(await User.exists({ email: 'outsider@gmail.com' }), null);

      const acceptedRes = await fetch(`${server.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'insider@mnu.edu.eg',
          password: 'Password123!',
          fullName: 'طالب جامعي معتمد',
          volunteerId: '20268802',
          category: 'student',
          faculty: FACULTIES[0],
          interests: ['medical'],
        }),
      });
      assert.equal(acceptedRes.status, 201);
    } finally {
      await server.close();
    }
  });

  it('runs_idempotent_demo_seed_and_completes_full_end_to_end_walkthrough', async () => {
    const seedOptions = {
      ...workbookData,
      adminEmail: env.adminEmail,
      adminPassword: env.adminPassword,
      includeDemoData: true,
    };
    await seedDatabase(seedOptions);
    await seedDatabase(seedOptions);

    assert.equal(await User.countDocuments({ role: 'admin' }), 1);
    assert.equal(await User.countDocuments({ role: 'dean' }), FACULTIES.length);
    assert.equal(await User.countDocuments({ role: 'student' }), 3);
    assert.equal(await Opportunity.countDocuments(), 3);
    assert.equal(await Activity.countDocuments(), 13);

    const app = createApp({ clientUrl: env.clientUrl, jwtSecret: env.jwtSecret });
    const server = await startTestServer(app);

    try {
      // 1. Admin login & overview
      const adminLoginRes = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: env.adminEmail, password: env.adminPassword }),
      });
      assert.equal(adminLoginRes.status, 200);
      const { token: adminToken } = await readJson<LoginPayload>(adminLoginRes);

      const deansList = await apiJson<{ users: unknown[] }>(
        server.baseUrl,
        '/api/users?role=dean',
        adminToken
      );
      assert.equal(deansList.status, 200);
      assert.equal(deansList.body.users.length, FACULTIES.length);

      // 2. Dentistry Dean approves seeded pending student
      const dentDeanLoginRes = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dentistry.dean@mnu.edu.eg', password: env.adminPassword }),
      });
      assert.equal(dentDeanLoginRes.status, 200);
      const { token: dentDeanToken } = await readJson<LoginPayload>(dentDeanLoginRes);

      const pendingList = await apiJson<{ registrations: Array<{ id: string; email: string }> }>(
        server.baseUrl,
        '/api/registrations?status=pending',
        dentDeanToken
      );
      assert.equal(pendingList.status, 200);
      const pendingStudent = pendingList.body.registrations.find(
        (item) => item.email === 'pending.student@mnu.edu.eg'
      );
      assert.ok(pendingStudent);

      const approveRes = await apiJson<{ user: { status: string } }>(
        server.baseUrl,
        `/api/registrations/${pendingStudent.id}/approve`,
        dentDeanToken,
        { method: 'POST', body: JSON.stringify({}) }
      );
      assert.equal(approveRes.status, 200);
      assert.equal(approveRes.body.user.status, 'active');

      // 3. Approved student browses recommendations & applies to upcoming opportunity
      const approvedStudentLogin = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'pending.student@mnu.edu.eg', password: env.adminPassword }),
      });
      const { token: approvedStudentToken } = await readJson<LoginPayload>(approvedStudentLogin);

      const recsRes = await apiJson<{
        opportunities: Array<{ _id: string; title: string; phase: string }>;
      }>(server.baseUrl, '/api/opportunities?sort=recommended', approvedStudentToken);
      assert.equal(recsRes.status, 200);
      const upcomingOpp = recsRes.body.opportunities.find((opp) => opp.phase === 'upcoming');
      assert.ok(upcomingOpp);

      const applyRes = await apiJson<{ application: { status: string } }>(
        server.baseUrl,
        `/api/opportunities/${upcomingOpp._id}/apply`,
        approvedStudentToken,
        { method: 'POST', body: JSON.stringify({ note: 'متحمس للمشاركة' }) }
      );
      assert.equal(applyRes.status, 201);
      assert.equal(applyRes.body.application.status, 'accepted');

      // 4. Sara sees Happening Now on /api/stats/me, checks in with rotating QR token, and event completes idempotently
      const saraLoginRes = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'sara.student@mnu.edu.eg', password: env.adminPassword }),
      });
      const { token: saraToken } = await readJson<LoginPayload>(saraLoginRes);

      const saraStatsBefore = await apiJson<{
        approvedHours: number;
        happeningNow: Array<{ _id: string; title: string }>;
      }>(server.baseUrl, '/api/stats/me', saraToken);
      assert.equal(saraStatsBefore.status, 200);
      assert.equal(saraStatsBefore.body.approvedHours, 15);
      assert.equal(saraStatsBefore.body.happeningNow.length, 1);

      const liveOppId = saraStatsBefore.body.happeningNow[0]._id;
      const qrTokenRes = await apiJson<{ token: string }>(
        server.baseUrl,
        `/api/opportunities/${liveOppId}/checkin-token`,
        adminToken
      );
      assert.equal(qrTokenRes.status, 200);

      const checkInRes = await apiJson<{ application: { attended: boolean } }>(
        server.baseUrl,
        `/api/opportunities/${liveOppId}/checkin`,
        saraToken,
        { method: 'POST', body: JSON.stringify({ token: qrTokenRes.body.token }) }
      );
      assert.equal(checkInRes.status, 200);
      assert.equal(checkInRes.body.application.attended, true);

      // Advance live opportunity past endAt and complete twice to verify idempotency
      await Opportunity.updateOne(
        { _id: liveOppId },
        { $set: { endAt: new Date(Date.now() - 60_000) } }
      );

      const completeFirst = await apiJson<{ creditedCount: number }>(
        server.baseUrl,
        `/api/opportunities/${liveOppId}/complete`,
        adminToken,
        { method: 'POST' }
      );
      assert.equal(completeFirst.status, 200);
      assert.equal(completeFirst.body.creditedCount, 1);

      const completeSecond = await apiJson<{ creditedCount: number }>(
        server.baseUrl,
        `/api/opportunities/${liveOppId}/complete`,
        adminToken,
        { method: 'POST' }
      );
      assert.equal(completeSecond.status, 200);
      assert.equal(completeSecond.body.creditedCount, 1);
      assert.equal(await Activity.countDocuments({ opportunity: liveOppId }), 1);

      const saraStatsAfter = await apiJson<{ approvedHours: number }>(
        server.baseUrl,
        '/api/stats/me',
        saraToken
      );
      assert.equal(saraStatsAfter.body.approvedHours, 20);

      // 5. Certificate eligibility & role isolation for Ahmed (20260001, Medicine, 34 hours)
      const ahmedLoginRes = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ahmed.student@mnu.edu.eg', password: env.adminPassword }),
      });
      const { token: ahmedToken } = await readJson<LoginPayload>(ahmedLoginRes);

      const studentCertBlocked = await apiJson<ErrorPayload>(
        server.baseUrl,
        '/api/volunteers/20260001',
        ahmedToken
      );
      assert.equal(studentCertBlocked.status, 403);

      const crossFacultyCertBlocked = await apiJson<ErrorPayload>(
        server.baseUrl,
        '/api/volunteers/20260001',
        dentDeanToken
      );
      assert.equal(crossFacultyCertBlocked.status, 404);

      const medDeanLoginRes = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'medicine.dean@mnu.edu.eg', password: env.adminPassword }),
      });
      const { token: medDeanToken } = await readJson<LoginPayload>(medDeanLoginRes);

      const medDeanCertProfile = await apiJson<{
        volunteer: { eligible: boolean; approvedHours: number };
      }>(server.baseUrl, '/api/volunteers/20260001', medDeanToken);
      assert.equal(medDeanCertProfile.status, 200);
      assert.equal(medDeanCertProfile.body.volunteer.eligible, true);
      assert.equal(medDeanCertProfile.body.volunteer.approvedHours, 34);
    } finally {
      await server.close();
    }
  });
});
