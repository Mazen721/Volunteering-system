import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import type { AppEnv } from '../src/config/env.js';
import { loadEnv } from '../src/config/env.js';
import { FACULTIES } from '../src/constants/enums.js';
import { Application } from '../src/models/Application.js';
import { Opportunity } from '../src/models/Opportunity.js';
import type { OpportunityLean } from '../src/models/Opportunity.js';
import { Settings } from '../src/models/Settings.js';
import { User } from '../src/models/User.js';
import { Volunteer } from '../src/models/Volunteer.js';
import type { StudentDashboardSummary } from '../src/services/stats.service.js';
import type { TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, readJson, startTestServer } from './helpers.js';

const TEST_DB_NAME = 'volunteer_hours_test_phase1_dashboard';
const FACULTY_A = FACULTIES[0];
const APPLY_LOCKED_MESSAGE = 'المشاركة متاحة بعد اعتماد حسابك من إدارة النظام أو عميد كليتك';
const CHECKIN_LOCKED_MESSAGE = 'تسجيل الحضور متاح بعد اعتماد حسابك';

interface ErrorResponse {
  message: string;
}

interface RegisterResponse {
  token: string;
  user: { id: string; status: string; volunteer: string | null };
}

interface ApproveResponse {
  user: { status: string; volunteer: string | null };
  volunteer: { _id: string; volunteerId: string };
}

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

function buildRegistrationPayload(overrides: Record<string, unknown> = {}) {
  return {
    email: 'brand.new@mnu.edu.eg',
    password: 'Password123!',
    fullName: 'طالب مسجل حديثاً',
    volunteerId: '20260777',
    category: 'student',
    faculty: FACULTY_A,
    interests: ['medical'],
    ...overrides,
  };
}

async function registerBrandNewStudent(
  baseUrl: string,
  overrides: Record<string, unknown> = {}
): Promise<RegisterResponse> {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildRegistrationPayload(overrides)),
  });
  const body = await readJson<RegisterResponse>(res);
  assert.equal(res.status, 201);
  assert.equal(body.user.status, 'pending');
  // A brand-new volunteerId has no Volunteer record until approval creates one.
  assert.equal(body.user.volunteer, null);
  return body;
}

async function seedOpportunity(): Promise<OpportunityLean> {
  const created = await Opportunity.create({
    title: 'فعالية تطوعية ميدانية',
    description: 'وصف تفصيلي لفعالية تطوعية لاختبار لوحة الطالب المعلق',
    requirements: '',
    fields: ['medical'],
    activityType: 'قافلة',
    location: { name: 'المركز الطبي الجامعي', address: 'جامعة المنصورة الأهلية' },
    startAt: minutesFromNow(2 * 24 * 60),
    endAt: minutesFromNow(2 * 24 * 60 + 120),
    registrationDeadline: minutesFromNow(24 * 60),
    hours: 6,
    contactName: 'د. مسؤول الحضور',
    contactPhone: '01000000000',
    contactEmail: 'live@mnu.edu.eg',
    faculty: FACULTY_A,
    slots: { student: 10, academic: 0, admin: 0 },
    acceptedCounts: { student: 0, academic: 0, admin: 0 },
    approvalMode: 'auto',
    status: 'published',
    createdBy: new mongoose.Types.ObjectId(),
  });
  return created.toObject<OpportunityLean>();
}

async function createAdminToken(jwtSecret: string): Promise<string> {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const admin = await User.create({
    email: 'admin.dashboard@mnu.edu.eg',
    passwordHash,
    fullName: 'مسؤول النظام',
    role: 'admin',
    status: 'active',
    faculty: null,
  });
  return jwt.sign({ sub: admin._id.toString(), role: 'admin' }, jwtSecret, { expiresIn: '1h' });
}

let env: AppEnv;

