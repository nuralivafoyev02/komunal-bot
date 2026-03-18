import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';

import * as UserRepo from '../db/repositories/UserRepository.js';
import { add } from '../db/repositories/PaymentRepository.js';
import NotifSvc from '../services/notificationService.js';
import { start as startReminderSvc } from '../services/reminderService.js';
import AiSvc from '../services/aiService.js';
import PaymentSvc from '../services/paymentService.js';
import { register } from './commands/admin.js';
import { handleScreenshot, saveScreenshotPayment } from './handlers/screenshot.js';
import { states, setState, getState, clearState, mainMenu, showBalances, showStats, startAddKomunal, showNotifications, showReminderSettings, startPayment, showHelp, showPremiumPlans } from './handlers/menu.js';
import { KOMUNAL_TYPES, SUBSCRIPTION_PLANS, NOTIFICATION_TYPES, PREMIUM_PLANS, CARD_DETAILS } from '../config/constants.js';

const bot = new Telegraf(process.env.BOT_TOKEN);
const fmt = n => Number(n || 0).toLocaleString('uz-UZ') + ' so\'m';
const fmtDate = d => new Date(d).toLocaleDateString('uz-UZ');

// ── Init services ─────────────────────────────────────────────────────────────
NotifSvc.init(bot);
startReminderSvc();

// ── Admin commands ────────────────────────────────────────────────────────────
register(bot);

// ── /start ────────────────────────────────────────────────────────────────────
bot.start(async ctx => {
  const existing = await UserRepo.findById(ctx.from.id);
  if (existing) {
    return ctx.reply(
      `Xush kelibsiz, <b>${existing.firstName}</b>! 👋`,
      { parse_mode: 'HTML', ...(await mainMenu(ctx.from.id)) }
    );
  }
  setState(ctx.from.id, { step: 'awaiting_phone' });
  await ctx.reply(
    `⚡ <b>Komunal Bot</b>ga xush kelibsiz!\n\n` +
    `📱 Kommunal balanslar kuzatuvi\n🔔 Aqlli eslatmalar\n📊 Oylik statistika\n🤖 AI yordamchi\n\n` +
    `Boshlash uchun telefon raqamingizni yuboring:`,
    {
      parse_mode: 'HTML',
      ...Markup.keyboard([[Markup.button.contactRequest('📞 Raqamni ulashish')]]).resize().oneTime()
    }
  );
});

// ── Contact ───────────────────────────────────────────────────────────────────
bot.on('contact', async ctx => {
  const state = getState(ctx.from.id);
  if (!state || state.step !== 'awaiting_phone') return;

  const contact = ctx.message.contact;
  if (contact.user_id && contact.user_id !== ctx.from.id)
    return ctx.reply('❌ Faqat o\'z raqamingizni yuboring.');

  await UserRepo.create(ctx, contact.phone_number);
  clearState(ctx.from.id);

  await ctx.reply(
    `✅ <b>Muvaffaqiyatli ro\'yxatdan o\'tdingiz!</b>\n\n📞 ${contact.phone_number}\n\n➕ Komunal qo\'shish tugmasini bosing.`,
    { parse_mode: 'HTML', ...(await mainMenu(ctx.from.id)) }
  );
});

// ── /cancel ───────────────────────────────────────────────────────────────────
bot.command('cancel', async ctx => {
  clearState(ctx.from.id);
  ctx.reply('❌ Bekor qilindi.', await mainMenu(ctx.from.id));
});

// ── Shortcut commands ─────────────────────────────────────────────────────────
bot.command('notifications', ctx => showNotifications(ctx));
bot.command('reminder', ctx => showReminderSettings(ctx));
bot.command('stats', ctx => showStats(ctx));
bot.command('ai', async ctx => {
  setState(ctx.from.id, { step: 'ai_awaiting_question' });
  await ctx.reply('🤖 <b>AI Yordamchi</b>\n\nSavolingizni yozing:\nMasalan: "Nega gazim tez tugayapti?"', { parse_mode: 'HTML' });
});

// ── Photos → screenshot parsing ───────────────────────────────────────────────
bot.on('photo', async ctx => {
  const state = getState(ctx.from.id);
  if (state?.step === 'admin_awaiting_broadcast') return handleAdminMedia(ctx, 'photo');
  if (state?.step === 'sub_awaiting_receipt') return await handlePremiumReceipt(ctx, state);
  if (!(await UserRepo.findById(ctx.from.id))) return;
  await handleScreenshot(ctx);
});

