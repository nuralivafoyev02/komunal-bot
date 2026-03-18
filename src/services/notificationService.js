'use strict';
import { add } from '../db/repositories/NotificationRepository.js';
import { findById, findAll } from '../db/repositories/UserRepository.js';
import { NOTIFICATION_TYPES } from '../config/constants.js';

let _bot = null;
function init(bot) { _bot = bot; }

async function send(userId, type, title, body, komunalId = null) {
  add({ userId, type, title, body, komunalId });

  const user = findById(userId);
  if (!user || !_bot) return;
  if (!user.notifications) return;

  try {
    await _bot.telegram.sendMessage(user.chatId, `${body}`, { parse_mode: 'HTML' });
  } catch (e) {
    console.error(`[Notif] sendMessage failed for ${userId}:`, e.message);
  }
}

async function broadcast(bot, { text, fileId, fileType, caption }) {
  const users = findAll();
  let sent = 0, failed = 0;

  for (const user of users) {
    try {
      const opts = { parse_mode: 'HTML' };
      if (!fileId) await bot.telegram.sendMessage(user.chatId, text, opts);
      else if (fileType === 'photo') await bot.telegram.sendPhoto(user.chatId, fileId, { ...opts, caption });
      else if (fileType === 'video') await bot.telegram.sendVideo(user.chatId, fileId, { ...opts, caption });
      else if (fileType === 'animation') await bot.telegram.sendAnimation(user.chatId, fileId, { ...opts, caption });
      else if (fileType === 'document') await bot.telegram.sendDocument(user.chatId, fileId, { ...opts, caption });

      add({ userId: user.userId, type: NOTIFICATION_TYPES.BROADCAST, title: 'Xabar', body: caption || text || '' });
      sent++;
      await delay(55);
    } catch { failed++; }
  }
  return { sent, failed };
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

export { init, send, broadcast, NOTIFICATION_TYPES };
export default { init, send, broadcast, NOTIFICATION_TYPES };
