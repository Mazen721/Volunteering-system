import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import type { AppEnv } from '../src/config/env.js';
import { loadEnv } from '../src/config/env.js';
import type { Faculty, UserRole } from '../src/constants/enums.js';
import { FACULTIES } from '../src/constants/enums.js';
import { Opportunity } from '../src/models/Opportunity.js';
import type { OpportunityLean } from '../src/models/Opportunity.js';
import { User } from '../src/models/User.js';
import { Volunteer } from '../src/models/Volunteer.js';
import type { OpportunityDTO } from '../src/services/opportunity.service.js';
import type { TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, startTestServer } from './helpers.js';

const TEST_DB_NAME = 'volunteer_hours_test_phase21';
const FACULTY_A = FACULTIES[0];

// A 1x1 transparent PNG, stored the way uploaded covers are stored.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
const COVER_DATA_URL = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;

interface AccountResult {
  id: string;
  auth: string;
}

const ACCOUNT_PASSWORD = 'Password123!';

/** Logs in through the real auth route and returns the issued token. */
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
  assert.ok(body.token);
  return body.token;
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 3_600_000);
}

async function createUser(options: {
  email: string;
  role: UserRole;
  faculty: Faculty | null;
  volunteer?: mongoose.Types.ObjectId | null;
}): Promise<{ id: string; email: string }> {
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
  return { id: doc._id.toString(), email: options.email };
}

async function seedOpportunity(options: {
  createdBy: mongoose.Types.ObjectId;
  title: string;
  startAt: Date;
  endAt: Date;
  customCover?: string | null;
}): Promise<OpportunityLean> {
  const created = await Opportunity.create({
    title: options.title,
    description: 'وصف تفصيلي لفرصة تطوعية لاختبار قوائم الفرص والصور المخصصة والضغط',
    requirements: '',
    fields: ['medical'],
    activityType: 'قافلة',
    location: { name: 'المركز الطبي الجامعي', address: 'جامعة المنصورة الأهلية' },
    startAt: options.startAt,
    endAt: options.endAt,
    registrationDeadline: new Date(options.startAt.getTime() - 86_400_000),
    hours: 4,
    contactName: 'د. مسؤول',
    contactPhone: '01000000000',
    contactEmail: 'a1@mnu.edu.eg',
    faculty: FACULTY_A,
    slots: { student: 20, academic: 0, admin: 0 },
    acceptedCounts: { student: 0, academic: 0, admin: 0 },
    approvalMode: 'auto',
    status: 'published',
    customCover: options.customCover ?? '',
    createdBy: options.createdBy,
  });
  return created.toObject<OpportunityLean>();
}

interface ListBody {
  opportunities: OpportunityDTO[];
  total: number;
  page: number;
  pages: number;
}