bot.on(['video', 'animation', 'document'], async ctx => {
  const state = getState(ctx.from.id);
  if (state?.step === 'admin_awaiting_broadcast') {
    const type = ctx.message.video ? 'video' : ctx.message.animation ? 'animation' : 'document';
    return handleAdminMedia(ctx, type);
  }
});

// ── Text messages ─────────────────────────────────────────────────────────────
bot.on('text', async ctx => {
  const text = ctx.message.text;
  const userId = ctx.from.id;
  const state = getState(userId);

  if (state) return handleState(ctx, state, text);

  const user = await UserRepo.findById(userId);
  if (!user) return ctx.reply('Boshlash uchun /start bosing.');

  switch (text) {
    case '💰 Balanslar': return await showBalances(ctx);
    case '📊 Statistika': return await showStats(ctx);
    case '➕ Komunal qo\'shish': return await startAddKomunal(ctx);
    case '💳 To\'lov qilish': return await startPayment(ctx);
    case '⚙️ Sozlamalar': return await showReminderSettings(ctx);
    case '🤖 AI Yordam': {
      setState(userId, { step: 'ai_awaiting_question' });
      return ctx.reply('🤖 <b>AI Yordamchi</b>\n\nSavolingizni yozing:', { parse_mode: 'HTML' });
    }
    case 'ℹ️ Yordam': return await showHelp(ctx);
    case '⭐ Premium olish': return await showPremiumPlans(ctx);
    case '👑 Admin Panel': return (await UserRepo.isAdmin(userId)) ? ctx.reply('Admin buyruqlari:\n/admin /users /stats /message /alert') : null;
    default: {
      const notifLabel = text.match(/🔔 Bildirishnomalar/);
      if (notifLabel) return await showNotifications(ctx);
    }
  }
});

