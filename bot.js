require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');
const db   = require('./db');

const bot         = new Telegraf(process.env.BOT_TOKEN);
const MINI_APP_URL = process.env.MINI_APP_URL || 'http://localhost:3000/miniapp';

// ── Conversation state storage ─────────────────────────────────────────────────
// { userId: { step, ...data } }
const states = new Map();

// ── Constants ─────────────────────────────────────────────────────────────────

const KOMUNAL_TYPES = {
  elektr:   { name: 'Elektr energiya', emoji: '⚡' },
  gaz:      { name: 'Gaz',             emoji: '🔥' },
  suv:      { name: 'Suv',             emoji: '💧' },
  internet: { name: 'Internet',         emoji: '🌐' },
  issiqlik: { name: 'Issiqlik',         emoji: '🌡️' },
  axlat:    { name: 'Axlat yig\'ish',  emoji: '🗑️' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt  = n   => Number(n || 0).toLocaleString('uz-UZ') + ' so\'m';
const fmtDate = d => new Date(d).toLocaleDateString('uz-UZ', { day:'2-digit', month:'2-digit', year:'numeric' });

function createUser(ctx, phone) {
  return {
    userId:       ctx.from.id,
    chatId:       ctx.chat.id,
    username:     ctx.from.username || '',
    firstName:    ctx.from.first_name || '',
    lastName:     ctx.from.last_name  || '',
    phone,
    registeredAt: new Date().toISOString(),
    komunallar:   {},
    notifications: true,
    lastCheck:    null
  };
}

function mainMenu(ctx) {
  const isAdm = db.isAdmin(ctx.from.id);
  const rows = [
    [Markup.button.text('💰 Balanslarim'),      Markup.button.text('📊 Statistika')],
    [Markup.button.text('➕ Komunal qo\'shish'), Markup.button.text('🔔 Bildirishnomalar')],
    [Markup.button.webApp('📱 Mini App ochish', MINI_APP_URL + '?userId=' + ctx.from.id)],
    [Markup.button.text('ℹ️ Yordam')],
  ];
  if (isAdm) rows.push([Markup.button.text('👑 Admin Panel')]);
  return Markup.keyboard(rows).resize();
}

// ── /start ────────────────────────────────────────────────────────────────────

bot.start(async ctx => {
  const user = db.getUser(ctx.from.id);

  if (user) {
    await ctx.reply(
      `Xush kelibsiz, <b>${user.firstName}</b>! 👋\n\nMenyudan tanlang:`,
      { parse_mode: 'HTML', ...mainMenu(ctx) }
    );
    return;
  }

  states.set(ctx.from.id, { step: 'awaiting_phone' });
  await ctx.reply(
    `🤖 <b>Komunal Bot</b>ga xush kelibsiz!\n\n` +
    `Ushbu bot orqali siz:\n\n` +
    `⚡ Kommunal balanslarni kuzatasiz\n` +
    `🔔 Past balans ogohlantirishlari olasiz\n` +
    `📊 Oylik to'lovlar statistikasini ko'rasiz\n` +
    `📱 Mini App orqali chiroyli vizual ko'rasiz\n\n` +
    `Boshlash uchun <b>telefon raqamingizni yuboring</b>:`,
    {
      parse_mode: 'HTML',
      ...Markup.keyboard([
        [Markup.button.contactRequest('📞 Raqamni ulashish')]
      ]).resize().oneTime()
    }
  );
});

// ── Contact handler ───────────────────────────────────────────────────────────

bot.on('contact', async ctx => {
  const state = states.get(ctx.from.id);
  if (!state || state.step !== 'awaiting_phone') return;

  const contact = ctx.message.contact;
  if (contact.user_id && contact.user_id !== ctx.from.id) {
    return ctx.reply('❌ Iltimos, faqat <b>o\'z</b> raqamingizni yuboring.', { parse_mode: 'HTML' });
  }

  const phone = contact.phone_number;
  const user  = createUser(ctx, phone);
  db.saveUser(ctx.from.id, user);
  states.delete(ctx.from.id);

  await ctx.reply(
    `✅ <b>Muvaffaqiyatli ro\'yxatdan o\'tdingiz!</b>\n\n` +
    `📞 Raqam: <code>${phone}</code>\n` +
    `👤 Ism: ${user.firstName}\n\n` +
    `Endi ➕ <b>Komunal qo\'shish</b> tugmasini bosing.`,
    { parse_mode: 'HTML', ...mainMenu(ctx) }
  );
});

// ── Text / menu handler ───────────────────────────────────────────────────────

bot.on('text', async ctx => {
  const text   = ctx.message.text;
  const userId = ctx.from.id;
  const state  = states.get(userId);

  // State-based inputs
  if (state) return handleState(ctx, state, text);

  const user = db.getUser(userId);

  switch (text) {
    case '💰 Balanslarim':      return showBalances(ctx, user);
    case '📊 Statistika':       return showUserStats(ctx, user);
    case '➕ Komunal qo\'shish': return startAddKomunal(ctx, user);
    case '🔔 Bildirishnomalar': return toggleNotifications(ctx, user);
    case '👑 Admin Panel':      return showAdminPanel(ctx);
    case 'ℹ️ Yordam':           return showHelp(ctx);
    default:
      if (!user) ctx.reply('Boshlash uchun /start bosing.');
  }
});

// ── showBalances ──────────────────────────────────────────────────────────────

async function showBalances(ctx, user) {
  if (!user) return ctx.reply('Boshlash uchun /start bosing.');

  const komunallar = user.komunallar || {};

  if (Object.keys(komunallar).length === 0) {
    return ctx.reply(
      '📭 <b>Hali komunal qo\'shilmagan.</b>\n\n➕ Komunal qo\'shish tugmasini bosing.',
      { parse_mode: 'HTML', ...mainMenu(ctx) }
    );
  }

  let msg = '💰 <b>Kommunal Balanslar</b>\n\n';
  const buttons = [];

  for (const [id, kom] of Object.entries(komunallar)) {
    const isLow   = Number(kom.balance) <= Number(kom.minAlert);
    const alert   = isLow ? ' ⚠️' : '';
    msg += `${kom.emoji} <b>${kom.name}</b>${alert}\n`;
    msg += `   Balans: <code>${fmt(kom.balance)}</code>\n`;
    msg += `   Hisob: <code>${kom.accountId}</code>\n`;
    if (kom.payments?.length) {
      const last = [...kom.payments].reverse().find(p => p.type === 'topup');
      if (last) msg += `   Oxirgi to\'lov: ${fmt(last.amount)} (${fmtDate(last.date)})\n`;
    }
    msg += '\n';
    buttons.push([
      Markup.button.callback(`${kom.emoji} Yangilash`,  `update_${id}`),
      Markup.button.callback('📋 Tarix',                `history_${id}`),
      Markup.button.callback('🗑️ O\'chirish',           `delete_${id}`),
    ]);
  }

  await ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

// ── showUserStats ─────────────────────────────────────────────────────────────

async function showUserStats(ctx, user) {
  if (!user) return ctx.reply('Boshlash uchun /start bosing.');

  const komunallar = Object.values(user.komunallar || {});
  if (!komunallar.length) return ctx.reply('📊 Statistika uchun avval komunal qo\'shing.');

  let totalBalance = 0, totalPaid = 0;
  let msg = '📊 <b>Statistika</b>\n\n';

  for (const kom of komunallar) {
    const paid = (kom.payments || [])
      .filter(p => p.type === 'topup')
      .reduce((s, p) => s + Number(p.amount), 0);
    totalBalance += Number(kom.balance || 0);
    totalPaid    += paid;
    msg += `${kom.emoji} ${kom.name}: ${fmt(kom.balance)}\n`;
  }

  msg += `\n${'─'.repeat(28)}\n`;
  msg += `💳 <b>Jami balans:</b> ${fmt(totalBalance)}\n`;
  msg += `💸 <b>Jami to\'lovlar:</b> ${fmt(totalPaid)}\n`;
  msg += `\n📱 Vizual grafik uchun Mini App oching.`;

  await ctx.reply(msg, { parse_mode: 'HTML' });
}

// ── startAddKomunal ───────────────────────────────────────────────────────────

async function startAddKomunal(ctx, user) {
  if (!user) return ctx.reply('Boshlash uchun /start bosing.');

  const existing = Object.keys(user.komunallar || {});
  const buttons  = Object.entries(KOMUNAL_TYPES)
    .filter(([id]) => !existing.includes(id))
    .map(([id, t]) => [Markup.button.callback(`${t.emoji} ${t.name}`, `add_${id}`)]);

  if (!buttons.length) return ctx.reply('✅ Barcha asosiy komunallar qo\'shilgan!');

  buttons.push([Markup.button.callback('❌ Bekor qilish', 'cancel')]);

  await ctx.reply(
    '➕ <b>Qaysi kommunalni qo\'shmoqchisiz?</b>',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
  );
}

// ── toggleNotifications ───────────────────────────────────────────────────────

async function toggleNotifications(ctx, user) {
  if (!user) return ctx.reply('Boshlash uchun /start bosing.');
  user.notifications = !user.notifications;
  db.saveUser(ctx.from.id, user);
  const status = user.notifications ? '✅ Yoqildi' : '❌ O\'chirildi';
  await ctx.reply(`🔔 Bildirishnomalar: <b>${status}</b>`, { parse_mode: 'HTML', ...mainMenu(ctx) });
}

// ── Callback queries ──────────────────────────────────────────────────────────

bot.on('callback_query', async ctx => {
  const data   = ctx.callbackQuery.data;
  const userId = ctx.from.id;
  const user   = db.getUser(userId);
  await ctx.answerCbQuery();

  // Cancel
  if (data === 'cancel') {
    states.delete(userId);
    return ctx.editMessageText('❌ Bekor qilindi.');
  }

  // Add komunal
  if (data.startsWith('add_')) {
    const type = data.slice(4);
    const kt   = KOMUNAL_TYPES[type];
    if (!kt) return;
    states.set(userId, { step: 'awaiting_account', komunalType: type });
    return ctx.editMessageText(
      `${kt.emoji} <b>${kt.name}</b>\n\nHisob raqamingizni kiriting:`,
      { parse_mode: 'HTML' }
    );
  }

  // Update balance
  if (data.startsWith('update_')) {
    const id  = data.slice(7);
    const kom = user?.komunallar?.[id];
    if (!kom) return;
    states.set(userId, { step: 'awaiting_new_balance', komunalId: id });
    return ctx.editMessageText(
      `${kom.emoji} <b>${kom.name}</b>\n` +
      `Hozirgi balans: <code>${fmt(kom.balance)}</code>\n\n` +
      `Yangi balansni kiriting (so\'mda):`,
      { parse_mode: 'HTML' }
    );
  }

  // History
  if (data.startsWith('history_')) {
    const id       = data.slice(8);
    const kom      = user?.komunallar?.[id];
    if (!kom) return;
    const payments = [...(kom.payments || [])].reverse().slice(0, 10);
    let msg = `${kom.emoji} <b>${kom.name} — Tarix</b>\n\n`;
    if (!payments.length) {
      msg += 'Hali to\'lovlar yo\'q.';
    } else {
      for (const p of payments) {
        const icon = p.type === 'topup' ? '🟢' : '🔴';
        msg += `${icon} ${fmt(p.amount)} — ${fmtDate(p.date)}\n`;
        if (p.description) msg += `   📝 ${p.description}\n`;
      }
    }
    return ctx.editMessageText(msg, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Ortga', 'back_balances')]])
    });
  }

  // Delete komunal — confirm first
  if (data.startsWith('delete_')) {
    const id  = data.slice(7);
    const kom = user?.komunallar?.[id];
    if (!kom) return;
    return ctx.editMessageText(
      `${kom.emoji} <b>${kom.name}</b>ni o\'chirishni tasdiqlaysizmi?`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[
          Markup.button.callback('✅ Ha, o\'chir', `confirm_delete_${id}`),
          Markup.button.callback('❌ Yo\'q',       'cancel')
        ]])
      }
    );
  }

  if (data.startsWith('confirm_delete_')) {
    const id = data.slice(15);
    if (user?.komunallar?.[id]) {
      const name = user.komunallar[id].name;
      delete user.komunallar[id];
      db.saveUser(userId, user);
      return ctx.editMessageText(`✅ <b>${name}</b> o\'chirildi.`, { parse_mode: 'HTML' });
    }
  }

  // Back to balances
  if (data === 'back_balances') {
    await ctx.deleteMessage().catch(() => {});
    return showBalances(ctx, db.getUser(userId));
  }

  // Admin broadcast confirm
  if (data === 'admin_broadcast_all') {
    const st = states.get(userId);
    if (!st || st.step !== 'admin_confirm_broadcast') return;
    await doBroadcast(ctx, st);
    states.delete(userId);
  }

  if (data === 'admin_cancel_broadcast') {
    states.delete(userId);
    return ctx.editMessageText('❌ Xabar yuborish bekor qilindi.');
  }
});

