import express from 'express';
import desktopSessionHandler from '../../api/proxy/realtime/desktopSession.js';

const router = express.Router();

// GET /api/realtime/desktop
router.get('/', (req, res) => desktopSessionHandler(req, res));

export default router;

