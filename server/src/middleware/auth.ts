import type { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { Faculty, UserRole, UserStatus } from '../constants/enums.js';
import { USER_ROLES } from '../constants/enums.js';
import type { UserLean } from '../models/User.js';
import { User } from '../models/User.js';
import type { PublicUser } from '../services/auth.service.js';
import { buildAdminCompat, serializeUser } from '../services/auth.service.js';
import { AppError } from '../utils/errors.js';

export interface ScopeFilter {
  faculty?: Faculty;
}

declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
      admin?: { id: string; email: string };
    }
  }
}

const NON_ACTIVE_STATUS_MESSAGES: Record<Exclude<UserStatus, 'active'>, string> = {
  pending: 'حسابك قيد المراجعة',
  rejected: 'تم رفض طلب التسجيل',
  disabled: 'تم تعطيل الحساب',
};

function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authorizationHeader.slice('Bearer '.length).trim();
  return token || null;
}

function verifyAuthSubject(token: string, jwtSecret: string): string | null {
  try {
    const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      return null;
    }
    if ('type' in payload && payload.type !== undefined) {
      return null;
    }
    if (
      'role' in payload &&
      payload.role !== undefined &&
      !(USER_ROLES as readonly string[]).includes(String(payload.role))
    ) {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}

function isAuthMePath(req: Request): boolean {
  const normalizedOriginal = req.originalUrl.split('?')[0].replace(/\/+$/, '');
  const normalizedPath = req.path.replace(/\/+$/, '');
  return normalizedOriginal === '/api/auth/me' || normalizedPath === '/auth/me';
}

function isAuthMeRequest(req: Request): boolean {
  return req.method === 'GET' && isAuthMePath(req);
}

const PENDING_PARTICIPATION_PATH = /^\/opportunities\/[^/]+\/(apply|checkin)$/;

/**
 * Apply/check-in attempts pass the status gate so the services can reject them
 * with their specific locked messages.
 */
function isPendingParticipationRequest(req: Request): boolean {
  if (req.method !== 'POST') {
    return false;
  }
  const paths = [req.originalUrl.split('?')[0], req.path].map((value) =>
    value.replace(/\/+$/, '').replace(/^\/api/, '')
  );
  return paths.some((path) => PENDING_PARTICIPATION_PATH.test(path));
}

/**
 * Pending students may browse (any GET), update their own profile (PATCH /api/auth/me),
 * and attempt apply/check-in, which the services reject with HTTP 403.
 */
function isPendingAllowedRequest(req: Request): boolean {
  if (req.method === 'GET') {
    return true;
  }
  if (req.method === 'PATCH' && isAuthMePath(req)) {
    return true;
  }
  return isPendingParticipationRequest(req);
}

/**
 * Verifies the Bearer JWT, reloads the live User from MongoDB, and enforces account status
 * on protected routes: GET /api/auth/me is always allowed, pending students may browse,
 * and every other non-active request is rejected.
 */
export function createAuthMiddleware(jwtSecret: string): RequestHandler {
  return async (req, _res, next) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      next(new AppError(401, 'يجب تسجيل الدخول أولاً'));
      return;
    }

    const subject = verifyAuthSubject(token, jwtSecret);
    if (!subject) {
      next(new AppError(401, 'جلسة الدخول غير صالحة أو منتهية'));
      return;
    }

    const user = await User.findById(subject).select('-passwordHash').lean<UserLean>();
    if (!user) {
      next(new AppError(401, 'جلسة الدخول غير صالحة أو منتهية'));
      return;
    }

    const serialized = serializeUser(user);
    req.user = serialized;
    req.admin = buildAdminCompat(serialized);

    if (
      serialized.status !== 'active' &&
      !isAuthMeRequest(req) &&
      !(serialized.status === 'pending' && isPendingAllowedRequest(req))
    ) {
      next(new AppError(403, NON_ACTIVE_STATUS_MESSAGES[serialized.status]));
      return;
    }

    next();
  };
}

/**
 * Restricts route access to users holding one of the specified roles. Active users pass;
 * pending students also pass so they can browse student routes, while participation
 * writes remain guarded in the services.
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    const hasStatusAccess =
      user?.status === 'active' || (user?.status === 'pending' && user.role === 'student');
    if (!user || !hasStatusAccess || !roles.includes(user.role)) {
      next(new AppError(403, 'غير مصرح لك بالوصول إلى هذا المورد'));
      return;
    }
    next();
  };
}

/**
 * Computes the MongoDB faculty scope filter for the authenticated user.
 */
export function buildScope(user: Pick<PublicUser, 'role' | 'faculty'>): ScopeFilter {
  if (user.role === 'admin') {
    return {};
  }
  if (!user.faculty) {
    throw new AppError(403, 'غير مصرح لك بالوصول إلى هذا المورد');
  }
  return { faculty: user.faculty };
}
