import express from 'express';
import { requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { getSettings, updateSettings } from '../services/settings.service.js';
import type { UpdateSettingsInput } from '../validators/settings.schema.js';
import { updateSettingsSchema } from '../validators/settings.schema.js';

export function createSettingsRouter(): express.Router {
  const router = express.Router();

  router.get('/', requireRole('admin', 'dean'), async (_req, res) => {
    const payload = await getSettings();
    res.json(payload);
  });

  router.patch('/', requireRole('admin'), validateBody(updateSettingsSchema), async (req, res) => {
    const payload = await updateSettings(req.body as UpdateSettingsInput);
    res.json(payload);
  });

  return router;
}
