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
import { Application } from '../src/models/Application.js';
import { Opportunity } from '../src/models/Opportunity.js';
import { Settings } from '../src/models/Settings.js';
import { User } from '../src/models/User.js';
import { Volunteer } from '../src/models/Volunteer.js';
import type { VolunteeringReport } from '../src/services/report.service.js';
import type { TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, startTestServer } from './helpers.js';

const TEST_DB_NAME = 'volunteer_hours_test_phase14_report_range';
const FACULTY_A = FACULTIES[0];
const FACULTY_B = FACULTIES[1];

const TITLE_A_NOV = 'قافلة الطب في أوائل نوفمبر';
const TITLE_A_DEC = 'ورشة الطب في ديسمبر';
const TITLE_B_NOV = 'حملة الأسنان في أوائل نوفمبر';
const TITLE_GLOBAL = 'حملة الجامعة العامة';

interface ErrorPayload {
  message: string;
}

async function createAccount(options: {
  email: string;
  role: UserRole;
  faculty: Faculty | null;
  volunteer?: mongoose.Types.ObjectId | null;
}) {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const doc = await User.create({
    email: options.email,
    passwordHash,
    fullName: `مستخدم ${options.role}`,
    role: options.role,
    status: 'active',
    faculty: options.faculty,
    volunteer: options.volunteer ?? null,
  });
  return {
    id: doc._id.toString(),
    objectId: doc._id,
    token: jwt.sign({ sub: doc._id.toString(), role: options.role }, loadEnv().jwtSecret, {
      expiresIn: '1h',
    }),
  };
}

