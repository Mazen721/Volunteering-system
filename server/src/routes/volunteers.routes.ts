import type { RequestHandler } from 'express';
import express from 'express';
import { buildScope, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import type { VolunteerListQuery } from '../services/volunteer.service.js';
import {
  createVolunteer,
  deleteVolunteer,
  getVolunteerProfile,
  listVolunteers,
  updateVolunteer,
} from '../services/volunteer.service.js';
import type { VolunteerInput, VolunteerUpdateInput } from '../validators/volunteer.schema.js';
import { volunteerSchema, volunteerUpdateSchema } from '../validators/volunteer.schema.js';

function createDeanFacultyBodyEnforcer<P = Record<string, string>>(): RequestHandler<P> {
  return (req, _res, next) => {
    if (req.user?.role === 'dean' && req.user.faculty && req.body && typeof req.body === 'object') {
      (req.body as Record<string, unknown>).faculty = req.user.faculty;
    }
    next();
  };
}

export function createVolunteersRouter(): express.Router {
  const router = express.Router();
  router.use(requireRole('admin', 'dean'));

  router.get('/', async (req, res) => {
    const result = await listVolunteers(
      req.query as unknown as VolunteerListQuery,
      buildScope(req.user!)
    );
    res.json(result);
  });

  router.get('/:volunteerId', async (req, res) => {
    const profile = await getVolunteerProfile(req.params.volunteerId, buildScope(req.user!));
    res.json(profile);
  });

  router.post(
    '/',
    createDeanFacultyBodyEnforcer(),
    validateBody(volunteerSchema),
    async (req, res) => {
      const volunteer = await createVolunteer(
        req.body as VolunteerInput,
        buildScope(req.user!)
      );
      res.status(201).json({ volunteer });
    }
  );

  router.put(
    '/:volunteerId',
    createDeanFacultyBodyEnforcer<{ volunteerId: string }>(),
    validateBody<{ volunteerId: string }>(volunteerUpdateSchema),
    async (req, res) => {
      const volunteer = await updateVolunteer(
        req.params.volunteerId,
        req.body as VolunteerUpdateInput,
        buildScope(req.user!)
      );
      res.json({ volunteer });
    }
  );

  router.delete('/:volunteerId', async (req, res) => {
    const payload = await deleteVolunteer(req.params.volunteerId, buildScope(req.user!));
    res.json(payload);
  });

  return router;
}
