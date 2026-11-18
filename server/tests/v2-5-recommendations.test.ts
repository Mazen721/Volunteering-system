import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import type { AppEnv } from '../src/config/env.js';
import { loadEnv } from '../src/config/env.js';
import type {
  ApprovalMode,
  Faculty,
  InterestKey,
  OpportunityStatus,
  UserRole,
  VolunteerCategory,
} from '../src/constants/enums.js';
import { FACULTIES } from '../src/constants/enums.js';
import { Activity } from '../src/models/Activity.js';
import { Application } from '../src/models/Application.js';
import type { ApplicationLean } from '../src/models/Application.js';
import { Opportunity } from '../src/models/Opportunity.js';
import type { OpportunityLean } from '../src/models/Opportunity.js';
import { Settings } from '../src/models/Settings.js';
import { User } from '../src/models/User.js';
import { Volunteer } from '../src/models/Volunteer.js';
import type { OpportunityDTO } from '../src/services/opportunity.service.js';
import type { StudentApplicationDTO } from '../src/services/application.service.js';
import type { StudentDashboardSummary } from '../src/services/stats.service.js';
import type { PublicUser } from '../src/services/auth.service.js';
import type { ActivityLean } from '../src/models/Activity.js';
import type { TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, readJson, startTestServer } from './helpers.js';

const TEST_DB_NAME = 'volunteer_hours_test_v2_5';
const FACULTY_A = FACULTIES[0];
const FACULTY_B = FACULTIES[1];

interface ErrorResponse {
  message: string;
}

interface OpportunityListResponse {
  opportunities: OpportunityDTO[];
}

interface AuthUserResponse {
  user: PublicUser;
}

interface AuthLoginResponse {
  token: string;
  user: PublicUser;
}

interface StudentApplicationsResponse {
  applications: StudentApplicationDTO[];
}

interface AccountResult {
  id: string;
  token: string;
  user: mongoose.HydratedDocument<{
    email: string;
    passwordHash: string;
    fullName: string;
    role: UserRole;
    faculty: Faculty | null;
    status: string;
    interests: InterestKey[];
    volunteer: mongoose.Types.ObjectId | null;
  }>;
}

