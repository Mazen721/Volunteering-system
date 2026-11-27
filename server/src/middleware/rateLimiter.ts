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
  global?: Partial<RateLimitWindowConfig>;
  excelImport?: Partial<RateLimitWindowConfig>;
  report?: Partial<RateLimitWindowConfig>;
}

export interface AppRateLimiters {
  login: RequestHandler;
  register: RequestHandler;
  checkIn: RequestHandler;
  global: RequestHandler;
  excelImport: RequestHandler;
  report: RequestHandler;
}

const DEFAULT_LOGIN_CONFIG: RateLimitWindowConfig = {
  windowMs: 15 * 60 * 1000,
  limit: 20,
};

// Coarse per-IP flood cap for the login route. The strict limit is per
// IP+account (below); this second layer only stops a single source from
// hammering the endpoint across many accounts, without locking out a whole
// campus network that legitimately shares one public IP (NAT). The audit's
// load test showed 300/15 min is low enough for one campus NAT address to
// lock out every student behind it during a login rush, so the flood cap
// is an order of magnitude higher; brute force stays controlled by the
// per-account limit.
const DEFAULT_LOGIN_IP_CONFIG: RateLimitWindowConfig = {
  windowMs: 15 * 60 * 1000,
  limit: 3000,
};

const DEFAULT_REGISTER_CONFIG: RateLimitWindowConfig = {
  windowMs: 15 * 60 * 1000,
  limit: 20,
};

const DEFAULT_CHECKIN_CONFIG: RateLimitWindowConfig = {
  windowMs: 60 * 1000,
  limit: 30,
};

// Global flood guard for the whole API (W-1). Deliberately generous — a
// campus NAT address fronts hundreds of students — and tunable through
// RATE_LIMIT_GLOBAL_MAX so load-test stacks can raise it without a rebuild.
const DEFAULT_GLOBAL_CONFIG: RateLimitWindowConfig = {
  windowMs: 15 * 60 * 1000,
  limit: 3000,
};

const DEFAULT_EXCEL_IMPORT_CONFIG: RateLimitWindowConfig = {
  windowMs: 60 * 60 * 1000,
  limit: 10,
};

const DEFAULT_REPORT_CONFIG: RateLimitWindowConfig = {
  windowMs: 15 * 60 * 1000,
  limit: 120,
};

function envGlobalLimit(): number | undefined {
  const raw = Number(process.env.RATE_LIMIT_GLOBAL_MAX);
  return Number.isInteger(raw) && raw > 0 ? raw : undefined;
}

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
    global: buildRateLimiter(
      { ...DEFAULT_GLOBAL_CONFIG, limit: envGlobalLimit() ?? DEFAULT_GLOBAL_CONFIG.limit },
      overrides.global,
      'تم تجاوز الحد المسموح به للطلبات، يرجى الانتظار والمحاولة لاحقاً'
    ),
    excelImport: buildRateLimiter(
      DEFAULT_EXCEL_IMPORT_CONFIG,
      overrides.excelImport,
      'تم تجاوز الحد المسموح به لعمليات الاستيراد، يرجى الانتظار والمحاولة لاحقاً'
    ),
    report: buildRateLimiter(
      DEFAULT_REPORT_CONFIG,
      overrides.report,
      'تم تجاوز الحد المسموح به لطلبات التقارير، يرجى الانتظار والمحاولة لاحقاً'
    ),
  };
}
