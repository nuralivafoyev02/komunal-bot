'use strict';
import { add } from '../db/repositories/NotificationRepository.js';
import { findById, findAll } from '../db/repositories/UserRepository.js';
import { NOTIFICATION_TYPES } from '../config/constants.js';

let _bot = null;
function init(bot) { _bot = bot; }

async function send(userId, type, title, body, komunalId = null) {
  await add({ userId, type, title, body, komunalId });

  const user = await findById(userId);
  if (!user || !_bot) return;
  if (!user.notifications) return;

  try {
    await _bot.telegram.sendMessage(user.chatId, `${body}`, { parse_mode: 'HTML' });
  } catch (e) {
    console.error(`[Notif] sendMessage failed for ${userId}:`, e.message);
  }
}

async function broadcast(bot, { text, fileId, fileType, caption }) {
  const users = await findAll();
  let sent = 0, failed = 0;

  for (const user of users) {
    try {
      const opts = { parse_mode: 'HTML' };
      if (!fileId) await bot.telegram.sendMessage(user.chatId, text, opts);
      else if (fileType === 'photo') await bot.telegram.sendPhoto(user.chatId, fileId, { ...opts, caption });
      else if (fileType === 'video') await bot.telegram.sendVideo(user.chatId, fileId, { ...opts, caption });
      else if (fileType === 'animation') await bot.telegram.sendAnimation(user.chatId, fileId, { ...opts, caption });
      else if (fileType === 'document') await bot.telegram.sendDocument(user.chatId, fileId, { ...opts, caption });

      await add({ userId: user.id || user.userId, type: NOTIFICATION_TYPES.BROADCAST, title: 'Xabar', body: caption || text || '' });
      sent++;
      await delay(55);
    } catch { failed++; }
  }
  return { sent, failed };
}

async function sendToAdmins(bot, content, extra = {}) {
  const users = await findAll();
  // Check both role and env list
  const envList = (process.env.ADMIN_IDS || '').split(',').map(x => x.trim());
  const admins = users.filter(u => u.role === 'admin' || envList.includes(String(u.id)));
  
  for (const admin of admins) {
    try {
      const chat = admin.chatId || admin.id;
      if (extra.photo) {
        await bot.telegram.sendPhoto(chat, extra.photo, { caption: content, parse_mode: 'HTML', ...extra.markup });
      } else {
        await bot.telegram.sendMessage(chat, content, { parse_mode: 'HTML', ...extra.markup });
      }
    } catch (e) {
      console.error(`[Notif] sendToAdmins failed for ${admin.id}:`, e.message);
    }
  }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

export { init, send, broadcast, sendToAdmins, NOTIFICATION_TYPES };
export default { init, send, broadcast, sendToAdmins, NOTIFICATION_TYPES };
