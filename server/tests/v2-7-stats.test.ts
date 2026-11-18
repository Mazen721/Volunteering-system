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
import { cairoLocalToUtc, getCairoDateTimeParts } from '../src/utils/cairoTime.js';
import type {
  CategoryStatsResponse,
  EventStatsResponse,
  FacultyStatsResponse,
  LeaderboardResponse,
  MonthlyHoursResponse,
  OverviewStats,
  ParticipationStatsResponse,
} from '../src/services/stats.service.js';
import type { TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, startTestServer } from './helpers.js';

const TEST_DB_NAME = 'volunteer_hours_test_v2_7';
const FACULTY_A = FACULTIES[0];
const FACULTY_B = FACULTIES[1];

interface ErrorPayload {
  message: string;
}

async function createAccount(options: {
  email: string;
  role: UserRole;
  faculty: Faculty | null;
  status?: 'active' | 'pending';
  volunteer?: mongoose.Types.ObjectId | null;
  registrationFaculty?: Faculty;
  volunteerId?: string;
}) {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const doc = await User.create({
    email: options.email,
    passwordHash,
    fullName: `مستخدم ${options.role}`,
    role: options.role,
    status: options.status ?? 'active',
    faculty: options.faculty,
    volunteer: options.volunteer ?? null,
    registration: options.registrationFaculty
      ? {
          volunteerId: options.volunteerId ?? 'REG-1',
          category: 'student',
          faculty: options.registrationFaculty,
          facultyMismatch: false,
        }
      : null,
  });

  return {
    id: doc._id.toString(),
    objectId: doc._id,
    token: jwt.sign({ sub: doc._id.toString(), role: options.role }, loadEnv().jwtSecret, {
      expiresIn: '1h',
    }),
  };
}

