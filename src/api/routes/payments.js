import express from 'express';
const router = express.Router();
import { createPaymentLink, checkPaymentStatus, getProviders } from '../../services/paymentService.js';

// Create payment link (mock)
router.post('/create-link', async (req, res) => {
  try {
    const { provider, amount, komunalId, accountId, userId } = req.body;
    if (!provider || !amount) return res.status(400).json({ error: 'provider and amount required' });
    const result = await createPaymentLink(provider, { amount, komunalId, accountId, userId });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Check payment status (mock)
router.get('/status/:provider/:invoiceId', async (req, res) => {
  try {
    const { provider, invoiceId } = req.params;
    const result = await checkPaymentStatus(provider, invoiceId);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// List providers
router.get('/providers', (req, res) => {
  res.json(getProviders());
});

export default router;