// ── State machine ──────────────────────────────────────────────────────────────
async function handleState(ctx, state, text) {
  const userId = ctx.from.id;
  const user = await UserRepo.findById(userId);

  // ── Komunal add flow ─────────────────────────────────────────────────────
  if (state.step === 'add_account') {
    setState(userId, { ...state, step: 'add_balance', accountId: text.trim() });
    return ctx.reply(`Hisob: <code>${text.trim()}</code>\n\nHozirgi balansni kiriting (so\'mda):`, { parse_mode: 'HTML' });
  }
  if (state.step === 'add_balance') {
    const balance = parseAmount(text);
    if (isNaN(balance)) return ctx.reply('❌ Faqat raqam kiriting.');
    setState(userId, { ...state, step: 'add_min_alert', balance });
    return ctx.reply(`Balans: <code>${fmt(balance)}</code>\n\nMinimal ogohlantirish chegarasi (masalan 10000):\n0 kiritsangiz — ogohlantirish bo\'lmaydi`, { parse_mode: 'HTML' });
  }
  if (state.step === 'add_min_alert') {
    const minAlert = parseAmount(text);
    if (isNaN(minAlert)) return ctx.reply('❌ Faqat raqam kiriting.');
    setState(userId, { ...state, step: 'add_due_date', minAlert });
    return ctx.reply('To\'lov muddati (DD.MM.YYYY, masalan: 25.01.2026)\nO\'tkazib yuborish uchun "yo\'q" yozing:');
  }
  if (state.step === 'add_due_date') {
    let dueDate = null;
    if (text.toLowerCase() !== 'yo\'q' && text.toLowerCase() !== 'yoq') {
      const m = text.match(/(\d{2})[./](\d{2})[./](\d{4})/);
      if (m) dueDate = new Date(`${m[3]}-${m[2]}-${m[1]}`).toISOString();
    }
    const home = await UserRepo.getActiveHome(userId);
    const kt = KOMUNAL_TYPES[state.komunalType];
    if (!user.homes[user.activeHomeId].komunallar) user.homes[user.activeHomeId].komunallar = {};
    user.homes[user.activeHomeId].komunallar[state.komunalType] = {
      id: state.komunalType, name: kt.name, emoji: kt.emoji,
      balance: state.balance, accountId: state.accountId,
      minAlert: state.minAlert, nextPaymentDate: dueDate,
      payments: [], addedAt: new Date().toISOString()
    };
    await UserRepo.save(userId, user);
    clearState(userId);
    return ctx.reply(
      `✅ <b>${kt.emoji} ${kt.name}</b> qo\'shildi!\n\n` +
      `Hisob: <code>${state.accountId}</code>\nBalans: <code>${fmt(state.balance)}</code>` +
      (dueDate ? `\nMuddat: ${fmtDate(dueDate)}` : ''),
      { parse_mode: 'HTML', ...(await mainMenu(userId)) }
    );
  }

  // ── Update balance ────────────────────────────────────────────────────────
  if (state.step === 'update_balance') {
    const newBal = parseAmount(text);
    if (isNaN(newBal)) return ctx.reply('❌ Faqat raqam kiriting.');
    const home = await UserRepo.getActiveHome(userId);
    const k = home.komunallar[state.komunalId];
    if (!k) return ctx.reply('Kommunal topilmadi.');
    const oldBal = k.balance;
    k.balance = newBal;
    if (!k.payments) k.payments = [];
    k.payments.push({ amount: Math.abs(newBal - oldBal), balance: newBal, date: new Date().toISOString(), type: newBal > oldBal ? 'topup' : 'charge', description: 'Bot orqali' });
    await UserRepo.save(userId, user);
    await add({ userId, homeId: home.id, komunalId: k.id, komunalName: k.name, komunalEmoji: k.emoji, amount: Math.abs(newBal - oldBal), balanceBefore: oldBal, balanceAfter: newBal, type: newBal > oldBal ? 'topup' : 'charge', source: 'bot' });
    clearState(userId);
    const isLow = newBal <= k.minAlert;
    await ctx.reply(
      `✅ <b>${k.emoji} ${k.name}</b> yangilandi!\n\nYangi balans: <code>${fmt(newBal)}</code>` +
      (isLow ? '\n\n⚠️ Balans minimal chegaradan past!' : ''),
      { parse_mode: 'HTML', ...(await mainMenu(userId)) }
    );
  }

  // ── Reminder due date update ──────────────────────────────────────────────
  if (state.step === 'set_due_date') {
    const m = text.match(/(\d{2})[./](\d{2})[./](\d{4})/);
    if (!m) return ctx.reply('❌ Format: DD.MM.YYYY — masalan: 25.01.2026');
    const date = new Date(`${m[3]}-${m[2]}-${m[1]}`).toISOString();
    const home = await UserRepo.getActiveHome(userId);
    const k = home.komunallar[state.komunalId];
    if (k) { k.nextPaymentDate = date; await UserRepo.save(userId, user); }
    clearState(userId);
    return ctx.reply(`✅ To\'lov muddati: <code>${fmtDate(date)}</code>`, { parse_mode: 'HTML', ...(await mainMenu(userId)) });
  }

  // ── AI question ───────────────────────────────────────────────────────────
  if (state.step === 'ai_awaiting_question') {
    clearState(userId);
    const thinking = await ctx.reply('🤖 <i>Tahlil qilinmoqda...</i>', { parse_mode: 'HTML' });
    const answer = await AiSvc.ask(userId, text);
    await ctx.telegram.deleteMessage(ctx.chat.id, thinking.message_id).catch(() => { });
    return ctx.reply(`🤖 <b>AI Yordamchi:</b>\n\n${answer}`, { parse_mode: 'HTML' });
  }

  // ── Screenshot manual amount ──────────────────────────────────────────────
  if (state.step === 'screenshot_manual') {
    const amount = parseAmount(text);
    if (isNaN(amount)) return ctx.reply('❌ Faqat raqam kiriting (so\'mda):');
    setState(userId, { ...state, step: 'screenshot_select_komunal', parsed: { ...state.parsed, amount } });
    const buttons = Object.entries(KOMUNAL_TYPES).map(([id, t]) => [Markup.button.callback(`${t.emoji} ${t.name}`, `screenshot_komunal_${id}`)]);
    return ctx.reply('Kommunal turini tanlang:', Markup.inlineKeyboard(buttons));
  }

  // ── Admin broadcast text ──────────────────────────────────────────────────
  if (state.step === 'admin_awaiting_broadcast') {
    const count = await UserRepo.count();
    setState(userId, { step: 'admin_confirm_broadcast', text, fileId: null, fileType: null, caption: null });
    return ctx.reply(
      `📢 <b>Xabar mazmuni:</b>\n\n${text}\n\n👥 ${count} ta foydalanuvchiga yuboriladi. Tasdiqlaysizmi?`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Yuborish', 'broadcast_send'), Markup.button.callback('❌ Bekor', 'cancel')]]) }
    );
  }

  // ── Premium receipt manual (if any) ───────────────────────────────────────
  if (state.step === 'sub_awaiting_receipt') {
    return ctx.reply('⚠️ Iltimos, to\'lov chekini (rasm ko\'rinishida) yuboring.\nBekor qilish: /cancel');
  }
}

