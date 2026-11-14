import express from 'express';
import { validateBody } from '../middleware/validate.js';
import {
  createActivity,
  deleteActivity,
  listActivities,
  updateActivity,
  updateActivityStatus,
} from '../services/activity.service.js';
import {
  activitySchema,
  activityStatusSchema,
  activityUpdateSchema,
} from '../validators/activity.schema.js';

export function createActivitiesRouter() {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const result = await listActivities(req.query);
    res.json(result);
  });

  router.post('/', validateBody(activitySchema), async (req, res) => {
    const created = await createActivity(req.body);
    res.status(201).json(created);
  });

  router.put('/:id', validateBody(activityUpdateSchema), async (req, res) => {
    const activity = await updateActivity(req.params.id, req.body);
    res.json({ activity });
  });

  router.patch('/:id/status', validateBody(activityStatusSchema), async (req, res) => {
    const activity = await updateActivityStatus(req.params.id, req.body.status);
    res.json({ activity });
  });

  router.delete('/:id', async (req, res) => {
    const payload = await deleteActivity(req.params.id);
    res.json(payload);
  });

  return router;
}