// Regression suite for the 2026-11-18 live-pass bug: a pending student whose
// registration used a brand-new volunteerId has no linked Volunteer record
// (it is created at approval), yet his dashboard must load with empty data.
describe('Phase 1 Pending Student Dashboard Without a Volunteer Record', () => {
  let apiServer: TestServer;

  before(async () => {
    env = loadEnv();
    await connectDatabase(buildTestDbUri(env.mongoUri, TEST_DB_NAME));
    assert.equal(mongoose.connection.name, TEST_DB_NAME);
    await mongoose.connection.dropDatabase();
    await Promise.all([
      User.init(),
      Volunteer.init(),
      Opportunity.init(),
      Application.init(),
      Settings.init(),
    ]);

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
      Opportunity.deleteMany({}),
      Application.deleteMany({}),
      Settings.deleteMany({}),
    ]);
  });

  it('new_registration_pending_student_dashboard_returns_empty_summary', async () => {
    const registered = await registerBrandNewStudent(apiServer.baseUrl);

    const res = await apiJson<StudentDashboardSummary>(
      apiServer.baseUrl,
      '/api/stats/me',
      registered.token
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.volunteer, null);
    assert.equal(res.body.approvedHours, 0);
    assert.equal(res.body.pendingHours, 0);
    assert.equal(res.body.remainingHours, res.body.certificateHours);
    assert.equal(res.body.eligible, false);
    assert.equal(res.body.eventsAttended, 0);
    assert.deepEqual(res.body.happeningNow, []);
    assert.deepEqual(res.body.upcomingAccepted, []);
    assert.deepEqual(res.body.activeApplications, []);
    assert.deepEqual(res.body.recentActivities, []);
  });

  it('new_registration_pending_student_applications_list_returns_empty_200', async () => {
    const registered = await registerBrandNewStudent(apiServer.baseUrl);

    const res = await apiJson<{ applications: unknown[] }>(
      apiServer.baseUrl,
      '/api/applications/me',
      registered.token
    );
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.applications, []);
  });

  it('unlinked_pending_student_still_receives_403_on_apply_and_checkin', async () => {
    const registered = await registerBrandNewStudent(apiServer.baseUrl);
    const opportunity = await seedOpportunity();

    const applyRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/apply`,
      registered.token,
      { method: 'POST', body: JSON.stringify({ note: '' }) }
    );
    assert.equal(applyRes.status, 403);
    assert.equal(applyRes.body.message, APPLY_LOCKED_MESSAGE);

    const checkinRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/checkin`,
      registered.token,
      { method: 'POST', body: JSON.stringify({ token: 'any-token' }) }
    );
    assert.equal(checkinRes.status, 403);
    assert.equal(checkinRes.body.message, CHECKIN_LOCKED_MESSAGE);
    assert.equal(await Application.countDocuments({}), 0);
  });

  it('approving_new_registration_creates_exactly_one_volunteer_and_unlocks_dashboard_and_apply', async () => {
    const registered = await registerBrandNewStudent(apiServer.baseUrl);
    const adminToken = await createAdminToken(env.jwtSecret);
    const opportunity = await seedOpportunity();

    const approveRes = await apiJson<ApproveResponse>(
      apiServer.baseUrl,
      `/api/registrations/${registered.user.id}/approve`,
      adminToken,
      { method: 'POST', body: JSON.stringify({}) }
    );
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.user.status, 'active');
    assert.equal(approveRes.body.volunteer.volunteerId, '20260777');
    assert.equal(approveRes.body.user.volunteer, approveRes.body.volunteer._id.toString());
    assert.equal(await Volunteer.countDocuments({ volunteerId: '20260777' }), 1);

    const dashboardRes = await apiJson<StudentDashboardSummary>(
      apiServer.baseUrl,
      '/api/stats/me',
      registered.token
    );
    assert.equal(dashboardRes.status, 200);
    assert.equal(dashboardRes.body.volunteer?.volunteerId, '20260777');
    assert.equal(dashboardRes.body.approvedHours, 0);

    const applyRes = await apiJson<{ application: { status: string } }>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/apply`,
      registered.token,
      { method: 'POST', body: JSON.stringify({ note: '' }) }
    );
    assert.equal(applyRes.status, 201);
    assert.equal(applyRes.body.application.status, 'accepted');
  });
});
