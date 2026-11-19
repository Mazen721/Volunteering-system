import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createAuthMiddleware } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import type { RateLimiterOverrides } from './middleware/rateLimiter.js';
import { createAppRateLimiters } from './middleware/rateLimiter.js';
import { createActivitiesRouter } from './routes/activities.routes.js';
import { createApplicationsRouter } from './routes/applications.routes.js';
import { createProtectedAuthRouter, createPublicAuthRouter } from './routes/auth.routes.js';
import { createExcelRouter } from './routes/excel.routes.js';
import { createOpportunitiesRouter } from './routes/opportunities.routes.js';
import { createRegistrationsRouter } from './routes/registrations.routes.js';
import { createSettingsRouter } from './routes/settings.routes.js';
import { createStatsRouter } from './routes/stats.routes.js';
import { createUsersRouter } from './routes/users.routes.js';
import { createVolunteersRouter } from './routes/volunteers.routes.js';

export interface CreateAppOptions {
  clientUrl: string;
  jwtSecret: string;
  allowedEmailDomains?: readonly string[];
  rateLimit?: RateLimiterOverrides;
}

function parseAllowedOrigins(clientUrl: string): string | string[] {
  const origins = String(clientUrl)
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
}

/**
 * Creates the Express application with security headers, rate limiters, and JWT-protected API routes.
 */
export function createApp({
  clientUrl,
  jwtSecret,
  allowedEmailDomains = [],
  rateLimit,
}: CreateAppOptions): express.Express {
  const app = express();
  // The app always runs behind a single reverse proxy (university VPS Nginx,
  // Railway, or Vercel). Trusting exactly one proxy hop makes req.ip the real
  // client IP, which the rate limiters and any IP logging rely on; without it
  // every user shares the proxy's IP and per-IP limits lock out everyone.
  app.set('trust proxy', 1);
  const rateLimiters = createAppRateLimiters(rateLimit);

  app.use(helmet());
  app.use(cors({ origin: parseAllowedOrigins(clientUrl) }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(
    '/api/auth',
    createPublicAuthRouter(jwtSecret, {
      loginRateLimiter: rateLimiters.login,
      registerRateLimiter: rateLimiters.register,
      allowedEmailDomains,
    })
  );
  app.use('/api', createAuthMiddleware(jwtSecret));
  app.use('/api/auth', createProtectedAuthRouter());
  app.use('/api/users', createUsersRouter());
  app.use('/api/registrations', createRegistrationsRouter());
  app.use('/api/volunteers', createVolunteersRouter());
  app.use('/api/activities', createActivitiesRouter());
  app.use('/api/opportunities', createOpportunitiesRouter(jwtSecret, rateLimiters.checkIn));
  app.use('/api/applications', createApplicationsRouter());
  app.use('/api/stats', createStatsRouter());
  app.use('/api/settings', createSettingsRouter());
  app.use('/api/excel', createExcelRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
