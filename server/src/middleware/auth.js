import jwt from 'jsonwebtoken';
import { Admin } from '../models/Admin.js';
import { AppError } from '../utils/errors.js';

function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authorizationHeader.slice('Bearer '.length).trim();
  return token || null;
}

/**
 * Verifies the JWT Bearer token and attaches the authenticated admin to req.admin.
 * @param {string} jwtSecret
 */
export function createAuthMiddleware(jwtSecret) {
  return async (req, _res, next) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      next(new AppError(401, 'يجب تسجيل الدخول أولاً'));
      return;
    }

    let payload;
    try {
      payload = jwt.verify(token, jwtSecret);
    } catch {
      next(new AppError(401, 'جلسة الدخول غير صالحة أو منتهية'));
      return;
    }

    const admin = await Admin.findById(payload.sub).select('-passwordHash').lean();
    if (!admin) {
      next(new AppError(401, 'جلسة الدخول غير صالحة أو منتهية'));
      return;
    }

    req.admin = { id: admin._id.toString(), email: admin.email };
    next();
  };
}
