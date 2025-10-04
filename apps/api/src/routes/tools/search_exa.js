import express from 'express';
import exaSearchHandler from '../../api/tools/web/search.js';
import requireAuth from '../../middleware/requireAuth.js';

const router = express.Router();

// POST /api/tools/search/exa
router.post('/', async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  req.auth = auth;
  return exaSearchHandler(req, res);
});

export default router;

