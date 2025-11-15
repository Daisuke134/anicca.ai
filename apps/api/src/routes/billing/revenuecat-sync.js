import express from 'express';
import requireAuth from '../../middleware/requireAuth.js';
import handler from '../../api/billing/revenuecatSync.js';

const router = express.Router();
router.post('/', async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  req.auth = auth;
  return handler(req, res);
});
export default router;