// ── State handler ─────────────────────────────────────────────────────────────

async function handleState(ctx, state, text) {
  const userId = ctx.from.id;
  const user   = db.getUser(userId);

  // Registration: awaiting phone via text (not contact button)
  if (state.step === 'awaiting_phone') {
    return ctx.reply('📞 Iltimos, quyidagi tugmani bosib raqamingizni yuboring.');
  }

  // Add komunal: account number
  if (state.step === 'awaiting_account') {
    states.set(userId, { ...state, step: 'awaiting_balance', accountId: text.trim() });
    return ctx.reply(`✅ Hisob raqam: <code>${text.trim()}</code>\n\nHozirgi balansni kiriting (so\'mda):`, { parse_mode: 'HTML' });
  }

  // Add komunal: balance
  if (state.step === 'awaiting_balance') {
    const balance = parseAmount(text);
    if (isNaN(balance)) return ctx.reply('❌ Iltimos, faqat raqam kiriting. Masalan: 50000');
    states.set(userId, { ...state, step: 'awaiting_min_alert', balance });
    return ctx.reply(
      `💰 Balans: <code>${fmt(balance)}</code>\n\n` +
      `Minimal ogohlantirish chegarasini kiriting:\n` +
      `(Masalan: <code>10000</code> — balans shu miqdordan past bo\'lsa, xabar olasiz)`,
      { parse_mode: 'HTML' }
    );
  }

  // Add komunal: min alert
  if (state.step === 'awaiting_min_alert') {
    const minAlert = parseAmount(text);
    if (isNaN(minAlert)) return ctx.reply('❌ Iltimos, faqat raqam kiriting.');

    const kt       = KOMUNAL_TYPES[state.komunalType];
    const newKomunal = {
      id:        state.komunalType,
      name:      kt.name,
      emoji:     kt.emoji,
      balance:   state.balance,
      accountId: state.accountId,
      minAlert,
      payments:  [],
      addedAt:   new Date().toISOString()
    };

    if (!user.komunallar) user.komunallar = {};
    user.komunallar[state.komunalType] = newKomunal;
    db.saveUser(userId, user);
    states.delete(userId);

    await ctx.reply(
      `✅ <b>${kt.emoji} ${kt.name}</b> qo\'shildi!\n\n` +
      `📋 Hisob: <code>${state.accountId}</code>\n` +
      `💰 Balans: <code>${fmt(state.balance)}</code>\n` +
      `⚠️ Ogohlantirish: <code>${fmt(minAlert)}</code> dan past bo\'lsa`,
      { parse_mode: 'HTML', ...mainMenu(ctx) }
    );
    return;
  }

  // Update balance
  if (state.step === 'awaiting_new_balance') {
    const newBalance = parseAmount(text);
    if (isNaN(newBalance)) return ctx.reply('❌ Iltimos, faqat raqam kiriting.');

    const id         = state.komunalId;
    const kom        = user.komunallar[id];
    const oldBalance = kom.balance;
    const diff       = newBalance - oldBalance;

    kom.balance = newBalance;
    if (!kom.payments) kom.payments = [];
    kom.payments.push({
      amount:      Math.abs(diff),
      balance:     newBalance,
      date:        new Date().toISOString(),
      type:        diff > 0 ? 'topup' : 'charge',
      description: `Bot orqali yangilandi: ${fmt(oldBalance)} → ${fmt(newBalance)}`
    });

    db.saveUser(userId, user);
    states.delete(userId);

    const isLow = newBalance <= kom.minAlert;
    let reply = `✅ <b>${kom.emoji} ${kom.name}</b> yangilandi!\n\nYangi balans: <code>${fmt(newBalance)}</code>`;
    if (isLow) reply += `\n\n⚠️ <b>Diqqat!</b> Balans minimal chegaradan past!`;

    await ctx.reply(reply, { parse_mode: 'HTML', ...mainMenu(ctx) });
    return;
  }

  // Admin: awaiting broadcast message (text)
  if (state.step === 'admin_awaiting_broadcast') {
    const userCount = Object.keys(db.getAllUsers()).length;
    states.set(userId, {
      step:        'admin_confirm_broadcast',
      messageType: 'text',
      text,
      fileId:      null,
      caption:     null
    });
    await ctx.reply(
      `📢 <b>Xabar mazmuni:</b>\n\n${text}\n\n` +
      `👥 <b>${userCount}</b> ta foydalanuvchiga yuboriladi.\n\nTaskdiqlaysizmi?`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[
          Markup.button.callback('✅ Yuborish', 'admin_broadcast_all'),
          Markup.button.callback('❌ Bekor',    'admin_cancel_broadcast')
        ]])
      }
    );
  }
}

