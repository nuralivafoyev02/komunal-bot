'use strict';
import { createRepository } from '../index.js';
import { v4 as uuid } from 'uuid';

const repo = createRepository('payments');

/**
 * Payment record structure:
 * { id, userId, homeId, komunalId, komunalName, komunalEmoji,
 *   amount, balanceBefore, balanceAfter, date, type, source, provider, notes }
 */
async function add(data) {
  const id = uuid();
  const payment = {
    id,
    userId: String(data.userId),
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
  return await repo.save(id, payment);
}

async function findByUser(userId) {
  return (await repo.findMany({ userId: String(userId) }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function findByUserAndKomunal(userId, komunalId) {
  return (await repo.findMany({ userId: String(userId), komunalId }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function findByUserAndMonth(userId, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  // We fetch all and filter locally for complex date prefixes
  return (await repo.findMany(p => String(p.userId) === String(userId) && p.date.startsWith(prefix)));
}

async function findAll() { return await repo.values(); }
async function countAll() { return await repo.count(); }
async function totalAmount(userId) {
  return (await findByUser(userId)).reduce((s, p) => s + (p.type === 'topup' ? p.amount : 0), 0);
}

export { add, findByUser, findByUserAndKomunal, findByUserAndMonth, findAll, countAll, totalAmount };
