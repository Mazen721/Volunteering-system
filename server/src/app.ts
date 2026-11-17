import express from 'express';
import cors from 'cors';
import { createAuthMiddleware } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createActivitiesRouter } from './routes/activities.routes.js';
import { createProtectedAuthRouter, createPublicAuthRouter } from './routes/auth.routes.js';
import { createExcelRouter } from './routes/excel.routes.js';
import { createRegistrationsRouter } from './routes/registrations.routes.js';
import { createSettingsRouter } from './routes/settings.routes.js';
import { createStatsRouter } from './routes/stats.routes.js';
import { createUsersRouter } from './routes/users.routes.js';
import { createVolunteersRouter } from './routes/volunteers.routes.js';

export interface CreateAppOptions {
  clientUrl: string;
  jwtSecret: string;
}

function parseAllowedOrigins(clientUrl: string): string | string[] {
  const origins = String(clientUrl)
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
}

/**
 * Creates the Express application with public health/login routes and JWT-protected API routes.
 */
export function createApp({ clientUrl, jwtSecret }: CreateAppOptions): express.Express {
  const app = express();

  app.use(cors({ origin: parseAllowedOrigins(clientUrl) }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', createPublicAuthRouter(jwtSecret));
  app.use('/api', createAuthMiddleware(jwtSecret));
  app.use('/api/auth', createProtectedAuthRouter());
  app.use('/api/users', createUsersRouter());
  app.use('/api/registrations', createRegistrationsRouter());
  app.use('/api/volunteers', createVolunteersRouter());
  app.use('/api/activities', createActivitiesRouter());
  app.use('/api/stats', createStatsRouter());
  app.use('/api/settings', createSettingsRouter());
  app.use('/api/excel', createExcelRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