// ── Media handler (admin broadcast) ──────────────────────────────────────────

bot.on(['photo', 'video', 'animation', 'document'], async ctx => {
  const userId = ctx.from.id;
  const state  = states.get(userId);
  if (!state || state.step !== 'admin_awaiting_broadcast') return;

  let fileId, messageType;
  if      (ctx.message.photo)     { fileId = ctx.message.photo.at(-1).file_id; messageType = 'photo';     }
  else if (ctx.message.video)     { fileId = ctx.message.video.file_id;         messageType = 'video';     }
  else if (ctx.message.animation) { fileId = ctx.message.animation.file_id;     messageType = 'animation'; }
  else if (ctx.message.document)  { fileId = ctx.message.document.file_id;      messageType = 'document';  }

  const caption   = ctx.message.caption || '';
  const userCount = Object.keys(db.getAllUsers()).length;

  states.set(userId, { step: 'admin_confirm_broadcast', messageType, fileId, caption, text: null });

  await ctx.reply(
    `📢 <b>Media xabar tayyor</b>\n\n` +
    `Tur: ${messageType}\n` +
    `${caption ? `📝 Izoh: ${caption}\n\n` : ''}` +
    `👥 <b>${userCount}</b> ta foydalanuvchiga yuboriladi. Tasdiqlaysizmi?`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[
        Markup.button.callback('✅ Yuborish', 'admin_broadcast_all'),
        Markup.button.callback('❌ Bekor',    'admin_cancel_broadcast')
      ]])
    }
  );
});

