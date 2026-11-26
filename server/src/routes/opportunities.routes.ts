import express from 'express';
import type { RequestHandler } from 'express';
import { requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import type { OpportunityListQuery } from '../services/opportunity.service.js';
import {
  assignAttendanceDeputy,
  cancelOpportunity,
  createOpportunity,
  getOpportunityById,
  listOpportunities,
  listOpportunityApplicants,
  publishOpportunity,
  updateOpportunity,
} from '../services/opportunity.service.js';
import { applyToOpportunity, withdrawApplication } from '../services/application.service.js';
import { warnAbsentVolunteers } from '../services/notification.service.js';
import {
  completeOpportunity,
  generateCheckInToken,
  getLiveOpportunityState,
  toggleManualCheckIn,
  verifyAndCheckIn,
} from '../services/checkin.service.js';
import type {
  ApplicationApplyInput,
  AssignDeputyInput,
  CheckInSubmitInput,
  ManualCheckInInput,
} from '../validators/application.schema.js';
import {
  applicationApplySchema,
  assignDeputySchema,
  checkInSubmitSchema,
  manualCheckInSchema,
} from '../validators/application.schema.js';
import type { OpportunityInput, OpportunityUpdateInput } from '../validators/opportunity.schema.js';
import { opportunitySchema, opportunityUpdateSchema } from '../validators/opportunity.schema.js';

function getRouteId(req: express.Request): string {
  const value = req.params.id;
  return Array.isArray(value) ? (value[0] ?? '') : value;
}

const passThroughMiddleware: RequestHandler = (_req, _res, next) => next();

/**
 * Creates the opportunities API with role-guarded CRUD, lifecycle, live check-in, and application actions.
 */
export function createOpportunitiesRouter(
  jwtSecret: string,
  checkInRateLimiter: RequestHandler = passThroughMiddleware
): express.Router {
  const router = express.Router();
  router.use(requireRole('admin', 'dean', 'student'));

  router.get('/', async (req, res) => {
    const result = await listOpportunities(req.query as unknown as OpportunityListQuery, req.user!);
    res.json(result);
  });

  router.post(
    '/',
    requireRole('admin', 'dean'),
    validateBody(opportunitySchema),
    async (req, res) => {
      const opportunity = await createOpportunity(req.body as OpportunityInput, req.user!);
      res.status(201).json({ opportunity });
    }
  );

  router.get('/:id', async (req, res) => {
    const opportunity = await getOpportunityById(getRouteId(req), req.user!);
    res.json({ opportunity });
  });

  router.patch(
    '/:id',
    requireRole('admin', 'dean'),
    validateBody<{ id: string }>(opportunityUpdateSchema),
    async (req, res) => {
      const opportunity = await updateOpportunity(
        getRouteId(req),
        req.body as OpportunityUpdateInput,
        req.user!
      );
      res.json({ opportunity });
    }
  );

  router.post('/:id/publish', requireRole('admin', 'dean'), async (req, res) => {
    const opportunity = await publishOpportunity(getRouteId(req), req.user!);
    res.json({ opportunity });
  });

  router.post('/:id/cancel', requireRole('admin', 'dean'), async (req, res) => {
    const opportunity = await cancelOpportunity(getRouteId(req), req.user!);
    res.json({ opportunity });
  });

  router.get('/:id/applications', requireRole('admin', 'dean'), async (req, res) => {
    const result = await listOpportunityApplicants(
      getRouteId(req),
      req.user!,
      req.query as Record<string, unknown>
    );
    res.json(result);
  });

  router.post(
    '/:id/apply',
    requireRole('student'),
    validateBody<{ id: string }>(applicationApplySchema),
    async (req, res) => {
      const application = await applyToOpportunity(
        getRouteId(req),
        req.body as ApplicationApplyInput,
        req.user!
      );
      res.status(201).json({ application });
    }
  );

  router.delete('/:id/apply', requireRole('student'), async (req, res) => {
    const application = await withdrawApplication(getRouteId(req), req.user!);
    res.json({ application });
  });

  router.get(
    '/:id/checkin-token',
    requireRole('admin', 'dean', 'student'),
    async (req, res) => {
      const result = await generateCheckInToken(getRouteId(req), req.user!, jwtSecret);
      res.json(result);
    }
  );

  router.put(
    '/:id/deputy',
    requireRole('admin', 'dean'),
    validateBody<{ id: string }>(assignDeputySchema),
    async (req, res) => {
      const { deputyUserId } = req.body as AssignDeputyInput;
      const opportunity = await assignAttendanceDeputy(getRouteId(req), deputyUserId, req.user!);
      res.json({ opportunity });
    }
  );

  router.post(
    '/:id/checkin',
    checkInRateLimiter,
    requireRole('student'),
    validateBody<{ id: string }>(checkInSubmitSchema),
    async (req, res) => {
      const { token } = req.body as CheckInSubmitInput;
      const application = await verifyAndCheckIn(getRouteId(req), token, req.user!, jwtSecret);
      res.json({ application });
    }
  );

  router.post(
    '/:id/checkin/manual',
    requireRole('admin', 'dean', 'student'),
    validateBody<{ id: string }>(manualCheckInSchema),
    async (req, res) => {
      const { applicationId, attended } = req.body as ManualCheckInInput;
      const application = await toggleManualCheckIn(
        getRouteId(req),
        applicationId,
        attended,
        req.user!
      );
      res.json({ application });
    }
  );

  router.get('/:id/live', requireRole('admin', 'dean', 'student'), async (req, res) => {
    const result = await getLiveOpportunityState(getRouteId(req), req.user!);
    res.json(result);
  });

  router.post('/:id/complete', requireRole('admin', 'dean'), async (req, res) => {
    const result = await completeOpportunity(getRouteId(req), req.user!);
    res.json(result);
  });

  router.post('/:id/warn-absent', requireRole('admin', 'dean'), async (req, res) => {
    const result = await warnAbsentVolunteers(getRouteId(req), req.user!);
    res.json(result);
  });

  return router;
}
