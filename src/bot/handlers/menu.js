'use strict';
import { Markup } from 'telegraf';
import UserRepo from '../../db/repositories/UserRepository';
import { totalAmount } from '../../db/repositories/PaymentRepository';
import { countUnread, findByUser, markRead, typeLabel } from '../../db/repositories/NotificationRepository';
import Analytics from '../../services/analyticsService';
import NotifSvc from '../../services/notificationService';
import PaymentSvc from '../../services/paymentService';
import { KOMUNAL_TYPES, SUBSCRIPTION_PLANS, NOTIFICATION_TYPES } from '../../config/constants';

const MINI_APP_URL = () => process.env.MINI_APP_URL || 'http://localhost:3000/miniapp';
const fmt = n => Number(n || 0).toLocaleString('uz-UZ') + ' so\'m';
const fmtDate = d => new Date(d).toLocaleDateString('uz-UZ');

// In-memory session state { userId -> { step, ...data } }
const states = new Map();

function setState(id, s) { states.set(String(id), s); }
function getState(id) { return states.get(String(id)) || null; }
function clearState(id) { states.delete(String(id)); }

// ── Keyboards ─────────────────────────────────────────────────────────────────

function mainMenu(userId) {
  const isAdm = UserRepo.isAdmin(userId);
  const unread = countUnread(userId);
  const notifLabel = unread > 0 ? `🔔 Bildirishnomalar (${unread})` : '🔔 Bildirishnomalar';
  const rows = [
    [Markup.button.text('💰 Balanslar'), Markup.button.text('📊 Statistika')],
    [Markup.button.text('➕ Komunal qo\'shish'), Markup.button.text(notifLabel)],
    [Markup.button.text('💳 To\'lov qilish'), Markup.button.text('⚙️ Sozlamalar')],
    [Markup.button.webApp('📱 Mini App', MINI_APP_URL() + '?userId=' + userId)],
    [Markup.button.text('ℹ️ Yordam'), Markup.button.text('🤖 AI Yordam')],
  ];
  if (isAdm) rows.push([Markup.button.text('👑 Admin Panel')]);
  return Markup.keyboard(rows).resize();
}

// ── Balances ──────────────────────────────────────────────────────────────────