// ── Callback queries ──────────────────────────────────────────────────────────
bot.on('callback_query', async ctx => {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;
  await ctx.answerCbQuery().catch(() => { });

  if (data === 'cancel') { clearState(userId); return ctx.editMessageText('❌ Bekor qilindi.').catch(e => e.description?.includes('message is not modified') ? null : console.error(e)); }

  // Add komunal
  if (data.startsWith('add_k_')) {
    const type = data.slice(6);
    setState(userId, { step: 'add_account', komunalType: type });
    const kt = KOMUNAL_TYPES[type];
    return ctx.editMessageText(`${kt.emoji} <b>${kt.name}</b>\n\nHisob raqamini kiriting:`, { parse_mode: 'HTML' }).catch(e => e.description?.includes('message is not modified') ? null : console.error(e));
  }

  // Balance update
  if (data.startsWith('bal_update_')) {
    const id = data.slice(11);
    setState(userId, { step: 'update_balance', komunalId: id });
    const home = await UserRepo.getActiveHome(userId);
    const k = home?.komunallar[id];
    return ctx.editMessageText(`${k?.emoji} <b>${k?.name}</b>\nHozirgi: <code>${fmt(k?.balance)}</code>\n\nYangi balansni kiriting:`, { parse_mode: 'HTML' }).catch(e => e.description?.includes('message is not modified') ? null : console.error(e));
  }

  // History
  if (data.startsWith('bal_history_')) {
    const id = data.slice(12);
    const home = await UserRepo.getActiveHome(userId);
    const k = home?.komunallar[id];
    const pays = [...(k?.payments || [])].reverse().slice(0, 10);
    let msg = `${k?.emoji} <b>${k?.name} — Tarix</b>\n\n`;
    if (!pays.length) msg += 'Hali to\'lovlar yo\'q.';
    else pays.forEach(p => { msg += `${p.type === 'topup' ? '🟢' : '🔴'} ${fmt(p.amount)} — ${fmtDate(p.date)}\n`; });
    return ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Ortga', 'cancel')]]) }).catch(e => e.description?.includes('message is not modified') ? null : console.error(e));
  }

  // Delete komunal
  if (data.startsWith('bal_delete_')) {
    const id = data.slice(11);
    const home = await UserRepo.getActiveHome(userId);
    const k = home?.komunallar[id];
    setState(userId, { step: 'confirm_delete', komunalId: id });
    return ctx.editMessageText(`${k?.emoji} <b>${k?.name}</b>ni o'chirishni tasdiqlaysizmi?`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Ha', 'confirm_delete'), Markup.button.callback('❌ Yo\'q', 'cancel')]]) }).catch(e => e.description?.includes('message is not modified') ? null : console.error(e));
  }
  if (data === 'confirm_delete') {
    const st = getState(userId);
    if (st?.step !== 'confirm_delete') return;
    const user = await UserRepo.findById(userId);
    const home = await UserRepo.getActiveHome(userId);
    const name = home?.komunallar[st.komunalId]?.name;
    delete user.homes[user.activeHomeId].komunallar[st.komunalId];
    await UserRepo.save(userId, user);
    clearState(userId);
    return ctx.editMessageText(`✅ <b>${name}</b> o'chirildi.`, { parse_mode: 'HTML' }).catch(e => e.description?.includes('message is not modified') ? null : console.error(e));
  }

  // Payment provider selection
  if (data.startsWith('pay_k_')) {
    const id = data.slice(6);
    const home = await UserRepo.getActiveHome(userId);
    const k = home?.komunallar[id];
    const providers = PaymentSvc.getProviders();
    const buttons = providers.map(p => [Markup.button.callback(`${p.emoji} ${p.name}`, `pay_prov_${p.id}_${id}`)]);
    buttons.push([Markup.button.callback('❌ Bekor', 'cancel')]);
    return ctx.editMessageText(`${k?.emoji} <b>${k?.name}</b> uchun to'lov tizimini tanlang:`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(e => e.description?.includes('message is not modified') ? null : console.error(e));
  }
  if (data.startsWith('pay_prov_')) {
    const [, , provider, komunalId] = data.split('_');
    const home = await UserRepo.getActiveHome(userId);
    const k = home?.komunallar[komunalId];
    setState(userId, { step: 'payment_amount', provider, komunalId });
    return ctx.editMessageText(`💳 ${k?.name}\n\nTo'lov summasi (so'mda):`, { parse_mode: 'HTML' }).catch(e => e.description?.includes('message is not modified') ? null : console.error(e));
  }

  // Premium plan selection
  if (data.startsWith('sub_plan_')) {
    const planId = data.slice(9);
    const plan = PREMIUM_PLANS.find(p => p.id === planId);
    setState(userId, { step: 'sub_awaiting_receipt', planId });
    return ctx.editMessageText(
      `⭐ <b>Premium: ${plan.name}</b>\n\n` +
      `Summa: <b>${fmt(plan.price)}</b>\n\n` +
      `To'lov uchun karta:\n` +
      `💳 <code>${CARD_DETAILS.number}</code>\n` +
      `👤 ${CARD_DETAILS.owner}\n` +
      `🏦 ${CARD_DETAILS.bank}\n\n` +
      `To'lovdan so'ng, chekni (screenshot) rasm ko'rinishida yuboring.`,
      { parse_mode: 'HTML' }
    ).catch(e => e.description?.includes('message is not modified') ? null : console.error(e));
  }

  // Admin approval
  if (data.startsWith('sub_approve_') || data.startsWith('sub_reject_')) {
    if (!(await UserRepo.isAdmin(userId))) return ctx.answerCbQuery('Ruxsat yo\'q');
    const parts = data.split('_');
    const action = parts[1]; // approve / reject
    const targetUserId = parts[2];
    const planId = parts[3];

    if (action === 'approve') {
      const plan = PREMIUM_PLANS.find(p => p.id === planId);
      const expiry = new Date(Date.now() + (plan.duration || 30) * 86400000).toISOString();

      try {
        await UserRepo.update(targetUserId, { subscription: 'premium', subscriptionExpiry: expiry });
        await ctx.editMessageCaption(`✅ Premium berildi (ID: ${targetUserId})`, { parse_mode: 'HTML' }).catch(() => { });
        await bot.telegram.sendMessage(targetUserId, `⭐ <b>Tabriklaymiz!</b>\n\nTo'lovingiz tasdiqlandi. Premium tarif yoqildi!`, { parse_mode: 'HTML' });
      } catch (err) {
        console.error('Error approving premium:', err);
        await ctx.editMessageCaption(`❌ <b>Xatolik!</b>\n\nBazaga ulanishda muammo bo'ldi. Iltimos yana bir bor urinib ko'ring.\n\nFoydalanuvchi: ${targetUserId}`, { parse_mode: 'HTML' }).catch(() => { });
      }
    } else {
      await ctx.editMessageCaption(`❌ To'lov rad etildi.`, { parse_mode: 'HTML' }).catch(() => { });
      await bot.telegram.sendMessage(targetUserId, `❌ <b>Kechirasiz!</b>\n\nTo'lov tasdiqlanmadi. Agar xatolik bo'lsa, adminga murojaat qiling.`, { parse_mode: 'HTML' });
    }
    return;
  }

  // Screenshot komunal selection
  if (data.startsWith('screenshot_komunal_')) {
    const id = data.slice(19);
    const state = getState(userId);
    await saveScreenshotPayment(ctx, id, state?.parsed || {});
    clearState(userId);
    return;
  }
  if (data === 'screenshot_confirm_save') {
    const state = getState(userId);
    if (state?.parsed?.komunalId) {
      await saveScreenshotPayment(ctx, state.parsed.komunalId, state.parsed);
      clearState(userId);
    }
    return;
  }

  // Reminder toggles
  if (data === 'toggle_notif' || data === 'toggle_low' || data === 'toggle_due' || data.startsWith('days_')) {
    const user = await UserRepo.findById(userId);
    if (!user) return ctx.answerCbQuery('User not found');

    if (data === 'toggle_notif') {
      user.notifications = !user.notifications;
      await UserRepo.save(userId, user);
      return ctx.answerCbQuery(user.notifications ? '🔔 Yoqildi' : '🔕 O\'chirildi');
    }
    if (data === 'toggle_low') {
      user.reminderSettings.lowBalanceAlert = !user.reminderSettings.lowBalanceAlert;
      await UserRepo.save(userId, user);
      return ctx.answerCbQuery('Yangilandi');
    }
    if (data === 'toggle_due') {
      user.reminderSettings.paymentDueAlert = !user.reminderSettings.paymentDueAlert;
      await UserRepo.save(userId, user);
      return ctx.answerCbQuery('Yangilandi');
    }
    if (data.startsWith('days_')) {
      const days = parseInt(data.split('_')[1]);
      user.reminderSettings.daysBeforeDue = days;
      await UserRepo.save(userId, user);
      return ctx.answerCbQuery(`${days} kun oldin`);
    }
  }

  // Broadcast send
  if (data === 'broadcast_send' && (await UserRepo.isAdmin(userId))) {
    const st = getState(userId);
    if (!st) return;
    await ctx.editMessageText('📤 Yuborilmoqda...').catch(e => e.description?.includes('message is not modified') ? null : console.error(e));
    const { sent, failed } = await NotifSvc.broadcast(bot, {
      text: st.text, fileId: st.fileId, fileType: st.fileType, caption: st.caption,
    });
    clearState(userId);
    return ctx.reply(`✅ Yuborildi! ✅ ${sent} | ❌ ${failed}`);
  }
});

