import express from 'express';
import { buildScope, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import type { RegistrationListQuery } from '../services/registration.service.js';
import {
  approveRegistration,
  listRegistrations,
  rejectRegistration,
} from '../services/registration.service.js';
import type {
  ApproveRegistrationInput,
  RejectRegistrationInput,
} from '../validators/registration.schema.js';
import {
  approveRegistrationSchema,
  rejectRegistrationSchema,
} from '../validators/registration.schema.js';

export function createRegistrationsRouter(): express.Router {
  const router = express.Router();
  router.use(requireRole('admin', 'dean'));

  router.get('/', async (req, res) => {
    const payload = await listRegistrations(
      req.query as unknown as RegistrationListQuery,
      buildScope(req.user!)
    );
    res.json(payload);
  });

  router.post(
    '/:userId/approve',
    validateBody<{ userId: string }>(approveRegistrationSchema),
    async (req, res) => {
      const payload = await approveRegistration({
        userId: req.params.userId,
        input: req.body as ApproveRegistrationInput,
        reviewer: req.user!,
        scope: buildScope(req.user!),
      });
      res.json(payload);
    }
  );

  router.post(
    '/:userId/reject',
    validateBody<{ userId: string }>(rejectRegistrationSchema),
    async (req, res) => {
      const payload = await rejectRegistration({
        userId: req.params.userId,
        input: req.body as RejectRegistrationInput,
        scope: buildScope(req.user!),
      });
      res.json(payload);
    }
  );

  return router;
}
