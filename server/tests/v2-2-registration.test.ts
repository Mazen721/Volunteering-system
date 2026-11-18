import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import type { AppEnv } from '../src/config/env.js';
import { loadEnv } from '../src/config/env.js';
import type { Faculty, UserRole } from '../src/constants/enums.js';
import { FACULTIES } from '../src/constants/enums.js';
import { Activity } from '../src/models/Activity.js';
import { User } from '../src/models/User.js';
import { Volunteer } from '../src/models/Volunteer.js';
import type { PublicUser } from '../src/services/auth.service.js';
import type { RegistrationQueueItem } from '../src/services/registration.service.js';
import type { TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, readJson, startTestServer } from './helpers.js';

const TEST_DB_NAME = 'volunteer_hours_test_v2_2';

interface RegisterResponse {
  token: string;
  user: PublicUser;
}

interface RegistrationsResponse {
  registrations: RegistrationQueueItem[];
}

interface ApproveResponse {
  user: PublicUser;
  volunteer: { _id: string; volunteerId: string; faculty: Faculty };
}

interface ErrorResponse {
  message: string;
}

function buildRegistrationPayload(overrides: Record<string, unknown> = {}) {
  return {
    email: 'student.new@mnu.edu.eg',
    password: 'Password123!',
    fullName: 'أحمد محمد علي',
    volunteerId: '20261001',
    category: 'student',
    faculty: FACULTIES[0],
    interests: ['medical', 'education'],
    ...overrides,
  };
}

async function createReviewer(role: Extract<UserRole, 'admin' | 'dean'>, faculty: Faculty | null) {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const doc = await User.create({
    email: `${role}.${Date.now()}.${Math.random()}@mnu.edu.eg`,
    passwordHash,
    fullName: role === 'admin' ? 'مسؤول النظام' : 'عميد الكلية',
    role,
    status: 'active',
    faculty,
  });
  return {
    id: doc._id.toString(),
    token: jwt.sign({ sub: doc._id.toString(), role }, loadEnv().jwtSecret, { expiresIn: '1h' }),
  };
}

