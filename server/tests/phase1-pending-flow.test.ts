import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import type { AppEnv } from '../src/config/env.js';
import { loadEnv, resolveAllowedEmailDomains } from '../src/config/env.js';
import { FACULTIES } from '../src/constants/enums.js';
import type { UserStatus } from '../src/constants/enums.js';
import { Application } from '../src/models/Application.js';
import { Opportunity } from '../src/models/Opportunity.js';
import type { OpportunityLean } from '../src/models/Opportunity.js';
import { Settings } from '../src/models/Settings.js';
import { User } from '../src/models/User.js';
import { Volunteer } from '../src/models/Volunteer.js';
import type { TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, readJson, startTestServer } from './helpers.js';

const TEST_DB_NAME = 'volunteer_hours_test_phase1';
const FACULTY_A = FACULTIES[0];
const APPLY_LOCKED_MESSAGE = 'المشاركة متاحة بعد اعتماد حسابك من إدارة النظام أو عميد كليتك';
const CHECKIN_LOCKED_MESSAGE = 'تسجيل الحضور متاح بعد اعتماد حسابك';
const DOMAIN_MESSAGE = 'يجب التسجيل باستخدام البريد الإلكتروني التابع للنطاق الجامعي المعتمد';

interface ErrorResponse {
  message: string;
}

interface LoginResponse {
  token: string;
  user: { status: UserStatus };
}

interface RegisterResponse {
  user: { status: UserStatus };
}

interface StudentAccount {
  token: string;
  userId: mongoose.Types.ObjectId;
  volunteerId: mongoose.Types.ObjectId;
}

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

async function createStudent(options: {
  email: string;
  volunteerId: string;
  status: UserStatus;
}): Promise<StudentAccount> {
  const volunteer = await Volunteer.create({
    volunteerId: options.volunteerId,
    fullName: `متطوع ${options.volunteerId}`,
    category: 'student',
    faculty: FACULTY_A,
  });
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const user = await User.create({
    email: options.email,
    passwordHash,
    fullName: `طالب ${options.volunteerId}`,
    role: 'student',
    status: options.status,
    faculty: FACULTY_A,
    volunteer: volunteer._id,
  });
  return {
    token: jwt.sign({ sub: user._id.toString(), role: 'student' }, env.jwtSecret, {
      expiresIn: '1h',
    }),
    userId: user._id,
    volunteerId: volunteer._id,
  };
}

