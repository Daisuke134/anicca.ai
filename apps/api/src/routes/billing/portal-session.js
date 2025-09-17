import express from 'express';
import requireAuth from '../../middleware/requireAuth.js';
import portalHandler from '../../api/billing/portalSession.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  req.auth = auth;
  return portalHandler(req, res);
});

export default router;
