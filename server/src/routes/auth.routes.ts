import express from 'express';
import { validateBody } from '../middleware/validate.js';
import { buildAdminCompat, loginWithCredentials } from '../services/auth.service.js';
import { registerStudent } from '../services/registration.service.js';
import type { LoginInput, RegisterInput } from '../validators/auth.schema.js';
import { loginSchema, registerSchema } from '../validators/auth.schema.js';

export function createPublicAuthRouter(jwtSecret: string): express.Router {
  const router = express.Router();

  router.post('/login', validateBody(loginSchema), async (req, res) => {
    const payload = await loginWithCredentials(req.body as LoginInput, jwtSecret);
    res.json(payload);
  });

  router.post('/register', validateBody(registerSchema), async (req, res) => {
    const payload = await registerStudent(req.body as RegisterInput, jwtSecret);
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

  return router;
}
