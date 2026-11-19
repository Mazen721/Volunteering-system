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
const TEST_DB_NAME = 'volunteer_hours_test_phase5';

interface LoginPayload {
  token: string;
}

interface ErrorPayload {
  message: string;
}

async function loginAttempt(
  baseUrl: string,
  email: string,
  password: string,
  extraHeaders: Record<string, string> = {}
): Promise<number> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify({ email, password }),
  });
  await res.arrayBuffer();
  return res.status;
}

describe('Phase 5 Rate-Limit Keys (per-account login, per-user check-in, trust proxy)', () => {
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
    await seedDatabase({
      ...workbookData,
      adminEmail: env.adminEmail,
      adminPassword: env.adminPassword,
      includeDemoData: true,
    });
  });

  function hardenedServer(): Promise<TestServer> {
    const app = createApp({
      clientUrl: env.clientUrl,
      jwtSecret: env.jwtSecret,
      rateLimit: {
        login: { windowMs: 60_000, limit: 2 },
        loginIp: { windowMs: 60_000, limit: 100 },
        checkIn: { windowMs: 60_000, limit: 2 },
      },
    });
    return startTestServer(app);
  }

  it('login limit is per account: one locked account does not block another from the same IP', async () => {
    const server = await hardenedServer();
    try {
      // Sara exhausts her per-account allowance (limit = 2)
      assert.equal(
        await loginAttempt(server.baseUrl, 'sara.student@mnu.edu.eg', env.adminPassword),
        200
      );
      assert.equal(
        await loginAttempt(server.baseUrl, 'sara.student@mnu.edu.eg', 'wrong-password'),
        401
      );
      assert.equal(
        await loginAttempt(server.baseUrl, 'sara.student@mnu.edu.eg', env.adminPassword),
        429
      );

      // Ahmed, from the same source IP, is a different key and still logs in
      assert.equal(
        await loginAttempt(server.baseUrl, 'ahmed.student@mnu.edu.eg', env.adminPassword),
        200
      );
    } finally {
      await server.close();
    }
  });

  it('trust proxy: a different forwarded client IP gets its own login bucket', async () => {
    const server = await hardenedServer();
    try {
      // Exhaust Sara's bucket for the direct (proxy-less) source
      assert.equal(
        await loginAttempt(server.baseUrl, 'sara.student@mnu.edu.eg', env.adminPassword),
        200
      );
      assert.equal(
        await loginAttempt(server.baseUrl, 'sara.student@mnu.edu.eg', 'wrong-password'),
        401
      );
      assert.equal(
        await loginAttempt(server.baseUrl, 'sara.student@mnu.edu.eg', env.adminPassword),
        429
      );

      // Behind the university proxy, Sara's real IP arrives via X-Forwarded-For
      // and is a separate bucket, so she can still log in.
      assert.equal(
        await loginAttempt(server.baseUrl, 'sara.student@mnu.edu.eg', env.adminPassword, {
          'X-Forwarded-For': '10.20.30.40',
        }),
        200
      );
    } finally {
      await server.close();
    }
  });

  it('check-in limit is per user: two students on one network do not block each other', async () => {
    const server = await hardenedServer();
    try {
      const liveOpp = await Opportunity.findOne({
        title: 'قافلة الكشف الطبي والتوعية المجتمعية (مباشر)',
      }).lean();
      assert.ok(liveOpp);
      const oppId = liveOpp._id.toString();

      const saraLogin = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'sara.student@mnu.edu.eg', password: env.adminPassword }),
      });
      const { token: saraToken } = await readJson<LoginPayload>(saraLogin);
      const ahmedLogin = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ahmed.student@mnu.edu.eg', password: env.adminPassword }),
      });
      const { token: ahmedToken } = await readJson<LoginPayload>(ahmedLogin);

      // Sara burns her check-in allowance (limit = 2, invalid tokens -> 400)
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const res = await apiJson<ErrorPayload>(
          server.baseUrl,
          `/api/opportunities/${oppId}/checkin`,
          saraToken,
          { method: 'POST', body: JSON.stringify({ token: 'invalid-token' }) }
        );
        assert.equal(res.status, 400);
      }
      const saraThrottled = await apiJson<ErrorPayload>(
        server.baseUrl,
        `/api/opportunities/${oppId}/checkin`,
        saraToken,
        { method: 'POST', body: JSON.stringify({ token: 'invalid-token' }) }
      );
      assert.equal(saraThrottled.status, 429);

      // Ahmed's first check-in attempt from the same network is NOT throttled
      const ahmedRes = await apiJson<ErrorPayload>(
        server.baseUrl,
        `/api/opportunities/${oppId}/checkin`,
        ahmedToken,
        { method: 'POST', body: JSON.stringify({ token: 'invalid-token' }) }
      );
      assert.equal(ahmedRes.status, 400);
    } finally {
      await server.close();
    }
  });
});
