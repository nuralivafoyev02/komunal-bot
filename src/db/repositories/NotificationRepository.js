'use strict';
import { createRepository } from '../index.js';
import { v4 as uuid } from 'uuid';
import { NOTIFICATION_TYPES } from '../../config/constants.js';

const repo = createRepository('notifications');

async function add({ userId, type, title, body, komunalId = null, status = 'sent' }) {
  const id = uuid();
  return await repo.save(id, { id, userId: String(userId), type, title, body, komunalId, status, createdAt: new Date().toISOString() });
}

async function findByUser(userId, limit = 20) {
  return (await repo.findMany({ userId: String(userId) }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

async function countUnread(userId) {
  return (await repo.findMany({ userId: String(userId), status: 'sent' })).length;
}

async function markRead(userId) {
  const all = await repo.findAll();
  for (const n of all) {
    if (String(n.userId) === String(userId) && n.status === 'sent') {
      await repo.save(n.id, { ...n, status: 'read' });
    }
  }
}

async function countAll() { return await repo.count(); }
function typeLabel(type) {
  const map = {
    [NOTIFICATION_TYPES.LOW_BALANCE]: '💰 Kam balans',
    [NOTIFICATION_TYPES.PAYMENT_DUE]: '📅 To\'lov muddati',
    [NOTIFICATION_TYPES.PAYMENT_OVERDUE]: '⚠️ Kechikkan',
    [NOTIFICATION_TYPES.PAYMENT_ADDED]: '✅ To\'lov qo\'shildi',
    [NOTIFICATION_TYPES.BROADCAST]: '📢 Xabar',
    [NOTIFICATION_TYPES.SYSTEM]: '⚙️ Tizim',
  };
  return map[type] || '🔔 Bildirishnoma';
}

export { add, findByUser, countUnread, markRead, countAll, typeLabel, NOTIFICATION_TYPES };
