import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import type { AppEnv } from '../src/config/env.js';
import { loadEnv } from '../src/config/env.js';
import type { Faculty, OpportunityStatus, UserRole, VolunteerCategory } from '../src/constants/enums.js';
import { FACULTIES } from '../src/constants/enums.js';
import { Application } from '../src/models/Application.js';
import type { ApplicationLean } from '../src/models/Application.js';
import { Notification } from '../src/models/Notification.js';
import { Opportunity } from '../src/models/Opportunity.js';
import type { OpportunityLean } from '../src/models/Opportunity.js';
import { User } from '../src/models/User.js';
import { Volunteer } from '../src/models/Volunteer.js';
import type { LiveOpportunityState } from '../src/services/checkin.service.js';
import type { WarnAbsentResult } from '../src/services/notification.service.js';
import type { TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, startTestServer } from './helpers.js';

const TEST_DB_NAME = 'volunteer_hours_test_phase19';
const FACULTY_A = FACULTIES[0];
const FACULTY_B = FACULTIES[1];

interface AccountResult {
  id: string;
  token: string;
  user: mongoose.Types.ObjectId;
}

interface StudentAccount extends AccountResult {
  volunteer: mongoose.Types.ObjectId;
  volunteerName: string;
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 3_600_000);
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
    user: doc._id,
  };
}

async function createStudent(options: {
  email: string;
  volunteerId: string;
  faculty: Faculty;
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
  });
  return { ...account, volunteer: volunteer._id, volunteerName: volunteer.fullName };
}