async function seedRangeFixture(adminId: mongoose.Types.ObjectId) {
  await Settings.findOneAndUpdate(
    { key: 'global' },
    { $set: { certificateHours: 30 } },
    { upsert: true }
  );

  const [volA1, volA2, volB1] = await Volunteer.create([
    { volunteerId: 'A-1401', fullName: 'سارة أحمد', category: 'student', faculty: FACULTY_A },
    { volunteerId: 'A-1402', fullName: 'كريم محمود', category: 'student', faculty: FACULTY_A },
    { volunteerId: 'B-1401', fullName: 'يوسف سامي', category: 'student', faculty: FACULTY_B },
  ]);

  const studentA1 = await createAccount({
    email: 'a1401@mnu.edu.eg',
    role: 'student',
    faculty: FACULTY_A,
    volunteer: volA1._id,
  });
  const studentA2 = await createAccount({
    email: 'a1402@mnu.edu.eg',
    role: 'student',
    faculty: FACULTY_A,
    volunteer: volA2._id,
  });
  const studentB1 = await createAccount({
    email: 'b1401@mnu.edu.eg',
    role: 'student',
    faculty: FACULTY_B,
    volunteer: volB1._id,
  });

  const base = {
    description: 'وصف الفرصة',
    requirements: '',
    location: { name: 'الحرم الجامعي', address: 'المنصورة' },
    hours: 6,
    contactName: 'منسق',
    contactPhone: '01000000000',
    contactEmail: 'opp@mnu.edu.eg',
    approvalMode: 'manual' as const,
    createdBy: adminId,
  };
  const [oppANov, oppADec, oppBNov, oppGlobal] = await Opportunity.create([
    {
      ...base,
      title: TITLE_A_NOV,
      fields: ['medical'],
      activityType: 'قافلة',
      startAt: new Date('2026-11-02T09:00:00.000Z'),
      endAt: new Date('2026-11-02T15:00:00.000Z'),
      registrationDeadline: new Date('2026-10-31T09:00:00.000Z'),
      faculty: FACULTY_A,
      slots: { student: 5, academic: 0, admin: 0 },
      acceptedCounts: { student: 2, academic: 0, admin: 0 },
      status: 'completed',
    },
    {
      ...base,
      title: TITLE_A_DEC,
      fields: ['education'],
      activityType: 'ورشة عمل',
      startAt: new Date('2026-12-10T09:00:00.000Z'),
      endAt: new Date('2026-12-10T15:00:00.000Z'),
      registrationDeadline: new Date('2026-12-08T09:00:00.000Z'),
      faculty: FACULTY_A,
      slots: { student: 5, academic: 0, admin: 0 },
      acceptedCounts: { student: 0, academic: 0, admin: 0 },
      status: 'published',
    },
    {
      ...base,
      title: TITLE_B_NOV,
      fields: ['medical'],
      activityType: 'قافلة',
      startAt: new Date('2026-11-03T09:00:00.000Z'),
      endAt: new Date('2026-11-03T15:00:00.000Z'),
      registrationDeadline: new Date('2026-11-01T09:00:00.000Z'),
      faculty: FACULTY_B,
      slots: { student: 5, academic: 0, admin: 0 },
      acceptedCounts: { student: 1, academic: 0, admin: 0 },
      status: 'completed',
    },
    {
      ...base,
      title: TITLE_GLOBAL,
      fields: ['charity_community'],
      activityType: 'حملة توعية',
      startAt: new Date('2026-11-20T09:00:00.000Z'),
      endAt: new Date('2026-11-20T15:00:00.000Z'),
      registrationDeadline: new Date('2026-11-18T09:00:00.000Z'),
      faculty: null,
      slots: { student: 10, academic: 0, admin: 0 },
      acceptedCounts: { student: 0, academic: 0, admin: 0 },
      status: 'published',
    },
  ]);

  await Activity.create([
    {
      volunteer: volA1._id,
      opportunity: oppANov._id,
      title: TITLE_A_NOV,
      type: 'قافلة',
      hours: 35,
      date: new Date('2026-11-02T10:00:00.000Z'),
      status: 'approved',
      supervisor: 'د. محمد',
    },
    {
      volunteer: volA2._id,
      opportunity: oppANov._id,
      title: TITLE_A_NOV,
      type: 'قافلة',
      hours: 10,
      date: new Date('2026-11-02T10:00:00.000Z'),
      status: 'approved',
      supervisor: 'د. محمد',
    },
    {
      volunteer: volB1._id,
      opportunity: oppBNov._id,
      title: TITLE_B_NOV,
      type: 'قافلة',
      hours: 40,
      date: new Date('2026-11-03T10:00:00.000Z'),
      status: 'approved',
      supervisor: 'د. هاني',
    },
    {
      // Manually recorded hours with no opportunity link: part of the
      // all-time report, but of no period report.
      volunteer: volA1._id,
      title: 'ساعات يدوية',
      type: 'مبادرة',
      hours: 5,
      date: new Date('2026-11-15T10:00:00.000Z'),
      status: 'approved',
      supervisor: 'د. سلمى',
    },
  ]);

  await Application.create([
    {
      opportunity: oppANov._id,
      volunteer: volA1._id,
      user: studentA1.objectId,
      faculty: FACULTY_A,
      category: 'student',
      status: 'accepted',
      attended: true,
      hoursGranted: 6,
    },
    {
      opportunity: oppANov._id,
      volunteer: volA2._id,
      user: studentA2.objectId,
      faculty: FACULTY_A,
      category: 'student',
      status: 'accepted',
      attended: false,
    },
    {
      opportunity: oppBNov._id,
      volunteer: volB1._id,
      user: studentB1.objectId,
      faculty: FACULTY_B,
      category: 'student',
      status: 'accepted',
      attended: true,
      hoursGranted: 6,
    },
    {
      opportunity: oppGlobal._id,
      volunteer: volA1._id,
      user: studentA1.objectId,
      faculty: FACULTY_A,
      category: 'student',
      status: 'pending',
      attended: false,
    },
    {
      opportunity: oppADec._id,
      volunteer: volA2._id,
      user: studentA2.objectId,
      faculty: FACULTY_A,
      category: 'student',
      status: 'pending',
      attended: false,
    },
  ]);

  return { studentA1 };
}