interface StudentAccount extends AccountResult {
  volunteer: mongoose.HydratedDocument<{
    volunteerId: string;
    fullName: string;
    category: VolunteerCategory;
    faculty: Faculty;
  }>;
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

async function createAccount(options: {
  email: string;
  role: UserRole;
  faculty: Faculty | null;
  volunteer?: mongoose.Types.ObjectId | null;
  interests?: InterestKey[];
}): Promise<AccountResult> {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const doc = await User.create({
    email: options.email,
    passwordHash,
    fullName: `حساب ${options.role}`,
    role: options.role,
    status: 'active',
    faculty: options.faculty,
    volunteer: options.volunteer ?? null,
    interests: options.interests ?? [],
  });
  return {
    id: doc._id.toString(),
    token: jwt.sign({ sub: doc._id.toString(), role: options.role }, loadEnv().jwtSecret, {
      expiresIn: '1h',
    }),
    user: doc,
  };
}

async function createStudent(options: {
  email: string;
  volunteerId: string;
  faculty: Faculty;
  interests: InterestKey[];
  category?: VolunteerCategory;
}): Promise<StudentAccount> {
  const volunteer = await Volunteer.create({
    volunteerId: options.volunteerId,
    fullName: `متطوع ${options.volunteerId}`,
    category: options.category ?? 'student',
    faculty: options.faculty,
  });
  const account = await createAccount({
    email: options.email,
    role: 'student',
    faculty: options.faculty,
    volunteer: volunteer._id,
    interests: options.interests,
  });
  return { ...account, volunteer };
}

interface SeedOpportunityOverrides {
  title?: string;
  fields?: InterestKey[];
  startAt?: Date;
  endAt?: Date;
  registrationDeadline?: Date;
  slots?: { student: number; academic: number; admin: number };
  acceptedCounts?: { student: number; academic: number; admin: number };
  approvalMode?: ApprovalMode;
  status?: OpportunityStatus;
  faculty?: Faculty | null;
  createdBy: mongoose.Types.ObjectId;
}

async function seedOpportunity(overrides: SeedOpportunityOverrides): Promise<OpportunityLean> {
  const startAt = overrides.startAt ?? hoursFromNow(72);
  const created = await Opportunity.create({
    title: overrides.title ?? 'فرصة تطوعية للاختبار',
    description: 'وصف تفصيلي لفرصة تطوعية مخصصة لاختبارات المرحلة الخامسة',
    requirements: '',
    fields: overrides.fields ?? ['medical'],
    activityType: 'قافلة',
    location: { name: 'مركز خدمة المجتمع', address: 'جامعة المنصورة الأهلية' },
    startAt,
    endAt: overrides.endAt ?? new Date(startAt.getTime() + 2 * 60 * 60 * 1000),
    registrationDeadline: overrides.registrationDeadline ?? hoursFromNow(48),
    hours: 5,
    contactName: 'د. مسؤول الفرصة',
    contactPhone: '01000000000',
    contactEmail: 'opportunity@mnu.edu.eg',
    faculty: overrides.faculty === undefined ? FACULTY_A : overrides.faculty,
    slots: overrides.slots ?? { student: 10, academic: 0, admin: 0 },
    acceptedCounts: overrides.acceptedCounts ?? { student: 0, academic: 0, admin: 0 },
    approvalMode: overrides.approvalMode ?? 'auto',
    status: overrides.status ?? 'published',
    createdBy: overrides.createdBy,
  });
  return created.toObject<OpportunityLean>();
}

async function seedApplication(options: {
  opportunity: OpportunityLean;
  student: StudentAccount;
  status?: ApplicationLean['status'];
  attended?: boolean;
  appliedAt?: Date;
}): Promise<ApplicationLean> {
  const created = await Application.create({
    opportunity: options.opportunity._id,
    volunteer: options.student.volunteer._id,
    user: new mongoose.Types.ObjectId(options.student.id),
    faculty: options.student.volunteer.faculty,
    category: options.student.volunteer.category,
    status: options.status ?? 'pending',
    note: '',
    decidedBy: null,
    decidedAt: null,
    attended: options.attended ?? false,
    checkedInAt: options.attended ? new Date() : null,
    hoursGranted: 0,
    appliedAt: options.appliedAt ?? new Date(),
  });
  return created.toObject<ApplicationLean>();
}

async function seedActivity(options: {
  student: StudentAccount;
  title: string;
  hours: number;
  status: 'pending' | 'approved' | 'rejected';
  date?: Date;
}) {
  const created = await Activity.create({
    volunteer: options.student.volunteer._id,
    title: options.title,
    type: 'قافلة',
    hours: options.hours,
    date: options.date ?? new Date(),
    status: options.status,
    supervisor: 'د. مشرف النشاط',
  });
  return created.toObject<ActivityLean>();
}

describe('Phase V2-5 Recommendations & Student Portal', () => {
  let env: AppEnv;
  let apiServer: TestServer;
  let admin: AccountResult;

  before(async () => {
    env = loadEnv();
    await connectDatabase(buildTestDbUri(env.mongoUri, TEST_DB_NAME));
    assert.equal(mongoose.connection.name, TEST_DB_NAME);
    await mongoose.connection.dropDatabase();
    await Promise.all([
      User.init(),
      Volunteer.init(),
      Activity.init(),
      Opportunity.init(),
      Application.init(),
      Settings.init(),
    ]);

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
    await Promise.all([
      User.deleteMany({}),
      Volunteer.deleteMany({}),
      Activity.deleteMany({}),
      Opportunity.deleteMany({}),
      Application.deleteMany({}),
      Settings.deleteMany({}),
    ]);
    admin = await createAccount({
      email: 'admin@mnu.edu.eg',
      role: 'admin',
      faculty: null,
    });
  });

  it('ranks_recommended_opportunities_with_the_deterministic_formula_and_excludes_ineligible_events', async () => {
    const student = await createStudent({
      email: 'student@mnu.edu.eg',
      volunteerId: '20260001',
      faculty: FACULTY_A,
      interests: ['medical', 'education'],
    });

    const pastMedical = await seedOpportunity({
      title: 'فرصة طبية سابقة',
      fields: ['medical'],
      startAt: hoursFromNow(-96),
      endAt: hoursFromNow(-94),
      registrationDeadline: hoursFromNow(-120),
      status: 'completed',
      createdBy: admin.user._id,
    });
    await seedApplication({
      opportunity: pastMedical,
      student,
      status: 'accepted',
      attended: true,
    });

    const topMatch = await seedOpportunity({
      title: 'قافلة طبية قريبة',
      fields: ['medical'],
      startAt: hoursFromNow(72),
      registrationDeadline: hoursFromNow(48),
      slots: { student: 10, academic: 0, admin: 0 },
      acceptedCounts: { student: 8, academic: 0, admin: 0 },
      createdBy: admin.user._id,
    });
    const educationMatch = await seedOpportunity({
      title: 'مبادرة تعليمية',
      fields: ['education'],
      startAt: hoursFromNow(120),
      registrationDeadline: hoursFromNow(96),
      createdBy: admin.user._id,
    });
    const sportsLate = await seedOpportunity({
      title: 'بطولة رياضية متأخرة',
      fields: ['sports'],
      startAt: hoursFromNow(130),
      registrationDeadline: hoursFromNow(100),
      createdBy: admin.user._id,
    });
    const sportsEarly = await seedOpportunity({
      title: 'بطولة رياضية مبكرة',
      fields: ['sports'],
      startAt: hoursFromNow(110),
      registrationDeadline: hoursFromNow(100),
      createdBy: admin.user._id,
    });
    const fullMatch = await seedOpportunity({
      title: 'فرصة طبية مكتملة العدد',
      fields: ['medical'],
      startAt: hoursFromNow(140),
      registrationDeadline: hoursFromNow(104),
      slots: { student: 2, academic: 0, admin: 0 },
      acceptedCounts: { student: 2, academic: 0, admin: 0 },
      createdBy: admin.user._id,
    });

    const closed = await seedOpportunity({
      title: 'فرصة مغلقة التسجيل',
      fields: ['medical'],
      startAt: hoursFromNow(2),
      endAt: hoursFromNow(4),
      registrationDeadline: hoursFromNow(-1),
      createdBy: admin.user._id,
    });
    const cancelled = await seedOpportunity({
      title: 'فرصة ملغاة',
      fields: ['medical'],
      status: 'cancelled',
      createdBy: admin.user._id,
    });
    const draft = await seedOpportunity({
      title: 'فرصة مسودة',
      fields: ['medical'],
      status: 'draft',
      createdBy: admin.user._id,
    });
    const alreadyApplied = await seedOpportunity({
      title: 'فرصة قدم عليها الطالب',
      fields: ['education'],
      createdBy: admin.user._id,
    });
    await seedApplication({ opportunity: alreadyApplied, student, status: 'pending' });

    const response = await apiJson<OpportunityListResponse>(
      apiServer.baseUrl,
      '/api/opportunities?sort=recommended',
      student.token
    );

    assert.equal(response.status, 200);
    const ranked = response.body.opportunities;
    assert.deepEqual(
      ranked.map((opportunity) => opportunity._id),
      [
        topMatch._id.toString(),
        educationMatch._id.toString(),
        sportsEarly._id.toString(),
        sportsLate._id.toString(),
        fullMatch._id.toString(),
      ]
    );

    const excludedIds = new Set(
      [closed._id, cancelled._id, draft._id, alreadyApplied._id].map(String)
    );
    assert.equal(
      ranked.some((opportunity) => excludedIds.has(opportunity._id.toString())),
      false
    );

    const [first, second, early, late, full] = ranked;
    assert.equal(first.recommendationScore, 17);
    assert.deepEqual(first.matchedFields, ['medical']);
    assert.equal(first.isFull, false);

    assert.equal(second.recommendationScore, 13);
    assert.deepEqual(second.matchedFields, ['education']);

    assert.equal(early.recommendationScore, 3);
    assert.deepEqual(early.matchedFields, []);
    assert.equal(late.recommendationScore, 3);

    assert.equal(full.recommendationScore, 15);
    assert.equal(full.isFull, true);
    assert.equal(full.waitlistAvailable, true);
    assert.equal(full.remainingSlots.student, 0);
    assert.deepEqual(full.matchedFields, ['medical']);
  });

  it('updates_student_interests_and_changes_password_via_patch_auth_me', async () => {
    const student = await createStudent({
      email: 'profile@mnu.edu.eg',
      volunteerId: '20260002',
      faculty: FACULTY_A,
      interests: ['medical'],
    });
    const studentEmail = student.user.email;

    const interestsResponse = await apiJson<AuthUserResponse>(
      apiServer.baseUrl,
      '/api/auth/me',
      student.token,
      {
        method: 'PATCH',
        body: JSON.stringify({ interests: ['sports', 'education', 'sports'] }),
      }
    );
    assert.equal(interestsResponse.status, 200);
    assert.deepEqual(interestsResponse.body.user.interests, ['sports', 'education']);

    const meResponse = await apiJson<AuthUserResponse>(
      apiServer.baseUrl,
      '/api/auth/me',
      student.token
    );
    assert.deepEqual(meResponse.body.user.interests, ['sports', 'education']);

    const wrongPassword = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      '/api/auth/me',
      student.token,
      {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword: 'WrongPassword1!',
          newPassword: 'NewPassword123!',
        }),
      }
    );
    assert.equal(wrongPassword.status, 400);

    const emptyPayload = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      '/api/auth/me',
      student.token,
      { method: 'PATCH', body: JSON.stringify({}) }
    );
    assert.equal(emptyPayload.status, 400);

