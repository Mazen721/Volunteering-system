import express from 'express';
import { validateBody } from '../middleware/validate.js';
import {
  createVolunteer,
  deleteVolunteer,
  getVolunteerProfile,
  listVolunteers,
  updateVolunteer,
} from '../services/volunteer.service.js';
import { volunteerSchema, volunteerUpdateSchema } from '../validators/volunteer.schema.js';

export function createVolunteersRouter() {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const result = await listVolunteers(req.query);
    res.json(result);
  });

  router.get('/:volunteerId', async (req, res) => {
    const profile = await getVolunteerProfile(req.params.volunteerId);
    res.json(profile);
  });

  router.post('/', validateBody(volunteerSchema), async (req, res) => {
    const volunteer = await createVolunteer(req.body);
    res.status(201).json({ volunteer });
  });

  router.put('/:volunteerId', validateBody(volunteerUpdateSchema), async (req, res) => {
    const volunteer = await updateVolunteer(req.params.volunteerId, req.body);
    res.json({ volunteer });
  });

  router.delete('/:volunteerId', async (req, res) => {
    const payload = await deleteVolunteer(req.params.volunteerId);
    res.json(payload);
  });

  return router;
}
