import type { Request } from 'express';
import express from 'express';
import type { Faculty } from '../constants/enums.js';
import { FACULTIES } from '../constants/enums.js';
import type { ScopeFilter } from '../middleware/auth.js';
import { buildScope, requireRole } from '../middleware/auth.js';
import type { ReportRange } from '../services/report.service.js';
import { getVolunteeringReport } from '../services/report.service.js';
import { cairoLocalToUtc } from '../utils/cairoTime.js';
import {
  getActionItems,
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

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateOnlyParam(raw: string): { year: number; month: number; day: number } {
  const match = DATE_ONLY_PATTERN.exec(raw);
  if (!match) {
    throw new AppError(400, 'صيغة التاريخ غير صالحة، استخدم YYYY-MM-DD');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new AppError(400, 'صيغة التاريخ غير صالحة، استخدم YYYY-MM-DD');
  }
  return { year, month, day };
}

/**
 * Parses the report's optional ?from / ?to period. Both are date-only
 * 'YYYY-MM-DD' values interpreted as Africa/Cairo calendar days (see
 * ReportRange); either may be omitted for an open-ended period, and both
 * omitted means the all-time report.
 */
function resolveReportRange(req: Request): ReportRange | undefined {
  const fromRaw = typeof req.query.from === 'string' ? req.query.from.trim() : '';
  const toRaw = typeof req.query.to === 'string' ? req.query.to.trim() : '';
  if (!fromRaw && !toRaw) {
    return undefined;
  }
  if (fromRaw && toRaw && fromRaw > toRaw) {
    throw new AppError(400, 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية أو يساويه');
  }

  let fromUtc: Date | null = null;
  if (fromRaw) {
    const parts = parseDateOnlyParam(fromRaw);
    fromUtc = cairoLocalToUtc({ ...parts, hour: 0, minute: 0, second: 0 });
  }

  let toExclusiveUtc: Date | null = null;
  if (toRaw) {
    const parts = parseDateOnlyParam(toRaw);
    const nextDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + 86_400_000);
    toExclusiveUtc = cairoLocalToUtc({
      year: nextDay.getUTCFullYear(),
      month: nextDay.getUTCMonth() + 1,
      day: nextDay.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    });
  }

  return { from: fromRaw || null, to: toRaw || null, fromUtc, toExclusiveUtc };
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

  router.get('/action-items', async (req, res) => {
    const actionItems = await getActionItems(req.user!);
    res.json(actionItems);
  });

  router.get('/report', async (req, res) => {
    const report = await getVolunteeringReport(
      resolveStatsScope(req),
      req.user!,
      resolveReportRange(req)
    );
    res.json(report);
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
