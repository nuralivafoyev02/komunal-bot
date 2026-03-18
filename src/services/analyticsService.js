'use strict';
import { findByUser } from '../db/repositories/PaymentRepository.js';
import { KOMUNAL_TYPES } from '../config/constants.js';

/**
 * Returns monthly totals grouped by komunalId for a user.
 * { '2025-01': { elektr: 45000, gaz: 12000 }, ... }
 */
function getMonthlyTotals(userId, months = 6) {
  const payments = findByUser(userId).filter(p => p.type === 'topup');
  const result = {};

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    result[key] = {};
    for (const id of Object.keys(KOMUNAL_TYPES)) result[key][id] = 0;
  }

  for (const p of payments) {
    const key = p.date.slice(0, 7);
    if (result[key]) result[key][p.komunalId] = (result[key][p.komunalId] || 0) + p.amount;
  }
  return result;
}

/**
 * Compare current month vs previous month.
 * Returns array of { komunalId, name, emoji, thisMonth, lastMonth, diff, pct, trend }
 */
function compareMonths(userId) {
  const now = new Date();
  const thisKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prev = new Date(now); prev.setMonth(prev.getMonth() - 1);
  const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;

  const monthly = getMonthlyTotals(userId, 2);
  const thisMonth = monthly[thisKey] || {};
  const lastMonth = monthly[prevKey] || {};

  return Object.entries(KOMUNAL_TYPES).map(([id, t]) => {
    const cur = thisMonth[id] || 0;
    const prev2 = lastMonth[id] || 0;
    const diff = cur - prev2;
    const pct = prev2 === 0 ? (cur > 0 ? 100 : 0) : Math.round((diff / prev2) * 100);
    return { komunalId: id, name: t.name, emoji: t.emoji, thisMonth: cur, lastMonth: prev2, diff, pct, trend: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same' };
  }).filter(r => r.thisMonth > 0 || r.lastMonth > 0);
}

/**
 * Top komunal by spending this month.
 */
function topKomunal(userId) {
  const cmp = compareMonths(userId);
  return [...cmp].sort((a, b) => b.thisMonth - a.thisMonth)[0] || null;
}

/**
 * Total spending per komunal (all time).
 */
function allTimeTotals(userId) {
  const payments = findByUser(userId).filter(p => p.type === 'topup');
  const totals = {};
  for (const p of payments) totals[p.komunalId] = (totals[p.komunalId] || 0) + p.amount;
  return totals;
}

/**
 * Average monthly spending per komunal.
 */
function averageMonthly(userId) {
  const totals = getMonthlyTotals(userId, 6);
  const months = Object.values(totals);
  const avg = {};
  for (const id of Object.keys(KOMUNAL_TYPES)) {
    const sum = months.reduce((s, m) => s + (m[id] || 0), 0);
    avg[id] = Math.round(sum / months.length);
  }
  return avg;
}

/**
 * Generate human-readable insight string for AI / bot messages.
 */
function generateInsight(userId) {
  const cmp = compareMonths(userId);
  const top = topKomunal(userId);
  const lines = [];

  for (const r of cmp) {
    if (r.pct === 0) continue;
    const dir = r.trend === 'up' ? 'ko\'proq' : 'kamroq';
    const emoji = r.trend === 'up' ? '📈' : '📉';
    lines.push(`${emoji} ${r.name}: o'tgan oyga nisbatan ${Math.abs(r.pct)}% ${dir} sarfladingiz`);
  }

  if (top) lines.unshift(`🏆 Eng ko'p sarflangan: ${top.emoji} ${top.name} — ${fmt(top.thisMonth)}`);
  return lines.join('\n') || 'Hali yetarli ma\'lumot yo\'q.';
}

function fmt(n) { return Number(n || 0).toLocaleString('uz-UZ') + ' so\'m'; }

export default { getMonthlyTotals, compareMonths, topKomunal, allTimeTotals, averageMonthly, generateInsight };
