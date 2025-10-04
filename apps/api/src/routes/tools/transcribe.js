import express from 'express';
import transcribeHandler from '../../api/tools/transcribe.js';
import requireAuth from '../../middleware/requireAuth.js';

const router = express.Router();

// POST /api/tools/transcribe
router.post('/', async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  req.auth = auth;
  return transcribeHandler(req, res);
});

export default router;