describe('Phase 14 Report Faculty Filter & Date Range', () => {
  let env: AppEnv;
  let apiServer: TestServer;

  before(async () => {
    env = loadEnv();
    await connectDatabase(buildTestDbUri(env.mongoUri, TEST_DB_NAME));
    await mongoose.connection.dropDatabase();
    await mongoose.syncIndexes();
    apiServer = await startTestServer(createApp(env));
  });

  beforeEach(async () => {
    await Promise.all([
      Activity.deleteMany({}),
      Application.deleteMany({}),
      Opportunity.deleteMany({}),
      Volunteer.deleteMany({}),
      User.deleteMany({}),
      Settings.deleteMany({}),
    ]);
  });

  after(async () => {
    await apiServer.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  async function seedAdmin() {
    const admin = await createAccount({
      email: 'admin.p14@mnu.edu.eg',
      role: 'admin',
      faculty: null,
    });
    const fixture = await seedRangeFixture(admin.objectId);
    return { admin, ...fixture };
  }

  it('keeps_the_no_params_report_all_time_and_echoes_null_period', async () => {
    const { admin } = await seedAdmin();

    const res = await apiJson<VolunteeringReport>(
      apiServer.baseUrl,
      '/api/stats/report',
      admin.token
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.meta.scope, 'university');
    assert.equal(res.body.meta.faculty, null);
    assert.equal(res.body.meta.facultyName, null);
    assert.equal(res.body.meta.from, null);
    assert.equal(res.body.meta.to, null);
    // The manually recorded 5 hours belong to the all-time report.
    assert.equal(res.body.overview.totalApprovedHours, 90);
    assert.equal(res.body.overview.registeredVolunteers, 3);
    assert.equal(res.body.overview.eligibleVolunteers, 2);
    assert.equal(res.body.summary.totalOpportunities, 4);
    assert.equal(res.body.summary.totalApplications, 5);
  });

  it('isolates_an_admin_faculty_filter_to_that_faculty_only', async () => {
    const { admin } = await seedAdmin();

    const res = await apiJson<VolunteeringReport>(
      apiServer.baseUrl,
      `/api/stats/report?faculty=${encodeURIComponent(FACULTY_A)}`,
      admin.token
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.meta.scope, 'faculty');
    assert.equal(res.body.meta.faculty, FACULTY_A);
    assert.equal(res.body.meta.facultyName, FACULTY_A);
    assert.deepEqual(
      res.body.opportunities.map((row) => row.title).sort(),
      [TITLE_A_DEC, TITLE_A_NOV].sort()
    );
    assert.equal(res.body.faculties.faculties.length, 1);
    assert.equal(res.body.faculties.faculties[0].faculty, FACULTY_A);
    // Faculty scope follows the volunteer-faculty rule of the all-time
    // report: faculty A volunteers hold 35 + 10 + 5 manual = 50 hours.
    assert.equal(res.body.overview.totalApprovedHours, 50);

    const serialized = JSON.stringify(res.body);
    assert.equal(serialized.includes(FACULTY_B), false);
    assert.equal(serialized.includes('يوسف سامي'), false);
    assert.equal(serialized.includes(TITLE_B_NOV), false);
  });

  it('rejects_an_unknown_admin_faculty_with_400', async () => {
    const { admin } = await seedAdmin();

    const res = await apiJson<ErrorPayload>(
      apiServer.baseUrl,
      `/api/stats/report?faculty=${encodeURIComponent('كلية وهمية')}`,
      admin.token
    );
    assert.equal(res.status, 400);
  });

  it('derives_every_section_from_the_period_opportunity_set', async () => {
    const { admin } = await seedAdmin();

    const res = await apiJson<VolunteeringReport>(
      apiServer.baseUrl,
      '/api/stats/report?from=2026-11-01&to=2026-11-30',
      admin.token
    );
    assert.equal(res.status, 200);
    const report = res.body;
    assert.equal(report.meta.from, '2026-11-01');
    assert.equal(report.meta.to, '2026-11-30');
    assert.equal(report.meta.faculty, null);

    // Register: the three November opportunities; December is out.
    assert.deepEqual(
      report.opportunities.map((row) => row.title).sort(),
      [TITLE_A_NOV, TITLE_B_NOV, TITLE_GLOBAL].sort()
    );
    assert.equal(report.summary.totalOpportunities, 3);

    // Hours come only from activities credited by period opportunities:
    // 35 + 10 + 40 = 85; the 5 manual hours are excluded.
    assert.equal(report.overview.totalApprovedHours, 85);
    assert.equal(report.overview.registeredVolunteers, 3);
    // Eligibility is computed from in-period hours: A1 has 35 (not 40).
    assert.equal(report.overview.eligibleVolunteers, 2);
    const a1Row = report.leaderboard.leaderboard.find((row) => row.fullName === 'سارة أحمد');
    assert.equal(a1Row?.approvedHours, 35);
    assert.equal(report.leaderboard.leaderboard[0].fullName, 'يوسف سامي');
    assert.equal(report.leaderboard.leaderboard[0].approvedHours, 40);

    // Funnel counts applications on period opportunities only.
    assert.equal(report.summary.totalApplications, 4);
    assert.equal(report.summary.approvalRate, 75);
    assert.equal(report.summary.attendanceRate, 66.7);
    assert.equal(report.participation.funnel.applied, 4);

    // Monthly trend is restricted to months inside the period.
    assert.deepEqual(
      report.monthlyHours.months.map((month) => month.month),
      ['2026-11']
    );
    assert.equal(report.monthlyHours.months[0].approvedHours, 85);

    // Interests derive from the period register.
    const medical = report.interests.find((row) => row.field === 'medical');
    assert.equal(medical?.opportunitiesCount, 2);
    const education = report.interests.find((row) => row.field === 'education');
    assert.equal(education?.opportunitiesCount, 0);
  });

  it('shrinks_the_report_for_a_narrow_five_day_window', async () => {
    const { admin } = await seedAdmin();

    const res = await apiJson<VolunteeringReport>(
      apiServer.baseUrl,
      '/api/stats/report?from=2026-11-01&to=2026-11-05',
      admin.token
    );
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.opportunities.map((row) => row.title).sort(),
      [TITLE_A_NOV, TITLE_B_NOV].sort()
    );
    assert.equal(res.body.summary.totalOpportunities, 2);
    assert.equal(res.body.summary.totalApplications, 3);
    assert.equal(res.body.overview.totalApprovedHours, 85);
  });

  it('treats_from_and_to_as_inclusive_cairo_calendar_days', async () => {
    const { admin } = await seedAdmin();

    const res = await apiJson<VolunteeringReport>(
      apiServer.baseUrl,
      '/api/stats/report?from=2026-11-02&to=2026-11-02',
      admin.token
    );
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.opportunities.map((row) => row.title),
      [TITLE_A_NOV]
    );
    assert.equal(res.body.overview.totalApprovedHours, 45);
  });

  it('supports_a_one_sided_range', async () => {
    const { admin } = await seedAdmin();

    const res = await apiJson<VolunteeringReport>(
      apiServer.baseUrl,
      '/api/stats/report?from=2026-12-01',
      admin.token
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.meta.from, '2026-12-01');
    assert.equal(res.body.meta.to, null);
    assert.deepEqual(
      res.body.opportunities.map((row) => row.title),
      [TITLE_A_DEC]
    );
    assert.equal(res.body.overview.totalApprovedHours, 0);
    assert.equal(res.body.summary.totalApplications, 1);
    assert.equal(res.body.overview.pendingApplications, 1);
  });

  it('combines_admin_faculty_filter_with_a_range', async () => {
    const { admin } = await seedAdmin();

    const res = await apiJson<VolunteeringReport>(
      apiServer.baseUrl,
      `/api/stats/report?faculty=${encodeURIComponent(FACULTY_A)}&from=2026-11-01&to=2026-11-30`,
      admin.token
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.meta.faculty, FACULTY_A);
    assert.deepEqual(
      res.body.opportunities.map((row) => row.title),
      [TITLE_A_NOV]
    );
    assert.equal(res.body.overview.totalApprovedHours, 45);
    assert.equal(res.body.summary.totalApplications, 2);
    assert.equal(res.body.overview.eligibleVolunteers, 1);
  });

  it('keeps_a_dean_on_his_own_faculty_with_spoofed_faculty_and_range', async () => {
    const { admin } = await seedAdmin();
    const deanA = await createAccount({
      email: 'dean.a.p14@mnu.edu.eg',
      role: 'dean',
      faculty: FACULTY_A,
    });
    void admin;

    const res = await apiJson<VolunteeringReport>(
      apiServer.baseUrl,
      `/api/stats/report?faculty=${encodeURIComponent(FACULTY_B)}&from=2026-11-01&to=2026-11-30`,
      deanA.token
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.meta.scope, 'faculty');
    assert.equal(res.body.meta.faculty, FACULTY_A);
    assert.equal(res.body.meta.from, '2026-11-01');
    assert.equal(res.body.meta.to, '2026-11-30');
    assert.deepEqual(
      res.body.opportunities.map((row) => row.title),
      [TITLE_A_NOV]
    );
    assert.equal(res.body.overview.totalApprovedHours, 45);

    const serialized = JSON.stringify(res.body);
    assert.equal(serialized.includes(FACULTY_B), false);
    assert.equal(serialized.includes('يوسف سامي'), false);
    assert.equal(serialized.includes(TITLE_B_NOV), false);
    assert.equal(serialized.includes(TITLE_GLOBAL), false);
  });

  it('rejects_inverted_and_malformed_ranges_with_400', async () => {
    const { admin } = await seedAdmin();

    const inverted = await apiJson<ErrorPayload>(
      apiServer.baseUrl,
      '/api/stats/report?from=2026-12-01&to=2026-11-01',
      admin.token
    );
    assert.equal(inverted.status, 400);

    const malformed = await apiJson<ErrorPayload>(
      apiServer.baseUrl,
      '/api/stats/report?from=not-a-date',
      admin.token
    );
    assert.equal(malformed.status, 400);

    const impossible = await apiJson<ErrorPayload>(
      apiServer.baseUrl,
      '/api/stats/report?to=2026-02-30',
      admin.token
    );
    assert.equal(impossible.status, 400);
  });

  it('blocks_students_with_403_even_with_range_params', async () => {
    const { studentA1 } = await seedAdmin();

    const res = await apiJson<ErrorPayload>(
      apiServer.baseUrl,
      '/api/stats/report?from=2026-11-01&to=2026-11-30',
      studentA1.token
    );
    assert.equal(res.status, 403);
  });
});