// ── Broadcast ─────────────────────────────────────────────────────────────────

async function doBroadcast(ctx, st) {
  const users = Object.values(db.getAllUsers());
  let sent = 0, failed = 0;

  await ctx.editMessageText('📤 Yuborilmoqda...');

  for (const user of users) {
    try {
      const opts = { parse_mode: 'HTML' };
      if      (st.messageType === 'text')      await bot.telegram.sendMessage(user.chatId, st.text, opts);
      else if (st.messageType === 'photo')     await bot.telegram.sendPhoto(user.chatId, st.fileId, { ...opts, caption: st.caption });
      else if (st.messageType === 'video')     await bot.telegram.sendVideo(user.chatId, st.fileId, { ...opts, caption: st.caption });
      else if (st.messageType === 'animation') await bot.telegram.sendAnimation(user.chatId, st.fileId, { ...opts, caption: st.caption });
      else if (st.messageType === 'document')  await bot.telegram.sendDocument(user.chatId, st.fileId, { ...opts, caption: st.caption });
      sent++;
      await delay(55); // rate limit
    } catch {
      failed++;
    }
  }

  await ctx.reply(
    `✅ <b>Yuborildi!</b>\n\n✅ Muvaffaqiyatli: <b>${sent}</b>\n❌ Xato: <b>${failed}</b>`,
    { parse_mode: 'HTML' }
  );
}

