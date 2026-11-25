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

const TEST_DB_NAME = 'volunteer_hours_test_phase9_report';
const FACULTY_A = FACULTIES[0];
const FACULTY_B = FACULTIES[1];

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

async function seedReportFixture(adminId: mongoose.Types.ObjectId) {
  await Settings.findOneAndUpdate(
    { key: 'global' },
    { $set: { certificateHours: 30 } },
    { upsert: true }
  );

  const [volA1, volA2, volA3, volB1] = await Volunteer.create([
    { volunteerId: 'A-901', fullName: 'سارة أحمد', category: 'student', faculty: FACULTY_A },
    { volunteerId: 'A-902', fullName: 'كريم محمود', category: 'student', faculty: FACULTY_A },
    { volunteerId: 'A-903', fullName: 'ندى حسن', category: 'student', faculty: FACULTY_A },
    { volunteerId: 'B-901', fullName: 'يوسف سامي', category: 'student', faculty: FACULTY_B },
  ]);

  const studentA1 = await createAccount({
    email: 'a901@mnu.edu.eg',
    role: 'student',
    faculty: FACULTY_A,
    volunteer: volA1._id,
  });
  const studentA2 = await createAccount({
    email: 'a902@mnu.edu.eg',
    role: 'student',
    faculty: FACULTY_A,
    volunteer: volA2._id,
  });
  const studentA3 = await createAccount({
    email: 'a903@mnu.edu.eg',
    role: 'student',
    faculty: FACULTY_A,
    volunteer: volA3._id,
  });
  const studentB1 = await createAccount({
    email: 'b901@mnu.edu.eg',
    role: 'student',
    faculty: FACULTY_B,
    volunteer: volB1._id,
  });

  await Activity.create([
    {
      volunteer: volA1._id,
      title: 'قافلة طب أ',
      type: 'قافلة',
      hours: 35,
      date: new Date('2026-11-02T10:00:00.000Z'),
      status: 'approved',
      supervisor: 'د. محمد',
    },
    {
      volunteer: volA2._id,
      title: 'مبادرة أ',
      type: 'مبادرة',
      hours: 10,
      date: new Date('2026-11-04T10:00:00.000Z'),
      status: 'approved',
      supervisor: 'د. سلمى',
    },
    {
      volunteer: volB1._id,
      title: 'حملة أسنان ب',
      type: 'حملة توعية',
      hours: 40,
      date: new Date('2026-11-03T10:00:00.000Z'),
      status: 'approved',
      supervisor: 'د. هاني',
    },
  ]);

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
  const [oppA, oppB, oppGlobal] = await Opportunity.create([
    {
      ...base,
      title: 'قافلة كلية الطب المكتملة',
      fields: ['medical', 'education'],
      activityType: 'قافلة',
      startAt: new Date('2026-11-01T09:00:00.000Z'),
      endAt: new Date('2026-11-01T15:00:00.000Z'),
      registrationDeadline: new Date('2026-10-30T09:00:00.000Z'),
      faculty: FACULTY_A,
      slots: { student: 3, academic: 1, admin: 0 },
      acceptedCounts: { student: 2, academic: 0, admin: 0 },
      status: 'completed',
    },
    {
      ...base,
      title: 'عيادة الأسنان الميدانية',
      fields: ['medical'],
      activityType: 'قافلة',
      startAt: new Date('2026-12-01T09:00:00.000Z'),
      endAt: new Date('2026-12-01T15:00:00.000Z'),
      registrationDeadline: new Date('2026-11-29T09:00:00.000Z'),
      faculty: FACULTY_B,
      slots: { student: 2, academic: 0, admin: 0 },
      acceptedCounts: { student: 1, academic: 0, admin: 0 },
      status: 'published',
    },
    {
      ...base,
      title: 'حملة الجامعة العامة',
      fields: ['charity_community'],
      activityType: 'حملة توعية',
      startAt: new Date('2026-12-05T09:00:00.000Z'),
      endAt: new Date('2026-12-05T15:00:00.000Z'),
      registrationDeadline: new Date('2026-12-03T09:00:00.000Z'),
      faculty: null,
      slots: { student: 10, academic: 0, admin: 0 },
      acceptedCounts: { student: 1, academic: 0, admin: 0 },
      status: 'published',
    },
  ]);

  await Application.create([
    {
      opportunity: oppA._id,
      volunteer: volA1._id,
      user: studentA1.objectId,
      faculty: FACULTY_A,
      category: 'student',
      status: 'accepted',
      attended: true,
      hoursGranted: 6,
    },
    {
      opportunity: oppA._id,
      volunteer: volA2._id,
      user: studentA2.objectId,
      faculty: FACULTY_A,
      category: 'student',
      status: 'accepted',
      attended: false,
    },
    {
      opportunity: oppA._id,
      volunteer: volA3._id,
      user: studentA3.objectId,
      faculty: FACULTY_A,
      category: 'student',
      status: 'rejected',
      attended: false,
    },
    {
      opportunity: oppB._id,
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
      status: 'accepted',
      attended: false,
    },
    {
      opportunity: oppGlobal._id,
      volunteer: volB1._id,
      user: studentB1.objectId,
      faculty: FACULTY_B,
      category: 'student',
      status: 'pending',
      attended: false,
    },
  ]);

  return { studentA1 };
}

