import express from 'express';
import { requireRole } from '../middleware/auth.js';
import {
  listNotifications,
  markAllNotificationsRead,
} from '../services/notification.service.js';

/**
 * Creates the notifications API: every signed-in user reads only his own
 * in-app notifications and can mark them all as read.
 */
export function createNotificationsRouter(): express.Router {
  const router = express.Router();
  router.use(requireRole('admin', 'dean', 'student'));

  router.get('/', async (req, res) => {
    const result = await listNotifications(req.user!);
    res.json(result);
  });

  router.post('/mark-read', async (req, res) => {
    const result = await markAllNotificationsRead(req.user!);
    res.json(result);
  });

  return router;
}
