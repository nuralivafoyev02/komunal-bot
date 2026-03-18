import express from 'express';
const router = express.Router();
import Analytics from '../../services/analyticsService.js';
import { findById } from '../../db/repositories/UserRepository.js';
const UserRepo = { findById };

router.get('/:userId/monthly', async (req, res) => {
  if (!(await UserRepo.findById(req.params.userId))) return res.status(404).json({ error: 'Not found' });
  res.json(await Analytics.getMonthlyTotals(req.params.userId, 6));
});

router.get('/:userId/compare', async (req, res) => {
  if (!(await UserRepo.findById(req.params.userId))) return res.status(404).json({ error: 'Not found' });
  res.json(await Analytics.compareMonths(req.params.userId));
});

router.get('/:userId/alltime', async (req, res) => {
  if (!(await UserRepo.findById(req.params.userId))) return res.status(404).json({ error: 'Not found' });
  res.json(await Analytics.allTimeTotals(req.params.userId));
});

router.get('/:userId/insight', async (req, res) => {
  if (!(await UserRepo.findById(req.params.userId))) return res.status(404).json({ error: 'Not found' });
  res.json({ insight: await Analytics.generateInsight(req.params.userId) });
});

export default router;