describe('Phase 9 PDF Report Data & Scoping', () => {
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

  it('builds_a_university_wide_report_for_admin_with_charts_and_opportunity_rows', async () => {
    const admin = await createAccount({
      email: 'admin.p9@mnu.edu.eg',
      role: 'admin',
      faculty: null,
    });
    await seedReportFixture(admin.objectId);

    const res = await apiJson<VolunteeringReport>(
      apiServer.baseUrl,
      '/api/stats/report',
      admin.token
    );
    assert.equal(res.status, 200);
    const report = res.body;

    assert.equal(report.meta.scope, 'university');
    assert.equal(report.meta.faculty, null);
    assert.equal(report.meta.generatedBy.role, 'admin');
    assert.equal(report.overview.registeredVolunteers, 4);
    assert.equal(report.overview.totalApprovedHours, 85);
    assert.equal(report.overview.eligibleVolunteers, 2);
    assert.equal(report.faculties.faculties.length, FACULTIES.length);
    assert.equal(report.faculties.totals.volunteerCount, 4);

    assert.equal(report.summary.totalOpportunities, 3);
    assert.equal(report.summary.totalApplications, 6);
    assert.equal(report.summary.approvalRate, 66.7);
    assert.equal(report.summary.attendanceRate, 50);

    const medical = report.interests.find((row) => row.field === 'medical');
    assert.equal(medical?.opportunitiesCount, 2);
    const charity = report.interests.find((row) => row.field === 'charity_community');
    assert.equal(charity?.opportunitiesCount, 1);

    const completed = report.opportunityStatuses.find((row) => row.status === 'completed');
    const published = report.opportunityStatuses.find((row) => row.status === 'published');
    assert.equal(completed?.count, 1);
    assert.equal(published?.count, 2);

    const oppA = report.opportunities.find((row) => row.title === 'قافلة كلية الطب المكتملة');
    assert.ok(oppA);
    assert.equal(oppA.applicationsCount, 3);
    assert.equal(oppA.acceptedCount, 2);
    assert.equal(oppA.attendedCount, 1);
    assert.equal(oppA.fillRate, 50);
    assert.equal(oppA.attendanceRate, 50);

    assert.equal(report.leaderboard.leaderboard[0].fullName, 'يوسف سامي');
    assert.equal(report.leaderboard.leaderboard[0].approvedHours, 40);
    assert.ok(report.monthlyHours.months.length >= 1);
  });

  it('forces_dean_report_to_his_faculty_even_with_a_spoofed_faculty_query', async () => {
    const admin = await createAccount({
      email: 'admin.p9b@mnu.edu.eg',
      role: 'admin',
      faculty: null,
    });
    const deanA = await createAccount({
      email: 'dean.a.p9@mnu.edu.eg',
      role: 'dean',
      faculty: FACULTY_A,
    });
    await seedReportFixture(admin.objectId);

    const [deanRes, adminFilteredRes] = await Promise.all([
      apiJson<VolunteeringReport>(
        apiServer.baseUrl,
        `/api/stats/report?faculty=${encodeURIComponent(FACULTY_B)}`,
        deanA.token
      ),
      apiJson<VolunteeringReport>(
        apiServer.baseUrl,
        `/api/stats/report?faculty=${encodeURIComponent(FACULTY_A)}`,
        admin.token
      ),
    ]);

    assert.equal(deanRes.status, 200);
    const report = deanRes.body;
    assert.equal(report.meta.scope, 'faculty');
    assert.equal(report.meta.faculty, FACULTY_A);
    assert.equal(report.overview.registeredVolunteers, 3);
    assert.equal(report.overview.totalApprovedHours, 45);
    assert.equal(report.faculties.faculties.length, 1);
    assert.equal(report.faculties.faculties[0].faculty, FACULTY_A);
    assert.equal(report.summary.totalOpportunities, 1);
    assert.deepEqual(
      report.opportunities.map((row) => row.title),
      ['قافلة كلية الطب المكتملة']
    );

    // Identical to the admin's report explicitly filtered to the same faculty.
    assert.deepEqual(report.overview, adminFilteredRes.body.overview);
    assert.deepEqual(report.faculties, adminFilteredRes.body.faculties);
    assert.deepEqual(report.leaderboard, adminFilteredRes.body.leaderboard);
    assert.deepEqual(report.opportunities, adminFilteredRes.body.opportunities);

    // No trace of the other faculty anywhere in the payload.
    const serialized = JSON.stringify(report);
    assert.equal(serialized.includes(FACULTY_B), false);
    assert.equal(serialized.includes('يوسف سامي'), false);
    assert.equal(serialized.includes('عيادة الأسنان الميدانية'), false);
  });

  it('blocks_students_from_the_report_endpoint_with_403', async () => {
    const admin = await createAccount({
      email: 'admin.p9c@mnu.edu.eg',
      role: 'admin',
      faculty: null,
    });
    const { studentA1 } = await seedReportFixture(admin.objectId);

    const res = await apiJson<ErrorPayload>(
      apiServer.baseUrl,
      '/api/stats/report',
      studentA1.token
    );
    assert.equal(res.status, 403);
  });
});
