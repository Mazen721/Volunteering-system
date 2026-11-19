import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import type { AppEnv } from '../src/config/env.js';
import { loadEnv } from '../src/config/env.js';
import { Activity } from '../src/models/Activity.js';
import { Application } from '../src/models/Application.js';
import { Opportunity } from '../src/models/Opportunity.js';
import { User } from '../src/models/User.js';
import { Volunteer } from '../src/models/Volunteer.js';
import { parseSeedWorkbook } from '../src/seed/parseWorkbook.js';
import { seedDatabase } from '../src/seed/seed.js';
import type { TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, readJson, startTestServer } from './helpers.js';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.resolve(CURRENT_DIR, '../src/seed/data.xlsx');
const TEST_DB_NAME = 'volunteer_hours_test_phase7';

interface DemoStatusPayload {
  enabled: boolean;
}

interface DemoLoginPayload {
  token: string;
  user: { email: string; role: string; status: string; faculty: string | null };
  admin?: { email: string };
}

interface MePayload {
  user: { email: string; role: string };
}

async function demoProbe(
  baseUrl: string
): Promise<{ status: number; body: DemoStatusPayload }> {
  const res = await fetch(`${baseUrl}/api/auth/demo-login`);
  return { status: res.status, body: await readJson<DemoStatusPayload>(res) };
}

async function demoPost(
  baseUrl: string,
  account: string
): Promise<{ status: number; body: DemoLoginPayload }> {
  const res = await fetch(`${baseUrl}/api/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account }),
  });
  return { status: res.status, body: await readJson<DemoLoginPayload>(res) };
}

describe('Phase 7 Demo Login (flag-gated one-click showcase accounts)', () => {
  let env: AppEnv;
  let workbookData: Awaited<ReturnType<typeof parseSeedWorkbook>>;
  let apiServer: TestServer;

  before(async () => {
    env = loadEnv();
    workbookData = await parseSeedWorkbook(SEED_FILE);
    await connectDatabase(buildTestDbUri(env.mongoUri, TEST_DB_NAME));
    assert.equal(mongoose.connection.name, TEST_DB_NAME);
    await mongoose.connection.dropDatabase();
    await mongoose.syncIndexes();

    const app = createApp({ clientUrl: env.clientUrl, jwtSecret: env.jwtSecret });
    apiServer = await startTestServer(app);
  });

  after(async () => {
    delete process.env.ENABLE_DEMO_LOGIN;
    if (apiServer) {
      await apiServer.close();
    }
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === TEST_DB_NAME) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    delete process.env.ENABLE_DEMO_LOGIN;
    await Promise.all([
      Activity.deleteMany({}),
      Application.deleteMany({}),
      Opportunity.deleteMany({}),
      User.deleteMany({}),
      Volunteer.deleteMany({}),
    ]);
    await seedDatabase({
      ...workbookData,
      adminEmail: env.adminEmail,
      adminPassword: env.adminPassword,
      includeDemoData: true,
    });
  });

  it('probe_reports_disabled_by_default_and_post_is_404', async () => {
    const probe = await demoProbe(apiServer.baseUrl);
    assert.equal(probe.status, 200);
    assert.equal(probe.body.enabled, false);

    const attempt = await demoPost(apiServer.baseUrl, 'admin');
    assert.equal(attempt.status, 404);
  });

  it('enabled_probe_and_each_account_logs_in_with_the_right_role', async () => {
    process.env.ENABLE_DEMO_LOGIN = 'true';

    const probe = await demoProbe(apiServer.baseUrl);
    assert.equal(probe.body.enabled, true);

    const admin = await demoPost(apiServer.baseUrl, 'admin');
    assert.equal(admin.status, 200);
    assert.equal(admin.body.user.email, 'admin@mnu.edu.eg');
    assert.equal(admin.body.user.role, 'admin');
    assert.equal(admin.body.admin?.email, 'admin@mnu.edu.eg');
    assert.ok(admin.body.token.length > 0);

    const dean = await demoPost(apiServer.baseUrl, 'dean');
    assert.equal(dean.status, 200);
    assert.equal(dean.body.user.email, 'medicine.dean@mnu.edu.eg');
    assert.equal(dean.body.user.role, 'dean');

    const student = await demoPost(apiServer.baseUrl, 'student');
    assert.equal(student.status, 200);
    assert.equal(student.body.user.email, 'ahmed.student@mnu.edu.eg');
    assert.equal(student.body.user.role, 'student');
    assert.equal(student.body.user.status, 'active');
  });

  it('demo_token_authenticates_me', async () => {
    process.env.ENABLE_DEMO_LOGIN = 'true';
    const student = await demoPost(apiServer.baseUrl, 'student');
    assert.equal(student.status, 200);

    const me = await apiJson<MePayload>(apiServer.baseUrl, '/api/auth/me', student.body.token);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, 'ahmed.student@mnu.edu.eg');
    assert.equal(me.body.user.role, 'student');
  });

  it('invalid_account_is_400', async () => {
    process.env.ENABLE_DEMO_LOGIN = 'true';
    const attempt = await demoPost(apiServer.baseUrl, 'root');
    assert.equal(attempt.status, 400);
  });

  it('turning_the_flag_back_off_disables_post_again', async () => {
    process.env.ENABLE_DEMO_LOGIN = 'true';
    const ok = await demoPost(apiServer.baseUrl, 'admin');
    assert.equal(ok.status, 200);

    delete process.env.ENABLE_DEMO_LOGIN;
    const blocked = await demoPost(apiServer.baseUrl, 'admin');
    assert.equal(blocked.status, 404);
  });
});
