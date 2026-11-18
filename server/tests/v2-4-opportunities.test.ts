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
  OpportunityStatus,
  UserRole,
  VolunteerCategory,
} from '../src/constants/enums.js';
import { FACULTIES } from '../src/constants/enums.js';
import { Application } from '../src/models/Application.js';
import type { ApplicationLean } from '../src/models/Application.js';
import { Opportunity } from '../src/models/Opportunity.js';
import type { OpportunityLean } from '../src/models/Opportunity.js';
import { Settings } from '../src/models/Settings.js';
import { User } from '../src/models/User.js';
import { Volunteer } from '../src/models/Volunteer.js';
import type { OpportunityDTO, OpportunityListResult } from '../src/services/opportunity.service.js';
import {
  evaluateOpportunityPhase,
  isCheckInWindowOpen,
  parseCairoDateTime,
} from '../src/utils/cairoTime.js';
import type { TestServer } from './helpers.js';
import { apiJson, buildTestDbUri, startTestServer } from './helpers.js';

const TEST_DB_NAME = 'volunteer_hours_test_v2_4';
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

interface ApplicantsResponse {
  applications: Array<ApplicationLean & { volunteer: { volunteerId: string; fullName: string } }>;
  readOnly: boolean;
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

interface StudentAccount extends AccountResult {
  volunteer: mongoose.HydratedDocument<{
    volunteerId: string;
    fullName: string;
    category: VolunteerCategory;
    faculty: Faculty;
  }>;
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
  return { ...account, volunteer };
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

interface SeedOpportunityOverrides {
  startAt?: Date;
  endAt?: Date;
  registrationDeadline?: Date;
  slots?: { student: number; academic: number; admin: number };
  approvalMode?: ApprovalMode;
  status?: OpportunityStatus;
  faculty?: Faculty | null;
  createdBy: mongoose.Types.ObjectId;
  title?: string;
}

async function seedOpportunity(overrides: SeedOpportunityOverrides): Promise<OpportunityLean> {
  const created = await Opportunity.create({
    title: overrides.title ?? 'فرصة تطوعية للاختبار',
    description: 'وصف تفصيلي لفرصة تطوعية مخصصة لاختبارات المرحلة الرابعة',
    requirements: '',
    fields: ['medical'],
    activityType: 'قافلة',
    location: { name: 'مركز خدمة المجتمع', address: 'جامعة المنصورة الأهلية' },
    startAt: overrides.startAt ?? hoursFromNow(48),
    endAt: overrides.endAt ?? hoursFromNow(50),
    registrationDeadline: overrides.registrationDeadline ?? hoursFromNow(24),
    hours: 5,
    contactName: 'د. مسؤول الفرصة',
    contactPhone: '01000000000',
    contactEmail: 'opportunity@mnu.edu.eg',
    faculty: overrides.faculty === undefined ? FACULTY_A : overrides.faculty,
    slots: overrides.slots ?? { student: 1, academic: 0, admin: 0 },
    acceptedCounts: { student: 0, academic: 0, admin: 0 },
    approvalMode: overrides.approvalMode ?? 'auto',
    status: overrides.status ?? 'published',
    createdBy: overrides.createdBy,
  });
  return created.toObject<OpportunityLean>();
}

async function applyFor(token: string, opportunityId: string, baseUrl: string) {
  return apiJson<ApplicationResponse>(baseUrl, `/api/opportunities/${opportunityId}/apply`, token, {
    method: 'POST',
    body: JSON.stringify({ note: '' }),
  });
}

function buildOpportunityPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'فرصة تطوعية جديدة',
    description: 'وصف تفصيلي لفرصة تطوعية جديدة تُستخدم في اختبارات المرحلة الرابعة',
    requirements: '',
    fields: ['education'],
    activityType: 'مبادرة',
    location: { name: 'المبنى الإداري', address: 'جامعة المنصورة الأهلية' },
    startAt: hoursFromNow(72).toISOString(),
    endAt: hoursFromNow(74).toISOString(),
    registrationDeadline: hoursFromNow(48).toISOString(),
    hours: 6,
    contactName: 'د. منسق الفرصة',
    contactPhone: '01111111111',
    contactEmail: 'new.opportunity@mnu.edu.eg',
    faculty: FACULTY_B,
    slots: { student: 2, academic: 0, admin: 0 },
    approvalMode: 'auto',
    ...overrides,
  };
}

