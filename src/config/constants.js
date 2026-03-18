'use strict';

export const KOMUNAL_TYPES = {
  elektr:   { name: 'Elektr energiya', emoji: '⚡', unit: 'kWt',  color: '#7B61FF' },
  gaz:      { name: 'Gaz',             emoji: '🔥', unit: "m³",   color: '#FF7A38' },
  suv:      { name: 'Suv',             emoji: '💧', unit: 'm³',   color: '#2DD4BF' },
  chiqindi: { name: 'Chiqindi',        emoji: '♻️', unit: 'oy',   color: '#A3E635' },
};

export const SUBSCRIPTION_PLANS = {
  free: {
    name:          'Bepul',
    emoji:         '🆓',
    maxHomes:      1,
    maxKomunallar: 4,
    analytics:     false,
    advancedReminder: false,
    price:         0,
  },
  premium: {
    name:          'Premium',
    emoji:         '⭐',
    maxHomes:      10,
    maxKomunallar: 20,
    analytics:     true,
    advancedReminder: true,
    price:         15000,
  },
};

export const NOTIFICATION_TYPES = {
  LOW_BALANCE:     'low_balance',
  PAYMENT_DUE:     'payment_due',
  PAYMENT_OVERDUE: 'payment_overdue',
  PAYMENT_ADDED:   'payment_added',
  BROADCAST:       'broadcast',
  SYSTEM:          'system',
};

export const PAYMENT_PROVIDERS = {
  click:   { name: 'Click',   emoji: '💳', color: '#0ABDE3' },
  payme:   { name: 'Payme',   emoji: '💳', color: '#3DC9C4' },
  apelsin: { name: 'Apelsin', emoji: '🍊', color: '#FF8C00' },
};

// Regex patterns for screenshot parsing
export const SCREENSHOT_PATTERNS = {
  amount: [
    /(\d[\d\s,.]*)\s*(so['']?m|UZS|uzs|сум)/i,
    /summa[:\s]+(\d[\d\s,.]*)/i,
    /to['']lov[:\s]+(\d[\d\s,.]*)/i,
    /(\d{4,})\s*so/i,
  ],
  date: [
    /(\d{2}[./]\d{2}[./]\d{2,4})/,
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{2}\s+\w+\s+\d{4})/i,
  ],
  service: {
    elektr:   /elektr|quvvat|energy|UE|ME|EE/i,
    gaz:      /gaz|gas|UG|MG/i,
    suv:      /suv|water|vodokanal|UV|MV/i,
    chiqindi: /chiqindi|axlat|mast|TKO/i,
  },
};

export default { KOMUNAL_TYPES, SUBSCRIPTION_PLANS, NOTIFICATION_TYPES, PAYMENT_PROVIDERS, SCREENSHOT_PATTERNS };
