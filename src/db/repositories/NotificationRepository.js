'use strict';
import { createRepository } from '../index.js';
import { v4 as uuid } from 'uuid';
import { NOTIFICATION_TYPES } from '../../config/constants.js';

const repo = createRepository('notifications');

function add({ userId, type, title, body, komunalId = null, status = 'sent' }) {
  const id = uuid();
  return repo.save(id, { id, userId: String(userId), type, title, body, komunalId, status, createdAt: new Date().toISOString() });
}

function findByUser(userId, limit = 20) {
  return repo.findMany(n => String(n.userId) === String(userId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

function countUnread(userId) {
  return repo.findMany(n => String(n.userId) === String(userId) && n.status === 'sent').length;
}

function markRead(userId) {
  const all = repo.findAll();
  for (const [id, n] of Object.entries(all)) {
    if (String(n.userId) === String(userId) && n.status === 'sent') {
      repo.save(id, { ...n, status: 'read' });
    }
  }
}

function countAll() { return repo.count(); }
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
