import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import type { Faculty, InterestKey, UserStatus, VolunteerCategory } from '../constants/enums.js';
import { FACULTIES, USER_STATUSES } from '../constants/enums.js';
import type { ScopeFilter } from '../middleware/auth.js';
import { Activity } from '../models/Activity.js';
import type { RegistrationSnapshot, UserLean } from '../models/User.js';
import { User } from '../models/User.js';
import type { VolunteerLean } from '../models/Volunteer.js';
import { Volunteer } from '../models/Volunteer.js';
import { AppError } from '../utils/errors.js';
import type { RegisterInput } from '../validators/auth.schema.js';
import type {
  ApproveRegistrationInput,
  RejectRegistrationInput,
} from '../validators/registration.schema.js';
import type { PublicUser } from './auth.service.js';
import { serializeUser, signAuthToken } from './auth.service.js';

export interface ExistingVolunteerPreview {
  _id: string;
  volunteerId: string;
  fullName: string;
  category: VolunteerCategory;
  faculty: Faculty;
  approvedHours: number;
  approvedActivities: number;
  totalActivities: number;
}

export interface RegistrationQueueItem {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  faculty: Faculty | null;
  volunteer: string | null;
  interests: InterestKey[];
  registration: RegistrationSnapshot;
  facultyMismatch: boolean;
  existingVolunteer: ExistingVolunteerPreview | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface RegistrationListQuery {
  status?: string;
  faculty?: string;
}

export interface ApproveRegistrationParams {
  userId: string;
  input: ApproveRegistrationInput;
  reviewer: PublicUser;
  scope: ScopeFilter;
}

export interface RejectRegistrationParams {
  userId: string;
  input: RejectRegistrationInput;
  scope: ScopeFilter;
}

interface ActivitySummaryRow {
  _id: mongoose.Types.ObjectId;
  approvedHours: number;
  approvedActivities: number;
  totalActivities: number;
}

type PendingRegistrationUser = UserLean & { registration: RegistrationSnapshot };

async function assertNoDuplicateRegistrationClaim(
  email: string,
  volunteerId: string,
  existingVolunteer: VolunteerLean | null
): Promise<void> {
  if (await User.exists({ email })) {
    throw new AppError(409, 'البريد الإلكتروني مسجل مسبقاً');
  }

  const claimedByRegistration = await User.exists({
    'registration.volunteerId': volunteerId,
    status: { $in: ['pending', 'active', 'disabled'] },
  });
  if (claimedByRegistration) {
    throw new AppError(409, 'الرقم التعريفي للمتطوع مسجل أو قيد المراجعة مسبقاً');
  }

  if (existingVolunteer && (await User.exists({ volunteer: existingVolunteer._id }))) {
    throw new AppError(409, 'الرقم التعريفي للمتطوع مسجل أو قيد المراجعة مسبقاً');
  }
}

function assertAllowedEmailDomain(email: string, allowedEmailDomains: readonly string[]): void {
  if (allowedEmailDomains.length === 0) {
    return;
  }
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  if (!allowedEmailDomains.includes(domain)) {
    throw new AppError(400, 'يجب التسجيل باستخدام البريد الإلكتروني التابع للنطاق الجامعي المعتمد');
  }
}

/**
 * Registers a pending student/staff volunteer account and detects faculty mismatch with existing records.
 */
export async function registerStudent(
  input: RegisterInput,
  jwtSecret: string,
  allowedEmailDomains: readonly string[] = []
): Promise<{ token: string; user: PublicUser }> {
  const email = input.email.toLowerCase().trim();
  assertAllowedEmailDomain(email, allowedEmailDomains);
  const volunteerId = input.volunteerId.trim();
  const existingVolunteer = await Volunteer.findOne({ volunteerId }).lean<VolunteerLean>();

  await assertNoDuplicateRegistrationClaim(email, volunteerId, existingVolunteer);

  const facultyMismatch = Boolean(existingVolunteer && existingVolunteer.faculty !== input.faculty);
  const passwordHash = await bcrypt.hash(input.password, 10);

  const created = await User.create({
    email,
    passwordHash,
    fullName: input.fullName.trim(),
    role: 'student',
    faculty: input.faculty,
    status: 'pending',
    volunteer: null,
    registration: {
      volunteerId,
      category: input.category,
      faculty: input.faculty,
      facultyMismatch,
    },
    interests: input.interests,
  });

  const serialized = serializeUser(created.toObject<UserLean>());
  return { token: signAuthToken(serialized, jwtSecret), user: serialized };
}

function buildRegistrationListFilter(
  query: RegistrationListQuery,
  scope: ScopeFilter
): Record<string, unknown> {
  const filter: Record<string, unknown> = { role: 'student', registration: { $ne: null } };

  if (query.status) {
    if (!(USER_STATUSES as readonly string[]).includes(query.status)) {
      throw new AppError(400, 'حالة الحساب غير صالحة');
    }
    filter.status = query.status;
  }

  if (scope.faculty) {
    filter['registration.faculty'] = scope.faculty;
  } else if (query.faculty) {
    if (!(FACULTIES as readonly string[]).includes(query.faculty)) {
      throw new AppError(400, 'الكلية المختارة غير صالحة');
    }
    filter['registration.faculty'] = query.faculty;
  }

  return filter;
}

async function aggregateVolunteerActivityStats(
  volunteerIds: mongoose.Types.ObjectId[]
): Promise<Map<string, ActivitySummaryRow>> {
  const rows = await Activity.aggregate<ActivitySummaryRow>([
    { $match: { volunteer: { $in: volunteerIds } } },
    {
      $group: {
        _id: '$volunteer',
        approvedHours: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$hours', 0] } },
        approvedActivities: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
        totalActivities: { $sum: 1 },
      },
    },
  ]);
  return new Map(rows.map((row) => [row._id.toString(), row]));
}

async function fetchExistingVolunteerPreviews(
  volunteerIds: string[]
): Promise<Map<string, ExistingVolunteerPreview>> {
  if (volunteerIds.length === 0) {
    return new Map();
  }

  const volunteers = await Volunteer.find({ volunteerId: { $in: volunteerIds } }).lean<
    VolunteerLean[]
  >();
  if (volunteers.length === 0) {
    return new Map();
  }

  const statsByObjectId = await aggregateVolunteerActivityStats(
    volunteers.map((volunteer) => volunteer._id)
  );

  return new Map(
    volunteers.map((volunteer) => {
      const stats = statsByObjectId.get(volunteer._id.toString());
      return [
        volunteer.volunteerId,
        {
          _id: volunteer._id.toString(),
          volunteerId: volunteer.volunteerId,
          fullName: volunteer.fullName,
          category: volunteer.category,
          faculty: volunteer.faculty,
          approvedHours: stats?.approvedHours ?? 0,
          approvedActivities: stats?.approvedActivities ?? 0,
          totalActivities: stats?.totalActivities ?? 0,
        },
      ];
    })
  );
}

function toRegistrationQueueItem(
  user: PendingRegistrationUser,
  previews: Map<string, ExistingVolunteerPreview>
): RegistrationQueueItem {
  const existingVolunteer = previews.get(user.registration.volunteerId) ?? null;
  const facultyMismatch = Boolean(
    user.registration.facultyMismatch ||
    (existingVolunteer && existingVolunteer.faculty !== user.registration.faculty)
  );

  return {
    id: user._id.toString(),
    email: user.email,
    fullName: user.fullName,
    status: user.status,
    faculty: user.faculty ?? null,
    volunteer: user.volunteer ? user.volunteer.toString() : null,
    interests: user.interests ?? [],
    registration: { ...user.registration, facultyMismatch },
    facultyMismatch,
    existingVolunteer,
    rejectionReason: user.rejectionReason ?? null,
    approvedAt: user.approvedAt ? user.approvedAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Lists student registration requests scoped by faculty for deans or optionally filtered for admin.
 */
export async function listRegistrations(
  query: RegistrationListQuery,
  scope: ScopeFilter
): Promise<{ registrations: RegistrationQueueItem[] }> {
  const users = await User.find(buildRegistrationListFilter(query, scope))
    .select('-passwordHash')
    .sort({ createdAt: -1 })
    .lean<UserLean[]>();

  const validUsers = users.filter((user): user is PendingRegistrationUser =>
    Boolean(user.registration)
  );
  const previews = await fetchExistingVolunteerPreviews(
    validUsers.map((user) => user.registration.volunteerId)
  );

  return {
    registrations: validUsers.map((user) => toRegistrationQueueItem(user, previews)),
  };
}

async function findScopedPendingRegistration(
  userId: string,
  scope: ScopeFilter
): Promise<PendingRegistrationUser> {
  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError(400, 'معرف طلب التسجيل غير صالح');
  }

  const filter: Record<string, unknown> = {
    _id: userId,
    role: 'student',
    registration: { $ne: null },
    ...(scope.faculty ? { 'registration.faculty': scope.faculty } : {}),
  };

  const user = await User.findOne(filter).select('-passwordHash').lean<UserLean>();
  if (!user || !user.registration) {
    throw new AppError(404, 'طلب التسجيل غير موجود');
  }
  if (user.status !== 'pending') {
    throw new AppError(409, 'تمت مراجعة هذا الطلب مسبقاً');
  }
  return user as PendingRegistrationUser;
}

function assertApprovalAuthorized(
  registration: RegistrationSnapshot,
  existingVolunteer: VolunteerLean | null,
  reviewer: PublicUser,
  facultyOverride?: Faculty
): void {
  const hasMismatch = Boolean(
    registration.facultyMismatch ||
    (existingVolunteer && existingVolunteer.faculty !== registration.faculty)
  );
  if (hasMismatch && reviewer.role === 'dean') {
    throw new AppError(
      403,
      'يوجد تعارض في الكلية مع سجل المتطوع الحالي، يجب اعتماد الطلب من مسؤول النظام فقط'
    );
  }
  if (facultyOverride && reviewer.role !== 'admin') {
    throw new AppError(403, 'غير مصرح لك بتعديل الكلية أثناء الاعتماد');
  }
}

async function resolveOrCreateVolunteerForApproval(
  user: PendingRegistrationUser,
  existingVolunteer: VolunteerLean | null,
  facultyOverride?: Faculty
): Promise<VolunteerLean> {
  if (existingVolunteer) {
    const alreadyLinked = await User.exists({
      volunteer: existingVolunteer._id,
      _id: { $ne: user._id },
    });
    if (alreadyLinked) {
      throw new AppError(409, 'سجل المتطوع مرتبط بحساب مستخدم آخر بالفعل');
    }
    if (!facultyOverride || facultyOverride === existingVolunteer.faculty) {
      return existingVolunteer;
    }
    const updated = await Volunteer.findByIdAndUpdate(
      existingVolunteer._id,
      { $set: { faculty: facultyOverride } },
      { returnDocument: 'after', runValidators: true }
    ).lean<VolunteerLean>();
    if (!updated) {
      throw new AppError(404, 'المتطوع غير موجود');
    }
    return updated;
  }

  const volunteer = await Volunteer.findOneAndUpdate(
    { volunteerId: user.registration.volunteerId },
    {
      $setOnInsert: {
        volunteerId: user.registration.volunteerId,
        fullName: user.fullName,
        category: user.registration.category,
        faculty: facultyOverride ?? user.registration.faculty,
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true }
  ).lean<VolunteerLean>();

  if (!volunteer) {
    throw new AppError(500, 'تعذر إنشاء سجل المتطوع');
  }
  return volunteer;
}

/**
 * Approves a pending student registration, linking or creating the Volunteer record atomically.
 */
export async function approveRegistration({
  userId,
  input,
  reviewer,
  scope,
}: ApproveRegistrationParams): Promise<{ user: PublicUser; volunteer: VolunteerLean }> {
  const user = await findScopedPendingRegistration(userId, scope);
  const existingVolunteer = await Volunteer.findOne({
    volunteerId: user.registration.volunteerId,
  }).lean<VolunteerLean>();

  assertApprovalAuthorized(user.registration, existingVolunteer, reviewer, input.facultyOverride);
  const volunteer = await resolveOrCreateVolunteerForApproval(
    user,
    existingVolunteer,
    input.facultyOverride
  );

  const updatedUser = await User.findOneAndUpdate(
    { _id: user._id, status: 'pending' },
    {
      $set: {
        status: 'active',
        volunteer: volunteer._id,
        faculty: volunteer.faculty,
        approvedBy: new mongoose.Types.ObjectId(reviewer.id),
        approvedAt: new Date(),
        rejectionReason: null,
      },
    },
    { returnDocument: 'after', runValidators: true }
  )
    .select('-passwordHash')
    .lean<UserLean>();

  if (!updatedUser) {
    throw new AppError(409, 'تمت مراجعة هذا الطلب مسبقاً');
  }
  return { user: serializeUser(updatedUser), volunteer };
}

/**
 * Rejects a pending student registration with an Arabic reason.
 */
export async function rejectRegistration({
  userId,
  input,
  scope,
}: RejectRegistrationParams): Promise<{ user: PublicUser }> {
  const user = await findScopedPendingRegistration(userId, scope);

  const updatedUser = await User.findOneAndUpdate(
    { _id: user._id, status: 'pending' },
    {
      $set: {
        status: 'rejected',
        rejectionReason: input.rejectionReason.trim(),
        approvedBy: null,
        approvedAt: null,
      },
    },
    { returnDocument: 'after', runValidators: true }
  )
    .select('-passwordHash')
    .lean<UserLean>();

  if (!updatedUser) {
    throw new AppError(409, 'تمت مراجعة هذا الطلب مسبقاً');
  }
  return { user: serializeUser(updatedUser) };
}
