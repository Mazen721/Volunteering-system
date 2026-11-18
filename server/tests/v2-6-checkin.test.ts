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
  Faculty,
  OpportunityStatus,
  UserRole,
  VolunteerCategory,
} from '../src/constants/enums.js';
import { FACULTIES } from '../src/constants/enums.js';
import { Activity } from '../src/models/Activity.js';
import type { ActivityLean } from '../src/models/Activity.js';
import { Application } from '../src/models/Application.js';
import type { ApplicationLean } from '../src/models/Application.js';
import { Opportunity } from '../src/models/Opportunity.js';
import type { OpportunityLean } from '../src/models/Opportunity.js';
import { Settings } from '../src/models/Settings.js';
import { User } from '../src/models/User.js';
import { Volunteer } from '../src/models/Volunteer.js';
import type {
  CheckInTokenResult,
  CompleteOpportunityResult,
  LiveOpportunityState,
} from '../src/services/checkin.service.js';
import type { TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, startTestServer } from './helpers.js';

const TEST_DB_NAME = 'volunteer_hours_test_v2_6';
const FACULTY_A = FACULTIES[0];
const FACULTY_B = FACULTIES[1];

interface ErrorResponse {
  message: string;
}

interface ApplicationResponse {
  application: ApplicationLean;
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

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

async function createAccount(options: {
  email: string;
  role: UserRole;
  faculty: Faculty | null;
  volunteer?: mongoose.Types.ObjectId | null;
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
}): Promise<StudentAccount> {
  const volunteer = await Volunteer.create({
    volunteerId: options.volunteerId,
    fullName: `متطوع ${options.volunteerId}`,
    category: 'student',
    faculty: options.faculty,
  });
  const account = await createAccount({
    email: options.email,
    role: 'student',
    faculty: options.faculty,
    volunteer: volunteer._id,
  });
  return { ...account, volunteer };
}

async function seedOpportunity(options: {
  createdBy: mongoose.Types.ObjectId;
  faculty?: Faculty | null;
  startAt: Date;
  endAt: Date;
  registrationDeadline: Date;
  status?: OpportunityStatus;
  hours?: number;
}): Promise<OpportunityLean> {
  const created = await Opportunity.create({
    title: 'فعالية تطوعية ميدانية',
    description: 'وصف تفصيلي لفعالية تطوعية لاختبار تسجيل الحضور وإتمام الساعات',
    requirements: '',
    fields: ['medical'],
    activityType: 'قافلة',
    location: { name: 'المركز الطبي الجامعي', address: 'جامعة المنصورة الأهلية' },
    startAt: options.startAt,
    endAt: options.endAt,
    registrationDeadline: options.registrationDeadline,
    hours: options.hours ?? 6,
    contactName: 'د. مسؤول الحضور',
    contactPhone: '01000000000',
    contactEmail: 'live@mnu.edu.eg',
    faculty: options.faculty === undefined ? FACULTY_A : options.faculty,
    slots: { student: 10, academic: 0, admin: 0 },
    acceptedCounts: { student: 0, academic: 0, admin: 0 },
    approvalMode: 'auto',
    status: options.status ?? 'published',
    createdBy: options.createdBy,
  });
  return created.toObject<OpportunityLean>();
}

async function seedApplication(options: {
  opportunity: OpportunityLean;
  student: StudentAccount;
  status: ApplicationLean['status'];
  attended?: boolean;
}): Promise<ApplicationLean> {
  const created = await Application.create({
    opportunity: options.opportunity._id,
    volunteer: options.student.volunteer._id,
    user: options.student.user._id,
    faculty: options.student.volunteer.faculty,
    category: options.student.volunteer.category,
    status: options.status,
    note: '',
    decidedBy: null,
    decidedAt: null,
    attended: options.attended ?? false,
    checkedInAt: options.attended ? new Date() : null,
    hoursGranted: 0,
    appliedAt: new Date(),
  });
  return created.toObject<ApplicationLean>();
}

describe('Phase V2-6 Live Check-in & Idempotent Completion', () => {
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

  it('allows_accepted_student_to_check_in_within_cairo_30m_window_and_blocks_token_as_auth', async () => {
    const dean = await createAccount({
      email: 'dean.a@mnu.edu.eg',
      role: 'dean',
      faculty: FACULTY_A,
    });
    const student = await createStudent({
      email: 'student1@mnu.edu.eg',
      volunteerId: '20260101',
      faculty: FACULTY_A,
    });
    const opportunity = await seedOpportunity({
      createdBy: dean.user._id,
      faculty: FACULTY_A,
      startAt: minutesFromNow(20),
      endAt: minutesFromNow(140),
      registrationDeadline: minutesFromNow(-30),
    });
    await seedApplication({ opportunity, student, status: 'accepted' });

    const tokenRes = await apiJson<CheckInTokenResult>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/checkin-token`,
      dean.token
    );
    assert.equal(tokenRes.status, 200);
    assert.ok(tokenRes.body.token.length > 10);
    const ttlMs = new Date(tokenRes.body.expiresAt).getTime() - Date.now();
    assert.ok(ttlMs > 30_000 && ttlMs <= 46_000);

    // A check-in QR token must never work as an authentication Bearer token.
    const authAttempt = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      '/api/auth/me',
      tokenRes.body.token
    );
    assert.equal(authAttempt.status, 401);

    const checkInRes = await apiJson<ApplicationResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/checkin`,
      student.token,
      {
        method: 'POST',
        body: JSON.stringify({ token: tokenRes.body.token }),
      }
    );
    assert.equal(checkInRes.status, 200);
    assert.equal(checkInRes.body.application.attended, true);
    assert.ok(checkInRes.body.application.checkedInAt);

    const liveRes = await apiJson<LiveOpportunityState>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/live`,
      dean.token
    );
    assert.equal(liveRes.status, 200);
    assert.deepEqual(liveRes.body.counters, { accepted: 1, checkedIn: 1, notArrived: 0 });
    assert.equal(liveRes.body.attendees.length, 1);
  });

  it('rejects_expired_wrong_opportunity_unaccepted_outside_window_and_completed_checkins_with_arabic_errors', async () => {
    const acceptedStudent = await createStudent({
      email: 'accepted@mnu.edu.eg',
      volunteerId: '20260102',
      faculty: FACULTY_A,
    });
    const waitlistedStudent = await createStudent({
      email: 'waitlisted@mnu.edu.eg',
      volunteerId: '20260103',
      faculty: FACULTY_A,
    });

    const activeOpp = await seedOpportunity({
      createdBy: admin.user._id,
      faculty: FACULTY_A,
      startAt: minutesFromNow(-10),
      endAt: minutesFromNow(110),
      registrationDeadline: minutesFromNow(-60),
    });
    const otherOpp = await seedOpportunity({
      createdBy: admin.user._id,
      faculty: FACULTY_A,
      startAt: minutesFromNow(-10),
      endAt: minutesFromNow(110),
      registrationDeadline: minutesFromNow(-60),
    });
    const futureOpp = await seedOpportunity({
      createdBy: admin.user._id,
      faculty: FACULTY_A,
      startAt: minutesFromNow(90),
      endAt: minutesFromNow(210),
      registrationDeadline: minutesFromNow(30),
    });
    const completedOpp = await seedOpportunity({
      createdBy: admin.user._id,
      faculty: FACULTY_A,
      startAt: minutesFromNow(-180),
      endAt: minutesFromNow(-60),
      registrationDeadline: minutesFromNow(-240),
      status: 'completed',
    });

    await seedApplication({ opportunity: activeOpp, student: acceptedStudent, status: 'accepted' });
    await seedApplication({
      opportunity: activeOpp,
      student: waitlistedStudent,
      status: 'waitlisted',
    });
    await seedApplication({ opportunity: futureOpp, student: acceptedStudent, status: 'accepted' });
    await seedApplication({
      opportunity: completedOpp,
      student: acceptedStudent,
      status: 'accepted',
    });

    const expiredToken = jwt.sign(
      { opportunityId: activeOpp._id.toString(), type: 'checkin' },
      env.jwtSecret,
      { expiresIn: -5 }
    );
    const expiredRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${activeOpp._id}/checkin`,
      acceptedStudent.token,
      { method: 'POST', body: JSON.stringify({ token: expiredToken }) }
    );
    assert.equal(expiredRes.status, 400);
    assert.match(expiredRes.body.message, /انتهت صلاحية/);

    const otherTokenRes = await apiJson<CheckInTokenResult>(
      apiServer.baseUrl,
      `/api/opportunities/${otherOpp._id}/checkin-token`,
      admin.token
    );
    const wrongOppRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${activeOpp._id}/checkin`,
      acceptedStudent.token,
      { method: 'POST', body: JSON.stringify({ token: otherTokenRes.body.token }) }
    );
    assert.equal(wrongOppRes.status, 400);
    assert.match(wrongOppRes.body.message, /لا يخص هذه الفرصة/);

    const validActiveTokenRes = await apiJson<CheckInTokenResult>(
      apiServer.baseUrl,
      `/api/opportunities/${activeOpp._id}/checkin-token`,
      admin.token
    );
    const unacceptedRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${activeOpp._id}/checkin`,
      waitlistedStudent.token,
      { method: 'POST', body: JSON.stringify({ token: validActiveTokenRes.body.token }) }
    );
    assert.equal(unacceptedRes.status, 403);
    assert.match(unacceptedRes.body.message, /للمتطوعين المقبولين/);

    const futureTokenRes = await apiJson<CheckInTokenResult>(
      apiServer.baseUrl,
      `/api/opportunities/${futureOpp._id}/checkin-token`,
      admin.token
    );
    const outsideWindowRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${futureOpp._id}/checkin`,
      acceptedStudent.token,
      { method: 'POST', body: JSON.stringify({ token: futureTokenRes.body.token }) }
    );
    assert.equal(outsideWindowRes.status, 409);
    assert.match(outsideWindowRes.body.message, /نافذة الحضور/);

    const completedCheckInRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${completedOpp._id}/checkin`,
      acceptedStudent.token,
      { method: 'POST', body: JSON.stringify({ token: validActiveTokenRes.body.token }) }
    );
    assert.equal(completedCheckInRes.status, 409);
    assert.match(completedCheckInRes.body.message, /اكتمال الفرصة/);
  });

  it('toggles_manual_checkin_for_poster_and_enforces_faculty_isolation', async () => {
    const deanA = await createAccount({
      email: 'deanA@mnu.edu.eg',
      role: 'dean',
      faculty: FACULTY_A,
    });
    const deanB = await createAccount({
      email: 'deanB@mnu.edu.eg',
      role: 'dean',
      faculty: FACULTY_B,
    });
    const student = await createStudent({
      email: 'manual@mnu.edu.eg',
      volunteerId: '20260104',
      faculty: FACULTY_A,
    });
    const opportunity = await seedOpportunity({
      createdBy: deanA.user._id,
      faculty: FACULTY_A,
      startAt: minutesFromNow(-10),
      endAt: minutesFromNow(90),
      registrationDeadline: minutesFromNow(-40),
    });
    const application = await seedApplication({
      opportunity,
      student,
      status: 'accepted',
    });

    const markTrue = await apiJson<ApplicationResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/checkin/manual`,
      deanA.token,
      {
        method: 'POST',
        body: JSON.stringify({ applicationId: application._id.toString(), attended: true }),
      }
    );
    assert.equal(markTrue.status, 200);
    assert.equal(markTrue.body.application.attended, true);
    assert.ok(markTrue.body.application.checkedInAt);

    const markFalse = await apiJson<ApplicationResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/checkin/manual`,
      deanA.token,
      {
        method: 'POST',
        body: JSON.stringify({ applicationId: application._id.toString(), attended: false }),
      }
    );
    assert.equal(markFalse.status, 200);
    assert.equal(markFalse.body.application.attended, false);
    assert.equal(markFalse.body.application.checkedInAt, null);

    // Cross-faculty dean receives 404 anti-enumeration error.
    const crossDeanRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/checkin/manual`,
      deanB.token,
      {
        method: 'POST',
        body: JSON.stringify({ applicationId: application._id.toString(), attended: true }),
      }
    );
    assert.equal(crossDeanRes.status, 404);
  });

  it('rejects_early_or_cancelled_completion_and_credits_hours_idempotently_on_repeat_calls', async () => {
    const qrAttendee = await createStudent({
      email: 'qr@mnu.edu.eg',
      volunteerId: '20260105',
      faculty: FACULTY_A,
    });
    const manualAttendee = await createStudent({
      email: 'manual2@mnu.edu.eg',
      volunteerId: '20260106',
      faculty: FACULTY_A,
    });
    const noShowStudent = await createStudent({
      email: 'noshow@mnu.edu.eg',
      volunteerId: '20260107',
      faculty: FACULTY_A,
    });

    const ongoingOpp = await seedOpportunity({
      createdBy: admin.user._id,
      startAt: minutesFromNow(-30),
      endAt: minutesFromNow(30),
      registrationDeadline: minutesFromNow(-60),
    });
    const earlyRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${ongoingOpp._id}/complete`,
      admin.token,
      { method: 'POST' }
    );
    assert.equal(earlyRes.status, 409);

    const cancelledOpp = await seedOpportunity({
      createdBy: admin.user._id,
      startAt: minutesFromNow(-120),
      endAt: minutesFromNow(-10),
      registrationDeadline: minutesFromNow(-180),
      status: 'cancelled',
    });
    const cancelledRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${cancelledOpp._id}/complete`,
      admin.token,
      { method: 'POST' }
    );
    assert.equal(cancelledRes.status, 409);

    const endedOpp = await seedOpportunity({
      createdBy: admin.user._id,
      startAt: minutesFromNow(-180),
      endAt: minutesFromNow(-15),
      registrationDeadline: minutesFromNow(-240),
      hours: 8,
    });

    const app1 = await seedApplication({
      opportunity: endedOpp,
      student: qrAttendee,
      status: 'accepted',
      attended: true,
    });
    const app2 = await seedApplication({
      opportunity: endedOpp,
      student: manualAttendee,
      status: 'accepted',
      attended: true,
    });
    const app3 = await seedApplication({
      opportunity: endedOpp,
      student: noShowStudent,
      status: 'accepted',
      attended: false,
    });

    // Fire two concurrent complete calls to verify idempotency and partial unique index safety.
    const [firstComplete, secondComplete] = await Promise.all([
      apiJson<CompleteOpportunityResult>(
        apiServer.baseUrl,
        `/api/opportunities/${endedOpp._id}/complete`,
        admin.token,
        { method: 'POST' }
      ),
      apiJson<CompleteOpportunityResult>(
        apiServer.baseUrl,
        `/api/opportunities/${endedOpp._id}/complete`,
        admin.token,
        { method: 'POST' }
      ),
    ]);

    assert.equal(firstComplete.status, 200);
    assert.equal(secondComplete.status, 200);
    assert.equal(firstComplete.body.opportunity.status, 'completed');
    assert.equal(firstComplete.body.creditedCount, 2);
    assert.equal(firstComplete.body.noShowCount, 1);

    // Calling /complete again after status is already 'completed' remains an idempotent no-op.
    const thirdComplete = await apiJson<CompleteOpportunityResult>(
      apiServer.baseUrl,
      `/api/opportunities/${endedOpp._id}/complete`,
      admin.token,
      { method: 'POST' }
    );
    assert.equal(thirdComplete.status, 200);
    assert.equal(thirdComplete.body.creditedCount, 2);
    assert.equal(thirdComplete.body.noShowCount, 1);

    const createdActivities = await Activity.find({ opportunity: endedOpp._id }).lean<
      ActivityLean[]
    >();
    assert.equal(createdActivities.length, 2);
    assert.ok(createdActivities.every((activity) => activity.status === 'approved'));
    assert.ok(createdActivities.every((activity) => activity.hours === 8));

    const updatedApps = await Application.find({
      _id: { $in: [app1._id, app2._id, app3._id] },
    }).lean<ApplicationLean[]>();
    const hoursById = new Map(
      updatedApps.map((application) => [application._id.toString(), application.hoursGranted])
    );
    assert.equal(hoursById.get(app1._id.toString()), 8);
    assert.equal(hoursById.get(app2._id.toString()), 8);
    assert.equal(hoursById.get(app3._id.toString()), 0);

    // Multiple manual activities with application: null still coexist under the partial unique index.
    await Activity.create([
      {
        volunteer: noShowStudent.volunteer._id,
        title: 'نشاط يدوي ١',
        type: 'مبادرة',
        hours: 2,
        date: new Date(),
        status: 'approved',
        supervisor: 'د. مشرف',
      },
      {
        volunteer: noShowStudent.volunteer._id,
        title: 'نشاط يدوي ٢',
        type: 'ندوة',
        hours: 3,
        date: new Date(),
        status: 'approved',
        supervisor: 'د. مشرف',
      },
    ]);
    assert.equal(
      await Activity.countDocuments({ volunteer: noShowStudent.volunteer._id, application: null }),
      2
    );
  });
});