// ── Admin media handler ───────────────────────────────────────────────────────
async function handleAdminMedia(ctx, fileType) {
  const userId = ctx.from.id;
  let fileId;
  if (fileType === 'photo') fileId = ctx.message.photo.at(-1).file_id;
  else if (fileType === 'video') fileId = ctx.message.video.file_id;
  else if (fileType === 'animation') fileId = ctx.message.animation.file_id;
  else if (fileType === 'document') fileId = ctx.message.document.file_id;
  const caption = ctx.message.caption || '';
  const count = await UserRepo.count();
  setState(userId, { step: 'admin_confirm_broadcast', fileId, fileType, caption, text: null });
  await ctx.reply(
    `📢 <b>Media xabar</b>\n\nTur: ${fileType}\n${caption ? `Izoh: ${caption}\n` : ''}👥 ${count} ta foydalanuvchiga yuboriladi.`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Yuborish', 'broadcast_send'), Markup.button.callback('❌ Bekor', 'cancel')]]) }
  );
}

async function handlePremiumReceipt(ctx, state) {
  const userId = ctx.from.id;
  if (!ctx.message.photo) return ctx.reply('⚠️ Iltimos, to\'lov chekini (rasm ko\'rinishida) yuboring.');

  const photo = ctx.message.photo.at(-1).file_id;
  const planId = state.planId;
  const plan = PREMIUM_PLANS.find(p => p.id === planId);

  await ctx.reply('✅ Chek adminga yuborildi. Tasdiqlanishini kuting.');
  clearState(userId);

  const adminMsg = `💎 <b>Yangi Premium so'rovi!</b>\n\n` +
    `Foydalanuvchi: @${ctx.from.username || ctx.from.first_name}\n` +
    `ID: <code>${userId}</code>\n` +
    `Tarif: <b>${plan?.name || planId}</b>\n` +
    `Summa: <b>${fmt(plan?.price || 0)}</b>\n\n` +
    `Tasdiqlaysizmi?`;

  await NotifSvc.sendToAdmins(bot, adminMsg, {
    photo,
    markup: Markup.inlineKeyboard([
      [Markup.button.callback('✅ Tasdiqlash', `sub_approve_${userId}_${planId}`)],
      [Markup.button.callback('❌ Rad etish', `sub_reject_${userId}_${planId}`)]
    ])
  });
}

function parseAmount(s) { return parseFloat(String(s).replace(/\s/g, '').replace(/,/g, '.')); }


// ── Launch ────────────────────────────────────────────────────────────────────
// ── Export for Serverless / Webhook ──────────────────────────────────────────
export { bot };
export default { bot };
