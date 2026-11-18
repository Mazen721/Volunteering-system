import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';

export interface RateLimitWindowConfig {
  windowMs: number;
  limit: number;
}

export interface RateLimiterOverrides {
  login?: Partial<RateLimitWindowConfig>;
  register?: Partial<RateLimitWindowConfig>;
  checkIn?: Partial<RateLimitWindowConfig>;
}

export interface AppRateLimiters {
  login: RequestHandler;
  register: RequestHandler;
  checkIn: RequestHandler;
}

const DEFAULT_LOGIN_CONFIG: RateLimitWindowConfig = {
  windowMs: 15 * 60 * 1000,
  limit: 20,
};

const DEFAULT_REGISTER_CONFIG: RateLimitWindowConfig = {
  windowMs: 15 * 60 * 1000,
  limit: 20,
};

const DEFAULT_CHECKIN_CONFIG: RateLimitWindowConfig = {
  windowMs: 60 * 1000,
  limit: 30,
};

function buildRateLimiter(
  defaults: RateLimitWindowConfig,
  overrides: Partial<RateLimitWindowConfig> | undefined,
  message: string
): RequestHandler {
  return rateLimit({
    windowMs: overrides?.windowMs ?? defaults.windowMs,
    limit: overrides?.limit ?? defaults.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    statusCode: 429,
    message: { message },
  });
}

/**
 * Creates configurable rate-limiting middleware for login, registration, and QR check-in endpoints.
 */
export function createAppRateLimiters(overrides: RateLimiterOverrides = {}): AppRateLimiters {
  return {
    login: buildRateLimiter(
      DEFAULT_LOGIN_CONFIG,
      overrides.login,
      'تم تجاوز الحد المسموح به لمحاولات تسجيل الدخول، يرجى الانتظار والمحاولة لاحقاً'
    ),
    register: buildRateLimiter(
      DEFAULT_REGISTER_CONFIG,
      overrides.register,
      'تم تجاوز الحد المسموح به لطلبات التسجيل، يرجى الانتظار والمحاولة لاحقاً'
    ),
    checkIn: buildRateLimiter(
      DEFAULT_CHECKIN_CONFIG,
      overrides.checkIn,
      'تم تجاوز الحد المسموح به لمحاولات تسجيل الحضور، يرجى الانتظار قليلاً ثم المحاولة مرة أخرى'
    ),
  };
}