    const passwordResponse = await apiJson<AuthUserResponse>(
      apiServer.baseUrl,
      '/api/auth/me',
      student.token,
      {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword: 'Password123!',
          newPassword: 'NewPassword123!',
        }),
      }
    );
    assert.equal(passwordResponse.status, 200);

    const loginResponse = await fetch(`${apiServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, password: 'NewPassword123!' }),
    });
    const loginPayload = await readJson<AuthLoginResponse>(loginResponse);
    assert.equal(loginResponse.status, 200);
    assert.equal(loginPayload.user.id, student.id);

    const oldPasswordLogin = await fetch(`${apiServer.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, password: 'Password123!' }),
    });
    assert.equal(oldPasswordLogin.status, 401);
  });

  it('lists_only_the_authenticated_students_applications_with_populated_opportunities', async () => {
    const student = await createStudent({
      email: 'applications@mnu.edu.eg',
      volunteerId: '20260003',
      faculty: FACULTY_A,
      interests: ['medical'],
    });
    const otherStudent = await createStudent({
      email: 'other@mnu.edu.eg',
      volunteerId: '20260004',
      faculty: FACULTY_A,
      interests: ['sports'],
    });

    const firstOpportunity = await seedOpportunity({
      title: 'فرصة الطالب الأولى',
      createdBy: admin.user._id,
    });
    const secondOpportunity = await seedOpportunity({
      title: 'فرصة الطالب الثانية',
      fields: ['education'],
      createdBy: admin.user._id,
    });
    await seedApplication({
      opportunity: firstOpportunity,
      student,
      status: 'accepted',
      appliedAt: new Date('2026-11-01T08:00:00.000Z'),
    });
    await seedApplication({
      opportunity: secondOpportunity,
      student,
      status: 'pending',
      appliedAt: new Date('2026-11-02T08:00:00.000Z'),
    });
    await seedApplication({
      opportunity: firstOpportunity,
      student: otherStudent,
      status: 'pending',
    });

    const response = await apiJson<StudentApplicationsResponse>(
      apiServer.baseUrl,
      '/api/applications/me',
      student.token
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.applications.length, 2);
    assert.equal(response.body.applications[0].opportunity.title, 'فرصة الطالب الثانية');
    assert.equal(response.body.applications[0].status, 'pending');
    assert.equal(response.body.applications[1].opportunity.title, 'فرصة الطالب الأولى');
    assert.equal(response.body.applications[1].status, 'accepted');
    assert.equal(typeof response.body.applications[0].opportunity.phase, 'string');

    const adminResponse = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      '/api/applications/me',
      admin.token
    );
    assert.equal(adminResponse.status, 403);
  });

  it('builds_the_student_dashboard_with_certificate_progress_live_events_and_activities', async () => {
    const student = await createStudent({
      email: 'dashboard@mnu.edu.eg',
      volunteerId: '20260005',
      faculty: FACULTY_A,
      interests: ['medical'],
    });
    await Settings.create({ key: 'global', certificateHours: 12 });

    await seedActivity({
      student,
      title: 'نشاط معتمد',
      hours: 10,
      status: 'approved',
      date: new Date('2026-11-01T09:00:00.000Z'),
    });
    await seedActivity({
      student,
      title: 'نشاط قيد الاعتماد',
      hours: 3,
      status: 'pending',
      date: new Date('2026-11-02T09:00:00.000Z'),
    });

    const upcoming = await seedOpportunity({
      title: 'فرصة قادمة',
      startAt: hoursFromNow(48),
      registrationDeadline: hoursFromNow(24),
      createdBy: admin.user._id,
    });
    const happening = await seedOpportunity({
      title: 'فرصة جارية الآن',
      startAt: hoursFromNow(-1),
      endAt: hoursFromNow(1),
      registrationDeadline: hoursFromNow(-2),
      createdBy: admin.user._id,
    });
    const pendingOpportunity = await seedOpportunity({
      title: 'فرصة بانتظار القرار',
      fields: ['education'],
      createdBy: admin.user._id,
    });
    const pastAttended = await seedOpportunity({
      title: 'فرصة حضرها الطالب',
      startAt: hoursFromNow(-120),
      endAt: hoursFromNow(-118),
      registrationDeadline: hoursFromNow(-130),
      status: 'completed',
      createdBy: admin.user._id,
    });

    await seedApplication({ opportunity: upcoming, student, status: 'accepted' });
    await seedApplication({ opportunity: happening, student, status: 'accepted' });
    await seedApplication({ opportunity: pendingOpportunity, student, status: 'pending' });
    await seedApplication({
      opportunity: pastAttended,
      student,
      status: 'accepted',
      attended: true,
    });

    const response = await apiJson<StudentDashboardSummary>(
      apiServer.baseUrl,
      '/api/stats/me',
      student.token
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.approvedHours, 10);
    assert.equal(response.body.pendingHours, 3);
    assert.equal(response.body.certificateHours, 12);
    assert.equal(response.body.remainingHours, 2);
    assert.equal(response.body.eligible, false);
    assert.equal(response.body.eventsAttended, 1);
    assert.equal(response.body.happeningNow.length, 1);
    assert.equal(response.body.happeningNow[0].title, 'فرصة جارية الآن');
    assert.equal(response.body.upcomingAccepted.length, 1);
    assert.equal(response.body.upcomingAccepted[0].title, 'فرصة قادمة');
    assert.equal(response.body.activeApplications.length, 4);
    assert.equal(response.body.recentActivities.length, 2);
    assert.equal(response.body.recentActivities[0].title, 'نشاط قيد الاعتماد');

    await Settings.findOneAndUpdate(
      { key: 'global' },
      { $set: { certificateHours: 10 } },
      { upsert: true }
    );
    const eligibleResponse = await apiJson<StudentDashboardSummary>(
      apiServer.baseUrl,
      '/api/stats/me',
      student.token
    );
    assert.equal(eligibleResponse.body.remainingHours, 0);
    assert.equal(eligibleResponse.body.eligible, true);
  });

  it('denies_students_access_to_certificate_and_admin_management_endpoints', async () => {
    const student = await createStudent({
      email: 'certificate@mnu.edu.eg',
      volunteerId: '20260006',
      faculty: FACULTY_A,
      interests: ['medical'],
    });

    const volunteerResponse = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/volunteers/${student.volunteer.volunteerId}`,
      student.token
    );
    assert.equal(volunteerResponse.status, 403);

    const settingsResponse = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      '/api/settings',
      student.token
    );
    assert.equal(settingsResponse.status, 403);

    const facultyFiltered = await seedOpportunity({
      title: 'فرصة كلية أخرى',
      faculty: FACULTY_B,
      createdBy: admin.user._id,
    });
    const hiddenResponse = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${facultyFiltered._id}`,
      student.token
    );
    assert.equal(hiddenResponse.status, 404);
  });
});