async function seedAnalyticsFixture(adminId: mongoose.Types.ObjectId) {
  await Settings.findOneAndUpdate(
    { key: 'global' },
    { $set: { certificateHours: 24 } },
    { upsert: true }
  );

  // Faculty A volunteers covering all 4 certificate buckets (C = 24 -> 2/3 C = 16):
  // A1: 26h (eligible >= 24), A2: 18h (nearEligible 16..23), A3: 10h (inProgress 1..15), A4: 0h (pending-only)
  const [volA1, volA2, volA3, volA4, volB1, volB2] = await Volunteer.create([
    { volunteerId: 'A-701', fullName: 'سارة أحمد', category: 'student', faculty: FACULTY_A },
    { volunteerId: 'A-702', fullName: 'كريم محمود', category: 'student', faculty: FACULTY_A },
    { volunteerId: 'A-703', fullName: 'ندى حسن', category: 'academic', faculty: FACULTY_A },
    { volunteerId: 'A-704', fullName: 'رامي طارق', category: 'student', faculty: FACULTY_A },
    { volunteerId: 'B-701', fullName: 'يوسف سامي', category: 'student', faculty: FACULTY_B },
    { volunteerId: 'B-702', fullName: 'مريم عادل', category: 'admin', faculty: FACULTY_B },
  ]);

  const studentA1 = await createAccount({
    email: 'a701@mnu.edu.eg',
    role: 'student',
    faculty: FACULTY_A,
    volunteer: volA1._id,
  });
  const studentA2 = await createAccount({
    email: 'a702@mnu.edu.eg',
    role: 'student',
    faculty: FACULTY_A,
    volunteer: volA2._id,
  });
  const studentA3 = await createAccount({
    email: 'a703@mnu.edu.eg',
    role: 'student',
    faculty: FACULTY_A,
    volunteer: volA3._id,
  });
  const studentA4 = await createAccount({
    email: 'a704@mnu.edu.eg',
    role: 'student',
    faculty: FACULTY_A,
    volunteer: volA4._id,
  });
  const studentB1 = await createAccount({
    email: 'b701@mnu.edu.eg',
    role: 'student',
    faculty: FACULTY_B,
    volunteer: volB1._id,
  });

  await createAccount({
    email: 'pending.a@mnu.edu.eg',
    role: 'student',
    faculty: null,
    status: 'pending',
    registrationFaculty: FACULTY_A,
    volunteerId: 'A-PENDING-1',
  });
  await createAccount({
    email: 'pending.b@mnu.edu.eg',
    role: 'student',
    faculty: null,
    status: 'pending',
    registrationFaculty: FACULTY_B,
    volunteerId: 'B-PENDING-1',
  });

  await Activity.create([
    {
      volunteer: volA1._id,
      title: 'قافلة أكتوبر',
      type: 'قافلة',
      hours: 26,
      date: new Date('2026-10-12T10:00:00.000Z'),
      status: 'approved',
      supervisor: 'د. محمد',
    },
    {
      volunteer: volA2._id,
      title: 'مبادرة نوفمبر',
      type: 'مبادرة',
      hours: 18,
      date: new Date('2026-11-05T10:00:00.000Z'),
      status: 'approved',
      supervisor: 'د. سلمى',
    },
    {
      volunteer: volA3._id,
      title: 'ندوة طبية',
      type: 'ندوة',
      hours: 10,
      date: new Date('2026-11-10T10:00:00.000Z'),
      status: 'approved',
      supervisor: 'د. علا',
    },
    {
      volunteer: volA4._id,
      title: 'نشاط قيد المراجعة',
      type: 'مبادرة',
      hours: 12,
      date: new Date('2026-11-12T10:00:00.000Z'),
      status: 'pending',
      supervisor: 'د. علا',
    },
    {
      volunteer: volB1._id,
      title: 'حملة أسنان',
      type: 'حملة توعية',
      hours: 30,
      date: new Date('2026-11-03T10:00:00.000Z'),
      status: 'approved',
      supervisor: 'د. هاني',
    },
  ]);

  const now = Date.now();
  const cairoNow = getCairoDateTimeParts(new Date(now));
  const monthStartMs = cairoLocalToUtc({
    year: cairoNow.year,
    month: cairoNow.month,
    day: 1,
    hour: 0,
    minute: 5,
    second: 0,
  }).getTime();
  const nextMonthYear = cairoNow.month === 12 ? cairoNow.year + 1 : cairoNow.year;
  const nextMonthNum = cairoNow.month === 12 ? 1 : cairoNow.month + 1;
  const monthEndMs = cairoLocalToUtc({
    year: nextMonthYear,
    month: nextMonthNum,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0,
  }).getTime();
  const completedStartA = Math.min(monthStartMs, now - 4 * 60 * 60 * 1000);
  const activeStartA = Math.min(now + 2 * 60 * 60 * 1000, monthEndMs - 30 * 60 * 1000);

  const [completedOppA, activeOppA, completedOppB] = await Opportunity.create([
    {
      title: 'قافلة الطب المكتملة',
      description: 'قافلة طبية لخدمة المجتمع',
      requirements: '',
      fields: ['medical'],
      activityType: 'قافلة',
      location: { name: 'المركز الطبي', address: 'المنصورة' },
      startAt: new Date(completedStartA),
      endAt: new Date(completedStartA + 60 * 60 * 1000),
      registrationDeadline: new Date(completedStartA - 60 * 60 * 1000),
      hours: 6,
      contactName: 'د. أحمد',
      contactPhone: '01000000001',
      contactEmail: 'oppA1@mnu.edu.eg',
      faculty: FACULTY_A,
      slots: { student: 3, academic: 1, admin: 0 },
      acceptedCounts: { student: 2, academic: 1, admin: 0 },
      approvalMode: 'manual',
      status: 'completed',
      createdBy: adminId,
    },
    {
      title: 'مبادرة التوعية الجارية',
      description: 'مبادرة توعوية لطلبة الكلية',
      requirements: '',
      fields: ['awareness_campaigns'],
      activityType: 'حملة توعية',
      location: { name: 'المدرج الرئيسي', address: 'جامعة المنصورة الأهلية' },
      startAt: new Date(activeStartA),
      endAt: new Date(activeStartA + 2 * 60 * 60 * 1000),
      registrationDeadline: new Date(activeStartA - 15 * 60 * 1000),
      hours: 3,
      contactName: 'د. نادر',
      contactPhone: '01000000002',
      contactEmail: 'oppA2@mnu.edu.eg',
      faculty: FACULTY_A,
      slots: { student: 4, academic: 0, admin: 0 },
      acceptedCounts: { student: 1, academic: 0, admin: 0 },
      approvalMode: 'manual',
      status: 'published',
      createdBy: adminId,
    },
    {
      title: 'عيادة الأسنان الميدانية',
      description: 'فعالية كلية طب الأسنان',
      requirements: '',
      fields: ['medical'],
      activityType: 'قافلة',
      location: { name: 'مقر الكلية', address: 'المنصورة' },
      startAt: new Date(completedStartA),
      endAt: new Date(completedStartA + 60 * 60 * 1000),
      registrationDeadline: new Date(completedStartA - 60 * 60 * 1000),
      hours: 5,
      contactName: 'د. كريم',
      contactPhone: '01000000003',
      contactEmail: 'oppB1@mnu.edu.eg',
      faculty: FACULTY_B,
      slots: { student: 2, academic: 0, admin: 0 },
      acceptedCounts: { student: 1, academic: 0, admin: 0 },
      approvalMode: 'auto',
      status: 'completed',
      createdBy: adminId,
    },
  ]);

  await Application.create([
    // Completed Opportunity A: 3 accepted (2 attended, 1 no-show), 1 rejected
    {
      opportunity: completedOppA._id,
      volunteer: volA1._id,
      user: studentA1.objectId,
      faculty: FACULTY_A,
      category: 'student',
      status: 'accepted',
      attended: true,
      hoursGranted: 6,
    },
    {
      opportunity: completedOppA._id,
      volunteer: volA3._id,
      user: studentA3.objectId,
      faculty: FACULTY_A,
      category: 'academic',
      status: 'accepted',
      attended: true,
      hoursGranted: 6,
    },
    {
      opportunity: completedOppA._id,
      volunteer: volA2._id,
      user: studentA2.objectId,
      faculty: FACULTY_A,
      category: 'student',
      status: 'accepted',
      attended: false,
      hoursGranted: 0,
    },
    {
      opportunity: completedOppA._id,
      volunteer: volA4._id,
      user: studentA4.objectId,
      faculty: FACULTY_A,
      category: 'student',
      status: 'rejected',
      attended: false,
    },
    // Published Opportunity A: 1 accepted (not yet completed -> NOT a no-show), 1 pending
    {
      opportunity: activeOppA._id,
      volunteer: volA1._id,
      user: studentA1.objectId,
      faculty: FACULTY_A,
      category: 'student',
      status: 'accepted',
      attended: false,
    },
    {
      opportunity: activeOppA._id,
      volunteer: volA4._id,
      user: studentA4.objectId,
      faculty: FACULTY_A,
      category: 'student',
      status: 'pending',
      attended: false,
    },
    // Completed Opportunity B: 1 accepted & attended
    {
      opportunity: completedOppB._id,
      volunteer: volB1._id,
      user: studentB1.objectId,
      faculty: FACULTY_B,
      category: 'student',
      status: 'accepted',
      attended: true,
      hoursGranted: 5,
    },
  ]);

  return { studentA1, volA4, volB2 };
}

