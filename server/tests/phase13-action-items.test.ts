import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import type { AppEnv } from '../src/config/env.js';
import { loadEnv } from '../src/config/env.js';
import type { Faculty, OpportunityStatus, UserRole } from '../src/constants/enums.js';
import { FACULTIES } from '../src/constants/enums.js';
import { Activity } from '../src/models/Activity.js';
import { Application } from '../src/models/Application.js';
import { Opportunity } from '../src/models/Opportunity.js';
import { Settings } from '../src/models/Settings.js';
import { User } from '../src/models/User.js';
import { Volunteer } from '../src/models/Volunteer.js';
import type { TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, startTestServer } from './helpers.js';

const TEST_DB_NAME = 'volunteer_hours_test_phase13_action_items';
const FACULTY_A = FACULTIES[0];
const FACULTY_B = FACULTIES[1];
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface Account {
  id: string;
  objectId: mongoose.Types.ObjectId;
  token: string;
}

interface ActionItemsPayload {
  awaitingCompletion: Array<{
    opportunityId: string;
    title: string;
    faculty: Faculty | null;
    startAt: string;
    endAt: string;
    hours: number;
    acceptedCount: number;
    attendedCount: number;
  }>;
  pendingUrgent: Array<{
    opportunityId: string;
    title: string;
    faculty: Faculty | null;
    startAt: string;
    phase: string;
    pendingCount: number;
  }>;
}