// ── Admin commands ────────────────────────────────────────────────────────────

bot.command('admin', async ctx => {
  if (!db.isAdmin(ctx.from.id)) return ctx.reply('❌ Ruxsat yo\'q.');
  return showAdminPanel(ctx);
});

bot.command('message', async ctx => {
  if (!db.isAdmin(ctx.from.id)) return ctx.reply('❌ Ruxsat yo\'q.');
  states.set(ctx.from.id, { step: 'admin_awaiting_broadcast' });
  await ctx.reply(
    '📢 <b>Xabar yuborish</b>\n\n' +
    'Yubormoqchi bo\'lgan xabarni yuboring.\n' +
    '📝 Matn, 🖼 Rasm, 🎬 Video, 🎥 GIF yoki 📄 Hujjat bo\'lishi mumkin.\n\n' +
    'Bekor qilish uchun /cancel',
    { parse_mode: 'HTML' }
  );
});

bot.command('users', async ctx => {
  if (!db.isAdmin(ctx.from.id)) return ctx.reply('❌ Ruxsat yo\'q.');
  const users = Object.values(db.getAllUsers());
  let msg = `👥 <b>Foydalanuvchilar (${users.length})</b>\n\n`;
  for (const u of users.slice(0, 25)) {
    msg += `${u.firstName || '—'} | ${u.phone || '—'} | ${Object.keys(u.komunallar || {}).length} komunal\n`;
  }
  if (users.length > 25) msg += `\n...va yana ${users.length - 25} ta`;
  await ctx.reply(msg, { parse_mode: 'HTML' });
});

