import express from 'express';
import { buildScope, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import type { UserListQuery } from '../services/user.service.js';
import { createDeanAccount, listUsers, updateUserAccount } from '../services/user.service.js';
import type { CreateDeanInput, UpdateUserInput } from '../validators/user.schema.js';
import { createDeanSchema, updateUserSchema } from '../validators/user.schema.js';

export function createUsersRouter(): express.Router {
  const router = express.Router();

  router.get('/', requireRole('admin'), async (req, res) => {
    const payload = await listUsers(req.query as unknown as UserListQuery);
    res.json(payload);
  });

  router.post('/', requireRole('admin'), validateBody(createDeanSchema), async (req, res) => {
    const payload = await createDeanAccount(req.body as CreateDeanInput);
    res.status(201).json(payload);
  });

  router.patch(
    '/:id',
    requireRole('admin', 'dean'),
    validateBody<{ id: string }>(updateUserSchema),
    async (req, res) => {
      const payload = await updateUserAccount({
        targetUserId: req.params.id,
        input: req.body as UpdateUserInput,
        actor: req.user!,
        scope: buildScope(req.user!),
      });
      res.json(payload);
    }
  );

  return router;
}
