import express from 'express';
import { revoke } from '../../services/auth/refreshService.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { refresh_token, all } = req.body || {};
    if (!refresh_token && !all) {
      return res.status(400).json({ error: 'refresh_token_or_all_required' });
    }
    const result = await revoke(refresh_token, { all: all === true, userFromToken: true });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;





