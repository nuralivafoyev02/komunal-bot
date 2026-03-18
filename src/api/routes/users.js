'use strict';
const router      = require('express').Router();
const UserRepo    = require('../../db/repositories/UserRepository');
const PaymentRepo = require('../../db/repositories/PaymentRepository');
const NotifRepo   = require('../../db/repositories/NotificationRepository');

// Get user
router.get('/:userId', (req, res) => {
  const user = UserRepo.findById(req.params.userId);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(user);
});

// Update komunal balance
router.post('/:userId/komunal/:komunalId/balance', (req, res) => {
  const { userId, komunalId } = req.params;
  const user = UserRepo.findById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const homeId = req.body.homeId || user.activeHomeId || 'default';
  const home   = user.homes?.[homeId];
  if (!home) return res.status(404).json({ error: 'Home not found' });

  const komunal = home.komunallar?.[komunalId];
  if (!komunal) return res.status(404).json({ error: 'Komunal not found' });

  const { balance } = req.body;
  if (typeof balance !== 'number' || balance < 0)
    return res.status(400).json({ error: 'Invalid balance' });

  const oldBal  = komunal.balance;
  const diff    = balance - oldBal;
  komunal.balance = balance;
  if (!komunal.payments) komunal.payments = [];
  komunal.payments.push({
    amount: Math.abs(diff), balance, date: new Date().toISOString(),
    type: diff >= 0 ? 'topup' : 'charge', description: 'Mini App orqali'
  });

  UserRepo.save(userId, user);
  PaymentRepo.add({
    userId, homeId, komunalId, komunalName: komunal.name, komunalEmoji: komunal.emoji,
    amount: Math.abs(diff), balanceBefore: oldBal, balanceAfter: balance,
    type: diff >= 0 ? 'topup' : 'charge', source: 'miniapp',
  });

  res.json({ success: true, komunal });
});

// Get payment history
router.get('/:userId/payments', (req, res) => {
  const user = UserRepo.findById(req.params.userId);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(PaymentRepo.findByUser(req.params.userId));
});

// Get notifications
router.get('/:userId/notifications', (req, res) => {
  const user = UserRepo.findById(req.params.userId);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const notifs = NotifRepo.findByUser(req.params.userId, 30);
  NotifRepo.markRead(req.params.userId);
  res.json(notifs);
});

// Update reminder settings
router.patch('/:userId/settings', (req, res) => {
  const user = UserRepo.findById(req.params.userId);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (req.body.reminderSettings) {
    user.reminderSettings = { ...user.reminderSettings, ...req.body.reminderSettings };
  }
  if (typeof req.body.notifications === 'boolean') {
    user.notifications = req.body.notifications;
  }
  UserRepo.save(req.params.userId, user);
  res.json({ success: true });
});

module.exports = router;
