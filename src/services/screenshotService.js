'use strict';
import { SCREENSHOT_PATTERNS } from '../config/constants.js';

/**
 * Parse a text string (extracted from receipt/screenshot caption or forwarded message)
 * and try to extract: amount, date, service type.
 *
 * In a real system you'd integrate an OCR API (e.g. Google Vision) to get text from image.
 * Here we:
 *   1. Try to get text from the Telegram message caption.
 *   2. If no caption, we do basic OCR emulation using regex on whatever text we have.
 *   3. Return structured result.
 */

function parseReceiptText(text = '') {
  const result = { amount: null, date: null, komunalId: null, confidence: 0 };

  // ── Amount ────────────────────────────────────────────────────────────────
  for (const pattern of SCREENSHOT_PATTERNS.amount) {
    const match = text.match(pattern);
    if (match) {
      const raw = match[1].replace(/[\s,]/g, '').replace(/\./g, '');
      const amount = parseInt(raw, 10);
      if (!isNaN(amount) && amount > 0) {
        result.amount = amount;
        result.confidence += 40;
        break;
      }
    }
  }

  // ── Date ──────────────────────────────────────────────────────────────────
  for (const pattern of SCREENSHOT_PATTERNS.date) {
    const match = text.match(pattern);
    if (match) {
      const parsed = tryParseDate(match[1]);
      if (parsed) {
        result.date = parsed;
        result.confidence += 30;
        break;
      }
    }
  }
  if (!result.date) result.date = new Date().toISOString();

  // ── Service type ─────────────────────────────────────────────────────────
  for (const [id, pattern] of Object.entries(SCREENSHOT_PATTERNS.service)) {
    if (pattern.test(text)) {
      result.komunalId = id;
      result.confidence += 30;
      break;
    }
  }

  return result;
}

function tryParseDate(str) {
  // dd.mm.yyyy or dd/mm/yyyy
  const m1 = str.match(/(\d{2})[./](\d{2})[./](\d{2,4})/);
  if (m1) {
    const y = m1[3].length === 2 ? '20' + m1[3] : m1[3];
    const d = new Date(`${y}-${m1[2]}-${m1[1]}`);
    if (!isNaN(d)) return d.toISOString();
  }
  // yyyy-mm-dd
  const m2 = str.match(/(\d{4}-\d{2}-\d{2})/);
  if (m2) {
    const d = new Date(m2[1]);
    if (!isNaN(d)) return d.toISOString();
  }
  return null;
}

/**
 * Format parse result as a confirmation message for the user.
 */
function formatParseResult(result, komunalTypes) {
  const lines = ['📄 <b>Chekdan topilgan ma\'lumotlar:</b>\n'];

  if (result.amount) lines.push(`💰 Summa: <code>${result.amount.toLocaleString('uz-UZ')} so'm</code>`);
  else lines.push('💰 Summa: <i>aniqlanmadi</i>');

  if (result.date) lines.push(`📅 Sana: <code>${new Date(result.date).toLocaleDateString('uz-UZ')}</code>`);
  if (result.komunalId) {
    const t = komunalTypes[result.komunalId];
    lines.push(`${t?.emoji || '⚡'} Tur: <b>${t?.name || result.komunalId}</b>`);
  } else {
    lines.push('⚡ Tur: <i>aniqlanmadi — tanlang</i>');
  }

  lines.push(`\n📊 Ishonchlilik: <b>${result.confidence}%</b>`);
  return lines.join('\n');
}

export default { parseReceiptText, formatParseResult };
