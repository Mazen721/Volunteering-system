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
import { Activity } from '../src/models/Activity.js';
import { User } from '../src/models/User.js';
import { Volunteer } from '../src/models/Volunteer.js';
import type {
  RegistrationListResult,
  RegistrationQueueItem,
} from '../src/services/registration.service.js';
import type { TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, startTestServer } from './helpers.js';

const TEST_DB_NAME = 'volunteer_hours_test_phase6_registrations';

const FACULTY_A = FACULTIES[0];
const FACULTY_B = FACULTIES[1];

async function createReviewer(
  env: AppEnv,
  role: 'admin' | 'dean',
  faculty: (typeof FACULTIES)[number] | null
) {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const doc = await User.create({
    email: `${role}.${Date.now()}.${Math.random()}@mnu.edu.eg`,
    passwordHash,
    fullName: role === 'admin' ? 'مسؤول النظام' : 'عميد الكلية',
    role,
    status: 'active',
    faculty,
  });
  return jwt.sign({ sub: doc._id.toString(), role, faculty }, env.jwtSecret, {
    expiresIn: '1h',
  });
}

async function createPendingStudent(index: number, faculty: (typeof FACULTIES)[number]) {
  const volunteerId = `2026${String(1000 + index)}`;
  // Raw insert so createdAt is pinned deterministically (mongoose timestamps
  // would stamp "now"), making the createdAt-desc page order stable.
  await mongoose.connection.db!.collection('users').insertOne({
    email: `student${index}@mnu.edu.eg`,
    passwordHash: 'not-a-real-hash',
    fullName: `طالب اختبار ${index}`,
    role: 'student',
    status: 'pending',
    faculty: null,
    volunteer: null,
    registration: {
      volunteerId,
      category: 'student',
      faculty,
      facultyMismatch: false,
    },
    interests: [],
    rejectionReason: null,
    approvedBy: null,
    approvedAt: null,
    createdAt: new Date(2026, 0, 1, 0, 0, index),
    updatedAt: new Date(2026, 0, 1, 0, 0, index),
  });
}


async function listRegs(path: string, token: string): Promise<RegistrationListResult> {
  const res = await apiJson<RegistrationListResult>(apiServerRef.baseUrl, path, token);
  assert.equal(res.status, 200);
  return res.body;
}

let apiServerRef: TestServer;

describe('Phase 6 Registrations List Pagination & Server Search', () => {
  let env: AppEnv;
  let apiServer: TestServer;
  let adminToken: string;
  let deanBToken: string;

  before(async () => {
    env = loadEnv();
    await connectDatabase(buildTestDbUri(env.mongoUri, TEST_DB_NAME));
    assert.equal(mongoose.connection.name, TEST_DB_NAME);
    await mongoose.connection.dropDatabase();
    await Promise.all([User.init(), Volunteer.init(), Activity.init()]);

    const app = createApp({ clientUrl: env.clientUrl, jwtSecret: env.jwtSecret });
    apiServer = await startTestServer(app);
    apiServerRef = apiServer;
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
    adminToken = await createReviewer(env, 'admin', null);
    deanBToken = await createReviewer(env, 'dean', FACULTY_B);
    // 25 pending in faculty A (indexes 0..24) + 3 pending in faculty B (25..27).
    for (let i = 0; i < 25; i += 1) {
      await createPendingStudent(i, FACULTY_A);
    }
    for (let i = 25; i < 28; i += 1) {
      await createPendingStudent(i, FACULTY_B);
    }
  });

  it('paginates_with_default_limit_10_and_reports_total_and_pages', async () => {
    const body = await listRegs('/api/registrations?status=pending',
      adminToken
    );
    assert.equal(body.registrations.length, 10);
    assert.equal(body.total, 28);
    assert.equal(body.page, 1);
    assert.equal(body.pages, 3);
    // Newest first (createdAt desc): the last created student leads page 1.
    assert.equal(body.registrations[0]?.registration.volunteerId, '20261027');
  });

  it('returns_disjoint_pages_that_cover_the_whole_queue', async () => {
    const page1 = await listRegs('/api/registrations?status=pending&page=1',
      adminToken
    );
    const page3 = await listRegs('/api/registrations?status=pending&page=3',
      adminToken
    );
    assert.equal(page3.registrations.length, 8);
    const ids = new Set(
      [...page1.registrations, ...page3.registrations].map((item: RegistrationQueueItem) => item.id)
    );
    assert.equal(ids.size, 18);
  });

  it('clamps_an_oversized_limit_to_100', async () => {
    const body = await listRegs('/api/registrations?status=pending&limit=1000',
      adminToken
    );
    assert.equal(body.registrations.length, 28);
    assert.equal(body.pages, 1);
  });

  it('searches_server_side_by_name_email_and_volunteer_id', async () => {
    const byName = await listRegs(`/api/registrations?status=pending&search=${encodeURIComponent('طالب اختبار 7')}`,
      adminToken
    );
    assert.equal(byName.total, 1);
    assert.equal(byName.registrations[0]?.email, 'student7@mnu.edu.eg');

    const byEmail = await listRegs('/api/registrations?status=pending&search=student12%40',
      adminToken
    );
    assert.equal(byEmail.total, 1);
    assert.equal(byEmail.registrations[0]?.registration.volunteerId, '20261012');

    const byVolunteerId = await listRegs('/api/registrations?status=pending&search=20261003',
      adminToken
    );
    assert.equal(byVolunteerId.total, 1);
    assert.equal(byVolunteerId.registrations[0]?.email, 'student3@mnu.edu.eg');
  });

  it('keeps_dean_scope_while_paginating', async () => {
    const body = await listRegs('/api/registrations?status=pending',
      deanBToken
    );
    assert.equal(body.total, 3);
    assert.equal(body.registrations.length, 3);
    assert.ok(
      body.registrations.every(
        (item: RegistrationQueueItem) => item.registration.faculty === FACULTY_B
      )
    );
  });

  it('reports_the_full_pending_total_for_a_limit_1_badge_query', async () => {
    const body = await listRegs('/api/registrations?status=pending&limit=1',
      adminToken
    );
    assert.equal(body.registrations.length, 1);
    assert.equal(body.total, 28);
  });
});
