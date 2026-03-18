'use strict';
/**
 * Payment Provider Integration
 * ─────────────────────────────────────────────────────────────────────────────
 * Hozircha MOCK implementation.
 * Kelajakda haqiqiy Click/Payme/Apelsin API bilan almashtirish uchun
 * faqat shu faylni o'zgartirish kifoya. Interface o'zgarmaydi.
 *
 * Real integratsiya uchun:
 *   Click:   https://docs.click.uz
 *   Payme:   https://developer.paycom.uz
 *   Apelsin: https://apelsin.uz/developers
 */

const MOCK_DELAY = 800; // ms — real API latency simulation

// ── Provider Adapters ─────────────────────────────────────────────────────────

const Click = {
  name: 'Click',
  emoji: '💳',

  /**
   * Generate payment URL for user to open.
   * Real: use Click Merchant API to create invoice.
   */
  async createInvoice({ amount, komunalId, accountId, userId }) {
    await delay(MOCK_DELAY);
    return {
      success: true,
      provider: 'click',
      invoiceId: `CLK-${Date.now()}`,
      paymentUrl: `https://my.click.uz/services/pay?service_id=XXXX&merchant_id=YYYY&amount=${amount}&transaction_param=${accountId}`,
      amount,
      expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
    };
  },

  async checkStatus(invoiceId) {
    await delay(MOCK_DELAY);
    // Mock: always return pending in demo
    return { invoiceId, status: 'pending', paidAt: null };
  },
};

const Payme = {
  name: 'Payme',
  emoji: '💳',

  async createInvoice({ amount, komunalId, accountId, userId }) {
    await delay(MOCK_DELAY);
    // Payme uses base64 encoded params
    const params = Buffer.from(JSON.stringify({ m: 'MERCHANT_ID', ac: { account: accountId }, a: amount * 100 })).toString('base64');
    return {
      success: true,
      provider: 'payme',
      invoiceId: `PYM-${Date.now()}`,
      paymentUrl: `https://checkout.paycom.uz/${params}`,
      amount,
      expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
    };
  },

  async checkStatus(invoiceId) {
    await delay(MOCK_DELAY);
    return { invoiceId, status: 'pending', paidAt: null };
  },
};

const Apelsin = {
  name: 'Apelsin',
  emoji: '🍊',

  async createInvoice({ amount, komunalId, accountId, userId }) {
    await delay(MOCK_DELAY);
    return {
      success: true,
      provider: 'apelsin',
      invoiceId: `APS-${Date.now()}`,
      paymentUrl: `https://apelsin.uz/pay?account=${accountId}&amount=${amount}`,
      amount,
      expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
    };
  },

  async checkStatus(invoiceId) {
    await delay(MOCK_DELAY);
    return { invoiceId, status: 'pending', paidAt: null };
  },
};

// ── Unified API ───────────────────────────────────────────────────────────────

const providers = { click: Click, payme: Payme, apelsin: Apelsin };

async function createPaymentLink(provider, params) {
  const p = providers[provider];
  if (!p) throw new Error(`Unknown provider: ${provider}`);
  return p.createInvoice(params);
}

async function checkPaymentStatus(provider, invoiceId) {
  const p = providers[provider];
  if (!p) throw new Error(`Unknown provider: ${provider}`);
  return p.checkStatus(invoiceId);
}

function getProviders() {
  return Object.entries(providers).map(([id, p]) => ({ id, name: p.name, emoji: p.emoji }));
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

export default { createPaymentLink, checkPaymentStatus, getProviders };
