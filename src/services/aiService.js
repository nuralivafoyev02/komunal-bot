'use strict';
import Anthropic from '@anthropic-ai/sdk';
import { compareMonths, generateInsight } from './analyticsService.js';
import { findById, getActiveHome } from '../db/repositories/UserRepository.js';
import { findByUser } from '../db/repositories/PaymentRepository.js';
import { KOMUNAL_TYPES } from '../config/constants.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const fmt = n => Number(n || 0).toLocaleString('uz-UZ') + ' so\'m';
const fmtDate = d => new Date(d).toLocaleDateString('uz-UZ');

/**
 * Build a rich context string from user's komunal data to feed the AI.
 */
function buildContext(userId) {
  const user = findById(userId);
  if (!user) return 'Foydalanuvchi ma\'lumotlari topilmadi.';

  const home = getActiveHome(userId);
  const payments = findByUser(userId).slice(0, 30);
  const compare = compareMonths(userId);
  const insight = generateInsight(userId);
  const komunallar = Object.values(home?.komunallar || {});

  const lines = [
    `Foydalanuvchi: ${user.firstName}`,
    `Tarif: ${user.subscription}`,
    `\nKommunal holati:`,
  ];

  for (const k of komunallar) {
    lines.push(`- ${k.name} (${k.emoji}): balans ${fmt(k.balance)}, hisob: ${k.accountId || '—'}`);
    if (k.minAlert) lines.push(`  Minimal chegara: ${fmt(k.minAlert)}`);
    if (k.nextPaymentDate) lines.push(`  Keyingi to'lov: ${fmtDate(k.nextPaymentDate)}`);
  }

  if (compare.length) {
    lines.push(`\nOylik tahlil:`);
    for (const c of compare) {
      lines.push(`- ${c.name}: bu oy ${fmt(c.thisMonth)}, o'tgan oy ${fmt(c.lastMonth)} (${c.pct > 0 ? '+' : ''}${c.pct}%)`);
    }
  }

  if (payments.length) {
    lines.push(`\nSo'nggi to'lovlar:`);
    payments.slice(0, 10).forEach(p => {
      lines.push(`- ${p.komunalName}: ${fmt(p.amount)} (${fmtDate(p.date)})`);
    });
  }

  lines.push(`\nTahlil xulosa:\n${insight}`);
  return lines.join('\n');
}

/**
 * Send a question to Claude with the user's komunal context.
 * Returns a string response.
 */
async function ask(userId, userQuestion) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
    return aiMockResponse(userQuestion, userId);
  }

  const context = buildContext(userId);

  const systemPrompt = `Sen kommunal to'lovlar bo'yicha aqlli yordamchisan.
Foydalanuvchi Telegram bot orqali kommunal xarajatlarini kuzatmoqda.
Quyida uning kommunal ma'lumotlari berilgan.

${context}

Qoidalar:
- O'zbek tilida javob ber
- Qisqa, aniq va foydali bo'l
- Mavjud ma'lumotlarga asoslan
- Telegram HTML formatlashdan foydalanish mumkin (<b>, <i>, <code>)
- Agar savol kommunal bilan bog'liq bo'lmasa, shunga mos javob ber`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: userQuestion }],
      system: systemPrompt,
    });
    return response.content[0]?.text || 'Javob olishda xatolik yuz berdi.';
  } catch (e) {
    console.error('[AI] Error:', e.message);
    return aiMockResponse(userQuestion, userId);
  }
}

/** Fallback when API key not configured */
function aiMockResponse(question, userId) {
  const context = buildContext(userId);
  const lq = question.toLowerCase();

  if (lq.includes('gaz') && (lq.includes('tez') || lq.includes('ko\'p'))) {
    return '🔥 <b>Gaz sarfi haqida:</b>\n\nGaz tez tugashining asosiy sabablari:\n\n' +
      '• Qish oylarida isitish tizimi ko\'proq gaz ishlatadi\n' +
      '• Qozonxona yoki pechning samaradorligi past bo\'lishi\n' +
      '• Gaz plitada uzoq vaqt pishirish\n\n' +
      'Tavsiya: har oygi sarfingizni kuzatib boring, o\'tgan oy bilan solishtiring.';
  }
  if (lq.includes('elektr') && (lq.includes('tez') || lq.includes('ko\'p'))) {
    return '⚡ <b>Elektr sarfi haqida:</b>\n\nKo\'p elektr sarflanadigan qurilmalar:\n\n' +
      '• Konditsioner / isitgich\n• Suv qizdirgich\n• Kir yuvish mashinasi\n\n' +
      'Tavsiya: kechasi arzon tarifda qurilmalarni ishlatish tejamkor.';
  }

  return `🤖 <b>AI Yordamchi</b>\n\nSavolingizga javob berish uchun ANTHROPIC_API_KEY sozlanishi kerak.\n\n` +
    `Hozircha mavjud ma'lumotlar asosida aytishim mumkinki, sizning kommunallaringiz holatini kuzatib borish yaxshi natija beradi.`;
}

export { ask, buildContext };
export default { ask, buildContext };
