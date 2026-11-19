import type { Request, RequestHandler } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

export interface RateLimitWindowConfig {
  windowMs: number;
  limit: number;
}

export interface RateLimiterOverrides {
  login?: Partial<RateLimitWindowConfig>;
  loginIp?: Partial<RateLimitWindowConfig>;
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

// Coarse per-IP flood cap for the login route. The strict limit is per
// IP+account (below); this second layer only stops a single source from
// hammering the endpoint across many accounts, without locking out a whole
// campus network that legitimately shares one public IP (NAT).
const DEFAULT_LOGIN_IP_CONFIG: RateLimitWindowConfig = {
  windowMs: 15 * 60 * 1000,
  limit: 300,
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
  message: string,
  keyGenerator?: (req: Request) => string
): RequestHandler {
  return rateLimit({
    windowMs: overrides?.windowMs ?? defaults.windowMs,
    limit: overrides?.limit ?? defaults.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    statusCode: 429,
    message: { message },
    ...(keyGenerator ? { keyGenerator } : {}),
  });
}

function composeHandlers(...handlers: RequestHandler[]): RequestHandler {
  return (req, res, next) => {
    let index = 0;
    const run = (err?: unknown): void => {
      if (err) {
        next(err);
        return;
      }
      const handler = handlers[index];
      index += 1;
      if (!handler) {
        next();
        return;
      }
      handler(req, res, run);
    };
    run();
  };
}

function loginAccountKey(req: Request): string {
  const email =
    typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return `${ipKeyGenerator(req.ip ?? '')}:${email}`;
}

function checkInUserKey(req: Request): string {
  return req.user?.id ?? ipKeyGenerator(req.ip ?? '');
}

/**
 * Creates configurable rate-limiting middleware for login, registration, and QR check-in endpoints.
 *
 * Login is limited per IP+account (not per IP alone) so students sharing a
 * campus NAT address cannot lock each other out, with a coarse per-IP cap on
 * top against floods. Check-in is limited per authenticated user for the same
 * reason: a whole event crowd checks in from one venue network.
 */
export function createAppRateLimiters(overrides: RateLimiterOverrides = {}): AppRateLimiters {
  const loginMessage =
    'تم تجاوز الحد المسموح به لمحاولات تسجيل الدخول، يرجى الانتظار والمحاولة لاحقاً';
  return {
    login: composeHandlers(
      buildRateLimiter(DEFAULT_LOGIN_IP_CONFIG, overrides.loginIp, loginMessage),
      buildRateLimiter(DEFAULT_LOGIN_CONFIG, overrides.login, loginMessage, loginAccountKey)
    ),
    register: buildRateLimiter(
      DEFAULT_REGISTER_CONFIG,
      overrides.register,
      'تم تجاوز الحد المسموح به لطلبات التسجيل، يرجى الانتظار والمحاولة لاحقاً'
    ),
    checkIn: buildRateLimiter(
      DEFAULT_CHECKIN_CONFIG,
      overrides.checkIn,
      'تم تجاوز الحد المسموح به لمحاولات تسجيل الحضور، يرجى الانتظار قليلاً ثم المحاولة مرة أخرى',
      checkInUserKey
    ),
  };
}
