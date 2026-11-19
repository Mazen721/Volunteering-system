import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import type { AppEnv } from '../src/config/env.js';
import { loadEnv } from '../src/config/env.js';
import type { Faculty, UserRole, VolunteerCategory } from '../src/constants/enums.js';
import { FACULTIES } from '../src/constants/enums.js';
import { Activity } from '../src/models/Activity.js';
import { Application } from '../src/models/Application.js';
import type { ApplicationLean } from '../src/models/Application.js';
import { Opportunity } from '../src/models/Opportunity.js';
import type { OpportunityLean } from '../src/models/Opportunity.js';
import { Settings } from '../src/models/Settings.js';
import { User } from '../src/models/User.js';
import { Volunteer } from '../src/models/Volunteer.js';
import type {
  CheckInTokenResult,
  LiveOpportunityState,
} from '../src/services/checkin.service.js';
import type { OpportunityDTO } from '../src/services/opportunity.service.js';
import type { TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, startTestServer } from './helpers.js';

const TEST_DB_NAME = 'volunteer_hours_test_phase4_deputy';
const FACULTY_A = FACULTIES[0];
const FACULTY_B = FACULTIES[1];

interface ErrorResponse {
  message: string;
}

interface OpportunityResponse {
  opportunity: OpportunityDTO;
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

async function seedLiveOpportunity(createdBy: mongoose.Types.ObjectId): Promise<OpportunityLean> {
  const created = await Opportunity.create({
    title: 'فعالية تطوعية ميدانية',
    description: 'وصف تفصيلي لفعالية تطوعية لاختبار مسؤول الحضور',
    requirements: '',
    fields: ['medical'],
    activityType: 'قافلة',
    location: { name: 'المركز الطبي الجامعي', address: 'جامعة المنصورة الأهلية' },
    startAt: minutesFromNow(-20),
    endAt: minutesFromNow(120),
    registrationDeadline: minutesFromNow(-60),
    hours: 5,
    contactName: 'د. مسؤول الحضور',
    contactPhone: '01000000000',
    contactEmail: 'live@mnu.edu.eg',
    faculty: FACULTY_A,
    slots: { student: 10, academic: 0, admin: 0 },
    acceptedCounts: { student: 2, academic: 0, admin: 0 },
    approvalMode: 'auto',
    status: 'published',
    createdBy,
  });
  return created.toObject<OpportunityLean>();
}

async function seedApplication(
  opportunity: OpportunityLean,
  student: StudentAccount
): Promise<ApplicationLean> {
  const created = await Application.create({
    opportunity: opportunity._id,
    volunteer: student.volunteer._id,
    user: student.user._id,
    faculty: student.volunteer.faculty,
    category: student.volunteer.category,
    status: 'accepted',
    note: '',
    decidedBy: null,
    decidedAt: null,
    attended: false,
    checkedInAt: null,
    hoursGranted: 0,
    appliedAt: new Date(),
  });
  return created.toObject<ApplicationLean>();
}

describe('Phase 4 Attendance Deputy', () => {
  let env: AppEnv;
  let apiServer: TestServer;
  let dean: AccountResult;

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
    dean = await createAccount({ email: 'dean.a@mnu.edu.eg', role: 'dean', faculty: FACULTY_A });
  });

  async function setupDeputyScene() {
    const opportunity = await seedLiveOpportunity(dean.user._id);
    const deputy = await createStudent({
      email: 'deputy@mnu.edu.eg',
      volunteerId: '20260201',
      faculty: FACULTY_A,
    });
    const classmate = await createStudent({
      email: 'classmate@mnu.edu.eg',
      volunteerId: '20260202',
      faculty: FACULTY_A,
    });
    const deputyApp = await seedApplication(opportunity, deputy);
    const classmateApp = await seedApplication(opportunity, classmate);
    return { opportunity, deputy, classmate, deputyApp, classmateApp };
  }

