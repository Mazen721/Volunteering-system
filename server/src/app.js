import express from 'express';
import cors from 'cors';
import { createAuthMiddleware } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createActivitiesRouter } from './routes/activities.routes.js';
import { createProtectedAuthRouter, createPublicAuthRouter } from './routes/auth.routes.js';
import { createExcelRouter } from './routes/excel.routes.js';
import { createStatsRouter } from './routes/stats.routes.js';
import { createVolunteersRouter } from './routes/volunteers.routes.js';

/**
 * Creates the Express application with public health/login routes and JWT-protected API routes.
 * @param {{ clientUrl: string, jwtSecret: string }} options
 * @returns {import('express').Express}
 */
export function createApp({ clientUrl, jwtSecret }) {
  const app = express();

  app.use(cors({ origin: clientUrl }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', createPublicAuthRouter(jwtSecret));
  app.use('/api', createAuthMiddleware(jwtSecret));
  app.use('/api/auth', createProtectedAuthRouter());
  app.use('/api/volunteers', createVolunteersRouter());
  app.use('/api/activities', createActivitiesRouter());
  app.use('/api/stats', createStatsRouter());
  app.use('/api/excel', createExcelRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