describe('Phase V2-7 Role-Based Analytics & Consistency', () => {
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

  it('matches_dean_faculty_x_analytics_identically_to_admin_filtered_faculty_x_across_all_endpoints', async () => {
    const admin = await createAccount({
      email: 'admin.v27@mnu.edu.eg',
      role: 'admin',
      faculty: null,
    });
    const deanA = await createAccount({
      email: 'dean.a.v27@mnu.edu.eg',
      role: 'dean',
      faculty: FACULTY_A,
    });
    await seedAnalyticsFixture(admin.objectId);

    const encodedFacultyA = encodeURIComponent(FACULTY_A);
    const ignoredSpoofedQuery = encodeURIComponent(FACULTY_B);

    const [
      deanOverview,
      adminOverviewA,
      deanFaculties,
      adminFacultiesA,
      deanCategories,
      adminCategoriesA,
      deanLeaderboard,
      adminLeaderboardA,
      deanParticipation,
      adminParticipationA,
      deanEvents,
      adminEventsA,
      deanMonthly,
      adminMonthlyA,
    ] = await Promise.all([
      apiJson<OverviewStats>(
        apiServer.baseUrl,
        `/api/stats/overview?faculty=${ignoredSpoofedQuery}`,
        deanA.token
      ),
      apiJson<OverviewStats>(
        apiServer.baseUrl,
        `/api/stats/overview?faculty=${encodedFacultyA}`,
        admin.token
      ),
      apiJson<FacultyStatsResponse>(apiServer.baseUrl, '/api/stats/faculties', deanA.token),
      apiJson<FacultyStatsResponse>(
        apiServer.baseUrl,
        `/api/stats/faculties?faculty=${encodedFacultyA}`,
        admin.token
      ),
      apiJson<CategoryStatsResponse>(apiServer.baseUrl, '/api/stats/categories', deanA.token),
      apiJson<CategoryStatsResponse>(
        apiServer.baseUrl,
        `/api/stats/categories?faculty=${encodedFacultyA}`,
        admin.token
      ),
      apiJson<LeaderboardResponse>(apiServer.baseUrl, '/api/stats/leaderboard', deanA.token),
      apiJson<LeaderboardResponse>(
        apiServer.baseUrl,
        `/api/stats/leaderboard?faculty=${encodedFacultyA}`,
        admin.token
      ),
      apiJson<ParticipationStatsResponse>(
        apiServer.baseUrl,
        `/api/stats/participation?faculty=${ignoredSpoofedQuery}`,
        deanA.token
      ),
      apiJson<ParticipationStatsResponse>(
        apiServer.baseUrl,
        `/api/stats/participation?faculty=${encodedFacultyA}`,
        admin.token
      ),
      apiJson<EventStatsResponse>(
        apiServer.baseUrl,
        `/api/stats/events?faculty=${ignoredSpoofedQuery}`,
        deanA.token
      ),
      apiJson<EventStatsResponse>(
        apiServer.baseUrl,
        `/api/stats/events?faculty=${encodedFacultyA}`,
        admin.token
      ),
      apiJson<MonthlyHoursResponse>(
        apiServer.baseUrl,
        `/api/stats/monthly-hours?faculty=${ignoredSpoofedQuery}`,
        deanA.token
      ),
      apiJson<MonthlyHoursResponse>(
        apiServer.baseUrl,
        `/api/stats/monthly-hours?faculty=${encodedFacultyA}`,
        admin.token
      ),
    ]);

    assert.equal(deanOverview.status, 200);
    assert.deepEqual(deanOverview.body, adminOverviewA.body);
    assert.deepEqual(deanFaculties.body, adminFacultiesA.body);
    assert.deepEqual(deanCategories.body, adminCategoriesA.body);
    assert.deepEqual(deanLeaderboard.body, adminLeaderboardA.body);
    assert.deepEqual(deanParticipation.body, adminParticipationA.body);
    assert.deepEqual(deanEvents.body, adminEventsA.body);
    assert.deepEqual(deanMonthly.body, adminMonthlyA.body);
  });

  it('computes_dynamic_certificate_buckets_participation_funnel_event_efficiency_and_monthly_hours', async () => {
    const admin = await createAccount({
      email: 'admin.metrics@mnu.edu.eg',
      role: 'admin',
      faculty: null,
    });
    const deanA = await createAccount({
      email: 'dean.metrics@mnu.edu.eg',
      role: 'dean',
      faculty: FACULTY_A,
    });
    const { studentA1, volA4 } = await seedAnalyticsFixture(admin.objectId);

    const [overviewRes, participationRes, eventsRes, monthlyRes, adminOverviewRes] =
      await Promise.all([
        apiJson<OverviewStats>(apiServer.baseUrl, '/api/stats/overview', deanA.token),
        apiJson<ParticipationStatsResponse>(
          apiServer.baseUrl,
          '/api/stats/participation',
          deanA.token
        ),
        apiJson<EventStatsResponse>(apiServer.baseUrl, '/api/stats/events', deanA.token),
        apiJson<MonthlyHoursResponse>(apiServer.baseUrl, '/api/stats/monthly-hours', deanA.token),
        apiJson<OverviewStats>(apiServer.baseUrl, '/api/stats/overview', admin.token),
      ]);

    // Dynamic threshold C = 24 -> buckets: eligible=1 (26h), nearEligible=1 (18h), inProgress=1 (10h), zeroHours=1 (pending-only)
    assert.equal(overviewRes.body.certificateHours, 24);
    assert.equal(overviewRes.body.registeredVolunteers, 4);
    assert.equal(overviewRes.body.activeVolunteers, 3);
    assert.equal(overviewRes.body.pendingRegistrations, 1);
    assert.equal(overviewRes.body.pendingApplications, 1);
    assert.equal(overviewRes.body.eventsThisMonth, 2);
    assert.deepEqual(overviewRes.body.certificateBuckets, {
      eligible: 1,
      nearEligible: 1,
      inProgress: 1,
      zeroHours: 1,
    });
    assert.equal(overviewRes.body.zeroHourVolunteers.length, 1);
    assert.equal(overviewRes.body.zeroHourVolunteers[0].volunteerId, volA4.volunteerId);

    // University-wide overview totals across both faculties
    assert.equal(adminOverviewRes.body.registeredVolunteers, 6);
    assert.equal(adminOverviewRes.body.pendingRegistrations, 2);
    assert.equal(adminOverviewRes.body.eventsThisMonth, 3);

    // Participation funnel math: applied >= accepted >= attended
    const { funnel, engagement } = participationRes.body;
    assert.equal(funnel.applied, 6);
    assert.equal(funnel.accepted, 4);
    assert.equal(funnel.attended, 2);
    assert.equal(funnel.rejected, 1);
    assert.equal(funnel.noShow, 1); // Only completed opportunity's unattended accepted applicant
    assert.ok(funnel.applied >= funnel.accepted && funnel.accepted >= funnel.attended);
    assert.deepEqual(engagement, { joined: 3, zeroHours: 1 });
    assert.equal(engagement.joined + engagement.zeroHours, overviewRes.body.registeredVolunteers);

    // Event efficiency: completedOppA (4 slots, 3 accepted -> 75% fill, 1/3 noShow -> 33.3%)
    assert.equal(eventsRes.body.summary.totalEvents, 2);
    assert.equal(eventsRes.body.summary.completedCount, 1);
    assert.equal(eventsRes.body.topEvents[0].title, 'قافلة الطب المكتملة');
    assert.equal(eventsRes.body.completedEvents[0].fillRate, 75);
    assert.equal(eventsRes.body.completedEvents[0].noShowRate, 33.3);

    // Monthly approved hours: pending activity for A-704 excluded; grouped by Cairo month
    assert.deepEqual(
      monthlyRes.body.months.map((entry) => ({
        month: entry.month,
        approvedHours: entry.approvedHours,
        approvedActivities: entry.approvedActivities,
      })),
      [
        { month: '2026-10', approvedHours: 26, approvedActivities: 1 },
        { month: '2026-11', approvedHours: 28, approvedActivities: 2 },
      ]
    );
    assert.ok(monthlyRes.body.months.every((entry) => /[\u0600-\u06FF]/.test(entry.label)));

    // Role & invalid faculty query validation
    const [studentRes, invalidFacultyRes] = await Promise.all([
      apiJson<ErrorPayload>(apiServer.baseUrl, '/api/stats/participation', studentA1.token),
      apiJson<ErrorPayload>(
        apiServer.baseUrl,
        '/api/stats/events?faculty=كلية%20غير%20موجودة',
        admin.token
      ),
    ]);
    assert.equal(studentRes.status, 403);
    assert.equal(invalidFacultyRes.status, 400);
  });
});
