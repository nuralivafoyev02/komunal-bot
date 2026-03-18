'use strict';
import _default from '../index';
const { createRepository } = _default;
import { SUBSCRIPTION_PLANS } from '../../config/constants';

const repo = createRepository('users');

function create(ctx, phone) {
  const user = {
    userId: ctx.from.id,
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
  return repo.save(ctx.from.id, user);
}

function findById(id) { return repo.findById(id); }
function save(id, user) { return repo.save(id, user); }
function findAll() { return repo.values(); }
function count() { return repo.count(); }
function isAdmin(id) {
  const envList = (process.env.ADMIN_IDS || '').split(',').map(x => x.trim());
  const user = repo.findById(id);
  return envList.includes(String(id)) || user?.role === 'admin';
}
function addAdmin(id) {
  const user = repo.findById(id) || {};
  return repo.save(id, { ...user, role: 'admin' });
}
function getPlan(id) {
  const user = repo.findById(id);
  return SUBSCRIPTION_PLANS[user?.subscription || 'free'];
}
function canAddHome(id) {
  const user = repo.findById(id);
  const plan = SUBSCRIPTION_PLANS[user?.subscription || 'free'];
  return Object.keys(user?.homes || {}).length < plan.maxHomes;
}
function getActiveHome(id) {
  const user = repo.findById(id);
  if (!user) return null;
  return user.homes[user.activeHomeId || 'default'] || Object.values(user.homes)[0];
}

export default { create, findById, save, findAll, count, isAdmin, addAdmin, getPlan, canAddHome, getActiveHome };
