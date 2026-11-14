import express from 'express';
import cors from 'cors';

/**
 * Creates the Express application with CORS, JSON parsing, and health endpoint.
 * @param {string} clientUrl
 * @returns {import('express').Express}
 */
export function createApp(clientUrl) {
  const app = express();

  app.use(cors({ origin: clientUrl }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
