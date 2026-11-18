import express from 'express';
import { requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  listStudentApplications,
  updateApplicationStatus,
} from '../services/application.service.js';
import type { ApplicationDecisionInput } from '../validators/application.schema.js';
import { applicationDecisionSchema } from '../validators/application.schema.js';

/**
 * Creates the applications API for student application history and organizer decisions.
 */
export function createApplicationsRouter(): express.Router {
  const router = express.Router();

  router.get('/me', requireRole('student'), async (req, res) => {
    const applications = await listStudentApplications(req.user!);
    res.json({ applications });
  });

  router.use(requireRole('admin', 'dean'));

  router.patch(
    '/:id',
    validateBody<{ id: string }>(applicationDecisionSchema),
    async (req, res) => {
      const application = await updateApplicationStatus(
        req.params.id,
        (req.body as ApplicationDecisionInput).status,
        req.user!
      );
      res.json({ application });
    }
  );

  return router;
}
