import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Faculty, InterestKey, UserRole, UserStatus } from '../constants/enums.js';
import type { RegistrationSnapshot, UserLean } from '../models/User.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/errors.js';
import type { LoginInput, UpdateProfileInput } from '../validators/auth.schema.js';

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  faculty: Faculty | null;
  volunteer: string | null;
  interests: InterestKey[];
  registration: RegistrationSnapshot | null;
  rejectionReason: string | null;
  lastLoginAt: string | null;
}

export interface AdminCompatIdentity {
  id: string;
  email: string;
}

export interface LoginResult {
  token: string;
  user: PublicUser;
  admin?: AdminCompatIdentity;
}

/**
 * Serializes a User document into a safe public representation without passwordHash.
 */
export function serializeUser(user: UserLean): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
    faculty: user.faculty ?? null,
    volunteer: user.volunteer ? user.volunteer.toString() : null,
    interests: user.interests ?? [],
    registration: user.registration ?? null,
    rejectionReason: user.rejectionReason ?? null,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}

/**
 * Returns the legacy v1 admin summary only when the authenticated user has the admin role.
 */
export function buildAdminCompat(user: PublicUser): AdminCompatIdentity | undefined {
  return user.role === 'admin' ? { id: user.id, email: user.email } : undefined;
}

/**
 * Signs a role-scoped authentication JWT for a serialized user.
 */
export function signAuthToken(user: PublicUser, jwtSecret: string): string {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, jwtSecret, {
    expiresIn: '7d',
  });
}

/**
 * Authenticates a user by email and password, updates lastLoginAt, and issues a role-scoped JWT.
 */
export async function loginWithCredentials(
  credentials: LoginInput,
  jwtSecret: string
): Promise<LoginResult> {
  const email = credentials.email.toLowerCase();
  const user = await User.findOne({ email }).lean<UserLean>();
  if (!user) {
    throw new AppError(401, 'بيانات الدخول غير صحيحة');
  }

  const passwordMatches = await bcrypt.compare(credentials.password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError(401, 'بيانات الدخول غير صحيحة');
  }

  if (user.status === 'disabled') {
    throw new AppError(403, 'تم تعطيل الحساب');
  }

  const now = new Date();
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: now } });

  const serialized = serializeUser({ ...user, lastLoginAt: now });
  const token = signAuthToken(serialized, jwtSecret);
  const admin = buildAdminCompat(serialized);

  return admin ? { token, user: serialized, admin } : { token, user: serialized };
}

/**
 * Updates the authenticated user's interests and/or password after verifying the current password.
 */
export async function updateOwnProfile(
  userId: string,
  input: UpdateProfileInput
): Promise<PublicUser> {
  const updates: Record<string, unknown> = {};

  if (input.interests !== undefined) {
    updates.interests = input.interests;
  }

  if (input.newPassword) {
    const current = await User.findById(userId).select('passwordHash').lean<UserLean>();
    if (!current) {
      throw new AppError(401, 'جلسة الدخول غير صالحة أو منتهية');
    }

    const passwordMatches = await bcrypt.compare(input.currentPassword ?? '', current.passwordHash);
    if (!passwordMatches) {
      throw new AppError(400, 'كلمة المرور الحالية غير صحيحة');
    }

    updates.passwordHash = await bcrypt.hash(input.newPassword, 10);
  }

  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: updates },
    { returnDocument: 'after', runValidators: true }
  )
    .select('-passwordHash')
    .lean<UserLean>();

  if (!updated) {
    throw new AppError(401, 'جلسة الدخول غير صالحة أو منتهية');
  }

  return serializeUser(updated);
}
