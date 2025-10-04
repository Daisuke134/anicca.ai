import express from 'express';
import playwrightHandler from '../../api/tools/web/browser.js';
import requireAuth from '../../middleware/requireAuth.js';

const router = express.Router();

// Keep compatibility within the new routing layer for now
// POST /api/tools/playwright
router.post('/', async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  req.auth = auth;
  return playwrightHandler(req, res);
});

export default router;