  it('deputy_can_run_live_attendance_but_cannot_complete_or_assign', async () => {
    const { opportunity, deputy, classmateApp } = await setupDeputyScene();

    const assignRes = await apiJson<OpportunityResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/deputy`,
      dean.token,
      { method: 'PUT', body: JSON.stringify({ deputyUserId: deputy.id }) }
    );
    assert.equal(assignRes.status, 200);
    assert.equal(assignRes.body.opportunity.attendanceDeputy?.toString(), deputy.id);

    const liveRes = await apiJson<LiveOpportunityState>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/live`,
      deputy.token
    );
    assert.equal(liveRes.status, 200);
    assert.equal(liveRes.body.counters.accepted, 2);

    const tokenRes = await apiJson<CheckInTokenResult>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/checkin-token`,
      deputy.token
    );
    assert.equal(tokenRes.status, 200);
    assert.ok(tokenRes.body.token.length > 10);

    const manualRes = await apiJson<ApplicationResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/checkin/manual`,
      deputy.token,
      {
        method: 'POST',
        body: JSON.stringify({ applicationId: classmateApp._id.toString(), attended: true }),
      }
    );
    assert.equal(manualRes.status, 200);
    assert.equal(manualRes.body.application.attended, true);

    // Crediting hours stays with staff: a deputy can never complete the event.
    const completeRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/complete`,
      deputy.token,
      { method: 'POST' }
    );
    assert.equal(completeRes.status, 403);

    const reassignRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/deputy`,
      deputy.token,
      { method: 'PUT', body: JSON.stringify({ deputyUserId: null }) }
    );
    assert.equal(reassignRes.status, 403);
  });

  it('non_deputy_student_gets_404_on_live_token_and_manual', async () => {
    const { opportunity, deputy, classmate, classmateApp } = await setupDeputyScene();
    await apiJson<OpportunityResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/deputy`,
      dean.token,
      { method: 'PUT', body: JSON.stringify({ deputyUserId: deputy.id }) }
    );

    const liveRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/live`,
      classmate.token
    );
    assert.equal(liveRes.status, 404);

    const tokenRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/checkin-token`,
      classmate.token
    );
    assert.equal(tokenRes.status, 404);

    const manualRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/checkin/manual`,
      classmate.token,
      {
        method: 'POST',
        body: JSON.stringify({ applicationId: classmateApp._id.toString(), attended: true }),
      }
    );
    assert.equal(manualRes.status, 404);
  });

  it('assign_rejects_non_accepted_students_and_clearing_revokes_access', async () => {
    const { opportunity, deputy } = await setupDeputyScene();
    const outsider = await createStudent({
      email: 'outsider@mnu.edu.eg',
      volunteerId: '20260203',
      faculty: FACULTY_A,
    });

    const outsiderRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/deputy`,
      dean.token,
      { method: 'PUT', body: JSON.stringify({ deputyUserId: outsider.id }) }
    );
    assert.equal(outsiderRes.status, 400);

    const deanAsDeputyRes = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/deputy`,
      dean.token,
      { method: 'PUT', body: JSON.stringify({ deputyUserId: dean.id }) }
    );
    assert.equal(deanAsDeputyRes.status, 400);

    await apiJson<OpportunityResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/deputy`,
      dean.token,
      { method: 'PUT', body: JSON.stringify({ deputyUserId: deputy.id }) }
    );
    const clearRes = await apiJson<OpportunityResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/deputy`,
      dean.token,
      { method: 'PUT', body: JSON.stringify({ deputyUserId: null }) }
    );
    assert.equal(clearRes.status, 200);
    assert.equal(clearRes.body.opportunity.attendanceDeputy, null);

    const liveAfterClear = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/live`,
      deputy.token
    );
    assert.equal(liveAfterClear.status, 404);
  });

  it('cross_faculty_dean_cannot_assign_a_deputy_404', async () => {
    const { opportunity, deputy } = await setupDeputyScene();
    const deanB = await createAccount({
      email: 'dean.b@mnu.edu.eg',
      role: 'dean',
      faculty: FACULTY_B,
    });

    const res = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/deputy`,
      deanB.token,
      { method: 'PUT', body: JSON.stringify({ deputyUserId: deputy.id }) }
    );
    assert.equal(res.status, 404);
  });
});
