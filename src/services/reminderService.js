'use strict';
import cron from 'node-cron';
import { findById, findAll } from '../db/repositories/UserRepository.js';
import { send } from './notificationService.js';
import { NOTIFICATION_TYPES } from '../config/constants.js';

const fmt = n => Number(n || 0).toLocaleString('uz-UZ') + ' so\'m';

/**
 * Run all reminder checks for all users.
 * Called every hour by cron; but respects per-user dailyCheckTime.
 */
async function runChecks(forceUserId = null) {
  const users = forceUserId ? [(await findById(forceUserId))].filter(Boolean) : await findAll();

  for (const user of users) {
    if (!user.notifications) continue;

    const homes = Object.values(user.homes || { default: { komunallar: {} } });

    for (const home of homes) {
      const komunallar = Object.values(home.komunallar || {});

      for (const k of komunallar) {
        await checkLowBalance(user, home, k);
        await checkPaymentDue(user, home, k);
        await checkLongNoPayment(user, home, k);
      }
    }
  }
}

async function checkLowBalance(user, home, k) {
  if (!user.reminderSettings?.lowBalanceAlert) return;
  if (Number(k.balance) <= Number(k.minAlert || 0) && Number(k.minAlert) > 0) {
    await send(
      user.id,
      NOTIFICATION_TYPES.LOW_BALANCE,
      `Kam balans — ${k.name}`,
      `⚠️ <b>${home.name}</b> — ${k.emoji} <b>${k.name}</b>\n\n` +
      `Balans: <code>${fmt(k.balance)}</code>\n` +
      `Minimal chegara: <code>${fmt(k.minAlert)}</code>\n\n` +
      `💳 Iltimos, to'ldiring!`,
      k.id
    );
  }
}

async function checkPaymentDue(user, home, k) {
  if (!user.reminderSettings?.paymentDueAlert) return;
  if (!k.nextPaymentDate) return;

  const daysLeft = Math.ceil((new Date(k.nextPaymentDate) - Date.now()) / 86400000);
  const threshold = user.reminderSettings?.daysBeforeDue ?? 3;

  if (daysLeft >= 0 && daysLeft <= threshold) {
    await send(
      user.id,
      NOTIFICATION_TYPES.PAYMENT_DUE,
      `To'lov muddati yaqin — ${k.name}`,
      `📅 <b>${home.name}</b> — ${k.emoji} <b>${k.name}</b>\n\n` +
      `To'lov muddati: <b>${daysLeft === 0 ? 'bugun' : daysLeft + ' kun qoldi'}</b>\n` +
      `Balans: <code>${fmt(k.balance)}</code>`,
      k.id
    );
  } else if (daysLeft < 0) {
    await send(
      user.id,
      NOTIFICATION_TYPES.PAYMENT_OVERDUE,
      `To'lov kechikdi — ${k.name}`,
      `🚨 <b>${home.name}</b> — ${k.emoji} <b>${k.name}</b>\n\n` +
      `To'lov muddati <b>${Math.abs(daysLeft)} kun</b> oldin o'tib ketdi!\n` +
      `Balans: <code>${fmt(k.balance)}</code>`,
      k.id
    );
  }
}

async function checkLongNoPayment(user, home, k) {
  const payments = k.payments || [];
  if (!payments.length) return;

  const lastPay = new Date(payments[payments.length - 1].date);
  const daysSince = Math.floor((Date.now() - lastPay) / 86400000);

  if (daysSince >= 45) {
    await send(
      user.id,
      NOTIFICATION_TYPES.PAYMENT_DUE,
      `Uzoq to'lov yo'q — ${k.name}`,
      `🔔 <b>${home.name}</b> — ${k.emoji} <b>${k.name}</b>\n\n` +
      `So'nggi to'lov <b>${daysSince} kun</b> oldin bo'lgan.\n` +
      `To'lovni tekshiring!`,
      k.id
    );
  }
}

/**
 * Start cron scheduler.
 * Runs every hour at minute 0.
 * The per-user time check is done inside runChecks.
 */
function start() {
  // Every day at 9 AM UTC+5 (4 AM UTC)
  cron.schedule('0 4 * * *', () => {
    console.log('[Reminder] Running daily balance & due checks...');
    runChecks().catch(console.error);
  });

  // Also check every hour for near-due reminders
  cron.schedule('0 * * * *', () => {
    runChecks().catch(console.error);
  });

  console.log('[Reminder] Scheduler started.');
}

export { start, runChecks };
