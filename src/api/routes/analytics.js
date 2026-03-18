import express from 'express';
const router = express.Router();
import Analytics from '../../services/analyticsService.js';
import { findById } from '../../db/repositories/UserRepository.js';
const UserRepo = { findById };

router.get('/:userId/monthly', (req, res) => {
  if (!UserRepo.findById(req.params.userId)) return res.status(404).json({ error: 'Not found' });
  res.json(Analytics.getMonthlyTotals(req.params.userId, 6));
});

router.get('/:userId/compare', (req, res) => {
  if (!UserRepo.findById(req.params.userId)) return res.status(404).json({ error: 'Not found' });
  res.json(Analytics.compareMonths(req.params.userId));
});

router.get('/:userId/alltime', (req, res) => {
  if (!UserRepo.findById(req.params.userId)) return res.status(404).json({ error: 'Not found' });
  res.json(Analytics.allTimeTotals(req.params.userId));
});

router.get('/:userId/insight', (req, res) => {
  if (!UserRepo.findById(req.params.userId)) return res.status(404).json({ error: 'Not found' });
  res.json({ insight: Analytics.generateInsight(req.params.userId) });
});

export default router;