bot.command('stats', async ctx => {
  if (!db.isAdmin(ctx.from.id)) return ctx.reply('❌ Ruxsat yo\'q.');
  const s = db.getStats();
  await ctx.reply(
    `📊 <b>Bot statistikasi</b>\n\n` +
    `👥 Foydalanuvchilar: ${s.total}\n` +
    `📞 Raqamli: ${s.withPhone}\n` +
    `⚡ Komunallar: ${s.komunalCount}\n` +
    `🔔 Bildirishnomalar yoq: ${s.notificationsOn}\n` +
    `💰 Jami balans: ${fmt(s.totalBalance)}`,
    { parse_mode: 'HTML' }
  );
});

bot.command('alert', async ctx => {
  if (!db.isAdmin(ctx.from.id)) return ctx.reply('❌ Ruxsat yo\'q.');
  await checkLowBalances(true);
  ctx.reply('✅ Balans tekshiruvi yakunlandi.');
});

bot.command('cancel', async ctx => {
  states.delete(ctx.from.id);
  await ctx.reply('❌ Bekor qilindi.', mainMenu(ctx));
});

bot.command('setadmin', async ctx => {
  if (!db.isAdmin(ctx.from.id)) return ctx.reply('❌ Ruxsat yo\'q.');
  const args = ctx.message.text.split(' ');
  if (!args[1]) return ctx.reply('Foydalanish: /setadmin <userId>');
  db.addAdmin(Number(args[1]));
  ctx.reply(`✅ ${args[1]} admin qilindi.`);
});

