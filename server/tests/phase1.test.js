import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import mongoose from 'mongoose';
import { loadEnv } from '../src/config/env.js';
import { connectDatabase } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { validateBody } from '../src/middleware/validate.js';
import { Activity } from '../src/models/Activity.js';
import { Volunteer } from '../src/models/Volunteer.js';
import { parseSeedWorkbook } from '../src/seed/parseWorkbook.js';
import { seedDatabase } from '../src/seed/seed.js';
import { parseExcelDate } from '../src/utils/excelDate.js';
import { activitySchema } from '../src/validators/activity.schema.js';
import { volunteerSchema } from '../src/validators/volunteer.schema.js';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.resolve(CURRENT_DIR, '../src/seed/data.xlsx');
const TEST_DB_NAME = 'volunteer_hours_test';
const ARABIC_CHAR_REGEX = /[\u0600-\u06FF]/;

function buildTestDbUri(mongoUri) {
  const url = new URL(mongoUri);
  url.pathname = `/${TEST_DB_NAME}`;
  return url.toString();
}

async function startTestServer(app) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

describe('parseExcelDate', () => {
  it('converts_excel_serial_46270_to_2026_09_05_utc', () => {
    const parsed = parseExcelDate(46270);
    assert.equal(parsed.toISOString(), '2026-09-05T00:00:00.000Z');
  });

  it('converts_iso_date_string_to_utc_midnight', () => {
    const parsed = parseExcelDate('2026-05-10');
    assert.equal(parsed.toISOString(), '2026-05-10T00:00:00.000Z');
  });

  for (const badInput of [null, undefined, '', 0, -5, 'not-a-date', new Date('invalid')]) {
    it(`rejects_invalid_date_input_${String(badInput)}`, () => {
      assert.throws(() => parseExcelDate(badInput), { statusCode: 400 });
    });
  }
});

describe('parseSeedWorkbook', () => {
  it('uses_volunteers_sheet_as_faculty_source_of_truth_and_parses_all_dates', async () => {
    const { volunteers, activities } = await parseSeedWorkbook(SEED_FILE);

    assert.equal(volunteers.length, 8);
    assert.equal(activities.length, 12);

    const sara = volunteers.find((volunteer) => volunteer.volunteerId === '20260002');
    assert.equal(sara?.faculty, 'كلية طب الأسنان');

    const row15Activity = activities.find(
      (activity) => activity.volunteerId === '20260003' && activity.supervisor === 'رئيس الجامعة'
    );
    assert.ok(row15Activity);
    assert.equal(row15Activity.date.toISOString(), '2026-09-05T00:00:00.000Z');
  });
});

describe('Arabic validation middleware', () => {
  const invalidPayloads = [
    {
      label: 'negative_hours',
      schema: activitySchema,
      body: {
        volunteerId: '20260001',
        title: 'نشاط تطوعي',
        type: 'قافلة',
        hours: -5,
        date: '2026-05-10',
        status: 'approved',
        supervisor: 'مركز المسؤولية المجتمعية',
      },
    },
    {
      label: 'future_date',
      schema: activitySchema,
      body: {
        volunteerId: '20260001',
        title: 'نشاط مستقبلي',
        type: 'مبادرة',
        hours: 4,
        date: '2099-01-01',
        status: 'pending',
        supervisor: 'مركز المسؤولية المجتمعية',
      },
    },
    {
      label: 'invalid_volunteer_faculty',
      schema: volunteerSchema,
      body: {
        volunteerId: '20260099',
        fullName: 'متطوع تجريبي',
        category: 'student',
        faculty: 'كلية غير موجودة',
      },
    },
  ];

  for (const testCase of invalidPayloads) {
    it(`returns_400_with_arabic_message_for_${testCase.label}`, async () => {
      const miniApp = express();
      miniApp.use(express.json());
      miniApp.post('/validate', validateBody(testCase.schema), (_req, res) =>
        res.json({ ok: true })
      );
      miniApp.use(errorHandler);

      const server = await startTestServer(miniApp);
      try {
        const response = await fetch(`${server.baseUrl}/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testCase.body),
        });
        const body = await response.json();

        assert.equal(response.status, 400);
        assert.match(body.message, ARABIC_CHAR_REGEX);
      } finally {
        await server.close();
      }
    });
  }
});

describe('Phase 1 MongoDB seed and JWT auth integration', () => {
  let env;
  let apiServer;

  before(async () => {
    env = loadEnv();
    await connectDatabase(buildTestDbUri(env.mongoUri));
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

  it('seeds_8_volunteers_12_activities_1_admin_idempotently_with_valid_dates', async () => {
    const workbookData = await parseSeedWorkbook(SEED_FILE);
    const firstCounts = await seedDatabase({
      ...workbookData,
      adminEmail: env.adminEmail,
      adminPassword: env.adminPassword,
    });
    const secondCounts = await seedDatabase({
      ...workbookData,
      adminEmail: env.adminEmail,
      adminPassword: env.adminPassword,
    });

    assert.deepEqual(firstCounts, { volunteersCount: 8, activitiesCount: 12, adminCount: 1 });
    assert.deepEqual(secondCounts, { volunteersCount: 8, activitiesCount: 12, adminCount: 1 });

    const sara = await Volunteer.findOne({ volunteerId: '20260002' }).lean();
    assert.equal(sara?.faculty, 'كلية طب الأسنان');

    const storedActivities = await Activity.find().lean();
    for (const activity of storedActivities) {
      assert.ok(activity.date instanceof Date);
      assert.ok(!Number.isNaN(activity.date.getTime()));
    }
  });

  it('authenticates_valid_admin_rejects_wrong_password_and_protects_routes', async () => {
    const unauthRes = await fetch(`${apiServer.baseUrl}/api/auth/me`);
    assert.equal(unauthRes.status, 401);

    const wrongLoginRes = await fetch(`${apiServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: env.adminEmail, password: 'wrong-password' }),
    });
    const wrongLoginBody = await wrongLoginRes.json();
    assert.equal(wrongLoginRes.status, 401);
    assert.equal(wrongLoginBody.message, 'بيانات الدخول غير صحيحة');

    const loginRes = await fetch(`${apiServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: env.adminEmail, password: env.adminPassword }),
    });
    const loginBody = await loginRes.json();
    assert.equal(loginRes.status, 200);
    assert.ok(loginBody.token);

    const meRes = await fetch(`${apiServer.baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });
    const meBody = await meRes.json();
    assert.equal(meRes.status, 200);
    assert.equal(meBody.admin.email, env.adminEmail.toLowerCase());
  });
});