async function createAccount(options: {
  email: string;
  role: UserRole;
  faculty: Faculty | null;
  volunteer?: mongoose.Types.ObjectId | null;
}): Promise<Account> {
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

interface OpportunitySpec {
  title: string;
  faculty: Faculty | null;
  createdBy: mongoose.Types.ObjectId;
  status: OpportunityStatus;
  startOffsetMs: number;
  durationMs?: number;
  deadlineOffsetMs: number;
}

async function createOpportunity(spec: OpportunitySpec) {
  const now = Date.now();
  const startAt = new Date(now + spec.startOffsetMs);
  const endAt = new Date(startAt.getTime() + (spec.durationMs ?? 4 * HOUR_MS));
  return Opportunity.create({
    title: spec.title,
    description: 'وصف الفرصة',
    requirements: '',
    fields: ['medical'],
    activityType: 'حملة توعية',
    location: { name: 'الحرم الجامعي', address: 'المنصورة' },
    startAt,
    endAt,
    registrationDeadline: new Date(now + spec.deadlineOffsetMs),
    hours: 4,
    contactName: 'منسق',
    contactPhone: '01000000000',
    contactEmail: 'opp@mnu.edu.eg',
    faculty: spec.faculty,
    slots: { student: 10, academic: 2, admin: 2 },
    acceptedCounts: { student: 0, academic: 0, admin: 0 },
    approvalMode: 'manual',
    status: spec.status,
    createdBy: spec.createdBy,
  });
}

async function createApplication(options: {
  opportunity: mongoose.Types.ObjectId;
  student: Account;
  volunteer: mongoose.Types.ObjectId;
  faculty: Faculty;
  status: 'pending' | 'accepted' | 'rejected';
  attended?: boolean;
}) {
  return Application.create({
    opportunity: options.opportunity,
    volunteer: options.volunteer,
    user: options.student.objectId,
    faculty: options.faculty,
    category: 'student',
    status: options.status,
    attended: options.attended ?? false,
    hoursGranted: 0,
  });
}

describe('Phase 13 Staff Action Items (awaiting completion + urgent pending)', () => {
  let env: AppEnv;
  let apiServer: TestServer;

  let admin: Account;
  let deanA: Account;
  let deanB: Account;
  let student: Account;
  let studentVolunteerId: mongoose.Types.ObjectId;

  const ids = {
    aDeanA: '',
    aAdminA: '',
    aDeanB: '',
    aGlobal: '',
    bEndedPending: '',
    bSoon: '',
    bRegClosed: '',
    bLive: '',
    bDeanB: '',
    bAdminCreated: '',
  };

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

    admin = await createAccount({ email: 'admin@mnu.edu.eg', role: 'admin', faculty: null });
    deanA = await createAccount({ email: 'dean-a@mnu.edu.eg', role: 'dean', faculty: FACULTY_A });
    deanB = await createAccount({ email: 'dean-b@mnu.edu.eg', role: 'dean', faculty: FACULTY_B });

    const volunteer = await Volunteer.create({
      volunteerId: 'S-1301',
      fullName: 'طالب تجريبي',
      category: 'student',
      faculty: FACULTY_A,
    });
    studentVolunteerId = volunteer._id;
    student = await createAccount({
      email: 'student@mnu.edu.eg',
      role: 'student',
      faculty: FACULTY_A,
      volunteer: volunteer._id,
    });
    const secondVolunteer = await Volunteer.create({
      volunteerId: 'S-1302',
      fullName: 'طالبة تجريبية',
      category: 'student',
      faculty: FACULTY_A,
    });
    const secondStudent = await createAccount({
      email: 'student2@mnu.edu.eg',
      role: 'student',
      faculty: FACULTY_A,
      volunteer: secondVolunteer._id,
    });

    // ---- Block A fixtures: published + ended, in different ownership shapes ----
    const aDeanA = await createOpportunity({
      title: 'فرصة منتهية لعميد الطب',
      faculty: FACULTY_A,
      createdBy: deanA.objectId,
      status: 'published',
      startOffsetMs: -3 * DAY_MS,
      deadlineOffsetMs: -4 * DAY_MS,
    });
    ids.aDeanA = aDeanA._id.toString();
    await createApplication({
      opportunity: aDeanA._id,
      student,
      volunteer: studentVolunteerId,
      faculty: FACULTY_A,
      status: 'accepted',
      attended: true,
    });
    await createApplication({
      opportunity: aDeanA._id,
      student: secondStudent,
      volunteer: secondVolunteer._id,
      faculty: FACULTY_A,
      status: 'accepted',
      attended: false,
    });

    const aAdminA = await createOpportunity({
      title: 'فرصة منتهية أنشأها الأدمن داخل كلية الطب',
      faculty: FACULTY_A,
      createdBy: admin.objectId,
      status: 'published',
      startOffsetMs: -2 * DAY_MS,
      deadlineOffsetMs: -3 * DAY_MS,
    });
    ids.aAdminA = aAdminA._id.toString();

    const aDeanB = await createOpportunity({
      title: 'فرصة منتهية لعميد الأسنان',
      faculty: FACULTY_B,
      createdBy: deanB.objectId,
      status: 'published',
      startOffsetMs: -5 * DAY_MS,
      deadlineOffsetMs: -6 * DAY_MS,
    });
    ids.aDeanB = aDeanB._id.toString();

    const aGlobal = await createOpportunity({
      title: 'فرصة عامة منتهية',
      faculty: null,
      createdBy: admin.objectId,
      status: 'published',
      startOffsetMs: -1 * DAY_MS,
      deadlineOffsetMs: -2 * DAY_MS,
    });
    ids.aGlobal = aGlobal._id.toString();

    // Excluded from Block A: completed / cancelled / draft even when ended.
    await createOpportunity({
      title: 'فرصة مكتملة',
      faculty: FACULTY_A,
      createdBy: deanA.objectId,
      status: 'completed',
      startOffsetMs: -3 * DAY_MS,
      deadlineOffsetMs: -4 * DAY_MS,
    });
    await createOpportunity({
      title: 'فرصة ملغاة',
      faculty: FACULTY_A,
      createdBy: deanA.objectId,
      status: 'cancelled',
      startOffsetMs: -3 * DAY_MS,
      deadlineOffsetMs: -4 * DAY_MS,
    });
    await createOpportunity({
      title: 'مسودة منتهية زمنياً',
      faculty: FACULTY_A,
      createdBy: deanA.objectId,
      status: 'draft',
      startOffsetMs: -3 * DAY_MS,
      deadlineOffsetMs: -4 * DAY_MS,
    });

    // ---- Block B fixtures ----
    const bSoon = await createOpportunity({
      title: 'فرصة تبدأ غداً ولها طلبات معلقة',
      faculty: FACULTY_A,
      createdBy: deanA.objectId,
      status: 'published',
      startOffsetMs: 24 * HOUR_MS,
      deadlineOffsetMs: 12 * HOUR_MS,
    });
    ids.bSoon = bSoon._id.toString();
    await createApplication({
      opportunity: bSoon._id,
      student,
      volunteer: studentVolunteerId,
      faculty: FACULTY_A,
      status: 'pending',
    });
    await createApplication({
      opportunity: bSoon._id,
      student: secondStudent,
      volunteer: secondVolunteer._id,
      faculty: FACULTY_A,
      status: 'pending',
    });

    // Starts just beyond the 72h window with registration still open -> excluded.
    const bFar = await createOpportunity({
      title: 'فرصة بعيدة ولها طلب معلق',
      faculty: FACULTY_A,
      createdBy: deanA.objectId,
      status: 'published',
      startOffsetMs: 73 * HOUR_MS,
      deadlineOffsetMs: 72 * HOUR_MS,
    });
    await createApplication({
      opportunity: bFar._id,
      student,
      volunteer: studentVolunteerId,
      faculty: FACULTY_A,
      status: 'pending',
    });

    const bRegClosed = await createOpportunity({
      title: 'فرصة أُغلق تسجيلها وتبدأ بعد عشرة أيام',
      faculty: FACULTY_A,
      createdBy: deanA.objectId,
      status: 'published',
      startOffsetMs: 10 * DAY_MS,
      deadlineOffsetMs: -1 * HOUR_MS,
    });
    ids.bRegClosed = bRegClosed._id.toString();
    await createApplication({
      opportunity: bRegClosed._id,
      student,
      volunteer: studentVolunteerId,
      faculty: FACULTY_A,
      status: 'pending',
    });

    const bLive = await createOpportunity({
      title: 'فرصة جارية الآن ولها طلب معلق',
      faculty: FACULTY_A,
      createdBy: deanA.objectId,
      status: 'published',
      startOffsetMs: -1 * HOUR_MS,
      durationMs: 5 * HOUR_MS,
      deadlineOffsetMs: -2 * HOUR_MS,
    });
    ids.bLive = bLive._id.toString();
    await createApplication({
      opportunity: bLive._id,
      student,
      volunteer: studentVolunteerId,
      faculty: FACULTY_A,
      status: 'pending',
    });

    const bDeanB = await createOpportunity({
      title: 'فرصة أسنان تبدأ غداً ولها طلب معلق',
      faculty: FACULTY_B,
      createdBy: deanB.objectId,
      status: 'published',
      startOffsetMs: 24 * HOUR_MS,
      deadlineOffsetMs: 12 * HOUR_MS,
    });
    ids.bDeanB = bDeanB._id.toString();
    await createApplication({
      opportunity: bDeanB._id,
      student,
      volunteer: studentVolunteerId,
      faculty: FACULTY_A,
      status: 'pending',
    });

    const bAdminCreated = await createOpportunity({
      title: 'فرصة طب أنشأها الأدمن وتبدأ غداً',
      faculty: FACULTY_A,
      createdBy: admin.objectId,
      status: 'published',
      startOffsetMs: 24 * HOUR_MS,
      deadlineOffsetMs: 12 * HOUR_MS,
    });
    ids.bAdminCreated = bAdminCreated._id.toString();
    await createApplication({
      opportunity: bAdminCreated._id,
      student,
      volunteer: studentVolunteerId,
      faculty: FACULTY_A,
      status: 'pending',
    });

    // Pending on an already-ended opportunity: belongs to Block A, never Block B.
    const bEndedPending = await createOpportunity({
      title: 'فرصة منتهية ولها طلب معلق',
      faculty: FACULTY_A,
      createdBy: deanA.objectId,
      status: 'published',
      startOffsetMs: -2 * DAY_MS,
      deadlineOffsetMs: -3 * DAY_MS,
    });
    ids.bEndedPending = bEndedPending._id.toString();
    await createApplication({
      opportunity: bEndedPending._id,
      student,
      volunteer: studentVolunteerId,
      faculty: FACULTY_A,
      status: 'pending',
    });

    // Near-start opportunity without any pending application -> excluded.
    const bNoPending = await createOpportunity({
      title: 'فرصة تبدأ غداً بلا طلبات معلقة',
      faculty: FACULTY_A,
      createdBy: deanA.objectId,
      status: 'published',
      startOffsetMs: 24 * HOUR_MS,
      deadlineOffsetMs: 12 * HOUR_MS,
    });
    await createApplication({
      opportunity: bNoPending._id,
      student,
      volunteer: studentVolunteerId,
      faculty: FACULTY_A,
      status: 'accepted',
    });
  });

  after(async () => {
    await apiServer.close();
    await mongoose.connection.close();
  });

  it('admin_sees_every_awaiting_completion_and_urgent_pending_item', async () => {
    const response = await apiJson<ActionItemsPayload>(
      apiServer.baseUrl,
      '/api/stats/action-items',
      admin.token
    );
    assert.equal(response.status, 200);

    const awaitingIds = response.body.awaitingCompletion.map((item) => item.opportunityId);
    assert.deepEqual(
      new Set(awaitingIds),
      new Set([ids.aDeanA, ids.aAdminA, ids.aDeanB, ids.aGlobal, ids.bEndedPending])
    );

    const deanItem = response.body.awaitingCompletion.find(
      (item) => item.opportunityId === ids.aDeanA
    );
    assert.equal(deanItem?.acceptedCount, 2);
    assert.equal(deanItem?.attendedCount, 1);

    const urgentIds = response.body.pendingUrgent.map((item) => item.opportunityId);
    assert.deepEqual(
      new Set(urgentIds),
      new Set([ids.bSoon, ids.bRegClosed, ids.bLive, ids.bDeanB, ids.bAdminCreated])
    );
    // Sorted by start: the already-running opportunity comes first.
    assert.equal(response.body.pendingUrgent[0]?.opportunityId, ids.bLive);
    const soonItem = response.body.pendingUrgent.find((item) => item.opportunityId === ids.bSoon);
    assert.equal(soonItem?.pendingCount, 2);
  });

  it('dean_sees_only_opportunities_he_created_inside_his_own_faculty', async () => {
    const response = await apiJson<ActionItemsPayload>(
      apiServer.baseUrl,
      '/api/stats/action-items',
      deanA.token
    );
    assert.equal(response.status, 200);

    const awaitingIds = response.body.awaitingCompletion.map((item) => item.opportunityId);
    assert.deepEqual(new Set(awaitingIds), new Set([ids.aDeanA, ids.bEndedPending]));
    // Same faculty but created by the admin: the dean cannot complete it, so it is hidden.
    assert.ok(!awaitingIds.includes(ids.aAdminA));
    // All-faculty (null) opportunities are not manageable by a dean either.
    assert.ok(!awaitingIds.includes(ids.aGlobal));

    const urgentIds = response.body.pendingUrgent.map((item) => item.opportunityId);
    assert.deepEqual(new Set(urgentIds), new Set([ids.bSoon, ids.bRegClosed, ids.bLive]));
    assert.ok(!urgentIds.includes(ids.bAdminCreated));
    assert.ok(!urgentIds.includes(ids.bDeanB));
  });

  it('second_dean_sees_only_his_own_faculty_items', async () => {
    const response = await apiJson<ActionItemsPayload>(
      apiServer.baseUrl,
      '/api/stats/action-items',
      deanB.token
    );
    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.awaitingCompletion.map((item) => item.opportunityId),
      [ids.aDeanB]
    );
    assert.deepEqual(
      response.body.pendingUrgent.map((item) => item.opportunityId),
      [ids.bDeanB]
    );
  });

  it('student_is_forbidden_from_action_items', async () => {
    const response = await apiJson<{ message: string }>(
      apiServer.baseUrl,
      '/api/stats/action-items',
      student.token
    );
    assert.equal(response.status, 403);
  });
});
