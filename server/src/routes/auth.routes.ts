import express from 'express';
import type { RequestHandler } from 'express';
import { validateBody } from '../middleware/validate.js';
import {
  buildAdminCompat,
  isDemoLoginEnabled,
  loginWithCredentials,
  loginWithDemoAccount,
  updateOwnProfile,
} from '../services/auth.service.js';
import { registerStudent } from '../services/registration.service.js';
import { AppError } from '../utils/errors.js';
import type {
  DemoLoginInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from '../validators/auth.schema.js';
import {
  demoLoginSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from '../validators/auth.schema.js';

export interface PublicAuthRouterOptions {
  loginRateLimiter?: RequestHandler;
  registerRateLimiter?: RequestHandler;
  allowedEmailDomains?: readonly string[];
}

const passThroughMiddleware: RequestHandler = (_req, _res, next) => next();

export function createPublicAuthRouter(
  jwtSecret: string,
  options: PublicAuthRouterOptions = {}
): express.Router {
  const router = express.Router();
  const loginLimiter = options.loginRateLimiter ?? passThroughMiddleware;
  const registerLimiter = options.registerRateLimiter ?? passThroughMiddleware;
  const allowedEmailDomains = options.allowedEmailDomains ?? [];

  router.post('/login', loginLimiter, validateBody(loginSchema), async (req, res) => {
    const payload = await loginWithCredentials(req.body as LoginInput, jwtSecret);
    res.json(payload);
  });

  // One-click demo login for showcases. The probe lets the login page show the
  // demo buttons only when the deployment opted in (ENABLE_DEMO_LOGIN=true).
  router.get('/demo-login', (_req, res) => {
    res.json({ enabled: isDemoLoginEnabled() });
  });

  router.post('/demo-login', loginLimiter, validateBody(demoLoginSchema), async (req, res) => {
    if (!isDemoLoginEnabled()) {
      throw new AppError(404, 'الدخول التجريبي غير مفعّل');
    }
    const payload = await loginWithDemoAccount((req.body as DemoLoginInput).account, jwtSecret);
    res.json(payload);
  });

  router.post('/register', registerLimiter, validateBody(registerSchema), async (req, res) => {
    const payload = await registerStudent(
      req.body as RegisterInput,
      jwtSecret,
      allowedEmailDomains
    );
    res.status(201).json(payload);
  });

  return router;
}

export function createProtectedAuthRouter(): express.Router {
  const router = express.Router();

  router.get('/me', (req, res) => {
    const admin = req.user ? buildAdminCompat(req.user) : req.admin;
    res.json(admin ? { user: req.user, admin } : { user: req.user });
  });

  router.patch('/me', validateBody(updateProfileSchema), async (req, res) => {
    const user = await updateOwnProfile(req.user!.id, req.body as UpdateProfileInput);
    res.json({ user });
  });

  return router;
}