async function showAdminPanel(ctx) {
  const s = db.getStats();
  await ctx.reply(
    `👑 <b>Admin Panel</b>\n\n` +
    `👥 Foydalanuvchilar: ${s.total}\n` +
    `⚡ Komunallar: ${s.komunalCount}\n` +
    `🔔 Bildirishnomalar: ${s.notificationsOn}\n\n` +
    `<b>Buyruqlar:</b>\n` +
    `/message — Xabar yuborish (matn/rasm/video/gif)\n` +
    `/users — Foydalanuvchilar ro\'yxati\n` +
    `/stats — Bot statistikasi\n` +
    `/alert — Past balanslarni tekshirish\n` +
    `/setadmin &lt;id&gt; — Admin qo\'shish`,
    { parse_mode: 'HTML' }
  );
}

// ── Help ──────────────────────────────────────────────────────────────────────

async function showHelp(ctx) {
  await ctx.reply(
    `ℹ️ <b>Yordam</b>\n\n` +
    `<b>Asosiy buyruqlar:</b>\n` +
    `/start — Botni boshlash / qayta ishga tushirish\n` +
    `/cancel — Amalni bekor qilish\n\n` +
    `<b>Kommunal turlari:</b>\n` +
    `⚡ Elektr energiya\n` +
    `🔥 Gaz\n` +
    `💧 Suv\n` +
    `🌐 Internet\n` +
    `🌡️ Issiqlik\n` +
    `🗑️ Axlat yig\'ish\n\n` +
    `<b>Mini App:</b>\n` +
    `📱 Vizual balans ko\'rish, grafik, tarix\n\n` +
    `<b>Bildirishnomalar:</b>\n` +
    `🔔 Har kuni soat 09:00 da past balanslar tekshiriladi`,
    { parse_mode: 'HTML' }
  );
}

// ── Cron: daily low-balance alert ─────────────────────────────────────────────

async function checkLowBalances(force = false) {
  const users = Object.values(db.getAllUsers());

  for (const user of users) {
    if (!force && !user.notifications) continue;

    const lowList = Object.values(user.komunallar || {})
      .filter(k => Number(k.balance) <= Number(k.minAlert));

    if (!lowList.length) continue;

    let msg = `⚠️ <b>Balans ogohlantirishi!</b>\n\nQuyidagi kommunallarda balans past:\n\n`;
    for (const k of lowList) {
      msg += `${k.emoji} <b>${k.name}:</b> <code>${fmt(k.balance)}</code>\n`;
      msg += `   Chegara: ${fmt(k.minAlert)}\n\n`;
    }
    msg += `💳 Iltimos, to'ldiring!`;

    try {
      await bot.telegram.sendMessage(user.chatId, msg, { parse_mode: 'HTML' });
    } catch {}
  }
}

// Every day at 9:00 AM Tashkent time (UTC+5)
cron.schedule('0 4 * * *', () => checkLowBalances());

// ── Utils ─────────────────────────────────────────────────────────────────────

function parseAmount(str) {
  return parseFloat(String(str).replace(/\s/g, '').replace(/,/g, '.'));
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Launch ────────────────────────────────────────────────────────────────────

bot.launch();
console.log('🤖 Komunal Bot ishga tushdi!');

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
