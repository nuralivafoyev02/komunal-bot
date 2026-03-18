'use strict';
import { createRepository } from '../index.js';
import { SUBSCRIPTION_PLANS } from '../../config/constants.js';

const repo = createRepository('users');

async function create(ctx, phone) {
  const user = {
    chatId: ctx.chat.id,
    username: ctx.from.username || '',
    firstName: ctx.from.first_name || '',
    lastName: ctx.from.last_name || '',
    phone,
    registeredAt: new Date().toISOString(),
    subscription: 'free',
    subscriptionExpiry: null,
    notifications: true,
    reminderSettings: {
      lowBalanceAlert: true,
      paymentDueAlert: true,
      daysBeforeDue: 3,
      dailyCheckTime: '09:00',
    },
    homes: {
      default: {
        id: 'default',
        name: 'Asosiy uy',
        komunallar: {},
      }
    },
    activeHomeId: 'default',
  };
  return await repo.save(ctx.from.id, user);
}

async function findById(id) { return await repo.findById(id); }
async function save(id, user) { return await repo.save(id, user); }
async function findAll() { return await repo.values(); }
async function count() { return await repo.count(); }
async function isAdmin(id) {
  const envList = (process.env.ADMIN_IDS || '').split(',').map(x => x.trim());
  if (envList.includes(String(id))) return true;
  const user = await repo.findById(id);
  return user?.role === 'admin';
}
async function addAdmin(id) {
  const user = await repo.findById(id) || {};
  return await repo.save(id, { ...user, role: 'admin' });
}
async function getPlan(id) {
  const user = await repo.findById(id);
  return SUBSCRIPTION_PLANS[user?.subscription || 'free'];
}
async function canAddHome(id) {
  const user = await repo.findById(id);
  const plan = SUBSCRIPTION_PLANS[user?.subscription || 'free'];
  return Object.keys(user?.homes || {}).length < plan.maxHomes;
}
async function getActiveHome(id) {
  const user = await repo.findById(id);
  if (!user) return null;
  return user.homes[user.activeHomeId || 'default'] || Object.values(user.homes)[0];
}

async function update(id, partial) { return await repo.update(id, partial); }

export { create, findById, save, update, findAll, count, isAdmin, addAdmin, getPlan, canAddHome, getActiveHome };
