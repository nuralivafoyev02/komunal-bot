'use strict';
const { Markup } = require('telegraf');
const UserRepo = require('../../db/repositories/UserRepository').default;
const PaymentRepo = require('../../db/repositories/PaymentRepository');
const NotifRepo = require('../../db/repositories/NotificationRepository');
const NotifSvc = require('../../services/notificationService').default;
const ReminderSvc = require('../../services/reminderService').default;
const { setState } = require('../handlers/menu').default;

const fmt = n => Number(n || 0).toLocaleString('uz-UZ') + ' so\'m';

function register(bot) {

  // ── /admin ──────────────────────────────────────────────────────────────────
  bot.command('admin', requireAdmin, async ctx => {
    await showAdminDashboard(ctx);
  });

  // ── /users ──────────────────────────────────────────────────────────────────
  bot.command('users', requireAdmin, async ctx => {
    const args = ctx.message.text.split(' ');
    const filter = args[1]; // active | debt | premium | free
    let users = UserRepo.findAll();

    if (filter === 'premium') users = users.filter(u => u.subscription === 'premium');
    if (filter === 'free') users = users.filter(u => u.subscription !== 'premium');

    let msg = `👥 <b>Foydalanuvchilar (${users.length})</b>${filter ? ` — filtr: ${filter}` : ''}\n\n`;
    for (const u of users.slice(0, 30)) {
      const plan = u.subscription === 'premium' ? '⭐' : '🆓';
      const homes = Object.keys(u.homes || {}).length;
      msg += `${plan} ${u.firstName || '—'} | ${u.phone || '—'} | ${homes} uy\n`;
    }
    if (users.length > 30) msg += `\n...va yana ${users.length - 30} ta`;
    msg += `\n\nFilter: /users premium | /users free`;
    await ctx.reply(msg, { parse_mode: 'HTML' });
  });

  // ── /stats ──────────────────────────────────────────────────────────────────
  bot.command('stats', requireAdmin, async ctx => {
    const users = UserRepo.findAll();
    const payments = PaymentRepo.findAll();
    const total = payments.reduce((s, p) => s + (p.type === 'topup' ? p.amount : 0), 0);
    const prem = users.filter(u => u.subscription === 'premium').length;
    const notifs = NotifRepo.countAll();

    await ctx.reply(
      `📊 <b>Bot statistikasi</b>\n\n` +
      `👥 Foydalanuvchilar: <b>${users.length}</b>\n` +
      `⭐ Premium: <b>${prem}</b>\n` +
      `🆓 Free: <b>${users.length - prem}</b>\n` +
      `💳 Jami to\'lovlar soni: <b>${payments.length}</b>\n` +
      `💰 Jami summa: <b>${fmt(total)}</b>\n` +
      `🔔 Bildirishnomalar: <b>${notifs}</b>`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /message ─────────────────────────────────────────────────────────────────
  bot.command('message', requireAdmin, async ctx => {
    setState(ctx.from.id, { step: 'admin_awaiting_broadcast' });
    await ctx.reply(
      `📢 <b>Broadcast xabar</b>\n\n` +
      `Yubormoqchi bo\'lgan kontentni yuboring:\n` +
      `📝 Matn | 🖼 Rasm | 🎬 Video | 🎥 GIF | 📄 Hujjat\n\n` +
      `Bekor qilish: /cancel`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /setadmin ─────────────────────────────────────────────────────────────────
  bot.command('setadmin', requireAdmin, async ctx => {
    const id = ctx.message.text.split(' ')[1];
    if (!id) return ctx.reply('Foydalanish: /setadmin <userId>');
    UserRepo.addAdmin(Number(id));
    ctx.reply(`✅ ${id} admin qilindi.`);
  });

  // ── /setpremium ───────────────────────────────────────────────────────────────
  bot.command('setpremium', requireAdmin, async ctx => {
    const id = ctx.message.text.split(' ')[1];
    if (!id) return ctx.reply('Foydalanish: /setpremium <userId>');
    const user = UserRepo.findById(id);
    if (!user) return ctx.reply('Foydalanuvchi topilmadi.');
    UserRepo.save(id, { ...user, subscription: 'premium', subscriptionExpiry: new Date(Date.now() + 30 * 86400000).toISOString() });
    ctx.reply(`⭐ ${user.firstName} (${id}) ga premium berildi.`);
  });

  // ── /alert ────────────────────────────────────────────────────────────────────
  bot.command('alert', requireAdmin, async ctx => {
    await ctx.reply('⏳ Barcha foydalanuvchilar tekshirilmoqda...');
    await ReminderSvc.runChecks();
    ctx.reply('✅ Tekshiruv yakunlandi.');
  });
}

async function showAdminDashboard(ctx) {
  const users = UserRepo.findAll();
  const payments = PaymentRepo.findAll();
  const total = payments.reduce((s, p) => s + (p.type === 'topup' ? p.amount : 0), 0);

  await ctx.reply(
    `👑 <b>Admin Panel</b>\n\n` +
    `👥 ${users.length} foydalanuvchi | ⭐ ${users.filter(u => u.subscription === 'premium').length} premium\n` +
    `💰 Jami to\'lovlar: ${fmt(total)}\n\n` +
    `<b>Buyruqlar:</b>\n` +
    `/message — Broadcast yuborish\n` +
    `/users — Ro\'yxat (filter: free/premium)\n` +
    `/stats — Statistika\n` +
    `/alert — Balans tekshirish\n` +
    `/setadmin &lt;id&gt; — Admin berish\n` +
    `/setpremium &lt;id&gt; — Premium berish`,
    { parse_mode: 'HTML' }
  );
}

function requireAdmin(ctx, next) {
  if (!UserRepo.isAdmin(ctx.from?.id)) return ctx.reply('❌ Ruxsat yo\'q.');
  return next();
}

module.exports = { register };