async function seedOpportunity(options: {
  startAt: Date;
  endAt: Date;
  registrationDeadline: Date;
}): Promise<OpportunityLean> {
  const created = await Opportunity.create({
    title: 'فعالية تطوعية ميدانية',
    description: 'وصف تفصيلي لفعالية تطوعية لاختبار تدفق الحسابات المعلقة',
    requirements: '',
    fields: ['medical'],
    activityType: 'قافلة',
    location: { name: 'المركز الطبي الجامعي', address: 'جامعة المنصورة الأهلية' },
    startAt: options.startAt,
    endAt: options.endAt,
    registrationDeadline: options.registrationDeadline,
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

function buildRegistrationPayload(overrides: Record<string, unknown> = {}) {
  return {
    email: 'new.student@mnu.edu.eg',
    password: 'Password123!',
    fullName: 'طالب جديد',
    volunteerId: '20260999',
    category: 'student',
    faculty: FACULTY_A,
    interests: ['medical'],
    ...overrides,
  };
}

let env: AppEnv;

describe('Phase 1 Pending Student Browsing, Participation Lock & Email Domain Default', () => {
  let apiServer: TestServer;
  let defaultDomainServer: TestServer;

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

    // Mirrors production startup: validateEnv resolves an unset/empty
    // ALLOWED_EMAIL_DOMAINS through resolveAllowedEmailDomains.
    const defaultDomainApp = createApp({
      clientUrl: env.clientUrl,
      jwtSecret: env.jwtSecret,
      allowedEmailDomains: resolveAllowedEmailDomains(''),
    });
    defaultDomainServer = await startTestServer(defaultDomainApp);
  });

  after(async () => {
    if (apiServer) {
      await apiServer.close();
    }
    if (defaultDomainServer) {
      await defaultDomainServer.close();
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

  it('pending_student_can_log_in_and_browse_opportunities', async () => {
    await createStudent({
      email: 'pending.browse@mnu.edu.eg',
      volunteerId: '20261001',
      status: 'pending',
    });
    const opportunity = await seedOpportunity({
      startAt: minutesFromNow(2 * 24 * 60),
      endAt: minutesFromNow(2 * 24 * 60 + 120),
      registrationDeadline: minutesFromNow(24 * 60),
    });

    const loginRes = await fetch(`${apiServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'pending.browse@mnu.edu.eg', password: 'Password123!' }),
    });
    const loginBody = await readJson<LoginResponse>(loginRes);
    assert.equal(loginRes.status, 200);
    assert.equal(loginBody.user.status, 'pending');

    const listRes = await apiJson<{ opportunities: unknown[] }>(
      apiServer.baseUrl,
      '/api/opportunities',
      loginBody.token
    );
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.opportunities.length, 1);

    const detailsRes = await apiJson<{ opportunity: OpportunityLean }>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}`,
      loginBody.token
    );
    assert.equal(detailsRes.status, 200);
    assert.equal(detailsRes.body.opportunity.title, opportunity.title);
  });

  it('pending_student_is_blocked_from_staff_routes_with_role_message', async () => {
    const pending = await createStudent({
      email: 'pending.staff@mnu.edu.eg',
      volunteerId: '20261002',
      status: 'pending',
    });

    const res = await apiJson<ErrorResponse>(apiServer.baseUrl, '/api/volunteers', pending.token);
    assert.equal(res.status, 403);
    assert.equal(res.body.message, 'غير مصرح لك بالوصول إلى هذا المورد');
  });

  it('pending_student_cannot_apply_to_opportunity_receiving_403', async () => {
    const pending = await createStudent({
      email: 'pending.apply@mnu.edu.eg',
      volunteerId: '20261003',
      status: 'pending',
    });
    const opportunity = await seedOpportunity({
      startAt: minutesFromNow(2 * 24 * 60),
      endAt: minutesFromNow(2 * 24 * 60 + 120),
      registrationDeadline: minutesFromNow(24 * 60),
    });

    const res = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/apply`,
      pending.token,
      { method: 'POST', body: JSON.stringify({ note: '' }) }
    );
    assert.equal(res.status, 403);
    assert.equal(res.body.message, APPLY_LOCKED_MESSAGE);
    assert.equal(await Application.countDocuments({}), 0);
  });

  it('pending_student_cannot_check_in_receiving_403', async () => {
    const pending = await createStudent({
      email: 'pending.checkin@mnu.edu.eg',
      volunteerId: '20261004',
      status: 'pending',
    });
    const opportunity = await seedOpportunity({
      startAt: minutesFromNow(-10),
      endAt: minutesFromNow(120),
      registrationDeadline: minutesFromNow(-60),
    });
    await Application.create({
      opportunity: opportunity._id,
      volunteer: pending.volunteerId,
      user: pending.userId,
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

    const res = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/checkin`,
      pending.token,
      { method: 'POST', body: JSON.stringify({ token: 'any-token' }) }
    );
    assert.equal(res.status, 403);
    assert.equal(res.body.message, CHECKIN_LOCKED_MESSAGE);
  });

  it('active_student_can_still_apply_to_opportunity', async () => {
    const active = await createStudent({
      email: 'active.apply@mnu.edu.eg',
      volunteerId: '20261005',
      status: 'active',
    });
    const opportunity = await seedOpportunity({
      startAt: minutesFromNow(2 * 24 * 60),
      endAt: minutesFromNow(2 * 24 * 60 + 120),
      registrationDeadline: minutesFromNow(24 * 60),
    });

    const res = await apiJson<{ application: { status: string } }>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/apply`,
      active.token,
      { method: 'POST', body: JSON.stringify({ note: '' }) }
    );
    assert.equal(res.status, 201);
    assert.equal(res.body.application.status, 'accepted');
  });

  it('registration_rejects_non_university_domain_under_default_env_config', async () => {
    const res = await fetch(`${defaultDomainServer.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRegistrationPayload({ email: 'outsider@gmail.com' })),
    });
    const body = await readJson<ErrorResponse>(res);
    assert.equal(res.status, 400);
    assert.equal(body.message, DOMAIN_MESSAGE);
  });

  it('registration_accepts_university_domain_under_default_env_config_as_pending', async () => {
    const res = await fetch(`${defaultDomainServer.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRegistrationPayload()),
    });
    const body = await readJson<RegisterResponse>(res);
    assert.equal(res.status, 201);
    assert.equal(body.user.status, 'pending');
  });
});
