import express from 'express';
import { buildScope, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import type { ActivityListQuery } from '../services/activity.service.js';
import {
  createActivity,
  deleteActivity,
  listActivities,
  updateActivity,
  updateActivityStatus,
} from '../services/activity.service.js';
import type {
  ActivityInput,
  ActivityStatusInput,
  ActivityUpdateInput,
} from '../validators/activity.schema.js';
import {
  activitySchema,
  activityStatusSchema,
  activityUpdateSchema,
} from '../validators/activity.schema.js';

export function createActivitiesRouter(): express.Router {
  const router = express.Router();
  router.use(requireRole('admin', 'dean'));

  router.get('/', async (req, res) => {
    const result = await listActivities(
      req.query as unknown as ActivityListQuery,
      buildScope(req.user!)
    );
    res.json(result);
  });

  router.post('/', validateBody(activitySchema), async (req, res) => {
    const created = await createActivity(req.body as ActivityInput, buildScope(req.user!));
    res.status(201).json(created);
  });

  router.put('/:id', validateBody<{ id: string }>(activityUpdateSchema), async (req, res) => {
    const activity = await updateActivity(
      req.params.id,
      req.body as ActivityUpdateInput,
      buildScope(req.user!)
    );
    res.json({ activity });
  });

  router.patch(
    '/:id/status',
    validateBody<{ id: string }>(activityStatusSchema),
    async (req, res) => {
      const activity = await updateActivityStatus(
        req.params.id,
        (req.body as ActivityStatusInput).status,
        buildScope(req.user!)
      );
      res.json({ activity });
    }
  );

  router.delete('/:id', async (req, res) => {
    const payload = await deleteActivity(req.params.id, buildScope(req.user!));
    res.json(payload);
  });

  return router;
}