describe('Phase 21 (A1/A9) bounded list payloads, cover route, phase predicates, gzip', () => {
  let env: AppEnv;
  let apiServer: TestServer;
  let admin: AccountResult;
  let student: AccountResult;
  let coverOpportunity: OpportunityLean;
  let endedOpportunity: OpportunityLean;

  before(async () => {
    env = loadEnv();
    await connectDatabase(buildTestDbUri(env.mongoUri, TEST_DB_NAME));
    assert.equal(mongoose.connection.name, TEST_DB_NAME);
    await mongoose.connection.dropDatabase();
    await Promise.all([User.init(), Volunteer.init(), Opportunity.init()]);

    const adminUser = await createUser({
      email: 'a1-admin@mnu.edu.eg',
      role: 'admin',
      faculty: null,
    });
    const volunteer = await Volunteer.create({
      volunteerId: 'A1001',
      fullName: 'متطوع قوائم',
      category: 'student',
      faculty: FACULTY_A,
    });
    const studentUser = await createUser({
      email: 'a1-student@mnu.edu.eg',
      role: 'student',
      faculty: FACULTY_A,
      volunteer: volunteer._id,
    });

    const createdBy = new mongoose.Types.ObjectId(adminUser.id);
    coverOpportunity = await seedOpportunity({
      createdBy,
      title: 'فرصة بصورة مخصصة',
      startAt: hoursFromNow(72),
      endAt: hoursFromNow(76),
      customCover: COVER_DATA_URL,
    });
    await seedOpportunity({
      createdBy,
      title: 'فرصة قادمة عادية',
      startAt: hoursFromNow(96),
      endAt: hoursFromNow(100),
    });
    await seedOpportunity({
      createdBy,
      title: 'فرصة قادمة ثالثة',
      startAt: hoursFromNow(120),
      endAt: hoursFromNow(124),
    });
    endedOpportunity = await seedOpportunity({
      createdBy,
      title: 'فرصة منتهية قديمة',
      startAt: hoursFromNow(-30),
      endAt: hoursFromNow(-26),
    });

    const app = createApp({ clientUrl: env.clientUrl, jwtSecret: env.jwtSecret });
    apiServer = await startTestServer(app);
    const adminToken = await loginForToken(apiServer.baseUrl, adminUser.email);
    const studentToken = await loginForToken(apiServer.baseUrl, studentUser.email);
    admin = { id: adminUser.id, auth: adminToken };
    student = { id: studentUser.id, auth: studentToken };
  });

  after(async () => {
    if (apiServer) {
      await apiServer.close();
    }
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('student list excludes ended opportunities; phase=ended returns only them', async () => {
    const plain = await apiJson<ListBody>(apiServer.baseUrl, '/api/opportunities', student.auth);
    assert.equal(plain.status, 200);
    const titles = plain.body.opportunities.map((opportunity) => opportunity.title);
    assert.ok(!titles.includes(endedOpportunity.title));
    assert.ok(titles.includes(coverOpportunity.title));

    const ended = await apiJson<ListBody>(
      apiServer.baseUrl,
      '/api/opportunities?phase=ended',
      student.auth
    );
    assert.equal(ended.status, 200);
    assert.deepEqual(
      ended.body.opportunities.map((opportunity) => opportunity.title),
      [endedOpportunity.title]
    );
  });

  it('list DTOs carry the cover path, never the data URL; details keep the data URL', async () => {
    const list = await apiJson<ListBody>(apiServer.baseUrl, '/api/opportunities', student.auth);
    const listed = list.body.opportunities.find(
      (opportunity) => opportunity._id.toString() === coverOpportunity._id.toString()
    );
    assert.ok(listed);
    assert.equal(listed.customCover, `/opportunities/${coverOpportunity._id.toString()}/cover`);
    for (const opportunity of list.body.opportunities) {
      assert.ok(!String(opportunity.customCover ?? '').startsWith('data:'));
    }

    const details = await apiJson<{ opportunity: { customCover?: string } }>(
      apiServer.baseUrl,
      `/api/opportunities/${coverOpportunity._id.toString()}`,
      student.auth
    );
    assert.equal(details.status, 200);
    assert.equal(details.body.opportunity.customCover, COVER_DATA_URL);
  });

  it('the cover route serves the image bytes publicly with ETag revalidation', async () => {
    const coverId = coverOpportunity._id.toString();
    const response = await fetch(`${apiServer.baseUrl}/api/opportunities/${coverId}/cover`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    // The client origin differs from the API origin; without this override
    // helmet's same-origin resource policy makes browsers refuse the <img>.
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin');
    const etag = response.headers.get('etag');
    assert.ok(etag);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG_BYTES);

    const revalidated = await fetch(`${apiServer.baseUrl}/api/opportunities/${coverId}/cover`, {
      headers: { 'If-None-Match': etag },
    });
    assert.equal(revalidated.status, 304);

    const missing = await fetch(
      `${apiServer.baseUrl}/api/opportunities/${new mongoose.Types.ObjectId().toString()}/cover`
    );
    assert.equal(missing.status, 404);
  });

  it('list responses are paginated with totals and honor page/limit', async () => {
    const page1 = await apiJson<ListBody>(
      apiServer.baseUrl,
      '/api/opportunities?limit=2&page=1',
      admin.auth
    );
    assert.equal(page1.status, 200);
    assert.equal(page1.body.opportunities.length, 2);
    assert.equal(page1.body.total, 4);
    assert.equal(page1.body.pages, 2);

    const page2 = await apiJson<ListBody>(
      apiServer.baseUrl,
      '/api/opportunities?limit=2&page=2',
      admin.auth
    );
    assert.equal(page2.body.opportunities.length, 2);
    const ids = new Set(
      [...page1.body.opportunities, ...page2.body.opportunities].map((opportunity) =>
        opportunity._id.toString()
      )
    );
    assert.equal(ids.size, 4);
  });

  it('API JSON responses are gzip-encoded when the client accepts gzip', async () => {
    const response = await fetch(`${apiServer.baseUrl}/api/opportunities`, {
      headers: {
        Authorization: `Bearer ${admin.auth}`,
        'Accept-Encoding': 'gzip',
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-encoding'), 'gzip');
    await response.arrayBuffer();
  });
});