async function showBalances(ctx) {
  const user = UserRepo.findById(ctx.from.id);
  const home = UserRepo.getActiveHome(ctx.from.id);
  if (!home) return ctx.reply('Hali uy qo\'shilmagan.');

  const komunallar = Object.values(home.komunallar || {});
  if (!komunallar.length) {
    return ctx.reply(
      `📭 <b>${home.name}</b> uchun hali kommunal qo\'shilmagan.\n\n➕ Kommunal qo\'shish tugmasini bosing.`,
      { parse_mode: 'HTML', ...mainMenu(ctx.from.id) }
    );
  }

  let msg = `💰 <b>${home.name} — Balanslar</b>\n\n`;
  const buttons = [];

  for (const k of komunallar) {
    const isLow = Number(k.balance) <= Number(k.minAlert || 0);
    const alert = isLow ? ' ⚠️' : '';
    msg += `${k.emoji} <b>${k.name}</b>${alert}\n`;
    msg += `   💰 Balans: <code>${fmt(k.balance)}</code>\n`;
    msg += `   📋 Hisob: <code>${k.accountId || '—'}</code>\n`;
    if (k.nextPaymentDate) msg += `   📅 Muddati: <code>${fmtDate(k.nextPaymentDate)}</code>\n`;
    const last = [...(k.payments || [])].reverse().find(p => p.type === 'topup');
    if (last) msg += `   🕐 Oxirgi: ${fmt(last.amount)} (${fmtDate(last.date)})\n`;
    msg += '\n';
    buttons.push([
      Markup.button.callback(`${k.emoji} Yangilash`, `bal_update_${k.id}`),
      Markup.button.callback('📋 Tarix', `bal_history_${k.id}`),
      Markup.button.callback('🗑️', `bal_delete_${k.id}`),
    ]);
  }

  await ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

// ── Statistics ────────────────────────────────────────────────────────────────

async function showStats(ctx) {
  const userId = ctx.from.id;
  const home = UserRepo.getActiveHome(userId);
  if (!home) return ctx.reply('Uy topilmadi.');

  const komunallar = Object.values(home.komunallar || {});
  const compare = Analytics.compareMonths(userId);
  const insight = Analytics.generateInsight(userId);

  let total = 0;
  let msg = `📊 <b>Statistika — ${home.name}</b>\n\n`;

  for (const k of komunallar) {
    total += Number(k.balance || 0);
    msg += `${k.emoji} ${k.name}: <code>${fmt(k.balance)}</code>\n`;
  }

  msg += `\n<b>Jami balans:</b> <code>${fmt(total)}</code>\n`;
  msg += `<b>Jami to\'lovlar:</b> <code>${fmt(totalAmount(userId))}</code>\n\n`;

  if (compare.length) {
    msg += `<b>Bu oy vs o'tgan oy:</b>\n`;
    for (const c of compare) {
      const arrow = c.trend === 'up' ? '📈' : c.trend === 'down' ? '📉' : '➡️';
      const sign = c.pct > 0 ? '+' : '';
      msg += `${arrow} ${c.emoji} ${c.name}: ${sign}${c.pct}% (${fmt(c.thisMonth)})\n`;
    }
    msg += '\n';
  }

  msg += `💡 <i>${insight}</i>`;
  await ctx.reply(msg, { parse_mode: 'HTML' });
}

// ── Add Komunal flow ──────────────────────────────────────────────────────────

async function startAddKomunal(ctx) {
  const home = UserRepo.getActiveHome(ctx.from.id);
  const existing = Object.keys(home?.komunallar || {});
  const buttons = Object.entries(KOMUNAL_TYPES)
    .filter(([id]) => !existing.includes(id))
    .map(([id, t]) => [Markup.button.callback(`${t.emoji} ${t.name}`, `add_k_${id}`)]);

  if (!buttons.length) return ctx.reply('✅ Barcha asosiy kommunallar qo\'shilgan!');
  buttons.push([Markup.button.callback('❌ Bekor', 'cancel')]);
  await ctx.reply('➕ <b>Qaysi kommunalni qo\'shmoqchisiz?</b>', { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

// ── Notifications list ────────────────────────────────────────────────────────

async function showNotifications(ctx) {
  const userId = ctx.from.id;
  const notifs = findByUser(userId, 15);
  markRead(userId);

  if (!notifs.length) return ctx.reply('📭 Hali bildirishnomalar yo\'q.');

  let msg = '🔔 <b>Bildirishnomalar</b>\n\n';
  for (const n of notifs) {
    const date = fmtDate(n.createdAt);
    const label = typeLabel(n.type);
    const read = n.status === 'read' ? '' : ' 🆕';
    msg += `<b>${label}${read}</b> — ${date}\n${n.body}\n\n`;
  }

  await ctx.reply(msg.slice(0, 4000), { parse_mode: 'HTML', ...mainMenu(userId) });
}

// ── Reminder settings ─────────────────────────────────────────────────────────

async function showReminderSettings(ctx) {
  const user = UserRepo.findById(ctx.from.id);
  const s = user.reminderSettings;
  const msg = `⚙️ <b>Eslatma sozlamalari</b>\n\n` +
    `🔔 Bildirishnomalar: ${user.notifications ? '✅ Yoqilgan' : '❌ O\'chirilgan'}\n` +
    `💰 Kam balans: ${s.lowBalanceAlert ? '✅' : '❌'}\n` +
    `📅 To\'lov muddati: ${s.paymentDueAlert ? '✅' : '❌'}\n` +
    `⏰ Kun oldin ogohlantirish: ${s.daysBeforeDue} kun\n` +
    `🕐 Kunlik tekshirish: ${s.dailyCheckTime}`;

  await ctx.reply(msg, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback(user.notifications ? '🔕 O\'chirish' : '🔔 Yoqish', 'toggle_notif')],
      [Markup.button.callback('💰 Kam balans ↔', 'toggle_low'), Markup.button.callback('📅 Muddat ↔', 'toggle_due')],
      [Markup.button.callback('⏰ 1 kun oldin', 'days_1'), Markup.button.callback('⏰ 3 kun', 'days_3'), Markup.button.callback('⏰ 7 kun', 'days_7')],
    ])
  });
}

// ── Payment flow ──────────────────────────────────────────────────────────────

async function startPayment(ctx) {
  const home = UserRepo.getActiveHome(ctx.from.id);
  const komunallar = Object.values(home?.komunallar || {});
  if (!komunallar.length) return ctx.reply('Avval kommunal qo\'shing.');

  const buttons = komunallar.map(k => [Markup.button.callback(`${k.emoji} ${k.name} — ${fmt(k.balance)}`, `pay_k_${k.id}`)]);
  buttons.push([Markup.button.callback('❌ Bekor', 'cancel')]);
  await ctx.reply('💳 <b>Qaysi kommunal uchun to\'lov?</b>', { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

// ── Help ──────────────────────────────────────────────────────────────────────

async function showHelp(ctx) {
  await ctx.reply(
    `ℹ️ <b>Yordam</b>\n\n` +
    `<b>Buyruqlar:</b>\n` +
    `/start — Boshlash\n/cancel — Bekor qilish\n/notifications — Bildirishnomalar\n` +
    `/reminder — Eslatma sozlamalari\n/stats — Statistika\n/ai — AI yordamchi\n\n` +
    `<b>Kommunal turlari:</b>\n` +
    Object.values(KOMUNAL_TYPES).map(t => `${t.emoji} ${t.name}`).join('\n') + '\n\n' +
    `<b>Mini App:</b> Vizual dashboard, grafik va to\'lov tarixi\n\n` +
    `<b>Subscription:</b>\n` +
    `🆓 Free: 1 uy, 4 kommunal\n` +
    `⭐ Premium: 10 uy, 20 kommunal, analytics`,
    { parse_mode: 'HTML' }
  );
}

// ── Export ────────────────────────────────────────────────────────────────────
export default {
  states, setState, getState, clearState,
  mainMenu, showBalances, showStats, startAddKomunal,
  showNotifications, showReminderSettings, startPayment, showHelp,
};
