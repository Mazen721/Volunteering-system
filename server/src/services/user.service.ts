import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import type { Faculty, UserRole, UserStatus } from '../constants/enums.js';
import { FACULTIES, USER_ROLES, USER_STATUSES } from '../constants/enums.js';
import type { ScopeFilter } from '../middleware/auth.js';
import type { UserLean } from '../models/User.js';
import { User } from '../models/User.js';
import { Volunteer } from '../models/Volunteer.js';
import { AppError } from '../utils/errors.js';
import type { CreateDeanInput, UpdateUserInput } from '../validators/user.schema.js';
import type { PublicUser } from './auth.service.js';
import { serializeUser } from './auth.service.js';

export interface UserListQuery {
  role?: string;
  faculty?: string;
  status?: string;
}

export interface UpdateUserAccountParams {
  targetUserId: string;
  input: UpdateUserInput;
  actor: PublicUser;
  scope: ScopeFilter;
}

function buildUserListFilter(query: UserListQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (query.role) {
    if (!(USER_ROLES as readonly string[]).includes(query.role)) {
      throw new AppError(400, 'نوع الحساب غير صالح');
    }
    filter.role = query.role as UserRole;
  }

  if (query.faculty) {
    if (!(FACULTIES as readonly string[]).includes(query.faculty)) {
      throw new AppError(400, 'الكلية المختارة غير صالحة');
    }
    filter.faculty = query.faculty as Faculty;
  }

  if (query.status) {
    if (!(USER_STATUSES as readonly string[]).includes(query.status)) {
      throw new AppError(400, 'حالة الحساب غير صالحة');
    }
    filter.status = query.status as UserStatus;
  }

  return filter;
}

/**
 * Lists user accounts filtered by optional role, faculty, and status (admin only).
 */
export async function listUsers(query: UserListQuery = {}): Promise<{ users: PublicUser[] }> {
  const users = await User.find(buildUserListFilter(query))
    .select('-passwordHash')
    .sort({ createdAt: -1 })
    .lean<UserLean[]>();

  return { users: users.map(serializeUser) };
}

/**
 * Creates an active faculty dean account with a hashed initial password (admin only).
 */
export async function createDeanAccount(input: CreateDeanInput): Promise<{ user: PublicUser }> {
  const email = input.email.toLowerCase().trim();
  if (await User.exists({ email })) {
    throw new AppError(409, 'البريد الإلكتروني مسجل مسبقاً');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const created = await User.create({
    email,
    passwordHash,
    fullName: input.fullName.trim(),
    role: 'dean',
    faculty: input.faculty,
    status: 'active',
    volunteer: null,
    registration: null,
    interests: [],
  });

  return { user: serializeUser(created.toObject<UserLean>()) };
}

async function buildDeanScopedUpdate(
  targetUser: UserLean,
  input: UpdateUserInput,
  scope: ScopeFilter
): Promise<Record<string, unknown>> {
  if (targetUser.role !== 'student' || targetUser.faculty !== scope.faculty) {
    throw new AppError(404, 'المستخدم غير موجود');
  }
  if (
    input.status !== undefined ||
    input.fullName !== undefined ||
    input.faculty !== undefined
  ) {
    throw new AppError(403, 'غير مصرح لك بتعديل هذا الحقل، يمكنك إعادة تعيين كلمة المرور المؤقتة فقط');
  }
  if (!input.temporaryPassword) {
    throw new AppError(400, 'كلمة المرور المؤقتة مطلوبة');
  }
  return { passwordHash: await bcrypt.hash(input.temporaryPassword, 10) };
}

async function buildAdminUpdate(
  targetUser: UserLean,
  input: UpdateUserInput
): Promise<Record<string, unknown>> {
  if (targetUser.role === 'admin') {
    throw new AppError(403, 'لا يمكن تعديل حساب مسؤول النظام من هذه الواجهة');
  }

  const updates: Record<string, unknown> = {};
  if (input.status !== undefined) {
    if (targetUser.status === 'pending' || targetUser.status === 'rejected') {
      throw new AppError(409, 'يرجى مراجعة طلب التسجيل من قائمة الطلبات أولاً');
    }
    updates.status = input.status;
  }
  if (input.fullName !== undefined) {
    updates.fullName = input.fullName.trim();
  }
  if (input.faculty !== undefined) {
    updates.faculty = input.faculty;
  }
  if (input.temporaryPassword !== undefined) {
    updates.passwordHash = await bcrypt.hash(input.temporaryPassword, 10);
  }
  return updates;
}

/**
 * Updates user account status, profile, or temporary password according to caller role and faculty scope.
 */
export async function updateUserAccount({
  targetUserId,
  input,
  actor,
  scope,
}: UpdateUserAccountParams): Promise<{ user: PublicUser }> {
  if (!mongoose.isValidObjectId(targetUserId)) {
    throw new AppError(400, 'معرف المستخدم غير صالح');
  }

  const targetUser = await User.findById(targetUserId).select('-passwordHash').lean<UserLean>();
  if (!targetUser) {
    throw new AppError(404, 'المستخدم غير موجود');
  }

  const updates =
    actor.role === 'dean'
      ? await buildDeanScopedUpdate(targetUser, input, scope)
      : await buildAdminUpdate(targetUser, input);

  const updated = await User.findByIdAndUpdate(
    targetUser._id,
    { $set: updates },
    { returnDocument: 'after', runValidators: true }
  )
    .select('-passwordHash')
    .lean<UserLean>();

  if (!updated) {
    throw new AppError(404, 'المستخدم غير موجود');
  }

  if (input.faculty !== undefined && targetUser.role === 'student' && targetUser.volunteer) {
    await Volunteer.updateOne(
      { _id: targetUser.volunteer },
      { $set: { faculty: input.faculty } }
    );
  }

  return { user: serializeUser(updated) };
}
