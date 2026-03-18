'use strict';
const { Markup }    = require('telegraf');
const ScreenshotSvc = require('../../services/screenshotService');
const PaymentRepo   = require('../../db/repositories/PaymentRepository');
const UserRepo      = require('../../db/repositories/UserRepository');
const NotifSvc      = require('../../services/notificationService');
const { KOMUNAL_TYPES, NOTIFICATION_TYPES } = require('../../config/constants');
const { setState }  = require('./menu');

const fmt = n => Number(n || 0).toLocaleString('uz-UZ') + ' so\'m';

/**
 * Handles incoming photo (receipt screenshot).
 * 1. Try to extract text from caption or forwarded text.
 * 2. Parse amount / date / service type.
 * 3. Show confirmation to user with inline buttons.
 */
async function handleScreenshot(ctx) {
  const caption = ctx.message.caption || ctx.message.forward_from?.text || '';
  const userId  = ctx.from.id;

  // In production: send photo to OCR service (Google Vision, Tesseract, etc.)
  // For now: parse whatever text we have (caption or forwarded message text)
  const result  = ScreenshotSvc.parseReceiptText(caption);
  const summary = ScreenshotSvc.formatParseResult(result, KOMUNAL_TYPES);

  if (result.confidence < 40) {
    // Could not parse enough — ask user to confirm manually
    setState(userId, {
      step:    'screenshot_manual',
      parsed:  result,
      caption,
    });
    return ctx.reply(
      `📄 <b>Chek qabul qilindi</b>\n\n` +
      summary + '\n\n' +
      `⚠️ Ma\'lumotlarni aniqlab bo\'lmadi. Iltimos, qo\'lda kiriting.\n\n` +
      `Summani kiriting (so\'mda):`,
      { parse_mode: 'HTML' }
    );
  }

  // Good parse — show confirmation
  setState(userId, {
    step:    'screenshot_confirm',
    parsed:  result,
    caption,
  });

  const home = UserRepo.getActiveHome(userId);
  const komunalButtons = Object.entries(KOMUNAL_TYPES).map(([id, t]) => [
    Markup.button.callback(`${t.emoji} ${t.name}`, `screenshot_komunal_${id}`)
  ]);

  const confirmButtons = [];
  if (result.komunalId) {
    confirmButtons.push([Markup.button.callback('✅ Tasdiqlash', 'screenshot_confirm_save')]);
  } else {
    confirmButtons.push(...komunalButtons);
  }
  confirmButtons.push([Markup.button.callback('❌ Bekor', 'cancel')]);

  await ctx.reply(
    summary + '\n\n' +
    (result.komunalId ? 'To\'g\'rimi? Tasdiqlang:' : 'Kommunal turini tanlang:'),
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(confirmButtons) }
  );
}

/**
 * Save parsed payment from screenshot.
 */
async function saveScreenshotPayment(ctx, komunalId, parsed) {
  const userId = ctx.from.id;
  const user   = UserRepo.findById(userId);
  const home   = UserRepo.getActiveHome(userId);
  if (!home) return ctx.reply('Uy topilmadi.');

  const komunal = home.komunallar[komunalId];
  if (!komunal) {
    return ctx.reply(
      `⚠️ ${KOMUNAL_TYPES[komunalId]?.name || komunalId} komunali qo\'shilmagan.\nAvval ➕ Komunal qo\'shish orqali qo\'shing.`
    );
  }

  const amount   = parsed.amount || 0;
  const oldBal   = Number(komunal.balance);
  const newBal   = oldBal + amount;
  komunal.balance = newBal;
  if (!komunal.payments) komunal.payments = [];
  komunal.payments.push({
    amount, balance: newBal, date: parsed.date || new Date().toISOString(),
    type: 'topup', description: 'Chek/screenshot orqali'
  });
  UserRepo.save(userId, user);

  PaymentRepo.add({
    userId, homeId: home.id, komunalId,
    komunalName: komunal.name, komunalEmoji: komunal.emoji,
    amount, balanceBefore: oldBal, balanceAfter: newBal,
    date: parsed.date, type: 'topup', source: 'screenshot',
    notes: 'Screenshot orqali avtomatik topildi'
  });

  await NotifSvc.send(userId, NOTIFICATION_TYPES.PAYMENT_ADDED, `To'lov qo'shildi — ${komunal.name}`,
    `✅ <b>${komunal.emoji} ${komunal.name}</b>\n\nSumma: <code>${fmt(amount)}</code>\nYangi balans: <code>${fmt(newBal)}</code>\nManba: chek/screenshot`);

  await ctx.editMessageText(`✅ <b>Saqlandi!</b>\n\n${komunal.emoji} ${komunal.name}: +${fmt(amount)}\nBalans: <code>${fmt(newBal)}</code>`, { parse_mode: 'HTML' });
}

module.exports = { handleScreenshot, saveScreenshotPayment };
