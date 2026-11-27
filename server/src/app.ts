import express from 'express';
import compression from 'compression';
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
import { createNotificationsRouter } from './routes/notifications.routes.js';
import { createOpportunitiesRouter } from './routes/opportunities.routes.js';
import { createRegistrationsRouter } from './routes/registrations.routes.js';
import { createSettingsRouter } from './routes/settings.routes.js';
import { createStatsRouter } from './routes/stats.routes.js';
import { createUsersRouter } from './routes/users.routes.js';
import { createVolunteersRouter } from './routes/volunteers.routes.js';
import { getOpportunityCoverImage } from './services/opportunity.service.js';

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
  // gzip for API responses: list payloads are JSON-heavy and were shipped
  // uncompressed (the audit measured the board call at ~752 KB raw).
  app.use(compression());
  // 2 MB so an uploaded opportunity cover (a downscaled data URL of at most
  // ~1 MB of image data, validated per-field) fits in the JSON body.
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Public cover images (see getOpportunityCoverImage): mounted before the
  // JWT middleware because <img> tags cannot send Authorization headers.
  // ETag revalidation keeps repeat views at a 304.
  app.get('/api/opportunities/:id/cover', async (req, res, next) => {
    try {
      const image = await getOpportunityCoverImage(req.params.id);
      if (!image) {
        res.status(404).json({ message: 'الصورة غير موجودة' });
        return;
      }
      res.setHeader('Content-Type', image.contentType);
      res.setHeader('ETag', image.etag);
      res.setHeader('Cache-Control', 'private, no-cache');
      // The client is served from a different origin (Vercel vs the API
      // host), and helmet's default same-origin resource policy would make
      // the browser refuse to render this <img> at all. This public display
      // asset is explicitly cross-origin embeddable.
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      if (req.headers['if-none-match'] === image.etag) {
        res.status(304).end();
        return;
      }
      res.send(image.body);
    } catch (error) {
      next(error);
    }
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
  // Global flood guard + heavier-endpoint limiters (W-1). Mounted after the
  // public auth routes and the health/cover endpoints above.
  app.use('/api', rateLimiters.global);
  app.use('/api/excel/import', rateLimiters.excelImport);
  app.use('/api/stats/report', rateLimiters.report);

  app.use('/api/auth', createProtectedAuthRouter());
  app.use('/api/users', createUsersRouter());
  app.use('/api/registrations', createRegistrationsRouter());
  app.use('/api/volunteers', createVolunteersRouter());
  app.use('/api/activities', createActivitiesRouter());
  app.use('/api/opportunities', createOpportunitiesRouter(jwtSecret, rateLimiters.checkIn));
  app.use('/api/applications', createApplicationsRouter());
  app.use('/api/stats', createStatsRouter());
  app.use('/api/notifications', createNotificationsRouter());
  app.use('/api/settings', createSettingsRouter());
  app.use('/api/excel', createExcelRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
