import express from 'express';
import {
  getCategoryStats,
  getFacultyStats,
  getLeaderboard,
  getOverviewStats,
} from '../services/stats.service.js';

export function createStatsRouter() {
  const router = express.Router();

  router.get('/overview', async (_req, res) => {
    const overview = await getOverviewStats();
    res.json(overview);
  });

  router.get('/faculties', async (_req, res) => {
    const faculties = await getFacultyStats();
    res.json(faculties);
  });

  router.get('/categories', async (_req, res) => {
    const categories = await getCategoryStats();
    res.json(categories);
  });

  router.get('/leaderboard', async (req, res) => {
    const leaderboard = await getLeaderboard({
      category: req.query.category,
      limit: req.query.limit,
    });
    res.json(leaderboard);
  });

  return router;
}