async function seedOpportunity(options: {
  createdBy: mongoose.Types.ObjectId;
  faculty?: Faculty | null;
  startAt: Date;
  endAt: Date;
  status?: OpportunityStatus;
  title?: string;
}): Promise<OpportunityLean> {
  const created = await Opportunity.create({
    title: options.title ?? 'فعالية تطوعية منتهية',
    description: 'وصف تفصيلي لفعالية تطوعية لاختبار إنذار الغائبين وعدّ مرات الغياب',
    requirements: '',
    fields: ['medical'],
    activityType: 'قافلة',
    location: { name: 'المركز الطبي الجامعي', address: 'جامعة المنصورة الأهلية' },
    startAt: options.startAt,
    endAt: options.endAt,
    registrationDeadline: new Date(options.startAt.getTime() - 86_400_000),
    hours: 4,
    contactName: 'د. مسؤول الحضور',
    contactPhone: '01000000000',
    contactEmail: 'live@mnu.edu.eg',
    faculty: options.faculty === undefined ? FACULTY_A : options.faculty,
    slots: { student: 20, academic: 0, admin: 0 },
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
}): Promise<void> {
  await Application.create({
    opportunity: options.opportunity._id,
    volunteer: options.student.volunteer,
    user: options.student.user,
    faculty: FACULTY_A,
    category: 'student',
    status: options.status,
    note: '',
    decidedBy: null,
    decidedAt: null,
    attended: options.attended ?? false,
    checkedInAt: options.attended ? new Date() : null,
    hoursGranted: 0,
    appliedAt: new Date(),
  });
}

function endedOpportunity(createdBy: mongoose.Types.ObjectId, title?: string) {
  return seedOpportunity({
    createdBy,
    startAt: hoursFromNow(-6),
    endAt: hoursFromNow(-2),
    title,
  });
}

describe('Phase 19 Absence warnings + per-volunteer absence counts', () => {
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
      Opportunity.init(),
      Application.init(),
      Notification.init(),
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
      Opportunity.deleteMany({}),
      Application.deleteMany({}),
      Notification.deleteMany({}),
    ]);
    admin = await createAccount({ email: 'admin@mnu.edu.eg', role: 'admin', faculty: null });
  });

  it('warn_absent_notifies_exactly_the_absent_accepted_volunteers', async () => {
    const opportunity = await endedOpportunity(admin.user);
    const attendedStudent = await createStudent({
      email: 'attended@mnu.edu.eg',
      volunteerId: '20269001',
      faculty: FACULTY_A,
    });
    const absentOne = await createStudent({
      email: 'absent1@mnu.edu.eg',
      volunteerId: '20269002',
      faculty: FACULTY_A,
    });
    const absentTwo = await createStudent({
      email: 'absent2@mnu.edu.eg',
      volunteerId: '20269003',
      faculty: FACULTY_A,
    });
    const pendingStudent = await createStudent({
      email: 'pending@mnu.edu.eg',
      volunteerId: '20269004',
      faculty: FACULTY_A,
    });
    const waitlistedStudent = await createStudent({
      email: 'waitlisted@mnu.edu.eg',
      volunteerId: '20269005',
      faculty: FACULTY_A,
    });

    await seedApplication({ opportunity, student: attendedStudent, status: 'accepted', attended: true });
    await seedApplication({ opportunity, student: absentOne, status: 'accepted' });
    await seedApplication({ opportunity, student: absentTwo, status: 'accepted' });
    await seedApplication({ opportunity, student: pendingStudent, status: 'pending' });
    await seedApplication({ opportunity, student: waitlistedStudent, status: 'waitlisted' });

    const res = await apiJson<WarnAbsentResult>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/warn-absent`,
      admin.token,
      { method: 'POST' }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.sent, 2);

    const notifications = await Notification.find({}).lean();
    assert.equal(notifications.length, 2);
    const recipients = notifications.map((n) => n.user.toString()).sort();
    assert.deepEqual(recipients, [absentOne.id, absentTwo.id].sort());
    for (const notification of notifications) {
      assert.equal(notification.type, 'absence_warning');
      assert.equal(notification.title, 'إنذار غياب');
      assert.ok(notification.body.includes(opportunity.title));
      assert.equal(notification.read, false);
    }
    // The attended / pending / waitlisted students received nothing.
    assert.equal(await Notification.countDocuments({ user: attendedStudent.user }), 0);
    assert.equal(await Notification.countDocuments({ user: pendingStudent.user }), 0);
    assert.equal(await Notification.countDocuments({ user: waitlistedStudent.user }), 0);
  });

  it('warn_absent_with_zero_absent_creates_nothing_and_returns_sent_0', async () => {
    const opportunity = await endedOpportunity(admin.user);
    const attendedStudent = await createStudent({
      email: 'only-attended@mnu.edu.eg',
      volunteerId: '20269011',
      faculty: FACULTY_A,
    });
    await seedApplication({ opportunity, student: attendedStudent, status: 'accepted', attended: true });

    const res = await apiJson<WarnAbsentResult>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/warn-absent`,
      admin.token,
      { method: 'POST' }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.sent, 0);
    assert.equal(await Notification.countDocuments({}), 0);
  });

  it('warn_absent_forbids_students_and_out_of_scope_deans', async () => {
    const opportunity = await endedOpportunity(admin.user);
    const student = await createStudent({
      email: 'someone@mnu.edu.eg',
      volunteerId: '20269021',
      faculty: FACULTY_A,
    });
    await seedApplication({ opportunity, student, status: 'accepted' });

    const studentRes = await apiJson(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/warn-absent`,
      student.token,
      { method: 'POST' }
    );
    assert.equal(studentRes.status, 403);

    // A dean of another faculty — and even a same-faculty dean who did not
    // create the opportunity — is out of the manage scope: 404, as with
    // completion (assertCanManageOpportunity convention).
    const otherFacultyDean = await createAccount({
      email: 'dean.b@mnu.edu.eg',
      role: 'dean',
      faculty: FACULTY_B,
    });
    const deanRes = await apiJson(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/warn-absent`,
      otherFacultyDean.token,
      { method: 'POST' }
    );
    assert.equal(deanRes.status, 404);

    const sameFacultyDean = await createAccount({
      email: 'dean.a@mnu.edu.eg',
      role: 'dean',
      faculty: FACULTY_A,
    });
    const sameFacultyRes = await apiJson(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/warn-absent`,
      sameFacultyDean.token,
      { method: 'POST' }
    );
    assert.equal(sameFacultyRes.status, 404);
    assert.equal(await Notification.countDocuments({}), 0);

    // The owning dean CAN warn for his own opportunity.
    const ownOpportunity = await seedOpportunity({
      createdBy: sameFacultyDean.user,
      startAt: hoursFromNow(-6),
      endAt: hoursFromNow(-2),
    });
    await seedApplication({ opportunity: ownOpportunity, student, status: 'accepted' });
    const ownRes = await apiJson<WarnAbsentResult>(
      apiServer.baseUrl,
      `/api/opportunities/${ownOpportunity._id}/warn-absent`,
      sameFacultyDean.token,
      { method: 'POST' }
    );
    assert.equal(ownRes.status, 200);
    assert.equal(ownRes.body.sent, 1);
  });

  it('live_state_reports_exact_absence_counts_per_volunteer', async () => {
    const current = await endedOpportunity(admin.user, 'الفرصة الحالية');
    const pastOne = await seedOpportunity({
      createdBy: admin.user,
      startAt: hoursFromNow(-72),
      endAt: hoursFromNow(-70),
      title: 'فرصة سابقة أولى',
    });
    const pastTwo = await seedOpportunity({
      createdBy: admin.user,
      startAt: hoursFromNow(-48),
      endAt: hoursFromNow(-46),
      title: 'فرصة سابقة ثانية',
    });
    const future = await seedOpportunity({
      createdBy: admin.user,
      startAt: hoursFromNow(24),
      endAt: hoursFromNow(26),
      title: 'فرصة قادمة',
    });

    // Repeat offender: absent on pastOne + pastTwo + current = 3.
    const repeat = await createStudent({
      email: 'repeat@mnu.edu.eg',
      volunteerId: '20269031',
      faculty: FACULTY_A,
    });
    // Worst offender: absent on 4 ended opportunities (needs one more past).
    const pastThree = await seedOpportunity({
      createdBy: admin.user,
      startAt: hoursFromNow(-30),
      endAt: hoursFromNow(-28),
      title: 'فرصة سابقة ثالثة',
    });
    const worst = await createStudent({
      email: 'worst@mnu.edu.eg',
      volunteerId: '20269032',
      faculty: FACULTY_A,
    });
    // Attended the current one; an old ATTENDED application must not count,
    // and neither must an accepted absence on the future opportunity.
    const present = await createStudent({
      email: 'present@mnu.edu.eg',
      volunteerId: '20269033',
      faculty: FACULTY_A,
    });

    await seedApplication({ opportunity: current, student: repeat, status: 'accepted' });
    await seedApplication({ opportunity: pastOne, student: repeat, status: 'accepted' });
    await seedApplication({ opportunity: pastTwo, student: repeat, status: 'accepted' });
    await seedApplication({ opportunity: future, student: repeat, status: 'accepted' });

    await seedApplication({ opportunity: current, student: worst, status: 'accepted' });
    await seedApplication({ opportunity: pastOne, student: worst, status: 'accepted' });
    await seedApplication({ opportunity: pastTwo, student: worst, status: 'accepted' });
    await seedApplication({ opportunity: pastThree, student: worst, status: 'accepted' });

    await seedApplication({ opportunity: current, student: present, status: 'accepted', attended: true });
    await seedApplication({ opportunity: pastOne, student: present, status: 'accepted', attended: true });
    await seedApplication({ opportunity: future, student: present, status: 'accepted' });

    const res = await apiJson<LiveOpportunityState>(
      apiServer.baseUrl,
      `/api/opportunities/${current._id}/live`,
      admin.token
    );
    assert.equal(res.status, 200);
    const byVolunteer = new Map(
      res.body.attendees.map((attendee) => [
        (attendee.volunteer as unknown as { _id: string })._id?.toString() ??
          String(attendee.volunteer),
        attendee.absenceCount,
      ])
    );
    assert.equal(byVolunteer.get(repeat.volunteer.toString()), 3);
    assert.equal(byVolunteer.get(worst.volunteer.toString()), 4);
    // The attended volunteer's count excludes his attended record AND the
    // not-yet-ended future absence.
    assert.equal(byVolunteer.get(present.volunteer.toString()), 0);
  });

  it('notifications_endpoints_return_only_the_callers_own_items', async () => {
    const opportunity = await endedOpportunity(admin.user);
    const absentStudent = await createStudent({
      email: 'warned@mnu.edu.eg',
      volunteerId: '20269041',
      faculty: FACULTY_A,
    });
    const otherStudent = await createStudent({
      email: 'other@mnu.edu.eg',
      volunteerId: '20269042',
      faculty: FACULTY_A,
    });
    await seedApplication({ opportunity, student: absentStudent, status: 'accepted' });
    await apiJson(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id}/warn-absent`,
      admin.token,
      { method: 'POST' }
    );

    const own = await apiJson<{ notifications: unknown[]; unreadCount: number }>(
      apiServer.baseUrl,
      '/api/notifications',
      absentStudent.token
    );
    assert.equal(own.status, 200);
    assert.equal(own.body.notifications.length, 1);
    assert.equal(own.body.unreadCount, 1);

    const other = await apiJson<{ notifications: unknown[]; unreadCount: number }>(
      apiServer.baseUrl,
      '/api/notifications',
      otherStudent.token
    );
    assert.equal(other.body.notifications.length, 0);
    assert.equal(other.body.unreadCount, 0);

    const marked = await apiJson<{ updated: number }>(
      apiServer.baseUrl,
      '/api/notifications/mark-read',
      absentStudent.token,
      { method: 'POST' }
    );
    assert.equal(marked.body.updated, 1);
    const after = await apiJson<{ unreadCount: number }>(
      apiServer.baseUrl,
      '/api/notifications',
      absentStudent.token
    );
    assert.equal(after.body.unreadCount, 0);
  });
});
