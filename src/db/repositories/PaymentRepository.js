'use strict';
import { createRepository } from '../index.js';
import { v4 as uuid } from 'uuid';

const repo = createRepository('payments');

/**
 * Payment record structure:
 * { id, userId, homeId, komunalId, komunalName, komunalEmoji,
 *   amount, balanceBefore, balanceAfter, date, type, source, provider, notes }
 */
function add(data) {
  const id = uuid();
  const payment = {
    id,
    userId: data.userId,
    homeId: data.homeId || 'default',
    komunalId: data.komunalId,
    komunalName: data.komunalName,
    komunalEmoji: data.komunalEmoji || '⚡',
    amount: Number(data.amount),
    balanceBefore: Number(data.balanceBefore || 0),
    balanceAfter: Number(data.balanceAfter || 0),
    date: data.date || new Date().toISOString(),
    type: data.type || 'topup',    // topup | charge | auto
    source: data.source || 'bot',      // bot | miniapp | screenshot | auto
    provider: data.provider || null,       // click | payme | apelsin
    notes: data.notes || '',
    createdAt: new Date().toISOString(),
  };
  return repo.save(id, payment);
}

function findByUser(userId) {
  return repo.findMany(p => String(p.userId) === String(userId))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function findByUserAndKomunal(userId, komunalId) {
  return repo.findMany(p => String(p.userId) === String(userId) && p.komunalId === komunalId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function findByUserAndMonth(userId, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return repo.findMany(p => String(p.userId) === String(userId) && p.date.startsWith(prefix));
}

function findAll() { return repo.values(); }
function countAll() { return repo.count(); }
function totalAmount(userId) {
  return findByUser(userId).reduce((s, p) => s + (p.type === 'topup' ? p.amount : 0), 0);
}

export { add, findByUser, findByUserAndKomunal, findByUserAndMonth, findAll, countAll, totalAmount };