describe('Phase V2-4 Opportunities, Capacity & Waitlist Engine', () => {
  let env: AppEnv;
  let apiServer: TestServer;

  before(async () => {
    env = loadEnv();
    await connectDatabase(buildTestDbUri(env.mongoUri, TEST_DB_NAME));
    assert.equal(mongoose.connection.name, TEST_DB_NAME);
    await mongoose.connection.dropDatabase();
    await Promise.all([
      User.init(),
      Volunteer.init(),
      initActivityModel(),
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
      Opportunity.deleteMany({}),
      Application.deleteMany({}),
      Settings.deleteMany({}),
    ]);
  });

  it('evaluates_cairo_phases_and_checkin_windows_at_boundaries', () => {
    const startAt = parseCairoDateTime('2026-11-20T10:00');
    const endAt = parseCairoDateTime('2026-11-20T12:00');
    const registrationDeadline = parseCairoDateTime('2026-11-20T09:00');
    assert.equal(startAt.toISOString(), '2026-11-20T08:00:00.000Z');
    assert.equal(endAt.toISOString(), '2026-11-20T10:00:00.000Z');

    const schedule = { startAt, endAt, registrationDeadline };
    assert.equal(
      evaluateOpportunityPhase(schedule, new Date('2026-11-20T06:59:59.000Z')),
      'upcoming'
    );
    assert.equal(
      evaluateOpportunityPhase(schedule, new Date('2026-11-20T07:00:00.000Z')),
      'registration_closed'
    );
    assert.equal(
      evaluateOpportunityPhase(schedule, new Date('2026-11-20T08:00:00.000Z')),
      'in_progress'
    );
    assert.equal(
      evaluateOpportunityPhase(schedule, new Date('2026-11-20T10:00:00.000Z')),
      'in_progress'
    );
    assert.equal(evaluateOpportunityPhase(schedule, new Date('2026-11-20T10:00:01.000Z')), 'ended');

    assert.equal(isCheckInWindowOpen(schedule, new Date('2026-11-20T07:29:59.000Z')), false);
    assert.equal(isCheckInWindowOpen(schedule, new Date('2026-11-20T07:30:00.000Z')), true);
    assert.equal(isCheckInWindowOpen(schedule, new Date('2026-11-20T10:00:00.000Z')), true);
  });

  it('creates_publishes_and_forces_dean_faculty_ignoring_spoofed_payload', async () => {
    const admin = await createAccount({ email: 'admin@mnu.edu.eg', role: 'admin', faculty: null });
    const deanA = await createAccount({
      email: 'dean.a@mnu.edu.eg',
      role: 'dean',
      faculty: FACULTY_A,
    });
    const student = await createStudent({
      email: 'student.a@mnu.edu.eg',
      volunteerId: 'A-100',
      faculty: FACULTY_A,
    });

    const forbiddenCreate = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      '/api/opportunities',
      student.token,
      { method: 'POST', body: JSON.stringify(buildOpportunityPayload()) }
    );
    assert.equal(forbiddenCreate.status, 403);

    const created = await apiJson<OpportunityResponse>(
      apiServer.baseUrl,
      '/api/opportunities',
      deanA.token,
      { method: 'POST', body: JSON.stringify(buildOpportunityPayload({ faculty: FACULTY_B })) }
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.opportunity.faculty, FACULTY_A);
    assert.equal(created.body.opportunity.status, 'draft');
    assert.equal(created.body.opportunity.phase, 'upcoming');
    assert.equal(created.body.opportunity.acceptedCounts.student, 0);

    const published = await apiJson<OpportunityResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${created.body.opportunity._id}/publish`,
      deanA.token,
      { method: 'POST' }
    );
    assert.equal(published.status, 200);
    assert.equal(published.body.opportunity.status, 'published');

    const studentList = await apiJson<OpportunityListResult>(
      apiServer.baseUrl,
      '/api/opportunities',
      student.token
    );
    assert.equal(studentList.status, 200);
    assert.equal(studentList.body.opportunities.length, 1);
    assert.equal(studentList.body.opportunities[0]._id, created.body.opportunity._id);

    const adminCreated = await apiJson<OpportunityResponse>(
      apiServer.baseUrl,
      '/api/opportunities',
      admin.token,
      { method: 'POST', body: JSON.stringify(buildOpportunityPayload({ faculty: null })) }
    );
    assert.equal(adminCreated.status, 201);
    assert.equal(adminCreated.body.opportunity.faculty, null);
  });

  it('auto_mode_race_accepts_exact_slots_and_waitlists_remainder', async () => {
    const admin = await createAccount({ email: 'admin@mnu.edu.eg', role: 'admin', faculty: null });
    const opportunity = await seedOpportunity({
      createdBy: admin.user._id,
      slots: { student: 2, academic: 0, admin: 0 },
      approvalMode: 'auto',
    });

    const applicants = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        createStudent({
          email: `student${index}@mnu.edu.eg`,
          volunteerId: `A-20${index}`,
          faculty: FACULTY_A,
        })
      )
    );

    const results = await Promise.all(
      applicants.map((applicant) =>
        applyFor(applicant.token, opportunity._id.toString(), apiServer.baseUrl)
      )
    );

    assert.ok(results.every((result) => result.status === 201));
    const statuses = results.map((result) => result.body.application.status);
    assert.equal(statuses.filter((status) => status === 'accepted').length, 2);
    assert.equal(statuses.filter((status) => status === 'waitlisted').length, 3);

    const stored = await Opportunity.findById(opportunity._id).lean<OpportunityLean>();
    assert.ok(stored);
    assert.equal(stored.acceptedCounts.student, 2);

    const acceptedApplications = await Application.countDocuments({
      opportunity: opportunity._id,
      status: 'accepted',
    });
    assert.equal(acceptedApplications, stored.acceptedCounts.student);
  });

  it('auto_withdrawal_promotes_oldest_waitlisted_and_keeps_counters_consistent', async () => {
    const admin = await createAccount({ email: 'admin@mnu.edu.eg', role: 'admin', faculty: null });
    const opportunity = await seedOpportunity({
      createdBy: admin.user._id,
      slots: { student: 1, academic: 0, admin: 0 },
      approvalMode: 'auto',
    });

    const [first, second, third] = await Promise.all([
      createStudent({ email: 'first@mnu.edu.eg', volunteerId: 'A-301', faculty: FACULTY_A }),
      createStudent({ email: 'second@mnu.edu.eg', volunteerId: 'A-302', faculty: FACULTY_A }),
      createStudent({ email: 'third@mnu.edu.eg', volunteerId: 'A-303', faculty: FACULTY_A }),
    ]);

    const firstApply = await applyFor(first.token, opportunity._id.toString(), apiServer.baseUrl);
    const secondApply = await applyFor(second.token, opportunity._id.toString(), apiServer.baseUrl);
    const thirdApply = await applyFor(third.token, opportunity._id.toString(), apiServer.baseUrl);
    assert.equal(firstApply.body.application.status, 'accepted');
    assert.equal(secondApply.body.application.status, 'waitlisted');
    assert.equal(thirdApply.body.application.status, 'waitlisted');

    const withdrawal = await apiJson<ApplicationResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id.toString()}/apply`,
      first.token,
      { method: 'DELETE' }
    );
    assert.equal(withdrawal.status, 200);
    assert.equal(withdrawal.body.application.status, 'cancelled');

    const secondAfterWithdrawal = await Application.findById(
      secondApply.body.application._id
    ).lean<ApplicationLean>();
    const thirdAfterWithdrawal = await Application.findById(
      thirdApply.body.application._id
    ).lean<ApplicationLean>();
    assert.equal(secondAfterWithdrawal?.status, 'accepted');
    assert.equal(thirdAfterWithdrawal?.status, 'waitlisted');

    const afterPromotion = await Opportunity.findById(opportunity._id).lean<OpportunityLean>();
    assert.equal(afterPromotion?.acceptedCounts.student, 1);

    const rejection = await apiJson<ApplicationResponse>(
      apiServer.baseUrl,
      `/api/applications/${secondApply.body.application._id}`,
      admin.token,
      { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) }
    );
    assert.equal(rejection.status, 200);
    assert.equal(rejection.body.application.status, 'rejected');

    const afterRejection = await Opportunity.findById(opportunity._id).lean<OpportunityLean>();
    assert.equal(afterRejection?.acceptedCounts.student, 0);
    const thirdStillWaitlisted = await Application.findById(
      thirdApply.body.application._id
    ).lean<ApplicationLean>();
    assert.equal(thirdStillWaitlisted?.status, 'waitlisted');
  });

  it('manual_mode_keeps_pending_then_accept_conflict_and_release', async () => {
    const admin = await createAccount({ email: 'admin@mnu.edu.eg', role: 'admin', faculty: null });
    const opportunity = await seedOpportunity({
      createdBy: admin.user._id,
      slots: { student: 1, academic: 0, admin: 0 },
      approvalMode: 'manual',
    });

    const [first, second] = await Promise.all([
      createStudent({ email: 'first.manual@mnu.edu.eg', volunteerId: 'A-401', faculty: FACULTY_A }),
      createStudent({
        email: 'second.manual@mnu.edu.eg',
        volunteerId: 'A-402',
        faculty: FACULTY_A,
      }),
    ]);

    const firstApply = await applyFor(first.token, opportunity._id.toString(), apiServer.baseUrl);
    const secondApply = await applyFor(second.token, opportunity._id.toString(), apiServer.baseUrl);
    assert.equal(firstApply.body.application.status, 'pending');
    assert.equal(secondApply.body.application.status, 'pending');

    const opportunityBeforeDecision = await Opportunity.findById(
      opportunity._id
    ).lean<OpportunityLean>();
    assert.equal(opportunityBeforeDecision?.acceptedCounts.student, 0);

    const acceptFirst = await apiJson<ApplicationResponse>(
      apiServer.baseUrl,
      `/api/applications/${firstApply.body.application._id}`,
      admin.token,
      { method: 'PATCH', body: JSON.stringify({ status: 'accepted' }) }
    );
    assert.equal(acceptFirst.status, 200);
    assert.equal(acceptFirst.body.application.status, 'accepted');

    const acceptSecond = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/applications/${secondApply.body.application._id}`,
      admin.token,
      { method: 'PATCH', body: JSON.stringify({ status: 'accepted' }) }
    );
    assert.equal(acceptSecond.status, 409);

    const rejectFirst = await apiJson<ApplicationResponse>(
      apiServer.baseUrl,
      `/api/applications/${firstApply.body.application._id}`,
      admin.token,
      { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) }
    );
    assert.equal(rejectFirst.status, 200);

    const afterReject = await Opportunity.findById(opportunity._id).lean<OpportunityLean>();
    assert.equal(afterReject?.acceptedCounts.student, 0);

    const acceptSecondAgain = await apiJson<ApplicationResponse>(
      apiServer.baseUrl,
      `/api/applications/${secondApply.body.application._id}`,
      admin.token,
      { method: 'PATCH', body: JSON.stringify({ status: 'accepted' }) }
    );
    assert.equal(acceptSecondAgain.status, 200);
    assert.equal(acceptSecondAgain.body.application.status, 'accepted');
  });

  it('enforces_edit_locks_after_acceptance_and_read_only_completed_or_cancelled', async () => {
    const admin = await createAccount({ email: 'admin@mnu.edu.eg', role: 'admin', faculty: null });
    const opportunity = await seedOpportunity({
      createdBy: admin.user._id,
      slots: { student: 2, academic: 0, admin: 0 },
      approvalMode: 'auto',
    });
    const student = await createStudent({
      email: 'accepted@mnu.edu.eg',
      volunteerId: 'A-501',
      faculty: FACULTY_A,
    });
    const applyResult = await applyFor(
      student.token,
      opportunity._id.toString(),
      apiServer.baseUrl
    );
    assert.equal(applyResult.body.application.status, 'accepted');

    const lockedPatches: Array<Record<string, unknown>> = [
      { hours: 8 },
      { endAt: hoursFromNow(80).toISOString() },
      { startAt: hoursFromNow(70).toISOString() },
      { faculty: FACULTY_B },
      { slots: { student: 0 } },
    ];

    for (const patch of lockedPatches) {
      const response = await apiJson<ErrorResponse>(
        apiServer.baseUrl,
        `/api/opportunities/${opportunity._id.toString()}`,
        admin.token,
        { method: 'PATCH', body: JSON.stringify(patch) }
      );
      assert.equal(response.status, 409, `Expected lock conflict for ${JSON.stringify(patch)}`);
    }

    const expandSlots = await apiJson<OpportunityResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id.toString()}`,
      admin.token,
      { method: 'PATCH', body: JSON.stringify({ slots: { student: 3 } }) }
    );
    assert.equal(expandSlots.status, 200);
    assert.equal(expandSlots.body.opportunity.slots.student, 3);

    const retitle = await apiJson<OpportunityResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id.toString()}`,
      admin.token,
      { method: 'PATCH', body: JSON.stringify({ title: 'عنوان محدث للفرصة' }) }
    );
    assert.equal(retitle.status, 200);
    assert.equal(retitle.body.opportunity.title, 'عنوان محدث للفرصة');

    await Opportunity.updateOne({ _id: opportunity._id }, { $set: { status: 'completed' } });
    const completedPatch = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id.toString()}`,
      admin.token,
      { method: 'PATCH', body: JSON.stringify({ title: 'محاولة تعديل بعد الاكتمال' }) }
    );
    assert.equal(completedPatch.status, 409);

    const cancelledOpportunity = await seedOpportunity({
      createdBy: admin.user._id,
      slots: { student: 2, academic: 0, admin: 0 },
    });
    const cancelResponse = await apiJson<OpportunityResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${cancelledOpportunity._id.toString()}/cancel`,
      admin.token,
      { method: 'POST' }
    );
    assert.equal(cancelResponse.status, 200);
    assert.equal(cancelResponse.body.opportunity.status, 'cancelled');
    assert.equal(cancelResponse.body.opportunity.acceptedCounts.student, 0);
  });

  it('withdraw_then_reapply_reactivates_same_application_at_back_of_waitlist', async () => {
    const admin = await createAccount({ email: 'admin@mnu.edu.eg', role: 'admin', faculty: null });
    const opportunity = await seedOpportunity({
      createdBy: admin.user._id,
      slots: { student: 1, academic: 0, admin: 0 },
      approvalMode: 'auto',
    });

    const [first, second, third] = await Promise.all([
      createStudent({
        email: 'reapply.first@mnu.edu.eg',
        volunteerId: 'A-601',
        faculty: FACULTY_A,
      }),
      createStudent({
        email: 'reapply.second@mnu.edu.eg',
        volunteerId: 'A-602',
        faculty: FACULTY_A,
      }),
      createStudent({
        email: 'reapply.third@mnu.edu.eg',
        volunteerId: 'A-603',
        faculty: FACULTY_A,
      }),
    ]);

    const firstApply = await applyFor(first.token, opportunity._id.toString(), apiServer.baseUrl);
    const secondApply = await applyFor(second.token, opportunity._id.toString(), apiServer.baseUrl);
    await applyFor(third.token, opportunity._id.toString(), apiServer.baseUrl);
    assert.equal(firstApply.body.application.status, 'accepted');

    await apiJson<ApplicationResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id.toString()}/apply`,
      first.token,
      { method: 'DELETE' }
    );

    const reapply = await applyFor(first.token, opportunity._id.toString(), apiServer.baseUrl);
    assert.equal(reapply.status, 201);
    assert.equal(reapply.body.application._id, firstApply.body.application._id);
    assert.equal(reapply.body.application.status, 'waitlisted');
    assert.ok(
      new Date(reapply.body.application.appliedAt).getTime() >=
        new Date(secondApply.body.application.appliedAt).getTime()
    );

    const withdrawPromoted = await apiJson<ApplicationResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id.toString()}/apply`,
      second.token,
      { method: 'DELETE' }
    );
    assert.equal(withdrawPromoted.status, 200);

    const firstAfterPromotion = await Application.findById(
      reapply.body.application._id
    ).lean<ApplicationLean>();
    assert.equal(firstAfterPromotion?.status, 'waitlisted');
  });

  it('blocks_rejected_reapplications_zero_slot_categories_deadline_and_faculty_mismatch', async () => {
    const admin = await createAccount({ email: 'admin@mnu.edu.eg', role: 'admin', faculty: null });
    const [studentA, studentB] = await Promise.all([
      createStudent({
        email: 'eligibility.a@mnu.edu.eg',
        volunteerId: 'A-701',
        faculty: FACULTY_A,
      }),
      createStudent({
        email: 'eligibility.b@mnu.edu.eg',
        volunteerId: 'B-701',
        faculty: FACULTY_B,
      }),
    ]);

    const manualOpportunity = await seedOpportunity({
      createdBy: admin.user._id,
      slots: { student: 1, academic: 0, admin: 0 },
      approvalMode: 'manual',
    });

    const wrongFaculty = await applyFor(
      studentB.token,
      manualOpportunity._id.toString(),
      apiServer.baseUrl
    );
    assert.equal(wrongFaculty.status, 404);

    const zeroSlotOpportunity = await seedOpportunity({
      createdBy: admin.user._id,
      slots: { student: 0, academic: 1, admin: 0 },
      approvalMode: 'auto',
    });
    const zeroSlotApply = await applyFor(
      studentA.token,
      zeroSlotOpportunity._id.toString(),
      apiServer.baseUrl
    );
    assert.equal(zeroSlotApply.status, 409);

    const closedOpportunity = await seedOpportunity({
      createdBy: admin.user._id,
      registrationDeadline: hoursFromNow(-1),
      slots: { student: 1, academic: 0, admin: 0 },
      approvalMode: 'auto',
    });
    const closedApply = await applyFor(
      studentA.token,
      closedOpportunity._id.toString(),
      apiServer.baseUrl
    );
    assert.equal(closedApply.status, 409);

    const draftOpportunity = await seedOpportunity({
      createdBy: admin.user._id,
      status: 'draft',
      slots: { student: 1, academic: 0, admin: 0 },
    });
    const draftApply = await applyFor(
      studentA.token,
      draftOpportunity._id.toString(),
      apiServer.baseUrl
    );
    assert.equal(draftApply.status, 404);

    const applyResult = await applyFor(
      studentA.token,
      manualOpportunity._id.toString(),
      apiServer.baseUrl
    );
    assert.equal(applyResult.status, 201);

    const rejectResult = await apiJson<ApplicationResponse>(
      apiServer.baseUrl,
      `/api/applications/${applyResult.body.application._id}`,
      admin.token,
      { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) }
    );
    assert.equal(rejectResult.status, 200);

    const reapplyResult = await applyFor(
      studentA.token,
      manualOpportunity._id.toString(),
      apiServer.baseUrl
    );
    assert.equal(reapplyResult.status, 409);
  });

  it('provides_read_only_dean_applicant_view_on_admin_opportunities', async () => {
    const admin = await createAccount({ email: 'admin@mnu.edu.eg', role: 'admin', faculty: null });
    const deanA = await createAccount({
      email: 'dean.a@mnu.edu.eg',
      role: 'dean',
      faculty: FACULTY_A,
    });
    const deanB = await createAccount({
      email: 'dean.b@mnu.edu.eg',
      role: 'dean',
      faculty: FACULTY_B,
    });

    const [studentA, studentB] = await Promise.all([
      createStudent({ email: 'applicant.a@mnu.edu.eg', volunteerId: 'A-801', faculty: FACULTY_A }),
      createStudent({ email: 'applicant.b@mnu.edu.eg', volunteerId: 'B-801', faculty: FACULTY_B }),
    ]);

    const adminOpportunity = await seedOpportunity({
      createdBy: admin.user._id,
      faculty: null,
      slots: { student: 2, academic: 0, admin: 0 },
      approvalMode: 'manual',
    });
    const applyA = await applyFor(
      studentA.token,
      adminOpportunity._id.toString(),
      apiServer.baseUrl
    );
    const applyB = await applyFor(
      studentB.token,
      adminOpportunity._id.toString(),
      apiServer.baseUrl
    );
    assert.equal(applyA.status, 201);
    assert.equal(applyB.status, 201);

    const deanView = await apiJson<ApplicantsResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${adminOpportunity._id.toString()}/applications`,
      deanA.token
    );
    assert.equal(deanView.status, 200);
    assert.equal(deanView.body.readOnly, true);
    assert.equal(deanView.body.applications.length, 1);
    assert.equal(deanView.body.applications[0].volunteer.volunteerId, 'A-801');

    const deanDecision = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/applications/${applyA.body.application._id}`,
      deanA.token,
      { method: 'PATCH', body: JSON.stringify({ status: 'accepted' }) }
    );
    assert.equal(deanDecision.status, 404);

    const adminDecision = await apiJson<ApplicationResponse>(
      apiServer.baseUrl,
      `/api/applications/${applyA.body.application._id}`,
      admin.token,
      { method: 'PATCH', body: JSON.stringify({ status: 'accepted' }) }
    );
    assert.equal(adminDecision.status, 200);
    assert.equal(adminDecision.body.application.status, 'accepted');

    const deanBOpportunity = await seedOpportunity({
      createdBy: deanB.user._id,
      faculty: FACULTY_B,
      slots: { student: 1, academic: 0, admin: 0 },
    });
    const crossFacultyView = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${deanBOpportunity._id.toString()}/applications`,
      deanA.token
    );
    assert.equal(crossFacultyView.status, 404);

    const deanList = await apiJson<OpportunityListResult>(
      apiServer.baseUrl,
      '/api/opportunities',
      deanA.token
    );
    assert.equal(deanList.status, 200);
    const visibleIds = deanList.body.opportunities.map((entry) => entry._id.toString());
    assert.ok(visibleIds.includes(adminOpportunity._id.toString()));
    assert.equal(visibleIds.includes(deanBOpportunity._id.toString()), false);
  });

  it('concurrent_withdrawals_release_and_promote_exactly_once', async () => {
    const admin = await createAccount({ email: 'admin@mnu.edu.eg', role: 'admin', faculty: null });
    const opportunity = await seedOpportunity({
      createdBy: admin.user._id,
      slots: { student: 1, academic: 0, admin: 0 },
      approvalMode: 'auto',
    });

    const [first, second] = await Promise.all([
      createStudent({
        email: 'race.withdraw.a@mnu.edu.eg',
        volunteerId: 'A-950',
        faculty: FACULTY_A,
      }),
      createStudent({
        email: 'race.withdraw.b@mnu.edu.eg',
        volunteerId: 'A-951',
        faculty: FACULTY_A,
      }),
    ]);

    const firstApply = await applyFor(first.token, opportunity._id.toString(), apiServer.baseUrl);
    const secondApply = await applyFor(second.token, opportunity._id.toString(), apiServer.baseUrl);
    assert.equal(firstApply.body.application.status, 'accepted');
    assert.equal(secondApply.body.application.status, 'waitlisted');

    const withdrawals = await Promise.all([
      apiJson<ApplicationResponse>(
        apiServer.baseUrl,
        `/api/opportunities/${opportunity._id.toString()}/apply`,
        first.token,
        { method: 'DELETE' }
      ),
      apiJson<ApplicationResponse>(
        apiServer.baseUrl,
        `/api/opportunities/${opportunity._id.toString()}/apply`,
        first.token,
        { method: 'DELETE' }
      ),
    ]);

    assert.deepEqual(withdrawals.map((result) => result.status).sort(), [200, 409]);

    const [firstAfter, secondAfter, opportunityAfter] = await Promise.all([
      Application.findById(firstApply.body.application._id).lean<ApplicationLean>(),
      Application.findById(secondApply.body.application._id).lean<ApplicationLean>(),
      Opportunity.findById(opportunity._id).lean<OpportunityLean>(),
    ]);
    assert.equal(firstAfter?.status, 'cancelled');
    assert.equal(secondAfter?.status, 'accepted');
    assert.equal(opportunityAfter?.acceptedCounts.student, 1);
  });

  it('cancels_active_applications_and_resets_accepted_counts', async () => {
    const admin = await createAccount({ email: 'admin@mnu.edu.eg', role: 'admin', faculty: null });
    const student = await createStudent({
      email: 'cancel.applicant@mnu.edu.eg',
      volunteerId: 'A-901',
      faculty: FACULTY_A,
    });
    const opportunity = await seedOpportunity({
      createdBy: admin.user._id,
      slots: { student: 1, academic: 0, admin: 0 },
      approvalMode: 'auto',
    });

    const applyResult = await applyFor(
      student.token,
      opportunity._id.toString(),
      apiServer.baseUrl
    );
    assert.equal(applyResult.body.application.status, 'accepted');

    const cancelResult = await apiJson<OpportunityResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id.toString()}/cancel`,
      admin.token,
      { method: 'POST' }
    );
    assert.equal(cancelResult.status, 200);
    assert.equal(cancelResult.body.opportunity.status, 'cancelled');
    assert.deepEqual(cancelResult.body.opportunity.acceptedCounts, {
      student: 0,
      academic: 0,
      admin: 0,
    });

    const application = await Application.findById(
      applyResult.body.application._id
    ).lean<ApplicationLean>();
    assert.equal(application?.status, 'cancelled');

    const publishCancelled = await apiJson<ErrorResponse>(
      apiServer.baseUrl,
      `/api/opportunities/${opportunity._id.toString()}/publish`,
      admin.token,
      { method: 'POST' }
    );
    assert.equal(publishCancelled.status, 409);
  });
});

function initActivityModel() {
  return import('../src/models/Activity.js').then(({ Activity }) => Activity.init());
}
