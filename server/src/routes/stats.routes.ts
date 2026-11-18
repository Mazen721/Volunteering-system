import type { Request } from 'express';
import express from 'express';
import type { Faculty } from '../constants/enums.js';
import { FACULTIES } from '../constants/enums.js';
import type { ScopeFilter } from '../middleware/auth.js';
import { buildScope, requireRole } from '../middleware/auth.js';
import {
  getCategoryStats,
  getEventStats,
  getFacultyStats,
  getLeaderboard,
  getMonthlyHoursStats,
  getOverviewStats,
  getParticipationStats,
  getStudentDashboardSummary,
} from '../services/stats.service.js';
import { AppError } from '../utils/errors.js';

function resolveStatsScope(req: Request): ScopeFilter {
  const baseScope = buildScope(req.user!);
  if (baseScope.faculty) {
    return baseScope;
  }

  const facultyQuery = typeof req.query.faculty === 'string' ? req.query.faculty.trim() : '';
  if (!facultyQuery) {
    return {};
  }
  if (!(FACULTIES as readonly string[]).includes(facultyQuery)) {
    throw new AppError(400, 'الكلية المختارة غير صالحة');
  }
  return { faculty: facultyQuery as Faculty };
}

export function createStatsRouter(): express.Router {
  const router = express.Router();

  router.get('/me', requireRole('student'), async (req, res) => {
    const summary = await getStudentDashboardSummary(req.user!);
    res.json(summary);
  });

  router.use(requireRole('admin', 'dean'));

  router.get('/overview', async (req, res) => {
    const overview = await getOverviewStats(resolveStatsScope(req));
    res.json(overview);
  });

  router.get('/faculties', async (req, res) => {
    const faculties = await getFacultyStats(resolveStatsScope(req));
    res.json(faculties);
  });

  router.get('/categories', async (req, res) => {
    const categories = await getCategoryStats(resolveStatsScope(req));
    res.json(categories);
  });

  router.get('/leaderboard', async (req, res) => {
    const leaderboard = await getLeaderboard(
      {
        category: typeof req.query.category === 'string' ? req.query.category : undefined,
        limit: typeof req.query.limit === 'string' ? req.query.limit : undefined,
      },
      resolveStatsScope(req)
    );
    res.json(leaderboard);
  });

  router.get('/participation', async (req, res) => {
    const participation = await getParticipationStats(resolveStatsScope(req));
    res.json(participation);
  });

  router.get('/events', async (req, res) => {
    const events = await getEventStats(resolveStatsScope(req));
    res.json(events);
  });

  router.get('/monthly-hours', async (req, res) => {
    const monthly = await getMonthlyHoursStats(resolveStatsScope(req));
    res.json(monthly);
  });

  return router;
}
