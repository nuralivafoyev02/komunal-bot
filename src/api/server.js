import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import usersRoutes from './routes/users.js';
import analyticsRoutes from './routes/analytics.js';
import paymentsRoutes from './routes/payments.js';
import * as reminderSvc from '../services/reminderService.js';
import botIndex from '../bot/index.js';
const { bot } = botIndex;

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} | ${req.method} ${req.url}`);
  next();
});

// ── Webhook Handler ─────────────────────────────────────────────────────────
app.post('/api/webhook', (req, res) => {
  bot.handleUpdate(req.body, res);
});

// ── Static: Mini App ──────────────────────────────────────────────────────────
// Serve from /miniapp or root, as requested by index.html (location.origin)
app.use('/miniapp', express.static(path.join(__dirname, '../../miniapp')));
app.use(express.static(path.join(__dirname, '../../miniapp')));
app.use('/api/users', usersRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/payments', paymentsRoutes);

// Vercel Cron endpoint
app.get('/api/cron', async (req, res) => {
  // Basic security: check for Vercel Cron header or a secret key
  const authHeader = req.headers['x-vercel-cron'] || req.headers['authorization'];
  if (!authHeader && process.env.NODE_ENV === 'production') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[Cron] Manual trigger via API');
    await reminderSvc.runChecks();
    res.json({ success: true, message: 'Checks completed' });
  } catch (e) {
    console.error('[Cron] Error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Backward compatibility or typo fix (index.html uses /api/users, server.js root used /api/user)
app.use('/api/user', usersRoutes);

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── Default ──────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../miniapp/index.html'));
});

// ── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({ error: 'Ichki server xatosi' });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Modular API Server ishga tushdi!`);
  console.log(`   URL:      http://localhost:${PORT}`);
  console.log(`   Mini App: http://localhost:${PORT}/miniapp\n`);
});