describe('Phase V2-2 Student Self-Registration, Linking & Approval Queue', () => {
  let env: AppEnv;
  let apiServer: TestServer;

  before(async () => {
    env = loadEnv();
    await connectDatabase(buildTestDbUri(env.mongoUri, TEST_DB_NAME));
    assert.equal(mongoose.connection.name, TEST_DB_NAME);
    await mongoose.connection.dropDatabase();
    await Promise.all([User.init(), Volunteer.init(), Activity.init()]);

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
    await Promise.all([User.deleteMany({}), Volunteer.deleteMany({}), Activity.deleteMany({})]);
  });

  it('registers_multiple_pending_users_with_null_volunteer_and_restricts_until_approved', async () => {
    const firstRes = await fetch(`${apiServer.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        buildRegistrationPayload({ email: 's1@mnu.edu.eg', volunteerId: 'V-1' })
      ),
    });
    const firstBody = await readJson<RegisterResponse>(firstRes);
    assert.equal(firstRes.status, 201);
    assert.equal(firstBody.user.status, 'pending');
    assert.equal(firstBody.user.role, 'student');
    assert.equal(firstBody.user.volunteer, null);

    const secondRes = await fetch(`${apiServer.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        buildRegistrationPayload({
          email: 's2@mnu.edu.eg',
          volunteerId: 'V-2',
          category: 'academic',
        })
      ),
    });
    assert.equal(secondRes.status, 201);

    const meRes = await apiJson<{ user: PublicUser }>(
      apiServer.baseUrl,
      '/api/auth/me',
      firstBody.token
    );
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.user.status, 'pending');

    const blockedRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      '/api/registrations',
      firstBody.token
    );
    assert.equal(blockedRes.status, 403);
    assert.equal(blockedRes.body.message, 'غير مصرح لك بالوصول إلى هذا المورد');
  });

  it('creates_volunteer_on_dean_approval_and_blocks_cross_faculty_access_with_404', async () => {
    const registerRes = await fetch(`${apiServer.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        buildRegistrationPayload({ faculty: FACULTIES[0], volunteerId: 'NEW-100' })
      ),
    });
    const registerBody = await readJson<RegisterResponse>(registerRes);
    assert.equal(registerRes.status, 201);

    const wrongDean = await createReviewer('dean', FACULTIES[1]);
    const wrongQueue = await apiJson<RegistrationsResponse>(
      apiServer.baseUrl,
      '/api/registrations?status=pending',
      wrongDean.token
    );
    assert.equal(wrongQueue.status, 200);
    assert.equal(wrongQueue.body.registrations.length, 0);

    const crossApprove = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/registrations/${registerBody.user.id}/approve`,
      wrongDean.token,
      { method: 'POST', body: JSON.stringify({}) }
    );
    assert.equal(crossApprove.status, 404);

    const rightDean = await createReviewer('dean', FACULTIES[0]);
    const approveRes = await apiJson<ApproveResponse>(
      apiServer.baseUrl,
      `/api/registrations/${registerBody.user.id}/approve`,
      rightDean.token,
      { method: 'POST', body: JSON.stringify({}) }
    );
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.user.status, 'active');
    assert.equal(approveRes.body.volunteer.volunteerId, 'NEW-100');
    assert.equal(approveRes.body.user.volunteer, approveRes.body.volunteer._id.toString());
  });

  it('links_existing_imported_volunteer_and_preserves_prior_approved_hours', async () => {
    const importedVolunteer = await Volunteer.create({
      volunteerId: 'EXCEL-501',
      fullName: 'سارة إبراهيم',
      category: 'student',
      faculty: FACULTIES[2],
    });
    await Activity.create([
      {
        volunteer: importedVolunteer._id,
        title: 'قافلة طبية',
        type: 'قافلة',
        hours: 12,
        date: new Date('2026-03-10T00:00:00Z'),
        status: 'approved',
        supervisor: 'د. هبة',
      },
      {
        volunteer: importedVolunteer._id,
        title: 'ندوة قيد المراجعة',
        type: 'ندوة',
        hours: 4,
        date: new Date('2026-03-12T00:00:00Z'),
        status: 'pending',
        supervisor: 'د. هبة',
      },
    ]);

    const registerRes = await fetch(`${apiServer.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        buildRegistrationPayload({
          email: 'sara@mnu.edu.eg',
          volunteerId: 'EXCEL-501',
          faculty: FACULTIES[2],
        })
      ),
    });
    const registerBody = await readJson<RegisterResponse>(registerRes);
    assert.equal(registerRes.status, 201);

    const dean = await createReviewer('dean', FACULTIES[2]);
    const queueRes = await apiJson<RegistrationsResponse>(
      apiServer.baseUrl,
      '/api/registrations?status=pending',
      dean.token
    );
    assert.equal(queueRes.status, 200);
    assert.equal(queueRes.body.registrations.length, 1);
    assert.equal(queueRes.body.registrations[0].facultyMismatch, false);
    assert.equal(queueRes.body.registrations[0].existingVolunteer?.approvedHours, 12);

    const approveRes = await apiJson<ApproveResponse>(
      apiServer.baseUrl,
      `/api/registrations/${registerBody.user.id}/approve`,
      dean.token,
      { method: 'POST' }
    );
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.user.volunteer, importedVolunteer._id.toString());

    const activitiesCount = await Activity.countDocuments({
      volunteer: importedVolunteer._id,
      status: 'approved',
    });
    assert.equal(activitiesCount, 1);
  });

  it('flags_faculty_mismatch_blocks_dean_403_and_keeps_official_faculty_on_admin_approval', async () => {
    await Volunteer.create({
      volunteerId: 'MISMATCH-77',
      fullName: 'محمود حسن',
      category: 'student',
      faculty: FACULTIES[3],
    });

    const registerRes = await fetch(`${apiServer.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        buildRegistrationPayload({
          email: 'mahmoud@mnu.edu.eg',
          volunteerId: 'MISMATCH-77',
          faculty: FACULTIES[0],
        })
      ),
    });
    const registerBody = await readJson<RegisterResponse>(registerRes);
    assert.equal(registerRes.status, 201);
    assert.equal(registerBody.user.registration?.facultyMismatch, true);

    const dean = await createReviewer('dean', FACULTIES[0]);
    const deanApprove = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/registrations/${registerBody.user.id}/approve`,
      dean.token,
      { method: 'POST', body: JSON.stringify({}) }
    );
    assert.equal(deanApprove.status, 403);

    const admin = await createReviewer('admin', null);
    const adminApprove = await apiJson<ApproveResponse>(
      apiServer.baseUrl,
      `/api/registrations/${registerBody.user.id}/approve`,
      admin.token,
      { method: 'POST', body: JSON.stringify({}) }
    );
    assert.equal(adminApprove.status, 200);
    assert.equal(adminApprove.body.volunteer.faculty, FACULTIES[3]);
    assert.equal(adminApprove.body.user.faculty, FACULTIES[3]);
  });

  it('rejects_registration_with_arabic_reason_and_releases_volunteer_id_claim', async () => {
    const firstRes = await fetch(`${apiServer.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        buildRegistrationPayload({
          email: 'rejected@mnu.edu.eg',
          volunteerId: 'REJ-300',
          faculty: FACULTIES[4],
        })
      ),
    });
    const firstBody = await readJson<RegisterResponse>(firstRes);
    assert.equal(firstRes.status, 201);

    const dean = await createReviewer('dean', FACULTIES[4]);
    const rejectRes = await apiJson<{ user: PublicUser }>(
      apiServer.baseUrl,
      `/api/registrations/${firstBody.user.id}/reject`,
      dean.token,
      {
        method: 'POST',
        body: JSON.stringify({ rejectionReason: 'الرقم التعريفي غير مسجل بكشوف الكلية' }),
      }
    );
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.body.user.status, 'rejected');
    assert.equal(rejectRes.body.user.rejectionReason, 'الرقم التعريفي غير مسجل بكشوف الكلية');

    const meRes = await apiJson<{ user: PublicUser }>(
      apiServer.baseUrl,
      '/api/auth/me',
      firstBody.token
    );
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.user.rejectionReason, 'الرقم التعريفي غير مسجل بكشوف الكلية');

    const reRegisterRes = await fetch(`${apiServer.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        buildRegistrationPayload({
          email: 'correct-owner@mnu.edu.eg',
          volunteerId: 'REJ-300',
          faculty: FACULTIES[4],
        })
      ),
    });
    assert.equal(reRegisterRes.status, 201);
  });

  it('prevents_duplicate_volunteer_id_claims_sequentially_and_under_concurrency', async () => {
    const [resA, resB] = await Promise.all([
      fetch(`${apiServer.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildRegistrationPayload({ email: 'race-a@mnu.edu.eg', volunteerId: 'RACE-900' })
        ),
      }),
      fetch(`${apiServer.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildRegistrationPayload({ email: 'race-b@mnu.edu.eg', volunteerId: 'RACE-900' })
        ),
      }),
    ]);

    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [201, 409]);

    const sequentialDup = await fetch(`${apiServer.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        buildRegistrationPayload({ email: 'race-c@mnu.edu.eg', volunteerId: 'RACE-900' })
      ),
    });
    assert.equal(sequentialDup.status, 409);
  });

  it('rejects_invalid_registration_payload_with_arabic_400', async () => {
    const badRes = await fetch(`${apiServer.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        buildRegistrationPayload({
          password: 'short',
          interests: [],
        })
      ),
    });
    const badBody = await readJson<ErrorResponse>(badRes);
    assert.equal(badRes.status, 400);
    assert.ok(badBody.message.length > 0);
  });
});
