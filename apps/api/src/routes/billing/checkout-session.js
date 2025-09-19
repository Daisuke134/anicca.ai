import express from 'express';
import requireAuth from '../../middleware/requireAuth.js';
import checkoutHandler from '../../api/billing/checkoutSession.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  req.auth = auth;
  return checkoutHandler(req, res);
});

export default router;
